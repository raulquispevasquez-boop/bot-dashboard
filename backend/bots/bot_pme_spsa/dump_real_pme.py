"""
Script para capturar y volcar en un archivo JSON el HTML / JSON REAL exacto
que devuelve el servidor Schneider PME al consultar el arbol jerárquico de tendencias.
"""

import os
import sys
import json
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def cargar_config_pme():
    path = os.path.join(os.path.dirname(__file__), '..', '..', 'config_bot_pme_spsa.json')
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'url': 'https://10.30.4.124', 'username': 'Supervisor', 'password': ''}

def capturar_dump_real_pme():
    cfg = cargar_config_pme()
    base_url = cfg.get('url', 'https://10.30.4.124').split('/Web')[0]
    username = cfg.get('username', 'Supervisor')
    password = cfg.get('password', '')

    session = requests.Session()
    session.verify = False
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest'
    })

    # Login
    auth_resp = session.post(f"{base_url}/Web/Auth/Login", data={'Username': username, 'Password': password}, timeout=15)
    print(f"[AUTH] Login PME Status: {auth_resp.status_code}")

    # Endpoints reales de PME
    endpoints = [
        f"{base_url}/Web/Trends/GetTrendLibraryTree",
        f"{base_url}/SystemDataService/api/sources",
        f"{base_url}/Dashboards/data/gadget/3ff85c2d-fb01-4bd2-969f-896f6779438d-data"
    ]

    dump_resultados = {}

    for ep in endpoints:
        try:
            r = session.get(ep, timeout=15)
            print(f"[DUMP] {ep} -> Status {r.status_code} ({len(r.text)} bytes)")
            dump_resultados[ep] = r.text[:20000] # Primeros 20KB de respuesta real
        except Exception as e:
            dump_resultados[ep] = f"Error: {str(e)}"

    # Guardar en archivo local dump_pme_real.json
    out_file = os.path.join(os.path.dirname(__file__), 'dump_pme_real.json')
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(dump_resultados, f, indent=2, ensure_ascii=False)

    print(f"\n[OK] Volcado de estructura REAL de PME guardado en: {out_file}")

if __name__ == '__main__':
    capturar_dump_real_pme()
