"""
Script para capturar TODOS los UUIDs de Gadgets desde los Dashboards de PME
y descargar la totalidad de Medidores y Series reales registradas.
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

ANTI_FORGERY_TOKEN = "BAMSSdE0wjY0U4HYkxOU1f6yb56mnNvVsMZF9xekw72n3oMI8xEqaDgSLHr3Gxcbdnt-XRDN6VkscXAUerLyNyo3U19iBV3MUEZnD5LAROQ1:IUY0L21HE4sp1zxIdpS4DkDqy9VAHySkFG4Gmsm2a8SYmKI5-8bkFdZT5ecYvzD9Hup8Ii8th2J_7lGk5cf_iZQuTcepVlfdFRehdXe-D2CCnmRB2YokYrRzqTbgaEV39-p1XFr_p5nDmF8dGnMBYutYqAkD2uxXsT0d_V-vC42-ddd2IpslDcu_0uCkOtyr0"
COOKIE_SESSION = "forceLogout/Web=false; .APPLICATIONFRAMEWORK=CBBCDAF9CEE6E79F39E84CCCCCFD5B84983D2ECE5A5FDFA2F662C38C1C261AC921579C5E124F9D3B060E259FD3D9D38139CC622CAE0B28A0F5C0ECA188F34D849225E69DE9880A2A4BBE7B6B3A81EC3C2915F1AABA090A87540CD281BB99C7724003C174FAA5D6E79713539C45A970C5C387EFE4A68ABE7CF513D4C045C26F287CE350FB3AC9013FE61F8C56AE112747F2CE67129B0A4FE5679EEF63985F87BEF3EF615E69E14AA1E249B828278D70C06F91F5F417079C014E120013EE84ABB1882D411493BF62039299B3FA4CD20A92FD9CA7320ED82A1E81D96188F1A12609B8E6E9CE28A5AAF8E32E4591CF773BAF460C7830F409B6098C2AC85614F1ABDD0A156ABF11166348FBC4B7A34E464D99C570AD08A61DD6E7365AD67039F150A4; lastApplicationActiveTime/Web=1785965211725"

def rastrear_todos_los_dashboards():
    base_url = "https://10.30.4.124"
    session = requests.Session()
    session.verify = False
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Anti-Forgery-Token': ANTI_FORGERY_TOKEN,
        'Cookie': COOKIE_SESSION
    })

    print("[EXPLORACION MASIVA PME] Escaneando dashboards en HTML...")
    r_dash = session.get(f"{base_url}/Dashboards/Home")
    print(f"Pagina Home Dashboards -> Status: {r_dash.status_code}")

    # Extraer todos los GUIDs (patrón UUID) presentes en el HTML / JS
    uuids = set(re.findall(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', r_dash.text, re.I))
    print(f"UUIDs de Gadgets/Dashboards descubiertos: {len(uuids)}")

    series_encontradas = set()

    for uid in uuids:
        url = f"{base_url}/Dashboards/data/gadget/{uid}-data"
        try:
            r = session.get(url, timeout=5)
            if r.status_code == 200 and r.text.strip().startswith('{'):
                dps = r.json().get('ChartingData', {}).get('DataPoints', [])
                for dp in dps:
                    name = dp.get('SeriesName')
                    if name:
                        series_encontradas.add(name)
                        print(f"  [DISPOSITIVO REAL ENCONTRADO]: {name}")
        except Exception:
            pass

    print(f"\n[RESUMEN FINAL] Total de Medidores / Series Reales: {len(series_encontradas)}")

if __name__ == '__main__':
    rastrear_todos_los_dashboards()
