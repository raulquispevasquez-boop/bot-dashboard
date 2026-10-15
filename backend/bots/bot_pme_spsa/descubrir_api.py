"""
Descubrir todos los Endpoints REST de la API de PME SystemDataService
"""

import os
import json
import requests
import urllib3
import re

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def cargar_config_pme():
    path = os.path.join(os.path.dirname(__file__), '..', '..', 'config_bot_pme_spsa.json')
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def descubrir_endpoints_pme():
    cfg = cargar_config_pme()
    base_url = cfg['url'].split('/Web')[0]
    session = requests.Session()
    session.verify = False

    # Login
    r_init = session.get(f"{base_url}/Web/Auth/Login")
    token = re.search(r'Anti-Forgery-Token":\s*"([^"]+)"', r_init.text).group(1)
    
    r_auth = session.post(
        f"{base_url}/SystemDataService/Security/ValidateCredentials",
        headers={'Content-Type': 'application/json', 'Anti-Forgery-Token': token},
        json={"userName": cfg['username'], "password": cfg['password'], "returnUrl": "/Web/", "setAuthCookie": True}
    )

    print(f"[AUTH OK] Login exitoso: {r_auth.json().get('IsValid')}")

    # Lista de endpoints probables en Schneider EcoStruxure PME
    rutas_prueba = [
        "/SystemDataService/Trends/GetTrendLibraryTree",
        "/SystemDataService/Trends/GetSources",
        "/SystemDataService/Trends/GetMeasurementTypes",
        "/Dashboards/data/gadgets",
        "/Dashboards/data/dashboards",
        "/SystemDataService/Hierarchy/GetHierarchyTree",
        "/SystemDataService/Security/GetUserInfo"
    ]

    for r in rutas_prueba:
        url = f"{base_url}{r}"
        res = session.get(url, headers={'Anti-Forgery-Token': token})
        print(f"URL: {r} -> Status: {res.status_code} ({len(res.text)} bytes)")
        if res.status_code == 200:
            print(f"   RESPUESTA: {res.text[:300]}\n")

if __name__ == '__main__':
    descubrir_endpoints_pme()
