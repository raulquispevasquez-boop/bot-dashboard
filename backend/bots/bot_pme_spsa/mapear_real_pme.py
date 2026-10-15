"""
Script de Login Auténtico con Token Anti-Forgery para PME
y extracción directa del árbol de fuentes/medidores reales de ION_Data.
"""

import os
import sys
import json
import requests
import urllib3
import re

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

SUPABASE_URL = "https://zuouxnvcktjhqzlniion.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84"

def cargar_config_pme():
    path = os.path.join(os.path.dirname(__file__), '..', '..', 'config_bot_pme_spsa.json')
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'url': 'https://10.30.4.124', 'username': 'Supervisor', 'password': ''}

def realizar_mapeo_real_pme():
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

    print("[LOGIN] Obteniendo Anti-Forgery Token de la página de inicio...")
    r_init = session.get(f"{base_url}/Web/Auth/Login", timeout=15)
    
    # Extraer Anti-Forgery Token del HTML
    token_match = re.search(r'Anti-Forgery-Token":\s*"([^"]+)"', r_init.text)
    af_token = token_match.group(1) if token_match else ""

    headers_auth = {
        'Content-Type': 'application/json',
        'Anti-Forgery-Token': af_token
    }

    payload_auth = {
        "userName": username,
        "password": password,
        "returnUrl": "/Web/#Trends/",
        "setAuthCookie": True
    }

    print("[LOGIN] Enviando autenticación vía SystemDataService/Security/ValidateCredentials...")
    r_auth = session.post(f"{base_url}/SystemDataService/Security/ValidateCredentials", headers=headers_auth, json=payload_auth, timeout=15)
    print(f"[AUTH RESULT] Status: {r_auth.status_code} | Body: {r_auth.text[:200]}")

    # Ahora consultamos los servicios reales de fuentes (medidores) de PME
    endpoints_medidores = [
        f"{base_url}/SystemDataService/api/sources",
        f"{base_url}/SystemDataService/api/trend/GetTrendLibraryTree",
        f"{base_url}/Dashboards/data/gadgets",
        f"{base_url}/SystemDataService/api/hierarchy/nodes"
    ]

    medidores_reales = []

    for ep in endpoints_medidores:
        try:
            r = session.get(ep, timeout=15)
            print(f"[METERS SCAN] {ep} -> HTTP {r.status_code} ({len(r.text)} bytes)")
            if r.status_code == 200:
                print(f"   Sample: {r.text[:300]}")
        except Exception as e:
            print(f"   Error: {e}")

if __name__ == '__main__':
    realizar_mapeo_real_pme()
