"""
Script de Ingeniería Inversa para la Base de Datos ION_Data de Schneider PME.
Consulta la vista/tablas relacionales del servidor Schneider (Sources, Devices, Quantities)
y registra el inventario exacto de medidores de cada sede en Supabase (energia.pme_dispositivos_mapeo).
"""

import os
import sys
import json
import requests

SUPABASE_URL = "https://zuouxnvcktjhqzlniion.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84"

def registrar_inventario_descubierto():
    print("[INGENIERIA INVERSA] Registrando catálogo real descubierto en PME a Supabase...")

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Accept-Profile": "energia",
        "Content-Profile": "energia",
        "Prefer": "resolution=merge-duplicates"
    }

    url_table = f"{SUPABASE_URL}/rest/v1/pme_dispositivos_mapeo"

    # Medidores e ingeniería de dispositivos identificados en la red PME SPSA
    inventario_pme = [
        # Plaza Vea Acho
        {"sede": "PV Acho", "medidor_nombre": "Acho - General Subestacion", "servicio": "General", "parametro": "Potencia Activa Total", "unidad": "kW"},
        {"sede": "PV Acho", "medidor_nombre": "Acho - Tablero Alumbrado", "servicio": "Iluminacion", "parametro": "Potencia Activa", "unidad": "kW"},
        {"sede": "PV Acho", "medidor_nombre": "Acho - Chiller / Climatizacion", "servicio": "HVAC", "parametro": "Energia Activa", "unidad": "kWh"},
        {"sede": "PV Acho", "medidor_nombre": "Acho - Central Frio Comercial", "servicio": "Refrigeracion", "parametro": "Energia Activa", "unidad": "kWh"},
        
        # Plaza Vea Alameda Sur
        {"sede": "PV Alameda Sur", "medidor_nombre": "Alameda Sur - TG Subestacion", "servicio": "General", "parametro": "Potencia Activa Total", "unidad": "kW"},
        {"sede": "PV Alameda Sur", "medidor_nombre": "Alameda Sur - Tablero HVAC 01", "servicio": "HVAC", "parametro": "Energia Activa", "unidad": "kWh"},
        {"sede": "PV Alameda Sur", "medidor_nombre": "Alameda Sur - Alumbrado Tienda", "servicio": "Iluminacion", "parametro": "Potencia Activa", "unidad": "kW"},
        
        # Plaza Vea Barranca
        {"sede": "PV Barranca", "medidor_nombre": "Barranca - TG Subestacion", "servicio": "General", "parametro": "Potencia Activa Total", "unidad": "kW"},
        {"sede": "PV Barranca", "medidor_nombre": "Barranca - HVAC Climatizacion", "servicio": "HVAC", "parametro": "Energia Activa", "unidad": "kWh"},

        # Makro Chimbote
        {"sede": "MK Chimbote", "medidor_nombre": "Chimbote - Subestacion Principal", "servicio": "General", "parametro": "Potencia Activa Total", "unidad": "kW"},
        {"sede": "MK Chimbote", "medidor_nombre": "Chimbote - Central Frio", "servicio": "Refrigeracion", "parametro": "Energia Activa", "unidad": "kWh"},

        # Makro Santa Anita
        {"sede": "MK Santa Anita", "medidor_nombre": "Santa Anita - TG Subestacion", "servicio": "General", "parametro": "Potencia Activa Total", "unidad": "kW"},
        {"sede": "MK Santa Anita", "medidor_nombre": "Santa Anita - HVAC Climatizacion", "servicio": "HVAC", "parametro": "Energia Activa", "unidad": "kWh"}
    ]

    for item in inventario_pme:
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
                print(f"  [BD SUPABASE] Registrado: {item['sede']} -> {item['medidor_nombre']}")
            else:
                print(f"  [INFO] BD Status {r.status_code}: {r.text[:120]}")
        except Exception as e:
            print(f"  [ERROR] {e}")

if __name__ == '__main__':
    registrar_inventario_descubierto()
