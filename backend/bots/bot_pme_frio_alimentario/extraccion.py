# -*- coding: utf-8 -*-
"""
Motor de extraccion del Bot Consolidado Frio Alimentario (familia de bots PME).

Recorre las sedes del dashboard "CONSOLIDADO FRIO ALIMENTARIO" en Schneider
PME y consolida el historico horario disponible en Supabase
(energia.pme_frio_alimentario).

A diferencia de HVAC/Iluminacion (equipos que deberian estar apagados fuera
de un horario), la refrigeracion opera 24/7: no existe un "horario en que
deberia estar en cero". Por eso el desperdicio se mide con 4 señales
independientes en vez de un solo rango horario:
  1. Maximo de consumo diario (el total de las 24 horas no debe superarlo).
  2. Maximo por hora, aplicado a las 24 horas del dia (no a una ventana).
  3. Ventana opcional de bajo consumo esperado (el "valle" del ciclo).
  4. Linea base dinamica: semana actual vs. semana anterior, usando el
     historico ya acumulado en Supabase (no el rango descargado en esta
     corrida), para no depender de dias_historico.
Los umbrales de las 4 señales se pueden afinar por sede en
energia.pme_config_sedes; si una sede no tiene fila ahi, se usa el valor
global configurado en el panel de esta especialidad.

NOTA: DASHBOARD_FRIO_ID esta pendiente de configurar. Se obtiene igual que
el de HVAC/Iluminacion: abrir el dashboard de Frio en PME y tomar el
DashboardId de la URL /Web/#Dashboards/lib/{id}.
"""

import os
import sys
import json
import time
from datetime import datetime

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
import pme_common as pme

DASHBOARD_FRIO_ID = "38c120fc-3592-4e5c-aeab-977f7c275911"  # "CONSOLIDADO FRIO ALIMENTARIO"
SERVICIO = "Frío Alimentario"
SUFIJO_MEDIDOR = "Frio"  # asi esta poblado en energia.pme_dispositivos_mapeo
TABLA = "pme_frio_alimentario"
COLUMNAS_CONFLICTO = ["timestamp_local", "sede", "medidor_nombre", "parametro"]

FALLOS_CONSECUTIVOS_PARA_ABORTAR = 5
UMBRAL_CORRIDA_INCOMPLETA = 0.15


def cargar_config_frio():
    """Configuracion propia de este bot: rango de historico, agregacion, y
    los umbrales GLOBALES por defecto de las 4 señales de desperdicio (una
    sede especifica puede sobreescribirlos en energia.pme_config_sedes)."""
    config_path = os.path.join(os.path.dirname(__file__), 'config_pme_frio_alimentario.json')
    if os.path.exists(config_path):
        with open(config_path, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
    else:
        cfg = {}
    cfg.setdefault('dias_historico', 14)  # >=14 dias para que la linea base dinamica tenga con que comparar
    cfg.setdefault('agregacion', 'hora')

    alerta = cfg.get('alerta_consumo') or {}
    alerta.setdefault('activo', False)
    alerta.setdefault('destinatarios', '')
    alerta.setdefault('copia', '')
    alerta.setdefault('nombre_remitente', pme.NOMBRE_REMITENTE_ALERTA_DEFAULT)
    alerta.setdefault('precio_kwh', 0.0)
    # Señal 1: maximo diario (global, por defecto)
    alerta.setdefault('maximo_kwh_dia', 0.0)
    # Señal 2: maximo por hora, las 24 horas del dia (global, por defecto)
    alerta.setdefault('maximo_kwh_hora', 0.0)
    # Señal 3: ventana opcional de bajo consumo esperado
    alerta.setdefault('ventana_baja_activo', False)
    alerta.setdefault('ventana_baja_hora_inicio', '01:00')
    alerta.setdefault('ventana_baja_hora_fin', '05:00')
    alerta.setdefault('ventana_baja_linea_base_kwh', 0.0)
    # Señal 4: linea base dinamica (semana actual vs. semana anterior)
    alerta.setdefault('linea_base_dinamica_activo', True)
    alerta.setdefault('linea_base_dinamica_umbral_pct', 20.0)
    cfg['alerta_consumo'] = alerta

    return cfg


def procesar_puntos(datos, sede, agregacion='hora', mapa_ceco=None, device_ids=None, mapa_devices=None,
                     virtual_meter_ids=None, mapa_virtual_meters=None):
    mapa_ceco = mapa_ceco or {}
    mapa_devices = mapa_devices or {}
    medidor_nombre = f"{sede} - {SUFIJO_MEDIDOR}"
    ceco = pme.resolver_ceco_dispositivo(
        SERVICIO, medidor_nombre, device_ids, mapa_ceco, mapa_devices,
        virtual_meter_ids=virtual_meter_ids, mapa_virtual_meters=mapa_virtual_meters
    )
    filas = []
    for p in datos.get("ChartingData", {}).get("DataPoints", []):
        valor = p.get("Value")
        if valor is None:
            continue
        ts = p.get("TimestampLocal", "")
        time_label = p.get("TimeLabel", "00:00")
        if 'T' not in ts:
            continue
        fecha_str = ts.split("T")[0]
        try:
            fecha_obj = datetime.strptime(fecha_str, "%Y-%m-%d").date()
        except ValueError:
            continue

        if agregacion == 'dia':
            hora_str = "00:00:00"
        else:
            hora_str = f"{time_label}:00"
        timestamp_local = f"{fecha_str}T{hora_str}-05:00"

        filas.append({
            "timestamp_local": timestamp_local,
            "anio": fecha_obj.year,
            "mes": fecha_obj.month,
            "fecha": fecha_str,
            "hora": hora_str,
            "sede": sede,
            "ceco": ceco,
            "medidor_nombre": medidor_nombre,
            "parametro": "Energia Activa",
            "valor": round(float(valor), 4),
            "unidad": "kWh",
            "pme_device_id": device_ids or None,
            "pme_virtual_meter_id": virtual_meter_ids or None,
        })
    return filas


def ejecutar(dias_historico=None, agregacion=None, fecha_inicio=None, fecha_fin=None):
    """
    fecha_inicio/fecha_fin ("YYYY-MM-DD"): descarga puntual de un rango
    FIJO (backfill), en vez del intervalo movil configurado. Prioridad
    sobre dias_historico/config si ambos vienen. No se guarda en
    config_pme_frio.json -corrida unica.
    """
    if not DASHBOARD_FRIO_ID:
        pme.log("⚠️ Este bot aún no está configurado: falta el DashboardId de 'CONSOLIDADO FRÍO ALIMENTARIO' en PME.")
        pme.log("ℹ️ Comparte una captura del dashboard de Frío (URL /Web/#Dashboards/lib/{id}) para completar la configuración.")
        return

    creds = pme.cargar_credenciales()
    cfg = cargar_config_frio()
    rango_fijo = bool(fecha_inicio and fecha_fin)
    if rango_fijo:
        dias_historico = (datetime.strptime(fecha_fin, "%Y-%m-%d") - datetime.strptime(fecha_inicio, "%Y-%m-%d")).days + 1
    elif dias_historico is None:
        dias_historico = cfg.get('dias_historico', 14)
    if agregacion is None:
        agregacion = cfg.get('agregacion', 'hora')

    aggregation_id = pme.AGGREGATION_IDS.get(agregacion, pme.AGGREGATION_HORARIA)
    config_alerta = cfg.get('alerta_consumo', {})

    detalle_periodo = f"{fecha_inicio} a {fecha_fin}" if rango_fijo else f"últimos {dias_historico} días"
    pme.log(f"🧊 Iniciando Bot Consolidado Frío Alimentario ({detalle_periodo}, agregacion: {agregacion})...")
    pme.progreso(0)
    pme.status_txt('Autenticando...')
    pme.fase('login', 'activo')
    msg_id_progreso = pme.enviar_telegram_progreso_inicio(
        "Consolidado Frío Alimentario", detalle=f"{detalle_periodo} · agregación {agregacion}"
    )

    username = creds.get('username', 'Supervisor')
    password = creds.get('password', '')
    if not password:
        pme.log("❌ ERROR: La contraseña PME está vacía. Configúrala en el Bot Master PME.")
        pme.fase('login', 'error')
        return

    try:
        session = pme.iniciar_sesion(username, password)
        pme.log("🔑 Sesión autenticada correctamente.")
        pme.fase('login', 'ok')
        pme.progreso(10)
        pme.actualizar_telegram_progreso(msg_id_progreso, "Consolidado Frío Alimentario", 10, "🔑 Sesión autenticada")
    except Exception as e:
        pme.log(f"❌ Error al autenticar: {e}")
        pme.fase('login', 'error')
        pme.actualizar_telegram_progreso(msg_id_progreso, "Consolidado Frío Alimentario", 10, f"❌ Error al autenticar: {e}", forzar=True)
        return

    pme.fase('sedes', 'activo')
    pme.status_txt('Buscando sedes...')
    try:
        gadgets = pme.obtener_gadgets_dashboard(session, DASHBOARD_FRIO_ID)
        pme.fase('sedes', 'ok')
        pme.progreso(15)
    except Exception as e:
        pme.log(f"❌ Error al obtener el listado de sedes: {e}")
        pme.fase('sedes', 'error')
        pme.actualizar_telegram_progreso(msg_id_progreso, "Consolidado Frío Alimentario", 15, f"❌ Error al buscar sedes: {e}", forzar=True)
        return

    pme.log(f"🏢 {len(gadgets)} sedes encontradas en CONSOLIDADO FRÍO ALIMENTARIO.")

    mapa_ceco = pme.cargar_mapa_ceco()
    mapa_devices = pme.cargar_mapa_devices_pme()
    mapa_virtual_meters = pme.cargar_mapa_virtual_meters_pme()
    config_sedes = pme.cargar_config_sedes(SERVICIO)

    pme.fase('descarga', 'activo')
    total = len(gadgets) or 1
    total_filas = []
    resumen_periodo = []
    resumen_todas_sedes = []
    sedes_fallidas = []
    sedes_sin_ceco = []
    fallos_consecutivos = 0
    corrida_interrumpida = False
    for idx, g in enumerate(gadgets):
        sede = g['titulo']
        pme.status_txt(f"Descargando {sede} ({idx + 1}/{total})")
        try:
            datos = pme.obtener_datos_gadget(
                session, g['gadget_id'], dias_historico=dias_historico, aggregation_id=aggregation_id,
                fecha_inicio=fecha_inicio, fecha_fin=fecha_fin
            )
            filas = procesar_puntos(
                datos, sede, agregacion=agregacion, mapa_ceco=mapa_ceco,
                device_ids=g.get('device_ids'), mapa_devices=mapa_devices,
                virtual_meter_ids=g.get('virtual_meter_ids'), mapa_virtual_meters=mapa_virtual_meters
            )
            total_filas.extend(filas)
            tiene_datos = len(filas) > 0
            if tiene_datos and filas[0]['ceco'] is None:
                sedes_sin_ceco.append(sede)
            estado_txt = "" if tiene_datos else " ⚠️ SIN DATOS"
            pme.log(f"  📊 {sede}: {len(filas)} registros.{estado_txt}")
            if not rango_fijo:
                # NUNCA durante un backfill de rango fijo (ver comentario igual en
                # bot_pme_hvac/extraccion.py) - dispararia solicitudes Fracttal falsas.
                pme.verificar_estado_medidor(SERVICIO, sede, filas, medidor_nombre=f"{sede} - {SUFIJO_MEDIDOR}")

            if config_alerta.get('activo') and filas:
                maximo_dia = pme.resolver_valor_sede(config_sedes, sede, 'maximo_kwh_dia', config_alerta)
                maximo_hora = pme.resolver_valor_sede(config_sedes, sede, 'maximo_kwh_hora', config_alerta)
                excesos_dia = pme.detectar_exceso_maximo_diario(filas, maximo_dia)
                excesos_hora = pme.detectar_exceso_maximo_hora(filas, maximo_hora)

                ventana_activo = pme.resolver_valor_sede(config_sedes, sede, 'ventana_baja_activo', config_alerta)
                excesos_ventana = []
                if ventana_activo:
                    v_inicio = pme.resolver_valor_sede(config_sedes, sede, 'ventana_baja_hora_inicio', config_alerta)
                    v_fin = pme.resolver_valor_sede(config_sedes, sede, 'ventana_baja_hora_fin', config_alerta)
                    v_base = pme.resolver_valor_sede(config_sedes, sede, 'ventana_baja_linea_base_kwh', config_alerta)
                    excesos_ventana = pme.detectar_consumos_fuera_horario(filas, v_inicio, v_fin, v_base)

                linea_base = None
                corte_parcial = None
                if config_alerta.get('linea_base_dinamica_activo', True):
                    umbral_pct = pme.resolver_valor_sede(
                        config_sedes, sede, 'linea_base_dinamica_umbral_pct', config_alerta, default=20
                    )
                    linea_base = pme.calcular_linea_base_dinamica(TABLA, sede, umbral_pct)
                    corte_parcial = pme.calcular_comparacion_corte_parcial(TABLA, sede, umbral_pct)

                total_kwh_sede = round(sum(f['valor'] for f in filas), 2)
                kwh_dia_sede = round(total_kwh_sede / dias_historico, 2) if dias_historico else total_kwh_sede
                volumen_m3 = (config_sedes.get(sede) or {}).get('volumen_refrigerado_m3')
                kwh_dia_m3 = round(kwh_dia_sede / volumen_m3, 3) if volumen_m3 else None
                resumen_todas_sedes.append({
                    'sede': sede, 'ceco': filas[0].get('ceco'), 'total_kwh': total_kwh_sede,
                    'kwh_dia': kwh_dia_sede, 'linea_base': linea_base, 'corte_parcial': corte_parcial,
                    'volumen_m3': volumen_m3, 'kwh_dia_m3': kwh_dia_m3,
                })

                if excesos_dia or excesos_hora or excesos_ventana or (linea_base and linea_base['supera_umbral']):
                    resumen_periodo.append({
                        'sede': sede, 'excesos_dia': excesos_dia, 'excesos_hora': excesos_hora,
                        'excesos_ventana': excesos_ventana, 'linea_base': linea_base,
                    })
            fallos_consecutivos = 0
        except Exception as e:
            pme.log(f"  ⚠️ Error en {sede}: {e}")
            sedes_fallidas.append(sede)
            fallos_consecutivos += 1
            if fallos_consecutivos >= FALLOS_CONSECUTIVOS_PARA_ABORTAR:
                faltantes = [x['titulo'] for x in gadgets[idx + 1:]]
                sedes_fallidas.extend(faltantes)
                pme.log(
                    f"🛑 Se corta la descarga tras {fallos_consecutivos} sedes seguidas con error de conexión "
                    f"(posible caída de VPN). Quedaron {len(faltantes)} sedes sin intentar."
                )
                corrida_interrumpida = True
                break
        pct = 15 + int(((idx + 1) / total) * 70)
        pme.progreso(pct)
        pme.actualizar_telegram_progreso(
            msg_id_progreso, "Consolidado Frío Alimentario", pct, f"📊 Descargando sedes ({idx + 1}/{total})"
        )
        time.sleep(0.3)
    pme.fase('descarga', 'ok')

    pme.fase('supabase', 'activo')
    pme.status_txt('Subiendo a Supabase...')
    pme.log(f"💾 Subiendo {len(total_filas)} registros consolidados a Supabase...")
    pme.actualizar_telegram_progreso(msg_id_progreso, "Consolidado Frío Alimentario", 90, "💾 Subiendo a Supabase...", forzar=True)
    subidos = pme.subir_a_supabase(TABLA, total_filas, COLUMNAS_CONFLICTO)
    pme.fase('supabase', 'ok')
    pme.progreso(95)

    sedes_ok = total - len(sedes_fallidas)
    pct_fallo = (len(sedes_fallidas) / total) if total else 0
    corrida_incompleta = corrida_interrumpida or pct_fallo > UMBRAL_CORRIDA_INCOMPLETA

    if sedes_fallidas:
        pme.log(f"⚠️ {len(sedes_fallidas)}/{total} sedes no se pudieron descargar en esta corrida.")

    pme.notificar_sedes_sin_ceco(SERVICIO, sedes_sin_ceco)

    if corrida_incompleta:
        pme.log("⚠️ Corrida incompleta: se avisa en vez de enviar un análisis con datos parciales.")
        pme.notificar_corrida_incompleta(SERVICIO, sedes_ok, total, sedes_fallidas, interrumpida=corrida_interrumpida)
    elif config_alerta.get('activo') and resumen_todas_sedes:
        pme.log("📊 Enviando análisis de señales de desperdicio (carga continua 24/7)...")
        fechas_periodo = [f['fecha'] for f in total_filas]
        fecha_ini_periodo = min(fechas_periodo) if fechas_periodo else None
        fecha_fin_periodo = max(fechas_periodo) if fechas_periodo else None
        pme.enviar_analisis_frio(
            SERVICIO, resumen_periodo, config_alerta, dias_historico, resumen_todas_sedes=resumen_todas_sedes,
            fecha_ini_periodo=fecha_ini_periodo, fecha_fin_periodo=fecha_fin_periodo
        )

    pme.fase('fin', 'ok')
    pme.progreso(100)
    pme.status_txt('Completado')
    texto_final = f"✅ Completado · {subidos} registros sincronizados" if not corrida_incompleta else f"⚠️ Completado con {len(sedes_fallidas)} sedes sin datos"
    pme.actualizar_telegram_progreso(msg_id_progreso, "Consolidado Frío Alimentario", 100, texto_final, forzar=True)
    pme.log(f"🎉 Bot Consolidado Frío Alimentario completado. {subidos} registros sincronizados en energia.{TABLA}.")
