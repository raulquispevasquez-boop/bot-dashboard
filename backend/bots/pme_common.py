# -*- coding: utf-8 -*-
"""
Utilidades compartidas por toda la familia de bots PME (Schneider EcoStruxure
Power Monitoring Expert): login, sesion HTTP, lectura de gadgets y subida a
Supabase. Cada bot (HVAC, Iluminacion, Frio Alimentario, General...) importa
este modulo y mantiene su propia logica de negocio (que dashboard leer, en
que tabla guardar) en su propio archivo extraccion.py.
"""

import os
import re
import sys
import io
import contextlib
import json
import time
import base64
import gzip
import unicodedata
import uuid
from datetime import datetime, timezone, timedelta

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_URL = "https://10.30.4.124"

SUPABASE_URL = "https://zuouxnvcktjhqzlniion.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84"

_PME_CREDENCIALES_PATH = os.path.join(os.path.dirname(__file__), '..', 'config_bot_pme_spsa.json')


def log(msg):
    print(json.dumps({'type': 'log', 'message': msg}), flush=True)


@contextlib.contextmanager
def salida_silenciada():
    """
    Los scripts CLI de un solo disparo (ej. crear_solicitud_fracttal_manual.py,
    invocados por server.js via execFile, no spawn) esperan que TODO stdout
    sea un único JSON parseable al final. Pero log()/alerta_sistema()/fase()/
    etc. -pensadas para bots de larga duración corridos via spawn, que
    server.js lee línea por línea en tiempo real para el terminal en vivo-
    imprimen sus propias líneas JSON a stdout también. Sin esto, cualquier
    log() disparado durante la llamada real rompe el JSON.parse() del lado
    de Node ("Unexpected non-whitespace character..." - visto en
    producción al crear una solicitud real desde Itlus Fractal).

    Uso: envolver SOLO la llamada real con esto, e imprimir el JSON final
    DESPUES, fuera del bloque:
        with pme.salida_silenciada():
            resultado = pme.crear_solicitud_fracttal_manual(...)
        print(json.dumps({'success': True, 'data': resultado}))
    """
    stdout_real = sys.stdout
    sys.stdout = io.StringIO()
    try:
        yield
    finally:
        sys.stdout = stdout_real


def alerta_sistema(mensaje):
    """
    Emite una alerta de sistema, ADEMAS de log() (no en vez de). A
    diferencia de log() -que solo se ve si abres la consola del bot y la
    lees-, esto hace que aparezca un icono/aviso visible en la parte
    superior del dashboard, para errores que un humano debe notar de
    inmediato sin tener que estar revisando logs (ej. Supabase rechazando
    una escritura por RLS: el bot sigue corriendo pero esos datos se
    pierden en silencio si nadie se entera).
    """
    print(json.dumps({'type': 'alerta_sistema', 'mensaje': mensaje}), flush=True)


def fase(key, estado):
    """Marca una fase de ejecucion (mismo protocolo que el resto de bots del
    dashboard: 'idle' | 'activo' | 'ok' | 'skip' | 'error')."""
    print(json.dumps({'type': 'fase', 'fase': key, 'estado': estado}), flush=True)


def progreso(pct):
    """Actualiza la barra de progreso general (0-100)."""
    print(json.dumps({'type': 'status_val', 'key': 'progress', 'value': int(pct)}), flush=True)


def status_txt(txt):
    print(json.dumps({'type': 'status_val', 'key': 'status_txt', 'value': txt}), flush=True)


def cargar_credenciales():
    """Credenciales del servidor PME, compartidas por toda la familia de bots PME."""
    if os.path.exists(_PME_CREDENCIALES_PATH):
        with open(_PME_CREDENCIALES_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


def get_json_latin1(response):
    """El endpoint de datos de gadget de PME envia JSON en windows-1252 aunque declara utf-8."""
    return json.loads(response.content.decode('windows-1252'))


def iniciar_sesion(username, password):
    session = requests.Session()
    session.verify = False
    session.headers.update({'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})

    r1 = session.get(f"{BASE_URL}/Web/Auth", timeout=15)
    m = re.search(r'"Anti-Forgery-Token"\s*:\s*"([^"]+)"', r1.text)
    if not m:
        raise RuntimeError("No se encontro el Anti-Forgery-Token en la pagina de login.")
    token = m.group(1)

    r2 = session.post(
        f"{BASE_URL}/SystemDataService/Security/ValidateCredentials",
        json={"userName": username, "password": password, "returnUrl": "/Web/#Dashboards/", "setAuthCookie": True},
        headers={"Content-Type": "application/json", "Anti-Forgery-Token": token, "X-Requested-With": "XMLHttpRequest"},
        timeout=15
    )
    data = r2.json()
    if not data.get("IsValid"):
        raise RuntimeError(f"Login fallido: {data.get('FailureMessage')}")

    return session


_RE_DATA_SERIES = re.compile(r'^(Primary|Secondary)DataSeries\d+$')


def _decodificar_serie(valor_json):
    """
    El campo "DeviceId" de una serie de datos de gadget (PrimaryDataSeriesN/
    SecondaryDataSeriesN) viene en 2 formatos posibles:
      - Un numero simple (ej. "267") -> dispositivo FISICO directo, el
        identificador INMUTABLE de ION_Network.dbo.Device.ID.
      - Un blob base64 de un JSON gzip-comprimido, con
        {"ViewName": "Virtual Meter", "Segments": ["uri:.../node#<GUID>"]}
        -> medidor VIRTUAL: una formula que SUMA 2+ dispositivos fisicos
        (ej. "Huanuco - Frio" = TF-COM + TF-VI). Ese GUID vive en un
        espacio de IDs distinto (ApplicationModules, no ION_Network), asi
        que no es directamente un pme_device_id.

    Devuelve (device_id_int_o_None, lista_de_virtual_meter_guids).
    """
    try:
        serie = json.loads(valor_json or "{}")
    except (ValueError, TypeError):
        return None, []
    device_id_raw = serie.get("DeviceId")
    if not device_id_raw:
        return None, []
    device_id_raw = str(device_id_raw)
    if device_id_raw.isdigit():
        return int(device_id_raw), []
    try:
        crudo = gzip.decompress(base64.b64decode(device_id_raw))
        info = json.loads(crudo)
        segmentos = info.get("Segments") or []
        guids = [s.rsplit("#", 1)[-1] for s in segmentos if "#" in s]
        return None, guids
    except Exception:
        return None, []


def obtener_gadgets_dashboard(session, dashboard_id):
    # A diferencia del endpoint de datos de gadget (windows-1252), este endpoint
    # de listado de dashboard SI viene en UTF-8 correcto.
    r = session.get(f"{BASE_URL}/Dashboards/data/dashboard/{dashboard_id}", timeout=20)
    data = r.json()

    gadgets = []
    for g in data.get("DashboardGadgets", []):
        data_uri = g.get("DataUri", "")
        m = re.search(r'/gadget/([0-9a-fA-F-]{36})-data', data_uri)
        if not m:
            continue
        titulo = None
        device_ids = []
        virtual_meter_ids = []
        for setup in g.get("SetupItems", []):
            for s in setup.get("Settings", []):
                nombre = s.get("Name", "")
                if nombre == "Title":
                    titulo = s.get("Value")
                elif _RE_DATA_SERIES.match(nombre):
                    device_id, guids = _decodificar_serie(s.get("Value"))
                    if device_id is not None:
                        device_ids.append(device_id)
                    virtual_meter_ids.extend(guids)
        gadgets.append({
            "gadget_id": m.group(1), "titulo": titulo or "Desconocido",
            "device_ids": device_ids,
            "virtual_meter_ids": virtual_meter_ids,
        })
    return gadgets


# Mapeo confirmado contra el "Configuracion del gadget > Periodo de visualizacion" de PME.
# (AggregationId=1 tambien existe -datos crudos ~cada 15 min- pero no esta expuesto en esa UI)
AGGREGATION_HORARIA = 2       # "Por hora"
AGGREGATION_DIA_SEMANA = 3    # "Por dia de la semana"
AGGREGATION_DIA = 4           # "Por dia"

AGGREGATION_IDS = {
    "hora": AGGREGATION_HORARIA,
    "dia_semana": AGGREGATION_DIA_SEMANA,
    "dia": AGGREGATION_DIA,
}


def obtener_datos_gadget(session, gadget_id, dias_historico=None, aggregation_id=None, reintentos=2, espera_reintento=4,
                          fecha_inicio=None, fecha_fin=None):
    """
    Si se especifica dias_historico, se pide ese rango exacto al servidor via
    el parametro ViewingPeriodOne (formato "from N days ago to now"), en vez
    de depender del rango que la tarjeta tenga guardado en PME. Esto no
    modifica ni persiste nada en el dashboard compartido, es solo lectura.

    fecha_inicio/fecha_fin ("YYYY-MM-DD"): en vez de un rango relativo,
    pide un rango FIJO -confirmado contra PME real que el formato
    "from YYYY-MM-DD to YYYY-MM-DD" funciona (tanto YYYY-MM-DD como
    MM/DD/YYYY, probados; formatos con hora o nombre de mes en texto
    devuelven error 500, evitar). El "to" es EXCLUSIVO (no trae datos del
    dia de esa fecha), asi que se le suma 1 dia para que fecha_fin quede
    incluido completo. Tiene prioridad sobre dias_historico si ambos
    vienen. Pensado para descargas puntuales de backfill (un rango
    historico que el bot nunca cubrio con su ventana movil normal), no
    para las corridas automaticas recurrentes.
    """
    def _ejecutar_peticion(vp):
        p = {'ViewingPeriodOne': vp, 'AggregationId': aggregation_id or AGGREGATION_HORARIA}
        for intento in range(reintentos + 1):
            try:
                r = session.get(f"{BASE_URL}/Dashboards/data/gadget/{gadget_id}-data", params=p, timeout=25)
                return get_json_latin1(r)
            except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
                if intento < reintentos:
                    log(f"  ↻ Reintentando ({intento + 1}/{reintentos}) tras corte de conexión...")
                    time.sleep(espera_reintento)
                else:
                    raise e

    if fecha_inicio and fecha_fin:
        d_ini = datetime.strptime(fecha_inicio, "%Y-%m-%d").date()
        d_fin = datetime.strptime(fecha_fin, "%Y-%m-%d").date()
        dias_total = (d_fin - d_ini).days + 1

        # Schneider PME vacía respuestas si el período pedido excede los ~31 días en agregación horaria.
        # Si el rango es mayor a 30 días, lo dividimos en bloques de hasta 30 días y concatenamos los DataPoints.
        if dias_total > 30:
            resultado_combinado = None
            puntos_totales = []
            curr_ini = d_ini
            while curr_ini <= d_fin:
                curr_fin = min(curr_ini + timedelta(days=29), d_fin)
                s_ini = curr_ini.strftime("%Y-%m-%d")
                s_fin_exclusiva = (curr_fin + timedelta(days=1)).strftime("%Y-%m-%d")
                vp = f"from {s_ini} to {s_fin_exclusiva}"
                chunk_data = _ejecutar_peticion(vp)
                if resultado_combinado is None:
                    resultado_combinado = chunk_data
                pts = (chunk_data.get("ChartingData") or {}).get("DataPoints") or []
                puntos_totales.extend(pts)
                curr_ini = curr_fin + timedelta(days=1)

            if resultado_combinado and "ChartingData" in resultado_combinado:
                resultado_combinado["ChartingData"]["DataPoints"] = puntos_totales
            return resultado_combinado or {}
        else:
            fecha_fin_exclusiva = (d_fin + timedelta(days=1)).strftime("%Y-%m-%d")
            return _ejecutar_peticion(f"from {fecha_inicio} to {fecha_fin_exclusiva}")

    elif dias_historico is not None:
        if int(dias_historico) > 30:
            d_fin = datetime.now().date()
            d_ini = d_fin - timedelta(days=int(dias_historico) - 1)
            return obtener_datos_gadget(
                session, gadget_id, aggregation_id=aggregation_id,
                reintentos=reintentos, espera_reintento=espera_reintento,
                fecha_inicio=d_ini.strftime("%Y-%m-%d"), fecha_fin=d_fin.strftime("%Y-%m-%d")
            )
        offset_dias = max(0, int(dias_historico) - 1)
        return _ejecutar_peticion(f"from {offset_dias} days ago to now")
    else:
        return _ejecutar_peticion("from 6 days ago to now")


def cargar_config_telegram():
    """Token/chat_id del bot de Telegram para alertas, guardados junto a las
    credenciales compartidas de PME."""
    creds = cargar_credenciales()
    return creds.get('telegram_bot_token', ''), creds.get('telegram_chat_id', '')


def enviar_telegram(mensaje, parse_mode=None):
    token, chat_id = cargar_config_telegram()
    if not token or not chat_id:
        log("ℹ️ Alerta detectada pero Telegram no está configurado (falta token/chat_id).")
        return False
    try:
        payload = {"chat_id": chat_id, "text": mensaje}
        if parse_mode:
            payload["parse_mode"] = parse_mode
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json=payload,
            timeout=15
        )
        if r.status_code != 200:
            log(f"⚠️ Error enviando alerta a Telegram: {r.status_code} {r.text[:200]}")
            return False
        return True
    except Exception as e:
        log(f"⚠️ Error enviando alerta a Telegram: {e}")
        return False


def enviar_telegram_foto(datos_bytes, nombre_archivo, caption=None, parse_mode=None):
    token, chat_id = cargar_config_telegram()
    if not token or not chat_id:
        return False
    try:
        data = {"chat_id": chat_id, "caption": (caption or "")[:1024]}
        if parse_mode:
            data["parse_mode"] = parse_mode
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendPhoto",
            data=data,
            files={"photo": (nombre_archivo, datos_bytes, "image/png")},
            timeout=30
        )
        if r.status_code != 200:
            log(f"⚠️ Error enviando imagen a Telegram: {r.status_code} {r.text[:200]}")
            return False
        return True
    except Exception as e:
        log(f"⚠️ Error enviando imagen a Telegram: {e}")
        return False


def _barra_progreso(pct, longitud=14):
    llenos = int(round((max(0, min(100, pct)) / 100) * longitud))
    return "▓" * llenos + "░" * (longitud - llenos)


def enviar_telegram_progreso_inicio(servicio, detalle=""):
    """Envia el mensaje inicial de progreso (0%) para una corrida del bot y
    devuelve el message_id de Telegram, para poder irlo actualizando despues
    con actualizar_telegram_progreso() en vez de mandar un mensaje nuevo por
    cada avance. Si Telegram no esta configurado devuelve None (el resto del
    bot sigue funcionando igual, solo sin esta notificacion)."""
    token, chat_id = cargar_config_telegram()
    if not token or not chat_id:
        return None
    texto = f"🚀 Iniciando Bot {servicio}...\n{f'{detalle}' + chr(10) if detalle else ''}\n{_barra_progreso(0)} 0%"
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": texto},
            timeout=15
        )
        if r.status_code == 200:
            return r.json().get('result', {}).get('message_id')
        log(f"⚠️ Error enviando progreso inicial a Telegram: {r.status_code} {r.text[:150]}")
    except Exception as e:
        log(f"⚠️ Error enviando progreso inicial a Telegram: {e}")
    return None


_ULTIMO_PCT_TELEGRAM = {}


def actualizar_telegram_progreso(message_id, servicio, pct, status_texto="", forzar=False, umbral=10):
    """Edita el mensaje creado por enviar_telegram_progreso_inicio con el
    porcentaje de avance actual. Se auto-limita a actualizar solo cuando el
    avance sube al menos `umbral` puntos (o si forzar=True) para no saturar
    la API de Telegram cuando hay muchas sedes."""
    if not message_id:
        return
    ultimo = _ULTIMO_PCT_TELEGRAM.get(message_id, -100)
    if not forzar and pct < 100 and (pct - ultimo) < umbral:
        return
    _ULTIMO_PCT_TELEGRAM[message_id] = pct

    token, chat_id = cargar_config_telegram()
    if not token or not chat_id:
        return
    texto = f"⚡ Bot {servicio} en ejecución\n\n{_barra_progreso(pct)} {pct}%"
    if status_texto:
        texto += f"\n{status_texto}"
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{token}/editMessageText",
            json={"chat_id": chat_id, "message_id": message_id, "text": texto},
            timeout=15
        )
        if r.status_code != 200 and 'message is not modified' not in r.text:
            log(f"⚠️ Error actualizando progreso en Telegram: {r.status_code} {r.text[:150]}")
    except Exception as e:
        log(f"⚠️ Error actualizando progreso en Telegram: {e}")


def verificar_estado_medidor(servicio, sede, filas, medidor_nombre=None, umbral_dias_desconexion=1):
    """
    Registra el estado del medidor de una sede/servicio en
    energia.pme_estado_medidores y envia una alerta por Telegram cuando
    cambia de estado (OK -> ALERTA o ALERTA -> recuperado). No reenvia la
    misma alerta en corridas sucesivas mientras el estado no cambie.

    A diferencia de mirar solo si la descarga trajo ALGUN dato, esto se
    fija en que tan reciente es el ULTIMO dato reportado: una sede que
    reporto normal la mayor parte del rango consultado y se quedo en
    blanco los ultimos dias (medidor que se desconecto a mitad del
    periodo, ej. "Santa Clara" en Frio Alimentario) tambien debe marcarse
    como ALERTA, aunque la descarga si haya traido filas.
    """
    medidor_nombre = medidor_nombre or f"{sede} - {servicio}"

    ultima_fecha_real = max((f['fecha'] for f in filas), default=None)
    tiene_datos_recientes = False
    if ultima_fecha_real:
        try:
            fecha_dt = datetime.strptime(ultima_fecha_real, "%Y-%m-%d").date()
            tiene_datos_recientes = (datetime.now().date() - fecha_dt).days <= umbral_dias_desconexion
        except ValueError:
            tiene_datos_recientes = False

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Accept-Profile": "energia",
        "Content-Profile": "energia",
    }
    url = f"{SUPABASE_URL}/rest/v1/pme_estado_medidores"

    estado_anterior = None
    try:
        r = requests.get(
            url,
            params={"servicio": f"eq.{servicio}", "sede": f"eq.{sede}", "select": "estado"},
            headers=headers,
            timeout=15
        )
        rows = r.json()
        if rows:
            estado_anterior = rows[0].get('estado')
    except Exception as e:
        log(f"⚠️ No se pudo leer estado previo del medidor {sede}: {e}")

    ahora = datetime.now(timezone.utc).isoformat()
    nuevo_estado = 'OK' if tiene_datos_recientes else 'ALERTA'

    payload = {
        "servicio": servicio,
        "sede": sede,
        "medidor_nombre": medidor_nombre,
        "ultima_revision": ahora,
        "tiene_datos": tiene_datos_recientes,
        "estado": nuevo_estado,
    }
    if ultima_fecha_real:
        # Fecha real del ultimo dato reportado (no "hoy"): asi el detalle
        # de medidores desconectados puede distinguir "nunca reporto nada"
        # (este campo queda vacio) de "reporto antes, dejo de hacerlo"
        # (aca queda la fecha real en que se corto).
        payload["ultima_fecha_con_datos"] = ultima_fecha_real

    try:
        h2 = dict(headers)
        h2["Prefer"] = "resolution=merge-duplicates"
        r2 = requests.post(f"{url}?on_conflict=servicio,sede", headers=h2, json=[payload], timeout=15)
        if r2.status_code not in (200, 201, 204):
            log(f"⚠️ No se pudo guardar el estado del medidor {sede} en Supabase: {r2.status_code} {r2.text[:200]}")
            alerta_sistema(f"Supabase rechazó el estado del medidor de {sede} ({servicio}) — código {r2.status_code}. Revisar permisos/RLS de pme_estado_medidores.")
    except Exception as e:
        log(f"⚠️ No se pudo actualizar estado del medidor {sede}: {e}")

    if estado_anterior != nuevo_estado:
        if nuevo_estado == 'ALERTA':
            detalle = f"Último dato recibido: {ultima_fecha_real}." if ultima_fecha_real else "Nunca reportó datos en el rango consultado."
            enviar_telegram(f"⚠️ ALERTA PME [{servicio}]\nSede: {sede}\n{detalle} Posible medidor desconectado o requiere mantenimiento.")
        elif estado_anterior == 'ALERTA':
            enviar_telegram(f"✅ RECUPERADO PME [{servicio}]\nSede: {sede}\nVuelve a reportar datos con normalidad.")
        # try:
        #     sincronizar_solicitudes_fracttal()
        # except Exception as e:
        #     log(f"⚠️ Fracttal: error al sincronizar solicitudes consolidadas: {e}")


def obtener_medidores_desconectados(servicio):
    """Devuelve la lista de medidores en estado ALERTA (sin datos) para un
    servicio, ej. [{'sede':..., 'medidor_nombre':..., 'ultima_fecha_con_datos':...}]."""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept-Profile": "energia",
    }
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/pme_estado_medidores",
            params={
                "servicio": f"eq.{servicio}",
                "estado": "eq.ALERTA",
                "select": "sede,medidor_nombre,ultima_fecha_con_datos,ultima_revision"
            },
            headers=headers,
            timeout=15
        )
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        log(f"⚠️ No se pudo obtener la lista de medidores desconectados: {e}")
    return []


URL_FRACTTAL_LOGIN = "https://one.fracttal.com/rpc/login_new"
URL_FRACTTAL_PROXY = "https://one.fracttal.com/rpc/proxy"

# Clasificacion usada para las solicitudes que crea el propio sistema
# (elegida a mano una vez en la UI de Fracttal para armar la captura real
# de requests.requests_insert): id_type=4763 ("PEC"), id_type_1=1833
# ("Falla Total"), id_type_2=1641 ("Ninguna"). Se puede ajustar aca si
# mas adelante se prefiere otra categoria para estas alertas automaticas.
FRACTTAL_ID_TYPE_DEFAULT = 4763
FRACTTAL_ID_TYPE_1_DEFAULT = 1833
FRACTTAL_ID_TYPE_2_DEFAULT = 1641


def _iniciar_sesion_fracttal(intentos=2):
    """Login contra Fracttal (mismo flujo que ya usan los bots de
    Fracttal-MSP), usando las credenciales compartidas de config_bot_pme_spsa.json.
    Reintenta una vez ante timeout/error de red (se observó que el
    endpoint de login a veces tarda o falla de forma transitoria bajo
    varias llamadas seguidas).

    Devuelve una requests.Session ya autenticada (con el Bearer token
    guardado en sus headers por defecto Y las cookies que fija Fracttal
    al momento del login), o None si definitivamente fallo tras los
    reintentos. Importante usar la MISMA sesion para las llamadas
    siguientes a rpc/proxy: se confirmó que Fracttal rechaza con
    USER_NOT_LOGIN una llamada que solo trae el Bearer token pero no la
    cookie de sesión que se fijó al loguearse (igual que en un navegador,
    el token solo no alcanza)."""
    cred = cargar_credenciales()
    email = cred.get('fracttal_user')
    password = cred.get('fracttal_pass')
    id_company = cred.get('fracttal_id_company')
    if not (email and password and id_company):
        log("⚠️ Fracttal: faltan credenciales (fracttal_user/fracttal_pass/fracttal_id_company) en config_bot_pme_spsa.json.")
        return None
    for intento in range(1, intentos + 1):
        try:
            session = requests.Session()
            r = session.post(URL_FRACTTAL_LOGIN, json={
                "email": email,
                "password": password,
                "id_company": int(id_company),
                "id_server": "AMERICAN",
                "description": "INTERCORP",
                "platform": "Fracttal/5.9.02 web",
            }, timeout=30)
            if r.status_code == 200:
                token = r.json().get("data", {}).get("token")
                if token:
                    session.headers.update({
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                        "x-version": "Fracttal/5.9.02 web",
                        "Origin": "https://one.fracttal.com",
                        "Referer": "https://one.fracttal.com/workrequest",
                    })
                    return session
            log(f"⚠️ Fracttal: login rechazado ({r.status_code}).")
        except Exception as e:
            log(f"⚠️ Fracttal: error al iniciar sesión (intento {intento}/{intentos}): {e}")
        if intento < intentos:
            time.sleep(2)
    return None


def _rpc_fracttal(session, method, params):
    """POST generico a rpc/proxy de Fracttal usando una sesion ya
    autenticada (ver _iniciar_sesion_fracttal - trae el Bearer token en
    sus headers y las cookies de la sesion). Devuelve (data, None) si
    success=true (data es lista o dict segun el metodo), o (None, mensaje)
    si fallo/rechazo. Nunca relanza excepciones."""
    try:
        r = session.post(
            URL_FRACTTAL_PROXY,
            json=[{"id": str(uuid.uuid4()), "jsonrpc": "2.0", "method": method, "params": params}],
            timeout=30
        )
        data = r.json()
        resultado = (data[0] if isinstance(data, list) else data) or {}
        resultado_inner = resultado.get('result', {}) or {}
        if resultado_inner.get('success'):
            return resultado_inner.get('data'), None
        mensaje = resultado_inner.get('message') or str(resultado)
        log(f"⚠️ Fracttal: {method} rechazado: {mensaje}")
        return None, mensaje
    except Exception as e:
        log(f"⚠️ Fracttal: error al llamar {method}: {e}")
        return None, str(e)


_CACHE_ACTIVO_TABLERO_SEDE = {}
_MARCAS_CANONICAS_SEDE = {'PV', 'MK', 'VV'}

# Confirmado contra datos reales de Fracttal: Plaza Vea usa el sufijo
# "PVH" y Makro usa "MK" en el nombre de su Localizacion (ej. "SANTA
# ANITA - MK", "PURUCHUCO - PVH"). Vivanda no tiene ningun caso confirmado
# todavia -queda sin mapear a proposito, no se adivina.
_SUFIJO_FRACTTAL_POR_MARCA = {'PV': 'PVH', 'MK': 'MK'}

# Prefijos de descripcion que en Fracttal NO son la tienda fisica en si
# (tiendas virtuales/e-commerce, centros comerciales contenedores, centros
# de distribucion, sub-areas de produccion/panaderia, nodos administrativos)
# - comparten el nombre de la sede con la tienda real y generan falsos
# positivos de ambiguedad. Confirmado revisando resultados reales de
# busqueda (ej. "Tienda Virtual Izaguirre PVH", "DDC Chimbote - MK").
_RUIDO_UBICACIONES_FRACTTAL = ('TIENDA VIRTUAL', 'E-TIENDA', 'CC ', 'DDC', 'PROD.', 'ADMINISTRACIÓN', 'ADMINISTRACION')


def _nucleo_y_marca_sede(sede):
    """
    El nombre de sede de PME (ej. "PV Puruchuco") no aparece igual en
    Fracttal (ej. "PURUCHUCO - PVH") porque Fracttal no usa el prefijo de
    marca ("PV"/"Plaza Vea") en el nombre de la Localización, solo el
    nombre del lugar (el prefijo de marca se ve como SUFIJO, ver
    _SUFIJO_FRACTTAL_POR_MARCA). Reutiliza normalizar_sede y separa el
    nucleo (para buscar) de la marca (para desambiguar despues si hace
    falta, ej. "MK Chimbote" vs "PV Chimbote" comparten nucleo "CHIMBOTE").
    Devuelve (nucleo, marca_o_None).
    """
    palabras = normalizar_sede(sede).split()
    marca = None
    if palabras and palabras[0] in _MARCAS_CANONICAS_SEDE:
        marca = palabras[0]
        palabras = palabras[1:]
    return (' '.join(palabras) or sede), marca


def resolver_activo_tablero_sede(sede, session=None):
    """
    Resuelve automaticamente el id_item (activo de Fracttal) del "Tablero
    Eléctrico" de una sede, replicando en 2 llamadas el filtrado manual
    que ya hace el usuario en la UI de Fracttal:
      1. Busca, por texto libre (sede) contra code/description/field_1..6,
         el nodo de tipo "Localización" (id_type_item=1, id_type_item_not=4)
         que representa esa sede - method inventories.items_list.
      2. Lista los "Equipos" (id_type_item=2) bajo esa ubicación
         (id_location=<id de la sede>) - mismo method, filtro distinto.
      3. Entre esos equipos, elige el PRIMERO cuya descripción contenga
         "tablero" (basta la palabra, no hace falta el código completo) -
         filtrado local, ya que ambas llamadas ya devuelven la lista
         completa (misma orden id_item asc que usa la UI).

    session: reutilizar una sesion ya autenticada (ver sincronizar_
    solicitudes_fracttal, que hace login UNA vez para las N sedes de la
    corrida en vez de una por sede). Si no se pasa, hace login por su
    cuenta - permite seguir llamando esta funcion suelta.

    Por seguridad, si el paso 1 no encuentra ninguna ubicación o encuentra
    más de una (nombre de sede ambiguo entre PME y Fracttal), NO elige al
    azar. Devuelve (id_item, causa, solucion, candidatos): si se resolvió
    bien, (id, None, None, None); si falló, (None, causa técnica breve,
    solución sugerida, candidatos) - pensadas para guardarse en el
    historial y mostrarse en el modal. candidatos viene poblado SOLO en el
    caso de ambigüedad de ubicación (>1 match): lista de
    {id_location, descripcion} para que el usuario elija a mano cuál es la
    correcta (ver fijar_ubicacion_fracttal_y_reintentar) - en cualquier
    otro caso de fallo, None.

    Si la sede ya tiene un activo fijado a mano (energia.pme_fracttal_
    activo_override, ver fijar_ubicacion_fracttal_y_reintentar), se usa
    ese directo, sin volver a buscar. Resultado cacheado en memoria por
    sede durante la corrida del bot (no repite las llamadas para la misma
    sede dos veces).
    """
    if sede in _CACHE_ACTIVO_TABLERO_SEDE:
        return _CACHE_ACTIVO_TABLERO_SEDE[sede]

    override = obtener_override_activo_fracttal(sede)
    if override:
        resultado = (override, None, None, None)
        _CACHE_ACTIVO_TABLERO_SEDE[sede] = resultado
        return resultado

    session = session or _iniciar_sesion_fracttal()
    if not session:
        resultado = (None, "No se pudo iniciar sesión en Fracttal.", "Revisar fracttal_user/fracttal_pass/fracttal_id_company en config_bot_pme_spsa.json, o si Fracttal está caído.", None)
        _CACHE_ACTIVO_TABLERO_SEDE[sede] = resultado
        return resultado

    texto_busqueda, marca = _nucleo_y_marca_sede(sede)
    filtro_sede = [
        {"operator": "like", "property": campo, "value": texto_busqueda, "condition": "or"}
        for campo in ("code", "description", "field_1", "field_2", "field_3", "field_4", "field_5", "field_6")
    ]
    ubicaciones, error_rpc = _rpc_fracttal(session, "inventories.items_list", {
        "filter": filtro_sede,
        "sort": [{"property": "id_item", "direction": "asc"}],
        "page": 1, "limit": 200, "start": 0,
        "is_tree": False, "node": None,
        "id_type_item": 0, "id_type_item_not": "4",
        "only_activated_items": True,
    })
    ubicaciones = ubicaciones or []
    # Descarta nodos que no son la tienda fisica (virtuales, centros
    # comerciales contenedores, centros de distribucion, produccion,
    # administrativos) - comparten nombre con la tienda real y generan
    # ambiguedad falsa.
    ubicaciones = [
        u for u in ubicaciones
        if not (u.get('description') or '').strip().upper().startswith(_RUIDO_UBICACIONES_FRACTTAL)
    ]
    # Si sigue ambiguo y se conoce la marca de la sede (PV/MK), intenta
    # desambiguar por el sufijo que usa Fracttal para esa marca (ej.
    # "MK Chimbote" vs "PV Chimbote" comparten nucleo "CHIMBOTE" pero
    # solo una descripcion trae "- MK" / "- PVH"). Si eso no deja
    # exactamente 1, se mantiene la lista ambigua original (no se adivina).
    if len(ubicaciones) > 1 and marca in _SUFIJO_FRACTTAL_POR_MARCA:
        sufijo = _SUFIJO_FRACTTAL_POR_MARCA[marca]
        filtradas_por_marca = [u for u in ubicaciones if sufijo in (u.get('description') or '').upper()]
        if len(filtradas_por_marca) == 1:
            ubicaciones = filtradas_por_marca

    if error_rpc and not ubicaciones:
        resultado = (None, f"Error al buscar la ubicación en Fracttal: {error_rpc}", "Reintentar más tarde; si persiste, revisar la conexión con Fracttal.", None)
    elif not ubicaciones:
        resultado = (None, f"No se encontró ninguna ubicación en Fracttal para la sede '{sede}' (buscado como '{texto_busqueda}').", "Verificar que el nombre de la sede en PME coincida con el nombre de la Localización en Fracttal.", None)
    elif len(ubicaciones) > 1:
        candidatos = [{'id_location': u['id_item'], 'descripcion': u.get('description', '')} for u in ubicaciones]
        nombres = ', '.join(u.get('description', '') for u in ubicaciones)
        resultado = (
            None, f"La búsqueda de '{texto_busqueda}' (sede '{sede}') encontró {len(ubicaciones)} ubicaciones distintas: {nombres}.",
            "Elegir manualmente cuál es la ubicación correcta (abajo), o afinar el nombre de la sede.", candidatos
        )
    else:
        id_location = ubicaciones[0]['id_item']
        id_item, causa2, solucion2 = _resolver_tablero_bajo_ubicacion(session, sede, id_location)
        resultado = (id_item, causa2, solucion2, None)

    _CACHE_ACTIVO_TABLERO_SEDE[sede] = resultado
    return resultado


def _resolver_tablero_bajo_ubicacion(session, sede, id_location):
    """
    Paso 2 de resolver_activo_tablero_sede, factorizado aparte para
    reutilizarlo desde fijar_ubicacion_fracttal_y_reintentar (cuando el
    usuario elige a mano cuál de las ubicaciones ambiguas es la correcta,
    solo falta este paso). Devuelve (id_item, causa, solucion) - sin la
    4ta posicion de candidatos, que aca no aplica.
    """
    equipos, error_rpc2 = _rpc_fracttal(session, "inventories.items_list", {
        "filter": [{"operator": "=", "property": "id_type_item", "value": 2}],
        "id_location": id_location,
        "id_parent_location": None,
        "id_type_item": 0, "id_type_item_not": "4",
        "is_tree": False, "node": None,
        "only_activated_items": True,
        "page": 1, "limit": 200, "start": 0,
        "sort": [{"property": "id_item", "direction": "asc"}],
    })
    equipos = equipos or []
    encontrado = next((eq for eq in equipos if 'tablero' in (eq.get('description') or '').lower()), None)
    if encontrado:
        id_item = encontrado['id_item']
        log(f"✅ Fracttal: activo resuelto para '{sede}': {encontrado.get('description')} (id_item {id_item}).")
        return id_item, None, None
    if error_rpc2 and not equipos:
        return None, f"Error al listar los equipos de la sede en Fracttal: {error_rpc2}", "Reintentar más tarde; si persiste, revisar la conexión con Fracttal."
    return None, f"La sede '{sede}' no tiene ningún equipo con 'tablero' en la descripción en Fracttal.", "Verificar en Fracttal que la sede tenga un activo tipo Equipo con 'Tablero' en su descripción."


def buscar_activos_fracttal(texto, session=None):
    """
    Búsqueda libre de activos en Fracttal (Itlus Fractal, creación manual/
    masiva de solicitudes) - a diferencia de resolver_activo_tablero_sede,
    no está atada a una sede de PME ni busca específicamente un "tablero":
    devuelve tal cual la lista de resultados de Fracttal para que el
    usuario elija a mano cuál es el activo correcto (nunca se adivina).

    Mismo method/filtro que ya usa resolver_activo_tablero_sede paso 1
    (like sobre code/description/field_1..6), probado en producción.

    Devuelve (candidatos, error): candidatos es una lista de
    {id_item, code, description} (puede ser vacía), error es el mensaje
    de _rpc_fracttal si la llamada falló (o None).
    """
    if not texto or not texto.strip():
        return [], "Escribe algo para buscar."

    # Chequeo ultrarrápido (0ms) en la base de datos local de 515 sedes descargada:
    # Si el usuario busca una localización o CECO, responde al instante sin llamar a Fracttal por internet
    try:
        sedes_locales = resolver_sede_ceco_local(texto)
        if sedes_locales:
            return [
                {"id_item": s["id_location"], "code": s["code"], "description": s["description"]}
                for s in sedes_locales
            ], None
    except Exception:
        pass

    session = session or _iniciar_sesion_fracttal()
    if not session:
        return [], "No se pudo iniciar sesión en Fracttal."

    filtro = [
        {"operator": "like", "property": campo, "value": texto.strip(), "condition": "or"}
        for campo in ("code", "description", "field_1", "field_2", "field_3", "field_4", "field_5", "field_6")
    ]
    resultados, error_rpc = _rpc_fracttal(session, "inventories.items_list", {
        "filter": filtro,
        "sort": [{"property": "id_item", "direction": "asc"}],
        "page": 1, "limit": 200, "start": 0,
        "is_tree": False, "node": None,
        "id_type_item": 0, "id_type_item_not": "4",
        "only_activated_items": True,
    })
    resultados = resultados or []
    candidatos = [
        {"id_item": r.get("id_item"), "code": r.get("code", ""), "description": r.get("description", "")}
        for r in resultados
    ]
    return candidatos, (error_rpc if not candidatos else None)


def listar_equipos_ubicacion_fracttal(id_location, session=None):
    """
    Paso 2 del selector de activo en 2 pasos de Itlus Fractal, replicando
    el flujo real de la UI de Fracttal (Localización -> Tipo de Activo =
    Equipos): dada una Ubicación ya elegida en el paso 1
    (buscar_activos_fracttal), lista TODOS los Equipos bajo esa ubicación
    -sin filtrar por "tablero" ni nada- para que el usuario elija a mano
    cuál es el activo correcto. Una ubicación puede tener 200+ equipos
    (confirmado en producción: "LA PERLA" tiene 210), así que el filtrado
    fino por texto se hace en el frontend sobre esta lista, no acá.

    Mismo method/filtro que ya usa _resolver_tablero_bajo_ubicacion
    (id_type_item=2 bajo esa ubicación), factorizado aparte porque esa
    función además auto-elige el primero que diga "tablero" - acá se
    quiere la lista completa, sin adivinar nada.

    Devuelve (equipos, error): equipos es una lista de
    {id_item, code, description} (puede ser vacía), error es el mensaje
    de _rpc_fracttal si la llamada falló (o None).
    """
    session = session or _iniciar_sesion_fracttal()
    if not session:
        return [], "No se pudo iniciar sesión en Fracttal."

    # Paginado: una sede puede tener mas de 200 equipos (confirmado:
    # "LA PERLA" tiene 210) - con un solo pedido de limit=200 se perdian
    # los ultimos en silencio. Se sigue pidiendo pagina por pagina hasta
    # que una devuelva menos que el tamano de pagina.
    #
    # Salvaguarda: para algunas sedes (confirmado en produccion:
    # "AREQUIPA 2 - MK - ECO") Fracttal ignora "start"/"page" y devuelve
    # SIEMPRE la misma primera pagina de 200 sin importar cual se pida -
    # sin esto, el bucle nunca terminaba solo (parecia una sede con miles
    # de equipos). Si una pagina trae exactamente los mismos id_item que
    # la anterior, se corta ahi con lo ya juntado (deduplicado). Tambien
    # hay un tope duro de paginas por las dudas (100 = 20,000 equipos,
    # muy por encima de cualquier sede real vista hasta ahora).
    TAMANO_PAGINA = 200
    TOPE_PAGINAS = 100
    equipos = []
    ids_vistos = set()
    ids_pagina_anterior = None
    pagina = 1
    error_rpc = None
    while pagina <= TOPE_PAGINAS:
        resultados, error_rpc = _rpc_fracttal(session, "inventories.items_list", {
            "filter": [{"operator": "=", "property": "id_type_item", "value": 2}],
            "id_location": id_location,
            "id_parent_location": None,
            "id_type_item": 0, "id_type_item_not": "4",
            "is_tree": False, "node": None,
            "only_activated_items": True,
            "page": pagina, "limit": TAMANO_PAGINA, "start": (pagina - 1) * TAMANO_PAGINA,
            "sort": [{"property": "id_item", "direction": "asc"}],
        })
        resultados = resultados or []
        ids_esta_pagina = [r.get("id_item") for r in resultados]
        if ids_pagina_anterior is not None and ids_esta_pagina == ids_pagina_anterior:
            log(f"⚠️ Fracttal repitió la misma página para id_location={id_location} (paginación rota de su lado) — se corta con {len(equipos)} equipos ya juntados.")
            break
        for r in resultados:
            if r.get("id_item") in ids_vistos:
                continue
            ids_vistos.add(r.get("id_item"))
            equipos.append({"id_item": r.get("id_item"), "code": r.get("code", ""), "description": r.get("description", "")})
        if len(resultados) < TAMANO_PAGINA:
            break
        ids_pagina_anterior = ids_esta_pagina
        pagina += 1
    else:
        log(f"⚠️ Se alcanzó el tope de {TOPE_PAGINAS} páginas para id_location={id_location} — se corta con {len(equipos)} equipos.")
    return equipos, (error_rpc if not equipos else None)


_RUTA_CACHE_ACTIVOS_FRACTTAL = os.path.join(os.path.dirname(__file__), "cache_activos_fracttal.json")


def _listar_todas_las_sedes_fracttal(session):
    """Todas las tiendas FISICAS de Fracttal (id_type_item=1), paginado
    hasta traerlas todas.

    OJO: id_type_item=1 solo (sin mas filtro) trae TODOS los niveles de la
    jerarquia de ubicaciones, no solo tiendas - tambien marca (ej. "MAKRO"),
    celula y zona (ej. "ZONA 1 (MK)"), que son nodos de agrupacion con
    potencialmente miles de equipos heredados de todas las tiendas que
    contienen (confirmado en produccion: "MAKRO" solo trae 5643 equipos,
    "ZONA 1 (MK)" 3164 - tirar de esos nodos por accidente hizo que un
    pull completo se disparara a 1.5GB de RAM sin avanzar). Una tienda
    real siempre tiene id_cost_center (CECO) asignado; los nodos de
    agrupacion no - se filtra por eso (confirmado: de 546 nodos totales,
    515 son tiendas reales con CECO y 31 son agrupaciones sin CECO)."""
    TAMANO_PAGINA = 200
    sedes = []
    pagina = 1
    while True:
        resultados, error_rpc = _rpc_fracttal(session, "inventories.items_list", {
            "filter": [{"operator": "=", "property": "id_type_item", "value": 1}],
            "sort": [{"property": "id_item", "direction": "asc"}],
            "page": pagina, "limit": TAMANO_PAGINA, "start": (pagina - 1) * TAMANO_PAGINA,
            "is_tree": False, "node": None,
            "id_type_item": 0, "id_type_item_not": "4",
            "only_activated_items": True,
        })
        if error_rpc:
            return sedes, error_rpc
        resultados = resultados or []
        sedes.extend(r for r in resultados if r.get("id_cost_center"))
        if len(resultados) < TAMANO_PAGINA:
            break
        pagina += 1
    return sedes, None


def _guardar_base_activos_supabase(base):
    """Respaldo en public.itlus_activos_fracttal_cache (upsert por
    lotes, para no mandar un solo POST gigante con 40,000+ equipos)."""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    ahora = datetime.now(timezone.utc).isoformat()
    TAMANO_LOTE = 50
    for i in range(0, len(base), TAMANO_LOTE):
        lote = base[i:i + TAMANO_LOTE]
        payload = [
            {
                "id_location": s["id_location"], "code": s["code"],
                "description": s["description"], "equipos": s["equipos"],
                "actualizado_el": ahora,
            }
            for s in lote
        ]
        try:
            r = requests.post(
                f"{SUPABASE_URL}/rest/v1/itlus_activos_fracttal_cache?on_conflict=id_location",
                headers=headers, json=payload, timeout=30,
            )
            if r.status_code not in (200, 201, 204):
                log(f"⚠️ No se pudo respaldar el lote {i}-{i+len(lote)} en Supabase: {r.status_code} {r.text[:200]}")
        except Exception as e:
            log(f"⚠️ No se pudo respaldar el lote {i}-{i+len(lote)} en Supabase: {e}")


def construir_base_activos_fracttal():
    """
    Trae TODAS las sedes de Fracttal y, para cada una, TODOS sus equipos -
    pensado para correr via spawn (no execFile) porque tarda ~15-25 min
    (546 sedes al momento de escribir esto). Reporta avance con
    log()/progreso(), igual que el resto de bots del dashboard, para que
    server.js lo pueda mostrar en una barra de progreso real.

    Guarda 2 copias al terminar:
    - Local (_RUTA_CACHE_ACTIVOS_FRACTTAL): la que de verdad se consulta
      en cada busqueda del picker de Itlus 1 - cero llamadas a Fracttal/
      Supabase por busqueda.
    - Respaldo en Supabase (itlus_activos_fracttal_cache): solo para
      reconstruir la copia local si se pierde o el servidor corre en otra
      maquina, para no depender de que Supabase este arriba en el dia a
      dia.
    """
    session = _iniciar_sesion_fracttal()
    if not session:
        log("No se pudo iniciar sesión en Fracttal.")
        return False

    log("Descargando la lista de sedes...")
    sedes, error = _listar_todas_las_sedes_fracttal(session)
    if error:
        log(f"Error trayendo sedes: {error}")
        return False

    total = len(sedes)
    log(f"{total} sedes encontradas. Trayendo los equipos de cada una...")

    base = []
    for i, sede in enumerate(sedes):
        id_location = sede.get("id_item")
        equipos, _err = listar_equipos_ubicacion_fracttal(id_location, session=session)
        item = {
            "id_location": id_location,
            "code": sede.get("code", ""),
            "description": sede.get("description", ""),
            "equipos": equipos,
        }
        base.append(item)
        # Reporta la sede completa (no solo el %) para que la pantalla la
        # vaya mostrando en vivo, sede por sede, en vez de quedar en
        # blanco hasta que termine todo el proceso.
        print(json.dumps({"type": "sede_lista", "sede": item}, ensure_ascii=False), flush=True)
        progreso(int((i + 1) / total * 90))  # el 10% final es para guardar
        if (i + 1) % 25 == 0 or (i + 1) == total:
            log(f"{i + 1}/{total} sedes procesadas...")

    payload = {"sedes": base, "actualizado_el": datetime.now(timezone.utc).isoformat()}
    with open(_RUTA_CACHE_ACTIVOS_FRACTTAL, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
    total_equipos = sum(len(s["equipos"]) for s in base)
    log(f"Copia local guardada: {total} sedes, {total_equipos} equipos.")
    progreso(95)

    log("Respaldando en Supabase...")
    _guardar_base_activos_supabase(base)
    progreso(100)
    log("Listo.")
    return True


def _contar_equipos_sede_fracttal(id_location, session):
    """Chequeo barato: solo el campo 'total' que Fracttal devuelve en la
    respuesta (confirmado que existe y es confiable - ver auditoría),
    pidiendo apenas 1 registro. No descarga la lista de equipos. A
    diferencia de _rpc_fracttal (que solo expone 'data'), acá se necesita
    'total' - mismo llamado de fondo, solo se lee otro campo."""
    try:
        r = session.post(
            URL_FRACTTAL_PROXY,
            json=[{"id": str(uuid.uuid4()), "jsonrpc": "2.0", "method": "inventories.items_list", "params": {
                "filter": [{"operator": "=", "property": "id_type_item", "value": 2}],
                "id_location": id_location,
                "id_parent_location": None,
                "id_type_item": 0, "id_type_item_not": "4",
                "is_tree": False, "node": None,
                "only_activated_items": True,
                "page": 1, "limit": 1, "start": 0,
                "sort": [{"property": "id_item", "direction": "asc"}],
            }}],
            timeout=30
        )
        data = r.json()
        resultado = (data[0] if isinstance(data, list) else data) or {}
        resultado_inner = resultado.get('result', {}) or {}
        if resultado_inner.get('success'):
            return resultado_inner.get('total'), None
        return None, resultado_inner.get('message') or str(resultado)
    except Exception as e:
        return None, str(e)


def revisar_cambios_activos_fracttal():
    """
    Chequeo LIVIANO (no descarga equipos, solo cuenta) para el botón
    único "Revisar actualizaciones": compara la copia local contra
    Fracttal en vivo para detectar (a) sedes nuevas que no están en la
    copia y (b) sedes existentes cuyo conteo de equipos cambió. No
    modifica nada - solo informa, para que el usuario decida qué
    actualizar puntualmente (ver actualizar_una_sede_fracttal).

    Son ~515 llamadas livianas (una por sede existente) - toma unos
    minutos, por eso reporta progreso como los demás bots de larga
    duración.
    """
    if not os.path.exists(_RUTA_CACHE_ACTIVOS_FRACTTAL):
        log("Todavía no hay copia local — usa 'Actualizar ahora' (completo) primero.")
        return None

    with open(_RUTA_CACHE_ACTIVOS_FRACTTAL, "r", encoding="utf-8") as f:
        cache_actual = json.load(f)
    sedes_locales = {s["id_location"]: s for s in cache_actual["sedes"]}

    session = _iniciar_sesion_fracttal()
    if not session:
        log("No se pudo iniciar sesión en Fracttal.")
        return None

    log("Revisando si hay sedes nuevas...")
    sedes_vivas, error = _listar_todas_las_sedes_fracttal(session)
    if error:
        log(f"Error revisando sedes: {error}")
        return None

    ids_vivos = {s.get("id_item") for s in sedes_vivas}
    sedes_nuevas = [
        {"id_location": s.get("id_item"), "code": s.get("code", ""), "description": s.get("description", "")}
        for s in sedes_vivas if s.get("id_item") not in sedes_locales
    ]
    if sedes_nuevas:
        log(f"{len(sedes_nuevas)} sede(s) nueva(s) detectada(s).")

    log("Revisando cambios en las sedes ya conocidas...")
    ids_existentes = list(sedes_locales.keys())
    total = len(ids_existentes)
    sedes_con_cambios = []
    for i, id_location in enumerate(ids_existentes):
        if id_location not in ids_vivos:
            # La sede ya no existe en Fracttal (se desactivó/eliminó) - se
            # marca como "con cambios" para que el usuario decida qué hacer,
            # no se borra sola.
            sedes_con_cambios.append(id_location)
        else:
            total_vivo, _err = _contar_equipos_sede_fracttal(id_location, session)
            if total_vivo is not None and total_vivo != len(sedes_locales[id_location]["equipos"]):
                sedes_con_cambios.append(id_location)
        progreso(int((i + 1) / total * 100))
        if (i + 1) % 50 == 0 or (i + 1) == total:
            log(f"{i + 1}/{total} sedes revisadas...")

    log(f"Revisión terminada: {len(sedes_nuevas)} nueva(s), {len(sedes_con_cambios)} con cambios.")
    print(json.dumps({
        "type": "resultado_revision",
        "sedes_nuevas": sedes_nuevas,
        "sedes_con_cambios": sedes_con_cambios,
    }, ensure_ascii=False), flush=True)
    return {"sedes_nuevas": sedes_nuevas, "sedes_con_cambios": sedes_con_cambios}


def actualizar_una_sede_fracttal(id_location):
    """
    Actualiza (o agrega, si es nueva) UNA sola sede en la copia local +
    su fila de respaldo en Supabase — usado cuando el usuario hace clic
    en una alerta puntual, para no tener que reconstruir las 515 sedes
    por un cambio en una sola. Devuelve el dict de la sede actualizada.
    """
    session = _iniciar_sesion_fracttal()
    if not session:
        return None, "No se pudo iniciar sesión en Fracttal."

    resultados, error = _rpc_fracttal(session, "inventories.items_list", {
        "filter": [{"operator": "=", "property": "id_item", "value": id_location}],
        "id_type_item": 0, "id_type_item_not": "4",
        "is_tree": False, "node": None,
        "only_activated_items": True,
        "page": 1, "limit": 1, "start": 0,
        "sort": [{"property": "id_item", "direction": "asc"}],
    })
    resultados = resultados or []
    if not resultados:
        return None, "Esa sede ya no existe en Fracttal."
    meta = resultados[0]

    equipos, err_equipos = listar_equipos_ubicacion_fracttal(id_location, session=session)
    sede = {
        "id_location": id_location,
        "code": meta.get("code", ""),
        "description": meta.get("description", ""),
        "equipos": equipos,
    }

    with open(_RUTA_CACHE_ACTIVOS_FRACTTAL, "r", encoding="utf-8") as f:
        cache_actual = json.load(f)
    sedes = [s for s in cache_actual["sedes"] if s["id_location"] != id_location]
    sedes.append(sede)
    cache_actual["sedes"] = sedes
    cache_actual["actualizado_el"] = datetime.now(timezone.utc).isoformat()
    with open(_RUTA_CACHE_ACTIVOS_FRACTTAL, "w", encoding="utf-8") as f:
        json.dump(cache_actual, f, ensure_ascii=False)

    _guardar_base_activos_supabase([sede])
    return sede, None


def obtener_override_activo_fracttal(sede):
    """Lee energia.pme_fracttal_activo_override: si el usuario ya eligió
    a mano el activo de Fracttal para esta sede (ver
    fijar_ubicacion_fracttal_y_reintentar), devuelve ese id_item;
    si no hay override, None."""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept-Profile": "energia",
    }
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/pme_fracttal_activo_override",
            params={"sede": f"eq.{normalizar_sede(sede)}", "select": "id_item"},
            headers=headers, timeout=15
        )
        if r.status_code == 200:
            filas = r.json()
            if filas:
                return filas[0].get('id_item')
    except Exception as e:
        log(f"⚠️ No se pudo consultar el override de activo Fracttal de {sede}: {e}")
    return None


def guardar_override_activo_fracttal(sede, id_item, descripcion=None):
    """Guarda a mano el activo de Fracttal (id_item, el 'Tablero' ya
    resuelto - NO la ubicación) para una sede, para que resolver_activo_
    tablero_sede() lo use directo sin volver a buscar. Se llama desde
    fijar_ubicacion_fracttal_y_reintentar() cuando el usuario elige a
    mano cuál de las ubicaciones ambiguas era la correcta."""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Accept-Profile": "energia",
        "Content-Profile": "energia",
        "Prefer": "resolution=merge-duplicates",
    }
    payload = {"sede": normalizar_sede(sede), "id_item": int(id_item), "descripcion": descripcion}
    try:
        r = requests.post(f"{SUPABASE_URL}/rest/v1/pme_fracttal_activo_override?on_conflict=sede", headers=headers, json=[payload], timeout=15)
        if r.status_code not in (200, 201, 204):
            log(f"⚠️ No se pudo guardar el override de activo Fracttal de {sede}: {r.status_code} {r.text[:200]}")
    except Exception as e:
        log(f"⚠️ No se pudo guardar el override de activo Fracttal de {sede}: {e}")


def fijar_ubicacion_fracttal_y_reintentar(sede, id_location):
    """
    El usuario eligió a mano, entre los candidatos ambiguos que devolvió
    resolver_activo_tablero_sede(), cuál ubicación de Fracttal es la
    correcta para esta sede (botón "Usar esta" del modal). Termina el
    paso que había quedado pendiente (buscar el "Tablero" bajo esa
    ubicación), guarda el resultado como override PERMANENTE para que
    nunca más haga falta elegir a mano, y dispara el reintento de
    creación de inmediato. Devuelve el mismo dict que reintentar_
    solicitud_fracttal (o un fallo si ni siquiera esa ubicación elegida
    tiene un equipo "tablero").
    """
    session = _iniciar_sesion_fracttal()
    if not session:
        return {'exito': False, 'folio': None, 'servicios': [], 'causa': "No se pudo iniciar sesión en Fracttal.", 'solucion': "Revisar fracttal_user/fracttal_pass/fracttal_id_company en config_bot_pme_spsa.json, o si Fracttal está caído."}

    id_item, causa, solucion = _resolver_tablero_bajo_ubicacion(session, sede, id_location)
    if not id_item:
        return {'exito': False, 'folio': None, 'servicios': [], 'causa': causa, 'solucion': solucion}

    guardar_override_activo_fracttal(sede, id_item)
    _CACHE_ACTIVO_TABLERO_SEDE.pop(sede, None)
    return reintentar_solicitud_fracttal(sede)


def crear_solicitud_fracttal(descripcion, id_item, session=None, fecha_incidente=None,
                              solicitado_por='', email_solicitado_por='', creada_por=None):
    """
    Crea una Solicitud de Servicio en Fracttal contra un activo puntual
    (id_item resuelto por resolver_activo_tablero_sede, o elegido a mano
    via buscar_activos_fracttal). Fracttal resuelve solo, a partir del
    activo, el centro de costo y la jerarquia/grupo de la solicitud - no
    hace falta enviarlos.

    session: reutilizar una sesion ya autenticada (ver sincronizar_
    solicitudes_fracttal). Si no se pasa, hace login por su cuenta.

    fecha_incidente: datetime tz-aware opcional con la fecha REAL del
    incidente (flujo manual de Itlus Fractal). Si no se pasa, se comporta
    igual que siempre: la simula como "ahora - 10s" (ver comentario abajo)
    porque el flujo automatico de PME no conoce una fecha real distinta a
    "ahora". Si se pasa una fecha real (tipicamente en el pasado), se usa
    tal cual - ya cumple sola la regla de Fracttal de que el incidente no
    puede ser posterior a la fecha de creacion.

    solicitado_por / email_solicitado_por: quien pide la solicitud (flujo
    automatico los deja vacios, como siempre).

    creada_por: texto para la columna 'creada_por' del registro espejo en
    Supabase (st_fracttal). Default 'Bot PME (Automático)' si no se pasa,
    igual que siempre.

    No relanza excepciones: un fallo aca (Fracttal caido, sesion vencida,
    activo invalido) no debe tumbar la corrida que la dispara, solo emite
    alerta_sistema(). Devuelve (folio, causa, solucion): folio con
    causa/solucion en None si se creó bien, o None con causa/solucion si
    falló - para guardarse en el historial correspondiente.
    """
    if not id_item:
        return None, "No se indicó un activo de Fracttal.", "Revisar la resolución automática del activo para esta sede."
    try:
        id_item_num = int(id_item)
    except (TypeError, ValueError):
        motivo = f"El id de activo '{id_item}' no es numérico."
        alerta_sistema(f"Fracttal: {motivo} No se creó la solicitud.")
        return None, motivo, "Revisar la resolución automática del activo para esta sede."

    session = session or _iniciar_sesion_fracttal()
    if not session:
        motivo = "No se pudo iniciar sesión en Fracttal."
        alerta_sistema(f"Fracttal: {motivo}")
        return None, motivo, "Revisar fracttal_user/fracttal_pass/fracttal_id_company en config_bot_pme_spsa.json, o si Fracttal está caído."

    momento = datetime.now(timezone.utc)
    ahora = momento.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    if fecha_incidente is not None:
        # Fecha real elegida a mano (Itlus Fractal).
        # Salvaguarda: si la fecha indicada es futura o muy cercana a 'ahora' (desfase de reloj con Fracttal),
        # se ajusta a (momento - 15s) para garantizar que Fracttal nunca rechace con
        # "DATE INCIDENT is greater than the creation date".
        limite_seguro = momento - timedelta(seconds=15)
        if fecha_incidente > limite_seguro:
            fecha_incidente = limite_seguro
        fecha_incidente_str = fecha_incidente.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    else:
        # date_incident un poco ANTES que date/date_status (no el mismo
        # instante): Fracttal calcula su propio "date" (fecha de creacion) del
        # lado del servidor al procesar el insert, siempre un poco despues de
        # cuando armamos este payload - si se manda exactamente el mismo
        # instante para date_incident, cualquier minimo desfase de reloj puede
        # hacer que el servidor lo vea "mayor" que su propia fecha de creacion
        # y rechace la solicitud (visto en produccion: "DATE INCIDENT is
        # greater than the creation date"). 10s de margen es mas que suficiente.
        fecha_incidente_str = (momento - timedelta(seconds=10)).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    nuevo_id = str(uuid.uuid4())
    params = {
        "id": nuevo_id, "id_code": None, "id_work_order": 0, "wo_folio": "",
        "status_description": "", "description": descripcion, "is_urgent": False,
        "id_item": id_item_num, "items_description": "", "code_item": "",
        "parent_description": "", "date": ahora, "date_incident": fecha_incidente_str,
        "date_maintenance": ahora, "date_solution": ahora, "date_status": ahora,
        "observation": "", "requests_x_status_notes": "", "id_cost_center": None,
        "costs_center_description": "", "id_type": FRACTTAL_ID_TYPE_DEFAULT,
        "types_description": "", "id_type_1": FRACTTAL_ID_TYPE_1_DEFAULT,
        "types_1_description": "", "id_type_2": FRACTTAL_ID_TYPE_2_DEFAULT,
        "types_2_description": "", "priorities_description": "", "rating": "",
        "rating_notes": "", "id_user": "", "accounts_name": "", "requested_by": solicitado_por or "",
        "email_requested_by": email_solicitado_por or "", "requests_x_status_accounts_name": "",
        "requests_x_key_words_id_key_words": None, "requests_x_key_words_descriptions": None,
        "id_status": 0, "geolocation": None, "attachments": None, "id_group": None,
        "groups_description": "", "groups_1_description": "", "id_group_1": None,
        "id_group_2": None, "groups_2_description": "", "identifier": "",
        "id_work_order_task_related": None, "id_related": "", "idInternal": nuevo_id,
    }
    resultado, error_rpc = _rpc_fracttal(session, "requests.requests_insert", params)
    if resultado:
        folio = resultado.get('id_code')
        # El resultado de requests_insert devuelve el registro completo creado;
        # 'id' es el UUID interno que usa Fracttal (no el folio visible). Sin
        # embargo, para cancelar necesitamos el id_code numérico (folio) —
        # confirmado en el curl de cancelación: id_request = 268451 = id_code.
        id_request_interno = resultado.get('id_request') or resultado.get('id_code')
        log(f"✅ Fracttal: solicitud creada (folio {folio}, id_request {id_request_interno}) para el activo {id_item_num}.")

        # --- Auto-sincronización con Supabase (st_fracttal) para el Dashboard UI ---
        # Guarda el id_request para poder cancelarla directamente desde el
        # aplicativo sin tener que hacer un lookup en Fracttal en el momento.
        try:
            st_data = {
                'nro_solicitud':    str(folio),
                'id_request':       int(id_request_interno) if id_request_interno else None,
                'descripcion':      descripcion,
                'estado':           'Abierta',
                'fecha_de_creacion': datetime.now(timezone.utc).isoformat(),
                'creada_por':       creada_por or 'Bot PME (Automático)',
            }
            headers_supa = {
                "apikey":           SUPABASE_KEY,
                "Authorization":    f"Bearer {SUPABASE_KEY}",
                "Content-Type":     "application/json",
                "Prefer":           "resolution=merge-duplicates",
            }
            r_supa = requests.post(
                f"{SUPABASE_URL}/rest/v1/st_fracttal?on_conflict=nro_solicitud",
                headers=headers_supa, json=[st_data], timeout=15
            )
            if r_supa.status_code not in (200, 201, 204):
                log(f"⚠️ Supabase rechazó el insert de ST {folio}: {r_supa.status_code} {r_supa.text[:200]}")
        except Exception as e:
            log(f"⚠️ Error insertando ST {folio} en st_fracttal (Supabase): {e}")

        return folio, None, None

    motivo = error_rpc or "Fracttal rechazó la creación de la solicitud."
    alerta_sistema(f"Fracttal rechazó la creación de la solicitud para el activo {id_item_num}: {motivo}")
    return None, motivo, "Revisar el mensaje de Fracttal: puede ser un campo inválido, el activo fuera de servicio, o falta de permisos del usuario configurado."


def enviar_email(asunto, cuerpo, destinatarios=None, copia=None, nombre_remitente=None, adjunto_bytes=None, adjunto_nombre=None, adjuntos=None):
    """
    destinatarios/copia: string con uno o varios correos separados por coma.
    Si no se pasan (o vienen vacios), se usa el destinatario/copia por
    defecto guardado en las credenciales compartidas de PME.
    nombre_remitente: nombre visible del remitente (ej. "Alertas HVAC PME"),
    para que cada especialidad se identifique aunque compartan la misma
    cuenta de Gmail.
    adjunto_bytes/adjunto_nombre: forma simple, un solo adjunto (retrocompatible).
    adjuntos: lista de tuplas (nombre_archivo, bytes, tipo) para varios
    adjuntos (ej. grafico PNG + Excel). tipo es 'xlsx' o 'png'.
    """
    creds = cargar_credenciales()
    remitente = creds.get('gmail_remitente', '')
    app_password = creds.get('gmail_app_password', '')
    destinatario = destinatarios if destinatarios else creds.get('email_destinatario', '')
    copia_raw = copia if copia else creds.get('email_copia', '')

    if not remitente or not app_password or not destinatario:
        log("ℹ️ Alerta detectada pero el correo no está configurado (falta remitente/app_password/destinatario).")
        return False

    destinatarios_to = [d.strip() for d in destinatario.split(',') if d.strip()]
    destinatarios_cc = [d.strip() for d in copia_raw.split(',') if d.strip()]

    lista_adjuntos = list(adjuntos) if adjuntos else []
    if adjunto_bytes:
        lista_adjuntos.append((adjunto_nombre or 'detalle.xlsx', adjunto_bytes, 'xlsx'))

    try:
        import smtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText
        from email.mime.application import MIMEApplication
        from email.mime.image import MIMEImage
        from email.utils import formataddr
        from email.header import Header

        if lista_adjuntos:
            msg = MIMEMultipart()
            msg.attach(MIMEText(cuerpo, 'plain', 'utf-8'))
            for nombre, datos, tipo in lista_adjuntos:
                if tipo == 'png':
                    parte = MIMEImage(datos, name=nombre)
                else:
                    parte = MIMEApplication(datos, Name=nombre)
                parte['Content-Disposition'] = f'attachment; filename="{nombre}"'
                msg.attach(parte)
        else:
            msg = MIMEText(cuerpo, 'plain', 'utf-8')

        msg['Subject'] = str(Header(asunto, 'utf-8'))
        msg['From'] = formataddr((str(Header(nombre_remitente, 'utf-8')), remitente)) if nombre_remitente else remitente
        msg['To'] = ', '.join(destinatarios_to)
        if destinatarios_cc:
            msg['Cc'] = ', '.join(destinatarios_cc)

        todos_los_destinatarios = destinatarios_to + destinatarios_cc

        with smtplib.SMTP('smtp.gmail.com', 587, timeout=15) as server:
            server.starttls()
            server.login(remitente, app_password)
            server.sendmail(remitente, todos_los_destinatarios, msg.as_string())
        return True
    except Exception as e:
        log(f"⚠️ Error enviando alerta por correo: {e}")
        return False


def diagnosticar_error(tipo_error, mensaje_error):
    """
    Devuelve (causa_raiz, solucion) segun reglas predefinidas para los
    errores mas comunes de los bots (login, timeouts, cambios de portal,
    problemas de red/Supabase/permisos). Si el error no coincide con
    ninguna regla conocida, devuelve una causa/solucion generica pidiendo
    revisar el detalle tecnico completo del correo.
    """
    msg = (mensaje_error or '').lower()
    tipo = (tipo_error or '').lower().replace('_', '')

    reglas = [
        (lambda: 'timeout' in msg or 'timed out' in msg or tipo == 'timeouterror',
         "El sitio/portal tardó demasiado en responder (timeout de red o servidor lento/caído).",
         "Verifica que el portal esté accesible manualmente desde esta PC y que la conexión a internet esté estable. Si el portal está caído, reintenta más tarde."),

        (lambda: any(p in msg for p in ['usuario', 'contraseña', 'login', 'credencial', 'unauthorized', '401']),
         "Fallo de autenticación: el usuario/contraseña configurados fueron rechazados, o la sesión expiró.",
         "Revisa las credenciales en el botón 'Configuración' de este bot. Si son correctas, la cuenta podría estar bloqueada o requerir cambio de contraseña en el portal."),

        (lambda: 'nosuchelement' in tipo or 'no such element' in msg or 'elemento no encontrado' in msg,
         "El portal cambió su diseño/estructura y el bot ya no encuentra un elemento que antes existía en la página.",
         "Es necesario revisar y actualizar el script (selectores) para que coincida con el nuevo diseño del portal. Reporta este error al responsable técnico del bot."),

        (lambda: 'staleelement' in tipo,
         "La página se recargó o cambió justo mientras el bot interactuaba con ella (problema de timing).",
         "Suele ser pasajero. Reintenta la ejecución manualmente; si vuelve a ocurrir seguido, repórtalo al responsable técnico."),

        (lambda: 'supabase' in msg or 'postgrest' in msg or 'rest/v1' in msg,
         "Error al leer/escribir datos en Supabase: puede ser una URL/API key inválida, una tabla o columna que no coincide, o el servicio caído.",
         "Revisa que la URL y la API key de Supabase configuradas sean correctas. Si el error menciona una columna o tabla específica, puede requerir un ajuste en el script."),

        (lambda: any(p in msg for p in ['permission', 'acceso denegado', 'denied', 'winerror 5']),
         "Permisos insuficientes: no se pudo escribir en una carpeta (por ejemplo, la ruta de Google Drive) o acceder a un recurso protegido.",
         "Verifica que la ruta configurada (ej. carpeta de Google Drive) exista y que esta PC tenga permisos de escritura sobre ella."),

        (lambda: 'filenotfounderror' in tipo or 'no such file' in msg or 'no existe' in msg,
         "El bot intentó acceder a un archivo o carpeta que no existe en esta PC.",
         "Verifica que la ruta configurada (ej. carpeta de Google Drive) exista y esté escrita correctamente en 'Configuración'."),

        (lambda: 'connectionerror' in tipo or 'connection' in msg or 'network' in msg or 'dns' in msg,
         "Problema de conexión de red hacia el portal o hacia Supabase.",
         "Verifica que esta PC tenga conexión a internet estable y que no haya un firewall/VPN bloqueando el acceso."),
    ]

    for condicion, causa, solucion in reglas:
        try:
            if condicion():
                return causa, solucion
        except Exception:
            continue

    return (
        f"Error no reconocido por las reglas automáticas ({tipo_error}: {mensaje_error}).",
        "Revisa el detalle técnico completo más abajo en este correo. Si la causa no es evidente, repórtalo al responsable técnico del bot junto con este mensaje."
    )


def registrar_inicio_activacion(bot_id, bot_nombre, familia, origen, modo_ejecucion,
                                 master_run_id=None, autopilot_modo=None,
                                 autopilot_intervalo_val=None, autopilot_intervalo_uni=None):
    """
    Inserta una fila en public.bot_activaciones al arrancar una corrida (tabla
    de seguimiento cruzada a TODOS los bots, no solo PME). Devuelve el id de
    la fila creada (para poder cerrarla despues con registrar_fin_activacion),
    o None si fallo. Nunca debe interrumpir al bot si Supabase no responde.
    """
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    payload = {
        "bot_id": bot_id,
        "bot_nombre": bot_nombre,
        "familia": familia,
        "origen": origen,
        "modo_ejecucion": modo_ejecucion,
        "master_run_id": master_run_id,
        "hora_inicio": datetime.now(timezone.utc).isoformat(),
        "estado": "en_curso",
        "autopilot_modo": autopilot_modo,
        "autopilot_intervalo_val": autopilot_intervalo_val,
        "autopilot_intervalo_uni": autopilot_intervalo_uni,
    }
    try:
        r = requests.post(f"{SUPABASE_URL}/rest/v1/bot_activaciones", headers=headers, json=payload, timeout=10)
        if r.status_code in (200, 201):
            data = r.json()
            if data:
                return data[0].get("id")
        else:
            log(f"⚠️ No se pudo registrar inicio de activación (HTTP {r.status_code}): {r.text[:200]}")
    except Exception as e:
        log(f"⚠️ No se pudo registrar inicio de activación: {e}")
    return None


def registrar_fin_activacion(activacion_id, estado, codigo_salida=None, duracion_seg=None,
                              fecha_datos_desde=None, fecha_datos_hasta=None,
                              registros_procesados=None, tipo_escritura=None,
                              tabla_destino=None, exc=None, ram_mb_pico=None):
    """
    Actualiza la fila creada por registrar_inicio_activacion() al terminar la
    corrida ('exito' | 'fallo' | 'detenido_manual'). Si exc no es None, llena
    los campos de error usando diagnosticar_error() (mismo motor que las
    alertas por correo).
    """
    if not activacion_id:
        return False

    payload = {
        "hora_fin": datetime.now(timezone.utc).isoformat(),
        "estado": estado,
        "codigo_salida": codigo_salida,
        "duracion_seg": duracion_seg,
        "fecha_datos_desde": fecha_datos_desde,
        "fecha_datos_hasta": fecha_datos_hasta,
        "registros_procesados": registros_procesados,
        "tipo_escritura": tipo_escritura,
        "tabla_destino": tabla_destino,
        "ram_mb_pico": ram_mb_pico,
    }

    if exc is not None:
        import traceback as _tb
        tipo_error = type(exc).__name__
        mensaje_error = str(exc)
        causa, solucion = diagnosticar_error(tipo_error, mensaje_error)
        payload["error_tipo"] = tipo_error
        payload["error_mensaje"] = mensaje_error
        payload["error_causa_raiz"] = causa
        payload["error_solucion"] = solucion
        payload["error_traceback"] = _tb.format_exc()

    payload = {k: v for k, v in payload.items() if v is not None}

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    try:
        r = requests.patch(
            f"{SUPABASE_URL}/rest/v1/bot_activaciones",
            headers=headers,
            params={"id": f"eq.{activacion_id}"},
            json=payload,
            timeout=10
        )
        if r.status_code not in (200, 204):
            log(f"⚠️ No se pudo registrar fin de activación (HTTP {r.status_code}): {r.text[:200]}")
            return False
        return True
    except Exception as e:
        log(f"⚠️ No se pudo registrar fin de activación: {e}")
        return False


def medir_ram_actual_mb():
    """
    RAM (RSS) del proceso actual en MB. Devuelve None si psutil no esta
    disponible en vez de lanzar una excepcion.
    """
    try:
        import psutil
        return round(psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024), 1)
    except Exception:
        return None


def enviar_alerta_fallo_bot(nombre_bot, exc, contexto_extra=None):
    """
    Envia un correo de alerta cuando un bot falla, con causa raiz y
    solucion sugerida (reglas predefinidas) + el traceback completo.
    nombre_bot: nombre legible del bot, ej. "Bot ST MSP".
    exc: la excepcion capturada (objeto Exception).
    contexto_extra: texto opcional con info adicional (ej. en que paso fallo).
    """
    import traceback as _tb
    tipo_error = type(exc).__name__
    mensaje_error = str(exc)
    causa, solucion = diagnosticar_error(tipo_error, mensaje_error)
    traza = _tb.format_exc()
    ahora = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    cuerpo = (
        f"El bot \"{nombre_bot}\" falló durante su ejecución.\n\n"
        f"Fecha/hora   : {ahora}\n"
        f"Tipo de error: {tipo_error}\n"
        f"Mensaje      : {mensaje_error}\n"
    )
    if contexto_extra:
        cuerpo += f"Contexto     : {contexto_extra}\n"
    cuerpo += (
        f"\n── CAUSA RAÍZ ──\n{causa}\n"
        f"\n── SOLUCIÓN SUGERIDA ──\n{solucion}\n"
        f"\n── DETALLE TÉCNICO COMPLETO (traceback) ──\n{traza}\n"
    )

    try:
        return enviar_email(
            asunto=f"⚠️ Fallo en {nombre_bot} — {tipo_error}",
            cuerpo=cuerpo,
            nombre_remitente=f"Alertas {nombre_bot}"
        )
    except Exception as e:
        log(f"⚠️ No se pudo enviar la alerta de fallo de {nombre_bot}: {e}")
        return False


def enviar_telegram_documento(datos_bytes, nombre_archivo, caption=None, mime_type=None):
    token, chat_id = cargar_config_telegram()
    if not token or not chat_id:
        return False
    if mime_type is None:
        mime_type = (
            "application/pdf" if nombre_archivo.lower().endswith('.pdf')
            else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendDocument",
            data={"chat_id": chat_id, "caption": (caption or "")[:1024]},
            files={"document": (nombre_archivo, datos_bytes, mime_type)},
            timeout=30
        )
        if r.status_code != 200:
            log(f"⚠️ Error enviando documento a Telegram: {r.status_code} {r.text[:200]}")
            return False
        return True
    except Exception as e:
        log(f"⚠️ Error enviando documento a Telegram: {e}")
        return False


def _estilo_encabezado_excel(celda, color_fondo="E2E8F0"):
    """Encabezado de hoja de Excel: negrita en negro sobre fondo CLARO.
    Excel no es una interfaz oscura como el dashboard: un fondo oscuro con
    texto sin color explicito (que openpyxl/Excel pintan negro por
    defecto) queda ilegible. color_fondo por sheet: gris-azulado neutro
    para tablas generales, verde claro para "buenas practicas", rojo claro
    para alertas/desconectados, naranja claro para el plan de accion."""
    from openpyxl.styles import Font, PatternFill
    celda.font = Font(bold=True, color="000000")
    celda.fill = PatternFill(start_color=color_fondo, end_color=color_fondo, fill_type="solid")


def generar_excel_consumo(servicio, sede, fecha, puntos, hora_inicio, hora_fin, linea_base_kwh, precio_kwh, total_kwh, costo):
    """Genera en memoria un .xlsx con el detalle hora por hora del consumo
    fuera de horario de una sede/fecha, mas el resumen de costo."""
    import io
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    wb = Workbook()
    ws = wb.active
    ws.title = "Detalle"

    ws.append(["Servicio", servicio])
    ws.append(["Sede", sede])
    ws.append(["Fecha", fecha])
    ws.append(["Rango vigilado", f"{hora_inicio} a {hora_fin}"])
    ws.append(["Línea base (kWh)", linea_base_kwh])
    ws.append(["Precio por kWh (S/)", precio_kwh])
    ws.append(["Consumo total en el rango (kWh)", total_kwh])
    ws.append(["Costo estimado (S/)", costo])
    ws.append([])

    ws.append(["Hora", "Consumo (kWh)"])
    fila_encabezado = ws.max_row
    for celda in ws[fila_encabezado]:
        _estilo_encabezado_excel(celda)

    valor_pico = max(v for _, v in puntos) if puntos else None
    for hora, valor in puntos:
        ws.append([hora, valor])
        if valor == valor_pico:
            for celda in ws[ws.max_row]:
                celda.font = Font(bold=True, color="c0392b")

    ws.column_dimensions['A'].width = 22
    ws.column_dimensions['B'].width = 20

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def _hora_a_minutos(hora_str):
    h, m = hora_str.split(':')[:2]
    return int(h) * 60 + int(m)


def _en_rango_horario(hora_str, hora_inicio, hora_fin):
    """Compara horas en formato 'HH:MM' o 'HH:MM:SS'. Soporta rangos que
    cruzan medianoche (ej. 23:00 a 06:00)."""
    t = _hora_a_minutos(hora_str)
    ini = _hora_a_minutos(hora_inicio)
    fin = _hora_a_minutos(hora_fin)
    if ini <= fin:
        return ini <= t < fin
    return t >= ini or t < fin  # rango cruza medianoche


def detectar_consumos_fuera_horario(filas, hora_inicio, hora_fin, linea_base_kwh):
    """
    Recorre las filas ya extraidas de una sede (cada una con 'fecha', 'hora',
    'valor') y agrupa por fecha todos los puntos que caen dentro del rango
    horario configurado. Si el maximo de esos puntos supera la linea base,
    se marca esa fecha como alerta y se devuelve tambien el consumo total del
    rango completo (para calcular costo) y el detalle punto por punto (para
    el Excel adjunto):
    {fecha: {'hora_pico', 'valor_pico', 'total_kwh', 'puntos': [(hora, valor), ...]}}
    """
    en_ventana = {}
    for f in filas:
        if not _en_rango_horario(f['hora'], hora_inicio, hora_fin):
            continue
        en_ventana.setdefault(f['fecha'], []).append((f['hora'], f['valor']))

    resultados = {}
    for fecha, puntos in en_ventana.items():
        # Orden cronologico real (si el rango cruza medianoche, ej. 23:00-06:00,
        # un sort de texto pondria "00:00" antes que "23:00" -> se reordena
        # sumando 24h a las horas que caen en el tramo posterior a medianoche).
        ini_min = _hora_a_minutos(hora_inicio)
        fin_min = _hora_a_minutos(hora_fin)
        cruza_medianoche = ini_min > fin_min

        def _clave_orden(punto, ini=ini_min, cruza=cruza_medianoche):
            t = _hora_a_minutos(punto[0])
            if cruza and t < ini:
                return t + 1440
            return t

        puntos.sort(key=_clave_orden)
        valor_pico = max(v for _, v in puntos)
        if valor_pico <= linea_base_kwh:
            continue
        hora_pico = next(h for h, v in puntos if v == valor_pico)
        resultados[fecha] = {
            'hora_pico': hora_pico,
            'valor_pico': valor_pico,
            'total_kwh': round(sum(v for _, v in puntos), 4),
            'puntos': puntos,
        }
    return resultados


def calcular_consumo_periodo_fuera_horario(filas, hora_inicio, hora_fin):
    """
    Suma TODO el consumo dentro del rango horario a lo largo de todo el
    periodo descargado (sin filtrar por linea base), para el analisis de
    impacto/costo por sede. A diferencia de detectar_consumos_fuera_horario
    (que es por dia y solo cuenta si supera la linea base), esto da el total
    real gastado fuera de horario en todo el rango de dias analizado.
    """
    total = 0.0
    fechas = set()
    for f in filas:
        if _en_rango_horario(f['hora'], hora_inicio, hora_fin):
            total += f['valor']
            fechas.add(f['fecha'])
    return {'total_kwh': round(total, 4), 'dias_con_datos': len(fechas)}


def calcular_consumo_punta_fuera_punta(filas, hora_punta_inicio, hora_punta_fin):
    """
    Para cada sede, suma su consumo dentro del bloque "hora punta" (ej.
    18:00 a 23:00) vs el resto del dia ("fuera de punta"), a lo largo de
    todo el periodo descargado. Clasifica la sede como "cliente en hora
    punta" si consume mas en ese bloque que en el resto, o "fuera de
    punta" en caso contrario -mismo criterio que usa un cliente industrial
    para saber en que tramo tarifario cae su consumo real.

    Devuelve una lista de dicts, una por sede con datos:
    {sede, kwh_punta, kwh_fuera_punta, es_cliente_punta}.
    """
    por_sede = {}
    for f in filas:
        sede = f['sede']
        if sede not in por_sede:
            por_sede[sede] = {'kwh_punta': 0.0, 'kwh_fuera_punta': 0.0}
        if _en_rango_horario(f['hora'], hora_punta_inicio, hora_punta_fin):
            por_sede[sede]['kwh_punta'] += f['valor']
        else:
            por_sede[sede]['kwh_fuera_punta'] += f['valor']

    resultado = []
    for sede, datos in por_sede.items():
        kwh_punta = round(datos['kwh_punta'], 4)
        kwh_fuera = round(datos['kwh_fuera_punta'], 4)
        if kwh_punta == 0 and kwh_fuera == 0:
            continue
        resultado.append({
            'sede': sede,
            'kwh_punta': kwh_punta,
            'kwh_fuera_punta': kwh_fuera,
            'es_cliente_punta': kwh_punta > kwh_fuera,
        })
    resultado.sort(key=lambda s: s['kwh_punta'] + s['kwh_fuera_punta'], reverse=True)
    return resultado


PLANTILLA_ALERTA_CONSUMO_DEFAULT = (
    "🔥 CONSUMO FUERA DE HORARIO [{servicio}]\n"
    "Sede: {sede}\n"
    "Fecha: {fecha}  Hora pico: {hora}\n"
    "Consumo pico: {valor} kWh (línea base: {linea_base} kWh)\n"
    "Consumo total en el rango: {total_kwh} kWh\n"
    "Costo estimado: S/ {costo} (S/ {precio_kwh} por kWh)\n"
    "Rango vigilado: {hora_inicio} a {hora_fin}\n"
    "(Detalle hora por hora adjunto en Excel)"
)

ASUNTO_ALERTA_CONSUMO_DEFAULT = "Alerta Consumo fuera de horario - {servicio}"
NOMBRE_REMITENTE_ALERTA_DEFAULT = "Alertas {servicio} PME"

DESCRIPCION_SOLICITUD_SERVICIO_DEFAULT = (
    "Se requiere revisar y configurar el encendido de los equipos de {servicio} ya que existe "
    "operación fuera del horario de consumo. En caso de no existir un sistema de control de "
    "encendidos, se solicita cotizarlo."
)

DESCRIPCION_MEDIDOR_DESCONECTADO_DEFAULT = (
    "Se requiere revisar el medidor de energía {medidor_nombre} ya que no está enviando datos "
    "desde {ultima_fecha_con_datos}. Verificar conexión/comunicación del equipo; podría requerir "
    "mantenimiento o reemplazo."
)


class _DiccionarioSeguro(dict):
    """Si la plantilla tiene un {campo} que no existe, lo deja tal cual en
    vez de lanzar KeyError (para no romper el envio por un typo en el texto)."""
    def __missing__(self, clave):
        return '{' + clave + '}'


def formatear_plantilla(plantilla, **valores):
    return plantilla.format_map(_DiccionarioSeguro(**valores))


def _dpi_seguro_telegram(ancho_in, alto_in, dpi_deseado=300, limite_suma_px=9000):
    """
    Telegram rechaza sendPhoto cuando (ancho_px + alto_px) supera 10000 (o el
    ratio ancho/alto supera 20). Con muchas sedes la figura crece bastante de
    alto, y a dpi fijo se puede pasar de ese limite sin que el codigo tire
    ningun error (Telegram simplemente no entrega la foto). Este helper baja
    el dpi lo justo para respetar el limite (con margen de seguridad),
    priorizando el maximo de nitidez posible sin arriesgar el envio.
    """
    import math
    dpi_max_por_limite = math.floor(limite_suma_px / (ancho_in + alto_in))
    return max(72, min(dpi_deseado, dpi_max_por_limite))


def _fig_grafico_consumo(servicio, sedes, dias_historico, hora_inicio, hora_fin, umbral_critico_dia=0, dpi=300):
    """Construye (sin guardar ni cerrar) la figura de barras horizontal con
    TODAS las sedes con consumo fuera de horario, ordenadas de mayor a menor
    kWh/dia. Las que superan el umbral critico configurado (S//dia) se
    resaltan en rojo; el resto en azul. Reutilizada tanto por la version PNG
    (para Telegram/correo) como por la pagina equivalente del PDF."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    sedes_ordenadas = sorted(sedes, key=lambda s: s['total_kwh'] / dias_historico, reverse=True)
    nombres = [s['sede'] for s in sedes_ordenadas][::-1]
    kwh_dia = [round(s['total_kwh'] / dias_historico, 2) for s in sedes_ordenadas][::-1]
    costo_dia = [round(s['costo'] / dias_historico, 2) for s in sedes_ordenadas][::-1]
    colores = ['#ef4444' if (umbral_critico_dia and c >= umbral_critico_dia) else '#3b82f6' for c in costo_dia]

    alto = max(4.5, 0.4 * len(nombres) + 1.8)
    fig, ax = plt.subplots(figsize=(14, alto), dpi=dpi, facecolor='#0f172a')
    ax.set_facecolor('#0f172a')

    barras = ax.barh(nombres, kwh_dia, color=colores, height=0.62)

    ax.set_title(
        f"{servicio} - Consumo Fuera de Horario ({hora_inicio} a {hora_fin}) — últimos {dias_historico} días",
        color='#fff', fontsize=18, fontweight='bold', pad=36
    )
    ax.set_xlabel('kWh / día', color='#cbd5e1', fontsize=14)
    ax.tick_params(colors='#cbd5e1', labelsize=13)
    for spine in ax.spines.values():
        spine.set_color('#334155')
    ax.grid(axis='x', color='#334155', linestyle='--', alpha=0.5)

    max_val = max(kwh_dia) if kwh_dia else 1
    for barra, kd, cd in zip(barras, kwh_dia, costo_dia):
        es_critica = bool(umbral_critico_dia) and cd >= umbral_critico_dia
        ax.text(
            barra.get_width() + max_val * 0.012, barra.get_y() + barra.get_height() / 2,
            f"{kd} kWh/d · S/ {cd}/d", va='center', ha='left', fontsize=12.5,
            color='#fecaca' if es_critica else '#fff', fontweight='bold' if es_critica else 'normal'
        )

    if umbral_critico_dia:
        ax.axvline(0, color='#334155')  # eje visible
        # Offset en PUNTOS (no en fraccion de eje) para que la leyenda quede
        # siempre pegada al borde del grafico, sin importar cuantas sedes
        # (y por lo tanto cuan alto) tenga la figura.
        ax.annotate(
            "■ Normal", xy=(0.99, 1), xycoords='axes fraction', xytext=(0, 9), textcoords='offset points',
            ha='right', va='bottom', fontsize=13, color='#3b82f6', fontweight='bold'
        )
        ax.annotate(
            f"■ Crítico ≥ S/ {umbral_critico_dia:.0f}/día", xy=(0.76, 1), xycoords='axes fraction',
            xytext=(0, 9), textcoords='offset points', ha='right', va='bottom',
            fontsize=13, color='#ef4444', fontweight='bold'
        )

    plt.tight_layout()
    return fig


def generar_grafico_consumo(servicio, sedes, dias_historico, hora_inicio, hora_fin, umbral_critico_dia=0):
    """
    Version PNG (para Telegram/correo) del grafico de barras por sede.
    El dpi se ajusta automaticamente segun cuantas sedes hay: con muchas
    sedes la imagen crece de alto, y a dpi fijo se puede superar el limite
    de Telegram para sendPhoto (ancho_px + alto_px <= 10000) sin que se note
    ningun error: Telegram simplemente no entrega la foto. Se prioriza el
    maximo dpi posible sin arriesgar el envio.
    """
    import io

    alto = max(4.5, 0.4 * len(sedes) + 1.8)
    dpi = _dpi_seguro_telegram(14, alto)
    fig = _fig_grafico_consumo(servicio, sedes, dias_historico, hora_inicio, hora_fin, umbral_critico_dia, dpi=dpi)
    buffer = io.BytesIO()
    fig.savefig(buffer, format='png', facecolor=fig.get_facecolor())
    import matplotlib.pyplot as plt
    plt.close(fig)
    buffer.seek(0)
    return buffer.getvalue()


def _fig_punta_fuera_punta(servicio, sedes_punta_fuera, hora_punta_inicio, hora_punta_fin, dias_historico=None,
                            fecha_ini_periodo=None, fecha_fin_periodo=None, dpi=300):
    """
    Barra horizontal APILADA por sede: 2 segmentos de color distinto
    (hora punta / fuera de punta), cada uno con su propia etiqueta de
    valor, mas la SUMA total al final de la barra. Clasifica cada sede
    como "cliente en hora punta" o "cliente fuera de punta" segun cual de
    los 2 bloques pesa mas en su consumo total del periodo -exclusivo del
    Bot Consolidado General.
    """
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    sedes_ordenadas = sorted(sedes_punta_fuera, key=lambda s: s['kwh_punta'] + s['kwh_fuera_punta'], reverse=True)
    nombres = [s['sede'] for s in sedes_ordenadas][::-1]
    kwh_punta = [s['kwh_punta'] for s in sedes_ordenadas][::-1]
    kwh_fuera = [s['kwh_fuera_punta'] for s in sedes_ordenadas][::-1]

    COLOR_PUNTA = '#f97316'       # naranja: hora punta
    COLOR_FUERA_PUNTA = '#3b82f6'  # azul: fuera de punta

    alto = max(4.5, 0.42 * len(nombres) + 1.8)
    fig, ax = plt.subplots(figsize=(14, alto), dpi=dpi, facecolor='#0f172a')
    ax.set_facecolor('#0f172a')

    barras_punta = ax.barh(nombres, kwh_punta, color=COLOR_PUNTA, height=0.62, label=f'Hora Punta ({hora_punta_inicio}-{hora_punta_fin})')
    barras_fuera = ax.barh(nombres, kwh_fuera, left=kwh_punta, color=COLOR_FUERA_PUNTA, height=0.62, label='Fuera de Punta')

    fig.suptitle(
        f"{servicio} - Consumo en Hora Punta vs. Fuera de Punta",
        color='#fff', fontsize=17, fontweight='bold', y=0.99
    )
    if fecha_ini_periodo and fecha_fin_periodo:
        dias_txt = f" ({dias_historico} días)" if dias_historico else ""
        periodo_txt = f"Período: {_fmt_fecha_es(fecha_ini_periodo)} al {_fmt_fecha_es(fecha_fin_periodo)}{dias_txt}"
    elif dias_historico:
        periodo_txt = f"Período: últimos {dias_historico} días"
    else:
        periodo_txt = "Período: el período consultado"
    ax.set_title(
        f"{periodo_txt}  ·  Hora punta: {hora_punta_inicio} a {hora_punta_fin}",
        color='#94a3b8', fontsize=12.5, pad=38
    )
    ax.set_xlabel('kWh en el período', color='#cbd5e1', fontsize=14)
    ax.tick_params(colors='#cbd5e1', labelsize=13)
    for spine in ax.spines.values():
        spine.set_color('#334155')
    ax.grid(axis='x', color='#334155', linestyle='--', alpha=0.5)

    totales = [p + f for p, f in zip(kwh_punta, kwh_fuera)]
    max_total = max(totales) if totales else 1
    # Umbral minimo de ancho para poner la etiqueta DENTRO del segmento -en
    # segmentos muy angostos (una sede con casi todo su consumo en el otro
    # bloque) el numero centrado se sale del segmento y choca con el texto
    # de al lado (el otro segmento, o el "Total:"). Por debajo del umbral
    # se omite el numero interno; el "Total:" del final ya muestra el dato.
    umbral_ancho = max_total * 0.045

    for barra, valor in zip(barras_punta, kwh_punta):
        if valor < umbral_ancho:
            continue
        ax.text(
            barra.get_x() + barra.get_width() / 2, barra.get_y() + barra.get_height() / 2,
            f"{valor:,.1f}", va='center', ha='center', fontsize=10.5, color='#fff', fontweight='bold'
        )
    for barra_p, barra_f, valor in zip(barras_punta, barras_fuera, kwh_fuera):
        if valor < umbral_ancho:
            continue
        ax.text(
            barra_f.get_x() + barra_f.get_width() / 2, barra_f.get_y() + barra_f.get_height() / 2,
            f"{valor:,.1f}", va='center', ha='center', fontsize=10.5, color='#fff', fontweight='bold'
        )

    offset_total = max_total * 0.015
    for barra_f, total in zip(barras_fuera, totales):
        if total <= 0:
            continue
        ax.text(
            barra_f.get_x() + barra_f.get_width() + offset_total, barra_f.get_y() + barra_f.get_height() / 2,
            f"Total: {total:,.1f}", va='center', ha='left', fontsize=9.5, color='#e2e8f0', fontweight='bold'
        )
    ax.set_xlim(0, max_total * 1.16)

    legend = ax.legend(
        loc='lower right', bbox_to_anchor=(1, 1.005), ncol=2, frameon=False,
        fontsize=12.5, handletextpad=0.5, columnspacing=1.6
    )
    for texto, color in zip(legend.get_texts(), (COLOR_PUNTA, COLOR_FUERA_PUNTA)):
        texto.set_color(color)
        texto.set_fontweight('bold')

    plt.tight_layout()
    return fig


def generar_grafico_punta_fuera_punta(servicio, sedes_punta_fuera, hora_punta_inicio, hora_punta_fin, dias_historico=None,
                                       fecha_ini_periodo=None, fecha_fin_periodo=None):
    """Version PNG (para Telegram/correo) del grafico de barras apiladas
    hora punta vs fuera de punta."""
    import io

    alto = max(4.5, 0.42 * len(sedes_punta_fuera) + 1.8)
    dpi = _dpi_seguro_telegram(14, alto)
    fig = _fig_punta_fuera_punta(
        servicio, sedes_punta_fuera, hora_punta_inicio, hora_punta_fin, dias_historico=dias_historico,
        fecha_ini_periodo=fecha_ini_periodo, fecha_fin_periodo=fecha_fin_periodo, dpi=dpi
    )
    buffer = io.BytesIO()
    fig.savefig(buffer, format='png', facecolor=fig.get_facecolor())
    import matplotlib.pyplot as plt
    plt.close(fig)
    buffer.seek(0)
    return buffer.getvalue()


def _fig_impacto_economico(servicio, dias_historico, hora_inicio, hora_fin, resumen_total):
    """Construye (sin guardar ni cerrar) la figura-resumen de cuanto dinero
    representa el consumo fuera de horario, ya proyectado a mes y a año si
    el patron observado se mantiene igual. resumen_total: dict con
    costo_dia, kwh_dia, total_kwh, total_costo, proyeccion_mensual,
    proyeccion_anual, sedes_con_consumo, sedes_criticas, umbral_critico_dia."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import FancyBboxPatch

    costo_dia = resumen_total.get('costo_dia', 0)
    kwh_dia = resumen_total.get('kwh_dia', 0)
    total_kwh = resumen_total.get('total_kwh', 0)
    total_costo = resumen_total.get('total_costo', 0)
    proyeccion_mensual = resumen_total.get('proyeccion_mensual', 0)
    proyeccion_anual = resumen_total.get('proyeccion_anual', 0)
    sedes_con_consumo = resumen_total.get('sedes_con_consumo', 0)
    sedes_criticas = resumen_total.get('sedes_criticas', 0)
    umbral_critico_dia = resumen_total.get('umbral_critico_dia', 0)

    fig, ax = plt.subplots(figsize=(13, 7), dpi=300, facecolor='#0f172a')
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis('off')

    ax.text(0.5, 0.96, f"{servicio} — Impacto Económico del Consumo Fuera de Horario",
            ha='center', va='top', fontsize=20, fontweight='bold', color='#fff')
    ax.text(0.5, 0.895,
            f"Rango vigilado {hora_inicio} a {hora_fin}  ·  Período analizado: últimos {dias_historico} días",
            ha='center', va='top', fontsize=13, color='#94a3b8')

    tarjetas = [
        ("FUGA DIARIA", f"S/ {costo_dia:,.2f}", f"{kwh_dia:,.1f} kWh desperdiciados / día", '#3b82f6'),
        ("PROYECCIÓN MENSUAL", f"S/ {proyeccion_mensual:,.2f}", "si el patrón se mantiene igual", '#f59e0b'),
        ("PROYECCIÓN ANUAL", f"S/ {proyeccion_anual:,.2f}", "si el patrón se mantiene igual", '#ef4444'),
    ]

    ancho_tarjeta = 0.27
    espacio = (1 - ancho_tarjeta * 3) / 4
    y0, alto_tarjeta = 0.32, 0.46
    for i, (titulo, valor, sub, color) in enumerate(tarjetas):
        x0 = espacio + i * (ancho_tarjeta + espacio)
        caja = FancyBboxPatch(
            (x0, y0), ancho_tarjeta, alto_tarjeta,
            boxstyle="round,pad=0.012,rounding_size=0.025",
            linewidth=2, edgecolor=color, facecolor='#1e293b'
        )
        ax.add_patch(caja)
        cx = x0 + ancho_tarjeta / 2
        ax.text(cx, y0 + alto_tarjeta - 0.07, titulo, ha='center', va='top',
                fontsize=14, color='#cbd5e1', fontweight='bold')
        ax.text(cx, y0 + alto_tarjeta / 2 + 0.03, valor, ha='center', va='center',
                fontsize=27, color=color, fontweight='bold')
        ax.text(cx, y0 + 0.07, sub, ha='center', va='bottom', fontsize=11, color='#94a3b8')

    pie = (
        f"Acumulado en {dias_historico} días: {total_kwh:,.1f} kWh  →  S/ {total_costo:,.2f}"
        f"    |    Sedes con consumo fuera de horario: {sedes_con_consumo}"
    )
    if umbral_critico_dia:
        pie += f"    |    Sedes críticas (≥ S/ {umbral_critico_dia:.0f}/día): {sedes_criticas}"
    ax.text(0.5, 0.15, pie, ha='center', va='center', fontsize=13, color='#e2e8f0')

    ax.text(0.5, 0.05,
            "* Proyección estimada a partir del promedio diario observado durante el período analizado.",
            ha='center', va='bottom', fontsize=9.5, color='#64748b', style='italic')

    return fig


def generar_grafico_impacto_economico(servicio, dias_historico, hora_inicio, hora_fin, resumen_total):
    """Version PNG (para Telegram/correo) del resumen de impacto economico."""
    import io
    import matplotlib.pyplot as plt

    fig = _fig_impacto_economico(servicio, dias_historico, hora_inicio, hora_fin, resumen_total)
    buffer = io.BytesIO()
    fig.savefig(buffer, format='png', facecolor=fig.get_facecolor())
    plt.close(fig)
    buffer.seek(0)
    return buffer.getvalue()


def _calcular_perfil_horario(filas, sede):
    """Promedia el consumo (kWh) de una sede por hora del dia (00h a 23h) a
    lo largo de todo el periodo descargado, a partir de las filas crudas
    hora-por-hora que el bot ya sube a Supabase (mismo dato, reutilizado).
    Devuelve una lista de 24 floats, indice 0 = hora 00, indice 23 = hora 23."""
    acumulado = [0.0] * 24
    conteo = [0] * 24
    for f in filas:
        if f.get('sede') != sede:
            continue
        try:
            hora = int(f.get('hora', '00:00:00').split(':')[0])
        except (ValueError, AttributeError):
            continue
        if 0 <= hora <= 23:
            acumulado[hora] += float(f.get('valor', 0) or 0)
            conteo[hora] += 1
    return [round(acumulado[h] / conteo[h], 1) if conteo[h] else 0.0 for h in range(24)]


def _fig_perfil_horario(sede, perfil, hora_inicio, hora_fin):
    """Barras horizontales (00h arriba, 23h abajo invertido para lectura
    natural) con el kWh promedio de cada hora del dia para una sede critica.
    Las horas dentro del rango vigilado (fuera de horario operativo) se
    resaltan en rojo, para ver de un vistazo a que hora exacta se dispara el
    consumo. Orientacion horizontal/panoramica a pedido, para que no se vea
    amontonado con las 24 etiquetas de hora."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    horas_lbl = [f"{h:02d}h" for h in range(24)]
    colores = ['#ef4444' if _en_rango_horario(f"{h:02d}:00", hora_inicio, hora_fin) else '#3b82f6' for h in range(24)]

    fig, ax = plt.subplots(figsize=(13, 7.5), dpi=200, facecolor='#0f172a')
    ax.set_facecolor('#0f172a')
    barras = ax.barh(horas_lbl[::-1], perfil[::-1], color=colores[::-1], height=0.68)

    ax.set_title(
        f"Perfil de Consumo por Hora — {sede}", color='#fff', fontsize=17, fontweight='bold', pad=30
    )
    ax.set_xlabel('kWh promedio por hora (todo el período)', color='#cbd5e1', fontsize=12)
    ax.tick_params(colors='#cbd5e1', labelsize=11)
    for spine in ax.spines.values():
        spine.set_color('#334155')
    ax.grid(axis='x', color='#334155', linestyle='--', alpha=0.5)

    max_val = max(perfil) if perfil else 1
    for barra, val in zip(barras, perfil[::-1]):
        ax.text(
            barra.get_width() + max_val * 0.015, barra.get_y() + barra.get_height() / 2,
            f"{val:.1f} kWh", va='center', ha='left', fontsize=10, color='#fff'
        )

    ax.annotate(
        "■ Normal", xy=(0.99, 1), xycoords='axes fraction', xytext=(0, 8), textcoords='offset points',
        ha='right', va='bottom', fontsize=11.5, color='#3b82f6', fontweight='bold'
    )
    ax.annotate(
        f"■ Fuera de horario ({hora_inicio} a {hora_fin})", xy=(0.72, 1), xycoords='axes fraction',
        xytext=(0, 8), textcoords='offset points', ha='right', va='bottom',
        fontsize=11.5, color='#ef4444', fontweight='bold'
    )

    plt.tight_layout()
    return fig


def _fig_proyeccion_financiera(servicio, sedes_criticas):
    """Grafico 'mas analitico' con dos paneles horizontales lado a lado (un
    mismo orden de sedes en ambos): a la izquierda la proyeccion mensual y a
    la derecha la proyeccion anual de cada sede critica. Se separan en dos
    paneles (en vez de una sola barra con ambos valores) porque el anual es
    ~12 veces el mensual: en una escala compartida el mensual se veria como
    una linea invisible junto al anual."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    sedes_ordenadas = sorted(sedes_criticas, key=lambda s: s['proyeccion_mensual'], reverse=True)
    nombres = [s['sede'] for s in sedes_ordenadas][::-1]
    mensual = [round(s['proyeccion_mensual'], 2) for s in sedes_ordenadas][::-1]
    # Misma base de calculo que la proyeccion anual agregada (costo_dia * 365),
    # para que las cifras de esta pagina cuadren con las del resumen general.
    anual = [round(s['costo_dia'] * 365, 2) for s in sedes_ordenadas][::-1]

    alto = max(4.5, 0.4 * len(nombres) + 1.8)
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, alto), dpi=200, facecolor='#0f172a', sharey=True)
    fig.suptitle(
        f"{servicio} — Proyección Financiera por Sede Crítica", color='#fff', fontsize=18, fontweight='bold', y=0.98
    )

    for ax, valores, titulo, color in (
        (ax1, mensual, "Proyección Mensual (S/)", '#f59e0b'),
        (ax2, anual, "Proyección Anual (S/)", '#ef4444'),
    ):
        ax.set_facecolor('#0f172a')
        barras = ax.barh(nombres, valores, color=color, height=0.62)
        ax.set_title(titulo, color='#fff', fontsize=13.5, fontweight='bold', pad=12)
        ax.tick_params(colors='#cbd5e1', labelsize=11.5)
        for spine in ax.spines.values():
            spine.set_color('#334155')
        ax.grid(axis='x', color='#334155', linestyle='--', alpha=0.5)
        max_val = max(valores) if valores else 1
        for barra, val in zip(barras, valores):
            ax.text(
                barra.get_width() + max_val * 0.015, barra.get_y() + barra.get_height() / 2,
                f"S/ {val:,.2f}", va='center', ha='left', fontsize=10, color='#fff'
            )

    plt.tight_layout(rect=[0, 0, 1, 0.95])
    return fig


PIE_PAGINA_PDF = "Desarrollo RQV - Sistema RCM"


def _agregar_pie_pagina(fig):
    """Pie de pagina fijo, abajo a la derecha, en todas las paginas de
    cualquier PDF generado por el sistema PME."""
    fig.text(0.99, 0.01, PIE_PAGINA_PDF, ha='right', va='bottom', fontsize=8, color='#64748b')


def _fig_firma_cierre():
    """Ultima pagina de cierre de cada PDF, con la firma del responsable."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(11, 6), dpi=200, facecolor='#0f172a')
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis('off')

    fecha_hoy = datetime.now()
    fecha_txt = f"{fecha_hoy.day}/{fecha_hoy.month}/{fecha_hoy.year}"

    ax.plot([0.35, 0.65], [0.56, 0.56], color='#334155', linewidth=1)
    ax.text(0.5, 0.52, "Raúl Quispe Vásquez", ha='center', va='top', fontsize=16, color='#fff', fontweight='bold')
    ax.text(0.5, 0.46, "Jefe de Energía (Especialidades)", ha='center', va='top', fontsize=12.5, color='#cbd5e1')
    ax.text(
        0.5, 0.38, f"Generado el {fecha_txt} - {PIE_PAGINA_PDF}",
        ha='center', va='top', fontsize=10, color='#64748b'
    )

    return fig


def generar_pdf_analisis_completo(servicio, sedes_con_consumo, dias_historico, hora_inicio, hora_fin,
                                   umbral_critico_dia, resumen_total, sedes_criticas, filas_horarias,
                                   sedes_punta_fuera=None, hora_punta_inicio=None, hora_punta_fin=None,
                                   fecha_ini_periodo=None, fecha_fin_periodo=None):
    """
    PDF adicional (no reemplaza ninguna de las imagenes/mensajes que ya se
    envian): redibuja los 2 graficos existentes como vectores (nitidez
    perfecta a cualquier zoom, sin el limite de tamaño de Telegram que
    limita las fotos) y agrega paginas nuevas de analisis mas profundo por
    cada sede critica: su perfil de consumo hora por hora (para ver a que
    hora exacta se dispara) y una comparacion mensual/anual de su impacto
    economico.

    sedes_punta_fuera/hora_punta_inicio/hora_punta_fin: EXCLUSIVO del Bot
    Consolidado General -si vienen, agrega la pagina de barras apiladas
    hora punta vs fuera de punta. El resto de bots (HVAC, Iluminacion) no
    pasan estos parametros, asi que su PDF queda exactamente igual que
    antes.
    """
    import io
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages

    buffer = io.BytesIO()
    with PdfPages(buffer) as pdf:
        fig1 = _fig_impacto_economico(servicio, dias_historico, hora_inicio, hora_fin, resumen_total)
        _agregar_pie_pagina(fig1)
        pdf.savefig(fig1, facecolor=fig1.get_facecolor())
        plt.close(fig1)

        if sedes_punta_fuera and hora_punta_inicio and hora_punta_fin:
            fig_punta = _fig_punta_fuera_punta(
                servicio, sedes_punta_fuera, hora_punta_inicio, hora_punta_fin, dias_historico=dias_historico,
                fecha_ini_periodo=fecha_ini_periodo, fecha_fin_periodo=fecha_fin_periodo, dpi=200
            )
            _agregar_pie_pagina(fig_punta)
            pdf.savefig(fig_punta, facecolor=fig_punta.get_facecolor())
            plt.close(fig_punta)

        if sedes_con_consumo:
            fig2 = _fig_grafico_consumo(servicio, sedes_con_consumo, dias_historico, hora_inicio, hora_fin, umbral_critico_dia, dpi=200)
            _agregar_pie_pagina(fig2)
            pdf.savefig(fig2, facecolor=fig2.get_facecolor())
            plt.close(fig2)

        if sedes_criticas:
            fig3 = _fig_proyeccion_financiera(servicio, sedes_criticas)
            _agregar_pie_pagina(fig3)
            pdf.savefig(fig3, facecolor=fig3.get_facecolor())
            plt.close(fig3)

            for s in sedes_criticas:
                perfil = _calcular_perfil_horario(filas_horarias, s['sede'])
                fig_h = _fig_perfil_horario(s['sede'], perfil, hora_inicio, hora_fin)
                _agregar_pie_pagina(fig_h)
                pdf.savefig(fig_h, facecolor=fig_h.get_facecolor())
                plt.close(fig_h)

        fig_firma = _fig_firma_cierre()
        _agregar_pie_pagina(fig_firma)
        pdf.savefig(fig_firma, facecolor=fig_firma.get_facecolor())
        plt.close(fig_firma)

    buffer.seek(0)
    return buffer.getvalue()


def _prefijo_codigo_solicitud(servicio):
    """PME + nombre del servicio en mayusculas y sin tildes, ej. 'Frío
    Alimentario' -> 'PME FRIO ALIMENTARIO', para que el codigo de cada
    solicitud identifique de una la especialidad (HVAC, Iluminacion, etc.)."""
    normalizado = unicodedata.normalize('NFKD', servicio).encode('ascii', 'ignore').decode('ascii')
    return f"PME {normalizado.upper()}"


def generar_plan_accion(servicio, sedes_criticas, descripcion, hora_inicio=None, hora_fin=None):
    """Arma una lista de solicitudes de servicio, una por cada sede critica
    (ya definida como aquella cuyo costo diario supera el umbral configurado).
    Cada item queda listo tanto para el mensaje de Telegram como para la hoja
    de Excel: {codigo, sede, descripcion}. Si se pasa el rango horario
    vigilado, se agrega al final de la descripcion para que el tecnico sepa
    exactamente que horario debe programar en el sistema de encendidos."""
    prefijo = _prefijo_codigo_solicitud(servicio)
    if hora_inicio and hora_fin:
        descripcion = f"{descripcion} Horario a configurar en el sistema de encendidos: {hora_inicio} a {hora_fin}."
    return [
        {'codigo': f"{prefijo} {idx:02d}", 'sede': s['sede'], 'descripcion': descripcion}
        for idx, s in enumerate(sedes_criticas, start=1)
    ]


def enviar_plan_accion_telegram(servicio, plan_accion):
    """
    Envia el Plan de Accion como TEXTO plano por Telegram (a proposito, no
    como imagen): la idea es que se pueda copiar y pegar directo al crear
    cada solicitud de servicio en la plataforma de mantenimiento. Si supera
    el limite de 4096 caracteres de Telegram, se parte en varios mensajes
    consecutivos sin cortar ninguna solicitud a la mitad.
    """
    if not plan_accion:
        return
    encabezado = (
        "🛠️ <b>PLAN DE ACCIÓN: SOLICITUDES DE SERVICIO</b>\n"
        "<b>A realizar en la plataforma de mantenimiento</b>\n"
        f"Servicio: {servicio} · Sedes críticas: {len(plan_accion)}\n\n"
    )

    mensaje_actual = encabezado
    for item in plan_accion:
        bloque = f"📍 <b>{item['codigo']} - {item['sede']}</b>\n🔧 {item['descripcion']}\n\n"
        if len(mensaje_actual) + len(bloque) > 3800:
            enviar_telegram(mensaje_actual.rstrip(), parse_mode='HTML')
            mensaje_actual = "🛠️ <b>PLAN DE ACCIÓN (continuación)</b>\n\n"
        mensaje_actual += bloque
    if mensaje_actual.strip():
        enviar_telegram(mensaje_actual.rstrip(), parse_mode='HTML')


def generar_plan_accion_medidores(medidores_desconectados, descripcion_plantilla):
    """Arma una lista de solicitudes de servicio, una por cada medidor
    desconectado/sin datos, para pedir su revision en la plataforma de
    mantenimiento. A diferencia del plan por sedes criticas (consumo), aqui
    el codigo no lleva numero: el nombre de la sede ya identifica cada
    solicitud sin ambiguedad."""
    plan = []
    for m in medidores_desconectados:
        descripcion = formatear_plantilla(
            descripcion_plantilla,
            medidor_nombre=m.get('medidor_nombre', ''),
            ultima_fecha_con_datos=m.get('ultima_fecha_con_datos') or 'hace más de 7 días'
        )
        plan.append({'codigo': "PME MEDIDOR", 'sede': m['sede'], 'descripcion': descripcion})
    return plan


def enviar_plan_accion_medidores_telegram(plan_medidores):
    """
    Envia el Plan de Accion de medidores desconectados como TEXTO plano por
    Telegram (igual que el de sedes criticas): listo para copiar/pegar al
    crear cada solicitud en la plataforma de mantenimiento. Mensaje
    separado del Plan de Accion por consumo, porque es un tipo de problema
    distinto (falla de comunicacion del medidor, no exceso de consumo).
    """
    if not plan_medidores:
        return
    encabezado = (
        "🔌 <b>PLAN DE ACCIÓN: MEDIDORES DE ENERGÍA DESCONECTADOS</b>\n"
        "<b>A realizar en la plataforma de mantenimiento</b>\n"
        f"Medidores sin datos: {len(plan_medidores)}\n\n"
    )
    mensaje_actual = encabezado
    for item in plan_medidores:
        bloque = f"📍 <b>{item['codigo']} - {item['sede']}</b>\n🔧 {item['descripcion']}\n\n"
        if len(mensaje_actual) + len(bloque) > 3800:
            enviar_telegram(mensaje_actual.rstrip(), parse_mode='HTML')
            mensaje_actual = "🔌 <b>PLAN DE ACCIÓN: MEDIDORES (continuación)</b>\n\n"
        mensaje_actual += bloque
    if mensaje_actual.strip():
        enviar_telegram(mensaje_actual.rstrip(), parse_mode='HTML')


def generar_grafico_medidores_desconectados(servicio, medidores):
    """Imagen (tabla) con los medidores sin datos actualmente, para adjuntar
    junto al analisis de consumo."""
    import io
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    filas = [[m['sede'], m.get('medidor_nombre', ''), m.get('ultima_fecha_con_datos') or 'sin registro'] for m in sorted(medidores, key=lambda x: x['sede'])]
    alto = max(2.2, 0.35 * len(filas) + 1.2)

    fig, ax = plt.subplots(figsize=(9, alto), dpi=150, facecolor='#0f172a')
    ax.set_facecolor('#0f172a')
    ax.axis('off')
    ax.set_title(f"{servicio} - Medidores Desconectados / Sin Datos ({len(filas)})", color='#fca5a5', fontsize=11, fontweight='bold', pad=10)

    tabla = ax.table(
        cellText=filas,
        colLabels=["Sede", "Medidor", "Última fecha con datos"],
        cellLoc='left', loc='center'
    )
    tabla.auto_set_font_size(False)
    tabla.set_fontsize(8)
    tabla.scale(1, 1.4)

    for (row, col), celda in tabla.get_celld().items():
        celda.set_edgecolor('#334155')
        if row == 0:
            celda.set_facecolor('#7f1d1d')
            celda.set_text_props(color='#fff', fontweight='bold')
        else:
            celda.set_facecolor('#1e293b')
            celda.set_text_props(color='#e2e8f0')

    plt.tight_layout()
    buffer = io.BytesIO()
    fig.savefig(buffer, format='png', facecolor=fig.get_facecolor())
    plt.close(fig)
    buffer.seek(0)
    return buffer.getvalue()


def generar_excel_medidores_desconectados(servicio, medidores_desconectados, plan_medidores=None):
    """
    Excel STANDALONE (no depende de una corrida de analisis completa) con
    el detalle de medidores desconectados/sin datos recientes y su plan de
    accion — para descargar bajo demanda desde el dashboard (ej. al hacer
    clic en el icono de medidores) sin tener que esperar la proxima
    corrida del bot.
    """
    import io
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    plan_medidores = plan_medidores or []
    descripcion_por_sede = {p['sede']: p['descripcion'] for p in plan_medidores}

    wb = Workbook()
    hoja = wb.active
    hoja.title = "Medidores Desconectados"
    hoja.append(["Servicio", "Sede", "Medidor", "Última fecha con datos", "Código de solicitud", "Descripción de la solicitud"])
    for celda in hoja[1]:
        _estilo_encabezado_excel(celda, "FEE2E2")
    for m in sorted(medidores_desconectados, key=lambda x: x['sede']):
        descripcion = descripcion_por_sede.get(m['sede'], '')
        hoja.append([
            servicio, m['sede'], m.get('medidor_nombre', ''), m.get('ultima_fecha_con_datos') or 'nunca reportó',
            "PME MEDIDOR" if descripcion else '', descripcion
        ])
    hoja.column_dimensions['A'].width = 16
    hoja.column_dimensions['B'].width = 26
    hoja.column_dimensions['C'].width = 28
    hoja.column_dimensions['D'].width = 20
    hoja.column_dimensions['E'].width = 16
    hoja.column_dimensions['F'].width = 90

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def obtener_medidores_desconectados_todos(servicios):
    """Combina obtener_medidores_desconectados de varios servicios en una
    sola lista, marcando de que servicio viene cada item."""
    todos = []
    for s in servicios:
        for m in obtener_medidores_desconectados(s):
            item = dict(m)
            item['servicio'] = s
            todos.append(item)
    return todos


def limpiar_nombre_sede(sede_raw):
    """Limpia sufijos/prefijos de ruido de un nombre de sede individual."""
    if not sede_raw:
        return ''
    s = sede_raw.strip()
    s = re.sub(r'^(Energia|ENERGIA|Energía)\s*[\-\:_]\s*', '', s, flags=re.IGNORECASE)
    s = re.sub(r'[\-\:_]\s*(Frio|Frío)\s*Alimentario$', '', s, flags=re.IGNORECASE)
    s = re.sub(r'[\-\:_]\s*(General|HVAC|Iluminacion|Iluminación)$', '', s, flags=re.IGNORECASE)
    s = re.sub(r'\s+(Frio|Frío)\s*Alimentario$', '', s, flags=re.IGNORECASE)
    return s.strip()


def elegir_mejor_nombre_sede(nombres_orig):
    """Elige el nombre de sede más formal de la lista de sedes de un grupo."""
    limpios = [limpiar_nombre_sede(n) for n in nombres_orig if n]
    if not limpios:
        return 'Sede'
    con_marca = [n for n in limpios if re.match(r'^(PV|MK|VV|Plaza Vea|Makro|Vivanda)\b', n, re.IGNORECASE)]
    if con_marca:
        return con_marca[0]
    return limpios[0]


def agrupar_medidores_por_sede(medidores_todos):
    """
    Cruza por nombre de sede normalizado (ver normalizar_sede) y arma UNA
    fila por sede con todos los medidores y servicios afectados en una sola fila
    consolidada - reutilizada tanto por el Excel consolidado como por el
    endpoint JSON que alimenta la tabla de detalle del modal en el
    dashboard, y por las alertas de Telegram.

    medidores_todos: lista de dicts {servicio, sede, medidor_nombre,
    ultima_fecha_con_datos} -salida de obtener_medidores_desconectados_todos.
    Devuelve una lista de dicts {sede, servicios_afectados (lista),
    servicios_txt, cantidad, ultima_fecha_con_datos, plan_accion},
    ordenada por sede.
    """
    por_sede = {}
    for m in medidores_todos:
        clave = normalizar_sede(m.get('sede', ''))
        if clave not in por_sede:
            por_sede[clave] = {'clave': clave, 'items': []}
        por_sede[clave]['items'].append(m)

    filas = []
    for clave, datos in sorted(por_sede.items(), key=lambda kv: kv[0]):
        items = datos['items']
        nombres_orig = [it.get('sede', '') for it in items]
        sede_mostrar = elegir_mejor_nombre_sede(nombres_orig)
        
        servicios_afectados = sorted(list({it['servicio'] for it in items}))
        servicios_txt = '-'.join(servicios_afectados)
        cantidad_total = len(items)

        detalles_servicio = []
        fechas_unicas = set()
        for srv in servicios_afectados:
            items_srv = [it for it in items if it['servicio'] == srv]
            fechas_srv = [it.get('ultima_fecha_con_datos') for it in items_srv if it.get('ultima_fecha_con_datos')]
            if fechas_srv:
                f_max = max(fechas_srv)
                fechas_unicas.add(f_max)
                detalles_servicio.append(f"{srv} (sin datos desde {f_max})")
            else:
                fechas_unicas.add('nunca reportó')
                detalles_servicio.append(f"{srv} (nunca reportó)")

        if len(fechas_unicas) == 1:
            unica_f = list(fechas_unicas)[0]
            ultima_fecha_resumen = unica_f
            txt_fechas = "(nunca reportaron)" if unica_f == 'nunca reportó' else f"desde {unica_f}"
        else:
            ultima_fecha_resumen = ", ".join(detalles_servicio)
            txt_fechas = f"({'; '.join(detalles_servicio)})"

        medidores_word = "medidor" if cantidad_total == 1 else "medidores"
        hallan_word = "halla" if cantidad_total == 1 else "hallan"

        plan_txt = (
            f"{sede_mostrar}: {medidores_word} {servicios_txt} se {hallan_word} sin datos {txt_fechas}. "
            f"Verificar conexión/comunicación de cada equipo; podría requerir mantenimiento o reemplazo."
        )

        filas.append({
            'sede': sede_mostrar,
            'servicios_afectados': servicios_afectados,
            'servicios_txt': servicios_txt,
            'cantidad': cantidad_total,
            'ultima_fecha_con_datos': ultima_fecha_resumen,
            'plan_accion': plan_txt,
        })
    return filas


def enviar_plan_accion_consolidado_telegram(filas_agrupadas=None, total_medidores=None):
    """
    Envía el Plan de Acción UNIFICADO de medidores sin datos por Telegram
    al finalizar la corrida, agrupado por sede (todas las especialidades PME juntas).
    """
    if filas_agrupadas is None:
        medidores_todos = obtener_medidores_desconectados_todos(['HVAC', 'Iluminación', 'Frío Alimentario', 'General'])
        if not medidores_todos:
            return
        filas_agrupadas = agrupar_medidores_por_sede(medidores_todos)
        total_medidores = len(medidores_todos)

    if not filas_agrupadas:
        return

    total_medidores = total_medidores or sum(f['cantidad'] for f in filas_agrupadas)
    total_sedes = len(filas_agrupadas)

    encabezado = (
        "🔌 <b>PLAN DE ACCIÓN CONSOLIDADO: MEDIDORES DE ENERGÍA SIN DATOS</b>\n"
        "<b>Resumen unificado por sede (Todas las especialidades PME)</b>\n"
        f"<b>Total: {total_medidores} medidores afectados en {total_sedes} sedes</b>\n\n"
    )

    mensaje_actual = encabezado
    for item in filas_agrupadas:
        bloque = (
            f"📍 <b>{item['sede']}</b> ({item['cantidad']} medidor{'es' if item['cantidad'] > 1 else ''}: {item['servicios_txt']})\n"
            f"🔧 {item['plan_accion']}\n\n"
        )
        if len(mensaje_actual) + len(bloque) > 3800:
            enviar_telegram(mensaje_actual.rstrip(), parse_mode='HTML')
            mensaje_actual = "🔌 <b>PLAN DE ACCIÓN CONSOLIDADO (continuación)</b>\n\n"
        mensaje_actual += bloque

    if mensaje_actual.strip():
        enviar_telegram(mensaje_actual.rstrip(), parse_mode='HTML')



def generar_excel_medidores_consolidado(medidores_todos):
    """
    Excel STANDALONE que agrupa TODOS los medidores en mal estado de TODAS
    las especialidades PME por sede (ver agrupar_medidores_por_sede) -para
    no tener que revisar un Excel suelto por cada servicio. Si una misma
    sede tiene problemas en mas de un servicio (ej. HVAC + Iluminacion +
    General a la vez), se consolida en UNA sola fila con los servicios
    listados y un plan de accion unificado, en vez de 3 filas sueltas
    repitiendo la misma sede.

    medidores_todos: lista de dicts {servicio, sede, medidor_nombre,
    ultima_fecha_con_datos} -salida de obtener_medidores_desconectados_todos.
    """
    import io
    from openpyxl import Workbook

    wb = Workbook()
    filas_agrupadas = agrupar_medidores_por_sede(medidores_todos)

    consolidado = wb.active
    consolidado.title = "Consolidado por Sede"
    consolidado.append([
        f"Medidores en mal estado / sin datos — TODAS las especialidades PME "
        f"({len(medidores_todos)} medidores, {len(filas_agrupadas)} sedes afectadas)"
    ])
    consolidado.append([])
    consolidado.append(["Sede", "Servicios Afectados", "Cantidad", "Última fecha con datos (más reciente)", "Plan de Acción Consolidado"])
    for celda in consolidado[3]:
        _estilo_encabezado_excel(celda, "FEE2E2")

    for f in filas_agrupadas:
        consolidado.append([
            f['sede'], f['servicios_txt'], f['cantidad'],
            f['ultima_fecha_con_datos'] or 'nunca reportó', f['plan_accion']
        ])
    consolidado.column_dimensions['A'].width = 26
    consolidado.column_dimensions['B'].width = 24
    consolidado.column_dimensions['C'].width = 10
    consolidado.column_dimensions['D'].width = 24
    consolidado.column_dimensions['E'].width = 100

    detalle = wb.create_sheet("Detalle")
    detalle.append(["Servicio", "Sede", "Medidor", "Última fecha con datos"])
    for celda in detalle[1]:
        _estilo_encabezado_excel(celda, "FEE2E2")
    for m in sorted(medidores_todos, key=lambda x: (x['sede'], x['servicio'])):
        detalle.append([m['servicio'], m['sede'], m.get('medidor_nombre', ''), m.get('ultima_fecha_con_datos') or 'nunca reportó'])
    detalle.column_dimensions['A'].width = 16
    detalle.column_dimensions['B'].width = 26
    detalle.column_dimensions['C'].width = 28
    detalle.column_dimensions['D'].width = 22

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def generar_excel_resumen_periodo(servicio, hora_inicio, hora_fin, dias_historico, precio_kwh, sedes, sedes_buenas=None,
                                   medidores_desconectados=None, plan_accion=None, plan_medidores=None, sedes_con_corte_parcial=None,
                                   sedes_con_indicador_area=None, filas_horarias=None, hora_punta_inicio=None,
                                   hora_punta_fin=None, sedes_punta_fuera=None, resumen_cruzado_servicios=None):
    """
    Excel de analisis de impacto por sede para todo el periodo descargado.

    Los ultimos 5 parametros son EXCLUSIVOS del Bot Consolidado General
    (el resto de bots no los pasan, asi que su Excel queda igual que
    siempre):
      - filas_horarias + hora_punta_inicio/fin: agregan una hoja "Detalle
        Horario" POR SEDE (una tienda por hoja) con la descarga hora a hora,
        resaltando en color las celdas de hora punta vs fuera de punta.
      - sedes_punta_fuera: agrega la hoja "Hora Punta vs Fuera de Punta"
        (mismo dato que alimenta el grafico de barras apiladas del PDF).
      - resumen_cruzado_servicios: agrega la hoja "Resumen Consolidado"
        (General + HVAC + Iluminacion por sede, cruzado por nombre de sede
        normalizado -ver normalizar_sede).
    sedes: lista de dicts {sede, total_kwh, dias_con_datos, costo, proyeccion_mensual},
    ya ordenada de mayor a menor consumo.
    sedes_buenas: lista de dicts {sede, dias_con_datos} sin ningun consumo
    fuera de horario en todo el periodo (buenas practicas).
    medidores_desconectados: lista de dicts {sede, medidor_nombre,
    ultima_fecha_con_datos} actualmente sin datos.
    plan_accion: lista de dicts {codigo, sede, descripcion} con una solicitud
    de servicio por cada sede critica, lista para crear en la plataforma de
    mantenimiento.
    plan_medidores: lista de dicts {codigo, sede, descripcion} con una
    solicitud de servicio por cada medidor desconectado.
    Hoja 1 "Resumen General": totales agregados.
    Hoja 2 "Detalle por Sede": una fila por sede con su kWh/costo/proyeccion.
    Hoja 3 "Buenas Prácticas": sedes sin consumo fuera de horario.
    Hoja 4 "Medidores Desconectados": sedes sin datos actualmente, con su solicitud lista.
    Hoja 5 "Plan de Acción": solicitudes de servicio a crear (si hay sedes criticas).
    """
    import io
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    sedes_buenas = sedes_buenas or []
    medidores_desconectados = medidores_desconectados or []
    plan_accion = plan_accion or []
    plan_medidores = plan_medidores or []
    descripcion_por_sede_medidor = {p['sede']: p['descripcion'] for p in plan_medidores}
    total_kwh = round(sum(s['total_kwh'] for s in sedes), 4)
    total_costo = round(sum(s['costo'] for s in sedes), 2)
    total_proyeccion = round(sum(s['proyeccion_mensual'] for s in sedes), 2)

    wb = Workbook()

    resumen = wb.active
    resumen.title = "Resumen General"
    resumen.append(["Servicio", servicio])
    resumen.append(["Rango vigilado", f"{hora_inicio} a {hora_fin}"])
    resumen.append(["Días analizados", dias_historico])
    resumen.append(["Precio por kWh (S/)", precio_kwh])
    resumen.append(["Sedes con consumo fuera de horario", len(sedes)])
    resumen.append(["Sedes en buenas prácticas (sin consumo)", len(sedes_buenas)])
    resumen.append(["Medidores desconectados / sin datos", len(medidores_desconectados)])
    resumen.append(["Consumo total del período (kWh)", total_kwh])
    resumen.append(["Costo total del período (S/)", total_costo])
    resumen.append(["Proyección mensual total (S/)", total_proyeccion])
    resumen.column_dimensions['A'].width = 34
    resumen.column_dimensions['B'].width = 20

    detalle = wb.create_sheet("Detalle por Sede")
    detalle.append(["Sede", "kWh en el período", "Días con datos", "Costo período (S/)", "Proyección mensual (S/)"])
    for celda in detalle[1]:
        _estilo_encabezado_excel(celda)
    for s in sedes:
        detalle.append([s['sede'], s['total_kwh'], s['dias_con_datos'], s['costo'], s['proyeccion_mensual']])
    detalle.column_dimensions['A'].width = 28
    for col in ['B', 'C', 'D', 'E']:
        detalle.column_dimensions[col].width = 20

    buenas = wb.create_sheet("Buenas Prácticas")
    buenas.append(["Sede", "Días con datos", "Consumo fuera de horario"])
    for celda in buenas[1]:
        _estilo_encabezado_excel(celda, "DCFCE7")
    for s in sorted(sedes_buenas, key=lambda x: x['sede']):
        buenas.append([s['sede'], s['dias_con_datos'], "0 kWh ✅"])
    buenas.column_dimensions['A'].width = 28
    buenas.column_dimensions['B'].width = 16
    buenas.column_dimensions['C'].width = 24

    desconectados = wb.create_sheet("Medidores Desconectados")
    desconectados.append(["Sede", "Medidor", "Última fecha con datos", "Código de solicitud", "Descripción de la solicitud"])
    for celda in desconectados[1]:
        _estilo_encabezado_excel(celda, "FEE2E2")
    for m in sorted(medidores_desconectados, key=lambda x: x['sede']):
        descripcion_medidor = descripcion_por_sede_medidor.get(m['sede'], '')
        desconectados.append([
            m['sede'], m.get('medidor_nombre', ''), m.get('ultima_fecha_con_datos') or 'sin registro',
            "PME MEDIDOR" if descripcion_medidor else '', descripcion_medidor
        ])
    desconectados.column_dimensions['A'].width = 28
    desconectados.column_dimensions['B'].width = 30
    desconectados.column_dimensions['C'].width = 24
    desconectados.column_dimensions['D'].width = 18
    desconectados.column_dimensions['E'].width = 90

    if plan_accion:
        plan = wb.create_sheet("Plan de Acción")
        plan.append(["Código", "Sede", "Descripción de la solicitud de servicio"])
        for celda in plan[1]:
            _estilo_encabezado_excel(celda, "FFEDD5")
        for item in plan_accion:
            plan.append([item['codigo'], item['sede'], item['descripcion']])
        plan.column_dimensions['A'].width = 10
        plan.column_dimensions['B'].width = 28
        plan.column_dimensions['C'].width = 100

    if sedes_con_corte_parcial:
        corte = wb.create_sheet("Corte Parcial Semanal")
        corte.append(["Semana actual (a la fecha) vs. mismo corte de días la semana anterior — consumo total del día (24h)"])
        corte.append([])
        corte.append([
            "Sede", "CECO", "kWh/día (corte actual)", "kWh/día (mismo corte sem. anterior)",
            "Variación %", "Corte comparado (esta semana)", "Corte comparado (semana anterior)"
        ])
        for celda in corte[3]:
            _estilo_encabezado_excel(celda)
        sedes_ordenadas_corte = sorted(
            sedes_con_corte_parcial, key=lambda s: s['corte_parcial'].get('promedio_actual_kwh_dia', 0), reverse=True
        )
        for s in sedes_ordenadas_corte:
            cp = s['corte_parcial']
            if cp.get('dias_comparados') == 1:
                corte_actual = f"{cp['dia_ini_nombre']} {_fmt_fecha_es(cp['fecha_ini_actual'])}"
                corte_anterior = f"{cp['dia_ini_nombre']} {_fmt_fecha_es(cp['fecha_ini_anterior'])}"
            else:
                corte_actual = f"{cp['dia_ini_nombre']} {_fmt_fecha_es(cp['fecha_ini_actual'])} a {cp['dia_fin_nombre']} {_fmt_fecha_es(cp['fecha_fin_actual'])}"
                corte_anterior = f"{cp['dia_ini_nombre']} {_fmt_fecha_es(cp['fecha_ini_anterior'])} a {cp['dia_fin_nombre']} {_fmt_fecha_es(cp['fecha_fin_anterior'])}"
            corte.append([
                s['sede'], s.get('ceco', ''), cp.get('promedio_actual_kwh_dia', ''), cp.get('promedio_anterior_kwh_dia', ''),
                cp.get('variacion_pct', ''), corte_actual, corte_anterior
            ])
        for col, ancho in zip('ABCDEFG', [28, 12, 22, 26, 14, 28, 28]):
            corte.column_dimensions[col].width = ancho

    if sedes_con_indicador_area:
        area = wb.create_sheet("Indicador kWh por m²")
        area.append(["kWh/día (consumo total, 24h) por m² de sala de ventas — solo sedes con el m² ya cargado"])
        area.append([])
        area.append(["Sede", "CECO", "kWh/día", "Área sala de ventas (m²)", "kWh/día por m²"])
        for celda in area[3]:
            _estilo_encabezado_excel(celda)
        for s in sorted(sedes_con_indicador_area, key=lambda s: s['kwh_dia_m2'], reverse=True):
            area.append([s['sede'], s.get('ceco', ''), s['kwh_dia'], s['area_m2'], s['kwh_dia_m2']])
        for col, ancho in zip('ABCDE', [28, 12, 12, 22, 16]):
            area.column_dimensions[col].width = ancho

    # ── A partir de aca, hojas EXCLUSIVAS del Bot Consolidado General ──
    if sedes_punta_fuera:
        punta = wb.create_sheet("Hora Punta vs Fuera Punta")
        punta.append([f"Hora punta: {hora_punta_inicio} a {hora_punta_fin} — resto del día es \"fuera de punta\""])
        punta.append([])
        punta.append(["Sede", "kWh Hora Punta", "kWh Fuera de Punta", "kWh Total", "Clasificación"])
        for celda in punta[3]:
            _estilo_encabezado_excel(celda, "FED7AA")
        for s in sedes_punta_fuera:
            clasificacion = "Cliente en Hora Punta" if s['es_cliente_punta'] else "Cliente Fuera de Punta"
            fila = [s['sede'], s['kwh_punta'], s['kwh_fuera_punta'], round(s['kwh_punta'] + s['kwh_fuera_punta'], 4), clasificacion]
            punta.append(fila)
            celda_clasif = punta.cell(row=punta.max_row, column=5)
            celda_clasif.fill = PatternFill(
                start_color="FED7AA" if s['es_cliente_punta'] else "DBEAFE",
                end_color="FED7AA" if s['es_cliente_punta'] else "DBEAFE", fill_type="solid"
            )
            celda_clasif.font = Font(bold=True, color="000000")
        for col, ancho in zip('ABCDE', [28, 16, 18, 14, 22]):
            punta.column_dimensions[col].width = ancho

    if resumen_cruzado_servicios:
        cruzado = wb.create_sheet("Resumen Consolidado")
        cruzado.append([f"Consumo total del período (últimos {dias_historico} días) — General, HVAC e Iluminación de la misma sede"])
        cruzado.append(["Cruce por nombre de sede normalizado: si un servicio no tiene ese nombre en su tabla, queda en blanco."])
        cruzado.append([])
        cruzado.append(["Sede", "Consumo General (kWh)", "Consumo HVAC (kWh)", "Consumo Iluminación (kWh)", "Total (kWh)"])
        for celda in cruzado[4]:
            _estilo_encabezado_excel(celda)
        for r in sorted(resumen_cruzado_servicios, key=lambda x: x.get('kwh_general', 0) or 0, reverse=True):
            total = round((r.get('kwh_general') or 0) + (r.get('kwh_hvac') or 0) + (r.get('kwh_iluminacion') or 0), 4)
            cruzado.append([
                r['sede'], r.get('kwh_general'), r.get('kwh_hvac'), r.get('kwh_iluminacion'), total
            ])
        for col, ancho in zip('ABCDE', [28, 20, 16, 20, 14]):
            cruzado.column_dimensions[col].width = ancho

    if filas_horarias and hora_punta_inicio and hora_punta_fin:
        _agregar_hojas_detalle_horario_por_sede(wb, filas_horarias, hora_punta_inicio, hora_punta_fin)

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


_NOMBRES_HOJA_USADOS_RESERVADOS = {"Resumen General", "Detalle por Sede", "Buenas Prácticas", "Medidores Desconectados",
                                    "Plan de Acción", "Corte Parcial Semanal", "Indicador kWh por m²",
                                    "Hora Punta vs Fuera Punta", "Resumen Consolidado"}


def _nombre_hoja_valido(nombre, usados):
    """Excel limita el nombre de hoja a 31 caracteres y prohibe : \\ / ? * [ ].
    Si dos sedes truncadas colisionan, agrega un sufijo numerico."""
    limpio = re.sub(r'[:\\/?*\[\]]', '', nombre).strip() or "Sede"
    base = limpio[:31]
    candidato = base
    n = 2
    while candidato in usados:
        sufijo = f" ({n})"
        candidato = base[:31 - len(sufijo)] + sufijo
        n += 1
    usados.add(candidato)
    return candidato


def _agregar_hojas_detalle_horario_por_sede(wb, filas_horarias, hora_punta_inicio, hora_punta_fin):
    """Una hoja POR SEDE con la descarga hora a hora del período completo,
    resaltando en color las celdas de hora punta vs fuera de punta -para
    poder auditar visualmente el comportamiento real de consumo de cada
    tienda, no solo el agregado."""
    from openpyxl.styles import PatternFill

    por_sede = {}
    for f in filas_horarias:
        por_sede.setdefault(f['sede'], []).append(f)

    usados = set(_NOMBRES_HOJA_USADOS_RESERVADOS)
    fill_punta = PatternFill(start_color="FED7AA", end_color="FED7AA", fill_type="solid")
    fill_fuera = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid")

    for sede in sorted(por_sede.keys()):
        filas_sede = sorted(por_sede[sede], key=lambda f: (f['fecha'], f['hora']))
        nombre_hoja = _nombre_hoja_valido(sede, usados)
        hoja = wb.create_sheet(nombre_hoja)
        hoja.append([f"{sede} — detalle hora por hora"])
        hoja.append([f"Hora punta ({hora_punta_inicio}-{hora_punta_fin}) resaltada en naranja, fuera de punta en azul"])
        hoja.append([])
        hoja.append(["Fecha", "Hora", "kWh", "Período"])
        for celda in hoja[4]:
            _estilo_encabezado_excel(celda)
        for f in filas_sede:
            en_punta = _en_rango_horario(f['hora'], hora_punta_inicio, hora_punta_fin)
            periodo = "Hora Punta" if en_punta else "Fuera de Punta"
            hoja.append([f['fecha'], f['hora'], f['valor'], periodo])
            fill = fill_punta if en_punta else fill_fuera
            for celda in hoja[hoja.max_row]:
                celda.fill = fill
        for col, ancho in zip('ABCD', [14, 10, 12, 16]):
            hoja.column_dimensions[col].width = ancho


def notificar_corrida_incompleta(servicio, sedes_ok, sedes_esperadas, sedes_fallidas, interrumpida=False):
    """
    Avisa por Telegram y correo que la corrida NO se completo (cortes de
    conexion con PME / VPN inestable), en vez de armar el analisis de
    consumo con datos parciales: un reporte con solo 11 de 55 sedes se
    veria como si las otras 44 estuvieran bien, cuando en realidad no se
    pudieron ni medir. Recomienda repetir la corrida.
    """
    pct = round(sedes_ok / sedes_esperadas * 100, 1) if sedes_esperadas else 0
    motivo = (
        "se interrumpió la descarga tras varios fallos de conexión seguidos (posible caída de VPN)"
        if interrumpida else
        "varias sedes no respondieron por problemas de conexión con PME"
    )
    lista = ", ".join(sedes_fallidas[:15])
    if len(sedes_fallidas) > 15:
        lista += f" y {len(sedes_fallidas) - 15} más"

    cuerpo = (
        f"⚠️ <b>CORRIDA INCOMPLETA — {servicio}</b>\n"
        f"Se procesaron <b>{sedes_ok}/{sedes_esperadas}</b> sedes ({pct}%); {motivo}.\n\n"
        f"Sedes sin datos en esta corrida: {lista}\n\n"
        f"No se envió el análisis de consumo fuera de horario porque saldría incompleto "
        f"(las sedes sin datos no significan que estén bien, simplemente no se pudieron medir).\n"
        f"Los datos de las sedes que sí se descargaron ya se guardaron en Supabase.\n\n"
        f"Recomendación: vuelve a ejecutar el bot cuando la conexión con PME esté estable."
    )
    enviar_telegram(cuerpo, parse_mode='HTML')
    enviar_email(f"Corrida incompleta - {servicio}", cuerpo.replace('<b>', '').replace('</b>', ''))


def notificar_sedes_sin_ceco(servicio, sedes_sin_ceco):
    """
    Avisa (campanita de alertas de sistema) cuando una o mas sedes
    terminaron esta corrida SIN CECO resuelto por ninguna de las 3
    fuentes (DeviceId, Virtual Meter, ni por nombre) - esas filas se
    guardan igual en Supabase, pero quedan afuera de cualquier reporte
    que sume/agrupe por CECO. Se envia una sola alerta consolidada por
    corrida (no una por sede) para no saturar.
    """
    if not sedes_sin_ceco:
        return
    lista = ", ".join(sedes_sin_ceco[:20])
    if len(sedes_sin_ceco) > 20:
        lista += f" y {len(sedes_sin_ceco) - 20} más"
    alerta_sistema(
        f"{servicio}: {len(sedes_sin_ceco)} sede(s) sin CECO asignado, no se están sumando en reportes "
        f"por centro de costo: {lista}. Completar en pme_dispositivos_mapeo / master_devices_pme / "
        f"master_virtual_meters_pme."
    )


def enviar_analisis_periodo_fuera_horario(servicio, resumen_sedes, config_alerta, dias_historico, filas_horarias=None,
                                           mapa_ceco=None, tabla=None, sufijo_medidor=None,
                                           hora_punta=None, resumen_cruzado_servicios=None):
    """
    Arma y envia el analisis consolidado de consumo fuera de horario e
    impacto/costo por sede, para todo el periodo recien descargado (no por
    dia individual).

    hora_punta: tupla (hora_punta_inicio, hora_punta_fin) — EXCLUSIVO del
    Bot Consolidado General. Si viene, calcula el consumo punta/fuera de
    punta por sede desde filas_horarias y agrega el grafico + hoja de Excel
    correspondiente. El resto de bots no lo pasan, sin cambios para ellos.
    resumen_cruzado_servicios: lista de dicts {sede, kwh_general, kwh_hvac,
    kwh_iluminacion} -tambien exclusivo de General- para la hoja "Resumen
    Consolidado" del Excel.

    En vez de listar las ~55 sedes en el texto (lo que facilmente supera el
    limite de 4096 caracteres de Telegram), el mensaje de texto es un
    resumen corto, y el detalle completo por sede va en un GRAFICO PNG
    (barras horizontales, todas las sedes, coloreadas en rojo si superan el
    umbral critico configurado) + el Excel de siempre. Si hay medidores
    desconectados, se agrega una segunda imagen con esa tabla.

    resumen_sedes: lista de dicts {sede, total_kwh, dias_con_datos} (uno por
    cada sede procesada en la corrida, venga o no con consumo).
    """
    if not config_alerta or not config_alerta.get('activo'):
        return

    precio_kwh = float(config_alerta.get('precio_kwh', 0) or 0)
    umbral_critico_dia = float(config_alerta.get('umbral_critico_soles_dia', 0) or 0)
    umbral_medio_dia = float(config_alerta.get('umbral_medio_soles_dia', 0) or 0)
    hora_inicio = config_alerta.get('hora_inicio', '23:00')
    hora_fin = config_alerta.get('hora_fin', '06:00')
    destinatarios = config_alerta.get('destinatarios', '')
    copia = config_alerta.get('copia', '')
    nombre_remitente = formatear_plantilla(
        config_alerta.get('nombre_remitente') or NOMBRE_REMITENTE_ALERTA_DEFAULT, servicio=servicio
    )

    medidores_desconectados = obtener_medidores_desconectados(servicio)
    sedes_desconectadas = {m['sede'] for m in medidores_desconectados}

    sedes_con_consumo = [s for s in resumen_sedes if s['total_kwh'] > 0]
    # Ojo: una sede con medidor desconectado tambien llega con total_kwh == 0
    # (no hay filas que sumar), pero eso NO es "buena practica" (ahorro real
    # confirmado): es falta de datos. Se excluyen explicitamente para no
    # mezclarlas con las sedes que si se monitorearon y de verdad no
    # consumieron fuera de horario.
    sedes_buenas_practicas = [
        s for s in resumen_sedes if s['total_kwh'] == 0 and s['sede'] not in sedes_desconectadas
    ]
    if not sedes_con_consumo and not sedes_buenas_practicas and not medidores_desconectados:
        return

    mapa_ceco_final = mapa_ceco if mapa_ceco is not None else cargar_mapa_ceco()

    # Corte parcial semanal (semana calendario a la fecha vs. mismo corte de
    # dias la semana pasada): a diferencia del resto de este reporte (que
    # solo mira la ventana fuera de horario), esto lee el TOTAL diario (24h)
    # ya acumulado en Supabase, igual que en Frio Alimentario.
    sedes_con_corte_parcial = []
    if tabla:
        for s in resumen_sedes:
            cp = calcular_comparacion_corte_parcial(tabla, s['sede'])
            if cp:
                ceco = buscar_ceco(mapa_ceco_final, f"{s['sede']} - {sufijo_medidor}") if sufijo_medidor else None
                sedes_con_corte_parcial.append({'sede': s['sede'], 'ceco': ceco, 'corte_parcial': cp})

    # Indicador kWh/dia por m2 de sala de ventas: usa el consumo TOTAL del
    # dia (las 24 horas, igual que un indice de intensidad energetica de
    # retail), no solo la ventana fuera de horario que mide el resto de este
    # reporte. Se apoya en pme_config_sedes (mismo m2 que ya se usa para
    # planificar comparaciones entre sedes de tamaño distinto). Solo incluye
    # sedes con el m2 ya cargado (se va llenando progresivamente).
    sedes_con_indicador_area = []
    if filas_horarias:
        config_sedes = cargar_config_sedes(servicio)
        kwh_totales_por_sede = {}
        for f in filas_horarias:
            kwh_totales_por_sede[f['sede']] = kwh_totales_por_sede.get(f['sede'], 0) + f['valor']
        for sede, total in kwh_totales_por_sede.items():
            area_m2 = (config_sedes.get(sede) or {}).get('area_sala_ventas_m2')
            if not area_m2:
                continue
            kwh_dia = total / dias_historico if dias_historico else total
            ceco = buscar_ceco(mapa_ceco_final, f"{sede} - {sufijo_medidor}") if sufijo_medidor else None
            sedes_con_indicador_area.append({
                'sede': sede, 'ceco': ceco, 'kwh_dia': round(kwh_dia, 2),
                'area_m2': area_m2, 'kwh_dia_m2': round(kwh_dia / area_m2, 3),
            })

    factor_mensual = (30 / dias_historico) if dias_historico else 1
    for s in sedes_con_consumo:
        s['costo'] = round(s['total_kwh'] * precio_kwh, 2)
        s['proyeccion_mensual'] = round(s['costo'] * factor_mensual, 2)
        s['costo_dia'] = round(s['costo'] / dias_historico, 2) if dias_historico else s['costo']
        s['kwh_dia'] = round(s['total_kwh'] / dias_historico, 2) if dias_historico else s['total_kwh']
    sedes_con_consumo.sort(key=lambda s: s['total_kwh'], reverse=True)
    sedes_buenas_practicas.sort(key=lambda s: s['sede'])

    total_kwh = round(sum(s['total_kwh'] for s in sedes_con_consumo), 2)
    total_costo = round(sum(s['costo'] for s in sedes_con_consumo), 2)
    total_proyeccion = round(sum(s['proyeccion_mensual'] for s in sedes_con_consumo), 2)
    total_kwh_dia = round(total_kwh / dias_historico, 2) if dias_historico else total_kwh
    total_costo_dia = round(total_costo / dias_historico, 2) if dias_historico else total_costo
    total_proyeccion_anual = round(total_costo_dia * 365, 2)
    sedes_criticas = [s for s in sedes_con_consumo if umbral_critico_dia and s['costo_dia'] >= umbral_critico_dia]

    descripcion_solicitud = formatear_plantilla(
        config_alerta.get('descripcion_solicitud_servicio') or DESCRIPCION_SOLICITUD_SERVICIO_DEFAULT, servicio=servicio
    )
    plan_accion = generar_plan_accion(servicio, sedes_criticas, descripcion_solicitud, hora_inicio, hora_fin) if umbral_critico_dia else []

    descripcion_medidor = config_alerta.get('descripcion_solicitud_medidor') or DESCRIPCION_MEDIDOR_DESCONECTADO_DEFAULT
    plan_medidores = generar_plan_accion_medidores(medidores_desconectados, descripcion_medidor) if medidores_desconectados else []

    # ── Mensaje de texto: SIEMPRE corto (resumen), el detalle completo va en el grafico/Excel ──
    cuerpo = (
        f"📊 <b>Análisis de Consumo de {servicio} y su Impacto por Sede</b>\n"
        f"Período: últimos {dias_historico} días | Rango: {hora_inicio} a {hora_fin} | Precio: S/ {precio_kwh}/kWh\n\n"
    )

    if sedes_con_consumo:
        cuerpo += f"🔴 Sedes con consumo fuera de horario: <b>{len(sedes_con_consumo)}</b>\n"
    else:
        cuerpo += "🎉 Ninguna sede reportó consumo fuera de horario en este período.\n"

    cuerpo += f"✅ Sedes en buenas prácticas (0 kWh): <b>{len(sedes_buenas_practicas)}</b>\n"
    if umbral_critico_dia and sedes_con_consumo:
        cuerpo += f"🚨 Sedes críticas (≥ S/ {umbral_critico_dia}/día): <b>{len(sedes_criticas)}</b>\n"
    if medidores_desconectados:
        cuerpo += f"🔌 Medidores desconectados / sin datos: <b>{len(medidores_desconectados)}</b>\n"

    if sedes_con_consumo:
        cuerpo += (
            f"\n💸 Fuga diaria total: <b>{total_kwh_dia} kWh/día → S/ {total_costo_dia}/día</b>\n"
            f"Acumulado {dias_historico}d: {total_kwh} kWh → S/ {total_costo}\n"
            f"Proyección mensual: <b>S/ {total_proyeccion}</b> | Proyección anual: <b>S/ {total_proyeccion_anual}</b>\n"
        )

    cuerpo += "\nVer gráfico(s) y Excel adjuntos para el detalle completo por sede."

    asunto = f"Análisis de Impacto por Consumo Fuera de Horario - {servicio}"

    # ── Adjuntos: grafico de consumo, grafico de desconectados (si aplica), Excel ──
    adjuntos_email = []

    resumen_total = {
        'costo_dia': total_costo_dia, 'kwh_dia': total_kwh_dia,
        'total_kwh': total_kwh, 'total_costo': total_costo,
        'proyeccion_mensual': total_proyeccion, 'proyeccion_anual': total_proyeccion_anual,
        'sedes_con_consumo': len(sedes_con_consumo), 'sedes_criticas': len(sedes_criticas),
        'umbral_critico_dia': umbral_critico_dia,
    }

    # Hora punta vs fuera de punta -exclusivo de General (ver docstring).
    sedes_punta_fuera = None
    hora_punta_inicio = hora_punta_fin = None
    fecha_ini_periodo = fecha_fin_periodo = None
    if hora_punta and filas_horarias:
        hora_punta_inicio, hora_punta_fin = hora_punta
        sedes_punta_fuera = calcular_consumo_punta_fuera_punta(filas_horarias, hora_punta_inicio, hora_punta_fin)
        fechas_periodo = [f['fecha'] for f in filas_horarias if f.get('fecha')]
        if fechas_periodo:
            fecha_ini_periodo = min(fechas_periodo)
            fecha_fin_periodo = max(fechas_periodo)

    grafico_bytes = None
    grafico_impacto_bytes = None
    grafico_punta_bytes = None
    if sedes_con_consumo:
        try:
            grafico_bytes = generar_grafico_consumo(servicio, sedes_con_consumo, dias_historico, hora_inicio, hora_fin, umbral_critico_dia)
            adjuntos_email.append((f"grafico_consumo_{servicio}.png", grafico_bytes, 'png'))
        except Exception as e:
            log(f"⚠️ No se pudo generar el gráfico de consumo: {e}")
        try:
            grafico_impacto_bytes = generar_grafico_impacto_economico(servicio, dias_historico, hora_inicio, hora_fin, resumen_total)
            adjuntos_email.append((f"impacto_economico_{servicio}.png", grafico_impacto_bytes, 'png'))
        except Exception as e:
            log(f"⚠️ No se pudo generar el gráfico de impacto económico: {e}")
    if sedes_punta_fuera:
        try:
            grafico_punta_bytes = generar_grafico_punta_fuera_punta(
                servicio, sedes_punta_fuera, hora_punta_inicio, hora_punta_fin, dias_historico=dias_historico,
                fecha_ini_periodo=fecha_ini_periodo, fecha_fin_periodo=fecha_fin_periodo
            )
            adjuntos_email.append((f"hora_punta_fuera_punta_{servicio}.png", grafico_punta_bytes, 'png'))
        except Exception as e:
            log(f"⚠️ No se pudo generar el gráfico de hora punta vs fuera de punta: {e}")

    pdf_bytes = None
    if sedes_con_consumo and filas_horarias:
        try:
            pdf_bytes = generar_pdf_analisis_completo(
                servicio, sedes_con_consumo, dias_historico, hora_inicio, hora_fin,
                umbral_critico_dia, resumen_total, sedes_criticas, filas_horarias,
                sedes_punta_fuera=sedes_punta_fuera, hora_punta_inicio=hora_punta_inicio, hora_punta_fin=hora_punta_fin,
                fecha_ini_periodo=fecha_ini_periodo, fecha_fin_periodo=fecha_fin_periodo
            )
            adjuntos_email.append((f"analisis_completo_{servicio}.pdf", pdf_bytes, 'pdf'))
        except Exception as e:
            log(f"⚠️ No se pudo generar el PDF de análisis completo: {e}")

    # ── Historial de resultados (para medir mejora corrida a corrida) + PDF de tendencia ──
    pdf_perfil_bytes = None
    try:
        historial_id = guardar_historial_resultados(
            servicio, dias_historico, hora_inicio, hora_fin, precio_kwh,
            umbral_critico_dia, umbral_medio_dia, sedes_con_consumo,
            sedes_buenas_practicas, medidores_desconectados, resumen_total, mapa_ceco_final
        )
        if historial_id:
            pdf_perfil_bytes = generar_pdf_perfil_resultados(servicio, umbral_critico_dia, umbral_medio_dia)
            if pdf_perfil_bytes:
                adjuntos_email.append((f"perfil_resultados_{servicio}.pdf", pdf_perfil_bytes, 'pdf'))
    except Exception as e:
        log(f"⚠️ No se pudo guardar/generar el Perfil de Resultados: {e}")

    grafico_desconectados_bytes = None
    if medidores_desconectados:
        try:
            grafico_desconectados_bytes = generar_grafico_medidores_desconectados(servicio, medidores_desconectados)
            adjuntos_email.append((f"medidores_desconectados_{servicio}.png", grafico_desconectados_bytes, 'png'))
        except Exception as e:
            log(f"⚠️ No se pudo generar la imagen de medidores desconectados: {e}")

    grafico_corte_bytes = None
    if sedes_con_corte_parcial:
        try:
            grafico_corte_bytes = generar_grafico_corte_parcial_semanal(
                servicio, sedes_con_corte_parcial,
                nota_alcance="Consumo total del día (24 horas) — no solo la ventana fuera de horario."
            )
        except Exception as e:
            log(f"⚠️ No se pudo generar el gráfico de corte parcial semanal de {servicio}: {e}")

    excel_bytes = None
    try:
        excel_bytes = generar_excel_resumen_periodo(
            servicio, hora_inicio, hora_fin, dias_historico, precio_kwh, sedes_con_consumo, sedes_buenas_practicas,
            medidores_desconectados, plan_accion, plan_medidores, sedes_con_corte_parcial=sedes_con_corte_parcial,
            sedes_con_indicador_area=sedes_con_indicador_area, filas_horarias=filas_horarias,
            hora_punta_inicio=hora_punta_inicio, hora_punta_fin=hora_punta_fin,
            sedes_punta_fuera=sedes_punta_fuera, resumen_cruzado_servicios=resumen_cruzado_servicios
        )
        nombre_excel = f"analisis_impacto_{servicio}_{dias_historico}dias.xlsx"
        adjuntos_email.append((nombre_excel, excel_bytes, 'xlsx'))
    except Exception as e:
        log(f"⚠️ No se pudo generar el Excel de analisis de impacto: {e}")

    # Telegram: mensaje corto + fotos + documento por separado
    enviar_telegram(cuerpo, parse_mode='HTML')
    if grafico_impacto_bytes:
        enviar_telegram_foto(grafico_impacto_bytes, f"impacto_economico_{servicio}.png", caption=f"Impacto económico — {servicio}")
    if grafico_bytes:
        enviar_telegram_foto(grafico_bytes, f"grafico_consumo_{servicio}.png", caption=f"Detalle por sede — {servicio}")
    if grafico_punta_bytes:
        enviar_telegram_foto(
            grafico_punta_bytes, f"hora_punta_fuera_punta_{servicio}.png",
            caption=f"Hora Punta ({hora_punta_inicio}-{hora_punta_fin}) vs. Fuera de Punta — {servicio}"
        )
    if grafico_corte_bytes:
        enviar_telegram_foto(
            grafico_corte_bytes, f"corte_parcial_{servicio}.png",
            caption=f"Semana actual (a la fecha) vs. mismo corte semana anterior — {servicio}"
        )
    if grafico_desconectados_bytes:
        enviar_telegram_foto(grafico_desconectados_bytes, f"medidores_desconectados_{servicio}.png", caption="Medidores desconectados")
    if excel_bytes:
        enviar_telegram_documento(excel_bytes, nombre_excel, caption=f"Excel completo — {servicio} ({dias_historico} días)")
    if pdf_bytes:
        enviar_telegram_documento(
            pdf_bytes, f"analisis_completo_{servicio}.pdf",
            caption=f"📄 PDF completo (nitidez vectorial) — incluye perfil hora por hora y proyección financiera de cada sede crítica"
        )
    if pdf_perfil_bytes:
        enviar_telegram_documento(
            pdf_perfil_bytes, f"perfil_resultados_{servicio}.pdf",
            caption="📈 Perfil de Resultados — tendencia histórica y seguimiento del Plan de Acción"
        )
    if plan_accion:
        enviar_plan_accion_telegram(servicio, plan_accion)
    if plan_medidores:
        enviar_plan_accion_medidores_telegram(plan_medidores)

    # Correo: un solo envio, solo con Excel y PDF (las imagenes quedan solo
    # en Telegram; en el correo serian redundantes con esos mismos PDF/Excel).
    adjuntos_correo = [a for a in adjuntos_email if a[2] != 'png']
    enviar_email(
        asunto, cuerpo.replace('<b>', '').replace('</b>', ''),
        destinatarios=destinatarios, copia=copia, nombre_remitente=nombre_remitente,
        adjuntos=adjuntos_correo
    )


def verificar_consumo_fuera_horario(servicio, sede, filas, config_alerta):
    """
    Si la alerta de consumo fuera de horario esta activa, detecta picos de
    consumo por encima de la linea base configurada dentro del rango horario,
    y notifica (Telegram + correo) una sola vez por sede/fecha (no reenvia si
    ya se notifico esa misma fecha en una corrida anterior).

    config_alerta puede incluir 'destinatarios' y 'copia' propios de este
    servicio (para que HVAC, Frio, Iluminacion... avisen a personas
    distintas); si no se especifican, se usa el correo por defecto.
    'cuerpo_mensaje' permite personalizar el texto del correo/Telegram
    (placeholders: {servicio} {sede} {fecha} {hora} {valor} {linea_base}
    {hora_inicio} {hora_fin}).
    """
    if not config_alerta or not config_alerta.get('activo'):
        return

    hora_inicio = config_alerta.get('hora_inicio', '23:00')
    hora_fin = config_alerta.get('hora_fin', '06:00')
    linea_base = float(config_alerta.get('linea_base_kwh', 1.0))
    precio_kwh = float(config_alerta.get('precio_kwh', 0) or 0)
    adjuntar_excel = config_alerta.get('adjuntar_excel', True)
    plantilla = config_alerta.get('cuerpo_mensaje') or PLANTILLA_ALERTA_CONSUMO_DEFAULT
    plantilla_asunto = config_alerta.get('asunto') or ASUNTO_ALERTA_CONSUMO_DEFAULT
    plantilla_remitente = config_alerta.get('nombre_remitente') or NOMBRE_REMITENTE_ALERTA_DEFAULT
    destinatarios = config_alerta.get('destinatarios', '')
    copia = config_alerta.get('copia', '')

    picos = detectar_consumos_fuera_horario(filas, hora_inicio, hora_fin, linea_base)
    if not picos:
        return

    TIPO_ALERTA = 'fuera_horario'
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Accept-Profile": "energia",
        "Content-Profile": "energia",
        "Prefer": "return=representation,resolution=ignore-duplicates",
    }
    url = f"{SUPABASE_URL}/rest/v1/pme_alertas_consumo?on_conflict=servicio,sede,fecha,tipo_alerta"

    for fecha, pico in picos.items():
        costo = round(pico['total_kwh'] * precio_kwh, 2)
        variables_plantilla = dict(
            servicio=servicio, sede=sede, fecha=fecha, hora=pico['hora_pico'],
            valor=pico['valor_pico'], linea_base=linea_base,
            hora_inicio=hora_inicio, hora_fin=hora_fin,
            total_kwh=pico['total_kwh'], precio_kwh=precio_kwh, costo=costo,
        )
        mensaje = formatear_plantilla(plantilla, **variables_plantilla)
        asunto = formatear_plantilla(plantilla_asunto, **variables_plantilla)
        nombre_remitente = formatear_plantilla(plantilla_remitente, **variables_plantilla)
        payload = {
            "servicio": servicio,
            "tipo_alerta": TIPO_ALERTA,
            "sede": sede,
            "fecha": fecha,
            "hora_pico": pico['hora_pico'],
            "valor_pico": pico['valor_pico'],
            "linea_base_kwh": linea_base,
            "mensaje": mensaje,
        }
        try:
            r = requests.post(url, headers=headers, json=[payload], timeout=15)
            if r.status_code in (200, 201):
                insertado = bool(r.json())
            else:
                # Distinto de "ya se habia notificado" (eso da 200/201 con
                # lista vacia por el resolution=ignore-duplicates): esto es
                # un error real (ej. RLS bloqueando el insert) que antes se
                # confundia en silencio con un duplicado y nunca se avisaba.
                log(f"⚠️ No se pudo registrar alerta de consumo ({sede}, {fecha}): {r.status_code} {r.text[:200]}")
                alerta_sistema(f"Supabase rechazó el registro de alerta de consumo de {sede} ({servicio}) — código {r.status_code}. Revisar permisos/RLS de pme_alertas_consumo.")
                insertado = False
        except Exception as e:
            log(f"⚠️ No se pudo registrar alerta de consumo ({sede}, {fecha}): {e}")
            continue

        if not insertado:
            continue  # ya se habia notificado esta sede/fecha antes

        excel_bytes = None
        nombre_excel = None
        if adjuntar_excel:
            try:
                excel_bytes = generar_excel_consumo(
                    servicio, sede, fecha, pico['puntos'], hora_inicio, hora_fin,
                    linea_base, precio_kwh, pico['total_kwh'], costo
                )
                sede_archivo = re.sub(r'[^A-Za-z0-9_-]+', '_', sede)
                nombre_excel = f"consumo_{servicio}_{sede_archivo}_{fecha}.xlsx"
            except Exception as e:
                log(f"⚠️ No se pudo generar el Excel de detalle ({sede}, {fecha}): {e}")

        ok_telegram = enviar_telegram(mensaje)
        if excel_bytes:
            enviar_telegram_documento(excel_bytes, nombre_excel, caption=f"Detalle {sede} - {fecha}")
        ok_email = enviar_email(
            asunto, mensaje, destinatarios=destinatarios, copia=copia, nombre_remitente=nombre_remitente,
            adjunto_bytes=excel_bytes, adjunto_nombre=nombre_excel
        )

        try:
            r_patch = requests.patch(
                f"{SUPABASE_URL}/rest/v1/pme_alertas_consumo",
                params={"servicio": f"eq.{servicio}", "sede": f"eq.{sede}", "fecha": f"eq.{fecha}", "tipo_alerta": f"eq.{TIPO_ALERTA}"},
                headers={**headers, "Prefer": "return=minimal"},
                json={"enviado_telegram": ok_telegram, "enviado_email": ok_email},
                timeout=15
            )
            if r_patch.status_code not in (200, 204):
                log(f"⚠️ No se pudo actualizar estado de envio de la alerta ({sede}, {fecha}): {r_patch.status_code} {r_patch.text[:200]}")
        except Exception as e:
            log(f"⚠️ No se pudo actualizar estado de envio de la alerta ({sede}, {fecha}): {e}")


def subir_a_supabase(tabla, filas, columnas_conflicto):
    """Sube filas a una tabla del esquema energia con upsert (merge-duplicates).
    Reintenta cada lote ante fallas transitorias (5xx o timeout/caida de
    conexion con Supabase) antes de darlo por perdido -- una caida breve de
    Supabase ya causo perdida real de miles de registros al no reintentar."""
    if not filas:
        return 0
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Accept-Profile": "energia",
        "Content-Profile": "energia",
        "Prefer": "resolution=merge-duplicates"
    }
    on_conflict = ",".join(columnas_conflicto)
    url = f"{SUPABASE_URL}/rest/v1/{tabla}?on_conflict={on_conflict}"
    BATCH = 500
    REINTENTOS = 3
    ESPERA_REINTENTO = 5
    subidos = 0
    for i in range(0, len(filas), BATCH):
        lote = filas[i:i + BATCH]
        exito = False
        ultimo_status = None
        ultimo_texto = None
        for intento in range(1, REINTENTOS + 1):
            try:
                r = requests.post(url, headers=headers, json=lote, timeout=30)
                if r.status_code in (200, 201, 204):
                    subidos += len(lote)
                    exito = True
                    break
                ultimo_status, ultimo_texto = r.status_code, r.text[:200]
                # 4xx (permisos/RLS, datos invalidos) no mejora reintentando
                # -- cortar de una. 5xx si vale la pena reintentar: es una
                # falla transitoria del lado de Supabase/Cloudflare.
                if r.status_code < 500:
                    break
            except requests.exceptions.RequestException as e:
                ultimo_status, ultimo_texto = 'sin_respuesta', str(e)[:200]
            if intento < REINTENTOS:
                time.sleep(ESPERA_REINTENTO)
        if not exito:
            log(f"⚠️ Error subiendo lote a Supabase ({tabla}) tras {REINTENTOS} intentos: {ultimo_status} {ultimo_texto}")
            if ultimo_status == 'sin_respuesta' or (isinstance(ultimo_status, int) and ultimo_status >= 500):
                alerta_sistema(f"Supabase no respondió al subir {len(lote)} registros a {tabla} tras {REINTENTOS} intentos (código {ultimo_status}) — caída o lentitud temporal de Supabase, no es un problema de permisos.")
            else:
                alerta_sistema(f"Supabase rechazó {len(lote)} registros al subir a {tabla} — código {ultimo_status}. Revisar permisos/RLS de {tabla}.")
    return subidos


def _clave_ceco(medidor_nombre):
    """Normaliza un medidor_nombre para cruzarlo sin importar mayusculas o
    espacios de mas (el nombre que arma el bot y el que se escribe a mano en
    la tabla de mapeo no siempre coinciden letra por letra)."""
    return (medidor_nombre or '').strip().lower()


_PALABRAS_RUIDO_SEDE = {
    'GENERAL', 'HVAC', 'ILUMINACION', 'ALUMBRADO', 'FRIO', 'ALIMENTARIO',
    'ENERGIA', 'ACTIVA', 'CONSUMIDA', 'CONSUMO',
}
_MARCAS_RUIDO_SEDE = {'PV', 'MK', 'VV', 'PLAZAVEA', 'MAKRO', 'VIVANDA', 'PLAZA', 'VEA'}


def normalizar_sede(sede):
    """
    Reduce un nombre de sede a una clave comparable entre las distintas
    tablas de datos crudos (pme_hvac, pme_iluminacion, pme_general, pme_frio_alimentario).
    Elimina ruido y prefijos de marca para que variantes como 'Energia - Pv Izaguirre - General'
    e 'Izaguirre - Frio Alimentario' mapeen exactamente a la misma clave ('IZAGUIRRE').
    """
    if not sede:
        return ''
    texto = unicodedata.normalize('NFKD', sede).encode('ascii', 'ignore').decode('ascii').upper()
    texto = re.sub(r'[_.\-]+', ' ', texto)
    palabras = [p for p in texto.split() if p and not p.isdigit() and p not in _PALABRAS_RUIDO_SEDE]
    if not palabras:
        return texto.strip()

    palabras_base = [p for p in palabras if p not in _MARCAS_RUIDO_SEDE]
    if palabras_base:
        return ' '.join(palabras_base).strip()

    return ' '.join(palabras).strip()


def cargar_consumo_total_por_sede(tabla, dias_historico):
    """
    Suma el consumo (kWh) de los ultimos N dias por sede, directo desde
    Supabase, para OTRO servicio distinto al que esta corriendo (ej. el bot
    General consultando cuanto lleva HVAC/Iluminacion en esas mismas
    sedes). Pagina la consulta porque PostgREST limita a 1000 filas por
    default y el rango puede superar eso facil (50 sedes x 24h x varios
    dias). Devuelve {sede_normalizada: {'sede_original':.., 'kwh': total}}.
    """
    fecha_limite = (datetime.now() - timedelta(days=dias_historico)).strftime('%Y-%m-%d')
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept-Profile": "energia",
    }
    resultado = {}
    offset = 0
    lote = 1000
    try:
        while True:
            r = requests.get(
                f"{SUPABASE_URL}/rest/v1/{tabla}",
                params={
                    "select": "sede,valor",
                    "fecha": f"gte.{fecha_limite}",
                    "limit": lote,
                    "offset": offset,
                },
                headers=headers,
                timeout=20,
            )
            if r.status_code != 200:
                log(f"⚠️ No se pudo leer consumo consolidado de {tabla}: {r.status_code}")
                break
            filas = r.json()
            if not filas:
                break
            for f in filas:
                sede_original = f.get('sede') or ''
                clave = normalizar_sede(sede_original)
                if clave not in resultado:
                    resultado[clave] = {'sede_original': sede_original, 'kwh': 0.0}
                resultado[clave]['kwh'] += float(f.get('valor') or 0)
            if len(filas) < lote:
                break
            offset += lote
    except Exception as e:
        log(f"⚠️ Error consultando consumo consolidado de {tabla}: {e}")
    for clave in resultado:
        resultado[clave]['kwh'] = round(resultado[clave]['kwh'], 4)
    return resultado


def cargar_mapa_ceco():
    """
    Lee energia.pme_dispositivos_mapeo (tabla ya existente en Supabase con
    TODOS los medidores de energia de todas las especialidades: HVAC,
    Alumbrado, Frio, General). La llena el usuario manualmente; los bots
    solo LEEN de aca para completar el CECO en las filas de descarga y en el
    historial de resultados, en vez del None fijo de antes. Devuelve un
    diccionario {medidor_nombre normalizado: ceco}; usar buscar_ceco() para
    consultarlo (no acceder al dict directo, por la normalizacion).
    """
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept-Profile": "energia",
    }
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/pme_dispositivos_mapeo",
            params={"select": "medidor_nombre,ceco"},
            headers=headers,
            timeout=15
        )
        if r.status_code == 200:
            return {_clave_ceco(fila['medidor_nombre']): fila['ceco'] for fila in r.json() if fila.get('ceco')}
    except Exception as e:
        log(f"⚠️ No se pudo cargar el mapeo de CECO (energia.pme_dispositivos_mapeo): {e}")
    return {}


def buscar_ceco(mapa_ceco, medidor_nombre):
    """Busca el CECO de un medidor en el diccionario de cargar_mapa_ceco(),
    sin importar mayusculas/minusculas ni espacios de mas."""
    return mapa_ceco.get(_clave_ceco(medidor_nombre))


def cargar_incidentes_fracttal():
    """
    Lee energia.pme_fracttal_incidentes: por sede (normalizada), que
    servicios ya estan cubiertos por una Solicitud de Servicio ABIERTA en
    Fracttal (creada por sincronizar_solicitudes_fracttal, todavia no
    limpiada porque la sede sigue con algun medidor en ALERTA). Devuelve
    {sede_normalizada: set(servicio)}.
    """
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept-Profile": "energia",
    }
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/pme_fracttal_incidentes",
            params={"select": "sede,servicios_cubiertos"},
            headers=headers,
            timeout=15
        )
        if r.status_code == 200:
            return {fila['sede']: set(fila.get('servicios_cubiertos') or []) for fila in r.json()}
    except Exception as e:
        log(f"⚠️ No se pudo cargar el registro de incidentes Fracttal (energia.pme_fracttal_incidentes): {e}")
    return {}


def _guardar_incidente_fracttal(sede_normalizada, servicios_cubiertos, folio=None):
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Accept-Profile": "energia",
        "Content-Profile": "energia",
        "Prefer": "resolution=merge-duplicates",
    }
    payload = {"sede": sede_normalizada, "servicios_cubiertos": sorted(servicios_cubiertos), "actualizado_el": datetime.now(timezone.utc).isoformat()}
    if folio:
        payload["id_solicitud_fracttal"] = str(folio)
    try:
        r = requests.post(f"{SUPABASE_URL}/rest/v1/pme_fracttal_incidentes?on_conflict=sede", headers=headers, json=[payload], timeout=15)
        if r.status_code not in (200, 201, 204):
            log(f"⚠️ No se pudo guardar el incidente Fracttal de {sede_normalizada}: {r.status_code} {r.text[:200]}")
    except Exception as e:
        log(f"⚠️ No se pudo guardar el incidente Fracttal de {sede_normalizada}: {e}")


def _borrar_incidente_fracttal(sede_normalizada):
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept-Profile": "energia",
    }
    try:
        requests.delete(f"{SUPABASE_URL}/rest/v1/pme_fracttal_incidentes", params={"sede": f"eq.{sede_normalizada}"}, headers=headers, timeout=15)
    except Exception as e:
        log(f"⚠️ No se pudo limpiar el incidente Fracttal de {sede_normalizada}: {e}")


def _registrar_intento_fracttal(sede, servicios, descripcion, exito, folio=None, causa=None, solucion=None, candidatos=None):
    """
    Guarda en energia.pme_fracttal_solicitudes UN registro historico (no
    se actualiza ni se borra despues) de cada intento de creacion de
    Solicitud de Servicio en Fracttal, exitoso o fallido. A diferencia de
    pme_fracttal_incidentes (que solo guarda el estado ACTUAL para poder
    calcular el delta), esta tabla es un log append-only pensado para
    mostrarse tal cual en la columna "Solicitudes Fracttal" del modal de
    medidores - de ahi que guarde folio/causa/solucion por separado.

    candidatos: lista de {id_location, descripcion} cuando el fallo fue
    por ubicación ambigua (ver resolver_activo_tablero_sede) - permite
    mostrar botones "Usar esta" en el modal sin tener que re-parsear el
    texto de la causa.
    """
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Accept-Profile": "energia",
        "Content-Profile": "energia",
    }
    payload = {
        "sede": sede,
        "servicios": list(servicios),
        "descripcion": descripcion,
        "exito": bool(exito),
        "folio": str(folio) if folio else None,
        "causa": causa,
        "solucion": solucion,
        "candidatos_activo": candidatos,
    }
    try:
        r = requests.post(f"{SUPABASE_URL}/rest/v1/pme_fracttal_solicitudes", headers=headers, json=[payload], timeout=15)
        if r.status_code not in (200, 201, 204):
            log(f"⚠️ No se pudo registrar el intento de solicitud Fracttal de {sede}: {r.status_code} {r.text[:200]}")
    except Exception as e:
        log(f"⚠️ No se pudo registrar el intento de solicitud Fracttal de {sede}: {e}")


def obtener_historial_solicitudes_fracttal():
    """Historial completo de intentos de creación de Solicitud de Servicio
    en Fracttal (exitosos y fallidos), mas recientes primero. Alimenta la
    columna "Solicitudes Fracttal" del modal de medidores - ver
    agrupar_historial_fracttal_por_sede()."""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept-Profile": "energia",
    }
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/pme_fracttal_solicitudes",
            params={"select": "*", "order": "creado_el.desc", "limit": "1000"},
            headers=headers,
            timeout=15
        )
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        log(f"⚠️ No se pudo cargar el historial de solicitudes Fracttal (energia.pme_fracttal_solicitudes): {e}")
    return []


def agrupar_historial_fracttal_por_sede():
    """Agrupa obtener_historial_solicitudes_fracttal() por sede
    normalizada (mismo cruce que agrupar_medidores_por_sede, para que el
    historial matchee sin importar que 2 especialidades escriban el
    nombre de la sede distinto). Devuelve {sede_normalizada: [intentos]},
    cada intento ya ordenado mas reciente primero."""
    agrupado = {}
    for item in obtener_historial_solicitudes_fracttal():
        clave = normalizar_sede(item.get('sede', ''))
        agrupado.setdefault(clave, []).append(item)
    return agrupado


def _registrar_intento_itlus_fractal(descripcion, exito, id_item=None, activo_descripcion=None,
                                      fecha_incidente=None, solicitado_por='', email_solicitado_por='',
                                      referencia='', activo_maestro='', folio=None, causa=None, solucion=None,
                                      candidatos=None, origen='manual', archivo_origen=None):
    """
    Guarda en public.itlus_fractal_solicitudes UN registro historico (log
    append-only, igual que _registrar_intento_fracttal) de cada intento de
    creacion manual/masiva de Solicitud de Servicio en Fracttal desde
    Itlus Fractal. Tabla separada de pme_fracttal_solicitudes porque esa
    es especifica del flujo automatico por sede+especialidad PME (fuerza
    columnas sede/servicios que no aplican aca).

    candidatos: lista de {id_item, code, description} cuando la busqueda
    de activo (buscar_activos_fracttal) fue ambigua (0 o >1 resultados) -
    misma idea que en pme_fracttal_solicitudes, para mostrar botones
    "Usar este" en la tabla de revision de la carga masiva.

    origen: 'manual' o 'excel'. archivo_origen: nombre del Excel subido,
    solo cuando origen='excel'.
    """
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "descripcion": descripcion,
        "exito": bool(exito),
        "id_item": int(id_item) if id_item else None,
        "activo_descripcion": activo_descripcion,
        "fecha_incidente": fecha_incidente.isoformat() if fecha_incidente else None,
        "solicitado_por": solicitado_por or None,
        "email_solicitado_por": email_solicitado_por or None,
        "referencia": referencia or None,
        "activo_maestro": activo_maestro or None,
        "folio": str(folio) if folio else None,
        "causa": causa,
        "solucion": solucion,
        "candidatos": candidatos,
        "origen": origen,
        "archivo_origen": archivo_origen,
    }
    try:
        r = requests.post(f"{SUPABASE_URL}/rest/v1/itlus_fractal_solicitudes", headers=headers, json=[payload], timeout=15)
        if r.status_code not in (200, 201, 204):
            log(f"⚠️ No se pudo registrar el intento de solicitud Itlus Fractal: {r.status_code} {r.text[:200]}")
    except Exception as e:
        log(f"⚠️ No se pudo registrar el intento de solicitud Itlus Fractal: {e}")


def obtener_historial_itlus_fractal():
    """Historial completo de intentos de creación manual/masiva de
    Solicitud de Servicio en Fracttal desde Itlus Fractal, más recientes
    primero."""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/itlus_fractal_solicitudes",
            params={"select": "*", "order": "creado_el.desc", "limit": "1000"},
            headers=headers,
            timeout=15
        )
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        log(f"⚠️ No se pudo cargar el historial de Itlus Fractal (public.itlus_fractal_solicitudes): {e}")
    return []


def crear_solicitud_fracttal_manual(descripcion, id_item, activo_descripcion=None, fecha_incidente=None,
                                     solicitado_por='', email_solicitado_por='', referencia='',
                                     activo_maestro='', session=None):
    """
    Crea UNA Solicitud de Servicio en Fracttal desde la tabla manual de
    Itlus Fractal y registra el intento en public.itlus_fractal_solicitudes
    - junta crear_solicitud_fracttal() + _registrar_intento_itlus_fractal()
    en una sola llamada, igual que reintentar_solicitud_fracttal() hace
    para el flujo automático. Devuelve un dict listo para servir como JSON
    al frontend: {exito, folio, causa, solucion}.
    """
    session = session or _iniciar_sesion_fracttal()
    folio, causa, solucion = crear_solicitud_fracttal(
        descripcion, id_item, session=session, fecha_incidente=fecha_incidente,
        solicitado_por=solicitado_por, email_solicitado_por=email_solicitado_por,
        creada_por=solicitado_por or 'Itlus Fractal (Manual)',
    )
    exito = bool(folio)
    _registrar_intento_itlus_fractal(
        descripcion, exito, id_item=id_item, activo_descripcion=activo_descripcion,
        fecha_incidente=fecha_incidente, solicitado_por=solicitado_por,
        email_solicitado_por=email_solicitado_por, referencia=referencia,
        activo_maestro=activo_maestro, folio=folio, causa=causa, solucion=solucion, origen='manual',
    )
    return {'exito': exito, 'folio': folio, 'causa': causa, 'solucion': solucion}


_RUTA_SEDES_RESUMEN = os.path.join(os.path.dirname(__file__), "sedes_resumen.json")
_SEDES_RESUMEN_CACHE = None


def obtener_sedes_resumen_local():
    """Carga en memoria la lista de 515 sedes locales (ultrarrápido, ~1ms)."""
    global _SEDES_RESUMEN_CACHE
    if _SEDES_RESUMEN_CACHE is not None:
        return _SEDES_RESUMEN_CACHE
    if os.path.exists(_RUTA_SEDES_RESUMEN):
        try:
            with open(_RUTA_SEDES_RESUMEN, 'r', encoding='utf-8') as f:
                _SEDES_RESUMEN_CACHE = json.load(f)
                return _SEDES_RESUMEN_CACHE
        except Exception:
            pass
    try:
        import urllib.request
        r = urllib.request.urlopen("http://127.0.0.1:3001/api/itlus-fractal/activos-maestros/sedes", timeout=2)
        d = json.loads(r.read())
        _SEDES_RESUMEN_CACHE = [{'id_location': s['id_location'], 'code': s['code'], 'description': s['description']} for s in d.get('data', [])]
        return _SEDES_RESUMEN_CACHE
    except Exception:
        return []


def resolver_sede_ceco_local(texto_sede, texto_activo=None):
    """
    Resuelve la sede en la base de datos local de 515 sedes aplicando:
    1. CECO numérico exacto (6 a 8 dígitos, ej: 24107026 o 25102006).
    2. Reglas de marca en sede o activo:
       - 24, makro, mk, o activo A124... -> Filtra tiendas Makro (A124 / CECO 24...).
       - 25, vea, pvh, pvs, plaza, o activo A125... -> Filtra tiendas Plaza Vea (A125 / CECO 25...).
    3. Priorización automática de tiendas físicas sobre E-Tienda, DDC o CDC.
    """
    if not texto_sede:
        return []
    sedes = obtener_sedes_resumen_local()
    if not sedes:
        return []

    t = texto_sede.strip().lower()
    act = (texto_activo or '').strip().lower()

    # 1. Búsqueda por número de CECO exacto (6 a 8 dígitos)
    nums = re.findall(r'\b(24\d{5,6}|25\d{5,6})\b', t)
    if not nums and act:
        nums = re.findall(r'\b(24\d{5,6}|25\d{5,6})\b', act)
    if nums:
        coincidencias = [s for s in sedes if nums[0] in s.get('code', '') or nums[0] in s.get('description', '')]
        if coincidencias:
            return coincidencias

    # 2. Detección de marca / prefijo (en sede o en activo)
    es_makro = bool(re.search(r'\b(mk|makro|24)\b', t) or re.search(r'\b(a124|mk|makro)\b', act) or act.startswith('a124'))
    es_vea = bool(re.search(r'\b(vea|pvh|pvs|plaza|25)\b', t) or re.search(r'\b(a125|pvh|pvs|vea)\b', act) or act.startswith('a125'))

    # Limpiar palabras genéricas para aislar el distrito o ciudad
    limpio = re.sub(r'\b(mk|makro|vea|plaza|pvh|pvs|tienda|sede|ceco|24|25)\b', '', t).strip()
    termino_busqueda = limpio if len(limpio) >= 3 else t

    coincidencias = [s for s in sedes if termino_busqueda in s.get('description', '').lower() or termino_busqueda in s.get('code', '').lower()]

    if es_makro:
        filtradas = [s for s in coincidencias if 'mk' in s.get('description', '').lower() or '-24' in s.get('code', '')]
        if filtradas:
            coincidencias = filtradas
    elif es_vea:
        filtradas = [s for s in coincidencias if any(k in s.get('description', '').lower() for k in ('pvh', 'pvs', 'vea')) or '-25' in s.get('code', '')]
        if filtradas:
            coincidencias = filtradas

    # Priorizar tiendas físicas (las que no empiezan con E-Tienda, DDC, CDC, Tienda Virtual)
    def prioridad_tienda(s):
        desc = s.get('description', '').lower()
        if re.match(r'^(e-tienda|tienda virtual|ddc|cdc)\b', desc):
            return 1
        return 0

    coincidencias.sort(key=prioridad_tienda)
    return coincidencias


def _buscar_equipos_en_sede(session, id_location, nombre_ubicacion, texto_activo):
    """
    Búsqueda directa y ultra rápida (< 1s) de equipos pertenecientes a una localización en Fracttal.
    Filtra por description y por código de equipo.
    """
    if not texto_activo or not texto_activo.strip():
        return [], "Falta especificar el activo a buscar."
    texto = texto_activo.strip()

    # 1. Búsqueda por description
    filtro_desc = [
        {"operator": "=", "property": "id_type_item", "value": 2},
        {"operator": "like", "property": "description", "value": texto}
    ]
    resultados_rpc, _ = _rpc_fracttal(session, "inventories.items_list", {
        "id_location": id_location,
        "id_type_item": 0, "id_type_item_not": "4",
        "filter": filtro_desc,
        "limit": 50
    })
    candidatos = [
        {"id_item": r.get("id_item"), "code": r.get("code", ""), "description": r.get("description", "")}
        for r in (resultados_rpc or [])
    ]

    # 2. Si no hubo match por description, intentar por código (ej. A125-0006915-EG)
    if not candidatos:
        filtro_code = [
            {"operator": "=", "property": "id_type_item", "value": 2},
            {"operator": "like", "property": "code", "value": texto}
        ]
        res_code, _ = _rpc_fracttal(session, "inventories.items_list", {
            "id_location": id_location,
            "id_type_item": 0, "id_type_item_not": "4",
            "filter": filtro_code,
            "limit": 50
        })
        candidatos = [
            {"id_item": r.get("id_item"), "code": r.get("code", ""), "description": r.get("description", "")}
            for r in (res_code or [])
        ]

    error = None
    if not candidatos:
        error = f"En la sede '{nombre_ubicacion}' no se encontró ningún equipo para '{texto}'."
    return candidatos, error


_COLUMNAS_EXCEL_ITLUS_FRACTAL = {
    'descripcion': 'descripcion', 'descripción': 'descripcion',
    'activo': 'activo', 'ceco': 'activo', 'activo maestro': 'activo',
    'sede ceco': 'sede_ceco', 'sede': 'sede_ceco', 'localizacion': 'sede_ceco', 'localización': 'sede_ceco',
    'fecha incidente': 'fecha_incidente', 'fecha del incidente': 'fecha_incidente',
    'solicitado por': 'solicitado_por',
    'correo': 'email', 'email': 'email', 'correo del solicitante': 'email',
    'referencia': 'referencia',
}


def crear_solicitudes_fracttal_masivo(ruta_excel, archivo_origen=None):
    """
    Crea EN SERIE (no en paralelo, para no golpear a Fracttal con muchos
    logins seguidos - mismo criterio que el modal de reintento masivo de
    PME) una Solicitud de Servicio en Fracttal por cada fila de un Excel
    subido desde Itlus Fractal. Columnas esperadas (sin importar
    mayúsculas/tildes): Descripción, Activo maestro, SEDE CECO, Fecha del
    Incidente, Solicitado por, Correo, Referencia.

    Para cada fila:
      - Busca el activo por el texto de la columna "Activo maestro" o "Activo"
        (buscar_activos_fracttal). Si hay exactamente 1 resultado, crea la
        solicitud. Si hay 0 o más de 1, NO adivina: registra la fila como
        fallida con los candidatos guardados (o el motivo si fue 0), para
        resolverla a mano desde la tabla de revisión (mismo patrón "Usar
        este" que ya existe para el flujo automático).

    Devuelve una lista de dicts, uno por fila, en el mismo orden del Excel:
    {fila, descripcion, exito, folio, causa, solucion, candidatos}.
    """
    import pandas as pd

    try:
        df = pd.read_excel(ruta_excel, dtype=str)
    except Exception as e:
        return [{'fila': 0, 'exito': False, 'causa': f'No se pudo leer el Excel: {e}',
                  'solucion': 'Verificar que el archivo sea un .xlsx válido.'}]

    df.columns = [str(c).strip().lower() for c in df.columns]
    df = df.rename(columns={k: v for k, v in _COLUMNAS_EXCEL_ITLUS_FRACTAL.items() if k in df.columns})

    faltantes = [c for c in ('descripcion', 'activo') if c not in df.columns]
    if faltantes:
        return [{'fila': 0, 'exito': False,
                  'causa': f"Faltan columnas obligatorias en el Excel: {', '.join(faltantes)}.",
                  'solucion': 'Usar las columnas Descripción y Activo maestro como mínimo (SEDE CECO, Fecha del Incidente, Solicitado por, Correo, Referencia son opcionales).'}]

    session = _iniciar_sesion_fracttal()
    resultados = []

    for i, fila in df.iterrows():
        numero_fila = i + 2  # +2: encabezado (fila 1 del Excel) + índice 0-based
        descripcion = str(fila.get('descripcion') or '').strip()
        texto_activo = str(fila.get('activo') or '').strip()
        sede_ceco = str(fila.get('sede_ceco') or '').strip()
        solicitado_por = str(fila.get('solicitado_por') or '').strip()
        email_solicitado_por = str(fila.get('email') or '').strip()
        referencia = str(fila.get('referencia') or '').strip()
        fecha_incidente_txt = str(fila.get('fecha_incidente') or '').strip()

        # Si descripción y activo están vacíos o 'nan', ignorar fila (fila vacía o remanente de Excel)
        es_vacio_desc = not descripcion or descripcion.lower() == 'nan'
        es_vacio_act = not texto_activo or texto_activo.lower() == 'nan'
        if es_vacio_desc and es_vacio_act:
            continue

        if es_vacio_desc or es_vacio_act:
            resultado = {'fila': numero_fila, 'descripcion': descripcion if not es_vacio_desc else '—', 'exito': False,
                         'sede_ceco': sede_ceco, 'activo_texto': texto_activo,
                         'solicitado_por': solicitado_por, 'email': email_solicitado_por, 'referencia': referencia,
                         'causa': 'Faltan Descripción y/o Activo maestro en esta fila.',
                         'solucion': 'Completar ambos campos y volver a intentar esta fila.'}
            _registrar_intento_itlus_fractal(
                descripcion, False, causa=resultado['causa'], solucion=resultado['solucion'],
                solicitado_por=solicitado_por, email_solicitado_por=email_solicitado_por,
                referencia=referencia, origen='excel', archivo_origen=archivo_origen)
            resultados.append(resultado)
            continue

        fecha_incidente = None
        if fecha_incidente_txt and fecha_incidente_txt.lower() != 'nan':
            try:
                fecha_incidente = pd.to_datetime(fecha_incidente_txt).to_pydatetime()
                if fecha_incidente.tzinfo is None:
                    fecha_incidente = fecha_incidente.replace(tzinfo=timezone.utc)
            except Exception:
                fecha_incidente = None

        candidatos = []
        candidatos_sedes = []
        error_busqueda = None

        # Si el Excel trae la columna SEDE CECO (ej. "CALLAO", "CALLAO 24", "24107026", "LA PERLA"):
        # Búsqueda jerárquica ultrarrápida (0ms en base local de 515 sedes):
        # 1) Resolver la sede aplicando reglas 24 (Makro) y 25 (Plaza Vea) -> 2) Equipos de esa sede en Fracttal (< 1s)
        if sede_ceco and sede_ceco.lower() != 'nan':
            sedes_coincidentes = resolver_sede_ceco_local(sede_ceco, texto_activo=texto_activo)

            # Fallback a Fracttal solo si no se encontró en la base local
            if not sedes_coincidentes:
                ubicaciones, err_ub = buscar_activos_fracttal(sede_ceco, session=session)
                if ubicaciones:
                    sedes_coincidentes = [{'id_location': u['id_item'], 'code': u.get('code', ''), 'description': u.get('description', '')} for u in ubicaciones]

            # Priorizar tiendas físicas (Makro / Plaza Vea) sobre digitales o almacenes
            tiendas_fisicas = [s for s in sedes_coincidentes if not re.match(r'^(e-tienda|tienda virtual|ddc|cdc)\b', s.get('description', '').lower())]
            candidatas_evaluar = tiendas_fisicas if tiendas_fisicas else sedes_coincidentes

            if len(candidatas_evaluar) == 1:
                # Sede única y clara (ej: Makro Callao o Plaza Vea Callao identificada con precisión)
                sede_elegida = candidatas_evaluar[0]
                id_location = sede_elegida['id_location']
                nombre_ubicacion = sede_elegida['description']
                candidatos, error_busqueda = _buscar_equipos_en_sede(session, id_location, nombre_ubicacion, texto_activo)
            elif len(candidatas_evaluar) > 1:
                # Ambigüedad (ej: se escribió solo "CALLAO"):
                # Primero probamos si el equipo solo existe en una de las sedes candidatas
                candidatos_por_sede = []
                for cand in candidatas_evaluar[:3]:
                    eqs, _ = _buscar_equipos_en_sede(session, cand['id_location'], cand['description'], texto_activo)
                    if eqs:
                        candidatos_por_sede.append((cand, eqs))

                if len(candidatos_por_sede) == 1:
                    # El equipo solo existía en una de las sedes! Resuelto automáticamente
                    sede_elegida, candidatos = candidatos_por_sede[0]
                    nombre_ubicacion = sede_elegida['description']
                else:
                    # Sigue siendo ambigua: guardamos las sedes candidatas para que el usuario elija
                    candidatos_sedes = [
                        {
                            'id_location': s['id_location'],
                            'code': s.get('code', ''),
                            'description': s.get('description', ''),
                            'marca': 'Makro (CECO 24)' if '-24' in s.get('code', '') or 'mk' in s.get('description', '').lower() else ('Plaza Vea (CECO 25)' if '-25' in s.get('code', '') or any(k in s.get('description', '').lower() for k in ('pvh', 'pvs', 'vea')) else 'Otra')
                        }
                        for s in candidatas_evaluar[:4]
                    ]
                    error_busqueda = f"Sede ambigua para '{sede_ceco}': especifica si es Makro (24) o Plaza Vea (25)."
            else:
                error_busqueda = f"No se encontró la localización/sede '{sede_ceco}' en la base de datos."

        # Si no se especificó sede o no se hallaron equipos por sede, buscar de manera global
        if not candidatos and not error_busqueda:
            candidatos, error_busqueda = buscar_activos_fracttal(texto_activo, session=session)

        if len(candidatos) != 1:
            if len(candidatos) == 0:
                causa = error_busqueda or f"No se encontró ningún activo en Fracttal para '{texto_activo}'."
            else:
                causa = f"Se encontraron {len(candidatos)} activos para '{texto_activo}'" + (f" en la sede '{sede_ceco}'." if sede_ceco else ". Especifica 'SEDE CECO' para acotar.")
            solucion = 'Elegir manualmente cuál es el activo correcto usando el botón Validar.'
            _registrar_intento_itlus_fractal(
                descripcion, False, causa=causa, solucion=solucion, candidatos=candidatos[:8] or None,
                fecha_incidente=fecha_incidente, solicitado_por=solicitado_por,
                email_solicitado_por=email_solicitado_por, referencia=referencia,
                origen='excel', archivo_origen=archivo_origen)
            resultados.append({'fila': numero_fila, 'descripcion': descripcion, 'exito': False, 'causa': causa,
                                'sede_ceco': sede_ceco, 'activo_texto': texto_activo,
                                'solicitado_por': solicitado_por, 'email': email_solicitado_por, 'referencia': referencia,
                                'solucion': solucion, 'candidatos': candidatos[:8] or None,
                                'candidatos_sedes': candidatos_sedes or None})
            continue

        id_item = candidatos[0]['id_item']
        activo_descripcion = candidatos[0]['description']
        folio, causa, solucion = crear_solicitud_fracttal(
            descripcion, id_item, session=session, fecha_incidente=fecha_incidente,
            solicitado_por=solicitado_por, email_solicitado_por=email_solicitado_por,
            creada_por=solicitado_por or 'Itlus Fractal (Excel)',
        )
        exito = bool(folio)
        _registrar_intento_itlus_fractal(
            descripcion, exito, id_item=id_item, activo_descripcion=activo_descripcion,
            fecha_incidente=fecha_incidente, solicitado_por=solicitado_por,
            email_solicitado_por=email_solicitado_por, referencia=referencia,
            folio=folio, causa=causa, solucion=solucion, origen='excel', archivo_origen=archivo_origen)
        resultados.append({'fila': numero_fila, 'descripcion': descripcion, 'exito': exito, 'folio': folio,
                            'sede_ceco': sede_ceco, 'activo_texto': texto_activo,
                            'causa': causa, 'solucion': solucion, 'activo_descripcion': activo_descripcion})

    return resultados


def resumen_solicitudes_fracttal():
    """
    Vista resumen -UNA fila por sede- para el botón/modal dedicado de
    "Solicitudes Fracttal": a diferencia del historial crudo (que tiene
    una fila por cada intento, incluidos reintentos repetidos), esto
    muestra el estado actual de cada sede que alguna vez tuvo un intento:
    el resultado del intento MÁS RECIENTE (éxito con folio, o fallo con
    causa/solución) y el último folio vigente conocido (el de la última
    vez que SÍ se creó, aunque el intento más reciente haya fallado -
    ej. una sede con 3 servicios: 2 ya tienen solicitud creada y el 3ro
    recién falló).

    Devuelve una lista con las sedes PENDIENTES primero (para que salten a
    la vista en el modal) y las ya creadas despues, cada grupo ordenado
    por fecha del ultimo intento (mas reciente primero). Cada fila:
    {sede, exito (del último intento), servicios (del último intento),
    causa, solucion, candidatos (lista de {id_location, descripcion} si el
    fallo fue por ubicación ambigua, o None), folio_vigente (o None),
    intentos (cuántas veces se intentó en total), creado_el (fecha del
    último intento)}.
    """
    historial = obtener_historial_solicitudes_fracttal()  # ya viene ordenado creado_el desc
    por_sede = {}
    for item in historial:
        clave = normalizar_sede(item.get('sede', ''))
        if clave not in por_sede:
            por_sede[clave] = {
                'sede': item.get('sede', ''),
                'exito': item.get('exito'),
                'servicios': item.get('servicios') or [],
                'causa': item.get('causa'),
                'solucion': item.get('solucion'),
                'candidatos': item.get('candidatos_activo'),
                'folio_vigente': None,
                'intentos': 0,
                'creado_el': item.get('creado_el'),
            }
        fila = por_sede[clave]
        fila['intentos'] += 1
        if item.get('exito') and item.get('folio') and not fila['folio_vigente']:
            fila['folio_vigente'] = item.get('folio')
    # Doble sort ESTABLE: primero por fecha (mas reciente primero) para el
    # orden dentro de cada grupo, despues por exito (False antes que True)
    # para que las pendientes queden arriba - Python preserva el orden por
    # fecha ya aplicado dentro de cada grupo al ser un sort estable.
    filas = sorted(por_sede.values(), key=lambda f: f.get('creado_el') or '', reverse=True)
    filas.sort(key=lambda f: bool(f.get('exito')))
    return filas


def sincronizar_solicitudes_fracttal():
    """
    Unifica POR SEDE (las 4 especialidades juntas) la creacion de
    Solicitudes de Servicio en Fracttal cuando uno o mas medidores dejan
    de reportar - en vez de una solicitud por medidor.

    Ej: si en una sede hay 2 medidores en ALERTA (HVAC e Iluminacion) se
    crea UNA sola solicitud consolidada para ambos. Si despues, mientras
    esos 2 siguen sin arreglarse, se agrega un 3ro (Frio) en la misma
    sede, se crea una solicitud NUEVA solo para el 3ro (no se repiten
    los 2 ya reportados). Si el conjunto en ALERTA no cambio desde la
    ultima revision, no se crea nada. Cuando la sede se recupera del
    todo (0 medidores en ALERTA), se limpia su registro para que la
    proxima falla -aunque sea del mismo medidor de siempre- abra una
    solicitud nueva desde cero.

    La llama verificar_estado_medidor() cada vez que CAMBIA el estado de
    algun medidor (no en cada corrida sin cambios), para revisar la foto
    completa de las 4 especialidades en ese momento.
    """
    medidores_alerta = obtener_medidores_desconectados_todos(
        ['HVAC', 'Iluminación', 'Frío Alimentario', 'General']
    )
    grupos = agrupar_medidores_por_sede(medidores_alerta)
    cubiertos_por_sede = cargar_incidentes_fracttal()

    # Login UNA sola vez para toda la corrida (perezoso: solo si hace
    # falta), en vez de una por sede - evita decenas de logins seguidos
    # contra Fracttal cuando hay varias sedes con delta a la vez. Se
    # reutiliza la MISMA requests.Session (no solo el token) para que las
    # cookies de sesion viajen en cada llamada - sin eso Fracttal rechaza
    # las llamadas siguientes con USER_NOT_LOGIN aunque el token sea valido.
    session = None

    claves_con_alerta = set()
    for grupo in grupos:
        sede = grupo['sede']
        clave = normalizar_sede(sede)
        claves_con_alerta.add(clave)

        servicios_actuales = set(grupo['servicios_afectados'])
        servicios_cubiertos = cubiertos_por_sede.get(clave, set())
        delta = servicios_actuales - servicios_cubiertos
        if not delta:
            continue  # nada nuevo en esta sede desde la ultima solicitud

        if session is None:
            session = _iniciar_sesion_fracttal()

        servicios_delta_txt = '-'.join(sorted(delta))
        descripcion = (
            f"PME: Medidor{'es' if len(delta) > 1 else ''} {servicios_delta_txt} sin datos en {sede}. "
            + (f"Última fecha con datos: {grupo['ultima_fecha_con_datos']}." if grupo.get('ultima_fecha_con_datos') else "Nunca reportaron datos.")
            + " Verificar conexión/comunicación de cada equipo; podría requerir mantenimiento o reemplazo."
        )

        id_item, causa, solucion, candidatos = resolver_activo_tablero_sede(sede, session=session)
        if not id_item:
            _registrar_intento_fracttal(sede, sorted(delta), descripcion, exito=False, causa=causa, solucion=solucion, candidatos=candidatos)
            continue  # no se pudo resolver el activo todavia; se reintenta en el proximo cambio de estado

        folio, causa, solucion = crear_solicitud_fracttal(descripcion, id_item, session=session)
        if folio:
            _guardar_incidente_fracttal(clave, servicios_cubiertos | delta, folio)
            _registrar_intento_fracttal(sede, sorted(delta), descripcion, exito=True, folio=folio)
            enviar_telegram(f"🛠️ Fracttal: solicitud #{folio} creada para {sede} ({servicios_delta_txt}).")
        else:
            _registrar_intento_fracttal(sede, sorted(delta), descripcion, exito=False, causa=causa, solucion=solucion)

    # Sedes que ya no tienen NINGUN medidor en ALERTA: limpiar su registro
    # para que la proxima falla abra una solicitud nueva desde cero.
    for clave in list(cubiertos_por_sede.keys()):
        if clave not in claves_con_alerta:
            _borrar_incidente_fracttal(clave)


def reintentar_solicitud_fracttal(sede):
    """
    Fuerza un reintento MANUAL de creación de Solicitud Fracttal para una
    sede puntual, sin esperar al próximo cambio de estado - pensado para
    el botón "Reintentar" del modal, cuando el usuario ya resolvió a mano
    lo que causaba el fallo anterior (ej. afinó el activo en Fracttal) y
    quiere probar de nuevo ya mismo.

    Usa EXACTAMENTE la misma lógica de delta que sincronizar_solicitudes_
    fracttal() (nunca los servicios ya cubiertos por un folio abierto, solo
    lo que falta): así un reintento nunca puede generar una solicitud
    duplicada/redundante para algo que ya tiene ticket - si todo lo que
    esa sede tiene en ALERTA ya está cubierto, no crea nada y lo informa.

    Registra el intento en el historial igual que la versión automática
    (éxito con folio, o fallo con causa/solución) y devuelve un dict listo
    para mostrarse directo en el modal: {'exito': bool, 'folio': str|None,
    'causa': str|None, 'solucion': str|None, 'servicios': [...]}.
    """
    medidores_alerta = obtener_medidores_desconectados_todos(
        ['HVAC', 'Iluminación', 'Frío Alimentario', 'General']
    )
    grupos = agrupar_medidores_por_sede(medidores_alerta)
    clave_buscada = normalizar_sede(sede)
    grupo = next((g for g in grupos if normalizar_sede(g['sede']) == clave_buscada), None)
    if not grupo:
        return {
            'exito': False, 'folio': None, 'servicios': [],
            'causa': f"La sede '{sede}' ya no tiene ningún medidor en ALERTA.",
            'solucion': "No hace falta crear nada; si esto es inesperado, verifica que el nombre de la sede sea correcto.",
        }

    sede_real = grupo['sede']
    servicios_actuales = set(grupo['servicios_afectados'])
    servicios_cubiertos = cargar_incidentes_fracttal().get(clave_buscada, set())
    delta = servicios_actuales - servicios_cubiertos
    if not delta:
        return {
            'exito': True, 'folio': None, 'servicios': sorted(servicios_actuales),
            'causa': None,
            'solucion': "Ya está todo cubierto por una solicitud abierta en Fracttal; no había nada pendiente para reintentar.",
        }

    servicios_txt = '-'.join(sorted(delta))
    descripcion = (
        f"PME: Medidor{'es' if len(delta) > 1 else ''} {servicios_txt} sin datos en {sede_real}. "
        + (f"Última fecha con datos: {grupo['ultima_fecha_con_datos']}." if grupo.get('ultima_fecha_con_datos') else "Nunca reportaron datos.")
        + " Verificar conexión/comunicación de cada equipo; podría requerir mantenimiento o reemplazo."
    )

    id_item, causa, solucion, candidatos = resolver_activo_tablero_sede(sede_real)
    if not id_item:
        _registrar_intento_fracttal(sede_real, sorted(delta), descripcion, exito=False, causa=causa, solucion=solucion, candidatos=candidatos)
        return {'exito': False, 'folio': None, 'servicios': sorted(delta), 'causa': causa, 'solucion': solucion, 'candidatos': candidatos}

    folio, causa, solucion = crear_solicitud_fracttal(descripcion, id_item)
    if folio:
        _guardar_incidente_fracttal(clave_buscada, servicios_cubiertos | delta, folio)
        _registrar_intento_fracttal(sede_real, sorted(delta), descripcion, exito=True, folio=folio)
        enviar_telegram(f"🛠️ Fracttal: solicitud #{folio} creada manualmente para {sede_real} ({servicios_txt}).")
        return {'exito': True, 'folio': folio, 'servicios': sorted(delta), 'causa': None, 'solucion': None}

    _registrar_intento_fracttal(sede_real, sorted(delta), descripcion, exito=False, causa=causa, solucion=solucion)
    return {'exito': False, 'folio': None, 'servicios': sorted(delta), 'causa': causa, 'solucion': solucion}


def cargar_mapa_devices_pme():
    """
    Lee energia.master_devices_pme: el catalogo crudo de dispositivos de
    PME (ION_Network.dbo.Device), sincronizado aparte via
    sync_pme_devices_master.py y completado a mano por el usuario
    (columnas ceco / servicio). Devuelve {pme_device_id: {'ceco':...,
    'servicio':...}}; usar junto con resolver_ceco_dispositivo().
    """
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept-Profile": "energia",
    }
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/master_devices_pme",
            params={"select": "pme_device_id,ceco,servicio"},
            headers=headers,
            timeout=15
        )
        if r.status_code == 200:
            return {
                fila['pme_device_id']: {'ceco': fila.get('ceco'), 'servicio': fila.get('servicio')}
                for fila in r.json()
            }
    except Exception as e:
        log(f"⚠️ No se pudo cargar el catálogo de dispositivos PME (energia.master_devices_pme): {e}")
    return {}


def cargar_mapa_virtual_meters_pme():
    """
    Lee energia.master_virtual_meters_pme: catalogo de medidores VIRTUALES
    de PME (una formula que suma 2+ dispositivos fisicos, identificada por
    un GUID de nodo en vez de un pme_device_id entero - ver
    _decodificar_serie). Se llena a mano, igual que master_devices_pme.
    Devuelve {virtual_meter_id: {'ceco':..., 'servicio':...}}.
    """
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept-Profile": "energia",
    }
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/master_virtual_meters_pme",
            params={"select": "virtual_meter_id,ceco,servicio"},
            headers=headers,
            timeout=15
        )
        if r.status_code == 200:
            return {
                fila['virtual_meter_id']: {'ceco': fila.get('ceco'), 'servicio': fila.get('servicio')}
                for fila in r.json()
            }
    except Exception as e:
        log(f"⚠️ No se pudo cargar el catálogo de medidores virtuales PME (energia.master_virtual_meters_pme): {e}")
    return {}


_ALERTADO_INCONSISTENCIA_SERVICIO = set()


def _revisar_inconsistencia_servicio(tipo, id_valor, servicio_bot, servicio_etiquetado, medidor_nombre, tabla_catalogo):
    if not servicio_etiquetado or servicio_etiquetado == servicio_bot:
        return
    clave_alerta = (tipo, id_valor, servicio_bot)
    if clave_alerta in _ALERTADO_INCONSISTENCIA_SERVICIO:
        return
    _ALERTADO_INCONSISTENCIA_SERVICIO.add(clave_alerta)
    alerta_sistema(
        f"Inconsistencia de servicio: el bot de {servicio_bot} bajó el gráfico '{medidor_nombre}' "
        f"({tipo} {id_valor}), pero en {tabla_catalogo} está etiquetado como '{servicio_etiquetado}'. "
        f"Revisar cuál asignación está mal."
    )


def resolver_ceco_dispositivo(servicio, medidor_nombre, device_ids, mapa_ceco, mapa_devices,
                               virtual_meter_ids=None, mapa_virtual_meters=None):
    """
    Resuelve el CECO de una fila con 3 fuentes, en orden de prioridad:
    1. Por DeviceId (inmutable) contra energia.master_devices_pme, si el
       usuario ya lo cargo ahi a mano - no depende del titulo del grafico,
       asi que sobrevive a un renombre. Aplica a graficos de dispositivo
       fisico directo.
    2. Por virtual_meter_id (GUID inmutable) contra
       energia.master_virtual_meters_pme, para graficos que en vez de un
       dispositivo directo son una formula que suma varios (ver
       _decodificar_serie).
    3. Si ninguno de los 2 catalogos tiene CECO cargado todavia (se llenan
       "poco a poco"), cae al metodo anterior por nombre contra
       energia.pme_dispositivos_mapeo.

    De paso, si el 'servicio' etiquetado a mano en cualquiera de los 2
    catalogos no coincide con el servicio que esta corriendo este bot (ej.
    el bot de Frio bajo un grafico etiquetado como Iluminacion), dispara
    una alerta de sistema - no se asume cual de los 2 esta mal, solo se
    avisa para revisarlo a mano. Se alerta una sola vez por (id, servicio
    del bot) por corrida para no inundar.
    """
    mapa_virtual_meters = mapa_virtual_meters or {}
    ceco_por_device = None

    for device_id in (device_ids or []):
        info = mapa_devices.get(device_id)
        if not info:
            continue
        _revisar_inconsistencia_servicio(
            'DeviceId', device_id, servicio, info.get('servicio'), medidor_nombre, 'master_devices_pme'
        )
        if info.get('ceco') and not ceco_por_device:
            ceco_por_device = info['ceco']

    for vm_id in (virtual_meter_ids or []):
        info = mapa_virtual_meters.get(vm_id)
        if not info:
            continue
        _revisar_inconsistencia_servicio(
            'Virtual Meter', vm_id, servicio, info.get('servicio'), medidor_nombre, 'master_virtual_meters_pme'
        )
        if info.get('ceco') and not ceco_por_device:
            ceco_por_device = info['ceco']

    if ceco_por_device:
        return ceco_por_device
    return buscar_ceco(mapa_ceco, medidor_nombre)


def cargar_config_sedes(servicio):
    """
    Lee energia.pme_config_sedes: overrides por sede de los umbrales de
    desperdicio (usado por cargas continuas 24/7 como Frio Alimentario,
    donde "fuera de horario" no aplica) mas los datos de infraestructura
    (m2 de sala de ventas, carga termica de diseño) que se van llenando
    progresivamente para habilitar comparaciones entre sedes a futuro.
    Devuelve {sede: {...}}; una sede sin fila aca usa el valor global del
    panel de esa especialidad (ver resolver_valor_sede).
    """
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept-Profile": "energia",
    }
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/pme_config_sedes",
            params={"servicio": f"eq.{servicio}"},
            headers=headers,
            timeout=15
        )
        if r.status_code == 200:
            return {fila['sede']: fila for fila in r.json()}
    except Exception as e:
        log(f"⚠️ No se pudo cargar la configuración por sede (energia.pme_config_sedes): {e}")
    return {}


def resolver_valor_sede(config_sedes, sede, campo, config_global, campo_global=None, default=None):
    """Prioridad: valor especifico de la sede en pme_config_sedes > valor
    global del panel de la especialidad > default. campo_global permite que
    el nombre del campo difiera entre la tabla y la config global (por
    defecto se asume el mismo nombre)."""
    fila_sede = config_sedes.get(sede) or {}
    valor_sede = fila_sede.get(campo)
    if valor_sede is not None:
        return valor_sede
    return config_global.get(campo_global or campo, default)


def detectar_exceso_maximo_diario(filas, maximo_kwh_dia):
    """
    Señal 1 para cargas continuas (24/7): el total del DIA COMPLETO (suma
    de las 24 horas) no deberia superar este techo, sin importar a que
    hora se dio el consumo. Devuelve una fila por cada fecha que lo superó.
    """
    if not maximo_kwh_dia:
        return []
    por_fecha = {}
    for f in filas:
        por_fecha[f['fecha']] = por_fecha.get(f['fecha'], 0) + f['valor']
    return [
        {'fecha': fecha, 'total_kwh': round(total, 2)}
        for fecha, total in sorted(por_fecha.items())
        if total > maximo_kwh_dia
    ]


def detectar_exceso_maximo_hora(filas, maximo_kwh_hora):
    """
    Señal 2 para cargas continuas: ninguna hora individual (de las 24 del
    dia, sin restringir a una ventana) deberia superar este techo. A
    diferencia del maximo diario, esto atrapa un pico puntual (ej. un
    defrost mal programado) que al promediarse en el total del dia no se
    nota.
    """
    if not maximo_kwh_hora:
        return []
    return [
        {'fecha': f['fecha'], 'hora': f['hora'], 'valor': f['valor']}
        for f in filas if f['valor'] > maximo_kwh_hora
    ]


def calcular_linea_base_dinamica(tabla, sede, umbral_pct=20):
    """
    Señal 4 para cargas continuas: en vez de un umbral fijo, compara el
    promedio diario de la ULTIMA SEMANA COMPLETA (7 dias) contra la semana
    inmediata anterior, usando el historico YA ACUMULADO en Supabase (no
    el rango descargado en la corrida actual), para que funcione sin
    importar el dias_historico configurado. Bloques de 7 dias completos
    (no una division arbitraria) para no mezclar dias de semana con fines
    de semana al comparar.

    Devuelve None si todavia no hay al menos 14 dias de historia
    acumulada para esa sede (no se puede comparar 2 semanas completas).

    Diseño pensado para, mas adelante, poder ajustarse por temperatura /
    grados-dia cruzando con la base del bot climatico -esta funcion es el
    punto unico donde se calcularia ese ajuste, sin tocar el resto del
    pipeline.
    """
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept-Profile": "energia",
    }
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/{tabla}",
            params={"select": "fecha,hora,valor", "sede": f"eq.{sede}", "order": "fecha.desc", "limit": "2000"},
            headers=headers,
            timeout=20
        )
        if r.status_code != 200:
            return None
        filas = r.json()
    except Exception as e:
        log(f"⚠️ No se pudo calcular la línea base dinámica de {sede}: {e}")
        return None

    if not filas:
        return None

    horas_por_fecha = {}
    por_fecha = {}
    for f in filas:
        horas_por_fecha.setdefault(f['fecha'], {})[f['hora']] = horas_por_fecha.get(f['fecha'], {}).get(f['hora'], 0) + float(f['valor'])
        por_fecha[f['fecha']] = por_fecha.get(f['fecha'], 0) + float(f['valor'])

    fechas_ordenadas = sorted(por_fecha.keys(), reverse=True)
    if len(fechas_ordenadas) < 14:
        return None

    # Si la corrida es a mitad de dia, el dia mas reciente (fechas_ordenadas[0])
    # solo tiene datos hasta esa hora — comparar ese dia a medias contra un
    # dia COMPLETO de fechas_ordenadas[7] (7 dias antes) mostraria una mejora
    # falsa. Se topa a la misma hora en ambos lados (ver
    # calcular_comparacion_corte_parcial, misma logica).
    dia_mas_reciente = fechas_ordenadas[0]
    horas_dia_reciente = sorted(horas_por_fecha.get(dia_mas_reciente, {}).keys())
    horas_esperadas = max((len(horas_por_fecha[f]) for f in fechas_ordenadas[1:]), default=len(horas_dia_reciente))
    dia_reciente_completo = len(horas_dia_reciente) >= horas_esperadas
    hora_corte = horas_dia_reciente[-1] if horas_dia_reciente else None

    def _valor_dia(fecha, topar_a_hora_corte):
        if topar_a_hora_corte and hora_corte:
            return sum(v for h, v in horas_por_fecha[fecha].items() if h <= hora_corte)
        return por_fecha[fecha]

    semana_actual = fechas_ordenadas[:7]
    semana_referencia = fechas_ordenadas[7:14]
    topar = not dia_reciente_completo
    promedio_actual = sum(
        _valor_dia(f, topar_a_hora_corte=(topar and f == dia_mas_reciente)) for f in semana_actual
    ) / 7
    promedio_referencia = sum(
        _valor_dia(f, topar_a_hora_corte=(topar and f == semana_referencia[0])) for f in semana_referencia
    ) / 7
    variacion = _variacion_pct(promedio_actual, promedio_referencia)

    return {
        'promedio_actual_kwh_dia': round(promedio_actual, 2),
        'promedio_referencia_kwh_dia': round(promedio_referencia, 2),
        'variacion_pct': variacion,
        'supera_umbral': bool(variacion is not None and variacion > umbral_pct),
        'hora_corte': hora_corte if topar else None,
    }


NOMBRES_DIA_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']


def calcular_comparacion_corte_parcial(tabla, sede, umbral_pct=20):
    """
    Complementa a calcular_linea_base_dinamica (que siempre compara 2
    bloques RODANTES de 7 dias completos, sin importar que dia se corra el
    bot). Esta señal responde otra pregunta: "¿como vamos esta semana
    CALENDARIO hasta HOY, contra los mismos dias de la semana pasada?" —
    util para corridas a mitad de semana (ej. miercoles), donde se espera
    comparar Lunes-a-Miercoles vs. Lunes-a-Miercoles, no un bloque rodante
    que mezcla dias de 2 semanas distintas.

    "Hoy" se toma como la fecha MAS RECIENTE con datos en Supabase para esa
    sede (no la fecha del reloj), para tolerar el lag normal de PME.

    Devuelve None si falta algun dia de cualquiera de los 2 cortes (sede
    muy nueva, o corte de datos), para no comparar periodos incompletos.
    """
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept-Profile": "energia",
    }
    try:
        filas = None
        for _intento in range(2):
            try:
                r = requests.get(
                    f"{SUPABASE_URL}/rest/v1/{tabla}",
                    params={"select": "fecha,hora,valor", "sede": f"eq.{sede}", "order": "fecha.desc", "limit": "2000"},
                    headers=headers,
                    timeout=30
                )
                if r.status_code == 200:
                    filas = r.json()
                    break
            except Exception:
                time.sleep(2)
        if not filas:
            return None
    except Exception as e:
        log(f"⚠️ No se pudo calcular el corte parcial semanal de {sede}: {e}")
        return None

    if not filas:
        return None

    horas_por_fecha = {}
    for f in filas:
        horas_por_fecha.setdefault(f['fecha'], {})[f['hora']] = horas_por_fecha.get(f['fecha'], {}).get(f['hora'], 0) + float(f['valor'])

    hoy_str = max(horas_por_fecha.keys())
    hoy = datetime.strptime(hoy_str, "%Y-%m-%d").date()

    # Si se corre a mitad de dia (ej. 3pm), el dia de "hoy" en la tabla solo
    # tiene datos hasta esa hora (las horas futuras todavia no ocurrieron).
    # Comparar ese dia a medias contra un dia COMPLETO de la semana pasada
    # haria ver una mejora falsa. Para evitarlo: se detecta la hora de corte
    # (la ultima hora con datos hoy) comparando contra cuantas horas suelen
    # tener los demas dias ya cerrados, y se topa a esa MISMA hora tanto el
    # ultimo dia de "esta semana" como el dia equivalente de "la semana
    # pasada" — asi ambos quedan medidos hasta el mismo punto del dia.
    horas_hoy = sorted(horas_por_fecha.get(hoy_str, {}).keys())
    fechas_previas = [f for f in horas_por_fecha if f != hoy_str]
    horas_esperadas = max((len(horas_por_fecha[f]) for f in fechas_previas), default=len(horas_hoy))
    dia_de_hoy_completo = len(horas_hoy) >= horas_esperadas
    hora_corte = horas_hoy[-1] if horas_hoy else None

    dias_transcurridos = hoy.weekday() + 1  # lunes=0 -> si hoy es miercoles(2), son 3 dias (lun,mar,mie)
    inicio_actual = hoy - timedelta(days=hoy.weekday())
    inicio_anterior = inicio_actual - timedelta(days=7)

    rango_actual = [inicio_actual + timedelta(days=i) for i in range(dias_transcurridos)]
    rango_anterior = [inicio_anterior + timedelta(days=i) for i in range(dias_transcurridos)]

    def _suma_dia(fecha_obj, topar_a_hora_corte):
        horas_del_dia = horas_por_fecha.get(fecha_obj.strftime("%Y-%m-%d"))
        if horas_del_dia is None:
            return None
        if topar_a_hora_corte and hora_corte:
            return sum(v for h, v in horas_del_dia.items() if h <= hora_corte)
        return sum(horas_del_dia.values())

    def _suma_rango(rango):
        total = 0.0
        for i, d in enumerate(rango):
            es_ultimo_dia = (i == len(rango) - 1)
            valor = _suma_dia(d, topar_a_hora_corte=es_ultimo_dia and not dia_de_hoy_completo)
            if valor is None:
                return None
            total += valor
        return total

    total_actual = _suma_rango(rango_actual)
    total_anterior = _suma_rango(rango_anterior)
    if total_actual is None or total_anterior is None:
        return None

    promedio_actual = total_actual / dias_transcurridos
    promedio_anterior = total_anterior / dias_transcurridos
    variacion = _variacion_pct(promedio_actual, promedio_anterior)

    return {
        'dias_comparados': dias_transcurridos,
        'promedio_actual_kwh_dia': round(promedio_actual, 2),
        'promedio_anterior_kwh_dia': round(promedio_anterior, 2),
        'variacion_pct': variacion,
        'supera_umbral': bool(variacion is not None and variacion > umbral_pct),
        'fecha_ini_actual': rango_actual[0].strftime("%Y-%m-%d"),
        'fecha_fin_actual': rango_actual[-1].strftime("%Y-%m-%d"),
        'fecha_ini_anterior': rango_anterior[0].strftime("%Y-%m-%d"),
        'fecha_fin_anterior': rango_anterior[-1].strftime("%Y-%m-%d"),
        'dia_ini_nombre': NOMBRES_DIA_SEMANA[rango_actual[0].weekday()],
        'dia_fin_nombre': NOMBRES_DIA_SEMANA[rango_actual[-1].weekday()],
        'hora_corte': hora_corte if not dia_de_hoy_completo else None,
    }


def _fmt_fecha_es(fecha_str):
    """YYYY-MM-DD -> DD/MM/YYYY. Devuelve el texto tal cual si no calza el formato."""
    try:
        return datetime.strptime(fecha_str, "%Y-%m-%d").strftime("%d/%m/%Y")
    except (ValueError, TypeError):
        return fecha_str or ''


def _etiqueta_sede(rank, s):
    """'1. Sede X [CECO 1234]' — el CECO (unico por tienda en el sistema
    interno) ayuda a distinguir sedes con nombres parecidos o genericos en
    PME (el nombre que se ve viene del titulo del gadget en el dashboard,
    no de un codigo unico)."""
    etiqueta = f"{rank}. {s['sede']}"
    if s.get('ceco'):
        etiqueta += f" [CECO {s['ceco']}]"
    return etiqueta


def _fig_ranking_frio(servicio, resumen_todas_sedes, top_n=15, fecha_ini_periodo=None, fecha_fin_periodo=None):
    """
    Ranking de sedes de mayor a menor consumo (kWh/dia), anotando junto a
    cada una su variacion semana actual vs. semana anterior (linea base
    dinamica) cuando ya hay suficiente historia acumulada para calcularla.
    A diferencia de resumen_periodo (solo sedes con alguna señal activa),
    esto usa TODAS las sedes procesadas, para responder "cuales son las
    que mas consumen" en general, no solo las que tienen un problema.
    """
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    sedes_ordenadas = sorted(resumen_todas_sedes, key=lambda s: s.get('kwh_dia', 0), reverse=True)[:top_n]
    for i, s in enumerate(sedes_ordenadas, start=1):
        s['_rank'] = i
    sedes_ordenadas = sedes_ordenadas[::-1]
    nombres = [_etiqueta_sede(s['_rank'], s) for s in sedes_ordenadas]
    valores = [s.get('kwh_dia', 0) for s in sedes_ordenadas]

    def color_de(s):
        lb = s.get('linea_base')
        if not lb or lb.get('variacion_pct') is None:
            return '#3b82f6'
        return '#ef4444' if lb.get('supera_umbral') else '#22c55e'

    colores = [color_de(s) for s in sedes_ordenadas]

    alto = max(4.5, 0.42 * len(nombres) + 1.8)
    fig, ax = plt.subplots(figsize=(14, alto), dpi=250, facecolor='#0f172a')
    ax.set_facecolor('#0f172a')
    barras = ax.barh(nombres, valores, color=colores, height=0.62)

    fig.suptitle(
        f"{servicio} — Sedes de Mayor Consumo (kWh/día) y Variación Semanal",
        color='#fff', fontsize=17, fontweight='bold', y=0.985
    )
    if fecha_ini_periodo and fecha_fin_periodo:
        subtitulo_periodo = f"Período analizado: {_fmt_fecha_es(fecha_ini_periodo)} al {_fmt_fecha_es(fecha_fin_periodo)}"
    else:
        subtitulo_periodo = ""
    hora_corte_ejemplo = next(
        (s['linea_base']['hora_corte'] for s in sedes_ordenadas if s.get('linea_base') and s['linea_base'].get('hora_corte')),
        None
    )
    if hora_corte_ejemplo:
        subtitulo_periodo += f"\n⏱ Corrida a media jornada: el día más reciente se mide solo hasta las {hora_corte_ejemplo} (en ambas semanas) para comparar parejo."
    ax.set_title(subtitulo_periodo, color='#94a3b8', fontsize=11.5, pad=40 + 12 * subtitulo_periodo.count('\n'))
    ax.set_xlabel('kWh / día', color='#cbd5e1', fontsize=12.5)
    ax.tick_params(colors='#cbd5e1', labelsize=11)
    for spine in ax.spines.values():
        spine.set_color('#334155')
    ax.grid(axis='x', color='#334155', linestyle='--', alpha=0.5)

    max_val = max(valores) if valores else 1
    for barra, s in zip(barras, sedes_ordenadas):
        lb = s.get('linea_base')
        if lb and lb.get('variacion_pct') is not None:
            flecha = '▲' if lb['variacion_pct'] > 0 else '▼'
            texto_var = f" · {flecha} {abs(lb['variacion_pct']):.1f}% sem."
        else:
            texto_var = " · sin histórico aún"
        ax.text(
            barra.get_width() + max_val * 0.012, barra.get_y() + barra.get_height() / 2,
            f"{s.get('kwh_dia', 0):,.1f} kWh/d{texto_var}", va='center', ha='left', fontsize=10.5, color='#fff'
        )

    ax.annotate(
        "■ Empeoró vs. semana anterior", xy=(1, 1), xycoords='axes fraction', xytext=(0, 24),
        textcoords='offset points', ha='right', va='bottom', fontsize=10.5, color='#ef4444', fontweight='bold'
    )
    ax.annotate(
        "■ Mejoró vs. semana anterior", xy=(1, 1), xycoords='axes fraction', xytext=(0, 8),
        textcoords='offset points', ha='right', va='bottom', fontsize=10.5, color='#22c55e', fontweight='bold'
    )

    plt.tight_layout()
    return fig


def generar_grafico_ranking_frio(servicio, resumen_todas_sedes, top_n=15, fecha_ini_periodo=None, fecha_fin_periodo=None):
    """Version PNG (para Telegram/correo) del ranking de sedes de Frío."""
    import io
    import matplotlib.pyplot as plt

    fig = _fig_ranking_frio(servicio, resumen_todas_sedes, top_n, fecha_ini_periodo, fecha_fin_periodo)
    buffer = io.BytesIO()
    fig.savefig(buffer, format='png', facecolor=fig.get_facecolor())
    plt.close(fig)
    buffer.seek(0)
    return buffer.getvalue()


def _fig_corte_parcial_semanal(servicio, sedes_con_corte, top_n=15, nota_alcance=None):
    """
    Vista de ranking complementaria a la del bloque RODANTE de 7 dias
    (siempre 7 vs. 7 sin importar que dia se corra el bot): compara la
    semana CALENDARIO actual hasta HOY contra el mismo corte de dias de la
    semana pasada (ver calcular_comparacion_corte_parcial). Pensado para
    corridas a mitad de semana: si hoy es miercoles, compara
    Lunes-a-Miercoles vs. Lunes-a-Miercoles (no dias de 2 semanas mezclados).
    Generico: lo usan Frio, HVAC e Iluminacion por igual.

    sedes_con_corte: lista de dicts {sede, ceco, corte_parcial} — SOLO sedes
    con corte_parcial ya calculado (>=8 dias de historia para ese corte
    especifico). Devuelve None si la lista viene vacia (ej. especialidad
    recien conectada, o menos de 8 dias de historico acumulado todavia).

    nota_alcance: texto opcional para aclarar que se esta comparando (ej.
    en HVAC/Iluminacion, el consumo TOTAL del dia, no solo el de la ventana
    fuera de horario que usa el resto del reporte).
    """
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    if not sedes_con_corte:
        return None

    sedes_ordenadas = sorted(
        sedes_con_corte, key=lambda s: s['corte_parcial'].get('promedio_actual_kwh_dia', 0), reverse=True
    )[:top_n]
    for i, s in enumerate(sedes_ordenadas, start=1):
        s['_rank_corte'] = i
    sedes_ordenadas = sedes_ordenadas[::-1]
    nombres = [_etiqueta_sede(s['_rank_corte'], s) for s in sedes_ordenadas]
    valores = [s['corte_parcial'].get('promedio_actual_kwh_dia', 0) for s in sedes_ordenadas]

    def color_de(s):
        cp = s['corte_parcial']
        if cp.get('variacion_pct') is None:
            return '#3b82f6'
        return '#ef4444' if cp.get('supera_umbral') else '#22c55e'

    colores = [color_de(s) for s in sedes_ordenadas]

    ejemplo = sedes_ordenadas[0]['corte_parcial']
    if ejemplo['dias_comparados'] == 1:
        subtitulo = (
            f"Comparando {ejemplo['dia_ini_nombre']} {_fmt_fecha_es(ejemplo['fecha_ini_actual'])}"
            f" vs. {ejemplo['dia_ini_nombre']} {_fmt_fecha_es(ejemplo['fecha_ini_anterior'])} (semana anterior)"
        )
    else:
        subtitulo = (
            f"Comparando {ejemplo['dia_ini_nombre']} {_fmt_fecha_es(ejemplo['fecha_ini_actual'])} a "
            f"{ejemplo['dia_fin_nombre']} {_fmt_fecha_es(ejemplo['fecha_fin_actual'])}  vs.  "
            f"{ejemplo['dia_ini_nombre']} {_fmt_fecha_es(ejemplo['fecha_ini_anterior'])} a "
            f"{ejemplo['dia_fin_nombre']} {_fmt_fecha_es(ejemplo['fecha_fin_anterior'])} (semana anterior)"
        )
    if ejemplo.get('hora_corte'):
        subtitulo += f"\n⏱ Corrida a media jornada: ambos días se miden solo hasta las {ejemplo['hora_corte']} para comparar parejo."
    if nota_alcance:
        subtitulo += f"\n{nota_alcance}"

    alto = max(4.5, 0.42 * len(nombres) + 1.8)
    fig, ax = plt.subplots(figsize=(14, alto), dpi=250, facecolor='#0f172a')
    ax.set_facecolor('#0f172a')
    barras = ax.barh(nombres, valores, color=colores, height=0.62)

    fig.suptitle(
        f"{servicio} — Semana Actual vs. Semana Anterior (mismo corte de días)",
        color='#fff', fontsize=16.5, fontweight='bold', y=0.985
    )
    ax.set_title(subtitulo, color='#94a3b8', fontsize=10.5, pad=40 + 12 * subtitulo.count('\n'))
    ax.set_xlabel('kWh / día (promedio del corte)', color='#cbd5e1', fontsize=12.5)
    ax.tick_params(colors='#cbd5e1', labelsize=11)
    for spine in ax.spines.values():
        spine.set_color('#334155')
    ax.grid(axis='x', color='#334155', linestyle='--', alpha=0.5)

    max_val = max(valores) if valores else 1
    for barra, s in zip(barras, sedes_ordenadas):
        cp = s['corte_parcial']
        if cp.get('variacion_pct') is not None:
            flecha = '▲' if cp['variacion_pct'] > 0 else '▼'
            texto_var = f" · {flecha} {abs(cp['variacion_pct']):.1f}% vs. sem. pasada"
        else:
            texto_var = " · semana pasada sin consumo registrado"
        ax.text(
            barra.get_width() + max_val * 0.012, barra.get_y() + barra.get_height() / 2,
            f"{cp.get('promedio_actual_kwh_dia', 0):,.1f} kWh/d{texto_var}",
            va='center', ha='left', fontsize=10.5, color='#fff'
        )

    ax.annotate(
        "■ Empeoró vs. mismo corte semana pasada", xy=(1, 1), xycoords='axes fraction', xytext=(0, 24),
        textcoords='offset points', ha='right', va='bottom', fontsize=10.5, color='#ef4444', fontweight='bold'
    )
    ax.annotate(
        "■ Mejoró vs. mismo corte semana pasada", xy=(1, 1), xycoords='axes fraction', xytext=(0, 8),
        textcoords='offset points', ha='right', va='bottom', fontsize=10.5, color='#22c55e', fontweight='bold'
    )

    plt.tight_layout()
    return fig


def generar_grafico_corte_parcial_semanal(servicio, sedes, top_n=15, nota_alcance=None):
    """Version PNG del corte parcial semanal (generico: Frío, HVAC e
    Iluminación). `sedes`: lista de dicts {sede, ceco, corte_parcial}
    (corte_parcial puede venir en None, se filtra aca). Devuelve None si
    ninguna sede todavia tiene suficiente historia para este corte."""
    import io
    import matplotlib.pyplot as plt

    sedes_con_corte = [s for s in sedes if s.get('corte_parcial')]
    fig = _fig_corte_parcial_semanal(servicio, sedes_con_corte, top_n, nota_alcance)
    if fig is None:
        return None
    buffer = io.BytesIO()
    fig.savefig(buffer, format='png', facecolor=fig.get_facecolor())
    plt.close(fig)
    buffer.seek(0)
    return buffer.getvalue()


def _fig_ranking_frio_soles(servicio, resumen_todas_sedes, precio_kwh, top_n=15, fecha_ini_periodo=None, fecha_fin_periodo=None):
    """
    Ranking de costo estimado de energia por sede (S//dia, mes, año), con
    la tarifa configurada en el panel de Frío Alimentario. Mismo diseño
    visual que _fig_ranking_frio para que se lean juntas facilmente.
    """
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    for s in resumen_todas_sedes:
        s['_costo_dia'] = round(s.get('kwh_dia', 0) * precio_kwh, 2)

    sedes_ordenadas = sorted(resumen_todas_sedes, key=lambda s: s['_costo_dia'], reverse=True)[:top_n]
    for i, s in enumerate(sedes_ordenadas, start=1):
        s['_rank_soles'] = i
    sedes_ordenadas = sedes_ordenadas[::-1]
    nombres = [_etiqueta_sede(s['_rank_soles'], s) for s in sedes_ordenadas]
    valores = [s['_costo_dia'] for s in sedes_ordenadas]

    alto = max(4.5, 0.42 * len(nombres) + 1.8)
    fig, ax = plt.subplots(figsize=(14, alto), dpi=250, facecolor='#0f172a')
    ax.set_facecolor('#0f172a')
    barras = ax.barh(nombres, valores, color='#f59e0b', height=0.62)

    fig.suptitle(
        f"{servicio} — Costo Estimado de Energía por Sede (S/)", color='#fff',
        fontsize=17, fontweight='bold', y=0.985
    )
    partes_subtitulo = [f"Tarifa: S/ {precio_kwh:,.3f} / kWh"]
    if fecha_ini_periodo and fecha_fin_periodo:
        partes_subtitulo.append(f"Período: {_fmt_fecha_es(fecha_ini_periodo)} al {_fmt_fecha_es(fecha_fin_periodo)}")
    ax.set_title(" · ".join(partes_subtitulo), color='#94a3b8', fontsize=11.5, pad=40)
    ax.set_xlabel('S/ por día', color='#cbd5e1', fontsize=12.5)
    ax.tick_params(colors='#cbd5e1', labelsize=11)
    for spine in ax.spines.values():
        spine.set_color('#334155')
    ax.grid(axis='x', color='#334155', linestyle='--', alpha=0.5)

    max_val = max(valores) if valores else 1
    for barra, s in zip(barras, sedes_ordenadas):
        costo_dia = s['_costo_dia']
        ax.text(
            barra.get_width() + max_val * 0.012, barra.get_y() + barra.get_height() / 2,
            f"S/ {costo_dia:,.2f}/día · S/ {costo_dia * 30:,.0f}/mes · S/ {costo_dia * 365:,.0f}/año",
            va='center', ha='left', fontsize=10.5, color='#fff'
        )

    if not precio_kwh:
        ax.annotate(
            "⚠️ Configura el precio por kWh en el panel de Frío Alimentario para ver montos reales",
            xy=(1, 1), xycoords='axes fraction', xytext=(0, 8),
            textcoords='offset points', ha='right', va='bottom', fontsize=10, color='#facc15', fontweight='bold'
        )

    plt.tight_layout()
    return fig


def generar_grafico_ranking_frio_soles(servicio, resumen_todas_sedes, precio_kwh, top_n=15, fecha_ini_periodo=None, fecha_fin_periodo=None):
    """Version PNG del ranking de costo en soles."""
    import io
    import matplotlib.pyplot as plt

    fig = _fig_ranking_frio_soles(servicio, resumen_todas_sedes, precio_kwh, top_n, fecha_ini_periodo, fecha_fin_periodo)
    buffer = io.BytesIO()
    fig.savefig(buffer, format='png', facecolor=fig.get_facecolor())
    plt.close(fig)
    buffer.seek(0)
    return buffer.getvalue()


def generar_pdf_ranking_frio(servicio, resumen_todas_sedes, precio_kwh=0.0, top_n=30,
                              fecha_ini_periodo=None, fecha_fin_periodo=None):
    """PDF (vectorial, nitidez perfecta) con las 3 vistas de ranking de
    Frío (consumo kWh/día, corte parcial semanal, costo en soles) —
    se adjunta al correo ademas de los PNG que van por Telegram."""
    import io
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages

    buffer = io.BytesIO()
    with PdfPages(buffer) as pdf:
        fig = _fig_ranking_frio(servicio, resumen_todas_sedes, top_n, fecha_ini_periodo, fecha_fin_periodo)
        _agregar_pie_pagina(fig)
        pdf.savefig(fig, facecolor=fig.get_facecolor())
        plt.close(fig)

        sedes_con_corte = [s for s in resumen_todas_sedes if s.get('corte_parcial')]
        fig_corte = _fig_corte_parcial_semanal(servicio, sedes_con_corte, top_n)
        if fig_corte is not None:
            _agregar_pie_pagina(fig_corte)
            pdf.savefig(fig_corte, facecolor=fig_corte.get_facecolor())
            plt.close(fig_corte)

        fig_soles = _fig_ranking_frio_soles(servicio, resumen_todas_sedes, precio_kwh, top_n, fecha_ini_periodo, fecha_fin_periodo)
        _agregar_pie_pagina(fig_soles)
        pdf.savefig(fig_soles, facecolor=fig_soles.get_facecolor())
        plt.close(fig_soles)

        fig_firma = _fig_firma_cierre()
        _agregar_pie_pagina(fig_firma)
        pdf.savefig(fig_firma, facecolor=fig_firma.get_facecolor())
        plt.close(fig_firma)

    buffer.seek(0)
    return buffer.getvalue()


def generar_excel_frio(servicio, resumen_periodo, resumen_todas_sedes=None, precio_kwh=0.0,
                        fecha_ini_periodo=None, fecha_fin_periodo=None):
    """
    Excel de detalle para cargas continuas (Frio Alimentario): a diferencia
    del reporte de HVAC/Iluminacion (organizado por "fuera de horario"),
    aca cada sede se evalua contra 4 señales independientes (maximo
    diario, maximo por hora, ventana de bajo consumo opcional, linea base
    dinamica semana vs semana).

    resumen_todas_sedes (opcional): agrega la hoja "Ranking General" con
    TODAS las sedes (no solo las que tienen una señal activa) — kWh/día,
    costo en soles (día/mes/año), CECO, y las 2 variaciones semanales
    (bloque rodante 7v7 y corte parcial calendario) con sus fechas.
    """
    import io
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    wb = Workbook()
    resumen = wb.active
    resumen.title = "Resumen"
    resumen.append([
        "Sede", "Días sobre máximo diario", "Horas sobre máximo por hora", "Picos en ventana de bajo consumo",
        "Promedio semana actual (kWh/día)", "Promedio semana anterior (kWh/día)", "Variación %"
    ])
    for celda in resumen[1]:
        _estilo_encabezado_excel(celda)
    for r in resumen_periodo:
        lb = r.get('linea_base') or {}
        resumen.append([
            r['sede'], len(r['excesos_dia']), len(r['excesos_hora']), len(r['excesos_ventana']),
            lb.get('promedio_actual_kwh_dia', ''), lb.get('promedio_referencia_kwh_dia', ''), lb.get('variacion_pct', '')
        ])
    for col, ancho in zip('ABCDEFG', [28, 22, 22, 24, 24, 24, 14]):
        resumen.column_dimensions[col].width = ancho

    if resumen_todas_sedes:
        ranking = wb.create_sheet("Ranking General")
        titulo_periodo = ""
        if fecha_ini_periodo and fecha_fin_periodo:
            titulo_periodo = f"Período analizado: {_fmt_fecha_es(fecha_ini_periodo)} al {_fmt_fecha_es(fecha_fin_periodo)}"
        ranking.append([titulo_periodo])
        ranking.append([])
        ranking.append([
            "#", "Sede", "CECO", "kWh/día", "S//día", "S//mes", "S//año",
            "Var. % semana rodante (7 vs 7 días)", "Var. % corte parcial (semana calendario)",
            "Corte comparado (esta semana)", "Corte comparado (semana anterior)",
            "Volumen refrigerado (m³)", "kWh/día por m³"
        ])
        for celda in ranking[3]:
            _estilo_encabezado_excel(celda)
        sedes_ordenadas = sorted(resumen_todas_sedes, key=lambda s: s.get('kwh_dia', 0), reverse=True)
        for i, s in enumerate(sedes_ordenadas, start=1):
            costo_dia = round(s.get('kwh_dia', 0) * precio_kwh, 2)
            lb = s.get('linea_base') or {}
            cp = s.get('corte_parcial') or {}
            corte_actual = corte_anterior = ""
            if cp:
                if cp.get('dias_comparados') == 1:
                    corte_actual = f"{cp['dia_ini_nombre']} {_fmt_fecha_es(cp['fecha_ini_actual'])}"
                    corte_anterior = f"{cp['dia_ini_nombre']} {_fmt_fecha_es(cp['fecha_ini_anterior'])}"
                else:
                    corte_actual = f"{cp['dia_ini_nombre']} {_fmt_fecha_es(cp['fecha_ini_actual'])} a {cp['dia_fin_nombre']} {_fmt_fecha_es(cp['fecha_fin_actual'])}"
                    corte_anterior = f"{cp['dia_ini_nombre']} {_fmt_fecha_es(cp['fecha_ini_anterior'])} a {cp['dia_fin_nombre']} {_fmt_fecha_es(cp['fecha_fin_anterior'])}"
            ranking.append([
                i, s['sede'], s.get('ceco', ''), s.get('kwh_dia', 0),
                costo_dia, round(costo_dia * 30, 2), round(costo_dia * 365, 2),
                lb.get('variacion_pct', ''), cp.get('variacion_pct', ''), corte_actual, corte_anterior,
                s.get('volumen_m3', '') or '', s.get('kwh_dia_m3', '') or ''
            ])
        for col, ancho in zip('ABCDEFGHIJKLM', [6, 28, 12, 12, 12, 14, 14, 20, 22, 28, 28, 18, 16]):
            ranking.column_dimensions[col].width = ancho

    dia = wb.create_sheet("Excesos - Máximo Diario")
    dia.append(["Sede", "Fecha", "Total kWh del día"])
    for celda in dia[1]:
        _estilo_encabezado_excel(celda, "FFEDD5")
    for r in resumen_periodo:
        for e in r['excesos_dia']:
            dia.append([r['sede'], e['fecha'], e['total_kwh']])
    dia.column_dimensions['A'].width = 28
    dia.column_dimensions['B'].width = 14
    dia.column_dimensions['C'].width = 18

    hora = wb.create_sheet("Excesos - Máximo por Hora")
    hora.append(["Sede", "Fecha", "Hora", "Valor kWh"])
    for celda in hora[1]:
        _estilo_encabezado_excel(celda, "FFEDD5")
    for r in resumen_periodo:
        for e in r['excesos_hora']:
            hora.append([r['sede'], e['fecha'], e['hora'], e['valor']])
    hora.column_dimensions['A'].width = 28

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def enviar_analisis_frio(servicio, resumen_periodo, config_alerta, dias_historico, resumen_todas_sedes=None,
                          fecha_ini_periodo=None, fecha_fin_periodo=None):
    """
    Analisis consolidado para cargas continuas 24/7: en vez de "fuera de
    horario" (que no aplica a un equipo que opera todo el dia), reporta
    contra las 3 señales de exceso (maximo diario, maximo por hora, ventana
    de bajo consumo opcional) mas la linea base dinamica semana-vs-semana.
    Solo incluye sedes con AL MENOS una señal activa este periodo.

    resumen_todas_sedes (opcional): TODAS las sedes procesadas (no solo las
    que tienen una señal activa), usado para el ranking de mayor consumo +
    variación semanal — a diferencia de resumen_periodo, este SI se manda
    aunque una sede no tenga ningún problema, para poder responder "cuáles
    son las que más consumen" en general.
    """
    if not config_alerta or not config_alerta.get('activo') or not (resumen_periodo or resumen_todas_sedes):
        return

    destinatarios = config_alerta.get('destinatarios', '')
    copia = config_alerta.get('copia', '')
    nombre_remitente = formatear_plantilla(
        config_alerta.get('nombre_remitente') or NOMBRE_REMITENTE_ALERTA_DEFAULT, servicio=servicio
    )

    total_sedes = len(resumen_periodo)
    cuerpo = (
        f"🧊 <b>Análisis de {servicio} — Señales de Desperdicio (carga continua 24/7)</b>\n"
        f"Período: últimos {dias_historico} días\n\n"
        f"Sedes con alguna señal activa: <b>{total_sedes}</b>\n\n"
    )
    if resumen_periodo:
        for r in resumen_periodo[:15]:
            partes = []
            if r['excesos_dia']:
                partes.append(f"{len(r['excesos_dia'])}d sobre máx. diario")
            if r['excesos_hora']:
                partes.append(f"{len(r['excesos_hora'])}h sobre máx. por hora")
            if r['excesos_ventana']:
                partes.append(f"{len(r['excesos_ventana'])} picos en ventana baja")
            lb = r.get('linea_base')
            if lb and lb.get('supera_umbral'):
                partes.append(f"+{lb['variacion_pct']}% vs. semana anterior")
            cuerpo += f"• <b>{r['sede']}</b>: {', '.join(partes)}\n"
        if total_sedes > 15:
            cuerpo += f"... y {total_sedes - 15} sedes más (ver Excel adjunto)\n"
        cuerpo += "\nVer Excel adjunto para el detalle completo por sede."
    else:
        cuerpo += "No se detectaron excesos sobre los umbrales configurados en este período.\n"
        cuerpo += "\nA continuación, el ranking general de mayor consumo por sede."

    precio_kwh = config_alerta.get('precio_kwh', 0.0) or 0.0

    asunto = f"Análisis de Desperdicio de Energía - {servicio}"
    excel_bytes = generar_excel_frio(
        servicio, resumen_periodo, resumen_todas_sedes=resumen_todas_sedes, precio_kwh=precio_kwh,
        fecha_ini_periodo=fecha_ini_periodo, fecha_fin_periodo=fecha_fin_periodo
    )
    nombre_excel = f"analisis_{servicio}_{dias_historico}dias.xlsx"

    # Adjuntos del correo: solo Excel/PDF (las imagenes quedan solo en
    # Telegram, serian redundantes con el PDF en el correo).
    adjuntos_correo = [(nombre_excel, excel_bytes, 'xlsx')]

    grafico_ranking_bytes = None
    grafico_corte_bytes = None
    grafico_soles_bytes = None
    pdf_ranking_bytes = None
    if resumen_todas_sedes:
        try:
            grafico_ranking_bytes = generar_grafico_ranking_frio(
                servicio, resumen_todas_sedes, fecha_ini_periodo=fecha_ini_periodo, fecha_fin_periodo=fecha_fin_periodo
            )
        except Exception as e:
            log(f"⚠️ No se pudo generar el gráfico de ranking de {servicio}: {e}")
        try:
            grafico_corte_bytes = generar_grafico_corte_parcial_semanal(servicio, resumen_todas_sedes)
        except Exception as e:
            log(f"⚠️ No se pudo generar el gráfico de corte parcial semanal de {servicio}: {e}")
        try:
            grafico_soles_bytes = generar_grafico_ranking_frio_soles(
                servicio, resumen_todas_sedes, precio_kwh, fecha_ini_periodo=fecha_ini_periodo, fecha_fin_periodo=fecha_fin_periodo
            )
        except Exception as e:
            log(f"⚠️ No se pudo generar el gráfico de costo en soles de {servicio}: {e}")
        try:
            pdf_ranking_bytes = generar_pdf_ranking_frio(
                servicio, resumen_todas_sedes, precio_kwh=precio_kwh,
                fecha_ini_periodo=fecha_ini_periodo, fecha_fin_periodo=fecha_fin_periodo
            )
            adjuntos_correo.append((f"ranking_{servicio}.pdf", pdf_ranking_bytes, 'pdf'))
        except Exception as e:
            log(f"⚠️ No se pudo generar el PDF de ranking de {servicio}: {e}")

    enviar_telegram(cuerpo, parse_mode='HTML')
    if grafico_ranking_bytes:
        enviar_telegram_foto(
            grafico_ranking_bytes, f"ranking_{servicio}.png",
            caption=f"Sedes de mayor consumo y variación semanal — {servicio}"
        )
    if grafico_corte_bytes:
        enviar_telegram_foto(
            grafico_corte_bytes, f"corte_parcial_{servicio}.png",
            caption=f"Semana actual (a la fecha) vs. mismo corte semana anterior — {servicio}"
        )
    if grafico_soles_bytes:
        enviar_telegram_foto(
            grafico_soles_bytes, f"costo_soles_{servicio}.png",
            caption=f"Costo estimado por sede (S//día, mes, año) — {servicio}"
        )
    enviar_telegram_documento(excel_bytes, nombre_excel, caption=f"Excel completo — {servicio} ({dias_historico} días)")
    if pdf_ranking_bytes:
        enviar_telegram_documento(
            pdf_ranking_bytes, f"ranking_{servicio}.pdf",
            caption="📄 Ranking completo (nitidez vectorial)"
        )
    enviar_email(
        asunto, cuerpo.replace('<b>', '').replace('</b>', ''),
        destinatarios=destinatarios, copia=copia, nombre_remitente=nombre_remitente,
        adjuntos=adjuntos_correo
    )


def calcular_categoria_sede(costo_dia, umbral_critico_dia, umbral_medio_dia):
    """Clasifica una sede con consumo fuera de horario en 3 niveles de
    prioridad, a partir de los 2 umbrales configurables (S//dia)."""
    if umbral_critico_dia and costo_dia >= umbral_critico_dia:
        return 'CRITICA'
    if umbral_medio_dia and costo_dia >= umbral_medio_dia:
        return 'MEDIA'
    return 'BAJA'


def guardar_historial_resultados(servicio, dias_historico, hora_inicio, hora_fin, precio_kwh,
                                  umbral_critico_dia, umbral_medio_dia, sedes_con_consumo,
                                  sedes_buenas_practicas, medidores_desconectados, resumen_total,
                                  mapa_ceco):
    """
    Guarda una "foto" de los resultados de esta corrida: una fila agregada
    en pme_historial_resultados (para medir la tendencia general) y una fila
    por sede en pme_historial_sedes (con su categoria y CECO, para poder
    enlazar a futuro y medir mejora sede por sede). No falla la corrida del
    bot si Supabase no responde; solo se pierde ese punto del historial.

    Devuelve el id de la fila agregada insertada (o None si fallo).
    """
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Accept-Profile": "energia",
        "Content-Profile": "energia",
        "Prefer": "return=representation",
    }

    sedes_criticas = [s for s in sedes_con_consumo if calcular_categoria_sede(s['costo_dia'], umbral_critico_dia, umbral_medio_dia) == 'CRITICA']
    sedes_medias = [s for s in sedes_con_consumo if calcular_categoria_sede(s['costo_dia'], umbral_critico_dia, umbral_medio_dia) == 'MEDIA']
    sedes_bajas = [s for s in sedes_con_consumo if calcular_categoria_sede(s['costo_dia'], umbral_critico_dia, umbral_medio_dia) == 'BAJA']

    fila_agregada = {
        "servicio": servicio,
        "dias_historico": dias_historico,
        "hora_inicio": hora_inicio,
        "hora_fin": hora_fin,
        "precio_kwh": precio_kwh,
        "umbral_critico_soles_dia": umbral_critico_dia,
        "umbral_medio_soles_dia": umbral_medio_dia,
        "total_sedes": len(sedes_con_consumo) + len(sedes_buenas_practicas) + len(medidores_desconectados),
        "sedes_con_consumo": len(sedes_con_consumo),
        "sedes_criticas": len(sedes_criticas),
        "sedes_medias": len(sedes_medias),
        "sedes_bajas": len(sedes_bajas),
        "sedes_buenas_practicas": len(sedes_buenas_practicas),
        "medidores_desconectados": len(medidores_desconectados),
        "kwh_dia_fuga": resumen_total.get('kwh_dia'),
        "costo_dia_fuga": resumen_total.get('costo_dia'),
        "total_kwh_periodo": resumen_total.get('total_kwh'),
        "total_costo_periodo": resumen_total.get('total_costo'),
        "proyeccion_mensual": resumen_total.get('proyeccion_mensual'),
        "proyeccion_anual": resumen_total.get('proyeccion_anual'),
    }

    historial_id = None
    try:
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/pme_historial_resultados", headers=headers, json=fila_agregada, timeout=20
        )
        if r.status_code in (200, 201):
            filas_creadas = r.json()
            if filas_creadas:
                historial_id = filas_creadas[0].get('id')
        else:
            log(f"⚠️ Error guardando historial de resultados: {r.status_code} {r.text[:200]}")
            alerta_sistema(f"Supabase rechazó el historial de resultados de {servicio} — código {r.status_code}. Revisar permisos/RLS de pme_historial_resultados.")
    except Exception as e:
        log(f"⚠️ Error guardando historial de resultados: {e}")

    if historial_id is None:
        return None

    ahora = datetime.now(timezone.utc).isoformat()
    filas_detalle = []
    for s in sedes_con_consumo:
        categoria = calcular_categoria_sede(s['costo_dia'], umbral_critico_dia, umbral_medio_dia)
        filas_detalle.append({
            "historial_id": historial_id, "servicio": servicio, "fecha_ejecucion": ahora,
            "sede": s['sede'], "ceco": buscar_ceco(mapa_ceco, f"{s['sede']} - {servicio}"),
            "kwh_dia": s['kwh_dia'], "costo_dia": s['costo_dia'], "categoria": categoria,
        })
    for s in sedes_buenas_practicas:
        filas_detalle.append({
            "historial_id": historial_id, "servicio": servicio, "fecha_ejecucion": ahora,
            "sede": s['sede'], "ceco": buscar_ceco(mapa_ceco, f"{s['sede']} - {servicio}"),
            "kwh_dia": 0, "costo_dia": 0, "categoria": "BUENA_PRACTICA",
        })
    for m in medidores_desconectados:
        filas_detalle.append({
            "historial_id": historial_id, "servicio": servicio, "fecha_ejecucion": ahora,
            "sede": m['sede'], "ceco": buscar_ceco(mapa_ceco, m.get('medidor_nombre', '')),
            "kwh_dia": 0, "costo_dia": 0, "categoria": "DESCONECTADA",
        })

    try:
        headers_insert = dict(headers)
        headers_insert["Prefer"] = "return=minimal"
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/pme_historial_sedes", headers=headers_insert, json=filas_detalle, timeout=20
        )
        if r.status_code not in (200, 201, 204):
            log(f"⚠️ Error guardando historial por sede: {r.status_code} {r.text[:200]}")
    except Exception as e:
        log(f"⚠️ Error guardando historial por sede: {e}")

    return historial_id


def obtener_historial_resultados(servicio, limite=12):
    """Ultimas N filas de pme_historial_resultados para un servicio,
    ordenadas de mas antigua a mas reciente (para graficar tendencia)."""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept-Profile": "energia",
    }
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/pme_historial_resultados",
            params={
                "servicio": f"eq.{servicio}", "order": "fecha_ejecucion.desc", "limit": str(limite)
            },
            headers=headers,
            timeout=15
        )
        if r.status_code == 200:
            return list(reversed(r.json()))
    except Exception as e:
        log(f"⚠️ No se pudo leer el historial de resultados: {e}")
    return []


def obtener_categorias_sedes_historial(historial_id):
    """{sede: categoria} de una corrida especifica (para comparar la
    corrida anterior vs. la actual y medir sedes resueltas/reincidentes)."""
    if not historial_id:
        return {}
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept-Profile": "energia",
    }
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/pme_historial_sedes",
            params={"historial_id": f"eq.{historial_id}", "select": "sede,categoria"},
            headers=headers,
            timeout=15
        )
        if r.status_code == 200:
            return {fila['sede']: fila['categoria'] for fila in r.json()}
    except Exception as e:
        log(f"⚠️ No se pudo leer el detalle de una corrida anterior del historial: {e}")
    return {}


def _variacion_pct(actual, referencia):
    """% de cambio de 'referencia' a 'actual'. None si no hay con que comparar."""
    if referencia is None or actual is None or referencia == 0:
        return None
    return round((actual - referencia) / referencia * 100, 1)


def _valor_por_sede(fila, campo):
    """Normaliza un total agregado (ej. costo_dia_fuga) por la cantidad de
    sedes analizadas en esa corrida (total_sedes). Sin esto, comparar 2
    corridas que cubrieron una cantidad distinta de sedes (ej. 50 vs 55 por
    una caida parcial de VPN) hace ver una mejora/empeoramiento que en
    realidad es solo el cambio de cobertura."""
    if not fila:
        return None
    total_sedes = fila.get('total_sedes') or 0
    valor = fila.get(campo)
    if not total_sedes or valor is None:
        return None
    return valor / total_sedes


def _cobertura_distinta(fila_a, fila_b, umbral_pct=10):
    """True si la cantidad de sedes analizadas difiere mas de umbral_pct%
    entre 2 corridas, es decir que sus totales NO son directamente
    comparables sin normalizar."""
    if not fila_a or not fila_b:
        return False
    ta, tb = fila_a.get('total_sedes') or 0, fila_b.get('total_sedes') or 0
    if not ta or not tb:
        return False
    return abs(ta - tb) / max(ta, tb) * 100 > umbral_pct


def _fig_kpis_resultados(servicio, actual, anterior, base, dias_transcurridos):
    """Pagina de tarjetas KPI: fuga diaria actual, variacion vs. la corrida
    anterior y vs. la linea base, y ahorro acumulado estimado a la fecha."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import FancyBboxPatch

    costo_dia_actual = actual.get('costo_dia_fuga') or 0
    total_sedes_actual = actual.get('total_sedes') or 0

    # Las variaciones se calculan sobre el costo POR SEDE (no el total), para
    # que no se distorsionen si una corrida cubrio mas o menos sedes que
    # otra (ej. 50 vs 55 por una caida parcial de VPN).
    costo_x_sede_actual = _valor_por_sede(actual, 'costo_dia_fuga')
    costo_x_sede_anterior = _valor_por_sede(anterior, 'costo_dia_fuga') if anterior else None
    costo_x_sede_base = _valor_por_sede(base, 'costo_dia_fuga')

    var_anterior = _variacion_pct(costo_x_sede_actual, costo_x_sede_anterior)
    var_base = _variacion_pct(costo_x_sede_actual, costo_x_sede_base)

    # El ahorro en soles si se proyecta la mejora POR SEDE (ya normalizada)
    # sobre el tamaño del portafolio ACTUAL, para que la cifra en soles no
    # mezcle la cobertura de una corrida vieja con la de hoy.
    ahorro_x_sede = (
        (costo_x_sede_base - costo_x_sede_actual)
        if (costo_x_sede_base is not None and costo_x_sede_actual is not None) else 0
    )
    ahorro_diario = ahorro_x_sede * total_sedes_actual
    ahorro_acumulado = round(ahorro_diario * dias_transcurridos, 2) if dias_transcurridos else 0.0

    cobertura_distinta_anterior = bool(anterior) and _cobertura_distinta(actual, anterior)
    cobertura_distinta_base = _cobertura_distinta(actual, base)

    fig, ax = plt.subplots(figsize=(13, 7), dpi=300, facecolor='#0f172a')
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis('off')

    ax.text(0.5, 0.96, f"{servicio} — Perfil de Resultados", ha='center', va='top',
            fontsize=20, fontweight='bold', color='#fff')
    ax.text(0.5, 0.895, f"Fuga diaria actual: S/ {costo_dia_actual:,.2f}/día",
            ha='center', va='top', fontsize=13, color='#94a3b8')

    def color_variacion(v):
        if v is None:
            return '#94a3b8'
        return '#22c55e' if v <= 0 else '#ef4444'

    def texto_variacion(v):
        if v is None:
            return 'sin corrida previa'
        flecha = '▼' if v <= 0 else '▲'
        return f"{flecha} {abs(v):.1f}%"

    tarjetas = [
        (
            "VS. CORRIDA ANTERIOR", texto_variacion(var_anterior),
            "⚠️ cobertura distinta (ver nota)" if cobertura_distinta_anterior else "normalizado por sede",
            color_variacion(var_anterior)
        ),
        (
            "VS. LÍNEA BASE", texto_variacion(var_base),
            "⚠️ cobertura distinta (ver nota)" if cobertura_distinta_base else "normalizado por sede",
            color_variacion(var_base)
        ),
        ("AHORRO ACUMULADO", f"S/ {ahorro_acumulado:,.2f}", f"proyectado sobre {total_sedes_actual} sedes · {dias_transcurridos} días", '#22c55e' if ahorro_acumulado >= 0 else '#ef4444'),
    ]

    ancho_tarjeta = 0.27
    espacio = (1 - ancho_tarjeta * 3) / 4
    y0, alto_tarjeta = 0.32, 0.46
    for i, (titulo, valor, sub, color) in enumerate(tarjetas):
        x0 = espacio + i * (ancho_tarjeta + espacio)
        caja = FancyBboxPatch(
            (x0, y0), ancho_tarjeta, alto_tarjeta,
            boxstyle="round,pad=0.012,rounding_size=0.025",
            linewidth=2, edgecolor=color, facecolor='#1e293b'
        )
        ax.add_patch(caja)
        cx = x0 + ancho_tarjeta / 2
        ax.text(cx, y0 + alto_tarjeta - 0.07, titulo, ha='center', va='top',
                fontsize=12.5, color='#cbd5e1', fontweight='bold')
        ax.text(cx, y0 + alto_tarjeta / 2 + 0.03, valor, ha='center', va='center',
                fontsize=24, color=color, fontweight='bold')
        ax.text(cx, y0 + 0.07, sub, ha='center', va='bottom', fontsize=9.5, color='#94a3b8')

    def pct_de_total(campo):
        if not total_sedes_actual:
            return ''
        valor = actual.get(campo, 0) or 0
        return f" ({round(valor / total_sedes_actual * 100, 1)}%)"

    pie = (
        f"Sedes analizadas: {total_sedes_actual}  ·  Con consumo: {actual.get('sedes_con_consumo', 0)}  ·  "
        f"Críticas: {actual.get('sedes_criticas', 0)}{pct_de_total('sedes_criticas')}  ·  "
        f"Medias: {actual.get('sedes_medias', 0)}{pct_de_total('sedes_medias')}  ·  "
        f"Bajas: {actual.get('sedes_bajas', 0)}{pct_de_total('sedes_bajas')}  ·  "
        f"Buenas prácticas: {actual.get('sedes_buenas_practicas', 0)}{pct_de_total('sedes_buenas_practicas')}  ·  "
        f"Desconectados: {actual.get('medidores_desconectados', 0)}"
    )
    ax.text(0.5, 0.16, pie, ha='center', va='center', fontsize=10.5, color='#e2e8f0')

    notas = ["* Ahorro estimado asumiendo que la mejora diaria por sede observada se mantuvo constante desde la línea base."]
    if cobertura_distinta_anterior:
        notas.append(
            f"⚠️ La corrida anterior analizó {anterior.get('total_sedes', 0)} sedes vs. {total_sedes_actual} en la actual "
            f"— la variación de arriba ya está normalizada por sede para que sea comparable."
        )
    if cobertura_distinta_base:
        notas.append(
            f"⚠️ La línea base analizó {base.get('total_sedes', 0)} sedes vs. {total_sedes_actual} en la actual "
            f"— la variación de arriba ya está normalizada por sede para que sea comparable."
        )
    ax.text(0.5, 0.05, "\n".join(notas), ha='center', va='bottom', fontsize=8.5, color='#64748b', style='italic')

    return fig


def _fig_tendencia_fuga(servicio, historial):
    """Linea de tiempo de la fuga diaria (kWh y S/) corrida a corrida, con
    linea base de referencia y variacion porcentual para que se entienda de
    un vistazo si la tendencia mejora o empeora."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    fechas = [h['fecha_ejecucion'][:10] for h in historial]
    sedes_totales = [h.get('total_sedes') or 0 for h in historial]
    # Valores POR SEDE (no el total agregado): si una corrida cubrio 50
    # sedes y otra 55, el total agregado sube solo por eso, aunque el
    # comportamiento real no haya cambiado. Dividiendo por total_sedes la
    # comparacion es justa sin importar cuantas sedes se lograron bajar.
    kwh = [_valor_por_sede(h, 'kwh_dia_fuga') or 0 for h in historial]
    costo = [_valor_por_sede(h, 'costo_dia_fuga') or 0 for h in historial]

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(13, 9.5), dpi=200, facecolor='#0f172a', sharex=True)
    fig.suptitle(f"{servicio} — Tendencia de Fuga Diaria por Corrida (normalizada por sede)", color='#fff', fontsize=16, fontweight='bold', y=0.985)
    fig.text(
        0.5, 0.945,
        "Cada punto es el promedio diario de consumo/costo fuera de horario POR SEDE detectado en esa corrida "
        "(no el total; así corridas con distinta cantidad de sedes analizadas siguen siendo comparables). "
        "El número entre paréntesis bajo cada punto es cuántas sedes se analizaron esa corrida. Una línea descendente indica mejora real.",
        ha='center', va='top', fontsize=9, color='#94a3b8', wrap=True
    )

    for ax, valores, titulo, color, prefijo in (
        (ax1, kwh, "kWh / día por sede", '#3b82f6', ''),
        (ax2, costo, "S/ / día por sede", '#f59e0b', 'S/ '),
    ):
        ax.set_facecolor('#0f172a')
        ax.plot(fechas, valores, color=color, marker='o', linewidth=2, zorder=3)
        ax.fill_between(range(len(fechas)), valores, color=color, alpha=0.12)
        if len(valores) >= 2 and valores[0]:
            ax.axhline(valores[0], color='#64748b', linestyle=':', linewidth=1.2, zorder=1)
            variacion = _variacion_pct(valores[-1], valores[0])
            if variacion is not None:
                color_var = '#22c55e' if variacion <= 0 else '#ef4444'
                flecha = '▼' if variacion <= 0 else '▲'
                # Offset en PUNTOS por fuera del area de datos (no una
                # fraccion del eje): asi nunca se solapa con el ultimo punto
                # ni con su etiqueta de "(N sedes)", sin importar en que
                # altura del grafico caiga el valor.
                ax.annotate(
                    f"{flecha} {abs(variacion):.1f}% vs. línea base", xy=(1, 1), xycoords='axes fraction',
                    xytext=(0, 6), textcoords='offset points', ha='right', va='bottom',
                    fontsize=10.5, color=color_var, fontweight='bold'
                )
        ax.set_title(titulo, color='#fff', fontsize=12.5, fontweight='bold', loc='left')
        ax.tick_params(colors='#cbd5e1', labelsize=9.5)
        for spine in ax.spines.values():
            spine.set_color('#334155')
        ax.grid(axis='y', color='#334155', linestyle='--', alpha=0.5)
        for i, v in enumerate(valores):
            ax.annotate(f"{prefijo}{v:,.1f}", (i, v), textcoords="offset points", xytext=(0, 10),
                        ha='center', fontsize=8.5, color='#fff')
            ax.annotate(f"({sedes_totales[i]} sedes)", (i, v), textcoords="offset points", xytext=(0, -14),
                        ha='center', fontsize=7, color='#64748b')

    ax2.set_xlabel('Fecha de ejecución del bot', color='#cbd5e1', fontsize=10)
    plt.setp(ax2.get_xticklabels(), rotation=30, ha='right')
    plt.tight_layout(rect=[0, 0, 1, 0.91])
    return fig


def _fig_tendencia_categorias(servicio, historial):
    """Barras apiladas con cuantas sedes hay por categoria en cada corrida
    (para ver si las criticas/medias bajan y las buenas practicas suben).
    Barras en vez de lineas porque son conteos categoricos, no una serie
    continua: apiladas, cada barra completa muestra el total de sedes
    evaluadas esa corrida, dividido por categoria."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    fechas = [h['fecha_ejecucion'][:10] for h in historial]

    fig, ax = plt.subplots(figsize=(13, 7), dpi=200, facecolor='#0f172a')
    ax.set_facecolor('#0f172a')
    fig.suptitle(f"{servicio} — N° de Sedes por Categoría, por Corrida", color='#fff', fontsize=15, fontweight='bold', y=0.98)
    fig.text(
        0.5, 0.925,
        "Cada barra es el total de sedes evaluadas en esa corrida, dividido por categoría. "
        "Ideal: que 'Críticas' y 'Medias' se achiquen y 'Buenas prácticas' crezca con el tiempo.",
        ha='center', va='top', fontsize=9.5, color='#94a3b8'
    )

    series = [
        ('sedes_criticas', 'Críticas', '#ef4444'),
        ('sedes_medias', 'Medias', '#f59e0b'),
        ('sedes_bajas', 'Bajas', '#3b82f6'),
        ('sedes_buenas_practicas', 'Buenas prácticas', '#22c55e'),
        ('medidores_desconectados', 'Desconectados', '#94a3b8'),
    ]
    x = range(len(fechas))
    base = [0] * len(fechas)
    for campo, etiqueta, color in series:
        valores = [h.get(campo) or 0 for h in historial]
        ax.bar(x, valores, bottom=base, color=color, label=etiqueta, width=0.6)
        for i, v in enumerate(valores):
            if v:
                ax.text(i, base[i] + v / 2, str(v), ha='center', va='center', fontsize=8.5, color='#0f172a', fontweight='bold')
        base = [b + v for b, v in zip(base, valores)]

    # Total de sedes analizadas arriba de cada barra: la altura de la barra
    # ya lo representa visualmente, pero el numero explicito deja claro
    # cuando la cobertura cambio de una corrida a otra (ej. 50 vs 55 sedes).
    for i, total in enumerate(base):
        ax.annotate(f"Total: {int(total)} sedes", (i, total), textcoords="offset points", xytext=(0, 4),
                    ha='center', fontsize=8, color='#cbd5e1', fontweight='bold')

    ax.set_xticks(list(x))
    ax.set_xticklabels(fechas)
    ax.tick_params(colors='#cbd5e1', labelsize=10)
    for spine in ax.spines.values():
        spine.set_color('#334155')
    ax.grid(axis='y', color='#334155', linestyle='--', alpha=0.5)
    plt.setp(ax.get_xticklabels(), rotation=30, ha='right')
    leyenda = ax.legend(loc='upper center', bbox_to_anchor=(0.5, -0.16), ncol=5, frameon=False, fontsize=9.5)
    for texto in leyenda.get_texts():
        texto.set_color('#e2e8f0')

    plt.tight_layout(rect=[0, 0, 1, 0.90])
    return fig


def _fig_seguimiento_plan_accion(servicio, categorias_anterior, categorias_actual):
    """Tabla: de las sedes criticas de la corrida anterior, cuales se
    resolvieron y cuales siguen igual (reincidentes) en la corrida actual.
    Mide si las solicitudes de servicio del Plan de Accion realmente estan
    funcionando."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    criticas_antes = [sede for sede, cat in categorias_anterior.items() if cat == 'CRITICA']
    filas = []
    sin_verificar = 0
    for sede in sorted(criticas_antes):
        cat_ahora = categorias_actual.get(sede)
        if cat_ahora is None:
            # La sede no aparece en el historial de la corrida actual (por ej.
            # esa sede fallo al descargar esta vez). NO se asume "Resuelta"
            # sin datos que lo confirmen: se omite de la tabla en vez de dar
            # un resultado falso.
            sin_verificar += 1
            continue
        resultado = "Resuelta" if cat_ahora != 'CRITICA' else "Reincidente"
        filas.append([sede, cat_ahora, resultado])

    alto = max(2.5, 0.35 * len(filas) + 1.9)
    fig, ax = plt.subplots(figsize=(11, alto), dpi=200, facecolor='#0f172a')
    ax.axis('off')
    resueltas = sum(1 for f in filas if 'Resuelta' in f[2])
    ax.set_title(
        f"{servicio} — Seguimiento del Plan de Acción ({resueltas}/{len(filas)} resueltas)",
        color='#fff', fontsize=14, fontweight='bold', pad=32
    )
    if sin_verificar:
        # Offset en PUNTOS (no fraccion de eje) para que quede siempre debajo
        # del titulo sin importar la altura de la figura (ver mismo fix ya
        # aplicado en el grafico de consumo por sede).
        ax.annotate(
            f"({sin_verificar} sede(s) crítica(s) de la corrida anterior no se pudieron verificar en esta corrida y se omitieron)",
            xy=(0.5, 1), xycoords='axes fraction', xytext=(0, 8), textcoords='offset points',
            ha='center', va='bottom', fontsize=8.5, color='#94a3b8', style='italic'
        )

    if filas:
        tabla = ax.table(
            cellText=filas, colLabels=["Sede (era crítica)", "Categoría ahora", "Resultado"],
            cellLoc='left', loc='center'
        )
        tabla.auto_set_font_size(False)
        tabla.set_fontsize(9.5)
        tabla.scale(1, 1.5)
        for (row, col), celda in tabla.get_celld().items():
            celda.set_edgecolor('#334155')
            if row == 0:
                celda.set_facecolor('#1e293b')
                celda.set_text_props(color='#fff', fontweight='bold')
            else:
                celda.set_facecolor('#0f172a')
                if col == 2:
                    color_resultado = '#22c55e' if filas[row - 1][2] == 'Resuelta' else '#ef4444'
                    celda.set_text_props(color=color_resultado, fontweight='bold')
                else:
                    celda.set_text_props(color='#e2e8f0')
    else:
        mensaje = (
            "Ninguna de las sedes críticas de la corrida anterior se pudo verificar en esta corrida."
            if sin_verificar else
            "No había sedes críticas en la corrida anterior para hacer seguimiento."
        )
        ax.text(0.5, 0.5, mensaje, ha='center', va='center', fontsize=11, color='#94a3b8', transform=ax.transAxes)

    plt.tight_layout()
    return fig


def generar_pdf_perfil_resultados(servicio, umbral_critico_dia=0, umbral_medio_dia=0):
    """
    PDF de seguimiento: como evolucionan los indicadores de este servicio
    corrida a corrida (fuga diaria, sedes por categoria, resolucion del
    Plan de Accion), para medir si las acciones tomadas realmente estan
    funcionando con el tiempo. Requiere al menos una fila guardada en
    pme_historial_resultados (la de la corrida actual); con una sola
    corrida el PDF sale igual, solo que sin tendencia (es la linea base).
    """
    import io
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages

    historial = obtener_historial_resultados(servicio, limite=12)
    if not historial:
        return None

    actual = historial[-1]
    anterior = historial[-2] if len(historial) >= 2 else None
    base = historial[0]

    try:
        fecha_actual = datetime.fromisoformat(actual['fecha_ejecucion'].replace('Z', '+00:00'))
        fecha_base = datetime.fromisoformat(base['fecha_ejecucion'].replace('Z', '+00:00'))
        dias_transcurridos = max(1, (fecha_actual - fecha_base).days)
    except Exception:
        dias_transcurridos = 1

    buffer = io.BytesIO()
    with PdfPages(buffer) as pdf:
        fig1 = _fig_kpis_resultados(servicio, actual, anterior, base, dias_transcurridos)
        _agregar_pie_pagina(fig1)
        pdf.savefig(fig1, facecolor=fig1.get_facecolor())
        plt.close(fig1)

        if len(historial) >= 2:
            fig2 = _fig_tendencia_fuga(servicio, historial)
            _agregar_pie_pagina(fig2)
            pdf.savefig(fig2, facecolor=fig2.get_facecolor())
            plt.close(fig2)

            fig3 = _fig_tendencia_categorias(servicio, historial)
            _agregar_pie_pagina(fig3)
            pdf.savefig(fig3, facecolor=fig3.get_facecolor())
            plt.close(fig3)

        if anterior:
            categorias_anterior = obtener_categorias_sedes_historial(anterior.get('id'))
            categorias_actual = obtener_categorias_sedes_historial(actual.get('id'))
            fig4 = _fig_seguimiento_plan_accion(servicio, categorias_anterior, categorias_actual)
            _agregar_pie_pagina(fig4)
            pdf.savefig(fig4, facecolor=fig4.get_facecolor())
            plt.close(fig4)

        fig_firma = _fig_firma_cierre()
        _agregar_pie_pagina(fig_firma)
        pdf.savefig(fig_firma, facecolor=fig_firma.get_facecolor())
        plt.close(fig_firma)

    buffer.seek(0)
    return buffer.getvalue()
