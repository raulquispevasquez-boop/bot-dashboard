# -*- coding: utf-8 -*-
"""
Motor de extraccion del Bot Consolidado General (familia de bots PME).

Recorre las sedes del dashboard "CONSOLIDADO KWh GENERAL" en Schneider PME
(via API HTTP autenticada) y consolida el historico horario disponible
en Supabase (energia.pme_general).

El rango de historico (3/7/15 dias) se pide directamente al servidor via
el parametro ViewingPeriodOne (ver pme_common.obtener_datos_gadget), con
agregacion horaria fija. No depende ni modifica el rango guardado en cada
tarjeta del dashboard de PME.

Nota sobre nombres: el sufijo del medidor se arma como "- General", que es
exactamente como esta poblada de antemano la tabla
energia.pme_dispositivos_mapeo para servicio="General" (confirmado por
consulta directa antes de escribir este archivo -no es una suposicion).
"""

import os
import sys
import json
import time
from datetime import datetime

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
import pme_common as pme

DASHBOARD_GENERAL_ID = "7e5d7597-e04b-4b8e-877d-984a7343e8f4"  # "CONSOLIDADO KWh GENERAL"
SERVICIO = "General"
SUFIJO_MEDIDOR = "General"  # asi esta poblado en energia.pme_dispositivos_mapeo
TABLA = "pme_general"
COLUMNAS_CONFLICTO = ["timestamp_local", "sede", "medidor_nombre", "parametro"]

# Si N sedes seguidas fallan por conexion (incluso despues de los reintentos
# de obtener_datos_gadget), es senal de una caida sostenida (VPN caida), no
# un problema puntual de una sede: se corta la descarga en vez de agotar el
# timeout en cada una de las sedes restantes.
FALLOS_CONSECUTIVOS_PARA_ABORTAR = 5
# Si mas de este % de sedes no se pudieron descargar, la corrida se
# considera no confiable para armar el analisis (se avisa en vez de mandar
# un reporte con datos parciales que se veria como si esas sedes estuvieran bien).
UMBRAL_CORRIDA_INCOMPLETA = 0.15


def cargar_config_general():
    """Configuracion propia de este bot: rango de historico y agregacion,
    sincronizados con el mismo par de opciones del gadget de PME
    ("Intervalo de tiempo" + "Agregacion" en Configuracion del gadget)."""
    config_path = os.path.join(os.path.dirname(__file__), 'config_pme_general.json')
    if os.path.exists(config_path):
        with open(config_path, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
    else:
        cfg = {}
    cfg.setdefault('dias_historico', 3)
    cfg.setdefault('agregacion', 'hora')  # 'hora' | 'dia'
    # Hora punta/fuera de punta: EXCLUSIVO de este bot (no es la misma idea
    # que alerta_consumo.hora_inicio/hora_fin -esa vigila "consumo cuando
    # deberia estar apagado"; esta clasifica el consumo real por tramo
    # tarifario, sin importar si es o no horario normal de operacion).
    cfg.setdefault('hora_punta_inicio', '18:00')
    cfg.setdefault('hora_punta_fin', '23:00')

    alerta = cfg.get('alerta_consumo') or {}
    alerta.setdefault('activo', False)
    alerta.setdefault('hora_inicio', '23:00')
    alerta.setdefault('hora_fin', '06:00')
    alerta.setdefault('linea_base_kwh', 1.0)
    alerta.setdefault('destinatarios', '')
    alerta.setdefault('copia', '')
    alerta.setdefault('cuerpo_mensaje', pme.PLANTILLA_ALERTA_CONSUMO_DEFAULT)
    alerta.setdefault('asunto', pme.ASUNTO_ALERTA_CONSUMO_DEFAULT)
    alerta.setdefault('nombre_remitente', pme.NOMBRE_REMITENTE_ALERTA_DEFAULT)
    alerta.setdefault('precio_kwh', 0.0)
    alerta.setdefault('adjuntar_excel', True)
    alerta.setdefault('umbral_critico_soles_dia', 0.0)
    alerta.setdefault('umbral_medio_soles_dia', 0.0)
    # Apagado por defecto -mismo criterio que Iluminacion/Frio: el aviso
    # individual por sede/dia duplica lo que ya se ve en PME. El reporte
    # general del final de la corrida ya cubre esto de forma consolidada.
    alerta.setdefault('alertas_individuales_activo', False)
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
            # TimeLabel es una fecha en texto ("30 de Jul."), no una hora: el
            # punto representa el total del dia, se guarda a las 00:00.
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
    config_pme_general.json -corrida unica.
    """
    creds = pme.cargar_credenciales()
    cfg = cargar_config_general()
    rango_fijo = bool(fecha_inicio and fecha_fin)
    if rango_fijo:
        dias_historico = (datetime.strptime(fecha_fin, "%Y-%m-%d") - datetime.strptime(fecha_inicio, "%Y-%m-%d")).days + 1
    elif dias_historico is None:
        dias_historico = cfg.get('dias_historico', 3)
    if agregacion is None:
        agregacion = cfg.get('agregacion', 'hora')

    aggregation_id = pme.AGGREGATION_IDS.get(agregacion, pme.AGGREGATION_HORARIA)
    config_alerta = cfg.get('alerta_consumo', {})

    detalle_periodo = f"{fecha_inicio} a {fecha_fin}" if rango_fijo else f"últimos {dias_historico} días"
    pme.log(f"⚡ Iniciando Bot Consolidado General ({detalle_periodo}, agregacion: {agregacion})...")
    pme.progreso(0)
    pme.status_txt('Autenticando...')
    pme.fase('login', 'activo')
    msg_id_progreso = pme.enviar_telegram_progreso_inicio(
        "Consolidado General", detalle=f"{detalle_periodo} · agregación {agregacion}"
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
        pme.actualizar_telegram_progreso(msg_id_progreso, "Consolidado General", 10, "🔑 Sesión autenticada")
    except Exception as e:
        pme.log(f"❌ Error al autenticar: {e}")
        pme.fase('login', 'error')
        pme.actualizar_telegram_progreso(msg_id_progreso, "Consolidado General", 10, f"❌ Error al autenticar: {e}", forzar=True)
        return

    pme.fase('sedes', 'activo')
    pme.status_txt('Buscando sedes...')
    try:
        gadgets = pme.obtener_gadgets_dashboard(session, DASHBOARD_GENERAL_ID)
        pme.fase('sedes', 'ok')
        pme.progreso(15)
    except Exception as e:
        pme.log(f"❌ Error al obtener el listado de sedes: {e}")
        pme.fase('sedes', 'error')
        pme.actualizar_telegram_progreso(msg_id_progreso, "Consolidado General", 15, f"❌ Error al buscar sedes: {e}", forzar=True)
        return

    pme.log(f"🏢 {len(gadgets)} sedes encontradas en CONSOLIDADO KWh GENERAL.")

    mapa_ceco = pme.cargar_mapa_ceco()
    mapa_devices = pme.cargar_mapa_devices_pme()
    mapa_virtual_meters = pme.cargar_mapa_virtual_meters_pme()

    pme.fase('descarga', 'activo')
    total = len(gadgets) or 1
    total_filas = []
    resumen_periodo = []
    sedes_fallidas = []
    sedes_sin_ceco = []
    fallos_consecutivos = 0
    corrida_interrumpida = False
    for idx, g in enumerate(gadgets):
        pme.status_txt(f"Descargando {g['titulo']} ({idx + 1}/{total})")
        try:
            datos = pme.obtener_datos_gadget(
                session, g['gadget_id'], dias_historico=dias_historico, aggregation_id=aggregation_id,
                fecha_inicio=fecha_inicio, fecha_fin=fecha_fin
            )
            filas = procesar_puntos(
                datos, g['titulo'], agregacion=agregacion, mapa_ceco=mapa_ceco,
                device_ids=g.get('device_ids'), mapa_devices=mapa_devices,
                virtual_meter_ids=g.get('virtual_meter_ids'), mapa_virtual_meters=mapa_virtual_meters
            )
            total_filas.extend(filas)
            tiene_datos = len(filas) > 0
            if tiene_datos and filas[0]['ceco'] is None:
                sedes_sin_ceco.append(g['titulo'])
            estado_txt = "" if tiene_datos else " ⚠️ SIN DATOS"
            pme.log(f"  📊 {g['titulo']}: {len(filas)} registros.{estado_txt}")
            if not rango_fijo:
                # NUNCA durante un backfill de rango fijo (ver comentario igual en
                # bot_pme_hvac/extraccion.py) - dispararia solicitudes Fracttal falsas.
                pme.verificar_estado_medidor(SERVICIO, g['titulo'], filas, medidor_nombre=f"{g['titulo']} - {SUFIJO_MEDIDOR}")
            if config_alerta.get('alertas_individuales_activo'):
                pme.verificar_consumo_fuera_horario(SERVICIO, g['titulo'], filas, config_alerta)
            if config_alerta.get('activo'):
                resumen_sede = pme.calcular_consumo_periodo_fuera_horario(
                    filas, config_alerta.get('hora_inicio', '23:00'), config_alerta.get('hora_fin', '06:00')
                )
                resumen_periodo.append({'sede': g['titulo'], **resumen_sede})
            fallos_consecutivos = 0
        except Exception as e:
            pme.log(f"  ⚠️ Error en {g['titulo']}: {e}")
            sedes_fallidas.append(g['titulo'])
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
            msg_id_progreso, "Consolidado General", pct, f"📊 Descargando sedes ({idx + 1}/{total})"
        )
        time.sleep(0.3)
    pme.fase('descarga', 'ok')

    pme.fase('supabase', 'activo')
    pme.status_txt('Subiendo a Supabase...')
    pme.log(f"💾 Subiendo {len(total_filas)} registros consolidados a Supabase...")
    pme.actualizar_telegram_progreso(msg_id_progreso, "Consolidado General", 90, "💾 Subiendo a Supabase...", forzar=True)
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
    elif config_alerta.get('activo') and resumen_periodo:
        pme.log("📊 Enviando análisis de consumo fuera de horario e impacto por sede...")

        # Resumen cruzado General/HVAC/Iluminacion por sede -exclusivo de
        # este bot. Cruza por nombre de sede normalizado (no hay un ID
        # compartido entre las 3 tablas de datos crudos).
        resumen_cruzado_servicios = None
        try:
            kwh_general_por_sede = {}
            for f in total_filas:
                clave = pme.normalizar_sede(f['sede'])
                if clave not in kwh_general_por_sede:
                    kwh_general_por_sede[clave] = {'sede_original': f['sede'], 'kwh': 0.0}
                kwh_general_por_sede[clave]['kwh'] += f['valor']

            consumo_hvac = pme.cargar_consumo_total_por_sede('pme_hvac', dias_historico)
            consumo_iluminacion = pme.cargar_consumo_total_por_sede('pme_iluminacion', dias_historico)

            claves_todas = set(kwh_general_por_sede) | set(consumo_hvac) | set(consumo_iluminacion)
            resumen_cruzado_servicios = []
            for clave in claves_todas:
                general = kwh_general_por_sede.get(clave)
                hvac = consumo_hvac.get(clave)
                iluminacion = consumo_iluminacion.get(clave)
                nombre_sede = (general or hvac or iluminacion)['sede_original']
                resumen_cruzado_servicios.append({
                    'sede': nombre_sede,
                    'kwh_general': round(general['kwh'], 4) if general else None,
                    'kwh_hvac': round(hvac['kwh'], 4) if hvac else None,
                    'kwh_iluminacion': round(iluminacion['kwh'], 4) if iluminacion else None,
                })
        except Exception as e:
            pme.log(f"⚠️ No se pudo armar el resumen cruzado General/HVAC/Iluminación: {e}")

        pme.enviar_analisis_periodo_fuera_horario(
            SERVICIO, resumen_periodo, config_alerta, dias_historico, filas_horarias=total_filas, mapa_ceco=mapa_ceco,
            tabla=TABLA, sufijo_medidor=SUFIJO_MEDIDOR,
            hora_punta=(cfg.get('hora_punta_inicio', '18:00'), cfg.get('hora_punta_fin', '23:00')),
            resumen_cruzado_servicios=resumen_cruzado_servicios
        )

    # Envío unificado del Plan de Acción Consolidado de medidores desconectados y Excel a Telegram al finalizar
    try:
        medidores_todos = pme.obtener_medidores_desconectados_todos(["HVAC", "Iluminación", "Frío Alimentario", "General"])
        if medidores_todos:
            filas_agrupadas = pme.agrupar_medidores_por_sede(medidores_todos)
            excel_bytes = pme.generar_excel_medidores_consolidado(medidores_todos)
            today_str = datetime.now().strftime('%Y-%m-%d')
            pme.enviar_telegram_documento(
                excel_bytes,
                f"medidores_desconectados_consolidado_{today_str}.xlsx",
                caption=f"📊 Excel Consolidado — Medidores en mal estado ({len(medidores_todos)} medidores en {len(filas_agrupadas)} sedes)"
            )
            pme.enviar_plan_accion_consolidado_telegram(filas_agrupadas, total_medidores=len(medidores_todos))
    except Exception as e_med:
        pme.log(f"⚠️ No se pudo enviar el Plan de Acción consolidado a Telegram: {e_med}")

    pme.fase('fin', 'ok')
    pme.progreso(100)
    pme.status_txt('Completado')
    texto_final = f"✅ Completado · {subidos} registros sincronizados" if not corrida_incompleta else f"⚠️ Completado con {len(sedes_fallidas)} sedes sin datos"
    pme.actualizar_telegram_progreso(msg_id_progreso, "Consolidado General", 100, texto_final, forzar=True)
    pme.log(f"🎉 Bot Consolidado General completado. {subidos} registros sincronizados en energia.{TABLA}.")

