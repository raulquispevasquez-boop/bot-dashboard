"""
Escanear la vista de Dashboards y Gadgets de PME para consultar
el listado dinámico real de todos los gadgets y medidores configurados.
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

def inspeccionar_dashboards_pme():
    cfg = cargar_config_pme()
    base_url = cfg['url'].split('/Web')[0]
    session = requests.Session()
    session.verify = False

    # 1. Login autenticado
    r_init = session.get(f"{base_url}/Web/Auth/Login")
    token = re.search(r'Anti-Forgery-Token":\s*"([^"]+)"', r_init.text).group(1)
    
    session.post(
        f"{base_url}/SystemDataService/Security/ValidateCredentials",
        headers={'Content-Type': 'application/json', 'Anti-Forgery-Token': token},
        json={"userName": cfg['username'], "password": cfg['password'], "returnUrl": "/Web/#Dashboards/", "setAuthCookie": True}
    )

    # 2. Consultar la página principal de Dashboards en HTML
    r_dash = session.get(f"{base_url}/Web/#Dashboards/", headers={'Anti-Forgery-Token': token})
    print(f"[DASHBOARD PAGE] Status: {r_dash.status_code} ({len(r_dash.text)} bytes)")

    # 3. Consultar endpoints del framework de PME
    framework_urls = [
        f"{base_url}/Dashboards/",
        f"{base_url}/Dashboards/Home",
        f"{base_url}/Dashboards/data/gadget/3ff85c2d-fb01-4bd2-969f-896f6779438d-data"
    ]

    for u in framework_urls:
        res = session.get(u, headers={'Anti-Forgery-Token': token})
        print(f"URL: {u} -> Status: {res.status_code} ({len(res.text)} bytes)")

if __name__ == '__main__':
    inspeccionar_dashboards_pme()
