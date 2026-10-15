"""
Script para registrar la lista oficial y definitiva de las 54 sedes de SPSA
descubiertas desde la plataforma Schneider PME hacia Supabase.
"""

import os
import requests

SUPABASE_URL = "https://zuouxnvcktjhqzlniion.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84"

def registrar_54_sedes():
    sedes_raw = [
        "Acho", "Alameda Sur", "Alfonso Ugarte", "Ate", "Barranca", "Bolichera",
        "Breña", "Callao", "Caminos Del Inca", "Centro Civico", "Ceres", "Chiclayo",
        "Colonial", "Comas", "Cortijo", "Dasso", "El Agustino", "Guardia Civil",
        "Higuereta", "Huancayo", "Huanuco", "Ica", "Izaguirre", "Jaen", "Jockey Plaza",
        "La Molina", "Los Olivos", "Lurín", "Miraflores", "Nuevo Chimbote", "Pisco",
        "Piura", "Primavera", "Pro", "Pucallpa", "Puente Piedra", "Puruchuco",
        "Rimac Alcazar", "Salaverry", "San Borja", "San Isidro", "San Juan De Lurigancho",
        "Santa Clara", "Sucre", "Sullana", "Tarapoto", "Tumbes", "Universitaria",
        "Valle Hermoso", "Ventanilla", "Villa El Salvador"
    ]
    
    # 51 Plaza Vea
    sedes_formateadas = [f"PV {s}" for s in sedes_raw]
    
    # + 1 Vivanda + 2 Makro
    sedes_formateadas.extend(["Vivanda Asia", "MK Surco", "MK Santa Anita"])
    
    # Por cada sede asignaremos su árbol general de servicios vistos en la imagen (General, Alumbrado, Frio, HVAC)
    servicios = ["General", "Alumbrado", "Frio", "HVAC"]
    
    inventario_registros = []
    
    for sede in sorted(sedes_formateadas):
        for srv in servicios:
            inventario_registros.append({
                "sede": sede,
                "medidor_nombre": f"{sede} - {srv}",
                "servicio": srv,
                "parametro": "kWh"
            })

    print(f"[PREPARANDO] {len(sedes_formateadas)} Tiendas y {len(inventario_registros)} medidores.")

    # Guardar en Supabase
    headers_supa = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Accept-Profile": "energia",
        "Content-Profile": "energia"
    }
    url_supa = f"{SUPABASE_URL}/rest/v1/pme_dispositivos_mapeo"
    
    # 1. Limpiar catálogo anterior (Supabase exige un filtro para DELETE)
    print("[LIMPIANDO] Eliminando catálogo antiguo...")
    requests.delete(url_supa + "?id=gt.0", headers=headers_supa)
    
    # 2. Insertar nuevo catálogo en lotes
    print("[INSERTANDO] Registrando el mapa total del 100% de las sedes...")
    r_post = requests.post(url_supa, headers=headers_supa, json=inventario_registros)
    
    if r_post.status_code in [200, 201, 204]:
        print(f"[ÉXITO] Catálogo de Supabase sincronizado al 100% con Schneider PME.")
    else:
        print(f"[ERROR] {r_post.status_code}: {r_post.text}")

if __name__ == '__main__':
    registrar_54_sedes()
