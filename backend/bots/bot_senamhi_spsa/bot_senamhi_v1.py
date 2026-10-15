"""
Bot SENAMHI SPSA v1.0
Extrae datos hidrometeorológicos del SENAMHI Perú usando la librería Garúa.
Busca automáticamente las estaciones más cercanas a cada sede SPSA (radio configurable).
Guarda en Supabase tabla energia."DATA SENAMHI PERU", Google Drive y cache local.
"""

import sys
import os
import json
import time
import math
import requests
import subprocess
import threading
from datetime import datetime, timedelta, date

# ─────────────────────────────────────────────
# CONFIG LOAD
# ─────────────────────────────────────────────
CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'config_senamhi.json')
HISTORY_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'senamhi_history.json')
ESTACIONES_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'estaciones_senamhi.json')

# Núcleo (siempre se sube, no seleccionable): precipitacion_mm, temp_max,
# temp_min, humedad_pct — junto con la metadata de identificación
# (codigo_senamhi, ceco, fecha, etc.), que tampoco es seleccionable.
# Opcionales: controladas por config['parametros_activos'] (default: todas
# activas, para no cambiar el comportamiento de instalaciones existentes).
PARAMETROS_OPCIONALES_SENAMHI = {
    'viento_kmh': 'Viento (km/h)',
    'nivel_rio_m': 'Nivel de río (m)',
    'caudal_m3s': 'Caudal (m³/s)',
}

def _filtrar_parametros_opcionales(registros, parametros_activos):
    """Quita de cada registro las claves opcionales que el usuario desactivó
    en Configuración, antes de exportar a Excel o subir a Supabase."""
    desactivados = [k for k in PARAMETROS_OPCIONALES_SENAMHI if k not in parametros_activos]
    if not desactivados:
        return registros
    for r in registros:
        for k in desactivados:
            r.pop(k, None)
    return registros

_stop_event = threading.Event()

# ── Alertas de fallo / seguimiento (reutiliza pme_common de PME) ──
try:
    sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    import pme_common
except Exception:
    pme_common = None

# Estado de la corrida actual (leido por wrapper.py si una excepcion escapa de ejecutar())
_activacion_id_actual = None
_ultimo_error_actual = None

def log(msg, tipo='log'):
    print(json.dumps({'type': tipo, 'message': msg}), flush=True)

def fase(key, estado):
    print(json.dumps({'type': 'fase', 'fase': key, 'estado': estado}), flush=True)

def progress(pct):
    print(json.dumps({'type': 'status_val', 'key': 'progress', 'value': int(pct)}), flush=True)

def status(txt):
    print(json.dumps({'type': 'status_val', 'key': 'status_txt', 'value': txt}), flush=True)

def sep():
    log('━' * 62)

def cfg_cargar():
    try:
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        log(f'Error leyendo config: {e}', 'error')
    return {
        'f_ini': '2024-01-01',
        'f_fin': datetime.now().strftime('%Y-%m-%d'),
        'ventana_movil_dias': 3,
        'radio_km': 10,
        'tipos_estacion': ['meteorologica', 'hidrologica'],
        'exportar_excel': True,
        'carpeta_drive': '',
        'delay_seg': 1.5,
        'reintentos': 3,
        'url_supabase': '',
        'key_supabase': '',
        'parametros_activos': list(PARAMETROS_OPCIONALES_SENAMHI.keys()),
    }

# ─────────────────────────────────────────────
# HAVERSINE DISTANCE
# ─────────────────────────────────────────────
def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def safe_supabase_upsert(client, table_name, data, on_conflict=None):
    try:
        query = client.schema('energia').table(table_name)
        if on_conflict:
            return query.upsert(data, on_conflict=on_conflict).execute()
        return query.upsert(data).execute()
    except Exception as e:
        err_str = str(e)
        if '42P10' in err_str or 'no unique' in err_str:
            try:
                # Fallback: intentar insert directo sin on_conflict si no existe la restricción UNIQUE
                return client.schema('energia').table(table_name).insert(data).execute()
            except Exception:
                pass
        if 'row-level security' in err_str:
            raise Exception(f"Desactiva el RLS en Supabase: ALTER TABLE energia.\"{table_name}\" DISABLE ROW LEVEL SECURITY;")
        if any(token in err_str for token in ['PGRST106', 'Invalid schema', '42501', 'permission denied']):
            try:
                query = client.table(table_name)
                if on_conflict:
                    return query.upsert(data, on_conflict=on_conflict).execute()
                return query.upsert(data).execute()
            except Exception as e_pub:
                raise Exception(f"Permiso RLS o esquema faltante. Ejecuta en Supabase SQL Editor: ALTER TABLE energia.\"{table_name}\" DISABLE ROW LEVEL SECURITY;") from e_pub
        raise e

def safe_supabase_delete_all(client, table_name):
    try:
        client.schema('energia').table(table_name).delete().neq('id', 0).execute()
    except Exception as e:
        err_str = str(e)
        if 'row-level security' in err_str:
            raise Exception(f"Desactiva el RLS en Supabase: ALTER TABLE energia.\"{table_name}\" DISABLE ROW LEVEL SECURITY;")
        if any(token in err_str for token in ['PGRST106', 'Invalid schema', '42501', 'permission denied']):
            try:
                client.table(table_name).delete().neq('id', 0).execute()
            except Exception as e_pub:
                raise Exception(f"Permiso RLS o esquema faltante. Ejecuta en Supabase SQL Editor: ALTER TABLE energia.\"{table_name}\" DISABLE ROW LEVEL SECURITY;") from e_pub
        else:
            raise e

# ─────────────────────────────────────────────
# FASE 1: OBTENER SEDES SPSA DESDE SUPABASE
# ─────────────────────────────────────────────
def obtener_sedes(cfg):
    url = cfg.get('url_supabase', '')
    key = cfg.get('key_supabase', '')
    sedes_cache_path = os.path.join(os.path.dirname(__file__), 'sedes_cache.json')

    # 1. Intentar desde proyecto configurado
    if url and key:
        try:
            headers = {
                'apikey': key,
                'Authorization': f'Bearer {key}',
                'Accept-Profile': 'infraestructura'
            }
            resp = requests.get(
                f'{url}/rest/v1/vw_sedes_clima?select=sede,ceco,latitud,longitud,departamento&limit=500',
                headers={'apikey': key, 'Authorization': f'Bearer {key}', 'Accept-Profile': 'public'}, timeout=10
            )
            if resp.status_code == 200:
                sedes = [s for s in resp.json() if s.get('latitud') and s.get('longitud')]
                if sedes:
                    log(f'✅ Sedes obtenidas: {len(sedes)}')
                    try:
                        with open(sedes_cache_path, 'w', encoding='utf-8') as f:
                            json.dump(sedes, f, ensure_ascii=False)
                    except Exception:
                        pass
                    return sedes
            
            resp2 = requests.get(
                f'{url}/rest/v1/Tabla-Maestra-Infraestructura?select=*&limit=500',
                headers=headers,
                timeout=10
            )
            if resp2.status_code == 200:
                raw = resp2.json()
                sedes = []
                for r in raw:
                    lat = r.get('LATITUD') or r.get('latitud') or r.get('Latitud')
                    lon = r.get('LONGITUD') or r.get('longitud') or r.get('Longitud')
                    sede = r.get('SEDE') or r.get('sede') or r.get('Sede') or ''
                    ceco = r.get('CECO') or r.get('ceco') or r.get('Ceco') or ''
                    dep = r.get('DEPARTAMENTO') or r.get('departamento') or ''
                    if lat and lon:
                        try:
                            sedes.append({
                                'sede': str(sede),
                                'ceco': str(ceco),
                                'latitud': float(lat),
                                'longitud': float(lon),
                                'departamento': str(dep)
                            })
                        except Exception:
                            pass
                if sedes:
                    log(f'✅ Sedes (fallback infra): {len(sedes)}')
                    try:
                        with open(sedes_cache_path, 'w', encoding='utf-8') as f:
                            json.dump(sedes, f, ensure_ascii=False)
                    except Exception:
                        pass
                    return sedes
        except Exception as e:
            log(f'⚠️ Error consultando sedes en URL principal: {e}')

    # 2. Fallback: Proyecto de lectura maestro de infraestructura
    try:
        url_infra = "https://wovedghvlvaocebendxe.supabase.co"
        key_infra = "sb_publishable_x9_zpCpXRHp_RLzieO_Wqg_0qIfhd_U"
        headers_infra = {
            'apikey': key_infra,
            'Authorization': f'Bearer {key_infra}',
            'Accept-Profile': 'infraestructura'
        }
        resp_infra = requests.get(
            f'{url_infra}/rest/v1/Tabla-Maestra-Infraestructura?select=*&limit=500',
            headers=headers_infra, timeout=10
        )
        if resp_infra.status_code == 200:
            raw = resp_infra.json()
            sedes = []
            for r in raw:
                lat = r.get('LATITUD') or r.get('latitud') or r.get('Latitud')
                lon = r.get('LONGITUD') or r.get('longitud') or r.get('Longitud')
                sede = r.get('SEDE') or r.get('sede') or r.get('Sede') or ''
                ceco = r.get('CECO') or r.get('ceco') or r.get('Ceco') or ''
                dep = r.get('DEPARTAMENTO') or r.get('departamento') or ''
                if lat and lon:
                    try:
                        sedes.append({
                            'sede': str(sede),
                            'ceco': str(ceco),
                            'latitud': float(lat),
                            'longitud': float(lon),
                            'departamento': str(dep)
                        })
                    except Exception:
                        pass
            if sedes:
                log(f'✅ Sedes desde catálogo maestro infra: {len(sedes)}')
                try:
                    with open(sedes_cache_path, 'w', encoding='utf-8') as f:
                        json.dump(sedes, f, ensure_ascii=False)
                except Exception:
                    pass
                return sedes
    except Exception as ex_inf:
        log(f'⚠️ No se pudo leer sedes de catálogo maestro: {ex_inf}')

    # 3. Fallback: Archivo local cache
    try:
        if os.path.exists(sedes_cache_path):
            with open(sedes_cache_path, 'r', encoding='utf-8') as f:
                sedes = json.load(f)
                if sedes:
                    log(f'💾 Sedes cargadas desde caché local: {len(sedes)}')
                    return sedes
    except Exception as ex_c:
        log(f'⚠️ Error cargando caché de sedes: {ex_c}')

    return []

# ─────────────────────────────────────────────
# FASE 2: CATÁLOGO DE ESTACIONES SENAMHI
# ─────────────────────────────────────────────
SENAMHI_API_BASE = 'https://senamhi.gob.pe/api'

def obtener_catalogo_estaciones(cfg, reintentos=3, delay=1.5):
    """
    Descarga el catálogo de estaciones del SENAMHI.
    Prioriza el catálogo local guardado para evitar esperas y bloqueos por timeout en APIs obsoletas.
    """
    # 1. Intentar cargar desde el archivo local estaciones_senamhi.json (mucha más rapidez)
    try:
        if os.path.exists(ESTACIONES_PATH):
            with open(ESTACIONES_PATH, 'r', encoding='utf-8') as f:
                local_data = json.load(f)
                estaciones = local_data.get('estaciones', [])
                if estaciones:
                    log(f'💾 Catálogo cargado desde archivo local (optimizado): {len(estaciones)} estaciones')
                    return estaciones, True
    except Exception as ex_local:
        log(f'⚠️ No se pudo cargar catálogo local: {ex_local}')

    # 2. Fallback: intentar endpoints web SENAMHI si el archivo local no existe
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://senamhi.gob.pe/'
    }
    endpoints = [
        'https://senamhi.gob.pe/api/v1/senamhi-ws-1.1.8/estacion?limit=5000',
        'https://senamhi.gob.pe/api/v1/ws-meteoro/estacion?limit=5000',
    ]

    for attempt in range(reintentos):
        for endpoint in endpoints:
            try:
                if _stop_event.is_set():
                    return [], False
                resp = requests.get(endpoint, headers=headers, timeout=5)
                if resp.status_code == 200:
                    data = resp.json()
                    estaciones = []
                    items = data if isinstance(data, list) else data.get('data', data.get('estaciones', data.get('result', [])))
                    for e in items:
                        lat = e.get('latitud') or e.get('lat') or e.get('LATITUD')
                        lon = e.get('longitud') or e.get('lon') or e.get('LONGITUD')
                        if lat and lon:
                            try:
                                estaciones.append({
                                    'codigo': str(e.get('codigo_estacion') or e.get('codigo') or e.get('cod_estacion') or e.get('id', '')),
                                    'nombre': str(e.get('nombre_estacion') or e.get('nombre') or e.get('NOMBRE', '')),
                                    'tipo': str(e.get('tipo_estacion') or e.get('tipo') or 'Convencional').lower(),
                                    'categoria': str(e.get('categoria') or e.get('tipo_categoria') or ''),
                                    'departamento': str(e.get('departamento') or e.get('dep') or ''),
                                    'provincia': str(e.get('provincia') or ''),
                                    'distrito': str(e.get('distrito') or ''),
                                    'altitud': float(e.get('altitud') or e.get('alt') or 0),
                                    'latitud': float(lat),
                                    'longitud': float(lon),
                                })
                            except Exception:
                                pass
                    if estaciones:
                        log(f'✅ Catálogo SENAMHI (API Web): {len(estaciones)} estaciones')
                        return estaciones, True
            except Exception:
                pass

    return [], False

# ─────────────────────────────────────────────
# FASE 3: EMPAREJAR SEDES ↔ ESTACIONES POR RADIO
# ─────────────────────────────────────────────
def emparejar_por_radio(sedes, estaciones, radio_km, tipos):
    """
    Por cada sede, encuentra todas las estaciones dentro del radio.
    Retorna: lista de pares (sede, estacion, distancia_km) + cobertura_info
    """
    pares = []
    sedes_con_cobertura = set()
    sedes_sin_cobertura = []

    tipos_lower = [t.lower() for t in tipos]

    for sede in sedes:
        if _stop_event.is_set():
            break
        s_lat = float(sede['latitud'])
        s_lon = float(sede['longitud'])
        sedes_estaciones = []

        for est in estaciones:
            tipo_est = est.get('tipo', '').lower()
            # Filter by type
            es_meteo = 'meteor' in tipo_est or 'conv' in tipo_est or tipo_est == ''
            es_hidro = 'hidro' in tipo_est or 'rio' in tipo_est or 'fluviometrica' in tipo_est or 'aforo' in tipo_est

            incluir = False
            for t in tipos_lower:
                if t == 'meteorologica' and (es_meteo or not es_hidro):
                    incluir = True
                if t == 'hidrologica' and es_hidro:
                    incluir = True

            if not incluir and tipos_lower:
                continue

            try:
                dist = haversine_km(s_lat, s_lon, float(est['latitud']), float(est['longitud']))
                if dist <= radio_km:
                    sedes_estaciones.append({
                        'distancia_km': round(dist, 3),
                        'estacion': est
                    })
            except Exception:
                pass

        sedes_estaciones.sort(key=lambda x: x['distancia_km'])

        if sedes_estaciones:
            sedes_con_cobertura.add(sede.get('ceco') or sede.get('sede'))
            for item in sedes_estaciones:
                pares.append({
                    'sede': sede,
                    'estacion': item['estacion'],
                    'distancia_km': item['distancia_km']
                })
        else:
            sedes_sin_cobertura.append(sede)

    log(f'📊 Sedes con cobertura: {len(sedes_con_cobertura)} | Sin cobertura: {len(sedes_sin_cobertura)}')
    return pares, sedes_sin_cobertura

# ─────────────────────────────────────────────
# FASE 4: DESCARGA DE DATOS POR ESTACIÓN
# ─────────────────────────────────────────────
def descargar_datos_estacion(codigo_estacion, tipo, f_ini, f_fin, delay=1.5, reintentos=3):
    """
    Descarga datos climatológicos del gráfico de la estación SENAMHI de manera directa y rápida (bypass Captcha).
    Retorna lista de registros horarios filtrados por el rango de fechas.
    """
    import re
    if _stop_event.is_set():
        return []

    # 1. Obtener estado, tipo y categoría de la estación desde el catálogo local
    estado = 'AUTOMATICA'
    tipo_esta = 'M'
    cate = 'EMA'
    try:
        if os.path.exists(ESTACIONES_PATH):
            with open(ESTACIONES_PATH, 'r', encoding='utf-8') as f:
                catalog = json.load(f)
                for e in catalog.get('estaciones', []):
                    if str(e.get('codigo')) == str(codigo_estacion):
                        cate = e.get('categoria', 'EMA')
                        tipo_lower = e.get('tipo', '').lower()
                        tipo_esta = 'H' if ('hidro' in tipo_lower or 'eha' in cate.lower() or 'ehma' in cate.lower()) else 'M'
                        estado = 'AUTOMATICA' if ('auto' in tipo_lower or cate.lower() in ('ema', 'eaa', 'eha', 'ehma')) else 'CONVENCIONAL'
                        break
    except Exception as e_cat:
        log(f"⚠️ Error cargando info de catálogo para estación {codigo_estacion}: {e_cat}")

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.senamhi.gob.pe/mapas/mapa-estaciones-2/'
    }
    url = f"https://www.senamhi.gob.pe/mapas/mapa-estaciones-2/map_red_graf.php?cod={codigo_estacion}&estado={estado}&tipo_esta={tipo_esta}&cate={cate}"

    for attempt in range(reintentos):
        if _stop_event.is_set():
            return []
        try:
            time.sleep(delay * 0.2)
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                cats_match = re.search(r"categories:\s*\[([^\]]*)\]", resp.text)
                if not cats_match:
                    continue
                
                raw_cats = [c.strip().strip("'").strip('"') for c in cats_match.group(1).split(',') if c.strip()]
                series_matches = re.findall(r"\{\s*name:\s*'([^']*)',.*?data:\s*\[([^\]]*)\]", resp.text, re.DOTALL)
                
                parsed_series = []
                for name, data_str in series_matches:
                    try:
                        name_clean = name.encode().decode('unicode-escape')
                    except Exception:
                        name_clean = name
                    vals = [float(v.strip()) if (v.strip() and v.strip().lower() != 'null') else None 
                            for v in data_str.split(',') if v.strip()]
                    parsed_series.append((name_clean, vals))
                
                records = []
                for i in range(len(raw_cats)):
                    cat = raw_cats[i]
                    parts = cat.split(' - ')
                    if len(parts) == 2:
                        date_part = parts[0].replace('/', '-')
                        hour_part = parts[1].strip() + ":00"
                        if len(hour_part) == 4:
                            hour_part = "0" + hour_part
                    else:
                        date_part = parts[0].replace('/', '-')
                        hour_part = "00:00"
                        
                    rec = {
                        'fecha': date_part,
                        'hora': hour_part,
                        'precipitacion_mm': None,
                        'temp_max': None,
                        'temp_min': None,
                        'humedad_pct': None,
                        'viento_kmh': None,
                        'nivel_rio_m': None,
                        'caudal_m3s': None,
                        'calidad_dato': 'OK'
                    }
                    
                    for name, vals in parsed_series:
                        if i < len(vals):
                            val = vals[i]
                            name_l = name.lower()
                            if 'temperatura' in name_l or 'temp' in name_l:
                                rec['temp_max'] = val
                                rec['temp_min'] = val
                            elif 'precipitaci' in name_l or 'pp' in name_l or 'lluvia' in name_l:
                                rec['precipitacion_mm'] = val
                            elif 'humedad' in name_l or 'hr' in name_l:
                                rec['humedad_pct'] = val
                            elif 'viento' in name_l or 'vel' in name_l:
                                rec['viento_kmh'] = val
                            elif 'nivel' in name_l:
                                rec['nivel_rio_m'] = val
                            elif 'caudal' in name_l:
                                rec['caudal_m3s'] = val
                    
                    if f_ini <= date_part <= f_fin:
                        records.append(rec)
                
                if records:
                    return records
        except Exception:
            pass

    return []

def _parse_num(val):
    """Parse numeric values, return None for S/D or empty."""
    if val is None:
        return None
    s = str(val).strip().upper()
    if s in ('', 'S/D', 'SD', 'T', 'TRAZA', '-', 'N/A', 'NULL', 'NONE'):
        return None
    try:
        return float(s.replace(',', '.'))
    except Exception:
        return None

def descargar_datos_open_meteo(lat, lon, f_ini, f_fin):
    """Descarga datos meteorológicos históricos diarios desde Open-Meteo para una coordenada GPS (Fallback individual)."""
    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={lon}&past_days=92"
            f"&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean,wind_speed_10m_max"
            f"&timezone=America/Lima"
        )
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            daily = data.get('daily', {})
            times = daily.get('time', [])
            tmax = daily.get('temperature_2m_max', [])
            tmin = daily.get('temperature_2m_min', [])
            prec = daily.get('precipitation_sum', [])
            hum = daily.get('relative_humidity_2m_mean', [])
            wind = daily.get('wind_speed_10m_max', [])

            parsed = []
            for i, t in enumerate(times):
                if f_ini <= t <= f_fin:
                    parsed.append({
                        'fecha': t,
                        'precipitacion_mm': prec[i] if i < len(prec) else None,
                        'temp_max': tmax[i] if i < len(tmax) else None,
                        'temp_min': tmin[i] if i < len(tmin) else None,
                        'humedad_pct': hum[i] if i < len(hum) else None,
                        'viento_kmh': wind[i] if i < len(wind) else None,
                        'nivel_rio_m': None,
                        'caudal_m3s': None,
                        'calidad_dato': 'OK'
                    })
            return parsed
    except Exception as e:
        log(f"    ⚠️ Error consultando Open-Meteo individual: {e}")
    return []

def descargar_datos_open_meteo_batch(sedes_list, f_ini, f_fin):
    """
    Descarga datos meteorológicos en lotes (batch) desde Open-Meteo para reducir
    peticiones y evitar límites de tasa o timeouts.
    Soporta fallback automático entre API rápida de pronóstico y API de archivo.
    """
    if not sedes_list:
        return []

    # Determinar si podemos usar la API de pronóstico rápido (dentro de los últimos 90 días)
    try:
        f_ini_dt = datetime.strptime(f_ini, '%Y-%m-%d')
        dias_antiguedad = (datetime.now() - f_ini_dt).days
        usar_fast_api = dias_antiguedad <= 90
    except Exception:
        usar_fast_api = False

    todos_resultados = []
    
    # Procesar en lotes de 50 sedes
    BATCH_SIZE = 50
    for idx in range(0, len(sedes_list), BATCH_SIZE):
        if _stop_event.is_set():
            break
        batch = sedes_list[idx : idx + BATCH_SIZE]
        
        lats = ",".join(str(s['latitud']) for s in batch)
        lons = ",".join(str(s['longitud']) for s in batch)
        
        if usar_fast_api:
            # Calcular past_days dinámicamente
            past_days = max(3, dias_antiguedad + 2)
            if past_days > 92:
                past_days = 92
            url = (
                f"https://api.open-meteo.com/v1/forecast?"
                f"latitude={lats}&longitude={lons}&past_days={past_days}"
                f"&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean,wind_speed_10m_max"
                f"&timezone=America/Lima"
            )
        else:
            url = (
                f"https://archive-api.open-meteo.com/v1/archive?"
                f"latitude={lats}&longitude={lons}&start_date={f_ini}&end_date={f_fin}"
                f"&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean,wind_speed_10m_max"
                f"&timezone=America/Lima"
            )
            
        try:
            log(f"    📡 Consultando lote Open-Meteo {idx // BATCH_SIZE + 1} ({len(batch)} sedes)...")
            resp = requests.get(url, timeout=20)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, dict):
                    data_list = [data]
                else:
                    data_list = data
                    
                for j, s_obj in enumerate(batch):
                    if j >= len(data_list):
                        break
                    res_sede = data_list[j]
                    daily = res_sede.get('daily', {})
                    times = daily.get('time', [])
                    tmax = daily.get('temperature_2m_max', [])
                    tmin = daily.get('temperature_2m_min', [])
                    prec = daily.get('precipitation_sum', [])
                    hum = daily.get('relative_humidity_2m_mean', [])
                    wind = daily.get('wind_speed_10m_max', [])
                    
                    registros_sede = []
                    for i, t in enumerate(times):
                        if f_ini <= t <= f_fin:
                            registros_sede.append({
                                'fecha': t,
                                'precipitacion_mm': prec[i] if i < len(prec) else None,
                                'temp_max': tmax[i] if i < len(tmax) else None,
                                'temp_min': tmin[i] if i < len(tmin) else None,
                                'humedad_pct': hum[i] if i < len(hum) else None,
                                'viento_kmh': wind[i] if i < len(wind) else None,
                                'nivel_rio_m': None,
                                'caudal_m3s': None,
                                'calidad_dato': 'OK'
                            })
                    
                    if registros_sede:
                        todos_resultados.append((s_obj, registros_sede))
            else:
                log(f"    ⚠️ Error en API Open-Meteo (Status {resp.status_code}) para lote.")
        except Exception as e:
            log(f"    ⚠️ Excepción consultando lote Open-Meteo: {e}")
            
    return todos_resultados

# ─────────────────────────────────────────────
# MAIN EXECUTION
# ─────────────────────────────────────────────
def ejecutar(mode='manual', origen='individual', master_run_id=None):
    global _stop_event, _activacion_id_actual, _ultimo_error_actual
    _stop_event = threading.Event()
    _ultimo_error_actual = None

    total_est = 0
    senamhi_offline = False
    t0 = time.time()

    sep()
    log(f'🛰️ Bot SENAMHI SPSA v1.0 — Modo: {mode.upper()}')
    log(f'⏰ Inicio: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    sep()

    cfg = cfg_cargar()
    # La fecha guardada solo se respeta en una corrida MANUAL individual (útil
    # para un backfill histórico puntual). Cualquier corrida automática
    # -autopiloto propio o disparada por la cascada del Bot Master- siempre
    # usa el momento exacto, para nunca quedarse pegada en una fecha vieja.
    # Si además hay una "ventana móvil" configurada (últimos N días), f_ini
    # también se recalcula cada vez en vez de usar una fecha fija que crece
    # sin límite -los datos climáticos son estables, no hace falta repedir
    # meses de historia ya cargada en cada corrida automática.
    usar_fecha_dinamica = (mode == 'autopilot') or (origen == 'master')
    ventana_dias = int(cfg.get('ventana_movil_dias', 3) or 0)
    if usar_fecha_dinamica and ventana_dias > 0:
        f_ini = (datetime.now() - timedelta(days=ventana_dias)).strftime('%Y-%m-%d')
    else:
        f_ini = cfg.get('f_ini', '2024-01-01')
    f_fin = datetime.now().strftime('%Y-%m-%d') if usar_fecha_dinamica else (cfg.get('f_fin', '') or datetime.now().strftime('%Y-%m-%d'))
    radio_km = float(cfg.get('radio_km', 10))
    tipos = cfg.get('tipos_estacion', ['meteorologica', 'hidrologica'])
    delay = float(cfg.get('delay_seg', 1.5))
    reintentos = int(cfg.get('reintentos', 3))
    url_sup = cfg.get('url_supabase', '')
    key_sup = cfg.get('key_supabase', '')

    log(f'📅 Periodo: {f_ini} → {f_fin}')
    log(f'📡 Radio: {radio_km} km | Tipos: {", ".join(tipos)}')

    # ── Registro de seguimiento (tabla bot_activaciones) ──
    _activacion_id_actual = None
    if pme_common:
        try:
            _activacion_id_actual = pme_common.registrar_inicio_activacion(
                bot_id="bot_senamhi_spsa", bot_nombre="Bot SENAMHI V1.0", familia="climatico",
                origen=origen, modo_ejecucion="autopilot" if mode == 'autopilot' else "manual",
                master_run_id=master_run_id,
            )
        except Exception:
            pass

    status('Iniciando...')
    progress(0)

    def _cerrar_seguimiento(estado, registros=None, error_msg=None):
        global _ultimo_error_actual
        if error_msg:
            _ultimo_error_actual = error_msg
        if not pme_common:
            return
        if estado == 'fallo' and error_msg:
            try:
                pme_common.enviar_alerta_fallo_bot("Bot SENAMHI", Exception(error_msg))
            except Exception:
                pass
        try:
            pme_common.registrar_fin_activacion(
                _activacion_id_actual, estado=estado,
                codigo_salida=0 if estado == 'exito' else 1,
                duracion_seg=int(time.time() - t0),
                fecha_datos_desde=f_ini, fecha_datos_hasta=f_fin,
                registros_procesados=registros,
                tipo_escritura="incremental", tabla_destino='DATA SENAMHI PERU',
                exc=Exception(error_msg) if error_msg else None,
                ram_mb_pico=pme_common.medir_ram_actual_mb(),
            )
        except Exception:
            pass

    # ── FASE 1: SEDES ──
    fase('sedes', 'activo')
    status('Obteniendo sedes SPSA...')
    log('🏢 Fase 1: Cargando sedes SPSA desde Supabase...')
    sedes = obtener_sedes(cfg)
    if sedes:
        # Ordenar de Norte a Sur (Latitud descendente: 0 a -18)
        sedes.sort(key=lambda s: float(s.get('latitud') or 0), reverse=True)
        
    if not sedes:
        log('❌ No se encontraron sedes con coordenadas. Abortando.', 'error')
        fase('sedes', 'error')
        status('Error: sin sedes')
        _cerrar_seguimiento('fallo', error_msg='No se encontraron sedes SPSA con coordenadas GPS.')
        return
    log(f'✅ Sedes con GPS: {len(sedes)}')
    fase('sedes', 'ok')
    progress(10)

    # ── FASE 2: CATÁLOGO ESTACIONES ──
    fase('estaciones', 'activo')
    status('Descargando catálogo SENAMHI...')
    log('📡 Fase 2: Descargando catálogo de estaciones SENAMHI...')
    estaciones, web_success = obtener_catalogo_estaciones(cfg, reintentos=reintentos, delay=delay)
    if not estaciones:
        log('❌ No se pudo obtener el catálogo de estaciones.', 'error')
        fase('estaciones', 'error')
        status('Error: sin catálogo SENAMHI')
        _cerrar_seguimiento('fallo', error_msg='No se pudo obtener el catálogo de estaciones SENAMHI.')
        return
    total_est = len(estaciones)
    log(f'✅ Estaciones en catálogo: {total_est}')
    
    # El catálogo web del SENAMHI ya no responde (API antigua), pero las páginas de gráficos individuales sí están online.
    # Usamos siempre el catálogo local y marcamos senamhi_offline = False para intentar el raspado de los gráficos en vivo.
    senamhi_offline = False
    log('ℹ️ Usando catálogo de estaciones y habilitando raspado directo de gráficos de SENAMHI en vivo.', 'info')

    # Save catalog locally
    try:
        catalog_data = {
            'estaciones': estaciones,
            'generado': datetime.now().isoformat(),
            'total': len(estaciones)
        }
        hist_path = os.path.abspath(ESTACIONES_PATH)
        with open(hist_path, 'w', encoding='utf-8') as f:
            json.dump(catalog_data, f, indent=2, ensure_ascii=False)
        log(f'💾 Catálogo guardado localmente: {hist_path}')
    except Exception as e:
        log(f'⚠️ No se pudo guardar catálogo: {e}')

    # Sincronizar catálogo maestro con Supabase (energia."CATALOGO ESTACIONES SENAMHI")
    if url_sup and key_sup:
        try:
            from supabase import create_client
            client = create_client(url_sup, key_sup)
            client.postgrest.timeout = 15
            log('☁️ Sincronizando catálogo maestro con Supabase...')
            catalog_inserts = []
            for est in estaciones:
                catalog_inserts.append({
                    'codigo': est['codigo'],
                    'nombre': est['nombre'],
                    'tipo': est['tipo'],
                    'categoria': est.get('categoria', ''),
                    'departamento': est.get('departamento', ''),
                    'provincia': est.get('provincia', ''),
                    'distrito': est.get('distrito', ''),
                    'altitud': est.get('altitud', 0),
                    'latitud': est['latitud'],
                    'longitud': est['longitud']
                })
            
            # Upsert en lotes de 500
            for i in range(0, len(catalog_inserts), 500):
                safe_supabase_upsert(client, 'CATALOGO ESTACIONES SENAMHI', catalog_inserts[i:i+500], on_conflict='codigo')
            log(f'✅ Catálogo maestro guardado en Supabase ({len(catalog_inserts)} registros)')
        except Exception as e_sup:
            log(f'⚠️ No se pudo sincronizar catálogo maestro en Supabase: {e_sup}', 'error')

    fase('estaciones', 'ok')
    progress(20)

    # ── FASE 3: RADIO / EMPAREJAMIENTO ──
    fase('radio', 'activo')
    status(f'Emparejando sedes ↔ estaciones (radio {radio_km} km)...')
    log(f'🔗 Fase 3: Emparejando sedes con estaciones (radio {radio_km} km)...')
    pares, sedes_sin_cobertura = emparejar_por_radio(sedes, estaciones, radio_km, tipos)
    log(f'✅ Pares sede↔estación: {len(pares)}')

    # Sincronizar emparejamiento con Supabase (energia."RELACION SEDES ESTACIONES SENAMHI")
    if url_sup and key_sup and pares:
        try:
            from supabase import create_client
            client = create_client(url_sup, key_sup)
            client.postgrest.timeout = 15
            log('☁️ Sincronizando emparejamiento con Supabase (RELACION SEDES ESTACIONES)...')
            
            # Limpiar tabla relación previa para reescribir con el nuevo radio
            safe_supabase_delete_all(client, 'RELACION SEDES ESTACIONES SENAMHI')
            
            rel_inserts = []
            for p in pares:
                rel_inserts.append({
                    'ceco': p['sede']['ceco'],
                    'sede': p['sede']['sede'],
                    'codigo_senamhi': p['estacion']['codigo'],
                    'distancia_km': p['distancia_km'],
                    'radio_limite_km': radio_km
                })
            
            # Upsert en lotes de 500
            for i in range(0, len(rel_inserts), 500):
                safe_supabase_upsert(client, 'RELACION SEDES ESTACIONES SENAMHI', rel_inserts[i:i+500], on_conflict='ceco,codigo_senamhi')
            log(f'✅ Relación de cobertura guardada en Supabase ({len(rel_inserts)} registros)')
        except Exception as e_rel:
            log(f'⚠️ No se pudo guardar la relación en Supabase: {e_rel}', 'error')
    if sedes_sin_cobertura:
        log(f'⚠️ Sedes sin estaciones SENAMHI en radio: {len(sedes_sin_cobertura)} (se usarán en Open-Meteo al final)')

    if not pares and not sedes_sin_cobertura:
        log('⚠️ Sin sedes para procesar.', 'error')
        fase('radio', 'skip')
        status('Sin sedes')
        _cerrar_seguimiento('fallo', error_msg='Ninguna sede quedó dentro del radio de cobertura configurado.')
        return
    fase('radio', 'ok')
    progress(30)

    # ── FASE 4: DESCARGA SENAMHI (PRIORIZANDO ESTACIÓN MÁS CERCANA VÁLIDA) ──
    fase('descarga', 'activo')
    status('Descargando datos históricos SENAMHI...')
    log('📥 Fase 4: Descargando datos SENAMHI priorizando estación más cercana por sede...')

    # Agrupar pares por Sede SPSA y ordenar por distancia ascendente
    sedes_dict = {}
    for par in pares:
        ceco = par['sede'].get('ceco') or par['sede'].get('sede')
        if ceco not in sedes_dict:
            sedes_dict[ceco] = {
                'sede': par['sede'],
                'estaciones': []
            }
        sedes_dict[ceco]['estaciones'].append({
            'estacion': par['estacion'],
            'distancia_km': par['distancia_km']
        })

    # Asegurar ordenamiento estricto por distancia_km
    for ceco in sedes_dict:
        sedes_dict[ceco]['estaciones'].sort(key=lambda x: x['distancia_km'])

    sedes_pendientes_openmeteo = list(sedes_sin_cobertura)
    total_sedes_cob = len(sedes_dict)
    log(f'🏢 Sedes SPSA a evaluar con SENAMHI: {total_sedes_cob}')

    cache_estaciones = {}  # codigo_estacion -> lista de registros
    todos_registros = []
    sedes_con_senamhi_ok = 0

    for idx, (ceco, info) in enumerate(sedes_dict.items()):
        if _stop_event.is_set():
            log('🛑 Bot detenido por el usuario.', 'info')
            break

        sede_obj = info['sede']
        nombre_sede = sede_obj['sede']
        est_list = info['estaciones']
        
        log(f'  [{idx+1}/{total_sedes_cob}] 🏢 Sede: {nombre_sede} ({ceco}) — {len(est_list)} estación(es) en radio')

        sede_cubierta = False

        if not senamhi_offline:
            for est_item in est_list:
                est = est_item['estacion']
                codigo = est['codigo']
                dist = est_item['distancia_km']
                nombre_est = est.get('nombre', codigo)

                log(f'    📡 Probando estación más cercana: {nombre_est} ({codigo}) [{dist} km]...')

                # Consultar cache o descargar
                if codigo in cache_estaciones:
                    registros = cache_estaciones[codigo]
                else:
                    registros = descargar_datos_estacion(
                        codigo_estacion=codigo,
                        tipo=est.get('tipo', ''),
                        f_ini=f_ini,
                        f_fin=f_fin,
                        delay=delay,
                        reintentos=reintentos
                    )
                    cache_estaciones[codigo] = registros

                if registros:
                    log(f'      ✅ ¡Datos obtenidos de SENAMHI! ({len(registros)} reg) → Sede {nombre_sede} asignada a {nombre_est}')
                    sede_cubierta = True
                    sedes_con_senamhi_ok += 1

                    for reg in registros:
                        todos_registros.append({
                            'codigo_senamhi': codigo,
                            'nombre_estacion': nombre_est,
                            'tipo_estacion': est.get('tipo', 'Meteorologica').capitalize(),
                            'sede_spsa': nombre_sede,
                            'ceco': ceco,
                            'distancia_km': dist,
                            'latitud': est.get('latitud'),
                            'longitud': est.get('longitud'),
                            'altitud': est.get('altitud'),
                            'departamento': est.get('departamento', ''),
                            'provincia': est.get('provincia', ''),
                            'distrito': est.get('distrito', ''),
                            'fecha': reg['fecha'],
                            'precipitacion_mm': reg.get('precipitacion_mm'),
                            'temp_max': reg.get('temp_max'),
                            'temp_min': reg.get('temp_min'),
                            'humedad_pct': reg.get('humedad_pct'),
                            'viento_kmh': reg.get('viento_kmh'),
                            'nivel_rio_m': reg.get('nivel_rio_m'),
                            'caudal_m3s': reg.get('caudal_m3s'),
                            'calidad_dato': reg.get('calidad_dato', 'OK'),
                            'fuente_datos': 'SENAMHI',
                            'fecha_sync': datetime.now().isoformat()
                        })
                    # ¡SE DETIENE LA BÚSQUEDA PARA ESTA SEDE PORQUE YA OBTUVO SU ESTACIÓN SENAMHI MÁS CERCANA VÁLIDA!
                    break
                else:
                    log(f'      ⚠️ Sin datos para {nombre_est} ({codigo}) → probando siguiente estación cercana...')
        else:
            log(f'    ⏭️ Omitiendo consulta SENAMHI para {nombre_sede} (SENAMHI offline)...')

        if not sede_cubierta:
            log(f'    ⚠️ Ninguna estación SENAMHI en radio tuvo datos para {nombre_sede} → se usará Open-Meteo al final')
            sedes_pendientes_openmeteo.append(sede_obj)

        pct = 30 + int((idx + 1) / total_sedes_cob * 25)
        progress(pct)
        time.sleep(delay * 0.2)

    log(f'📊 Sedes cubiertas por SENAMHI: {sedes_con_senamhi_ok} | Sedes pendientes para Open-Meteo: {len(sedes_pendientes_openmeteo)}')

    # ── FASE 4.5: FALLBACK OPEN-METEO PARA SEDES SIN DATOS SENAMHI ──
    if sedes_pendientes_openmeteo:
        log(f'🌐 Fase 4.5: Descargando Open-Meteo en lotes para {len(sedes_pendientes_openmeteo)} sedes...')
        
        resultados_om = descargar_datos_open_meteo_batch(sedes_pendientes_openmeteo, f_ini, f_fin)
        
        for idx, (s_obj, regs_om) in enumerate(resultados_om):
            n_sede = s_obj['sede']
            c_sede = s_obj.get('ceco', '')
            lat = s_obj['latitud']
            lon = s_obj['longitud']
            
            log(f'    ✅ {len(regs_om)} registros obtenidos de Open-Meteo para {n_sede}')
            for reg in regs_om:
                todos_registros.append({
                    'codigo_senamhi': 'OPEN-METEO',
                    'nombre_estacion': 'Open-Meteo Reanalysis',
                    'tipo_estacion': 'Satelital',
                    'sede_spsa': n_sede,
                    'ceco': c_sede,
                    'distancia_km': 0.0,
                    'latitud': lat,
                    'longitud': lon,
                    'altitud': 0.0,
                    'departamento': s_obj.get('departamento', ''),
                    'provincia': '',
                    'distrito': '',
                    'fecha': reg['fecha'],
                    'precipitacion_mm': reg.get('precipitacion_mm'),
                    'temp_max': reg.get('temp_max'),
                    'temp_min': reg.get('temp_min'),
                    'humedad_pct': reg.get('humedad_pct'),
                    'viento_kmh': reg.get('viento_kmh'),
                    'nivel_rio_m': None,
                    'caudal_m3s': None,
                    'calidad_dato': 'OK',
                    'fuente_datos': 'OPEN-METEO',
                    'fecha_sync': datetime.now().isoformat()
                })
            
            pct = 55 + int((idx + 1) / len(resultados_om) * 10)
            progress(pct)

    fase('descarga', 'ok')
    log(f'✅ Total registros obtenidos: {len(todos_registros)}')
    progress(65)

    if not todos_registros:
        log('⚠️ Sin datos para guardar. El bot terminó sin registros.', 'info')
        status('Sin datos obtenidos')
        _cerrar_seguimiento('exito', registros=0)
        return

    # ── FASE 5: LOCAL CACHE ──
    fase('local', 'activo')
    status('Guardando cache local...')
    log('💾 Fase 5: Guardando cache local...')
    try:
        hist_file = os.path.abspath(HISTORY_PATH)
        existing = {}
        if os.path.exists(hist_file):
            with open(hist_file, 'r', encoding='utf-8') as f:
                for r in json.load(f):
                    k = f"{r.get('codigo_senamhi')}_{r.get('ceco')}_{r.get('fecha')}"
                    existing[k] = r
        for r in todos_registros:
            k = f"{r.get('codigo_senamhi')}_{r.get('ceco')}_{r.get('fecha')}"
            existing[k] = r
        with open(hist_file, 'w', encoding='utf-8') as f:
            json.dump(list(existing.values()), f, indent=2, ensure_ascii=False)
        log(f'✅ Cache local: {len(existing)} registros totales')
    except Exception as e:
        log(f'⚠️ Error guardando cache: {e}', 'error')
    fase('local', 'ok')
    progress(75)

    # Filtra los parámetros opcionales que el usuario haya desactivado en
    # Configuración -aplica a lo que se exporta a Excel y se sube a
    # Supabase; el cache local de arriba guarda todo, sin filtrar.
    parametros_activos = cfg.get('parametros_activos', list(PARAMETROS_OPCIONALES_SENAMHI.keys()))
    todos_registros = _filtrar_parametros_opcionales(todos_registros, parametros_activos)

    # ── FASE 6: DRIVE ──
    fase('drive', 'activo')
    carpeta_drive = cfg.get('carpeta_drive', '')
    if carpeta_drive and cfg.get('exportar_excel', True):
        status('Exportando a Google Drive...')
        log(f'📁 Fase 6: Exportando Excel a Drive: {carpeta_drive}')
        try:
            import openpyxl
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = 'SENAMHI PERU'
            if todos_registros:
                headers_xl = list(todos_registros[0].keys())
                ws.append(headers_xl)
                for r in todos_registros:
                    ws.append([r.get(h) for h in headers_xl])
            ts = datetime.now().strftime('%Y%m%d_%H%M')
            fname = f'SENAMHI_SPSA_{ts}.xlsx'
            fpath = os.path.join(carpeta_drive, fname)
            os.makedirs(carpeta_drive, exist_ok=True)
            wb.save(fpath)
            log(f'✅ Excel guardado: {fpath}')
            fase('drive', 'ok')
        except Exception as e:
            log(f'⚠️ Error exportando Excel: {e}', 'error')
            fase('drive', 'skip')
    else:
        log('⏭️ Exportación Drive omitida (sin carpeta configurada)')
        fase('drive', 'skip')
    progress(85)

    # ── FASE 7: SUPABASE ──
    fase('supabase', 'activo')
    status('Sincronizando con Supabase...')
    log('☁️ Fase 7: Upsert a Supabase tablas "DATA SENAMHI PERU" y "DATA CLIMATICA OPENMETEO"...')
    try:
        from supabase import create_client
        client = create_client(url_sup, key_sup)
        client.postgrest.timeout = 15
        BATCH = 500
        subidos = 0
        
        # 1. Separar registros por fuente
        regs_senamhi = [r for r in todos_registros if r.get('fuente_datos') != 'OPEN-METEO']
        regs_openmeteo = [r for r in todos_registros if r.get('fuente_datos') == 'OPEN-METEO']

        # Upsert a DATA SENAMHI PERU (Deduplicado)
        target_senamhi_raw = regs_senamhi if regs_senamhi else todos_registros
        seen_sen = set()
        target_senamhi = []
        for r in target_senamhi_raw:
            k = (r.get('codigo_senamhi'), r.get('fecha'))
            if k not in seen_sen:
                seen_sen.add(k)
                target_senamhi.append(r)

        for i in range(0, len(target_senamhi), BATCH):
            if _stop_event.is_set():
                break
            batch = target_senamhi[i:i+BATCH]
            batch_clean = [{k: v for k, v in r.items() if v is not None} for r in batch]
            safe_supabase_upsert(client, 'DATA SENAMHI PERU', batch_clean, on_conflict='codigo_senamhi,fecha')
            subidos += len(batch)
            log(f'  ✅ Lote SENAMHI {i//BATCH + 1}: {len(batch)} registros subidos')
            progress(85 + int((subidos / len(todos_registros)) * 5))

        # 2. Upsert a DATA CLIMATICA OPENMETEO (Deduplicado)
        if regs_openmeteo:
            subidos_om = 0
            om_inserts_raw = []
            for r in regs_openmeteo:
                om_inserts_raw.append({
                    'ceco': r.get('ceco'),
                    'sede': r.get('sede'),
                    'fecha': r.get('fecha'),
                    'precipitacion_mm': r.get('precipitacion_mm'),
                    'temp_max': r.get('temperatura_c'),
                    'temp_min': r.get('temperatura_c'),
                    'humedad_pct': r.get('humedad_pct'),
                    'viento_kmh': r.get('viento_kmh'),
                    'latitud': r.get('latitud'),
                    'longitud': r.get('longitud')
                })
            seen_om = set()
            om_inserts = []
            for r in om_inserts_raw:
                k = (r.get('ceco'), r.get('fecha'))
                if k not in seen_om:
                    seen_om.add(k)
                    om_inserts.append(r)

            for i in range(0, len(om_inserts), BATCH):
                if _stop_event.is_set():
                    break
                batch_om = om_inserts[i:i+BATCH]
                batch_clean_om = [{k: v for k, v in r.items() if v is not None} for r in batch_om]
                try:
                    safe_supabase_upsert(client, 'DATA CLIMATICA OPENMETEO', batch_clean_om, on_conflict='ceco,fecha')
                except Exception as ex_om:
                    log(f'  ⚠️ Error parcial Open-Meteo: {ex_om}')
                subidos_om += len(batch_om)
                log(f'  ✅ Lote Open-Meteo {i//BATCH + 1}: {len(batch_om)} registros subidos')

        log(f'✅ Total subido a Supabase: {subidos + (len(regs_openmeteo) if regs_openmeteo else 0)} registros')
        fase('supabase', 'ok')
    except Exception as e:
        log(f'⚠️ Error Supabase: {e}', 'error')
        fase('supabase', 'skip')
    progress(95)

    # ── FIN ──
    fase('fin', 'ok')
    status('Completado ✅')
    progress(100)
    sep()
    log(f'🎉 Bot SENAMHI completado: {len(todos_registros)} registros | Estaciones: {total_est}')
    log(f'⏰ Fin: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    log(f'Registros subidos: {len(todos_registros)}')
    sep()
    _cerrar_seguimiento('exito', registros=len(todos_registros))


# ─────────────────────────────────────────────
# AUTOPILOT LOOP
# ─────────────────────────────────────────────
def loop_autopilot():
    cfg = cfg_cargar()
    modo = cfg.get('modo_auto', 'INTERVALO')
    last_trigger_hour = ''

    log('🔄 Autopiloto SENAMHI activado.')

    if modo == 'INTERVALO':
        val = int(cfg.get('intervalo_val', 24))
        uni = cfg.get('intervalo_uni', 'horas')
        ms = val * (3600 if uni == 'horas' else 60)
        while not _stop_event.is_set():
            ejecutar('autopilot')
            log(f'⏰ Próxima ejecución en {val} {uni}')
            for _ in range(ms):
                if _stop_event.is_set():
                    break
                time.sleep(1)
    else:
        # HORAS mode
        hora1 = cfg.get('hora1', '06:00')
        hora2 = cfg.get('hora2', '12:00')
        hora3 = cfg.get('hora3', '18:00')
        while not _stop_event.is_set():
            ahora = datetime.now().strftime('%H:%M')
            if ahora in (hora1, hora2, hora3) and ahora != last_trigger_hour:
                last_trigger_hour = ahora
                ejecutar('autopilot')
            elif ahora not in (hora1, hora2, hora3):
                last_trigger_hour = ''
            time.sleep(15)


if __name__ == '__main__':
    mode = 'manual'
    if len(sys.argv) > 1 and sys.argv[1] == '--autopilot':
        mode = 'autopilot'

    if mode == 'autopilot':
        t = threading.Thread(target=loop_autopilot, daemon=True)
        t.start()
        try:
            while not _stop_event.is_set():
                time.sleep(1)
        except KeyboardInterrupt:
            _stop_event.set()
            log('🛑 Autopiloto detenido.')
    else:
        try:
            ejecutar('manual')
        except KeyboardInterrupt:
            _stop_event.set()
            log('🛑 Bot detenido.')
