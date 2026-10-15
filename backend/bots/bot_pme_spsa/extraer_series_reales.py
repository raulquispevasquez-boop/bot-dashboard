"""
Script para escanear y mapear automáticamente TODAS las Series, Sedes y Medidores Reales
recorriendo las vistas de Gadgets en Schneider Electric PME.
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

def extraer_todas_las_series_pme():
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

    # Lista de IDs de Gadgets visualizados en la captura de pantalla del usuario
    gadget_ids = [
        "dae52b70-4c7e-4fdd-bf8a-494d1dc4dcc0",
        "d057-4cc7-a70b-b184a51e6040",
        "3a67b009-73d3-4fac-8774-d9bc7715f532",
        "0b18104a-11df-43c5-9ffb-51a84f325603",
        "93ee1fd7-5601-41f0-bd00-2baec138d6ea",
        "ab918158-e74a-48bf-aefd-828ce3a00561",
        "74fcdce1-1821-44be-9411-9964528c11e7",
        "c06d82bf-cc1b-492f-948a-d8c7c9ec417d",
        "3ff85c2d-fb01-4bd2-969f-896f6779438d"
    ]

    print("[EXPLORACION REAL PME] Consultando gadgets activos...")
    series_totales = set()

    for gid in gadget_ids:
        url = f"{base_url}/Dashboards/data/gadget/{gid}-data"
        try:
            r = session.get(url, timeout=10)
            if r.status_code == 200 and r.text.strip().startswith('{'):
                dps = r.json().get('ChartingData', {}).get('DataPoints', [])
                for dp in dps:
                    name = dp.get('SeriesName')
                    if name:
                        series_totales.add(name)
        except Exception as e:
            pass

    print(f"\n[ÉXITO] Se han encontrado {len(series_totales)} Series/Medidores Reales en Schneider PME:\n")
    
    inventario_registros = []

    for idx, s in enumerate(sorted(series_totales), 1):
        print(f"  {idx}. {s}")
        
        # Clasificación de Sede y Servicio
        partes = s.split(' - ')
        sede = partes[0].strip() if len(partes) > 1 else 'SPSA General'
        medidor = partes[1].strip() if len(partes) > 1 else s

        servicio = 'General'
        if 'HVAC' in s.upper() or 'CLIMA' in s.upper():
            servicio = 'HVAC'
        elif 'FRÍO' in s.upper() or 'FRIO' in s.upper():
            servicio = 'Frio'
        elif 'ALUMBRADO' in s.upper() or 'LUZ' in s.upper():
            servicio = 'Alumbrado'

        inventario_registros.append({
            "sede": sede,
            "medidor_nombre": medidor,
            "servicio": servicio,
            "ceco": ""
        })

    # Guardar en Supabase
    if inventario_registros:
        print(f"\n[SUPABASE] Actualizando catálogo en la tabla energia.pme_dispositivos_mapeo...")
        headers_supa = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Accept-Profile": "energia",
            "Prefer": "resolution=merge-duplicates"
        }
        url_supa = f"{SUPABASE_URL}/rest/v1/pme_dispositivos_mapeo"
        
        # Limpiar catálogo viejo e insertar el real de la plataforma
        requests.delete(url_supa, headers=headers_supa)
        r_post = requests.post(url_supa, headers=headers_supa, json=inventario_registros)
        print(f"[SUPABASE RESULT] HTTP Status: {r_post.status_code}")

if __name__ == '__main__':
    extraer_todas_las_series_pme()
