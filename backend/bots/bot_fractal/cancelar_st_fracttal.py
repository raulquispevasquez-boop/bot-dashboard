#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cancelar_st_fracttal.py
Cancela una o más Solicitudes de Servicio en Fracttal usando el endpoint
correcto: requests.requests_x_status_insert con id_status=5 (Cancelado).

Puede recibir:
  - Lista de id_request numéricos internos de Fracttal, O
  - Lista de nro_solicitud (folios alfanuméricos como "268451")

Si recibe folios, primero los busca en Fracttal para obtener el id_request.

Argumentos (sys.argv):
  1: JSON array de IDs a cancelar. Ej: '[268451, 268452]'  (id_request)
     o '["ST-268451"]' (folio)
  2: Nota de cancelación. Ej: '"Creado por error"'  (string JSON)

Salida: JSON al stdout { success, resultados: [{id_request, folio, success, error}] }
"""

import sys
import json
import os
import time
import uuid
import requests
import urllib3

urllib3.disable_warnings()

# ── Cargar config ──────────────────────────────────────────────────────────────
def _load_config():
    """Busca la config de credenciales Fracttal en rutas conocidas."""
    paths = [
        os.path.join(os.path.dirname(__file__), '..', '..', 'config_bot_pme_spsa.json'),
        os.path.join(os.path.dirname(__file__), '..', '..', 'backend', 'config_bot_pme_spsa.json'),
    ]
    for p in paths:
        p = os.path.normpath(p)
        if os.path.exists(p):
            with open(p, 'r', encoding='utf-8') as f:
                return json.load(f)
    return {}

# ── Fracttal helpers ───────────────────────────────────────────────────────────
URL_LOGIN = "https://one.fracttal.com/rpc/login_new"
URL_PROXY = "https://one.fracttal.com/rpc/proxy"

def _login(cfg):
    session = requests.Session()
    session.verify = False
    r = session.post(URL_LOGIN, json={
        "email":      cfg.get("fracttal_user", ""),
        "password":   cfg.get("fracttal_pass", ""),
        "id_company": int(cfg.get("fracttal_id_company", 2635)),
        "id_server":  "AMERICAN",
        "platform":   "Fracttal/5.9.03 web",
    }, timeout=30)
    if r.status_code == 200:
        token = r.json().get("data", {}).get("token")
        if token:
            session.headers.update({
                "Authorization": f"Bearer {token}",
                "Content-Type":  "application/json",
                "x-version":     "Fracttal/5.9.03 web",
                "Origin":        "https://one.fracttal.com",
                "Referer":       "https://one.fracttal.com/workrequest",
            })
            return session
    raise RuntimeError(f"Login Fracttal fallido: {r.status_code} {r.text[:200]}")


def _rpc(session, method, params):
    payload = [{"id": str(uuid.uuid4()), "jsonrpc": "2.0", "method": method, "params": params}]
    r = session.post(URL_PROXY, json=payload, timeout=30)
    data = r.json()
    res = (data[0] if isinstance(data, list) else data) or {}
    inner = res.get("result", {}) or {}
    if inner.get("success"):
        return inner.get("data"), None
    return None, inner.get("message") or str(res)


def _buscar_por_folio(session, folio):
    """Dado un folio visible (ej. "268451"), devuelve el id_request interno."""
    # id_code en Fracttal es el folio como entero o string
    data, err = _rpc(session, "requests.requests_list", {
        "query": [{"property": "id_code", "value": str(folio), "operator": "eq"}],
        "limit": 5, "page": 1
    })
    if data:
        items = data if isinstance(data, list) else data.get("data", [])
        if items:
            return items[0].get("id"), str(items[0].get("id_code", folio))
    return None, None


def _cancelar_uno(session, id_request, folio_display, nota):
    """Cancela UNA solicitud vía requests_x_status_insert con id_status=5."""
    data, err = _rpc(session, "requests.requests_x_status_insert", {
        "id_request":                   int(id_request),
        "id_status":                    5,
        "requests_x_status_description": "CANCEL_STATUS",
        "notes":                        nota or "Cancelado vía Mantenipro",
        "action":                       "user",
    })
    if data is not None or err is None:
        return True, None
    # Algunos RPC devuelven success=true pero data vacío — si no hay error, considerarlo ok
    return (err is None), err


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    # Argumentos
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Argumentos insuficientes"}))
        return

    try:
        ids_raw = json.loads(sys.argv[1])  # lista de id_request o folios
    except Exception as e:
        print(json.dumps({"success": False, "error": f"IDs inválidos: {e}"}))
        return

    nota = ""
    if len(sys.argv) >= 3:
        try:
            nota = json.loads(sys.argv[2])
        except Exception:
            nota = sys.argv[2]

    if not ids_raw:
        print(json.dumps({"success": False, "error": "Lista vacía"}))
        return

    cfg = _load_config()
    try:
        session = _login(cfg)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Login Fracttal: {e}"}))
        return

    resultados = []
    for item in ids_raw:
        item_str = str(item)
        id_request = None
        folio_display = item_str

        # Si el item es numérico grande, es un id_request directo
        try:
            num = int(item_str)
            if num > 100000:          # id_request interno suele ser > 100000
                id_request = num
            else:
                # Es un folio corto — buscarlo
                id_request, folio_display = _buscar_por_folio(session, item_str)
        except ValueError:
            # Es string tipo "ST-268451" o "268451" — buscar folio
            limpio = item_str.lstrip("STst- ").strip()
            id_request, folio_display = _buscar_por_folio(session, limpio)

        if not id_request:
            resultados.append({"folio": folio_display, "id_request": None,
                                "success": False, "error": "No encontrado en Fracttal"})
            continue

        ok, err = _cancelar_uno(session, id_request, folio_display, nota)
        resultados.append({"folio": folio_display, "id_request": id_request, "success": ok, "error": err})
        time.sleep(0.4)  # no saturar el API

    todos_ok = all(r["success"] for r in resultados)
    print(json.dumps({"success": todos_ok, "resultados": resultados}))


if __name__ == "__main__":
    main()
