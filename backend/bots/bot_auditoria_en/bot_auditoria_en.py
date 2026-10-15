import os
import glob
import json
import sys
import datetime
import traceback
import math
import re
import warnings
warnings.filterwarnings('ignore')

import pandas as pd
from supabase import create_client, Client

URL_SUPABASE  = "https://zuouxnvcktjhqzlniion.supabase.co"
KEY_SUPABASE  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84"

def log(msg, msg_type="info"):
    print(json.dumps({'type': msg_type, 'message': msg}), flush=True)

def connect_supabase() -> Client:
    client = create_client(URL_SUPABASE, KEY_SUPABASE)
    client.options.schema = "energia"
    return client

def safe_str(val):
    if pd.isna(val) or val is None: return None
    s = str(val).strip()
    return s if s and s.upper() != 'NAN' else None

def extract_datos(file_path):
    try:
        xls = pd.ExcelFile(file_path)
        base_name = os.path.basename(file_path).replace('.xlsx','').replace('.xlsm','').replace('.xls','')
        
        tienda, formato, fecha_val, auditor, personal_tienda = base_name, None, None, "No registrado", None
        
        if 'DATOS' in xls.sheet_names:
            df = pd.read_excel(file_path, sheet_name='DATOS', header=None, nrows=20)
            for i in range(len(df)):
                for j in range(len(df.columns)):
                    cell_val = str(df.iloc[i, j]).upper()
                    if "NOMBRE DE LA TIENDA" in cell_val and j+1 < len(df.columns):
                        t = safe_str(df.iloc[i, j+1])
                        if t: tienda = t
                    if "FORMATO" in cell_val and j+1 < len(df.columns):
                        fmt = safe_str(df.iloc[i, j+1])
                        if fmt: formato = fmt
                    if "FECHA" in cell_val and "HORA" not in cell_val and j+1 < len(df.columns):
                        fecha_val = df.iloc[i, j+1]
                    if ("DEL AUDITOR" in cell_val or "NOMBRE DEL AUDITOR" in cell_val or ("AUDITOR" in cell_val and "AUDITORIA" not in cell_val)) and j+1 < len(df.columns):
                        a = safe_str(df.iloc[i, j+1])
                        if a: auditor = a
                    if "PERSONAL DE TIENDA" in cell_val and j+1 < len(df.columns):
                        pt = safe_str(df.iloc[i, j+1])
                        if pt: personal_tienda = pt

        if auditor == "No registrado" and personal_tienda:
            auditor = f"{personal_tienda} (Personal Tienda)"

        if pd.isna(fecha_val) or fecha_val is None:
            fecha_str = datetime.datetime.now().strftime("%Y-%m-%d")
        elif isinstance(fecha_val, datetime.datetime):
            fecha_str = fecha_val.strftime("%Y-%m-%d")
        else:
            fecha_str = str(fecha_val)[:10]

        return {
            "tienda": tienda,
            "formato": formato,
            "fecha": fecha_str,
            "auditor": auditor,
            "filename": os.path.basename(file_path)
        }
    except Exception as e:
        log(f"⚠️ Error leyendo cabecera de {file_path}: {e}")
        return {
            "tienda": f"Sede {os.path.basename(file_path)[:15]}",
            "formato": "Chek List",
            "fecha": datetime.datetime.now().strftime("%Y-%m-%d"),
            "auditor": "Desconocido",
            "filename": os.path.basename(file_path)
        }

def get_equipment_metrics_at_row(df, current_row):
    puntaje_real = None
    porcentaje = None
    for r in range(current_row, -1, -1):
        for c_idx in range(len(df.columns)):
            val = df.iloc[r, c_idx]
            if pd.isna(val): continue
            sval = str(val).upper().strip()
            
            if 'PUNTAJE REAL' in sval and puntaje_real is None:
                if r + 1 < len(df) and pd.notna(df.iloc[r + 1, c_idx]):
                    try:
                        v = float(df.iloc[r + 1, c_idx])
                        puntaje_real = v
                    except: pass
            
            if '% CUMPLIMIENTO' in sval and porcentaje is None:
                if r + 1 < len(df) and pd.notna(df.iloc[r + 1, c_idx]):
                    try:
                        v = float(df.iloc[r + 1, c_idx])
                        porcentaje = round(v * 100, 2) if v <= 1.0 else round(v, 2)
                    except: pass

        if puntaje_real is not None and porcentaje is not None:
            break
            
    return puntaje_real, porcentaje

def get_equipment_context(df, current_row):
    equip_name = ""
    tipo_temp = ""
    productos = ""
    ubicacion = ""

    search_start = max(0, current_row - 35)
    for r in range(current_row, search_start - 1, -1):
        row = df.iloc[r]
        row_str = " | ".join([str(x).strip() for x in row.values if pd.notna(x)])

        for c in range(min(6, len(row))):
            val = str(row[c]).strip() if pd.notna(row[c]) else ""
            if not val: continue

            # Ignorar códigos de ítem individuales como M.F.V.E - 2.3, C.F. - 1.1, A.A.T.O - 5.1
            if re.search(r'^[A-Z\.\s]+-\s*\d', val.upper()):
                continue

            if any(k in val.upper() for k in ['CAMARA DE FRIO', 'MUEBLE DE FRIO', 'M.F.', 'VITRINA', 'WALKIN', 'RACK', 'A.A.', 'S.S.A.A.', 'MURAL', 'VISICOLLER', 'HIELERA', 'TABLERO', 'ILUMINACION', 'CONSUM.FANTAS', 'SECCIÓN', 'SECCION']):
                if not equip_name:
                    cleaned = re.sub(r'^SECCIÓN\s*\d+:\s*', '', val, flags=re.IGNORECASE).strip()
                    if cleaned and len(cleaned) <= 65 and '?' not in cleaned and cleaned.upper() not in ['EQUIPO', 'ITEM', 'DESCRIPCION']:
                        equip_name = cleaned
            
            if 'UBICACIÓN:' in val.upper() or 'UBICACION:' in val.upper():
                if not ubicacion and c + 1 < len(row) and pd.notna(row[c+1]):
                    ubicacion = str(row[c+1]).strip()

            if 'PRODUCTOS:' in val.upper():
                if not productos and c + 1 < len(row) and pd.notna(row[c+1]):
                    productos = str(row[c+1]).strip()

        # Check for tipo / modalidad (CONGELADO, REFRIGERADO, ANEXADO AL RACK, AUTOCONTENIDA)
        if any(k in row_str.upper() for k in ['CONGELADO', 'REFRIGERADO', 'ANEXADO AL RACK', 'AUTOCONTENIDA']) and not tipo_temp:
            for c in range(len(row)):
                cell_val = str(row[c]).strip().upper() if pd.notna(row[c]) else ""
                if cell_val in ['X', '1']:
                    for check_c in range(max(0, c-2), min(len(row), c+3)):
                        txt = str(row[check_c]).strip().upper() if pd.notna(row[check_c]) else ""
                        if 'ANEXADO' in txt or 'RACK' in txt: tipo_temp = "ANEXADO AL RACK"; break
                        elif 'AUTOCONTENIDA' in txt: tipo_temp = "AUTOCONTENIDA"; break
                        elif 'CONGELADO' in txt: tipo_temp = "CONGELADO"; break
                        elif 'REFRIGERADO' in txt: tipo_temp = "REFRIGERADO"; break

    parts = []
    if equip_name: parts.append(equip_name)
    if tipo_temp and tipo_temp.upper() not in parts: parts.append(tipo_temp)
    if productos and productos not in ['0', '-', 'None', 'nan'] and productos not in parts: parts.append(productos)
    if ubicacion and ubicacion not in ['0', '-', 'None', 'nan'] and ubicacion not in parts: parts.append(ubicacion)

    return " | ".join(parts) if parts else "-"

def load_pesos_config(supabase):
    try:
        res = supabase.table("auditoria_config_pesos").select("*").eq("activo", True).execute()
        return res.data if res.data else []
    except Exception as e:
        log(f"⚠️ No se pudo cargar auditoria_config_pesos de Supabase: {e}", "info")
        return []

def get_sistema_peso(sheet_name, pesos_db):
    if not pesos_db:
        return 0.0
    sec_match = re.match(r'^(\d+)', sheet_name.strip())
    sec_num = int(sec_match.group(1)) if sec_match else None
    clean_sheet = re.sub(r'[^A-Z0-9]', '', sheet_name.upper())

    if sec_num in [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]:
        for p in pesos_db:
            if p.get('numero_seccion') == sec_num:
                return float(p.get('peso_porcentaje', 0.0))

    if sec_num == 2 or 'VISICO' in clean_sheet or 'AUTOCONTEN' in clean_sheet:
        if 'VISICO' in clean_sheet:
            for p in pesos_db:
                if 'VISICOOLER' in re.sub(r'[^A-Z0-9]', '', p.get('nombre_seccion', '').upper()):
                    return float(p.get('peso_porcentaje', 0.0))
        if 'WALK' in clean_sheet:
            for p in pesos_db:
                if 'WALKIN' in re.sub(r'[^A-Z0-9]', '', p.get('nombre_seccion', '').upper()):
                    return float(p.get('peso_porcentaje', 0.0))
        if 'HIEL' in clean_sheet:
            for p in pesos_db:
                if 'HIELERA' in re.sub(r'[^A-Z0-9]', '', p.get('nombre_seccion', '').upper()):
                    return float(p.get('peso_porcentaje', 0.0))
        if 'POZA' in clean_sheet:
            for p in pesos_db:
                if 'POZAS' in re.sub(r'[^A-Z0-9]', '', p.get('nombre_seccion', '').upper()):
                    return float(p.get('peso_porcentaje', 0.0))
        if 'EXHIBID' in clean_sheet:
            for p in pesos_db:
                if 'EXHIBIDORAS' in re.sub(r'[^A-Z0-9]', '', p.get('nombre_seccion', '').upper()):
                    return float(p.get('peso_porcentaje', 0.0))
        if 'MURAL' in clean_sheet:
            for p in pesos_db:
                if 'MURAL' in re.sub(r'[^A-Z0-9]', '', p.get('nombre_seccion', '').upper()):
                    return float(p.get('peso_porcentaje', 0.0))
        if 'AUTOCONTEN' in clean_sheet:
            for p in pesos_db:
                n_clean = re.sub(r'[^A-Z0-9]', '', p.get('nombre_seccion', '').upper())
                if 'ARMARIOS' in n_clean or 'AUTOCONTENIDAS' in n_clean:
                    return float(p.get('peso_porcentaje', 0.0))
    return 0.0

def process_file(file_path, supabase, base_store_name, cabecera, pesos_db=None):
    filename = os.path.basename(file_path)
    
    if not cabecera:
        log(json.dumps({"store": base_store_name, "progress": 100, "detail": "Error en metadatos"}), "progress")
        return False
        
    tienda = cabecera["tienda"]
    fecha = cabecera["fecha"]
    
    log(json.dumps({"store": base_store_name, "progress": 10, "detail": f"Upsert auditoria_auditorias -> {tienda}"}), "progress")
    
    # Upsert Auditoría Cabecera
    try:
        res = supabase.table('auditoria_auditorias').select('id').eq('tienda', tienda).eq('fecha', fecha).execute()
        if res.data and len(res.data) > 0:
            audit_id = res.data[0]['id']
            supabase.table('auditoria_auditorias').update(cabecera).eq('id', audit_id).execute()
            supabase.table('auditoria_hallazgos_detallados').delete().eq('auditoria_id', audit_id).execute()
            supabase.table('auditoria_puntajes').delete().eq('auditoria_id', audit_id).execute()
            log(f"🔄 Reemplazando auditoría existente de {tienda} ({fecha})")
        else:
            insert_res = supabase.table('auditoria_auditorias').insert(cabecera).execute()
            audit_id = insert_res.data[0]['id']
            log(f"✅ Registrada nueva auditoría para {tienda}")
    except Exception as e:
        log(f"❌ Error BD registrando cabecera de {tienda}: {e}", "error")
        log(json.dumps({"store": base_store_name, "progress": 100, "detail": "Fallo en BD"}), "progress")
        return False

    xls = pd.ExcelFile(file_path)
    hallazgos_batch = []
    puntajes_batch = []
    raw_puntajes = []
    
    valid_sheets = [s for s in xls.sheet_names if not ('DATOS' in s.upper() or 'LISTAS' in s.upper() or s.upper() in ['HOJA1', 'HOJA2', 'PLANTILLA'])]
    total_sheets = len(valid_sheets)
    
    if total_sheets == 0:
        log(json.dumps({"store": base_store_name, "progress": 100, "detail": "Sin hojas de checklist"}), "progress")
        return True

    # Procesar hojas de checklists
    for index, sheet in enumerate(valid_sheets):
        try:
            progress_pct = 10 + math.floor((index / total_sheets) * 80)
            log(json.dumps({"store": base_store_name, "progress": progress_pct, "detail": f"Analizando {sheet}"}), "progress")
            
            df = pd.read_excel(file_path, sheet_name=sheet, header=None)
            
            header_idx = -1
            for i in range(min(25, len(df))):
                row_vals = [' '.join(str(x).upper().split()) for x in df.iloc[i].values if pd.notna(x)]
                row_str = " ".join(row_vals)
                if "CUMPLE" in row_str:
                    header_idx = i
                    break
                    
            if header_idx == -1:
                continue

            col_item = 1
            col_desc = 2
            col_resp = 3
            col_si = 4
            col_no = 5
            col_na = 6
            col_obs = 7
            
            row_headers = [' '.join(str(x).upper().split()) if pd.notna(x) else '' for x in df.iloc[header_idx].values]
            
            # Buscar índices ÚNICAMENTE en las 10 primeras columnas principales del checklist
            for idx_c in range(min(10, len(row_headers))):
                h = row_headers[idx_c]
                if 'ITEM' in h or 'CÓDIGO' in h or 'CODIGO' in h: col_item = idx_c
                elif 'DESCRIPCI' in h or 'PREGUNTA' in h: col_desc = idx_c
                elif 'INFORMACI' in h or 'RESPONSABLE' in h: col_resp = idx_c
                elif 'SI CUMPLE' in h or 'SÍ CUMPLE' in h: col_si = idx_c
                elif 'NO CUMPLE' in h: col_no = idx_c
                elif 'N/A' in h or 'NA' in h: col_na = idx_c
                elif 'OBSERVAC' in h: col_obs = idx_c

            cumple_count = 0
            no_cumple_count = 0
            equip_filled = {}
            equip_all = set()

            for r in range(header_idx + 1, len(df)):
                row_vals = df.iloc[r]
                eq_name = str(row_vals[0]).strip() if pd.notna(row_vals[0]) else ''
                item_val = safe_str(row_vals[col_item]) if len(row_vals) > col_item else None
                desc_val = safe_str(row_vals[col_desc]) if len(row_vals) > col_desc else None
                resp_val = safe_str(row_vals[col_resp]) if len(row_vals) > col_resp else None
                si_val = str(row_vals[col_si]).strip().upper() if len(row_vals) > col_si and pd.notna(row_vals[col_si]) else ""
                no_val = str(row_vals[col_no]).strip().upper() if len(row_vals) > col_no and pd.notna(row_vals[col_no]) else ""
                na_val = str(row_vals[col_na]).strip().upper() if len(row_vals) > col_na and pd.notna(row_vals[col_na]) else ""
                obs_val = safe_str(row_vals[col_obs]) if len(row_vals) > col_obs else None

                if eq_name and eq_name.upper() not in ['EQUIPO', 'ITEM', 'NAN', 'SUBTOTAL', 'TOTAL', '% CUMPLIMIENTO', 'OBSERVACIONES'] and not eq_name.startswith('%'):
                    equip_all.add(eq_name)
                    if eq_name not in equip_filled:
                        equip_filled[eq_name] = False

                if not item_val or item_val.upper() in ['ITEM', 'CÓDIGO', 'CODIGO']: continue
                
                # Ignorar encabezados de sección y metadatos de plantilla (ej. PRODUCTOS:, TEMPERATURA DE OPERACIÓN)
                if any(k in item_val.upper() for k in ['PRODUCTOS:', 'SECCIÓN:', 'SECCION:', 'UBICACIÓN:', 'UBICACION:', 'TEMPERATURA', 'CANTIDAD DE']):
                    continue

                if not desc_val or desc_val.upper() in ['DESCRIPCION', 'DESCRIPCIÓN'] or 'REPORTE DE' in desc_val.upper(): continue

                # Ignorar filas de resumen de % CUMPLIMIENTO, Totales o Subtotales
                desc_clean = desc_val.strip().upper()
                if desc_clean.startswith('% CUMPLIMIENTO') or desc_clean.startswith('CUMPLIMIENTO') or desc_clean.startswith('SUBTOTAL') or desc_clean.startswith('PUNTAJE TOTAL') or desc_clean in ['TOTAL', 'PUNTAJE']:
                    continue
                if obs_val and any(k in obs_val.upper() for k in ['% CUMPLIMIENTO', 'CUMPLIMIENTO']): continue

                is_si = si_val in ['X', '1', 'SI', 'SÍ', 'TRUE']
                is_no = no_val in ['X', '1', 'SI', 'SÍ', 'TRUE']
                is_na = na_val in ['X', '1', 'SI', 'SÍ', 'TRUE']

                if is_si or is_no or is_na:
                    if eq_name and eq_name in equip_filled:
                        equip_filled[eq_name] = True

                if is_si:
                    cumple_count += 1
                if is_no:
                    no_cumple_count += 1
                    pr_eq, pct_eq = get_equipment_metrics_at_row(df, r)
                    hallazgos_batch.append({
                        "auditoria_id": audit_id,
                        "tienda": tienda,
                        "auditor": cabecera["auditor"],
                        "sistema": sheet.strip(),
                        "activo_especifico": get_equipment_context(df, r),
                        "item_no_conforme": item_val,
                        "descripcion_item_no_cumple": desc_val,
                        "responsable_observado": resp_val,
                        "acciones_especifica": obs_val if obs_val else "--",
                        "accion_global": None,
                        "tipo_proyecto_eficiencia": None,
                        "impacto_eficiencia": None,
                        "costo": None,
                        "responsable_ejecucion": None,
                        "puntaje_real_equipo": pr_eq,
                        "porcentaje_cumplimiento_equipo": pct_eq
                    })

            puntaje_max = cumple_count + no_cumple_count
            porcentaje = round((cumple_count / puntaje_max * 100), 2) if puntaje_max > 0 else 0.0

            filled_eq_count = sum(1 for eq, is_marked in equip_filled.items() if is_marked)
            if len(equip_all) > 0:
                equipos_cnt = filled_eq_count
            else:
                equipos_cnt = 1 if puntaje_max > 0 else 0

            # Guardar resultados crudos de la hoja para re-ponderación efectiva
            raw_puntajes.append({
                "sheet": sheet.strip(),
                "equipos_cnt": equipos_cnt,
                "cumple_count": cumple_count,
                "puntaje_max": puntaje_max,
                "porcentaje": porcentaje,
                "peso_base": get_sistema_peso(sheet.strip(), pesos_db)
            })

        except Exception as e:
            log(f"⚠️ Error procesando hoja {sheet} en {filename}: {e}", "info")

    # Re-ponderar pesos al 100% únicamente entre las hojas con equipos evaluados (equipos_cnt > 0)
    total_peso_evaluado = sum(item["peso_base"] for item in raw_puntajes if item["equipos_cnt"] > 0)

    for item in raw_puntajes:
        if item["equipos_cnt"] > 0 and total_peso_evaluado > 0:
            peso_efectivo = round((item["peso_base"] / total_peso_evaluado) * 100, 2)
            pct_ponderado = round((item["porcentaje"] * (peso_efectivo / 100.0)), 2)
        else:
            peso_efectivo = 0.0
            pct_ponderado = 0.0

        puntajes_batch.append({
            "auditoria_id": audit_id,
            "tienda": tienda,
            "sistema": item["sheet"],
            "cantidad_equipos_evaluados": item["equipos_cnt"],
            "puntaje_obtenido": item["cumple_count"],
            "puntaje_ideal": item["puntaje_max"],
            "porcentaje_cumplimiento": item["porcentaje"],
            "peso_sistema": peso_efectivo,
            "porcentaje_cumplimiento_ponderado": pct_ponderado
        })

    log(json.dumps({"store": base_store_name, "progress": 90, "detail": "Guardando puntajes y hallazgos en DB..."}), "progress")

    # Inserción en Supabase
    try:
        if puntajes_batch:
            try:
                supabase.table('auditoria_puntajes').insert(puntajes_batch).execute()
            except Exception as ex_p:
                log(f"⚠️ Reintentando inserción previa de puntajes sin ponderado: {ex_p}", "info")
                for p in puntajes_batch:
                    p.pop("peso_sistema", None)
                    p.pop("porcentaje_cumplimiento_ponderado", None)
                supabase.table('auditoria_puntajes').insert(puntajes_batch).execute()

            # Actualizar Nota Global Ponderada de la Auditoría Cabecera
            total_nota_global = round(sum(p.get("porcentaje_cumplimiento_ponderado", 0.0) for p in puntajes_batch), 2)
            supabase.table('auditoria_auditorias').update({"porcentaje_general": total_nota_global}).eq('id', audit_id).execute()
            log(f"⭐ Nota Global Ponderada registrada para {tienda}: {total_nota_global}%")
            
        if hallazgos_batch:
            try:
                for i in range(0, len(hallazgos_batch), 50):
                    chunk = hallazgos_batch[i:i+50]
                    supabase.table('auditoria_hallazgos_detallados').insert(chunk).execute()
            except Exception as ex_h:
                # Omitir campos de puntaje real si la DB no los tiene aún creados
                log(f"⚠️ Intentando inserción de compatibilidad previa en hallazgos: {ex_h}", "info")
                for h in hallazgos_batch:
                    h.pop("puntaje_real_equipo", None)
                    h.pop("porcentaje_cumplimiento_equipo", None)
                for i in range(0, len(hallazgos_batch), 50):
                    chunk = hallazgos_batch[i:i+50]
                    supabase.table('auditoria_hallazgos_detallados').insert(chunk).execute()

        log(f"✅ {tienda}: {len(puntajes_batch)} puntajes y {len(hallazgos_batch)} hallazgos registrados.")
    except Exception as e:
        log(f"❌ Error al guardar datos en Supabase para {tienda}: {e}", "error")

    log(json.dumps({"store": base_store_name, "progress": 100, "detail": f"Finalizado ({len(hallazgos_batch)} hallazgos)"}), "progress")

    return True

def main():
    log("Iniciando Motor de Extracción con Detección Previa de Colisiones", "info")
    folder_path = os.environ.get('FOLDER_PATH', r"E:\Gestion SPSA\3.Gestión Energía\Auditoria Energética\1.Auditoria energeticas Mk 2026")
    
    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
        folder_path = sys.argv[1]
        
    if not os.path.exists(folder_path):
        log(f"❌ La ruta especificada no existe: {folder_path}", "error")
        return

    files = glob.glob(os.path.join(folder_path, "*.xls*"))
    valid_files = [f for f in files if "~$" not in f]
    log(f"🔍 {len(valid_files)} archivos de auditoría encontrados en directorio.", "info")
    
    stores = [os.path.basename(f).replace('.xlsx','').replace('.xlsm','').replace('.xls','') for f in valid_files]
    log(json.dumps({"stores": stores}), "discovery")
    
    log("🔎 Realizando análisis previo de metadatos (Pre-Check de Colisiones)...", "info")
    
    meta_map = {}
    file_cabeceras = {}
    
    for f, base_store in zip(valid_files, stores):
        cab = extract_datos(f)
        file_cabeceras[f] = cab
        if cab:
            key = (cab["tienda"].strip().upper(), cab["fecha"].strip())
            if key not in meta_map:
                meta_map[key] = []
            meta_map[key].append((f, base_store, cab))

    colliding_files = set()
    for key, file_list in meta_map.items():
        if len(file_list) > 1:
            tienda_name, fecha_val = key
            filenames = [os.path.basename(x[0]) for x in file_list]
            log(f"⚠️ ALERTA DE COLISIÓN DETECTADA: La tienda/fecha '{tienda_name}' ({fecha_val}) está duplicada en {len(file_list)} archivos: {filenames}", "info")
            
            # El primer archivo de la lista se procesa, los siguientes se marcan como colisión
            for item in file_list[1:]:
                f_path, b_store, cab = item
                colliding_files.add(f_path)
                detail_msg = f"⚠️ Colisión de metadatos: la tienda '{tienda_name}' ({fecha_val}) en {os.path.basename(f_path)} colisiona con {os.path.basename(file_list[0][0])}. Omitido de la BD."
                log(json.dumps({
                    "store": b_store,
                    "progress": 100,
                    "status": "collision",
                    "detail": detail_msg
                }), "progress")

    try:
        supabase = connect_supabase()
        pesos_db = load_pesos_config(supabase)
        log("🧹 Limpiando tablas de Supabase para una ejecución limpia desde cero...", "info")
        try:
            supabase.table('auditoria_hallazgos_detallados').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
            supabase.table('auditoria_puntajes').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
            supabase.table('auditoria_auditorias').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
            log("✨ Tablas de Supabase purgadas correctamente antes del nuevo escaneo.", "info")
        except Exception as e_purge:
            log(f"⚠️ Aviso al purgar tablas: {e_purge}", "info")
    except Exception as e:
        log(f"❌ Error conectando a Supabase: {e}", "error")
        return

    processed = 0
    skipped_collisions = 0

    for file, base_store in zip(valid_files, stores):
        if file in colliding_files:
            log(f"⏭️ Omitiendo inyección de {os.path.basename(file)} por colisión de plantilla.", "info")
            skipped_collisions += 1
            continue
            
        success = process_file(file, supabase, base_store, file_cabeceras.get(file), pesos_db)
        if success: processed += 1
        
    summary_payload = {
        "total_analyzed": len(valid_files),
        "successful": processed,
        "collisions": skipped_collisions
    }
    
    # Recalcular cantidades observadas en la tabla Estandarización Maestra de Acciones
    recalculate_estandarizacion_cantidades(supabase)
    
    log(json.dumps(summary_payload), "summary")
    log(f"🎉 Procesamiento completo. {processed} auditorías procesadas con éxito, {skipped_collisions} omitidas por colisión de metadatos.", "success")

def recalculate_estandarizacion_cantidades(supabase):
    try:
        res_h = supabase.table('auditoria_hallazgos_detallados').select('item_no_conforme, descripcion_item_no_cumple').execute()
        hallazgos = res_h.data or []
        
        res_e = supabase.table('auditoria_estandarizacion_acciones').select('id, item_codigo, descripcion_no_conformidad').execute()
        estandarizaciones = res_e.data or []
        
        if not estandarizaciones:
            return
            
        counts_by_code = {}
        counts_by_desc = {}
        for h in hallazgos:
            cod = str(h.get('item_no_conforme') or '').strip()
            desc = str(h.get('descripcion_item_no_cumple') or '').strip().lower()
            if cod:
                counts_by_code[cod] = counts_by_code.get(cod, 0) + 1
            if desc:
                counts_by_desc[desc] = counts_by_desc.get(desc, 0) + 1
                
        for est in estandarizaciones:
            est_id = est.get('id')
            item_code_str = str(est.get('item_codigo') or '').strip()
            item_desc_lower = str(est.get('descripcion_no_conformidad') or '').strip().lower()
            
            c = counts_by_code.get(item_code_str, 0)
            if c == 0 and item_desc_lower:
                c = counts_by_desc.get(item_desc_lower, 0)
                
            supabase.table('auditoria_estandarizacion_acciones').update({'cantidad': c}).eq('id', est_id).execute()
            
        log("📊 Recálculo de cantidades en Estandarización Maestra completado con éxito.", "info")
    except Exception as e:
        log(f"⚠️ Nota al recalcular cantidades de estandarización: {e}", "info")

if __name__ == "__main__":
    main()
