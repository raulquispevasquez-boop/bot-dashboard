"""
Consultar todas las sedes únicas registradas en el catálogo de Supabase
"""

import requests

SUPABASE_URL = "https://zuouxnvcktjhqzlniion.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84"

def contar_sedes():
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept-Profile": "energia"
    }
    url = f"{SUPABASE_URL}/rest/v1/pme_dispositivos_mapeo?select=sede,medidor_nombre"
    
    r = requests.get(url, headers=headers)
    if r.status_code == 200:
        data = r.json()
        sedes = sorted(list(set(d['sede'] for d in data)))
        print(f"[TOTAL SEDES REGISTRADAS]: {len(sedes)} Sedes Unicas\n")
        for idx, s in enumerate(sedes, 1):
            medidores_sede = [d['medidor_nombre'] for d in data if d['sede'] == s]
            print(f"  {idx}. {s} ({len(medidores_sede)} medidores/circuitos)")
    else:
        print(f"Error {r.status_code}: {r.text}")

if __name__ == '__main__':
    contar_sedes()
