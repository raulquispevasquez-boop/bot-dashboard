"""
Script de Carga e Inserción Inicial para pme_dispositivos_mapeo en el esquema 'energia' de Supabase.
"""

import os
import requests

SUPABASE_URL = "https://zuouxnvcktjhqzlniion.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84"

DISPOSITIVOS_CATALOGO = [
    {"sede": "PV Acho", "medidor_nombre": "Acho - alumbrado (Medidor Virtual)", "servicio": "Alumbrado", "parametro": "Potencia activa", "unidad": "kW"},
    {"sede": "PV Acho", "medidor_nombre": "Acho - HVAC Energía activa consumida", "servicio": "HVAC", "parametro": "Energía activa", "unidad": "kWh"},
    {"sede": "PV Alameda Sur", "medidor_nombre": "Alameda Sur - alumbrado (Medidor Virtual)", "servicio": "Alumbrado", "parametro": "Potencia activa", "unidad": "kW"},
    {"sede": "PV Alameda Sur", "medidor_nombre": "Alameda Sur - HVAC Energía activa consumida", "servicio": "HVAC", "parametro": "Energía activa", "unidad": "kWh"},
    {"sede": "PV Barranca", "medidor_nombre": "Barranca - alumbrado (Medidor Virtual)", "servicio": "Alumbrado", "parametro": "Potencia activa", "unidad": "kW"},
    {"sede": "PV Alfonso Ugarte", "medidor_nombre": "Alfonso Ugarte - HVAC Energía activa", "servicio": "HVAC", "parametro": "Energía activa", "unidad": "kWh"},
    {"sede": "PV Ate", "medidor_nombre": "Ate - HVAC Energía activa consumida", "servicio": "HVAC", "parametro": "Energía activa", "unidad": "kWh"},
    {"sede": "PV Bolichera", "medidor_nombre": "IERA.HVAC_1 Energía activa", "servicio": "HVAC", "parametro": "Energía activa", "unidad": "kWh"},
    {"sede": "PV Breña", "medidor_nombre": "Breña - HVAC (Medidor Virtual)", "servicio": "HVAC", "parametro": "Energía activa", "unidad": "kWh"},
    {"sede": "PV Callao", "medidor_nombre": "AO.HVAC_1 Energía activa consumida", "servicio": "HVAC", "parametro": "Energía activa", "unidad": "kWh"},
    {"sede": "MK Chimbote", "medidor_nombre": "Total HVAC Energía activa consumida", "servicio": "HVAC", "parametro": "Energía activa", "unidad": "kWh"},
    {"sede": "MK Santa Anita", "medidor_nombre": "Santa Anita Energía activa consumida", "servicio": "HVAC", "parametro": "Energía activa", "unidad": "kWh"},
    {"sede": "MK Surco", "medidor_nombre": "IRCO HVAC_1 Energía activa consumida", "servicio": "HVAC", "parametro": "Energía activa", "unidad": "kWh"},
    {"sede": "MK Trujillo II", "medidor_nombre": "Trujillo II Energía activa consumida", "servicio": "HVAC", "parametro": "Energía activa", "unidad": "kWh"},
    {"sede": "PV Sucre", "medidor_nombre": "Sucre - HVAC Energía activa consumida", "servicio": "HVAC", "parametro": "Energía activa", "unidad": "kWh"}
]

def poblar_catalogo_mapeo():
    print("[SUPABASE] Poblando catálogo en esquema 'energia.pme_dispositivos_mapeo'...")
    
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Accept-Profile": "energia",
        "Content-Profile": "energia",
        "Prefer": "resolution=merge-duplicates"
    }

    url_table = f"{SUPABASE_URL}/rest/v1/pme_dispositivos_mapeo"

    for idx, item in enumerate(DISPOSITIVOS_CATALOGO, 1):
        payload = {
            "sede": item["sede"],
            "medidor_nombre": item["medidor_nombre"],
            "servicio": item["servicio"],
            "parametro": item["parametro"],
            "unidad": item["unidad"],
            "activo": True
        }

        try:
            r = requests.post(url_table, headers=headers, json=payload, timeout=10)
            if r.status_code in [200, 201]:
                print(f"  [OK] Registrado en 'energia': {item['sede']} -> {item['medidor_nombre']}")
            else:
                print(f"  [INFO] Status {r.status_code}: {r.text[:120]}")
        except Exception as e:
            print(f"  [ERROR] {e}")

if __name__ == '__main__':
    poblar_catalogo_mapeo()
