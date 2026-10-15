"""
Script para capturar las peticiones AJAX de la Biblioteca de Cuadros de Mandos en PME
"""

import os
import json
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

ANTI_FORGERY_TOKEN = "BAMSSdE0wjY0U4HYkxOU1f6yb56mnNvVsMZF9xekw72n3oMI8xEqaDgSLHr3Gxcbdnt-XRDN6VkscXAUerLyNyo3U19iBV3MUEZnD5LAROQ1:IUY0L21HE4sp1zxIdpS4DkDqy9VAHySkFG4Gmsm2a8SYmKI5-8bkFdZT5ecYvzD9Hup8Ii8th2J_7lGk5cf_iZQuTcepVlfdFRehdXe-D2CCnmRB2YokYrRzqTbgaEV39-p1XFr_p5nDmF8dGnMBYutYqAkD2uxXsT0d_V-vC42-ddd2IpslDcu_0uCkOtyr0"
COOKIE_SESSION = "forceLogout/Web=false; .APPLICATIONFRAMEWORK=CBBCDAF9CEE6E79F39E84CCCCCFD5B84983D2ECE5A5FDFA2F662C38C1C261AC921579C5E124F9D3B060E259FD3D9D38139CC622CAE0B28A0F5C0ECA188F34D849225E69DE9880A2A4BBE7B6B3A81EC3C2915F1AABA090A87540CD281BB99C7724003C174FAA5D6E79713539C45A970C5C387EFE4A68ABE7CF513D4C045C26F287CE350FB3AC9013FE61F8C56AE112747F2CE67129B0A4FE5679EEF63985F87BEF3EF615E69E14AA1E249B828278D70C06F91F5F417079C014E120013EE84ABB1882D411493BF62039299B3FA4CD20A92FD9CA7320ED82A1E81D96188F1A12609B8E6E9CE28A5AAF8E32E4591CF773BAF460C7830F409B6098C2AC85614F1ABDD0A156ABF11166348FBC4B7A34E464D99C570AD08A61DD6E7365AD67039F150A4; lastApplicationActiveTime/Web=1785965211725"

def rastrear_biblioteca():
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

    rutas = [
        "/Dashboards/data/library/content",
        "/Dashboards/data/user/library",
        "/Dashboards/data/librarytree",
        "/Dashboards/data/tree",
        "/Dashboards/data/gadgetdata"
    ]

    for r in rutas:
        res = session.get(f"{base_url}{r}")
        print(f"Ruta: {r} -> HTTP {res.status_code} ({len(res.text)} bytes)")
        if res.status_code == 200:
            print(f"   [JSON]: {res.text[:300]}\n")

if __name__ == '__main__':
    rastrear_biblioteca()
