# -*- coding: utf-8 -*-
"""
Sincronizacion MANUAL (bajo demanda) del catalogo de dispositivos de PME
(ION_Network.dbo.Device) hacia Supabase (energia.master_devices_pme).

No esta pensado para correr programado: el catalogo de medidores cambia
muy poco (solo cuando se instala o da de baja un equipo fisico). Se corre
a mano cada vez que haga falta refrescarlo.

Vive en la maquina donde esta PME (o una con acceso directo a su SQL
Server, puerto 1433) - el bot-dashboard principal NO tiene ruta de red
hacia ese puerto, por eso este script es independiente.

pme_device_id es la llave INMUTABLE de PME: no cambia aunque alguien
renombre el titulo del grafico en el dashboard web. Las columnas de
negocio (ceco, idsede, id_activo_rcm) NUNCA se tocan desde aca a
proposito - se llenan a mano en Supabase, y este script jamas las
sobreescribe sin importar cuantas veces lo corras.

Requisitos en esta maquina:
    pip install pyodbc requests
    ODBC Driver 17 for SQL Server instalado

Autenticacion contra SQL Server: usa la sesion de Windows con la que
corras este script (Trusted_Connection) - la misma forma en que entras
por SSMS como SP\\usr_ion. No hay usuario/contraseña de SQL que
configurar; el requisito es correr el script desde una sesion de Windows
que ya tenga acceso a ION_Network (la misma cuenta que usas en SSMS).

Variables de entorno (NO hardcodear credenciales en este archivo):
    PME_SQL_SERVER        ej. 10.30.4.124
    PME_SQL_DATABASE      ION_Network (default si no se especifica)
    SUPABASE_URL          ej. https://tu-proyecto.supabase.co
    SUPABASE_KEY          la misma api key que usa el resto del proyecto -
                           NO hace falta la Service Role Key: RLS ya esta
                           desactivado en energia.master_devices_pme.

Uso (PowerShell, en la maquina del servidor PME, logueado con la misma
cuenta de Windows que usas en SSMS):
    $env:PME_SQL_SERVER    = "10.30.4.124"
    $env:PME_SQL_DATABASE  = "ION_Network"
    $env:SUPABASE_URL      = "https://tu-proyecto.supabase.co"
    $env:SUPABASE_KEY      = "..."
    python sync_pme_devices_master.py
"""

import os
import sys
from datetime import datetime, timezone

import pyodbc
import requests

SQL_SERVER = os.environ.get("PME_SQL_SERVER")
SQL_DATABASE = os.environ.get("PME_SQL_DATABASE", "ION_Network")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

ESQUEMA = "energia"
TABLA = "master_devices_pme"

# Columnas que este script SI actualiza en cada corrida (vienen de PME).
# ceco / idsede / id_activo_rcm NO estan aca a proposito: son de negocio,
# se llenan a mano en Supabase y este script nunca las pisa.
QUERY_DISPOSITIVOS = """
    SELECT
        d.ID AS pme_device_id,
        d.Name AS device_name,
        dt.DisplayName AS device_type,
        d.Address AS network_address,
        d.PortID AS port_id,
        d.Enabled AS is_enabled,
        d.Description AS description,
        d.CustomProperty1 AS custom_prop_1,
        d.CustomProperty2 AS custom_prop_2,
        d.CustomProperty3 AS custom_prop_3,
        d.CustomProperty4 AS custom_prop_4,
        d.CustomProperty5 AS custom_prop_5,
        d.LastUpdate AS last_update_pme
    FROM
        ION_Network.dbo.Device d
    LEFT JOIN
        ION_Network.dbo.DeviceType dt ON d.DeviceTypeID = dt.ID
    ORDER BY
        d.ID ASC;
"""


def _validar_config():
    faltantes = [
        nombre for nombre, valor in [
            ("PME_SQL_SERVER", SQL_SERVER), ("SUPABASE_URL", SUPABASE_URL),
            ("SUPABASE_KEY", SUPABASE_KEY),
        ] if not valor
    ]
    if faltantes:
        print(f"Faltan variables de entorno: {', '.join(faltantes)}")
        sys.exit(1)


def obtener_dispositivos_pme():
    conn_str = (
        "DRIVER={ODBC Driver 17 for SQL Server};"
        f"SERVER={SQL_SERVER};"
        f"DATABASE={SQL_DATABASE};"
        "Trusted_Connection=yes;"
    )
    conn = pyodbc.connect(conn_str, timeout=15)
    try:
        cursor = conn.cursor()
        cursor.execute(QUERY_DISPOSITIVOS)
        filas = cursor.fetchall()
    finally:
        conn.close()

    ahora = datetime.now(timezone.utc).isoformat()
    payload = []
    for f in filas:
        last_update_hex = f"0x{f.last_update_pme.hex()}" if f.last_update_pme else None
        payload.append({
            "pme_device_id": int(f.pme_device_id),
            "device_name": str(f.device_name) if f.device_name else "",
            "device_type": str(f.device_type) if f.device_type else "Desconocido",
            "network_address": str(f.network_address) if f.network_address is not None else None,
            "port_id": int(f.port_id) if f.port_id is not None else None,
            "is_enabled": bool(f.is_enabled),
            "description": str(f.description) if f.description else None,
            "custom_prop_1": str(f.custom_prop_1) if f.custom_prop_1 else None,
            "custom_prop_2": str(f.custom_prop_2) if f.custom_prop_2 else None,
            "custom_prop_3": str(f.custom_prop_3) if f.custom_prop_3 else None,
            "custom_prop_4": str(f.custom_prop_4) if f.custom_prop_4 else None,
            "custom_prop_5": str(f.custom_prop_5) if f.custom_prop_5 else None,
            "last_update_pme": last_update_hex,
            "fecha_actualizacion": ahora,
        })
    return payload


def subir_a_supabase(payload):
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Accept-Profile": ESQUEMA,
        "Content-Profile": ESQUEMA,
        # merge-duplicates + on_conflict = upsert nativo de Postgres, y solo
        # actualiza las columnas presentes en el payload (por eso
        # ceco/idsede/id_activo_rcm, ausentes aca, nunca se tocan).
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    LOTE = 500
    for i in range(0, len(payload), LOTE):
        lote = payload[i:i + LOTE]
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/{TABLA}",
            params={"on_conflict": "pme_device_id"},
            headers=headers,
            json=lote,
            timeout=60,
        )
        if r.status_code not in (200, 201, 204):
            raise RuntimeError(f"Error subiendo a Supabase ({r.status_code}): {r.text[:500]}")
        print(f"  Lote {i // LOTE + 1}: {len(lote)} dispositivos OK.")


def main():
    _validar_config()
    print("Consultando ION_Network.dbo.Device...")
    payload = obtener_dispositivos_pme()
    print(f"{len(payload)} dispositivos encontrados en PME.")
    if not payload:
        print("Nada que sincronizar.")
        return
    print(f"Subiendo a Supabase ({ESQUEMA}.{TABLA})...")
    subir_a_supabase(payload)
    print(f"Listo: {len(payload)} dispositivos sincronizados. ceco/idsede/id_activo_rcm no se tocaron.")


if __name__ == "__main__":
    main()
