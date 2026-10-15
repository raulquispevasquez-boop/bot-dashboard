import sys
import json
import time
import os
import re
import traceback
import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

# Forzar codificación UTF-8 para evitar errores 'charmap' en consola de Windows
if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr.encoding.lower() != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8')

# ─── Perfil persistente: la sesión se guarda entre ejecuciones ───────────────
PROFILE_DIR = os.path.join(os.path.dirname(__file__), "outlook_profile")

def log_err(msg):
    """Logs de estado → stderr (aparecen en SSE como eventos 'log')"""
    try:
        print(msg, file=sys.stderr, flush=True)
    except Exception:
        pass


def emit(data: dict):
    """Eventos estructurados → stdout (el API los parsea línea por línea)"""
    print(json.dumps(data, ensure_ascii=False), flush=True)


def unlock_profile():
    """
    Elimina los archivos de bloqueo que Chrome deja cuando queda abierto.
    Permite reutilizar el perfil (con la sesión guardada) sin conflicto.
    Los datos de sesión/cookies NO se borran.
    """
    lock_files = ["SingletonLock", "SingletonCookie", "SingletonSocket", "pause.lock"]
    for lf in lock_files:
        path = os.path.join(PROFILE_DIR, lf)
        try:
            if os.path.exists(path):
                os.remove(path)
                log_err(f"[PROFILE] 🔓 Lock liberado: {lf}")
        except Exception as ex:
            log_err(f"[PROFILE] ⚠ No se pudo liberar {lf}: {ex}")


# ─── Login automático ─────────────────────────────────────────────────────────
def do_login(page, email, password):
    try:
        email_input = page.locator('input[type="email"]')
        email_input.wait_for(state="visible", timeout=6000)
        log_err("[LOGIN] Escribiendo correo...")
        email_input.fill(email)
        time.sleep(0.4)
        page.locator('input[type="submit"]').click()
    except PlaywrightTimeout:
        log_err("[LOGIN] No hay campo de email — sesión posiblemente activa.")

    try:
        pwd = page.locator('input[type="password"]')
        pwd.wait_for(state="visible", timeout=8000)
        log_err("[LOGIN] Escribiendo contraseña...")
        pwd.fill(password)
        time.sleep(0.4)
        page.locator('input[type="submit"]').click()
    except PlaywrightTimeout:
        log_err("[LOGIN] No hay campo de contraseña.")

    try:
        stay = page.locator('input[id="idBtn_Back"]')
        stay.wait_for(state="visible", timeout=5000)
        stay.click()
    except PlaywrightTimeout:
        pass

    log_err("[LOGIN] Esperando bandeja (MFA si aplica — máx 5 min)...")
    # El nuevo Outlook (cloud.microsoft) y el clásico (office.com) tienen diferentes aria-labels
    BANDEJA_SELECTOR = (
        'div[aria-label="Lista de mensajes"], '
        'div[aria-label="Message list"], '
        'div[aria-label="Mail list"], '
        'div[role="list"][aria-label], '
        '[data-testid="MailList"]'
    )
    try:
        page.wait_for_selector(BANDEJA_SELECTOR, timeout=300_000)
        log_err("[LOGIN] ✅ Sesión iniciada correctamente.")
        return True
    except PlaywrightTimeout:
        log_err("[LOGIN] ⚠ No se detectó la bandeja tras 5 min.")
        return False


# ─── Navegar a carpeta (multi-estrategia) ────────────────────────────────
BANDEJA_SELECTOR = (
    'div[aria-label="Lista de mensajes"], '
    'div[aria-label="Message list"], '
    'div[aria-label="Mail list"], '
    '[data-testid="MailList"]'
)

def go_to_folder(page, folder_name):
    if folder_name.lower() in ["bandeja de entrada", "inbox"]:
        return True

    # Estrategias en orden de especificidad
    strategies = [
        f'[aria-label="{folder_name}"]',
        f'[title="{folder_name}"]',
        f'span[title="{folder_name}"]',
        f'div[title="{folder_name}"]',
        f'button[aria-label*="{folder_name}"]',
        f'span:text-is("{folder_name}")',
        f'div:text-is("{folder_name}")',
        f'[data-testid*="{folder_name}"]',
    ]

    for selector in strategies:
        try:
            loc = page.locator(selector).first
            loc.wait_for(state="visible", timeout=4000)
            loc.scroll_into_view_if_needed()
            loc.click()
            time.sleep(3)
            log_err(f"[FOLDER] ✅ Navegué a '{folder_name}' con selector: {selector}")
            return True
        except Exception:
            continue

    log_err(f"[FOLDER] ⚠ No pude clic en '{folder_name}'. "
            "Esperando 30s — selecciónala manualmente en el navegador...")
    time.sleep(30)
    return False


# ─── Obtener filas de correos (multi-selector) ───────────────────────────
def get_email_rows(page):
    """
    Prueba múltiples selectores y retorna el Locator con más elementos.
    Compatible con Outlook clásico (office.com) y nuevo (cloud.microsoft).
    """
    candidates = [
        'div[role="option"]',                    # Nuevo Outlook Cloud
        'div[role="row"][aria-selected]',        # Outlook clásico
        'div[role="row"]',                       # Outlook clásico (sin aria)
        'li[role="option"]',                     # Alternativa
        '[data-convid]',                         # Nuevo Outlook (conversation id)
        '[data-messageid]',                      # Variante
    ]

    best_loc  = None
    best_count = 0

    for sel in candidates:
        try:
            loc   = page.locator(sel)
            count = loc.count()
            log_err(f"[ROWS] Selector '{sel}' → {count} elementos")
            if count > best_count:
                best_count = count
                best_loc   = loc
        except Exception:
            continue

    if best_loc is None or best_count == 0:
        log_err("[ROWS] ⚠ Ningún selector encontró correos.")
        return page.locator('div[role="option"]'), 0  # fallback

    log_err(f"[ROWS] ✅ Usando selector con {best_count} correos.")
    return best_loc, best_count


# ─── Preparar Excel con encabezados ──────────────────────────────────────────
def crear_excel(path):
    if os.path.exists(path):
        try:
            wb = openpyxl.load_workbook(path)
            ws = wb.active
            last_row = ws.max_row
        except Exception as e:
            log_err(f"⚠️ El archivo Excel estaba corrupto ({e}). Creando copia de seguridad y uno nuevo...")
            backup_path = path.replace(".xlsx", f"_corrupto_{int(time.time())}.xlsx")
            os.rename(path, backup_path)
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Correos Descargados"
            last_row = 1
        
        historial = dict()
        for r in range(2, last_row + 1):
            enlace = str(ws.cell(row=r, column=2).value or "").strip()
            if "Sin Archivo" not in enlace:
                fecha = str(ws.cell(row=r, column=5).value or "").strip()
                remi  = str(ws.cell(row=r, column=6).value or "").strip()
                asun  = str(ws.cell(row=r, column=8).value or "").strip()
                numero_excel = str(ws.cell(row=r, column=1).value or "").strip()
                historial[(fecha, remi, asun)] = numero_excel
            
        return wb, ws, last_row, historial
    else:
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Correos Descargados"

        headers = [
            "N°", "Abrir Correo Local", "Enlace Outlook Web", "Fecha Extracción", "Fecha Correo", "Remitente", "Destinatario",
            "Título del Correo", "Carpeta Generada", "Archivos Descargados", 
            "Monto extraído", "Contenido del Correo", "Copiados (CC)", 
            "Responsable", "Tipo de Activo"
        ]
        header_fill = PatternFill("solid", fgColor="DDEBF7") # Celeste claro
        header_font = Font(bold=True, color="000000", size=10) # Letra negra

        for col_idx, h in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col_idx, value=h)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")

        ws.freeze_panes = "A2"
        # Anchos de columna
        widths = [5, 18, 20, 20, 14, 28, 28, 45, 25, 30, 16, 70, 30, 25, 20]
        for i, w in enumerate(widths, 1):
            ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = w

        wb.save(path)
        return wb, ws, 1, set()


def append_row_excel(wb, ws, path, row_num, data):
    """Añade una fila al Excel y guarda inmediatamente."""
    # Color gris muy claro para filas intercaladas
    alt_fill = PatternFill("solid", fgColor="F2F2F2") if row_num % 2 == 0 else None
    cols = [
        row_num,
        data["enlace_local"],
        data["enlace_web"],
        data["fecha_extraccion"],
        data["fecha_correo"],
        data["remitente"],
        data["destinatario"],
        data["asunto"],
        data["carpeta"],
        data["adjuntos"],
        data["monto"],
        data["cuerpo_completo"],
        data["cc"],
        data["responsable"],
        data["tipo_activo"],
    ]
    for col_idx, val in enumerate(cols, 1):
        if isinstance(val, str) and val.startswith("HYPERLINK|"):
            parts = val.split("|")
            cell = ws.cell(row=row_num + 1, column=col_idx, value=parts[2])
            cell.hyperlink = parts[1]
            cell.font = Font(color="3B82F6", underline="single") # Link color
            if alt_fill: cell.fill = alt_fill
        else:
            cell = ws.cell(row=row_num + 1, column=col_idx, value=val)
            if alt_fill: cell.fill = alt_fill
            
        cell.alignment = Alignment(wrap_text=True, vertical="top")
    wb.save(path)


# ─── Descargar MSG ────────────────────────────────────────────────────────────
def descargar_msg(page, download_path, row_num, safe_title):
    """Hace clic derecho en el correo seleccionado y lo descarga como MSG."""
    try:
        # Asegurarnos de buscar SOLO en la lista de mensajes central
        lista = page.locator(BANDEJA_SELECTOR).first
        selected = lista.locator('div[role="option"][aria-selected="true"], div[role="row"][aria-selected="true"]').first
        
        def try_download(action_func):
            try:
                action_func()
                time.sleep(1.0) # Dar tiempo a que abra el menú
                
                # Buscar específicamente en elementos de menú de Outlook (ignorando botones de la UI del navegador)
                target_btn_matches = page.locator('[role="menuitem"]').filter(has_text=re.compile(r"(Guardar como|Save as|Guardar|Descargar|Download)", re.IGNORECASE)).all()
                target_btn = None
                for item in target_btn_matches:
                    if item.is_visible():
                        target_btn = item
                        break
                
                if target_btn:
                    # Hay un submenú ("Download as EML" / "Download as MSG")
                    # que a veces tarda en renderizar mas de 0.5s - un sleep
                    # fijo corto hacia que a veces cayeramos al boton padre
                    # "Download" (que no descarga nada, solo abre el
                    # submenu), y el expect_download de abajo nunca
                    # disparaba. Ahora se espera activamente a que aparezca
                    # el item, con timeout generoso, en vez de una foto fija
                    # a los 0.5s. Se prueba EML primero explicitamente (ver
                    # nota de mas abajo sobre por que EML y no MSG), MSG
                    # solo como respaldo si ese correo no ofreciera EML.
                    target_btn.hover()
                    sub_msg = None
                    for patron in (r"EML", r"MSG"):
                        try:
                            candidato = page.locator('[role="menuitem"]').filter(has_text=re.compile(patron, re.IGNORECASE)).first
                            candidato.wait_for(state="visible", timeout=3000)
                            sub_msg = candidato
                            break
                        except PlaywrightTimeout:
                            continue

                    btn_click = sub_msg if sub_msg else target_btn
                    
                    try:
                        menu_texts = page.locator('[role="menuitem"]').all_inner_texts()
                        log_err(f"[DOWNLOAD-DEBUG] Elementos del menú visibles: {menu_texts}")
                        log_err(f"[DOWNLOAD-DEBUG] Botón seleccionado para clic: {btn_click.inner_text()}")
                    except:
                        pass
                    
                    # Archivos en "In-Place Archive" pueden tardar hasta 30-40 segundos en ser generados por el servidor
                    with page.expect_download(timeout=60000) as download_info:
                        btn_click.click(force=True)
                    download = download_info.value
                    
                    # Usamos .eml obligatoriamente porque Outlook Web entrega MIME y Outlook Escritorio rompe los adjuntos si lo forzamos a .msg
                    ext = ".eml"
                    
                    filename = f"{row_num:03d}_{safe_title}{ext}"
                    filepath = os.path.join(download_path, filename)
                    download.save_as(filepath)
                    log_err(f"[DOWNLOAD] ✅ Correo Guardado: {filename}")
                    time.sleep(0.5)
                    return filename
                    
            except Exception as e:
                page.keyboard.press("Escape")
                time.sleep(0.5)
                log_err(f"[DOWNLOAD-DEBUG] Error en try_download: {e}")
                return None

        # Intento 1: Clic derecho en la lista (desplazado para no darle a la foto de perfil ni a los botones rápidos)
        res = try_download(lambda: selected.click(button="right", position={"x": 80, "y": 20}, force=True))
        if res: return res
        
        # Intento 2: Botón "Más opciones" (...) dentro del Panel de Lectura
        reading_pane = page.locator('div[aria-label="Reading Pane"], div[aria-label="Panel de lectura"], div[aria-label*="Cuerpo"]').first
        more_btn = reading_pane.locator('button[aria-label*="opciones"], button[aria-label*="options"], button[aria-label*="acciones"], button[aria-label*="actions"], button[title*="acciones"], button[title*="actions"], button[title*="opciones"], button[title*="options"]').first
        if more_btn.count() > 0:
            res = try_download(lambda: more_btn.click(force=True))
            if res: return res
        
        log_err(f"[DOWNLOAD] ⚠ Menú MSG no cargó tras agotar todos los métodos.")
        try:
            debug_path = os.path.join(download_path, "debug_menu_fallo.png")
            page.screenshot(path=debug_path)
            log_err(f"[DOWNLOAD-DEBUG] Captura guardada en: {debug_path}")
        except: pass
        return "—"
    except Exception as e:
        page.keyboard.press("Escape")
        log_err(f"[DOWNLOAD] ⚠ Error al intentar descargar MSG: {e}")
    return "—"


# ─── Tipo de activo heurístico ────────────────────────────────────────────────
def detectar_tipo(texto):
    t = texto.lower()
    if "iluminaci" in t:           return "Iluminación"
    if "pozo" in t or "tierra" in t: return "Pozos a Tierra"
    if "subestaci" in t:           return "Subestación"
    if "mantenimiento" in t or "mtto" in t: return "Mantenimiento General"
    if "factura" in t or "monto" in t or "pago" in t: return "Facturación"
    if "contrato" in t:            return "Contrato"
    return "General"


def extraer_monto(texto):
    m = re.search(r"S/\.?\s?[\d,\.]+|USD?\s?[\d,\.]+", texto, re.IGNORECASE)
    return m.group(0) if m else "—"


# ─── CHECKPOINT: guardar y leer posición exacta para reanudar ────────────────
def _save_checkpoint(chk_path, total_catalogados, last_fecha, last_remi, last_asunto):
    data = {
        "total_catalogados": total_catalogados,
        "last_email": {"fecha": last_fecha, "remitente": last_remi, "asunto": last_asunto},
        "guardado_en": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    try:
        with open(chk_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as ex:
        log_err(f"[CHECKPOINT] ⚠ No se pudo guardar: {ex}")

def _load_checkpoint(chk_path):
    if not os.path.exists(chk_path):
        return None
    try:
        with open(chk_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return None


# ─── INVENTARIO MASIVO (solo metadata, sin descargar EML) ────────────────────
def inventario_web(email, password, folder_name, download_path, batch_size=2000, start_from=0):
    """
    Recorre TODOS los correos de la carpeta a alta velocidad (~0.35s/correo).
    Solo captura: fecha, remitente, asunto, tiene_adjuntos.
    Checkpoint automático cada 50 filas → reanuda exactamente donde se apagó.
    Turbo-skip: avanza al punto de reanudación a 0.1s/correo (sin capturar nada).
    """
    os.makedirs(download_path, exist_ok=True)
    excel_file = os.path.join(download_path, "Inventario_Correos.xlsx")
    chk_file   = os.path.join(download_path, "inventario_checkpoint.json")

    # ── Leer checkpoint si existe ─────────────────────────────────────────────
    chk = _load_checkpoint(chk_file)
    turbo_skip_count = 0   # cuántos correos saltar en turbo
    if chk:
        turbo_skip_count = max(0, chk["total_catalogados"] - 5)  # retrocede 5 para solaparse seguro
        log_err(f"[CHECKPOINT] 📍 Reanudando desde correo #{turbo_skip_count} "
                f"(guardado: {chk['guardado_en']})")
        log_err(f"[CHECKPOINT] Último correo registrado: {chk['last_email']['asunto'][:60]}")
        emit({"type": "checkpoint_found",
              "total_catalogados": chk["total_catalogados"],
              "turbo_skip": turbo_skip_count,
              "guardado_en": chk["guardado_en"]})
    else:
        log_err("[CHECKPOINT] 🆕 Sin checkpoint previo — iniciando desde cero.")

    # ── Cargar o crear Excel ──────────────────────────────────────────────────
    if os.path.exists(excel_file):
        wb = openpyxl.load_workbook(excel_file)
        ws = wb.active
        last_row = ws.max_row
        ya_catalogados = set()
        for r in range(2, last_row + 1):
            fecha = str(ws.cell(row=r, column=1).value or "").strip()
            remi  = str(ws.cell(row=r, column=2).value or "").strip()
            asun  = str(ws.cell(row=r, column=3).value or "").strip()
            if fecha or remi or asun:
                ya_catalogados.add((fecha, remi, asun))
        log_err(f"[INVENTARIO] 📂 Excel existente: {last_row - 1} correos ya catalogados.")
    else:
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Inventario"
        headers = ["Fecha Correo", "Remitente", "Asunto", "Tiene Adjuntos", "Estado", "Fecha Catalogado"]
        hfill = PatternFill("solid", fgColor="1F4E79")
        hfont = Font(bold=True, color="FFFFFF", size=10)
        for ci, h in enumerate(headers, 1):
            c = ws.cell(row=1, column=ci, value=h)
            c.fill = hfill; c.font = hfont
            c.alignment = Alignment(horizontal="center")
        ws.freeze_panes = "A2"
        widths = [18, 35, 60, 14, 14, 20]
        for i, w in enumerate(widths, 1):
            ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = w
        wb.save(excel_file)
        last_row = 1
        ya_catalogados = set()

    row_num = last_row
    unlock_profile()

    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            user_data_dir=PROFILE_DIR, headless=False,
            args=["--start-maximized", "--disable-features=SafeBrowsing"],
            no_viewport=True,
        )
        try:
            page = browser.pages[0] if browser.pages else browser.new_page()
            page.goto("https://outlook.office.com/mail/", wait_until="domcontentloaded")

            try:
                page.wait_for_selector(BANDEJA_SELECTOR, timeout=10000)
            except PlaywrightTimeout:
                ok = do_login(page, email, password)
                if not ok:
                    emit({"type": "done", "success": False, "error": "No se pudo acceder."})
                    return

            go_to_folder(page, folder_name)
            time.sleep(3)

            # Obtener total estimado
            total_estimado = 63807
            try:
                fel = page.locator(f'[title="{folder_name}"] span, [aria-label*="{folder_name}"] span').filter(has_text=re.compile(r"^\d+$")).first
                if fel.count() > 0:
                    total_estimado = int(fel.inner_text())
            except:
                pass

            log_err(f"[INVENTARIO] 📊 Total estimado: {total_estimado} | Ya catalogados: {len(ya_catalogados)} | Lote: {batch_size}")
            emit({"type": "start", "total": total_estimado, "excel_path": excel_file, "mode": "inventario"})

            # Ocultar banners molestos
            try:
                page.evaluate('() => { document.querySelectorAll(\'div[role="alert"]\').forEach(e => e.style.display="none"); }')
            except:
                pass

            # Click en primer correo
            lista = page.locator(BANDEJA_SELECTOR).first
            primer = lista.locator('div[role="option"], div[role="row"]').first
            if primer.count() > 0:
                primer.scroll_into_view_if_needed()
                primer.click(force=True)
                time.sleep(1.0)

            procesados_texto = set()
            catalogados_lote = 0
            saltados = 0
            ui_words = ["unread", "no leído", "has attachments", "contiene datos adjuntos",
                        "pinned", "chincheta", "replied", "respondido", "forwarded", "reenviado"]

            # ── TURBO-SKIP: avanzar rápido hasta el punto de reanudación ──────
            if turbo_skip_count > 0:
                log_err(f"[TURBO-SKIP] ⚡ Avanzando {turbo_skip_count} correos a alta velocidad...")
                emit({"type": "turbo_skip_start", "count": turbo_skip_count})
                for ts_i in range(turbo_skip_count):
                    page.keyboard.press("ArrowDown")
                    time.sleep(0.10)  # ← Solo tecla, sin capturar nada
                    if ts_i % 500 == 0 and ts_i > 0:
                        log_err(f"[TURBO-SKIP] ⚡ {ts_i}/{turbo_skip_count} saltados...")
                        emit({"type": "turbo_skip_progress", "current": ts_i, "total": turbo_skip_count})
                log_err(f"[TURBO-SKIP] ✅ Posición de reanudación alcanzada. Iniciando captura normal.")
                emit({"type": "turbo_skip_done", "skipped": turbo_skip_count})
                time.sleep(1.5)  # Dar tiempo a Outlook para estabilizarse

            for i in range(start_from, start_from + batch_size + 50000):
                # Pausa controlada
                pause_file = os.path.join(PROFILE_DIR, "pause.lock")
                if os.path.exists(pause_file):
                    log_err("[INVENTARIO] ⏸️ En pausa...")
                    while os.path.exists(pause_file):
                        time.sleep(1.5)
                    log_err("[INVENTARIO] ▶️ Reanudando...")
                    time.sleep(1.0)

                lista = page.locator(BANDEJA_SELECTOR).first
                selected = lista.locator('div[role="option"][aria-selected="true"], div[role="row"][aria-selected="true"]').first

                if selected.count() == 0:
                    time.sleep(2.0)
                    selected = lista.locator('div[role="option"][aria-selected="true"], div[role="row"][aria-selected="true"]').first
                    if selected.count() == 0:
                        try: lista.focus()
                        except: pass
                        page.keyboard.press("PageDown")
                        time.sleep(1.5)
                        selected = lista.locator('div[role="option"][aria-selected="true"], div[role="row"][aria-selected="true"]').first
                        if selected.count() == 0:
                            log_err("[INVENTARIO] ✅ Fin de lista alcanzado.")
                            break

                texto_fila = selected.inner_text()
                if texto_fila in procesados_texto:
                    # Outlook Web usa scroll virtual — el bloque visible se agota cada ~100 correos.
                    # Combinamos scroll JS (por selector CSS, sin element_handle) + PageDown + ArrowDown
                    # con espera creciente. Solo declaramos fin de lista tras 10 intentos fallidos.
                    avanzado = False
                    for intento in range(10):
                        try:
                            # Scroll JS por selector CSS — no usa element_handle (más estable)
                            page.evaluate("""
                                () => {
                                    const sel = [
                                        'div[aria-label="Lista de mensajes"]',
                                        'div[aria-label="Message list"]',
                                        'div[aria-label="Mail list"]',
                                        '[data-testid="MailList"]'
                                    ];
                                    for (const s of sel) {
                                        const el = document.querySelector(s);
                                        if (el) { el.scrollTop += el.clientHeight * 0.75; break; }
                                    }
                                }
                            """)
                        except:
                            pass

                        # Alternamos PageDown y ArrowDown para forzar la carga del bloque
                        if intento % 2 == 0:
                            page.keyboard.press("PageDown")
                        else:
                            try: selected.click(position={"x": 5, "y": 5}, force=True)
                            except: pass
                            page.keyboard.press("ArrowDown")

                        espera = 0.8 + intento * 0.5  # 0.8s, 1.3s, 1.8s... hasta ~5.3s
                        time.sleep(espera)

                        lista2 = page.locator(BANDEJA_SELECTOR).first
                        sel2 = lista2.locator('div[role="option"][aria-selected="true"], div[role="row"][aria-selected="true"]').first
                        if sel2.count() > 0:
                            nuevo_texto = sel2.inner_text()
                            if nuevo_texto not in procesados_texto:
                                texto_fila = nuevo_texto
                                avanzado = True
                                log_err(f"[INVENTARIO] 🔄 Nuevo bloque cargado (intento {intento+1})")
                                break
                            elif intento >= 5:
                                log_err(f"[INVENTARIO] ⏳ Bloque cargando lento (intento {intento+1}/10)...")
                    if not avanzado:
                        log_err("[INVENTARIO] ✅ Fin de lista real confirmado tras 10 intentos.")
                        break

                procesados_texto.add(texto_fila)
                lineas_crudas = [x.strip() for x in texto_fila.split("\n") if x.strip()]
                lineas = [l for l in lineas_crudas if l.lower() not in ui_words and len(l) > 1]

                if not lineas:
                    page.keyboard.press("ArrowDown")
                    time.sleep(0.3)
                    continue

                remitente = lineas[0] if len(lineas) > 0 else "Desconocido"
                asunto    = lineas[1] if len(lineas) > 1 else "Sin Asunto"
                fecha = "—"
                for line in reversed(lineas):
                    if re.search(r'\d', line) and len(line) < 30:
                        fecha = line; break

                tiene_adj = "contiene datos adjuntos" in texto_fila.lower() or "has attachments" in texto_fila.lower()

                # Saltar si ya está catalogado
                if (fecha, remitente, asunto) in ya_catalogados:
                    saltados += 1
                    try: selected.click(position={"x": 5, "y": 5}, force=True)
                    except: pass
                    page.keyboard.press("ArrowDown")
                    time.sleep(0.25)
                    continue

                ya_catalogados.add((fecha, remitente, asunto))
                row_num += 1
                catalogados_lote += 1
                fecha_cat = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

                alt_fill = PatternFill("solid", fgColor="F2F2F2") if row_num % 2 == 0 else None
                vals = [fecha, remitente, asunto, "Sí" if tiene_adj else "No", "Pendiente", fecha_cat]
                for ci, v in enumerate(vals, 1):
                    c = ws.cell(row=row_num, column=ci, value=v)
                    c.alignment = Alignment(wrap_text=True, vertical="top")
                    if alt_fill: c.fill = alt_fill

                # Guardar cada 50 filas + actualizar checkpoint
                if catalogados_lote % 50 == 0:
                    wb.save(excel_file)
                    _save_checkpoint(chk_file,
                                     len(ya_catalogados),
                                     fecha, remitente, asunto)
                    log_err(f"[CHECKPOINT] 💾 Guardado en correo #{len(ya_catalogados)} — puedes apagar la máquina.")

                emit({
                    "type": "email_progress",
                    "index": row_num - 1,
                    "total": total_estimado,
                    "email": {
                        "id": str(i), "fecha": fecha, "remitente": remitente,
                        "asunto": asunto, "tipo": "Inventario",
                        "monto": "—", "tamaño": "Sí" if tiene_adj else "No",
                        "adjuntos_count": 1 if tiene_adj else 0, "fallido": False
                    }
                })

                if catalogados_lote % 100 == 0:
                    log_err(f"[INVENTARIO] 📋 {row_num-1} catalogados | Saltados: {saltados} | Lote actual: {catalogados_lote}")

                # Parar si alcanzamos el límite de lote
                if catalogados_lote >= batch_size:
                    log_err(f"[INVENTARIO] 🛑 Lote de {batch_size} completado. Guarda el Excel y relanza para continuar.")
                    break

                try: selected.click(position={"x": 5, "y": 5}, force=True)
                except: pass
                page.keyboard.press("ArrowDown")
                time.sleep(0.35)  # ← Rápido: solo metadata, no descarga

            wb.save(excel_file)
            # Checkpoint final del lote
            if ya_catalogados:
                ultimo = list(ya_catalogados)[-1] if ya_catalogados else ("", "", "")
                _save_checkpoint(chk_file, len(ya_catalogados), ultimo[0], ultimo[1], ultimo[2])
            log_err(f"[INVENTARIO] ✅ Lote terminado. Total acumulado: {len(ya_catalogados)} | Este lote: {catalogados_lote}")
            log_err(f"[INVENTARIO] 💡 Próxima sesión reanudará automáticamente desde correo #{len(ya_catalogados)}")
            emit({
                "type": "done", "success": True,
                "excel_path": excel_file,
                "procesados": catalogados_lote,
                "total_acumulado": len(ya_catalogados),
                "seleccionados": 0,
                "mode": "inventario",
                "checkpoint": chk_file
            })

        except Exception as e:
            # Guardar checkpoint de emergencia si hay error
            if ya_catalogados:
                try:
                    ultimo = list(ya_catalogados)[-1]
                    _save_checkpoint(chk_file, len(ya_catalogados), ultimo[0], ultimo[1], ultimo[2])
                    log_err(f"[CHECKPOINT] 🚨 Checkpoint de emergencia guardado en #{len(ya_catalogados)}")
                except:
                    pass
            emit({"type": "done", "success": False, "error": str(e), "trace": traceback.format_exc()})


# ─── ANALIZAR ─────────────────────────────────────────────────────────────────
def analizar_web(email, password, folder_name):
    os.makedirs(PROFILE_DIR, exist_ok=True)
    unlock_profile()  # ← Libera el perfil si Chrome quedó abierto antes
    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            user_data_dir=PROFILE_DIR,
            headless=False,
            args=[
                "--start-maximized", 
                "--safebrowsing-disable-download-protection", 
                "--disable-features=SafeBrowsing"
            ],
            no_viewport=True,
        )
        try:
            page = browser.pages[0] if browser.pages else browser.new_page()
            page.goto("https://outlook.office.com/mail/", wait_until="domcontentloaded")

            # Detectar sesión activa (compatible con ambas versiones de Outlook)
            try:
                page.wait_for_selector(BANDEJA_SELECTOR, timeout=10000)
                log_err("[ANALIZAR] ✅ Sesión activa detectada.")
            except PlaywrightTimeout:
                ok = do_login(page, email, password)
                if not ok:
                    emit({"type": "done", "success": False, "error": "No se pudo acceder a la bandeja."})
                    return

            go_to_folder(page, folder_name)
            time.sleep(3)  # Esperar que cargue la lista

            # En el nuevo Outlook, para contar total, extraemos el número del panel izquierdo si es posible
            count = 100 # Default si no encontramos el número
            try:
                folder_el = page.locator(f'[title="{folder_name}"] span, [aria-label*="{folder_name}"] span').filter(has_text=re.compile(r"^\d+$")).first
                if folder_el.count() > 0:
                    count = int(folder_el.inner_text())
            except:
                pass

            log_err(f"[ANALIZAR] Se estiman {count} correos en la carpeta.")

            # Ocultar banners molestos de Outlook (como "Storage full") que tapan el primer correo
            try:
                page.evaluate('() => { document.querySelectorAll(\'div[role="alert"]\').forEach(e => e.style.display="none"); }')
            except:
                pass

            # Hacemos clic en el primer correo de la lista central
            lista = page.locator(BANDEJA_SELECTOR).first
            primer_correo = lista.locator('div[role="option"], div[role="row"]').first
            if primer_correo.count() > 0:
                primer_correo.scroll_into_view_if_needed()
                primer_correo.click(force=True)
                time.sleep(1.5)

            emails_list = []
            procesados = set()
            
            # Recorrer los primeros 50 correos para la previsualización usando Flecha Abajo
            for i in range(min(count, 50)):
                lista = page.locator(BANDEJA_SELECTOR).first
                selected = lista.locator('div[role="option"][aria-selected="true"], div[role="row"][aria-selected="true"]').first
                if selected.count() == 0:
                    break
                
                texto_fila = selected.inner_text()
                if texto_fila in procesados:
                    break # Llegamos al final o se atascó
                procesados.add(texto_fila)

                try:
                    lineas = [x.strip() for x in texto_fila.split("\n") if x.strip()]
                    emails_list.append({
                        "id": str(i),
                        "remitente": lineas[0] if len(lineas) > 0 else "Desconocido",
                        "asunto":    lineas[1] if len(lineas) > 1 else "Sin Asunto",
                        "fecha":     lineas[-1] if len(lineas) > 2 else "",
                        "tamaño":    "~1 MB"
                    })
                except Exception:
                    pass
                
                try:
                    selected.focus()
                except:
                    pass
                page.keyboard.press("ArrowDown")
                time.sleep(0.5)

            emit({
                "type": "done",
                "success": True,
                "emails": emails_list,
                "totalCount": count,
                "totalSizeStr": f"~{max(count, 1)} MB estimados",
                "folder": folder_name
            })

            log_err("[ANALIZAR] ✅ Proceso terminado. Sesión guardada.")

        except Exception as e:
            emit({"type": "done", "success": False, "error": str(e), "trace": traceback.format_exc()})


# ─── EXTRAER (streaming por correo) ──────────────────────────────────────────
def extraer_web(email, password, folder_name, download_path, api_key, solo_adjuntos=False, mode="extraer", batch_size=500):
    os.makedirs(PROFILE_DIR, exist_ok=True)
    os.makedirs(download_path, exist_ok=True)

    excel_file = os.path.join(download_path, "Historial_Correos_Descargados.xlsx")
    wb, ws, last_row, historial_descargados = crear_excel(excel_file)
    row_num = last_row  # Inicia desde el final del excel (1 si es nuevo)
    correos_fallidos = []
    seleccionados_count = 0

    unlock_profile()  # ← Libera el perfil si Chrome quedó abierto antes
    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            user_data_dir=PROFILE_DIR,
            headless=False,
            args=[
                "--start-maximized", 
                "--safebrowsing-disable-download-protection", 
                "--disable-features=SafeBrowsing"
            ],
            no_viewport=True,
        )
        try:
            page = browser.pages[0] if browser.pages else browser.new_page()
            page.goto("https://outlook.office.com/mail/", wait_until="domcontentloaded")

            try:
                page.wait_for_selector(BANDEJA_SELECTOR, timeout=10000)
                log_err("[EXTRAER] ✅ Sesión activa detectada.")
            except PlaywrightTimeout:
                ok = do_login(page, email, password)
                if not ok:
                    emit({"type": "done", "success": False, "error": "No se pudo acceder a la bandeja."})
                    return

            go_to_folder(page, folder_name)
            time.sleep(3)  # Esperar que cargue la lista

            # --- FILTRAR SOLO ADJUNTOS SI ESTÁ ACTIVO ---
            if solo_adjuntos:
                log_err("[EXTRAER] 🔍 Aplicando filtro: Solo correos con adjuntos...")
                # Buscar el botón de filtro de forma más amplia (puede no ser un <button>)
                filtro_btn = page.locator('[aria-label="Filter"], [title="Filter"], [aria-label="Filtro"], [title="Filtro"], i[data-icon-name="Filter"]').first
                if filtro_btn.count() > 0:
                    filtro_btn.click(force=True)
                    time.sleep(1.5)
                    # El texto "Has files"/"Tiene archivos adjuntos" vive en un
                    # <span> plano sin role/aria-label/name (verificado en vivo) -
                    # el selector por atributos de arriba nunca puede matchear
                    # ahi. Se busca por el texto visible directamente en su
                    # lugar (asi es como lo encontraria un click real).
                    has_files_btn = page.get_by_text(re.compile(r"^(Has files|Tiene archivos adjuntos)$", re.IGNORECASE)).first
                    if has_files_btn.count() > 0:
                        has_files_btn.click(force=True)
                        time.sleep(3.0) # Esperar a que se actualice la lista
                        log_err("[EXTRAER] ✅ Filtro de adjuntos aplicado exitosamente.")
                    else:
                        log_err("[EXTRAER] ⚠ No se encontró la opción 'Has files' en el menú de filtro.")
                        page.keyboard.press("Escape")
                        emit({"type": "done", "success": False, "error": "No se pudo activar el filtro de adjuntos en la vista actual de Outlook. Abortando extracción."})
                        return
                else:
                    log_err("[EXTRAER] ⚠ No se encontró el botón de Filtro en la barra superior.")
                    emit({"type": "done", "success": False, "error": "No se pudo encontrar el botón de Filtro. Abortando extracción para evitar descarga masiva."})
                    return

            # Extraer cantidad total de correos del panel izquierdo si es posible
            total_estimado = 63807  # ← valor real de la carpeta 10.10.2023 (se sobreescribe si Outlook lo informa)
            try:
                folder_el = page.locator(f'[title="{folder_name}"] span, [aria-label*="{folder_name}"] span').filter(has_text=re.compile(r"^\d+$")).first
                if folder_el.count() > 0:
                    total_estimado = int(folder_el.inner_text())
            except:
                pass

            log_err(f"[EXTRAER] Iniciando extracción de ~{total_estimado} correos → {excel_file} | Lote: {batch_size}")

            emit({"type": "start", "total": total_estimado, "excel_path": excel_file})

            # Ocultar banners molestos de Outlook que interceptan clics
            try:
                page.evaluate('() => { document.querySelectorAll(\'div[role="alert"]\').forEach(e => e.style.display="none"); }')
            except:
                pass

            # Hacemos clic en el primer correo central
            lista = page.locator(BANDEJA_SELECTOR).first
            primer_correo = lista.locator('div[role="option"], div[role="row"]').first
            if primer_correo.count() > 0:
                primer_correo.scroll_into_view_if_needed()
                primer_correo.click(force=True)
                time.sleep(1.5)

            procesados = set()
            correos_en_lote = 0
            _banner_oculto_count = 0  # contador para re-ocultar el banner cada 50 correos
            break_lote = False
            _recargas_dom = 0  # Contador de recargas de carpeta por scroll exhausted
            MAX_RECARGAS = 500  # Límite de seguridad (500 recargas × ~60K correos)

            # Bucle: se detiene al terminar todos los correos o al alcanzar batch_size
            for i in range(200000):
                if break_lote:
                    break
                pause_file = os.path.join(PROFILE_DIR, "pause.lock")
                if os.path.exists(pause_file):
                    log_err("[PAUSA] ⏸️ Bot en pausa. Puedes revisar o eliminar correos.")
                    while os.path.exists(pause_file):
                        time.sleep(1.5)
                    log_err("[PAUSA] ▶️ Reanudando selección...")
                    time.sleep(1.5)

                # Re-ocultar el banner de buzón lleno cada 50 correos (reaparece solo)
                _banner_oculto_count += 1
                if _banner_oculto_count % 50 == 0:
                    try:
                        page.evaluate('() => { document.querySelectorAll(\'div[role="alert"]\').forEach(e => e.style.display="none"); }')
                    except:
                        pass

                # Cerrar popup de "Reminders" que bloquea los clics
                try:
                    reminders_btn = page.locator('button[title="Dismiss all"], button[aria-label="Dismiss all"], button[title="Descartar todo"]').first
                    if reminders_btn.is_visible(timeout=100):
                        reminders_btn.click(force=True)
                        log_err("[DOWNLOAD] 🧹 Popup de Reminders cerrado.")
                except:
                    pass

                lista = page.locator(BANDEJA_SELECTOR).first
                selected = lista.locator('div[role="option"][aria-selected="true"], div[role="row"][aria-selected="true"]').first
                if selected.count() == 0:
                    # Scroll virtual: puede tardar en cargar el siguiente bloque
                    for _wait in range(10):
                        try:
                            page.evaluate("""
                                () => {
                                    const sel = [
                                        'div[aria-label="Lista de mensajes"]',
                                        'div[aria-label="Message list"]',
                                        'div[aria-label="Mail list"]',
                                        '[data-testid="MailList"]'
                                    ];
                                    for (const s of sel) {
                                        const el = document.querySelector(s);
                                        if (el) { el.scrollTop += el.clientHeight * 0.75; break; }
                                    }
                                }
                            """)
                        except:
                            pass
                        page.keyboard.press("PageDown" if _wait % 2 == 0 else "ArrowDown")
                        time.sleep(1.0 + _wait * 0.4)
                        selected = lista.locator('div[role="option"][aria-selected="true"], div[role="row"][aria-selected="true"]').first
                        if selected.count() > 0:
                            log_err(f"[EXTRAER] 🔄 Nuevo bloque cargado (intento {_wait+1})")
                            break
                    if selected.count() == 0:
                        # ── Scroll virtual agotado: Outlook no carga más en el DOM ──
                        # Solución: recargar la carpeta para que Outlook vuelva al inicio
                        # El bot saltará los ya procesados automáticamente (historial_descargados)
                        _recargas_dom += 1
                        if _recargas_dom > MAX_RECARGAS:
                            log_err(f"[EXTRAER] 🏁 Límite de recargas DOM alcanzado ({MAX_RECARGAS}). Proceso terminado.")
                            break_lote = True
                            break
                        log_err(f"[EXTRAER] ♻️ DOM agotado — Recargando carpeta para continuar ({_recargas_dom}/{MAX_RECARGAS})...")
                        log_err(f"[EXTRAER] 📊 Estado actual: {correos_en_lote} descargados | {len(historial_descargados)} en Excel | {len(procesados)} vistos en esta sesión")
                        # Navegar a la carpeta de nuevo (Outlook recarga el scroll desde el principio)
                        try:
                            page.goto("https://outlook.office.com/mail/", wait_until="domcontentloaded")
                            time.sleep(2)
                            go_to_folder(page, folder_name)
                            time.sleep(3)
                            # Ocultar banners de nuevo
                            try:
                                page.evaluate('() => { document.querySelectorAll(\'div[role="alert"]\').forEach(e => e.style.display="none"); }')
                            except:
                                pass
                            # Hacer clic en el primer correo y resetear el set de procesados (DOM nuevo)
                            lista_nueva = page.locator(BANDEJA_SELECTOR).first
                            primer = lista_nueva.locator('div[role="option"], div[role="row"]').first
                            if primer.count() > 0:
                                primer.scroll_into_view_if_needed()
                                primer.click(force=True)
                                time.sleep(1.5)
                            procesados = set()  # Reset: el DOM es nuevo, hay que recorrerlo de nuevo
                            log_err(f"[EXTRAER] ✅ Carpeta recargada. Continuando extracción (los ya descargados se saltarán automáticamente)...")
                            continue
                        except Exception as reload_err:
                            log_err(f"[EXTRAER] ⚠ Error al recargar carpeta: {reload_err}. Terminando.")
                            break_lote = True
                            break
                
                texto_fila = selected.inner_text()
                
                # Filtrar basura de la UI de Outlook (etiquetas ocultas de Accesibilidad)
                lineas_crudas = [x.strip() for x in texto_fila.split("\n") if x.strip()]
                ui_words = ["unread", "no leído", "has attachments", "contiene datos adjuntos", "pinned", "chincheta", "replied", "respondido", "forwarded", "reenviado"]
                lineas_limpias = [l for l in lineas_crudas if l.lower() not in ui_words and len(l) > 1]

                if not lineas_limpias:
                    # Fila cargando o fantasma, pasamos a la siguiente
                    try:
                        selected.click(position={"x": 5, "y": 5}, force=True)
                    except:
                        pass
                    page.keyboard.press("ArrowDown")
                    time.sleep(1.0)
                    continue

                if texto_fila in procesados:
                    # Mismo fix robusto que inventario: 10 reintentos con scroll CSS + espera creciente
                    avanzado = False
                    for intento in range(10):
                        try:
                            page.evaluate("""
                                () => {
                                    const sel = [
                                        'div[aria-label="Lista de mensajes"]',
                                        'div[aria-label="Message list"]',
                                        'div[aria-label="Mail list"]',
                                        '[data-testid="MailList"]'
                                    ];
                                    for (const s of sel) {
                                        const el = document.querySelector(s);
                                        if (el) { el.scrollTop += el.clientHeight * 0.75; break; }
                                    }
                                }
                            """)
                        except:
                            pass
                        if intento % 2 == 0:
                            try: lista.focus()
                            except: pass
                            page.keyboard.press("PageDown")
                        else:
                            try:
                                lista.focus()
                                selected.click(force=True)
                            except: pass
                            page.keyboard.press("ArrowDown")
                        time.sleep(0.8 + intento * 0.5)
                        lista = page.locator(BANDEJA_SELECTOR).first
                        sel2 = lista.locator('div[role="option"][aria-selected="true"], div[role="row"][aria-selected="true"]').first
                        if sel2.count() > 0:
                            nuevo = sel2.inner_text()
                            if nuevo not in procesados:
                                texto_fila = nuevo
                                avanzado = True
                                log_err(f"[EXTRAER] 🔄 Nuevo bloque cargado en extraer (intento {intento+1})")
                                break
                    if not avanzado:
                        # ── DOM agotado en medio de correos repetidos: recargar carpeta ──
                        _recargas_dom += 1
                        if _recargas_dom > MAX_RECARGAS:
                            log_err(f"[EXTRAER] 🏁 Límite de recargas DOM alcanzado ({MAX_RECARGAS}). Proceso terminado.")
                            break_lote = True
                            break
                        log_err(f"[EXTRAER] ♻️ DOM bloqueado — Recargando carpeta para desbloquear ({_recargas_dom}/{MAX_RECARGAS})...")
                        log_err(f"[EXTRAER] 📊 Estado: {correos_en_lote} descargados | {len(historial_descargados)} en Excel total")
                        try:
                            page.goto("https://outlook.office.com/mail/", wait_until="domcontentloaded")
                            time.sleep(2)
                            go_to_folder(page, folder_name)
                            time.sleep(3)
                            try:
                                page.evaluate('() => { document.querySelectorAll(\'div[role="alert"]\').forEach(e => e.style.display="none"); }')
                            except:
                                pass
                            lista_nueva = page.locator(BANDEJA_SELECTOR).first
                            primer = lista_nueva.locator('div[role="option"], div[role="row"]').first
                            if primer.count() > 0:
                                primer.scroll_into_view_if_needed()
                                primer.click(force=True)
                                time.sleep(1.5)
                            procesados = set()  # Reset DOM
                            log_err(f"[EXTRAER] ✅ Carpeta recargada. Los descargados se saltarán automáticamente.")
                            continue
                        except Exception as reload_err:
                            log_err(f"[EXTRAER] ⚠ Error al recargar: {reload_err}. Terminando.")
                            break_lote = True
                            break

                    lineas_crudas = [x.strip() for x in texto_fila.split("\n") if x.strip()]
                    lineas_limpias = [l for l in lineas_crudas if l.lower() not in ui_words and len(l) > 1]
                    if not lineas_limpias:
                        continue
                
                procesados.add(texto_fila)

                try:
                    remitente = lineas_limpias[0] if len(lineas_limpias) > 0 else "Desconocido"
                    asunto    = lineas_limpias[1] if len(lineas_limpias) > 1 else "Sin Asunto"
                    
                    # Extraer fecha buscando el texto corto con números (para evitar capturar el cuerpo)
                    fecha = "Reciente"
                    for line in reversed(lineas_limpias):
                        if re.search(r'\d', line) and len(line) < 30:
                            fecha = line
                            break
                            
                    # VERIFICAR SI ESTE CORREO YA ESTÁ EN EL EXCEL (REANUDACIÓN)
                    if mode == "seleccionar":
                        if (fecha, remitente, asunto) in historial_descargados:
                            try:
                                # Buscar el checkbox o avatar para seleccionarlo
                                checkbox = selected.locator('div[role="checkbox"], i[data-icon-name="StatusCircleCheckmark"], div.ms-Persona-coin').first
                                if checkbox.count() > 0:
                                    checkbox.click(force=True)
                                    seleccionados_count += 1
                                    log_err(f"[SELECCIONAR] ✅ Marcado ({seleccionados_count}): {asunto[:40]}...")
                            except:
                                pass
                        else:
                            log_err(f"[IGNORAR] ❌ Fallido/Nuevo, ignorando: {asunto[:40]}...")
                            
                        # Mover al siguiente sin extraer nada
                        try:
                            selected.click(position={"x": 5, "y": 5}, force=True)
                        except:
                            pass
                        page.keyboard.press("ArrowDown")
                        time.sleep(0.3)
                        continue
                    elif mode == "eliminar":
                        if (fecha, remitente, asunto) in historial_descargados:
                            numero_excel = historial_descargados[(fecha, remitente, asunto)]
                            seleccionados_count += 1
                            log_err(f"[VERIFICADO] 📊 En Excel (N° {numero_excel}) → 🗑️ Eliminando {seleccionados_count}: {asunto[:40]}...")
                            page.keyboard.press("Delete")
                            time.sleep(1.2) # Outlook auto-selecciona el siguiente al borrar
                            continue
                        else:
                            log_err(f"[IGNORAR] ❌ No está en Excel (Fallido/Nuevo) → ⏭️ Saltando: {asunto[:40]}...")
                            try:
                                selected.click(position={"x": 5, "y": 5}, force=True)
                            except:
                                pass
                            page.keyboard.press("ArrowDown")
                            time.sleep(0.4)
                            continue
                    else:
                        if (fecha, remitente, asunto) in historial_descargados:
                            log_err(f"[SALTAR] ⏭️ Correo ya existe en Excel: {asunto[:40]}...")
                            try:
                                selected.click(position={"x": 5, "y": 5}, force=True)
                            except:
                                pass
                            page.keyboard.press("ArrowDown")
                            time.sleep(0.1)  # Optimizado para reanudar más rápido (antes 0.4s)
                            continue
                        
                    fecha_ext = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                    # Crear prefijo único para este correo
                    safe_title = re.sub(r'[\\/*?:"<>|]', "", asunto).strip()[:40]
                    safe_title = safe_title if safe_title else "Correo"
                    prefix_name = f"{row_num:03d}_{safe_title}"
                    email_dir = download_path # Ahora guardamos todo en la ruta principal

                    # Asegurarse de que el correo esté seleccionado haciendo click en el centro (evitando el avatar)
                    try:
                        selected.click(force=True)
                        time.sleep(0.5)
                        page.keyboard.press("Enter")
                        time.sleep(1.0)
                    except:
                        pass

                    # Descargar MSG
                    msg_filename = descargar_msg(page, email_dir, row_num, safe_title)

                    # Extraer cuerpo y Destinatarios del panel de lectura
                    cuerpo_completo = ""
                    destinatario = "—"
                    cc = "—"
                    url_web = page.url
                    try:
                        rp = page.locator('div[aria-label="Reading Pane"], div[aria-label="Panel de lectura"]').first
                        bl = rp.locator('div[aria-label="Cuerpo del mensaje"], div[aria-label="Message body"], div.AllowTextSelection')
                        if bl.count() > 0:
                            cuerpo_completo = bl.first.inner_text()[:32000]
                            
                        # Extraer Destinatario y CC con Regex avanzado (Multiline) para evitar falsos positivos
                        try:
                            rp_text = rp.inner_text()
                            
                            # Patrón para detener la captura cuando encuentre otro campo o una fecha
                            stop_to = r'\n\s*(?:Cc|Bcc|Asunto|Subject|Date|Enviado|From|De|Para|To):\s*|\n\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Lun|Mar|Mie|Mié|Jue|Vie|Sab|Sáb|Dom)[a-z,]*\s+\d{1,4}[-/]\d{1,2}'
                            stop_cc = r'\n\s*(?:Bcc|Asunto|Subject|Date|Enviado|From|De|Para|To):\s*|\n\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Lun|Mar|Mie|Mié|Jue|Vie|Sab|Sáb|Dom)[a-z,]*\s+\d{1,4}[-/]\d{1,2}'
                            
                            m_to = re.search(r'(?i)(?:To|Para):\s*([\s\S]+?)(?=' + stop_to + r'|$)', rp_text)
                            if m_to: 
                                val = m_to.group(1).replace("\n", " ").replace("\r", " ").strip()
                                destinatario = " ".join(val.split())[:150]
                                
                            m_cc = re.search(r'(?i)Cc:\s*([\s\S]+?)(?=' + stop_cc + r'|$)', rp_text)
                            if m_cc: 
                                val = m_cc.group(1).replace("\n", " ").replace("\r", " ").strip()
                                cc = " ".join(val.split())[:150]
                            
                            # Si la fecha de la lista falló, intentar extraerla del panel de lectura
                            if fecha == "Reciente":
                                header_lines = [x.strip() for x in rp_text.split('\n') if x.strip()]
                                for line in header_lines:
                                    if re.search(r'\d{1,2}:\d{2}', line) and len(line) < 40:
                                        fecha = line
                                        break
                        except:
                            pass
                    except Exception:
                        pass

                    # Descargar adjuntos (archivos extra del correo, ademas del .eml)
                    #
                    # Verificado en vivo: Outlook Web NO expone ningun boton
                    # con "download"/"descargar" en su aria-label/title en esta
                    # vista (por eso este bloque siempre fallaba en silencio y
                    # el contador "Con Adjuntos" quedaba en 0 aunque el correo
                    # SI tuviera adjuntos). Los adjuntos viven en
                    # div[role="listbox"][aria-label="file attachments"], cada
                    # uno como [role="option"], y la unica forma de bajarlos
                    # es clic derecho > "Download" en el menu contextual -
                    # mismo patron que ya usa descargar_msg() para el correo
                    # completo.
                    lista_adjuntos = []
                    try:
                        listbox_adj = page.locator(
                            'div[role="listbox"][aria-label="file attachments"], '
                            'div[role="listbox"][aria-label*="adjunt" i]'
                        ).first
                        # El listbox de adjuntos puede tardar un poco mas que
                        # el resto del panel de lectura en poblarse - esperar
                        # a que su primer chip aparezca antes de listar
                        # opciones, en vez de confiar en el sleep general de
                        # arriba (mismo tipo de bug de timing que en el menu
                        # EML/MSG y en el filtro de "Has files").
                        try:
                            listbox_adj.locator('[role="option"]').first.wait_for(state="visible", timeout=4000)
                        except PlaywrightTimeout:
                            pass
                        if listbox_adj.count() > 0:
                            opciones_adj = listbox_adj.locator('[role="option"]').all()
                            for op in opciones_adj:
                                try:
                                    if not op.is_visible():
                                        continue
                                    op.click(button="right", force=True)
                                    time.sleep(0.8)
                                    dl_item = page.locator('[role="menuitem"]').filter(
                                        has_text=re.compile(r"(Download|Descargar)", re.IGNORECASE)
                                    ).first
                                    dl_item.wait_for(state="visible", timeout=3000)

                                    with page.expect_download(timeout=8000) as dl_info:
                                        dl_item.click(force=True)
                                    dl = dl_info.value
                                    fname = f"{prefix_name}_{dl.suggested_filename}"
                                    dl.save_as(os.path.join(email_dir, fname))
                                    lista_adjuntos.append(fname)
                                except Exception:
                                    page.keyboard.press("Escape")
                                    time.sleep(0.3)
                                    continue
                    except Exception:
                        pass

                    # --- Agregar Icono de Clip al archivo EML si tiene adjuntos ---
                    if len(lista_adjuntos) > 0:
                        prefix_name = f"{row_num:03d}_📎_{safe_title}"
                        try:
                            # Renombrar MSG/EML directamente en la carpeta
                            if msg_filename and msg_filename != "—":
                                msg_old_path = os.path.join(email_dir, msg_filename)
                                nuevo_msg = msg_filename.replace(f"{row_num:03d}_", f"{row_num:03d}_📎_")
                                msg_new_path = os.path.join(email_dir, nuevo_msg)
                                if os.path.exists(msg_old_path):
                                    os.rename(msg_old_path, msg_new_path)
                                msg_filename = nuevo_msg
                        except Exception as e:
                            log_err(f"[EXTRAER] No se pudo renombrar el archivo con clip: {e}")


                    texto_comb = (asunto + " " + cuerpo_completo).lower()
                    tipo       = detectar_tipo(texto_comb)
                    monto      = extraer_monto(cuerpo_completo)

                    enlace_archivo = "Sin Archivo"
                    if msg_filename and msg_filename != "—":
                        ruta_completa = os.path.join(email_dir, msg_filename)
                        enlace_archivo = f"HYPERLINK|{ruta_completa}|📥 Abrir Correo"

                    row_data = {
                        "enlace_local": enlace_archivo,
                        "enlace_web": f"HYPERLINK|{url_web}|🌐 Ver en Outlook Web",
                        "fecha_extraccion": fecha_ext,
                        "fecha_correo": fecha,
                        "remitente":   remitente,
                        "destinatario": destinatario,
                        "asunto":      asunto,
                        "carpeta":     prefix_name,
                        "adjuntos":    ", ".join(lista_adjuntos) if lista_adjuntos else "Ninguno",
                        "monto":       monto,
                        "cuerpo_completo": cuerpo_completo,
                        "cc":          cc,
                        "responsable": remitente,
                        "tipo_activo": tipo,
                    }

                    append_row_excel(wb, ws, excel_file, row_num, row_data)
                    
                    # Registrar si el MSG no se descargó
                    if not msg_filename or msg_filename == "—":
                        correos_fallidos.append(row_data)
                        
                    row_num += 1
                    correos_en_lote += 1

                    # Detener si alcanzamos el límite de lote
                    if batch_size > 0 and correos_en_lote >= batch_size:
                        log_err(f"[EXTRAER] 🛑 Lote de {batch_size} completado. Relanza para continuar desde donde quedó.")
                        wb.save(excel_file)
                        emit({"type": "email_progress", "index": row_num - 1, "total": total_estimado, "email": {"id": str(i), "fecha": fecha, "remitente": remitente, "asunto": asunto, "tipo": tipo, "monto": monto, "tamaño": "lote", "adjuntos_count": 0, "fallido": False}})
                        break_lote = True
                        break

                    emit({
                        "type":    "email_progress",
                        "index":   row_num - 1,
                        "total":   total_estimado,
                        "email": {
                            "id":        str(i),
                            "fecha":     fecha,
                            "remitente": remitente,
                            "asunto":    asunto,
                            "tipo":      tipo,
                            "monto":     monto,
                            "tamaño":    f"{len(lista_adjuntos)} adjuntos" if lista_adjuntos else "~1 MB",
                            "adjuntos_count": len(lista_adjuntos),
                            "enlace_web": url_web,
                            "fallido":   True if (not msg_filename or msg_filename == "—") else False
                        }
                    })

                    log_err(f"[EXTRAER] 📧 [{row_num-1}/~{total_estimado}] 🕒 {fecha} | {remitente} — {asunto}")
                    log_err(f"[EXTRAER] [{row_num-1}/~{total_estimado}] Carpeta: {folder_name}")

                except Exception as ex:
                    log_err(f"[EXTRAER] ⚠ Error en correo {row_num-1}: {ex}")

                if break_lote:
                    break

                # Pasar al siguiente correo - Forzamos el click en el correo actual para evitar perder el teclado
                try:
                    selected.click(position={"x": 5, "y": 5}, force=True)
                except:
                    pass
                page.keyboard.press("ArrowDown")
                time.sleep(1.2) # Dar tiempo a que renderice y cargue el cuerpo

            # Generar reporte de fallidos en hoja 2 siempre
            try:
                ws_fallidos = wb.create_sheet(title="No Descargados")
                if correos_fallidos:
                    headers = list(correos_fallidos[0].keys())
                    
                    # Encabezados
                    for col, header in enumerate(headers, 1):
                        cell = ws_fallidos.cell(row=1, column=col, value=header)
                        cell.font = Font(bold=True)
                        cell.fill = PatternFill(start_color="FF9999", end_color="FF9999", fill_type="solid")
                        
                    # Filas
                    for r_idx, row_data in enumerate(correos_fallidos, 2):
                        for c_idx, key in enumerate(headers, 1):
                            ws_fallidos.cell(row=r_idx, column=c_idx, value=row_data[key])
                            
                    wb.save(excel_file)
                    log_err(f"[EXTRAER] 📄 Se generó la hoja 'No Descargados' con {len(correos_fallidos)} correos.")
                else:
                    ws_fallidos.cell(row=1, column=1, value="No hubo correos fallidos.")
                    wb.save(excel_file)
            except Exception as e:
                log_err(f"[EXTRAER] No se pudo guardar la hoja de fallidos: {e}")

            # Generar hoja de Resumen General
            try:
                ws_resumen = wb.create_sheet(title="Resumen")
                # Estilos
                header_font = Font(bold=True, color="FFFFFF")
                header_fill = PatternFill("solid", fgColor="4F81BD")
                
                # Datos del resumen
                total_procesados = row_num - 1
                total_fallidos = len(correos_fallidos)
                
                # Recalcular con y sin adjuntos leyendo las filas (ya que no guardamos contador global aquí)
                con_adjuntos = 0
                sin_adjuntos = 0
                for row in ws.iter_rows(min_row=2, max_row=ws.max_row, values_only=True):
                    # La columna I (índice 8) es "Archivos Descargados"
                    if row[8] and row[8] != "Ninguno":
                        con_adjuntos += 1
                    else:
                        sin_adjuntos += 1

                stats_data = [
                    ("Métrica", "Valor"),
                    ("Total Correos Procesados", total_procesados),
                    ("Mensajes con Adjuntos", con_adjuntos),
                    ("Mensajes sin Adjuntos", sin_adjuntos),
                    ("Correos No Descargados (Fallos MSG)", total_fallidos)
                ]

                for r_idx, row_data in enumerate(stats_data, 1):
                    ws_resumen.cell(row=r_idx, column=1, value=row_data[0])
                    ws_resumen.cell(row=r_idx, column=2, value=row_data[1])
                    if r_idx == 1:
                        ws_resumen.cell(row=1, column=1).font = header_font
                        ws_resumen.cell(row=1, column=1).fill = header_fill
                        ws_resumen.cell(row=1, column=2).font = header_font
                        ws_resumen.cell(row=1, column=2).fill = header_fill

                ws_resumen.column_dimensions["A"].width = 40
                ws_resumen.column_dimensions["B"].width = 15
                wb.save(excel_file)
                log_err("[EXTRAER] 📊 Hoja 'Resumen' generada exitosamente.")
            except Exception as e:
                log_err(f"[EXTRAER] No se pudo generar la hoja de resumen: {e}")

            emit({
                "type":       "done",
                "success":    True,
                "excel_path": excel_file,
                "procesados": row_num - 1,
                "seleccionados": seleccionados_count
            })

            if mode == "seleccionar":
                log_err("[EXTRAER] ⏸️ Selección completa. El navegador quedará abierto para que puedas eliminar los correos.")
                log_err("[EXTRAER] 🛑 Presiona 'Detener Proceso' en la interfaz cuando termines.")
                while True:
                    time.sleep(1)
            else:
                log_err("[EXTRAER] ✅ Extracción completa. El navegador se cerrará automáticamente.")

        except StopIteration as si:
            if str(si) == "lote_completo":
                emit({
                    "type": "done", "success": True,
                    "excel_path": excel_file,
                    "procesados": correos_en_lote,
                    "seleccionados": seleccionados_count,
                    "msg": f"Lote de {batch_size} completado. Relanza el bot para continuar."
                })
                log_err(f"[EXTRAER] ✅ Lote completado: {correos_en_lote} correos procesados.")
            else:
                emit({"type": "done", "success": False, "error": str(si)})
        except Exception as e:
            emit({"type": "done", "success": False, "error": str(e), "trace": traceback.format_exc()})


# ─── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) < 5:
        emit({"type": "done", "success": False, "error": "Uso: agente_correo.py <action> <email> <password> <folder> [download_path] [batch_size]"})
        sys.exit(1)

    action      = sys.argv[1]
    email_arg   = sys.argv[2]
    password    = sys.argv[3]
    folder_name = sys.argv[4]

    if action == "analizar":
        analizar_web(email_arg, password, folder_name)
    elif action == "inventario":
        dl_path    = sys.argv[5] if len(sys.argv) > 5 else r"C:\Correos"
        batch      = int(sys.argv[6]) if len(sys.argv) > 6 else 2000
        start_from = int(sys.argv[7]) if len(sys.argv) > 7 else 0
        inventario_web(email_arg, password, folder_name, dl_path, batch, start_from)
    elif action == "extraer":
        dl_path  = sys.argv[5] if len(sys.argv) > 5 else r"C:\Correos"
        api_k    = sys.argv[6] if len(sys.argv) > 6 else ""
        solo_adj = (sys.argv[7].lower() == 'true') if len(sys.argv) > 7 else False
        batch    = int(sys.argv[8]) if len(sys.argv) > 8 else 500
        extraer_web(email_arg, password, folder_name, dl_path, api_k, solo_adj, mode="extraer", batch_size=batch)
    elif action == "seleccionar":
        dl_path = sys.argv[5] if len(sys.argv) > 5 else r"C:\Correos"
        api_k   = sys.argv[6] if len(sys.argv) > 6 else ""
        extraer_web(email_arg, password, folder_name, dl_path, api_k, False, mode="seleccionar")
    elif action == "eliminar":
        dl_path = sys.argv[5] if len(sys.argv) > 5 else r"C:\Correos"
        api_k   = sys.argv[6] if len(sys.argv) > 6 else ""
        extraer_web(email_arg, password, folder_name, dl_path, api_k, False, mode="eliminar")
    else:
        emit({"type": "done", "success": False, "error": f"Acción '{action}' no reconocida."})

