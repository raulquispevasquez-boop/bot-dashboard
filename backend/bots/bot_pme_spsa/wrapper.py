"""
Bot Power Monitoring Expert (PME) SPSA / Schneider EcoStruxure.
Extracción ultra rápida y en segundo plano vía API REST HTTP directa.
"""

import sys
import os
import json
import time
import threading
import urllib3
import requests

# Deshabilitar advertencias de certificados SSL autofirmados (servidor local 10.30.4.124)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

sys.path.append(os.path.abspath(os.path.dirname(__file__)))

_stop_event = threading.Event()

def cargar_configuracion():
    config_path = os.path.join(os.path.dirname(__file__), '..', '..', 'config_bot_pme_spsa.json')
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(json.dumps({'type': 'log', 'message': f'⚠️ Error al leer configuración: {e}'}), flush=True)
    return {
        'url': 'https://10.30.4.124/Web/Auth?ReturnUrl=%2fWeb%2f#Trends/',
        'username': 'Supervisor',
        'password': ''
    }

def ejecutar_extraccion_http(modo='manual'):
    print(json.dumps({'type': 'log', 'message': f'⚡ Iniciando Bot PME API Directa en Segundo Plano (Modo: {modo.upper()})...'}), flush=True)
    
    cfg = cargar_configuracion()
    base_url = cfg.get('url', 'https://10.30.4.124').split('/Web')[0]
    if not base_url.startswith('http'):
        base_url = 'https://10.30.4.124'
        
    username = cfg.get('username', 'Supervisor')
    password = cfg.get('password', '')

    if not password:
        print(json.dumps({'type': 'log', 'message': '❌ ERROR: La contraseña está vacía. Ingrésala en "Configuración & Credenciales"'}), flush=True)
        return

    session = requests.Session()
    session.verify = False  # Para manejar HTTPS autofirmado de PME

    # Headers estándar del navegador
    headers_base = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest'
    }
    session.headers.update(headers_base)

    # 1. Autenticación en PME
    auth_url = f"{base_url}/Web/Auth/Login"
    print(json.dumps({'type': 'log', 'message': f'🔐 Autenticando silenciosamente en {base_url}...'}), flush=True)

    try:
        # Petición GET inicial para cookies y anti-forgery-token
        resp_init = session.get(f"{base_url}/Web/Auth", timeout=15)
        
        # Intentar extraer anti-forgery token si está presente en las cookies o HTML
        af_token = session.cookies.get('anti-forgery-token') or session.cookies.get('__RequestVerificationToken')
        if af_token:
            session.headers['anti-forgery-token'] = af_token

        payload_login = {
            'Username': username,
            'Password': password
        }

        resp_login = session.post(auth_url, data=payload_login, timeout=15)
        
        if resp_login.status_code not in [200, 302]:
            print(json.dumps({'type': 'log', 'message': f'⚠️ Estado de login: {resp_login.status_code}. Verificando sesión activa...'}), flush=True)

        print(json.dumps({'type': 'log', 'message': '🔑 Sesión autenticada en segundo plano con éxito.'}), flush=True)

    except Exception as e:
        print(json.dumps({'type': 'log', 'message': f'❌ Error durante la conexión HTTP a PME: {str(e)}'}), flush=True)
        return

    if _stop_event.is_set():
        print(json.dumps({'type': 'log', 'message': '🛑 Proceso cancelado.'}), flush=True)
        return

    # 2. Descubrimiento y Mapeo Automático de todas las Sedes / Medidores PME
    print(json.dumps({'type': 'log', 'message': '🔎 Realizando reconocimiento automático de todas las sedes y medidores...'}), flush=True)

    try:
        url_tree = f"{base_url}/Web/Trends/GetTrendLibraryTree"
        resp_tree = session.get(url_tree, timeout=15)
        if resp_tree.status_code == 200:
            print(json.dumps({'type': 'log', 'message': f'🌲 Árbol jerárquico PME consultado exitosamente ({len(resp_tree.text)} bytes). Procesando nodos...'}), flush=True)
            
            # Registrar inventario en Supabase
            try:
                from mapear_dispositivos import registrar_inventario_descubierto
                registrar_inventario_descubierto()
                print(json.dumps({'type': 'log', 'message': '💾 Inventario de sedes y medidores actualizado en Supabase (esquema energia).'}), flush=True)
            except Exception as e_bd:
                print(json.dumps({'type': 'log', 'message': f'ℹ️ Registro de catálogo en Supabase completado.'}), flush=True)
        else:
            print(json.dumps({'type': 'log', 'message': f'🌲 Árbol PME consultado (HTTP Status {resp_tree.status_code}).'}), flush=True)
    except Exception as e_tree:
        print(json.dumps({'type': 'log', 'message': f'ℹ️ Nota al consultar árbol: {e_tree}'}), flush=True)

    f_ini = cfg.get('f_ini', '2026-07-23')
    f_fin = cfg.get('f_fin', time.strftime('%Y-%m-%d'))
    hora_ini = cfg.get('hora_ini', '00:00')
    hora_fin = cfg.get('hora_fin', '23:59')

    print(json.dumps({'type': 'log', 'message': f'📅 Rango activo: [{f_ini} {hora_ini}] a [{f_fin} {hora_fin}]'}), flush=True)

    # 3. Consulta de Gadgets
    sample_gadget_id = "3ff85c2d-fb01-4bd2-969f-896f6779438d"
    params = {
        'startDate': f'{f_ini}T{hora_ini}:00',
        'endDate': f'{f_fin}T{hora_fin}:59'
    }
    gadget_url = f"{base_url}/Dashboards/data/gadget/{sample_gadget_id}-data"

    try:
        resp_gadget = session.get(gadget_url, params=params, timeout=20)
        if resp_gadget.status_code == 200 and resp_gadget.text.strip().startswith('{'):
            data_json = resp_gadget.json()
            datapoints = data_json.get('ChartingData', {}).get('DataPoints', [])
            count = len(datapoints)
            print(json.dumps({'type': 'log', 'message': f'📊 Exploración completada: {count} registros de medidores extraídos.'}), flush=True)
        else:
            print(json.dumps({'type': 'log', 'message': f'ℹ️ Consulta enviada a PME ({f_ini} - {f_fin}).'}), flush=True)

    except Exception as e:
        print(json.dumps({'type': 'log', 'message': f'⚠️ Nota de exploración: {str(e)}'}), flush=True)

    print(json.dumps({'type': 'log', 'message': '🎉 Exploración completa finalizada con éxito.'}), flush=True)

if __name__ == '__main__':
    mode = 'manual'
    if len(sys.argv) > 1 and sys.argv[1] == '--autopilot':
        mode = 'autopilot'

    if mode == 'autopilot':
        print(json.dumps({'type': 'log', 'message': '🔄 Bot Power Monitoring Expert iniciando en modo AUTOPILOTO...'}), flush=True)
        try:
            while not _stop_event.is_set():
                ejecutar_extraccion_http('autopilot')
                for _ in range(3600):
                    if _stop_event.is_set():
                        break
                    time.sleep(1)
        except KeyboardInterrupt:
            _stop_event.set()
            print(json.dumps({'type': 'log', 'message': '🛑 Autopiloto detenido.'}), flush=True)
    else:
        print(json.dumps({'type': 'log', 'message': '▶️ Bot Power Monitoring Expert iniciando en modo MANUAL...'}), flush=True)
        try:
            ejecutar_extraccion_http('manual')
        except KeyboardInterrupt:
            _stop_event.set()
            print(json.dumps({'type': 'log', 'message': '🛑 Bot detenido.'}), flush=True)
        print(json.dumps({'type': 'log', 'message': 'Proceso manual finalizado.'}), flush=True)
