# ═══════════════════════════════════════════════════════════════════
#  SPSA — EXTRACTOR API FRACTTAL ST (Solicitudes)  │  VERSION 4.0
#  Descripción: Extrae Solicitudes de Trabajo desde Fracttal One,
#               traduce estados/prioridades, y sincroniza con
#               Supabase + Google Drive (con fallback resiliente).
# ═══════════════════════════════════════════════════════════════════

import os
import time
import requests
import sys
import pandas as pd
import customtkinter as ctk
import threading
import json
import uuid
import subprocess
from datetime import datetime
from supabase import create_client
from tkinter import filedialog

# ──────────────────────────────────────────────────────────────────
#  CONSTANTES GLOBALES
# ──────────────────────────────────────────────────────────────────
VERSION             = "5.0"
import pathlib as _pathlib
import base64, hashlib, uuid
PATH_CONFIG = str(_pathlib.Path(__file__).parent / "config_st_fracttal.json")

def _get_machine_key():
    """Genera una clave única basada en esta máquina — el config solo funciona aquí."""
    try:
        import platform, socket
        # Combinación de MAC + nombre de máquina + usuario
        mac  = str(uuid.getnode())
        host = socket.gethostname()
        user = os.environ.get("USERNAME", os.environ.get("USER", "bot"))
        seed = f"{mac}_{host}_{user}_SPSA_ST"
        return hashlib.sha256(seed.encode()).digest()[:16]
    except Exception:
        return hashlib.sha256(b"spsa_bot_default_key").digest()[:16]

def _guardar_en_registro(clave: str, valor: str):
    """Guarda una credencial en el registro de Windows (encriptada)."""
    try:
        import winreg
        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER,
                               r"Software\SPSA\BotST")
        enc = _encrypt_config({"v": valor})
        winreg.SetValueEx(key, clave, 0, winreg.REG_BINARY, enc)
        winreg.CloseKey(key)
        return True
    except Exception:
        return False

def _leer_de_registro(clave: str) -> str:
    """Lee una credencial del registro de Windows."""
    try:
        import winreg
        key  = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                              r"Software\SPSA\BotST")
        data, _ = winreg.QueryValueEx(key, clave)
        winreg.CloseKey(key)
        dec = _decrypt_config(data)
        return dec.get("v", "")
    except Exception:
        return ""

def _encrypt_config(data: dict) -> bytes:
    """Encripta el JSON con XOR usando la clave de la máquina."""
    import json
    raw   = json.dumps(data, ensure_ascii=False).encode('utf-8')
    key   = _get_machine_key()
    enc   = bytes([b ^ key[i % len(key)] for i, b in enumerate(raw)])
    return base64.b64encode(enc)

def _decrypt_config(data: bytes) -> dict:
    """Desencripta el JSON."""
    import json
    try:
        enc = base64.b64decode(data)
        key = _get_machine_key()
        raw = bytes([b ^ key[i % len(key)] for i, b in enumerate(enc)])
        return json.loads(raw.decode('utf-8'))
    except Exception:
        return {}
URL_LOGIN           = "https://one.fracttal.com/rpc/login_new"
URL_PROXY           = "https://one.fracttal.com/rpc/proxy"
TAM_BLOQUE_SUP      = 400
TAM_LOTE_DEL        = 1000
MAX_REINTENTOS_API  = 4
MAX_REINTENTOS_SUP  = 5
PAUSAS_API          = [3, 5, 10, 20]
PAUSAS_SUP          = [5, 15, 30, 60, 120]
RENOVAR_TOKEN_SEGS  = 240

TRADUCCION_ESTADOS = {
    'OPEN_STATUS':              'Abierta',
    'CANCEL_STATUS':            'Cancelada',
    'OT_IN_PROCESS':            'OT en Proceso',
    'OT_IN_REVIEW':              'OT en Revisión',
    'SOLVED_WITH_OT_STATUS':    'Resuelta con OT',
    'SOLVED_WITHOUT_OT_STATUS': 'Resuelta sin OT',
    'AGAIN_REQUEST_TODO':       'Vuelto a Solicitar',
    'APPROVED_STATUS':          'Aprobada',
    'REJECTED_STATUS':          'Rechazada',
    'STANDBY_STATUS':           'En Espera',
    'STAND_BY_STATUS':          'En Espera',
    'DONE':                     'Finalizada',
    'PENDING':                  'Pendiente',
}

TRADUCCION_PRIORIDADES = {
    'VERY_HIGH': 'Muy Alta',
    'HIGH':      'Alta',
    'MEDIUM':    'Media',
    'LOW':       'Baja',
    'VERY_LOW':  'Muy Baja',
}

MAPEO_COLUMNAS = {
    'id_code':                              'nro_solicitud',
    'wo_folio':                             'orden_de_trabajo',
    'requests_x_status_description':        'estado',
    'description':                          'descripcion',
    'is_urgent':                            'es_urgente',
    'items_description':                    'activo',
    'code_item':                            'codigo_del_activo',
    'parent_description':                   'ubicado_en_o_es_parte_de',
    'date':                                  'fecha_de_creacion',
    'date_incident':                        'fecha_del_incidente',
    'date_maintenance':                     'fecha_programada',
    'date_solution':                        'fecha_cierre_solicitud',
    'date_status':                          'fecha_de_cambio_de_estado',
    'observation':                          'observaciones',
    'requests_x_status_notes':              'nota_cambio_de_estado',
    'costs_center_description':             'centro_de_costo',
    'types_description':                    'grupo',
    'types_1_description':                  'clasificacion_1',
    'types_2_description':                  'clasificacion_2',
    'priorities_description':               'prioridad',
    'rating':                               'calificacion_de_5_niveles',
    'rating_notes':                         'calificacion_notas',
    'accounts_name':                        'creada_por',
    'requested_by':                         'solicitado_por',
    'email_requested_by':                   'email_del_solicitante',
    'requests_x_status_accounts_name':      'actualizado_por',
    'requests_x_key_words_descriptions':    'palabras_clave',
    'id_status':                            'id_del_estado',
    'identifier':                           'referencia',
    'id_related':                           'id_externo',
}

CONFIG_DEFAULTS = {
    "user_fracttal":  "raul.quispe@spsa.pe",
    "pass_fracttal":  "57d28fef1a743f7f0d1403f3dc799804",
    "pass_real":      "Spsa2023*",
    "id_company":     "2635",
    "url_supabase":   "https://zuouxnvcktjhqzlniion.supabase.co",
    "key_supabase":   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84",
    "tabla_supabase": "st_fracttal",
    "path_gdrive":    r"G:\Mi unidad\1.GESTIÓN DE MANTENIMIENTO SPSA\CONSOLIDADO ST-OT\ST FRACTTAL",
    "fec_ini":        "2024-03-01",
    "fec_fin":        datetime.now().strftime("%Y-%m-%d"),
    "hora1":          "08:00",
    "hora2":          "13:00",
    "hora3":          "18:00",
    "modo_supabase":  "UPSERT_POR_OT",
    "modo_auth":      "AUTO",
    "x_version":      "Fracttal/5.8.04 web",
    "token_manual":   (
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImdKUXYybVdtS3hhZGVaRWFJbkp3"
        "UnNEVU54czkwYXZtQWhLaVVUQ2lMYlJJWiIsImlkX2NvbXBhbnkiOjI2MzUsImVtYWlsIjoicmF1"
        "bC5xdWlzcGVAc3BzYS5wZSIsImlkX3NlcnZlciI6IkFNRVJJQ0FOIiwiaWF0IjoxNzgzMTk0Mzg3"
        "LCJleHAiOjE3ODMyMzc1ODd9.GGAzWomXFu-sTHvXsihrv_N6R_xC-KfKMtS893hmoZo"
    ),
    "cookie_manual":  (
        "session=e30=; session.sig=fpR225cqUeq9guW1OtGHu2nsV1Q; "
        "__cf_bm=yUj7S9SPAfN4Wgk4qxfCtuouKSPjxPzGT6nROGucfCE-1783193652.3741143-1.0.1.1-"
        "oGdqqHZfeRYyoaFdHY0hl.jDIuze9tTN5_grTQICrKmitiZZJNLpnq8GmA1YOF3m_M_HCfcDZHmu"
        "bqkpLWNG.zybyiXAJ2oBMqjaITBwi1oZHfHFVn3KsOzHtK7DTQqd"
    ),
}

sesion_web = requests.Session()


# ═══════════════════════════════════════════════════════════════════
#  CALENDARIO MODAL — selector de fecha con CTk nativo
# ═══════════════════════════════════════════════════════════════════
class CalendarioModal(ctk.CTkToplevel):
    """Calendario desplegable construido con CustomTkinter."""

    MESES    = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
    DIAS_SEM = ["Lu","Ma","Mi","Ju","Vi","Sa","Do"]

    def __init__(self, parent, titulo="Selecciona fecha",
                 fecha_inicial=None, callback=None):
        super().__init__(parent)
        self.title(titulo)
        self.geometry("370x370")
        self.resizable(False, False)
        self.attributes("-topmost", True)
        self.grab_set()
        self.callback  = callback
        hoy            = datetime.now()
        self._hoy      = hoy

        if fecha_inicial:
            try:
                dt = datetime.strptime(fecha_inicial, "%Y-%m-%d")
            except Exception:
                dt = hoy
        else:
            dt = hoy

        self._año = dt.year
        self._mes = dt.month
        self._dia = dt.day
        self._btn_dias = {}  # guardar refs a botones de días

        self._build()

    def _build(self):
        import calendar

        # ── FILA 1: navegación mes/año ──
        f_nav = ctk.CTkFrame(self, fg_color="#0d1520", corner_radius=0)
        f_nav.pack(fill="x", padx=0, pady=0)

        ctk.CTkButton(f_nav, text="◀", width=32, height=34,
                      font=("Arial", 14), fg_color="transparent",
                      hover_color="#1a3d61",
                      command=self._mes_ant).pack(side="left", padx=4, pady=4)

        # Dropdown MES
        self.cmb_mes = ctk.CTkOptionMenu(
            f_nav, values=self.MESES, width=130, height=30,
            font=("Consolas", 12, "bold"),
            fg_color="#0a1a2e", button_color="#1a3d61",
            dropdown_fg_color="#0a1118", text_color="#2b9eff",
            command=self._on_mes)
        self.cmb_mes.set(self.MESES[self._mes-1])
        self.cmb_mes.pack(side="left", padx=4, pady=4)

        # Dropdown AÑO
        anios = [str(a) for a in range(2020, self._hoy.year + 3)]
        self.cmb_anio = ctk.CTkOptionMenu(
            f_nav, values=anios, width=80, height=30,
            font=("Consolas", 12, "bold"),
            fg_color="#0a1a2e", button_color="#1a3d61",
            dropdown_fg_color="#0a1118", text_color="#2b9eff",
            command=self._on_anio)
        self.cmb_anio.set(str(self._año))
        self.cmb_anio.pack(side="left", padx=4, pady=4)

        ctk.CTkButton(f_nav, text="▶", width=32, height=34,
                      font=("Arial", 14), fg_color="transparent",
                      hover_color="#1a3d61",
                      command=self._mes_sig).pack(side="right", padx=4, pady=4)

        # ── FILA 2: cabecera días semana ──
        f_sem = ctk.CTkFrame(self, fg_color="#080e18", corner_radius=0)
        f_sem.pack(fill="x")
        for idx, d in enumerate(self.DIAS_SEM):
            color = "#e4a02b" if idx >= 5 else "#666"
            ctk.CTkLabel(f_sem, text=d, width=48, height=24,
                         font=("Consolas", 11, "bold"),
                         text_color=color).pack(side="left")

        # ── FILA 3: grid de días (frame contenedor) ──
        self.f_dias = ctk.CTkFrame(self, fg_color="#080e18", corner_radius=0)
        self.f_dias.pack(fill="x", padx=2, pady=2)

        # ── FILA 4: label seleccionado ──
        self.lbl_sel = ctk.CTkLabel(self,
            text=f"✅ Seleccionado: {self._año}-{self._mes:02d}-{self._dia:02d}",
            font=("Consolas", 11, "bold"), text_color="#00ff44")
        self.lbl_sel.pack(pady=(4,2))

        # ── FILA 5: botones acción ──
        f_btns = ctk.CTkFrame(self, fg_color="transparent")
        f_btns.pack(pady=(2,8))
        ctk.CTkButton(f_btns, text="📅 HOY", width=90, height=34,
                      font=("Consolas", 11, "bold"), fg_color="#00aa33",
                      hover_color="#007722",
                      command=self._ir_hoy).pack(side="left", padx=8)
        ctk.CTkButton(f_btns, text="✅ CONFIRMAR", width=140, height=34,
                      font=("Consolas", 11, "bold"), fg_color="#2b78e4",
                      hover_color="#1a52a3",
                      command=self._confirmar).pack(side="left", padx=8)

        self._dibujar_dias()

    def _dibujar_dias(self):
        import calendar
        # Limpiar grid anterior
        for w in self.f_dias.winfo_children():
            w.destroy()
        self._btn_dias.clear()

        # Actualizar combos
        try:
            self.cmb_mes.set(self.MESES[self._mes-1])
            self.cmb_anio.set(str(self._año))
        except Exception:
            pass

        cal = calendar.monthcalendar(self._año, self._mes)

        for sem_idx, semana in enumerate(cal):
            for dia_idx, dia in enumerate(semana):
                if dia == 0:
                    # celda vacía
                    ctk.CTkLabel(self.f_dias, text="", width=48, height=36,
                                 fg_color="transparent").grid(
                                 row=sem_idx, column=dia_idx, padx=1, pady=1)
                else:
                    es_hoy  = (dia == self._hoy.day and
                               self._mes == self._hoy.month and
                               self._año == self._hoy.year)
                    es_sel  = (dia == self._dia)
                    es_finde = dia_idx >= 5

                    if es_sel:
                        fg, txt = "#2b78e4", "#ffffff"
                    elif es_hoy:
                        fg, txt = "#003d1a", "#00ff44"
                    elif es_finde:
                        fg, txt = "transparent", "#e4a02b"
                    else:
                        fg, txt = "transparent", "#cccccc"

                    btn = ctk.CTkButton(
                        self.f_dias, text=str(dia),
                        width=48, height=36,
                        font=("Consolas", 12, "bold" if es_sel or es_hoy else "normal"),
                        fg_color=fg, hover_color="#1a3d61",
                        text_color=txt, corner_radius=6,
                        command=lambda d=dia: self._sel(d))
                    btn.grid(row=sem_idx, column=dia_idx, padx=1, pady=1)
                    self._btn_dias[dia] = btn

        # Actualizar label
        try:
            self.lbl_sel.configure(
                text=f"✅ Seleccionado: {self._año}-{self._mes:02d}-{self._dia:02d}")
        except Exception:
            pass

    def _sel(self, dia):
        self._dia = dia
        self._dibujar_dias()

    def _mes_ant(self):
        if self._mes == 1: self._mes = 12; self._año -= 1
        else: self._mes -= 1
        self._dibujar_dias()

    def _mes_sig(self):
        if self._mes == 12: self._mes = 1; self._año += 1
        else: self._mes += 1
        self._dibujar_dias()

    def _on_mes(self, val):
        import calendar
        self._mes = self.MESES.index(val) + 1
        max_d = calendar.monthrange(self._año, self._mes)[1]
        if self._dia > max_d: self._dia = max_d
        self._dibujar_dias()

    def _on_anio(self, val):
        import calendar
        self._año = int(val)
        max_d = calendar.monthrange(self._año, self._mes)[1]
        if self._dia > max_d: self._dia = max_d
        self._dibujar_dias()

    def _ir_hoy(self):
        self._año = self._hoy.year
        self._mes = self._hoy.month
        self._dia = self._hoy.day
        self._dibujar_dias()

    def _confirmar(self):
        fecha = f"{self._año}-{self._mes:02d}-{self._dia:02d}"
        if self.callback:
            self.callback(fecha)
        self.destroy()


# ═══════════════════════════════════════════════════════════════════
#  VENTANA DE CONFIGURACIÓN — pestañas: Fracttal / Supabase / Drive
# ═══════════════════════════════════════════════════════════════════
class VentanaConfiguracion(ctk.CTkToplevel):

    SECCIONES = [
        ("🔑", "Credenciales\nFracttal"),
        ("☁️", "Supabase"),
        ("📁", "Google Drive"),
        ("🎫", "Token\nManual"),
    ]

    def __init__(self, parent):
        super().__init__(parent)
        self.parent = parent
        self.title(f"⚙️  CONFIGURACIÓN — ST FRACTTAL V{VERSION}")
        self.geometry("1120x700")
        self.minsize(1000, 620)
        self.resizable(True, True)
        self.grab_set()
        self.campos = {}

        self._build_layout()
        self._build_fields(parent.config)
        self.mostrar_seccion(0)

    # ── Layout principal ────────────────────────────────────────
    def _build_layout(self):
        bar = ctk.CTkFrame(self, height=68, fg_color="#0a1420")
        bar.pack(side="bottom", fill="x")
        bar.pack_propagate(False)
        ctk.CTkButton(bar, text="💾  Guardar y cerrar", height=44, width=260,
                      font=("Arial", 13, "bold"), fg_color="#2b78e4", hover_color="#1a52a3",
                      command=self._guardar_y_cerrar).pack(side="right", padx=22, pady=12)
        ctk.CTkButton(bar, text="Cancelar", height=44, width=120,
                      font=("Arial", 12), fg_color="#2a2a2a", hover_color="#444",
                      command=self.destroy).pack(side="right", padx=6, pady=12)

        body = ctk.CTkFrame(self, fg_color="transparent")
        body.pack(fill="both", expand=True)

        # Panel nav izquierdo (pestañas verticales)
        nav = ctk.CTkFrame(body, width=205, fg_color="#0a1420")
        nav.pack(side="left", fill="y")
        nav.pack_propagate(False)
        ctk.CTkLabel(nav, text="PESTAÑAS", font=("Consolas", 9),
                     text_color="#555").pack(anchor="w", padx=14, pady=(22, 8))
        self.btn_nav = []
        for i, (icon, label) in enumerate(self.SECCIONES):
            b = ctk.CTkButton(nav, text=f"{icon}  {label}", anchor="w", height=56, width=192,
                              font=("Consolas", 12), fg_color="transparent",
                              hover_color="#163861", text_color="#999",
                              command=lambda idx=i: self.mostrar_seccion(idx))
            b.pack(fill="x", padx=6, pady=3)
            self.btn_nav.append(b)

        # Panel ayuda derecho
        ayuda = ctk.CTkFrame(body, width=230, fg_color="#080f18")
        ayuda.pack(side="right", fill="y")
        ayuda.pack_propagate(False)
        ctk.CTkLabel(ayuda, text="ⓘ  AYUDA", font=("Consolas", 13, "bold"),
                     text_color="#2b9eff").pack(anchor="w", padx=14, pady=(22, 6))
        self.lbl_ayuda = ctk.CTkLabel(ayuda, text="Selecciona un campo\npara ver su descripción.",
                                       font=("Consolas", 10), text_color="#666",
                                       wraplength=200, justify="left")
        self.lbl_ayuda.pack(anchor="w", padx=14, pady=4)

        # Panel contenido centro
        self.frame_contenido = ctk.CTkFrame(body, fg_color="#0e1620")
        self.frame_contenido.pack(side="left", fill="both", expand=True)

    # ── Helpers UI ──────────────────────────────────────────────
    def _titulo_seccion(self, parent, icono, texto):
        ctk.CTkLabel(parent, text=f"{icono}  {texto}",
                     font=("Impact", 22), text_color="#2b9eff").pack(anchor="w", padx=24, pady=(24, 4))
        ctk.CTkFrame(parent, height=1, fg_color="#2b78e4").pack(fill="x", padx=24, pady=(0, 8))

    def _lbl(self, parent, texto):
        ctk.CTkLabel(parent, text=texto, font=("Consolas", 12),
                     text_color="#2b9eff").pack(anchor="w", padx=24, pady=(14, 2))

    def _entry(self, parent, key, valor, show="", ayuda="", ancho=580):
        e = ctk.CTkEntry(parent, width=ancho, font=("Consolas", 12),
                         fg_color="#0a1420", border_color="#1a3d61", show=show)
        e.insert(0, valor)
        e.pack(padx=24, pady=3, anchor="w")
        e.bind("<FocusIn>", lambda ev, a=ayuda: self.lbl_ayuda.configure(text=a))
        self.campos[key] = e
        return e

    def _entry_ojo(self, parent, key, valor, ayuda="", ancho=520):
        """Entry con botón ojito para mostrar/ocultar contraseña."""
        fr = ctk.CTkFrame(parent, fg_color="transparent")
        fr.pack(padx=24, pady=3, anchor="w")
        e = ctk.CTkEntry(fr, width=ancho, font=("Consolas", 12),
                         fg_color="#0a1420", border_color="#1a3d61", show="●")
        e.insert(0, valor)
        e.pack(side="left")
        e.bind("<FocusIn>", lambda ev, a=ayuda: self.lbl_ayuda.configure(text=a))
        self.campos[key] = e

        def _toggle(btn=None, entry=e):
            if entry.cget("show") == "●":
                entry.configure(show="")
                if btn: btn.configure(text="🙈")
            else:
                entry.configure(show="●")
                if btn: btn.configure(text="👁️")

        btn_ojo = ctk.CTkButton(fr, text="👁️", width=44, height=34,
                                 fg_color="#163861", hover_color="#1f4d80",
                                 font=("Arial", 16),
                                 command=lambda: _toggle(btn_ojo))
        btn_ojo.pack(side="left", padx=8)
        return e

    # ── Construcción de pestañas ────────────────────────────────
    def _build_fields(self, cfg):
        self.frames_sec = []

        # ─── 0: Credenciales Fracttal ───
        f0 = ctk.CTkScrollableFrame(self.frame_contenido, fg_color="transparent")
        self._titulo_seccion(f0, "🔑", "Credenciales Fracttal")

        self._lbl(f0, "Correo de acceso Fracttal")
        self._entry(f0, "user_fracttal", cfg.get("user_fracttal", ""),
                    ayuda="Email con el que inicias sesión en Fracttal One.")

        self._lbl(f0, "Contraseña Fracttal — hash MD5")
        self._entry_ojo(f0, "pass_fracttal", cfg.get("pass_fracttal", ""),
                    ayuda="Hash MD5 de tu contraseña.\nGenéralo en: md5hashgenerator.com")

        self._lbl(f0, "ID de empresa Fracttal")
        self._entry(f0, "id_company", cfg.get("id_company", ""), ancho=200,
                    ayuda="ID numérico de tu empresa.\nEjemplo: 2635")

        ctk.CTkFrame(f0, height=1, fg_color="#1a3d61").pack(fill="x", padx=24, pady=(18,4))
        ctk.CTkLabel(f0, text="🤖  Para captura automática (Selenium)",
                     font=("Consolas", 12, "bold"), text_color="#2b9eff").pack(anchor="w", padx=24, pady=(6,2))
        self._lbl(f0, "Contraseña REAL de Fracttal (para Selenium automático)")
        self._entry_ojo(f0, "pass_real", cfg.get("pass_real", ""),
                    ayuda="Contraseña real en texto.\nSelenium la usa para hacer\nlogin automático en Fracttal.\n\nNo es el hash MD5.\nEs la misma que escribes\nen el browser.")
        ctk.CTkLabel(f0,
            text="💡 Con esta contraseña Selenium hace login automático\n"
                 "   y renueva el token/cookies sin intervención manual.",
            font=("Consolas", 10), text_color="#555", justify="left").pack(anchor="w", padx=24, pady=(4,0))
        self.frames_sec.append(f0)

        # ─── 1: Supabase ───
        f1 = ctk.CTkScrollableFrame(self.frame_contenido, fg_color="transparent")
        self._titulo_seccion(f1, "☁️", "Supabase")
        self._lbl(f1, "URL de tu proyecto Supabase")
        self._entry(f1, "url_supabase", cfg.get("url_supabase", ""),
                    ayuda="URL base de tu proyecto Supabase.\nEjemplo: https://abcdef.supabase.co")
        self._lbl(f1, "API Key — anon key")
        self._entry_ojo(f1, "key_supabase", cfg.get("key_supabase", ""),
                    ayuda="Clave anon de Supabase.\nSettings → API → anon key")
        self._lbl(f1, "Nombre de la tabla destino")
        self._entry(f1, "tabla_supabase", cfg.get("tabla_supabase", "st_fracttal"), ancho=300,
                    ayuda="Nombre exacto de la tabla en Supabase\ndonde se guardan las solicitudes (ST).")
        ctk.CTkLabel(f1, text="💡 ST siempre usa UPSERT por nro_solicitud — nunca duplica.",
                     font=("Consolas", 10), text_color="#555").pack(anchor="w", padx=24, pady=(10, 0))
        self.frames_sec.append(f1)

        # ─── 2: Google Drive ───
        f2 = ctk.CTkScrollableFrame(self.frame_contenido, fg_color="transparent")
        self._titulo_seccion(f2, "📁", "Google Drive")
        self._lbl(f2, "Ruta de la carpeta en Google Drive (unidad local)")
        fr = ctk.CTkFrame(f2, fg_color="transparent")
        fr.pack(padx=24, pady=3, anchor="w")
        e_ruta = ctk.CTkEntry(fr, width=510, font=("Consolas", 11),
                               fg_color="#0a1420", border_color="#1a3d61")
        e_ruta.insert(0, cfg.get("path_gdrive", ""))
        e_ruta.pack(side="left")
        e_ruta.bind("<FocusIn>", lambda ev: self.lbl_ayuda.configure(
            text="Ruta local de tu carpeta Google Drive\nmontada como unidad de disco.\n\nSi esta ruta falla al guardar,\nel bot continúa de todas formas\ncon la carga a Supabase."))
        self.campos["path_gdrive"] = e_ruta
        ctk.CTkButton(fr, text="📂", width=46, height=36,
                      fg_color="#163861", hover_color="#1f4d80",
                      font=("Arial", 16),
                      command=lambda: self._explorar(e_ruta)).pack(side="left", padx=10)
        ctk.CTkLabel(f2,
            text="⚠️ Si Google Drive no está disponible o falla el guardado del CSV,\n"
                 "el bot lo registrará en el log y CONTINUARÁ con la subida a Supabase\n"
                 "sin detenerse. El CSV es un respaldo, no un paso obligatorio.",
            font=("Consolas", 10), text_color="#888", justify="left").pack(anchor="w", padx=24, pady=(10, 0))
        self.frames_sec.append(f2)

        # ─── 3: Token Manual ───
        f3 = ctk.CTkScrollableFrame(self.frame_contenido, fg_color="transparent")
        self._titulo_seccion(f3, "🎫", "Cabeceras del Browser")

        # Banner informativo
        banner = ctk.CTkFrame(f3, fg_color="#0d1400", corner_radius=10,
                               border_width=1, border_color="#e4a02b")
        banner.pack(padx=24, pady=(4,14), fill="x")
        ctk.CTkLabel(banner,
            text="⚠️  Actualiza estos 3 campos si aparece error 403.",
            font=("Consolas", 10, "bold"), text_color="#e4a02b").pack(anchor="w", padx=14, pady=(8,2))
        ctk.CTkLabel(banner,
            text="Cómo obtenerlos: Abre Fracttal en Chrome → F12 → Network → filtra 'proxy' → clic en cualquier petición proxy → Headers",
            font=("Consolas", 9), text_color="#888", wraplength=600, justify="left").pack(anchor="w", padx=14, pady=(0,8))

        # ── CAMPO 1: Token JWT ──
        def _infomodal_token():
            w = ctk.CTkToplevel(self)
            w.title("ℹ️  Cómo obtener el Token JWT")
            w.geometry("500x360")
            w.resizable(False, False)
            w.attributes("-topmost", True)
            ctk.CTkLabel(w, text="🔑  Token JWT — Cómo obtenerlo",
                         font=("Impact", 16), text_color="#2b9eff").pack(pady=(16,8))
            pasos = [
                "1. Abre Chrome y entra a one.fracttal.com/workrequest",
                "2. Presiona F12 para abrir DevTools",
                "3. Ve a la pestaña Network",
                "4. Recarga la página con F5",
                "5. En el filtro escribe: proxy",
                "6. Haz clic en cualquier petición 'proxy' de la lista",
                "7. Ve a la pestaña Headers",
                "8. Busca el campo 'authorization'",
                "9. Copia el valor DESPUÉS de 'Bearer ' (sin el 'Bearer ')",
                "10. Pégalo en el campo Token JWT y guarda",
                "",
                "⚠️  Vigencia: ~12 horas desde que inicias sesión",
                "⚠️  Si el bot da error 403, renueva el token",
            ]
            tb = ctk.CTkTextbox(w, width=460, height=220, font=("Consolas", 10))
            tb.pack(padx=20, pady=4)
            for p in pasos: tb.insert("end", "  " + p + "\n")
            tb.configure(state="disabled")
            ctk.CTkButton(w, text="Entendido", command=w.destroy,
                          fg_color="#2b78e4").pack(pady=8)

        fh1 = ctk.CTkFrame(f3, fg_color="transparent")
        fh1.pack(fill="x", padx=24, pady=(14,2))
        ctk.CTkLabel(fh1, text="🔑  Token JWT",
                     font=("Consolas", 13, "bold"), text_color="#2b9eff").pack(side="left")
        ctk.CTkLabel(fh1, text="  (Authorization: Bearer ...)",
                     font=("Consolas", 10), text_color="#555").pack(side="left")
        ctk.CTkButton(fh1, text="ℹ️ Cómo obtenerlo", width=140, height=26,
                      font=("Consolas", 10), fg_color="#163861", hover_color="#1f4d80",
                      command=_infomodal_token).pack(side="right")

        # Textbox token con ojito (mostrar/ocultar)
        fr_tok = ctk.CTkFrame(f3, fg_color="transparent")
        fr_tok.pack(padx=24, pady=2, anchor="w")
        self.entry_token = ctk.CTkTextbox(fr_tok, width=590, height=90,
                                           font=("Consolas", 10), fg_color="#0a1420",
                                           border_color="#1a3d61", border_width=1)
        self.entry_token.pack(side="left")
        token_guardado = self.parent.config.get("token_manual", "")
        if token_guardado:
            self.entry_token.insert("1.0", token_guardado)

        def _toggle_token():
            cur = self.entry_token.cget("text_color")
            if cur != "#0a1420":
                self.entry_token.configure(text_color="#0a1420")
                btn_ojo_tok.configure(text="👁️")
            else:
                self.entry_token.configure(text_color="#cccccc")
                btn_ojo_tok.configure(text="🙈")
        btn_ojo_tok = ctk.CTkButton(fr_tok, text="👁️", width=44, height=90,
                                     fg_color="#163861", hover_color="#1f4d80",
                                     font=("Arial", 18), command=_toggle_token)
        btn_ojo_tok.pack(side="left", padx=6)
        # Visible por defecto
        self.entry_token.configure(text_color="#888888")

        # ── CAMPO 2: Cookie ──
        def _infomodal_cookie():
            w = ctk.CTkToplevel(self)
            w.title("ℹ️  Cómo obtener la Cookie")
            w.geometry("500x340")
            w.resizable(False, False)
            w.attributes("-topmost", True)
            ctk.CTkLabel(w, text="🍪  Cookie de sesión — Cómo obtenerla",
                         font=("Impact", 16), text_color="#2b9eff").pack(pady=(16,8))
            pasos = [
                "1. Mismos pasos que el Token (F12 → Network → proxy)",
                "2. En la pestaña Headers busca el campo 'Cookie'",
                "3. Copia TODO el valor (es una cadena muy larga)",
                "   Empieza con: _BEAMER_USER_ID... o session=...",
                "4. Pégala en el campo Cookie y guarda",
                "",
                "⚠️  Vigencia: ~8-12 horas",
                "⚠️  Contiene: session, session.sig y __cf_bm (Cloudflare)",
                "ℹ️  La cookie es OPCIONAL — el bot funciona sin ella",
                "   pero con ella Fracttal no bloquea las peticiones",
            ]
            tb = ctk.CTkTextbox(w, width=460, height=200, font=("Consolas", 10))
            tb.pack(padx=20, pady=4)
            for p in pasos: tb.insert("end", "  " + p + "\n")
            tb.configure(state="disabled")
            ctk.CTkButton(w, text="Entendido", command=w.destroy,
                          fg_color="#2b78e4").pack(pady=8)

        fh2 = ctk.CTkFrame(f3, fg_color="transparent")
        fh2.pack(fill="x", padx=24, pady=(14,2))
        ctk.CTkLabel(fh2, text="🍪  Cookie de sesión",
                     font=("Consolas", 13, "bold"), text_color="#2b9eff").pack(side="left")
        ctk.CTkLabel(fh2, text="  (campo Cookie en Headers)",
                     font=("Consolas", 10), text_color="#555").pack(side="left")
        ctk.CTkButton(fh2, text="ℹ️ Cómo obtenerla", width=140, height=26,
                      font=("Consolas", 10), fg_color="#163861", hover_color="#1f4d80",
                      command=_infomodal_cookie).pack(side="right")

        fr_cook = ctk.CTkFrame(f3, fg_color="transparent")
        fr_cook.pack(padx=24, pady=2, anchor="w")
        self.entry_cookie = ctk.CTkTextbox(fr_cook, width=590, height=75,
                                            font=("Consolas", 9), fg_color="#0a1420",
                                            border_color="#1a3d61", border_width=1)
        self.entry_cookie.pack(side="left")
        cookie_guardada = self.parent.config.get("cookie_manual", "")
        if cookie_guardada:
            self.entry_cookie.insert("1.0", cookie_guardada)

        def _toggle_cookie():
            cur = self.entry_cookie.cget("text_color")
            if cur != "#0a1420":
                self.entry_cookie.configure(text_color="#0a1420")
                btn_ojo_cook.configure(text="👁️")
            else:
                self.entry_cookie.configure(text_color="#cccccc")
                btn_ojo_cook.configure(text="🙈")
        btn_ojo_cook = ctk.CTkButton(fr_cook, text="👁️", width=44, height=75,
                                      fg_color="#163861", hover_color="#1f4d80",
                                      font=("Arial", 18), command=_toggle_cookie)
        btn_ojo_cook.pack(side="left", padx=6)
        self.entry_cookie.configure(text_color="#888888")

        # ── CAMPO 3: x-version ──
        fh3 = ctk.CTkFrame(f3, fg_color="transparent")
        fh3.pack(fill="x", padx=24, pady=(14,2))
        ctk.CTkLabel(fh3, text="📋  Versión de plataforma",
                     font=("Consolas", 13, "bold"), text_color="#2b9eff").pack(side="left")
        ctk.CTkLabel(fh3, text="  (x-version)  Vigencia: ~2-3 meses",
                     font=("Consolas", 10), text_color="#555").pack(side="left")
        self.entry_xversion = ctk.CTkEntry(f3, width=300, font=("Consolas", 12),
                                            fg_color="#0a1420", border_color="#1a3d61")
        self.entry_xversion.insert(0, self.parent.config.get("x_version", "Fracttal/5.8.04 web"))
        self.entry_xversion.pack(padx=24, pady=(0,8), anchor="w")

        # ── Modo autenticación ──
        fmodo_hdr = ctk.CTkFrame(f3, fg_color="transparent")
        fmodo_hdr.pack(fill="x", padx=24, pady=(16,4))
        ctk.CTkLabel(fmodo_hdr, text="Modo de autenticación:",
                     font=("Consolas", 12, "bold"), text_color="#2b9eff").pack(side="left")

        def _infomodal_modos():
            w = ctk.CTkToplevel(self)
            w.title("ℹ️  Modos de autenticación")
            w.geometry("560x480")
            w.resizable(False, False)
            w.attributes("-topmost", True)
            ctk.CTkLabel(w, text="🔐  Modos de Autenticación",
                         font=("Impact", 18), text_color="#2b9eff").pack(pady=(16,4))
            ctk.CTkFrame(w, height=1, fg_color="#2b78e4").pack(fill="x", padx=20, pady=(0,8))

            info_auto = ctk.CTkFrame(w, fg_color="#0a1f0a", corner_radius=10,
                                      border_width=1, border_color="#00aa33")
            info_auto.pack(padx=20, pady=8, fill="x")
            ctk.CTkLabel(info_auto, text="🔄  Modo AUTO (recomendado)",
                         font=("Consolas", 13, "bold"), text_color="#00ff44").pack(anchor="w", padx=14, pady=(12,4))
            auto_txt = [
                "• El bot hace login automático con tu usuario y hash MD5",
                "• Obtiene un Token JWT fresco en cada ejecución",
                "• Renueva el token cada 4 horas automáticamente",
                "• Si el login falla, usa el Token Manual como respaldo",
                "• No necesitas actualizar nada manualmente",
                "• RECOMENDADO para uso en VM sin intervención",
            ]
            for t in auto_txt:
                ctk.CTkLabel(info_auto, text=t, font=("Consolas", 10),
                             text_color="#aaaaaa", justify="left").pack(anchor="w", padx=20, pady=1)
            ctk.CTkLabel(info_auto, text="", height=8).pack()

            info_manual = ctk.CTkFrame(w, fg_color="#1a1000", corner_radius=10,
                                        border_width=1, border_color="#e4a02b")
            info_manual.pack(padx=20, pady=8, fill="x")
            ctk.CTkLabel(info_manual, text="🎫  Modo MANUAL",
                         font=("Consolas", 13, "bold"), text_color="#e4a02b").pack(anchor="w", padx=14, pady=(12,4))
            man_txt = [
                "• Usa directamente el Token JWT que pegas en el campo",
                "• No intenta hacer login con usuario y contraseña",
                "• Útil cuando el hash MD5 no funciona (error 403 en AUTO)",
                "• Debes renovar el token manualmente cada ~12 horas",
                "• Obtén el token desde: F12 → Network → proxy → Headers",
            ]
            for t in man_txt:
                ctk.CTkLabel(info_manual, text=t, font=("Consolas", 10),
                             text_color="#aaaaaa", justify="left").pack(anchor="w", padx=20, pady=1)
            ctk.CTkLabel(info_manual, text="", height=8).pack()

            ctk.CTkButton(w, text="Entendido", command=w.destroy,
                          fg_color="#2b78e4", width=160).pack(pady=12)

        ctk.CTkButton(fmodo_hdr, text="ℹ️ ¿Cuál elegir?", width=130, height=26,
                      font=("Consolas", 10), fg_color="#163861", hover_color="#1f4d80",
                      command=_infomodal_modos).pack(side="right")

        self.modo_auth = ctk.StringVar(value=self.parent.config.get("modo_auth", "AUTO"))
        fm = ctk.CTkFrame(f3, fg_color="#0d1a2e", corner_radius=10,
                           border_width=1, border_color="#1a3d61")
        fm.pack(padx=24, pady=4, fill="x")
        ctk.CTkRadioButton(fm,
            text="🔄  AUTO — Login automático con usuario/hash (token se renueva cada 4h)",
            variable=self.modo_auth, value="AUTO",
            font=("Consolas", 12), text_color="#00ff44").pack(anchor="w", padx=16, pady=(14,4))
        ctk.CTkRadioButton(fm,
            text="🎫  MANUAL — Usar el token pegado arriba directamente (si AUTO da 403)",
            variable=self.modo_auth, value="MANUAL",
            font=("Consolas", 12), text_color="#e4a02b").pack(anchor="w", padx=16, pady=(4,14))

        self.frames_sec.append(f3)

    def _explorar(self, entry):
        ruta = filedialog.askdirectory(title="Selecciona carpeta de Google Drive")
        if ruta:
            entry.delete(0, "end")
            entry.insert(0, ruta.replace("/", "\\"))

    def mostrar_seccion(self, idx):
        for f in self.frames_sec:
            f.pack_forget()
        self.frames_sec[idx].pack(fill="both", expand=True)
        for i, b in enumerate(self.btn_nav):
            activo = i == idx
            b.configure(fg_color="#163861" if activo else "transparent",
                        text_color="#2b9eff" if activo else "#888")

    def _guardar_y_cerrar(self):
        nueva = {k: v.get() for k, v in self.campos.items()}
        for k in ["fec_ini", "fec_fin", "hora1", "hora2", "hora3", "modo_supabase"]:
            nueva[k] = self.parent.config.get(k, CONFIG_DEFAULTS.get(k, ""))
        # Guardar token manual y modo auth
        nueva["token_manual"]  = self.entry_token.get("1.0", "end").strip()
        nueva["cookie_manual"] = self.entry_cookie.get("1.0", "end").strip()
        nueva["modo_auth"]     = self.modo_auth.get()
        nueva["x_version"]     = self.entry_xversion.get().strip() or "Fracttal/5.8.04 web"
        self.parent.config = nueva
        self.parent._guardar_config_json()
        modo = nueva["modo_auth"]
        self.parent.escribir_log(f"⚙️  [CONFIG] Configuración guardada. Modo auth: {modo}")
        self.destroy()


# ═══════════════════════════════════════════════════════════════════
#  VENTANA PRINCIPAL
# ═══════════════════════════════════════════════════════════════════
class ConsolaFracttalST(ctk.CTk):

    def __init__(self):
        super().__init__()
        self.title(f"SPSA — Extractor API Fracttal ST  V{VERSION}")
        self.geometry("780x920")
        self.minsize(740, 800)
        ctk.set_appearance_mode("dark")

        self.config            = dict(CONFIG_DEFAULTS)
        self.autopiloto_activo = False
        self.ejecutando        = False
        self._bot_corriendo    = False
        self._ultimo_error     = ""
        self._gear_activo      = False
        self._auto_activo_anim = False

        self._cargar_config_json()
        self._build_ui()
        self._cargar_ui_desde_config()
        self.escribir_log(f">>> SPSA Fracttal ST V{VERSION} — Sistema iniciado. Blindaje Anti-Cortes activo.")

    # ── UI ──────────────────────────────────────────────────────
    def _build_ui(self):
        hdr = ctk.CTkFrame(self, fg_color="transparent")
        hdr.pack(fill="x", padx=20, pady=(10, 0))
        ctk.CTkLabel(hdr, text="FRACTTAL: MOTOR SOLICITUDES (ST)",
                     font=("Impact", 24), text_color="#2b78e4").pack(side="left")

        # ── Iconos animados compactos en el header ──
        import tkinter as tk
        f_icos = ctk.CTkFrame(hdr, fg_color="transparent")
        f_icos.pack(side="left", padx=10)

        # Canvas robot 48x48
        self._canvas_bot = tk.Canvas(f_icos, width=48, height=48,
                                      bg="#0a0f1a", highlightthickness=1,
                                      highlightbackground="#1a3d61")
        self._canvas_bot.pack(side="left", padx=3)

        # Canvas autopiloto 48x48
        self._canvas_auto = tk.Canvas(f_icos, width=48, height=48,
                                       bg="#0a0800", highlightthickness=1,
                                       highlightbackground="#3d2800")
        self._canvas_auto.pack(side="left", padx=3)

        # Label estado compacto
        self.lbl_estado_txt = ctk.CTkLabel(f_icos, text="",
            font=("Consolas", 10, "bold"), text_color="#555")
        self.lbl_estado_txt.pack(side="left", padx=6)

        # Inicializar variables
        self._angulo_gear = 0
        self._gear_activo = False
        self._angulo_auto = 0
        self._auto_activo_anim = False

        ctk.CTkButton(hdr, text="⚙️", width=48, height=48, font=("Arial", 22),
                      fg_color="#163861", hover_color="#1f4d80", corner_radius=10,
                      command=self._abrir_config).pack(side="right")

        self.btn_test_sel = ctk.CTkButton(hdr, text="🤖 TEST SELENIUM",
                      width=80, height=48, font=("Consolas", 9, "bold"),
                      fg_color="#2a1a00", hover_color="#4a3000",
                      border_width=2, border_color="#ffaa00",
                      text_color="#ffaa00", corner_radius=10,
                      command=self._test_selenium_hilo).pack(side="right", padx=(0,6))

        # Botón alerta versión Fracttal (oculto por defecto)
        self.btn_alerta_version = ctk.CTkButton(hdr,
                      text="⚠️", width=48, height=48,
                      font=("Arial", 22), fg_color="#1a0800",
                      hover_color="#3a1500", corner_radius=10,
                      border_width=2, border_color="#ff6600",
                      text_color="#ff6600",
                      command=self._mostrar_alerta_version)
        # Oculto hasta detectar cambio
        self._version_alerta_activa = False
        self._version_detectada = ""

        import tkinter as tk
        ctk.CTkFrame(self, height=1, fg_color="#2a2a2a").pack(fill="x", padx=20, pady=(6, 0))

        ff = ctk.CTkFrame(self, fg_color="#111821")
        ff.pack(pady=8, padx=20, fill="x")

        ctk.CTkLabel(ff, text="📅 Inicio:", font=("Consolas", 12)).grid(row=0, column=0, padx=(14,4), pady=10)
        self.ent_i = ctk.CTkEntry(ff, width=130, font=("Consolas", 12), placeholder_text="AAAA-MM-DD",
                                   state="readonly", fg_color="#0a1420", border_color="#1a3d61")
        self.ent_i.grid(row=0, column=1, padx=2, pady=10)

        self._cal_ini_abierto = False
        def _abrir_cal_ini():
            if self._cal_ini_abierto:
                return
            self._cal_ini_abierto = True
            def _cb(fecha):
                self._cal_ini_abierto = False
                self.ent_i.configure(state="normal")
                self.ent_i.delete(0, "end")
                self.ent_i.insert(0, fecha)
                self.ent_i.configure(state="readonly")
                self.config["fec_ini"] = fecha
                self._guardar_config_json()
                self.escribir_log(f"📅 Fecha inicio configurada: {fecha}")
            def _on_close():
                self._cal_ini_abierto = False
            cal = CalendarioModal(self, "📅 Fecha de INICIO",
                                  fecha_inicial=self.ent_i.get(), callback=_cb)
            cal.protocol("WM_DELETE_WINDOW", lambda: [_on_close(), cal.destroy()])

        ctk.CTkButton(ff, text="📅", width=34, height=34,
                      font=("Arial", 14), fg_color="#163861", hover_color="#1f4d80",
                      command=_abrir_cal_ini).grid(row=0, column=2, padx=(2,8), pady=10)

        ctk.CTkLabel(ff, text="📅 Fin:", font=("Consolas", 12)).grid(row=0, column=3, padx=(8,4), pady=10)
        self.ent_f = ctk.CTkEntry(ff, width=130, font=("Consolas", 12), placeholder_text="AAAA-MM-DD",
                                   state="readonly", fg_color="#0a1420", border_color="#1a3d61")
        self.ent_f.grid(row=0, column=4, padx=2, pady=10)

        self._cal_fin_abierto = False
        def _abrir_cal_fin():
            if self._cal_fin_abierto:
                return
            self._cal_fin_abierto = True
            def _cb(fecha):
                self._cal_fin_abierto = False
                self.ent_f.configure(state="normal")
                self.ent_f.delete(0, "end")
                self.ent_f.insert(0, fecha)
                self.ent_f.configure(state="readonly")
                self.config["fec_fin"] = fecha
                self._guardar_config_json()
                self.escribir_log(f"📅 Fecha fin configurada: {fecha}")
            def _on_close_fin():
                self._cal_fin_abierto = False
            cal_f = CalendarioModal(self, "📅 Fecha de FIN",
                                    fecha_inicial=self.ent_f.get(), callback=_cb)
            cal_f.protocol("WM_DELETE_WINDOW", lambda: [_on_close_fin(), cal_f.destroy()])

        ctk.CTkButton(ff, text="📅", width=34, height=34,
                      font=("Arial", 14), fg_color="#163861", hover_color="#1f4d80",
                      command=_abrir_cal_fin).grid(row=0, column=5, padx=(2,2), pady=10)

        # Botón HOY con hora para fecha fin
        def _set_hoy():
            hoy = datetime.now().strftime("%Y-%m-%d")
            self.ent_f.configure(state="normal")
            self.ent_f.delete(0, "end")
            self.ent_f.insert(0, hoy)
            self.ent_f.configure(state="readonly")
            self.config["fec_fin"] = hoy
            self.escribir_log(f"📅 Fecha fin actualizada a HOY: {hoy}")

        ctk.CTkButton(ff, text="📅 HOY", width=70, height=34,
                      font=("Consolas", 10, "bold"), fg_color="#00aa33",
                      hover_color="#007722", text_color="#ffffff",
                      command=_set_hoy).grid(row=0, column=6, padx=(2,4), pady=10)

        # Label que muestra la hora actual en tiempo real
        self.lbl_hora_actual = ctk.CTkLabel(ff, text="",
                                             font=("Consolas", 10), text_color="#555")
        self.lbl_hora_actual.grid(row=0, column=7, padx=(0,14), pady=10)
        def _actualizar_reloj():
            while True:
                try:
                    ahora = datetime.now().strftime("%H:%M:%S")
                    self.lbl_hora_actual.configure(text=f"🕐 {ahora}")
                    self.update()
                except Exception:
                    break
                time.sleep(1)
        threading.Thread(target=_actualizar_reloj, daemon=True).start()

        fh = ctk.CTkFrame(self, fg_color="#111821")
        fh.pack(pady=4, padx=20, fill="x")

        # Selector de modo de autopiloto
        self.modo_auto_var = ctk.StringVar(value=self.config.get("modo_auto", "HORAS"))

        ctk.CTkRadioButton(fh, text="⏰ Horas fijas",
                            variable=self.modo_auto_var, value="HORAS",
                            font=("Consolas", 11), text_color="#aaaaaa",
                            command=self._actualizar_modo_auto).grid(
                            row=0, column=0, padx=(12,4), pady=8)

        ctk.CTkRadioButton(fh, text="🔁 Intervalo",
                            variable=self.modo_auto_var, value="INTERVALO",
                            font=("Consolas", 11), text_color="#aaaaaa",
                            command=self._actualizar_modo_auto).grid(
                            row=0, column=1, padx=(4,12), pady=8)

        # ── Panel Horas Fijas ──
        self.frame_horas = ctk.CTkFrame(fh, fg_color="transparent")
        self.frame_horas.grid(row=0, column=2, padx=4, pady=8)
        for col, (lbl, attr) in enumerate([("T1:", "ent_h1"), ("T2:", "ent_h2"), ("T3:", "ent_h3")]):
            ctk.CTkLabel(self.frame_horas, text=lbl,
                          font=("Consolas", 11), text_color="#888").grid(
                          row=0, column=col*2, padx=(8,2))
            e = ctk.CTkEntry(self.frame_horas, width=76,
                              font=("Consolas", 12), placeholder_text="HH:MM")
            e.grid(row=0, column=col*2+1, padx=(0,4))
            setattr(self, attr, e)

        # ── Panel Intervalo ──
        self.frame_intervalo = ctk.CTkFrame(fh, fg_color="transparent")
        self.frame_intervalo.grid(row=0, column=2, padx=4, pady=8)
        ctk.CTkLabel(self.frame_intervalo, text="Cada:",
                      font=("Consolas", 11), text_color="#888").grid(
                      row=0, column=0, padx=(8,4))
        self.ent_intervalo = ctk.CTkEntry(self.frame_intervalo, width=60,
                                           font=("Consolas", 13, "bold"),
                                           placeholder_text="30")
        self.ent_intervalo.grid(row=0, column=1, padx=2)
        self.combo_intervalo = ctk.CTkOptionMenu(
            self.frame_intervalo,
            values=["minutos", "horas"],
            font=("Consolas", 11),
            width=100, fg_color="#163861",
            button_color="#1a4080",
            dropdown_fg_color="#0a1420",
            command=lambda v: None)
        self.combo_intervalo.grid(row=0, column=2, padx=(4,8))
        ctk.CTkLabel(self.frame_intervalo,
                      text="(min: 1 min)", font=("Consolas", 9),
                      text_color="#555").grid(row=0, column=3, padx=4)

        def _info_intervalo():
            if hasattr(self, "_win_info_int") and self._win_info_int and self._win_info_int.winfo_exists():
                self._win_info_int.lift(); return
            w = ctk.CTkToplevel(self)
            self._win_info_int = w
            w.title("Guia de intervalos")
            w.geometry("480x400")
            w.resizable(False, False)
            w.attributes("-topmost", True)
            ctk.CTkLabel(w, text="Guia de Intervalos",
                         font=("Impact", 18), text_color="#e4a02b").pack(pady=(16,4))
            ctk.CTkFrame(w, height=1, fg_color="#e4a02b").pack(fill="x", padx=20, pady=(0,8))
            info = ctk.CTkTextbox(w, width=440, height=280, font=("Consolas", 10),
                                   fg_color="#0a0f00", text_color="#cccccc")
            info.pack(padx=20, pady=4)
            lineas = [
                "CADA CUANTO DEBERIA EJECUTARSE EL BOT?",
                "-"*42, "",
                "1 minuto -> Solo para pruebas. Supabase free tier no",
                "   soporta inserciones tan frecuentes de 38,000+",
                "   registros. Causara timeouts.", "",
                "30 minutos (RECOMENDADO datos frecuentes)",
                "   Equilibrio perfecto: datos frescos + carga minima.",
                "   Ideal para dashboards en tiempo real.", "",
                "1 hora (RECOMENDADO uso normal)",
                "   Suficiente para la mayoria de casos.",
                "   La opcion mas estable para Supabase free tier.", "",
                "2-4 horas (Para datos historicos)",
                "   Si tu analisis no requiere datos en tiempo real.", "",
                "ADVERTENCIA - Supabase Free Tier",
                "-"*42,
                "   Con intervalos < 30 min y 38,000+ registros,",
                "   Supabase puede saturarse y dar timeouts.",
                "   Con Supabase Pro ($25/mes) sin limitaciones.", "",
                "CONSEJO", "-"*42,
                "   Produccion: 30 min o 1 hora.",
                "   Pruebas: 1-5 min.",
                "   El bot limpia la tabla antes de insertar.",
                "   0 duplicados garantizados siempre.",
            ]
            for ln in lineas:
                info.insert("end", ln + "\n")
            info.configure(state="disabled")
            ctk.CTkButton(w, text="Entendido", command=w.destroy,
                          fg_color="#e4a02b", hover_color="#b37e22",
                          text_color="#000000", width=160,
                          font=("Arial", 12, "bold")).pack(pady=10)

        ctk.CTkButton(self.frame_intervalo, text="i", width=30, height=30,
                      font=("Consolas", 11, "bold"), fg_color="#2a1a00",
                      hover_color="#4a3000", border_width=1,
                      border_color="#e4a02b", text_color="#e4a02b",
                      command=_info_intervalo).grid(row=0, column=4, padx=4)
        # Mostrar el panel correcto según el modo
        self.frame_intervalo.grid_remove()

        self.btn_auto = ctk.CTkButton(fh, text="⏳ ACTIVAR AUTOPILOTO", height=36,
                                      font=("Arial", 12, "bold"),
                                      fg_color="#b58d00", hover_color="#8c6d00",
                                      command=self._toggle_autopiloto)
        self.btn_auto.grid(row=0, column=3, padx=(8,2), pady=8)

        self._win_info_auto = None
        def _infomodal_autopiloto():
            if self._win_info_auto and self._win_info_auto.winfo_exists():
                self._win_info_auto.lift()
                return
            w = ctk.CTkToplevel(self)
            self._win_info_auto = w
            w.title("ℹ️  Cómo funciona el Autopiloto")
            w.geometry("520x500")
            w.resizable(False, False)
            w.attributes("-topmost", True)
            ctk.CTkLabel(w, text="⏳  Cómo funciona el Autopiloto",
                         font=("Impact", 17), text_color="#e4a02b").pack(pady=(16,4))
            ctk.CTkFrame(w, height=1, fg_color="#e4a02b").pack(fill="x", padx=20, pady=(0,10))

            info = ctk.CTkTextbox(w, width=480, height=340, font=("Consolas", 10),
                                   fg_color="#0a0f00", text_color="#cccccc")
            info.pack(padx=20, pady=4)
            texto = """  ¿QUÉ HACE EL AUTOPILOTO?
  ══════════════════════════════════════════════

  El autopiloto ejecuta la extracción automáticamente
  a las horas que configures en T1, T2 y T3.

  ✅ FUNCIONAMIENTO:
  • Revisa la hora actual cada 15 segundos
  • Cuando la hora coincide con T1, T2 o T3:
    → Actualiza la fecha FIN a HOY automáticamente
    → Ejecuta la extracción completa
    → Espera 61 segundos para evitar doble disparo
  • Continúa el ciclo todos los días indefinidamente

  📅 FECHAS:
  • La fecha INICIO no cambia (la configuras tú)
  • La fecha FIN se actualiza a HOY en cada disparo
  • Así siempre capturas los datos más recientes

  ⚙️ CONFIGURACIÓN RECOMENDADA:
  • T1: 08:00  → Datos de la mañana
  • T2: 13:00  → Datos del mediodía
  • T3: 18:00  → Datos del cierre del día
  • Inicio: La fecha desde donde quieres los datos
    (ej: 2024-01-01 para tener todo el histórico)

  ⚠️ IMPORTANTE:
  • El bot debe estar ABIERTO para que funcione
  • Si cierras el bot, el autopiloto se detiene
  • Para uso en VM: déjalo abierto 24/7
  • El token se renueva automáticamente cada 4h

  🔄 FLUJO COMPLETO:
  08:00 → Actualiza Fin=HOY → Extrae → Sube a Supabase
  13:00 → Actualiza Fin=HOY → Extrae → Sube a Supabase
  18:00 → Actualiza Fin=HOY → Extrae → Sube a Supabase
  (se repite todos los días)"""
            info.insert("1.0", texto)
            info.configure(state="disabled")
            ctk.CTkButton(w, text="Entendido", command=w.destroy,
                          fg_color="#b58d00", width=160).pack(pady=10)

        ctk.CTkButton(fh, text="ℹ️", width=32, height=36,
                      font=("Arial", 14), fg_color="#2a1a00",
                      hover_color="#4a3000", border_width=1, border_color="#e4a02b",
                      command=_infomodal_autopiloto).grid(row=0, column=7, padx=(0,16), pady=10)

        # Label cuenta regresiva próxima ejecución
        self.lbl_proxima = ctk.CTkLabel(fh, text="",
                                         font=("Consolas", 9), text_color="#555")
        self.lbl_proxima.grid(row=1, column=0, columnspan=8, pady=(0,4))

        ctk.CTkButton(self, text="💾  GUARDAR CONFIGURACIÓN Y HORARIOS",
                      command=self._guardar_todo, height=42, width=440,
                      font=("Arial", 12, "bold"), fg_color="#2b78e4", hover_color="#1a52a3"
                      ).pack(pady=8)

        fb = ctk.CTkFrame(self, fg_color="transparent")
        fb.pack(pady=4)
        self.btn_run = ctk.CTkButton(fb, text="🚀  EXTRACCIÓN FRACTTAL ST",
                                     command=self._ejecutar_hilo, height=46, width=300,
                                     font=("Arial", 15, "bold"),
                                     fg_color="#2b78e4", hover_color="#1a52a3")
        self.btn_run.grid(row=0, column=0, padx=10)
        ctk.CTkButton(fb, text="🔄 REINICIAR APP",
                      command=self._reiniciar, height=46, width=160,
                      font=("Arial", 12, "bold"), fg_color="#2a2a2a", hover_color="#444"
                      ).grid(row=0, column=1, padx=10)

        ctk.CTkButton(fb, text="📋 COPIAR LOG", width=140, height=46,
                      font=("Arial", 12, "bold"), fg_color="#163861",
                      hover_color="#1f4d80", text_color="#2b9eff",
                      command=self._copiar_log).grid(row=0, column=3, padx=10)

        self.btn_analizar = ctk.CTkButton(fb, text="🔍 ANALIZAR ERROR",
                      command=self._analizar_error_hilo, height=46, width=180,
                      font=("Arial", 12, "bold"), fg_color="#4a0000",
                      hover_color="#6a0000", border_width=2,
                      border_color="#ff3333", text_color="#ff6666")
        self.btn_analizar.grid(row=0, column=2, padx=10)
        self.btn_analizar.grid_remove()  # oculto por defecto

        self.lbl_modo = ctk.CTkLabel(self, text="🔁  Modo: UPSERT por nro_solicitud — 0 duplicados garantizados",
                                      font=("Consolas", 11, "bold"), text_color="#2b9eff")
        self.lbl_modo.pack(pady=(6, 0))

        # ── Panel de alertas neon ──
        self.frame_alertas = ctk.CTkFrame(self, fg_color="transparent", height=44)
        self.frame_alertas.pack(fill="x", padx=20, pady=(4, 0))
        self._alertas_widgets = {}
        self._alertas_activas = set()
        self._parpadeo_activo = False
        for tipo, ico, color in [
            ("token",    "🔑", "#ff4400"),
            ("cookie",   "🍪", "#ff6600"),
            ("selenium", "🤖", "#ffaa00"),
            ("supabase", "☁️", "#0088ff"),
        ]:
            f_a = ctk.CTkFrame(self.frame_alertas, fg_color="#1a0800",
                                corner_radius=8, border_width=2, border_color=color)
            lbl_ico = ctk.CTkLabel(f_a, text=ico, font=("Arial", 16))
            lbl_ico.pack(side="left", padx=(8, 2), pady=4)
            lbl_txt = ctk.CTkLabel(f_a, text=tipo.upper(), font=("Consolas", 9, "bold"),
                                    text_color=color)
            lbl_txt.pack(side="left", padx=(0, 8), pady=4)
            self._alertas_widgets[tipo] = (f_a, lbl_ico, lbl_txt, ico, color)

        self.lbl_tele = ctk.CTkLabel(self, text="— Sin actividad —",
                                      font=("Consolas", 12, "bold"), text_color="#555")
        self.lbl_tele.pack(pady=(6, 2))
        self.pbar = ctk.CTkProgressBar(self, width=720, height=16,
                                        fg_color="#1a1a1a", progress_color="#2b78e4",
                                        corner_radius=6)
        self.pbar.pack(pady=(0, 6))
        self.pbar.set(0)

        # ── Línea de tiempo de fases ──
        import tkinter as tk

        # Header del panel timeline con botón info
        frame_tl_hdr = ctk.CTkFrame(self, fg_color="transparent")
        frame_tl_hdr.pack(fill="x", padx=20, pady=(6, 0))

        ctk.CTkLabel(frame_tl_hdr, text="📊 ESTADO DEL PROCESO",
                     font=("Consolas", 10, "bold"), text_color="#2b78e4").pack(side="left")

        def _infomodal_timeline():
            if hasattr(self, '_win_tl_info') and self._win_tl_info and self._win_tl_info.winfo_exists():
                self._win_tl_info.lift()
                return
            w = ctk.CTkToplevel(self)
            self._win_tl_info = w
            w.title("ℹ️  Guía de estados del proceso")
            w.geometry("500x560")
            w.resizable(False, False)
            w.attributes("-topmost", True)

            ctk.CTkLabel(w, text="📊  Guía de Estados del Proceso",
                         font=("Impact", 18), text_color="#2b9eff").pack(pady=(16,4))
            ctk.CTkFrame(w, height=1, fg_color="#2b78e4").pack(fill="x", padx=20, pady=(0,10))

            # Fases
            ctk.CTkLabel(w, text="FASES DEL PROCESO",
                         font=("Consolas", 11, "bold"), text_color="#888").pack(anchor="w", padx=20, pady=(4,2))

            fases_info = [
                ("login_f",   "🔐", "Login Fracttal",   "Autenticacion con usuario y hash MD5.\nObtiene el token JWT para acceder a la API."),
                ("desc_f",    "📡", "Extrayendo datos", "Descarga paginada desde Fracttal.\nCada petición trae hasta 1,000 registros."),
                ("proc_f",    "⚙️", "Procesando datos", "Mapeo de columnas y traduccion de estados.\nCorreccion de fechas a zona Lima."),
                ("drive_f",   "📁", "Google Drive",     "Guarda CSV de respaldo en tu unidad.\nOPCIONAL - si falla el proceso continua."),
                ("trunc_f",   "🗑️", "Limpiando tabla",  "TRUNCATE de st_fracttal en Supabase.\nInstantaneo, no afecta otras tablas."),
                ("insert_f",  "📤", "Inyectando datos", "INSERT frescos en Supabase.\nBloques de 400 filas con reintentos."),
                ("fin_f",     "🏁", "Completado",       "Proceso finalizado.\nDatos actualizados en Supabase."),
            ]
            for _, ico, nombre, desc in fases_info:
                ff = ctk.CTkFrame(w, fg_color="#0a1118", corner_radius=8)
                ff.pack(fill="x", padx=20, pady=2)
                ctk.CTkLabel(ff, text=f"{ico}  {nombre}",
                             font=("Consolas", 11, "bold"), text_color="#2b9eff").pack(anchor="w", padx=12, pady=(6,0))
                ctk.CTkLabel(ff, text=desc, font=("Consolas", 9), text_color="#888",
                             justify="left").pack(anchor="w", padx=20, pady=(0,6))

            # Estados
            ctk.CTkLabel(w, text="ESTADOS / COLORES",
                         font=("Consolas", 11, "bold"), text_color="#888").pack(anchor="w", padx=20, pady=(10,2))

            estados_info = [
                ("⬛", "#333355", "IDLE",     "Aún no iniciado — en espera"),
                ("🔵", "#2b9eff", "ACTIVO",   "Ejecutándose ahora — neon azul pulsante"),
                ("🟢", "#00ff44", "OK",       "Completado con éxito — explosión verde"),
                ("🟡", "#ff9900", "OMITIDO",  "Falló pero el proceso continúa — solo para Drive"),
                ("🔴", "#ff3333", "ERROR",    "Error crítico — proceso detenido"),
            ]
            for ico, color, estado, desc in estados_info:
                fe = ctk.CTkFrame(w, fg_color="#0a1118", corner_radius=8)
                fe.pack(fill="x", padx=20, pady=2)
                frow = ctk.CTkFrame(fe, fg_color="transparent")
                frow.pack(fill="x", padx=12, pady=6)
                ctk.CTkLabel(frow, text=ico, font=("Arial", 18)).pack(side="left", padx=(0,8))
                ctk.CTkLabel(frow, text=estado, font=("Consolas", 11, "bold"),
                             text_color=color, width=80).pack(side="left")
                ctk.CTkLabel(frow, text=desc, font=("Consolas", 9),
                             text_color="#888").pack(side="left", padx=8)

            ctk.CTkButton(w, text="Entendido", command=w.destroy,
                          fg_color="#2b78e4", width=160,
                          font=("Arial", 12, "bold")).pack(pady=12)

        ctk.CTkButton(frame_tl_hdr, text="ℹ️ Guía de estados", width=130, height=24,
                      font=("Consolas", 9), fg_color="#163861", hover_color="#1f4d80",
                      command=_infomodal_timeline).pack(side="right")

        self.frame_timeline = ctk.CTkFrame(self, fg_color="#080f18",
                                            corner_radius=10, border_width=1,
                                            border_color="#1a3d61")
        self.frame_timeline.pack(fill="x", padx=20, pady=(2, 2))

        self.fases = [
            ("login",     "🔐", "Login\nFracttal"),
            ("descarga",  "📡", "Extrayendo\ndatos"),
            ("proceso",   "⚙️", "Procesando\ndatos"),
            ("drive",     "📁", "Google\nDrive"),
            ("truncate",  "🗑️", "Limpiando\ntabla"),
            ("insertar",  "📤", "Inyectando\ndatos"),
            ("fin",       "🏁", "Completado"),
        ]
        self._fase_widgets = {}
        self._fase_estado  = {}  # "idle" | "activo" | "ok" | "error"
        self._fase_tick    = {}

        # Construir widgets de la línea de tiempo
        for i, (key, ico, label) in enumerate(self.fases):
            col_frame = ctk.CTkFrame(self.frame_timeline, fg_color="transparent")
            col_frame.pack(side="left", expand=True, pady=6)

            # Canvas del ícono (44x44)
            cv = tk.Canvas(col_frame, width=44, height=44,
                           bg="#080f18", highlightthickness=0)
            cv.pack()

            # Label del texto
            lbl = ctk.CTkLabel(col_frame, text=label,
                                font=("Consolas", 8), text_color="#333355",
                                justify="center")
            lbl.pack()

            # Conector (excepto en el último)
            if i < len(self.fases) - 1:
                sep = ctk.CTkFrame(self.frame_timeline, width=2, height=30,
                                    fg_color="#1a3d61")
                # No lo ponemos aquí — va entre columnas

            self._fase_widgets[key] = (cv, lbl, ico)
            self._fase_estado[key]  = "idle"
            self._fase_tick[key]    = 0

        # Iniciar loop de animación de timeline
        threading.Thread(target=self._timeline_loop, daemon=True).start()
        self._timeline_activo = True

        ctk.CTkFrame(self, height=1, fg_color="#2a2a2a").pack(fill="x", padx=20, pady=(2, 4))
        self.log = ctk.CTkTextbox(self, width=740, height=380,
                                   font=("Consolas", 11), fg_color="#0a1118",
                                   text_color="#cccccc", border_color="#163861",
                                   border_width=1, corner_radius=8)
        self.log.pack(pady=4, padx=20)

    # ── Config ──────────────────────────────────────────────────
    def _cargar_config_json(self):
        if os.path.exists(PATH_CONFIG):
            try:
                with open(PATH_CONFIG, 'r', encoding='utf-8') as f:
                    guardado = json.load(f)
                for k, v in guardado.items():
                    self.config[k] = v
                for k, v in CONFIG_DEFAULTS.items():
                    if k not in self.config or self.config[k] == "":
                        if v != "":
                            self.config[k] = v
            except Exception:
                pass

    def _guardar_config_json(self):
        try:
            with open(PATH_CONFIG, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=4, ensure_ascii=False)
        except Exception as e:
            self.escribir_log(f"⚠️  [CONFIG] No se pudo guardar: {e}")

    def _cargar_ui_desde_config(self):
        def _s(e, v, readonly=False):
            if readonly: e.configure(state="normal")
            e.delete(0, "end"); e.insert(0, v)
            if readonly: e.configure(state="readonly")
        _s(self.ent_i,  self.config.get("fec_ini", CONFIG_DEFAULTS["fec_ini"]), readonly=True)
        _s(self.ent_f,  self.config.get("fec_fin",  CONFIG_DEFAULTS["fec_fin"]), readonly=True)
        _s(self.ent_h1, self.config.get("hora1", "08:00"))
        _s(self.ent_h2, self.config.get("hora2", "13:00"))
        _s(self.ent_h3, self.config.get("hora3", "18:00"))
        _s(self.ent_intervalo, self.config.get("intervalo", "30"))
        unidad = self.config.get("unidad_int", "minutos")
        self.combo_intervalo.set(unidad)
        self.modo_auto_var.set(self.config.get("modo_auto", "HORAS"))
        self._actualizar_modo_auto()

    def _guardar_todo(self):
        self.config.update({
            "fec_ini":    self.ent_i.get(),
            "fec_fin":    self.ent_f.get(),
            "hora1":      self.ent_h1.get(),
            "hora2":      self.ent_h2.get(),
            "hora3":      self.ent_h3.get(),
            "modo_auto":  self.modo_auto_var.get(),
            "intervalo":  self.ent_intervalo.get(),
            "unidad_int": self.combo_intervalo.get(),
        })
        self._guardar_config_json()
        modo = self.modo_auto_var.get()
        if modo == "INTERVALO":
            self.escribir_log(f"💾  [CONFIG] Guardado — Intervalo: cada {self.ent_intervalo.get()} {self.combo_intervalo.get()}")
        else:
            self.escribir_log(f"💾  [CONFIG] Guardado — Horas: {self.ent_h1.get()} / {self.ent_h2.get()} / {self.ent_h3.get()}")
        self.escribir_log(f"   📅 Inicio: {self.ent_i.get()}  │  Fin: {self.ent_f.get()}")

    def _abrir_config(self):
        """Abre configuración directamente."""
        VentanaConfiguracion(self)


    def _activar_alerta(self, tipo, msg=""):
        if tipo not in self._alertas_widgets: return
        f_a, lbl_ico, lbl_txt, ico_orig, color = self._alertas_widgets[tipo]
        self._alertas_activas.add(tipo)
        lbl_txt.configure(text=f"{tipo.upper()} {msg[:15]}" if msg else tipo.upper())
        f_a.pack(side="left", padx=4, pady=2)
        if not self._parpadeo_activo:
            self._parpadeo_activo = True
            threading.Thread(target=self._loop_parpadeo, daemon=True).start()
        self.update()

    def _desactivar_alerta(self, tipo):
        self._alertas_activas.discard(tipo)
        if tipo in self._alertas_widgets:
            self._alertas_widgets[tipo][0].pack_forget()
        if not self._alertas_activas:
            self._parpadeo_activo = False
        self.update()

    def _desactivar_todas_alertas(self):
        for tipo in list(self._alertas_widgets.keys()):
            self._desactivar_alerta(tipo)

    def _loop_parpadeo(self):
        tick = 0
        while self._parpadeo_activo and self._alertas_activas:
            for tipo in list(self._alertas_activas):
                if tipo not in self._alertas_widgets: continue
                _, lbl_ico, _, ico_orig, _ = self._alertas_widgets[tipo]
                try:
                    lbl_ico.configure(text=ico_orig if tick % 2 == 0 else "⚠️")
                except Exception: pass
            try: self.update()
            except Exception: break
            tick += 1
            time.sleep(0.6)

    # ── Copiar log ───────────────────────────────────────────────
    def _copiar_log(self):
        """Copia todo el contenido del log al portapapeles."""
        try:
            texto = self.log.get("1.0", "end").strip()
            self.clipboard_clear()
            self.clipboard_append(texto)
            # Feedback visual temporal
            for w in self.winfo_children():
                for ww in w.winfo_children() if hasattr(w, 'winfo_children') else []:
                    try:
                        if hasattr(ww, 'cget') and "COPIAR" in str(ww.cget("text")):
                            ww.configure(text="✅ COPIADO!", fg_color="#00aa33")
                            self.after(2000, lambda: ww.configure(
                                text="📋 COPIAR LOG", fg_color="#163861"))
                    except Exception:
                        pass
            self.escribir_log("📋 [LOG] Copiado al portapapeles.")
        except Exception as e:
            self.escribir_log(f"⚠️  [LOG] No se pudo copiar: {e}")

    # ── Log ─────────────────────────────────────────────────────
    def escribir_log(self, texto):
        ts = datetime.now().strftime('%H:%M:%S')
        self.log.insert("end", f"[{ts}] {texto}\n")
        self.log.see("end")
        self.update()

    def _sep(self):
        self.escribir_log("━" * 62)

    # ── Reiniciar ────────────────────────────────────────────────
    def _reiniciar(self):
        self.escribir_log("🔄 Reiniciando aplicación...")
        self.update(); time.sleep(1)
        subprocess.Popen([sys.executable] + sys.argv)
        os._exit(0)

    # ── Timeline de fases ───────────────────────────────────────
    def _set_fase(self, key, estado):
        """estado: idle | activo | ok | error"""
        if key in self._fase_estado:
            self._fase_estado[key] = estado
            self._fase_tick[key]   = 0

    def _reset_timeline(self):
        """Resetea todas las fases a idle."""
        for key in self._fase_estado:
            self._fase_estado[key] = "idle"
            self._fase_tick[key]   = 0

    def _timeline_loop(self):
        import math
        COLORES = {
            "idle":   {"bg": "#0a0f18", "borde": "#1a2a44", "txt": "#333355", "glow": []},
            "activo": {"bg": "#0a1a2e", "borde": "#2b9eff", "txt": "#2b9eff",
                       "glow": ["#0a2040", "#0a3060", "#0a4080"]},
            "ok":     {"bg": "#001a0a", "borde": "#00ff44", "txt": "#00ff44",
                       "glow": ["#002010", "#003018", "#004020"]},
            "skip":   {"bg": "#1a0e00", "borde": "#ff9900", "txt": "#ff9900",
                       "glow": ["#200e00", "#301500"]},
            "error":  {"bg": "#1a0000", "borde": "#ff3333", "txt": "#ff3333",
                       "glow": ["#200000", "#300000"]},
        }
        tick = 0
        while True:
            try:
                for key, (cv, lbl, ico_orig) in self._fase_widgets.items():
                    estado = self._fase_estado.get(key, "idle")
                    col    = COLORES[estado]
                    t      = self._fase_tick.get(key, 0)
                    self._fase_tick[key] = t + 1
                    cx, cy = 22, 22

                    cv.delete("all")

                    if estado == "idle":
                        # Círculo gris apagado
                        cv.create_oval(4, 4, 40, 40, fill="#0a0f18",
                                       outline="#1a2a44", width=1)
                        cv.create_text(cx, cy, text=ico_orig,
                                       font=("Arial", 16), fill="#222244")

                    elif estado == "activo":
                        # Pulso neon animado
                        pulso = abs(math.sin(t * 0.15)) 
                        r_glow = int(18 + pulso * 6)
                        # Glow exterior pulsante
                        for g, gcol in enumerate(["#0a2040","#0a3060","#1a4880"]):
                            offset = g * 2
                            cv.create_oval(cx-r_glow-offset, cy-r_glow-offset,
                                           cx+r_glow+offset, cy+r_glow+offset,
                                           fill="", outline=gcol, width=1)
                        # Círculo principal
                        cv.create_oval(4, 4, 40, 40,
                                       fill="#0a1a3a", outline="#2b9eff", width=2)
                        # Ícono parpadeante
                        alpha = "#2b9eff" if (t // 4) % 2 == 0 else "#88ccff"
                        cv.create_text(cx, cy-2, text=ico_orig,
                                       font=("Arial", 16), fill=alpha)
                        # Puntos giratorios
                        for d in range(4):
                            ang = math.radians(t * 8 + d * 90)
                            px = cx + 17 * math.cos(ang)
                            py = cy + 17 * math.sin(ang)
                            cv.create_oval(px-2, py-2, px+2, py+2,
                                           fill="#2b9eff", outline="")
                        lbl.configure(text_color="#2b9eff")

                    elif estado == "ok":
                        # Resplandor verde explosivo al inicio, luego estable
                        if t < 20:
                            # Explosión inicial de luz
                            intensidad = 1.0 - (t / 20)
                            r_exp = int(18 + intensidad * 10)
                            for g, gcol in enumerate(["#004020","#006030","#00aa44"]):
                                offset = g * 3
                                cv.create_oval(cx-r_exp-offset, cy-r_exp-offset,
                                               cx+r_exp+offset, cy+r_exp+offset,
                                               fill="", outline=gcol, width=2)
                        # Glow estable pulsante suave
                        pulso_ok = abs(math.sin(t * 0.08)) * 0.4 + 0.6
                        for g, gcol in enumerate(["#002010","#003818","#005525"]):
                            cv.create_oval(4-g, 4-g, 40+g, 40+g,
                                           fill="", outline=gcol, width=1)
                        cv.create_oval(4, 4, 40, 40,
                                       fill="#001a08", outline="#00ff44", width=2)
                        # Check animado
                        alpha_ok = "#00ff44" if int(pulso_ok * 10) % 2 == 0 else "#88ffaa"
                        cv.create_text(cx, cy-2, text="✅",
                                       font=("Arial", 16), fill=alpha_ok)
                        # Partículas giratorias suaves
                        for d in range(3):
                            ang = math.radians(t * 3 + d * 120)
                            px = cx + 16 * math.cos(ang)
                            py = cy + 16 * math.sin(ang)
                            cv.create_oval(px-1.5, py-1.5, px+1.5, py+1.5,
                                           fill="#00ff44", outline="")
                        lbl.configure(text_color="#00ff44")

                    elif estado == "skip":
                        # Naranja ámbar — omitido, proceso continúa
                        import math as _math
                        pulso_skip = abs(_math.sin(t * 0.1)) * 0.5 + 0.5
                        # Glow naranja suave
                        for g, gcol in enumerate(["#1a0800", "#2a1200", "#3a1e00"]):
                            cv.create_oval(4-g, 4-g, 40+g, 40+g,
                                           fill="", outline=gcol, width=1)
                        cv.create_oval(4, 4, 40, 40,
                                       fill="#120800", outline="#ff9900", width=2)
                        # Ícono warning parpadeante suave
                        alpha_skip = "#ff9900" if int(pulso_skip * 10) % 2 == 0 else "#ffcc44"
                        cv.create_text(cx, cy-2, text="⚠️",
                                       font=("Arial", 16), fill=alpha_skip)
                        # Label especial
                        lbl.configure(text="Google\nOmitido", text_color="#ff9900")

                    elif estado == "error":
                        # Rojo parpadeante
                        if (t // 6) % 2 == 0:
                            cv.create_oval(2, 2, 42, 42,
                                           fill="", outline="#ff3333", width=2)
                            cv.create_oval(4, 4, 40, 40,
                                           fill="#1a0000", outline="#ff6666", width=1)
                            cv.create_text(cx, cy-2, text="❌",
                                           font=("Arial", 16), fill="#ff3333")
                        else:
                            cv.create_oval(4, 4, 40, 40,
                                           fill="#0a0000", outline="#551111", width=1)
                            cv.create_text(cx, cy-2, text="❌",
                                           font=("Arial", 16), fill="#551111")
                        lbl.configure(text_color="#ff3333")

                self.update()
            except Exception:
                break
            tick += 1
            time.sleep(0.05)  # 20fps

    # ── Animación de iconos neon ─────────────────────────────────
    def _dibujar_gear(self, angulo=0, parado=False):
        """Dibuja un robot corriendo (bot activo) o parado (idle) con neon."""
        import math, tkinter as tk
        c  = self._canvas_bot
        c.delete("all")
        cx, cy = 24, 24

        if parado:
            # ── Robot parado — gris apagado ──
            # Cabeza
            c.create_rectangle(14,3, 34,13, fill="#1a1a2e", outline="#333355", width=1)
            c.create_oval(16,5, 20,9,  fill="#222244", outline="#333366")
            c.create_oval(28,5, 32,9,  fill="#222244", outline="#333366")
            # Cuerpo
            c.create_rectangle(12,14, 36,27, fill="#111122", outline="#333355", width=1)
            # Brazos
            c.create_rectangle(5,15,  12,22, fill="#111122", outline="#333355", width=1)
            c.create_rectangle(36,15, 43,22, fill="#111122", outline="#333355", width=1)
            # Piernas
            c.create_rectangle(14,27, 20,38, fill="#111122", outline="#333355", width=1)
            c.create_rectangle(28,27, 34,38, fill="#111122", outline="#333355", width=1)
            c.create_text(cx, 44, text="OFF", fill="#333355", font=("Consolas",6))

        else:
            # ── Robot corriendo — neon azul animado ──
            ang_r = math.radians(angulo)
            # Glow exterior pulsante
            for g, gcol in enumerate(["#0a1a40","#0a2860","#0a3880"]):
                c.create_oval(2-g, 2-g, 42+g, 42+g, fill="", outline=gcol, width=1)

            # Glow
            for g, gcol in enumerate(["#0a1a40","#0a2860"]):
                c.create_oval(1-g,1-g, 47+g,47+g, fill="", outline=gcol, width=1)
            # Antena
            c.create_line(cx, 1, cx, 5, fill="#2b9eff", width=2)
            ant_col = "#00ffff" if (angulo//6)%2==0 else "#2b9eff"
            c.create_oval(cx-2,1, cx+2,5, fill=ant_col, outline="")
            # Cabeza
            c.create_rectangle(14,5, 34,14, fill="#0a1a3a", outline="#2b9eff", width=2)
            ojo_col = "#00ffff" if (angulo//8)%2==0 else "#2b9eff"
            c.create_oval(16,7, 20,11, fill=ojo_col, outline="")
            c.create_oval(28,7, 32,11, fill=ojo_col, outline="")
            # Cuerpo
            c.create_rectangle(12,15, 36,29, fill="#0a1a3a", outline="#2b9eff", width=2)
            c.create_text(cx, 22, text="⚡", font=("Arial",9), fill="#00ffff")
            # Brazos
            ab = math.sin(ang_r*2)*0.5
            bx1 = int(12+math.sin(ab)*7)
            c.create_line(12,20, bx1,26, fill="#2b9eff", width=2, capstyle=tk.ROUND)
            ab2 = math.sin(ang_r*2+math.pi)*0.5
            bx2 = int(36-math.sin(ab2)*7)
            c.create_line(36,20, bx2,26, fill="#2b9eff", width=2, capstyle=tk.ROUND)
            # Piernas
            pa1 = math.sin(ang_r*2)*0.6
            px1 = int(18+math.sin(pa1)*6)
            c.create_line(18,29, px1,40, fill="#2b9eff", width=2, capstyle=tk.ROUND)
            c.create_line(px1,40, px1+2,45, fill="#2b9eff", width=2)
            pa2 = math.sin(ang_r*2+math.pi)*0.6
            px2 = int(30+math.sin(pa2)*6)
            c.create_line(30,29, px2,40, fill="#2b9eff", width=2, capstyle=tk.ROUND)
            c.create_line(px2,40, px2+2,45, fill="#2b9eff", width=2)
            c.create_text(cx, 47, text="ON", fill="#00ffff", font=("Consolas",6,"bold"))

    def _dibujar_auto(self, angulo=0, activo=False):
        """Dibuja engranajes girando (autopiloto activo) o pausa (inactivo) con neon naranja."""
        import math
        c  = self._canvas_auto
        c.delete("all")
        cx, cy = 24, 24

        if not activo:
            # ── Pausa — gris ──
            c.create_oval(3,3, 45,45, fill="#0a0800", outline="#333322", width=1)
            c.create_rectangle(13,12, 19,34, fill="#222211", outline="#333322")
            c.create_rectangle(29,12, 35,34, fill="#222211", outline="#333322")
            c.create_text(cx, 44, text="OFF", fill="#333322", font=("Consolas",6))
        else:
            # ── Engranajes girando neon naranja ──
            import math as _m

            def _gear(cv, cx, cy, r, dientes, ang, color, color2, r_inner=None):
                if r_inner is None: r_inner = r * 0.55
                # Glow
                for g in range(3,0,-1):
                    cv.create_oval(cx-r-g-1, cy-r-g-1, cx+r+g+1, cy+r+g+1,
                                   fill="", outline=color2, width=1)
                # Dientes
                pts = []
                for i in range(dientes*2):
                    radio = (r+4) if i%2==0 else (r)
                    a = _m.radians(ang + i*180/dientes)
                    pts.extend([cx+radio*_m.cos(a), cy+radio*_m.sin(a)])
                cv.create_polygon(pts, fill=color, outline=color, smooth=False)
                # Círculo central
                cv.create_oval(cx-r, cy-r, cx+r, cy+r,
                               fill="#0a0800", outline=color, width=2)
                # Agujero
                cv.create_oval(cx-r_inner, cy-r_inner, cx+r_inner, cy+r_inner,
                               fill="#050500", outline=color2, width=1)

            # Engranaje grande
            _gear(c, 18, 22, 13, 8, angulo, "#e4a02b", "#ffcc44")
            _gear(c, 36, 13, 8, 6, -angulo*1.5, "#ff7700", "#ffaa33", r_inner=3)
            if (angulo//5)%2==0:
                c.create_oval(2,2, 46,46, fill="", outline="#ff9900", width=1)
            sang = math.radians(angulo*3)
            sx = int(18+15*math.cos(sang))
            sy = int(22+15*math.sin(sang))
            c.create_oval(sx-2,sy-2,sx+2,sy+2, fill="#ffff00", outline="")
            c.create_text(cx, 46, text="AUTO", fill="#e4a02b",
                          font=("Consolas",6,"bold"))

    def _animacion_loop(self):
        """Loop de animación a 20fps para robot y engranajes."""
        while True:
            try:
                if self._gear_activo:
                    self._angulo_gear = (self._angulo_gear + 5) % 360
                    self._dibujar_gear(angulo=self._angulo_gear, parado=False)
                else:
                    self._dibujar_gear(parado=True)

                if self._auto_activo_anim:
                    self._angulo_auto = (self._angulo_auto + 4) % 360
                    self._dibujar_auto(angulo=self._angulo_auto, activo=True)
                else:
                    self._dibujar_auto(activo=False)

                self.update()
            except Exception:
                break
            time.sleep(0.05)  # 20fps

    # ── Parpadeo icono bot corriendo (reemplazado por animación) ─
    def _parpadeo_bot(self):
        pass


    # ── Detector de versión Fracttal ─────────────────────────────
    def _verificar_version_fracttal_bg(self):
        """Verifica en background si Fracttal cambió su versión."""
        time.sleep(5)  # esperar que la UI cargue
        try:
            import requests as _req
            # Hacer una petición a Fracttal y leer el header x-version de la respuesta
            r = _req.get("https://one.fracttal.com", timeout=10,
                         headers={"User-Agent": "Mozilla/5.0"})
            # Buscar x-version en headers de respuesta
            version_server = r.headers.get("x-version", "")

            # También intentar detectarla del contenido HTML
            if not version_server:
                import re
                matches = re.findall(r'Fracttal/([0-9]+[.][0-9]+[.][0-9]+)', r.text)
                if matches:
                    version_server = f"Fracttal/{matches[0]} web"

            version_config = self.config.get("x_version", "Fracttal/5.8.04 web")

            if version_server and version_server != version_config:
                self._version_detectada = version_server
                self._activar_alerta_version(version_config, version_server)
                self.escribir_log(f"⚠️  [VERSIÓN] Fracttal actualizó: {version_config} → {version_server}")
                self.escribir_log(f"   → Presiona ⚠️ en el header para ver los pasos de actualización")
            else:
                self.escribir_log(f"✅ [VERSIÓN] Fracttal {version_config} — sin cambios detectados.")
        except Exception as e:
            # No mostrar error si no hay internet — silencioso
            pass

    def _activar_alerta_version(self, version_vieja, version_nueva):
        """Muestra el botón ⚠️ y lo hace parpadear."""
        self._version_alerta_activa = True
        try:
            self.btn_alerta_version.pack(side="right", padx=(0,6))
        except Exception:
            pass
        # Parpadeo del botón
        threading.Thread(target=self._parpadeo_version, daemon=True).start()

    def _parpadeo_version(self):
        """Hace parpadear el botón de alerta de versión."""
        colores = ["#ff6600", "#ffaa00", "#ff3300", "#ffcc00"]
        idx = 0
        while self._version_alerta_activa:
            try:
                color = colores[idx % len(colores)]
                self.btn_alerta_version.configure(
                    border_color=color, text_color=color)
                self.update()
            except Exception:
                break
            idx += 1
            time.sleep(0.4)

    def _mostrar_alerta_version(self):
        """Muestra el modal con pasos para actualizar la versión."""
        if hasattr(self, '_win_alerta_ver') and            self._win_alerta_ver and            self._win_alerta_ver.winfo_exists():
            self._win_alerta_ver.lift()
            return

        w = ctk.CTkToplevel(self)
        self._win_alerta_ver = w
        w.title("⚠️  Alerta — Nueva versión de Fracttal")
        w.geometry("560x580")
        w.resizable(False, False)
        w.attributes("-topmost", True)

        # Header
        ctk.CTkLabel(w, text="⚠️  Nueva versión detectada",
                     font=("Impact", 20), text_color="#ff6600").pack(pady=(16,4))
        ctk.CTkFrame(w, height=1, fg_color="#ff6600").pack(fill="x", padx=20, pady=(0,10))

        # Info de versiones
        f_ver = ctk.CTkFrame(w, fg_color="#1a0800", corner_radius=10,
                              border_width=1, border_color="#ff6600")
        f_ver.pack(fill="x", padx=20, pady=6)

        version_config = self.config.get("x_version", "Fracttal/5.8.04 web")
        version_nueva  = self._version_detectada or "Desconocida"

        ctk.CTkLabel(f_ver, text="📋  Cambio detectado:",
                     font=("Consolas", 11, "bold"),
                     text_color="#ff9900").pack(anchor="w", padx=14, pady=(10,4))

        fg_ver = ctk.CTkFrame(f_ver, fg_color="transparent")
        fg_ver.pack(fill="x", padx=14, pady=(0,10))
        ctk.CTkLabel(fg_ver, text=f"❌  Versión actual del bot : {version_config}",
                     font=("Consolas", 11), text_color="#ff4444").pack(anchor="w")
        ctk.CTkLabel(fg_ver, text=f"✅  Versión nueva de Fracttal: {version_nueva}",
                     font=("Consolas", 11), text_color="#00ff44").pack(anchor="w")

        # Impacto
        f_imp = ctk.CTkFrame(w, fg_color="#0a0a00", corner_radius=10,
                              border_width=1, border_color="#ffaa00")
        f_imp.pack(fill="x", padx=20, pady=6)
        ctk.CTkLabel(f_imp, text="🔴  ¿Qué puede pasar si no actualizas?",
                     font=("Consolas", 11, "bold"),
                     text_color="#ffaa00").pack(anchor="w", padx=14, pady=(10,4))
        impactos = [
            "• El bot puede empezar a recibir error 403 (acceso denegado)",
            "• Fracttal puede rechazar el header x-version desactualizado",
            "• Las peticiones de extracción pueden fallar silenciosamente",
            "• Los datos en Supabase dejarán de actualizarse",
        ]
        for imp in impactos:
            ctk.CTkLabel(f_imp, text=imp, font=("Consolas", 10),
                         text_color="#888").pack(anchor="w", padx=20, pady=1)
        ctk.CTkLabel(f_imp, text="", height=6).pack()

        # Pasos de solución
        f_sol = ctk.CTkFrame(w, fg_color="#001a00", corner_radius=10,
                              border_width=1, border_color="#00aa33")
        f_sol.pack(fill="x", padx=20, pady=6)
        ctk.CTkLabel(f_sol, text="✅  Pasos para actualizar (2 minutos):",
                     font=("Consolas", 11, "bold"),
                     text_color="#00ff44").pack(anchor="w", padx=14, pady=(10,4))
        pasos = [
            f"1. Abre Fracttal en Chrome y entra a Solicitudes",
            f"2. Presiona F12 → pestaña Network → recarga con F5",
            f"3. Filtra por 'proxy' → clic en cualquier petición",
            f"4. En Headers busca el campo 'x-version'",
            f"5. Copia el valor (ej: {version_nueva})",
            f"6. En el bot: ⚙️ → Token Manual → campo 'Versión'",
            f"7. Pega el nuevo valor y presiona 'Guardar y cerrar'",
            f"8. El bot usará la nueva versión automáticamente",
        ]
        for paso in pasos:
            ctk.CTkLabel(f_sol, text=paso, font=("Consolas", 10),
                         text_color="#aaaaaa").pack(anchor="w", padx=20, pady=1)
        ctk.CTkLabel(f_sol, text="", height=6).pack()

        # Botones
        f_btns = ctk.CTkFrame(w, fg_color="transparent")
        f_btns.pack(pady=10)

        def _actualizar_ahora():
            """Abre directamente la pestaña de Token Manual en configuración."""
            w.destroy()
            self._version_alerta_activa = False
            try:
                self.btn_alerta_version.pack_forget()
            except Exception:
                pass
            cfg_win = VentanaConfiguracion(self)
            cfg_win.mostrar_seccion(3)  # pestaña Token Manual

        ctk.CTkButton(f_btns, text="⚙️ Actualizar ahora", width=180, height=38,
                      font=("Arial", 12, "bold"), fg_color="#00aa33",
                      hover_color="#007722",
                      command=_actualizar_ahora).pack(side="left", padx=8)

        ctk.CTkButton(f_btns, text="Ignorar", width=100, height=38,
                      font=("Arial", 12), fg_color="#2a2a2a",
                      hover_color="#444",
                      command=lambda: [w.destroy(),
                                       setattr(self, '_version_alerta_activa', False),
                                       self.btn_alerta_version.pack_forget()]
                      ).pack(side="left", padx=8)

    # ── Análisis de errores con IA ──────────────────────────────
    def _analizar_error_hilo(self):
        threading.Thread(target=self._analizar_error, daemon=True).start()

    def _analizar_error(self):
        """Analiza el último error y muestra diagnóstico + solución."""
        if hasattr(self, '_win_analisis') and self._win_analisis and self._win_analisis.winfo_exists():
            self._win_analisis.lift()
            return

        w = ctk.CTkToplevel(self)
        self._win_analisis = w
        w.title("🔍 Análisis de Error")
        w.geometry("580x500")
        w.resizable(False, True)
        w.attributes("-topmost", True)

        ctk.CTkLabel(w, text="🔍  Diagnóstico de Error",
                     font=("Impact", 18), text_color="#ff4444").pack(pady=(16,4))
        ctk.CTkFrame(w, height=1, fg_color="#ff3333").pack(fill="x", padx=20, pady=(0,8))

        # Error detectado
        ctk.CTkLabel(w, text="❌ Error detectado:",
                     font=("Consolas", 10, "bold"), text_color="#ff6666").pack(anchor="w", padx=20)
        err_box = ctk.CTkTextbox(w, width=540, height=60, font=("Consolas", 10),
                                  fg_color="#1a0000", text_color="#ff9999")
        err_box.pack(padx=20, pady=4)
        err_box.insert("1.0", self._ultimo_error or "Sin error registrado")
        err_box.configure(state="disabled")

        # Diagnóstico
        ctk.CTkLabel(w, text="🔎 Diagnóstico y solución:",
                     font=("Consolas", 10, "bold"), text_color="#2b9eff").pack(anchor="w", padx=20, pady=(8,2))
        diag_box = ctk.CTkTextbox(w, width=540, height=280, font=("Consolas", 10),
                                   fg_color="#0a1118", text_color="#cccccc")
        diag_box.pack(padx=20, pady=4)

        error = self._ultimo_error.lower()
        diagnosticos = []

        # Detectar tipo de error y dar solución específica
        if "token" in error and ("not associated" in error or "variable" in error):
            diagnosticos.append(("🔐 CAUSA: Variable token no inicializada", [
                "El bloque de autenticación falló antes de obtener el token.",
                "Esto ocurre cuando el modo AUTO no pudo hacer login",
                "y tampoco hay un token manual configurado.",
                "",
                "✅ SOLUCIONES:",
                "1. Ve a ⚙️ → Token Manual → pega un token fresco del browser",
                "2. Ve a ⚙️ → Credenciales → verifica usuario y hash MD5",
                "3. Verifica que tienes internet y Fracttal está disponible",
                "4. Prueba: md5hashgenerator.com con tu contraseña actual",
            ]))
        if "403" in error or "forbidden" in error:
            diagnosticos.append(("🚫 CAUSA: Acceso denegado (HTTP 403)", [
                "Fracttal rechazó la petición del bot.",
                "",
                "✅ SOLUCIONES:",
                "1. El token JWT expiró (vigencia ~12 horas)",
                "   → Ve a ⚙️ → Token Manual → actualiza el token",
                "2. La cookie de sesión expiró",
                "   → Ve a ⚙️ → Token Manual → actualiza la cookie",
                "3. El hash MD5 puede haber cambiado si actualizaste tu contraseña",
                "   → Regenera el hash en md5hashgenerator.com",
            ]))
        if "permission denied" in error or "errno 13" in error:
            diagnosticos.append(("📁 CAUSA: Sin permisos de escritura", [
                "El bot no puede guardar el archivo de configuración.",
                "",
                "✅ SOLUCIONES:",
                "1. Mueve el archivo .py a una carpeta con permisos:",
                "   C:/Users/TuUsuario/Desktop/BOTS/",
                "2. Ejecuta el bot como Administrador (clic derecho → Ejecutar como admin)",
                "3. Verifica que la carpeta no está en Program Files",
            ]))
        if "timeout" in error or "timed out" in error:
            diagnosticos.append(("⏱️ CAUSA: Tiempo de espera agotado", [
                "Supabase o Fracttal tardaron demasiado en responder.",
                "",
                "✅ SOLUCIONES:",
                "1. Verifica tu conexión a internet",
                "2. Espera 5 minutos y vuelve a intentar",
                "3. Si es Supabase: ve a dashboard.supabase.com y verifica el estado",
                "4. Ejecuta el SQL en Supabase: ALTER ROLE postgres SET statement_timeout = '60s';",
            ]))
        if "connection" in error:
            diagnosticos.append(("🌐 CAUSA: Error de conexión", [
                "No se pudo conectar a Fracttal o Supabase.",
                "",
                "✅ SOLUCIONES:",
                "1. Verifica tu conexión a internet",
                "2. Verifica que one.fracttal.com está disponible",
                "3. Verifica que tu proyecto Supabase está activo",
                "   → dashboard.supabase.com → tu proyecto → debe decir 'Active'",
            ]))
        if "none" in error and "attribute" in error:
            diagnosticos.append(("🔑 CAUSA: Respuesta vacía de la API", [
                "La API devolvió None en vez de datos esperados.",
                "",
                "✅ SOLUCIONES:",
                "1. El hash MD5 de la contraseña es incorrecto",
                "   → Genera el hash correcto en: md5hashgenerator.com",
                "2. Las credenciales en ⚙️ no coinciden con tu cuenta de Fracttal",
                "3. Tu sesión de Fracttal puede haber expirado",
            ]))

        if not diagnosticos:
            diagnosticos.append(("⚠️ ERROR NO RECONOCIDO", [
                "No se encontró un diagnóstico específico para este error.",
                "",
                "✅ PASOS GENERALES:",
                "1. Copia el error y búscalo en Google",
                "2. Verifica tu conexión a internet",
                "3. Reinicia el bot con el botón 🔄 REINICIAR APP",
                "4. Si persiste, revisa la configuración en ⚙️",
                "5. Verifica que Fracttal y Supabase estén disponibles",
            ]))

        # Mostrar diagnósticos
        for titulo, pasos in diagnosticos:
            diag_box.insert("end", "\n" + titulo + "\n" + "-"*50 + "\n")
            for paso in pasos:
                diag_box.insert("end", "  " + paso + "\n")

        diag_box.configure(state="disabled")

        ctk.CTkButton(w, text="Cerrar", command=w.destroy,
                      fg_color="#2a2a2a", width=120,
                      font=("Arial", 12)).pack(pady=10)

    # ── Popup informativo de autopiloto ─────────────────────────
    def _mostrar_popup_autopiloto(self, f_ini, modo):
        """Muestra un popup con la configuración del autopiloto al activarse."""
        w = ctk.CTkToplevel(self)
        w.title("⏳ Autopiloto activado")
        w.geometry("500x420")
        w.resizable(False, False)
        w.attributes("-topmost", True)

        ctk.CTkLabel(w, text="⏳  Autopiloto Activado",
                     font=("Impact", 20), text_color="#e4a02b").pack(pady=(16,4))
        ctk.CTkFrame(w, height=1, fg_color="#e4a02b").pack(fill="x", padx=20, pady=(0,10))

        # ── Fecha INICIO ──
        f_ini_frame = ctk.CTkFrame(w, fg_color="#0a1a00", corner_radius=10,
                                    border_width=1, border_color="#00aa33")
        f_ini_frame.pack(fill="x", padx=20, pady=6)
        ctk.CTkLabel(f_ini_frame, text="📅  Fecha de INICIO — FIJA",
                     font=("Consolas", 12, "bold"), text_color="#00ff44").pack(anchor="w", padx=14, pady=(10,2))
        ctk.CTkLabel(f_ini_frame,
                     text=f"  {f_ini}  00:00:00",
                     font=("Consolas", 16, "bold"), text_color="#ffffff").pack(anchor="w", padx=14, pady=(0,4))
        ctk.CTkLabel(f_ini_frame,
                     text="Esta fecha NO cambia — es el punto de inicio histórico de la extracción.",
                     font=("Consolas", 9), text_color="#666", justify="left").pack(anchor="w", padx=14, pady=(0,10))

        # ── Fecha FIN ──
        from datetime import datetime as _dt
        hoy     = _dt.now().strftime("%Y-%m-%d")
        hora    = _dt.now().strftime("%H:%M:%S")
        f_fin_frame = ctk.CTkFrame(w, fg_color="#001a1a", corner_radius=10,
                                    border_width=1, border_color="#2b9eff")
        f_fin_frame.pack(fill="x", padx=20, pady=6)
        ctk.CTkLabel(f_fin_frame, text="📅  Fecha de FIN — DINÁMICA (se actualiza en cada disparo)",
                     font=("Consolas", 12, "bold"), text_color="#2b9eff").pack(anchor="w", padx=14, pady=(10,2))
        ctk.CTkLabel(f_fin_frame,
                     text=f"  Primera ejecución: HOY  {hoy}  a la hora del disparo",
                     font=("Consolas", 11), text_color="#ffffff").pack(anchor="w", padx=14, pady=(0,2))
        ctk.CTkLabel(f_fin_frame,
                     text="Cada vez que el autopiloto dispara, actualiza la fecha FIN a HOY.",
                     font=("Consolas", 9), text_color="#666", justify="left").pack(anchor="w", padx=14, pady=(0,10))

        # ── Modo de disparo ──
        modo_frame = ctk.CTkFrame(w, fg_color="#1a1000", corner_radius=10,
                                   border_width=1, border_color="#e4a02b")
        modo_frame.pack(fill="x", padx=20, pady=6)
        if modo == "INTERVALO":
            try:
                val  = int(self.ent_intervalo.get())
                unid = self.combo_intervalo.get()
                txt_modo  = f"  🔁 INTERVALO — Ejecuta cada {val} {unid}"
                txt_desc  = f"Disparará aproximadamente cada {val} {unid} de forma continua."
            except Exception:
                txt_modo = "  🔁 INTERVALO"
                txt_desc = "Modo intervalo activo."
        else:
            h1 = self.ent_h1.get()
            h2 = self.ent_h2.get()
            h3 = self.ent_h3.get()
            txt_modo = f"  ⏰ HORAS FIJAS — {h1}  |  {h2}  |  {h3}"
            txt_desc = f"Disparará todos los días a las {h1}, {h2} y {h3}."

        ctk.CTkLabel(modo_frame, text="⚙️  Modo de disparo:",
                     font=("Consolas", 12, "bold"), text_color="#e4a02b").pack(anchor="w", padx=14, pady=(10,2))
        ctk.CTkLabel(modo_frame, text=txt_modo,
                     font=("Consolas", 12), text_color="#ffffff").pack(anchor="w", padx=14, pady=(0,2))
        ctk.CTkLabel(modo_frame, text=txt_desc,
                     font=("Consolas", 9), text_color="#666").pack(anchor="w", padx=14, pady=(0,10))

        ctk.CTkButton(w, text="✅  Entendido", command=w.destroy,
                      fg_color="#e4a02b", hover_color="#b37e22",
                      font=("Arial", 13, "bold"), width=180,
                      text_color="#000000").pack(pady=12)

    # ── Cambio de modo autopiloto ────────────────────────────────
    def _actualizar_modo_auto(self):
        modo = self.modo_auto_var.get()
        if modo == "HORAS":
            self.frame_horas.grid()
            self.frame_intervalo.grid_remove()
        else:
            self.frame_horas.grid_remove()
            self.frame_intervalo.grid()

    # ── Parpadeo icono bot corriendo (reemplazado por animación) ─
    def _parpadeo_bot(self):
        pass  # La animación ahora la maneja _animacion_loop

    # ── Bloqueo de campos durante autopiloto ────────────────────
    def _bloquear_campos_auto(self, bloquear: bool):
        """Bloquea o desbloquea todos los campos editables mientras el autopiloto está activo."""
        estado_entry  = "disabled" if bloquear else "normal"
        estado_btn    = "disabled" if bloquear else "normal"
        color_entry   = "#1a1a1a" if bloquear else "#0a1420"
        color_txt     = "#555555" if bloquear else "#cccccc"
        color_guardar = "#333333" if bloquear else "#2b78e4"

        # Fechas inicio y fin (readonly → disabled o normal→readonly)
        for ent in [self.ent_i, self.ent_f]:
            try:
                ent.configure(state="disabled" if bloquear else "readonly",
                               fg_color=color_entry, text_color=color_txt)
            except Exception: pass

        # Botones de calendario
        for widget in self.frame_timeline.master.winfo_children():
            pass  # no tocar timeline

        # Horarios T1/T2/T3
        for ent in [self.ent_h1, self.ent_h2, self.ent_h3]:
            try:
                ent.configure(state=estado_entry,
                               fg_color=color_entry, text_color=color_txt)
            except Exception: pass

        # Campo intervalo y combo
        try:
            self.ent_intervalo.configure(state=estado_entry,
                                          fg_color=color_entry, text_color=color_txt)
        except Exception: pass
        try:
            self.combo_intervalo.configure(state=estado_btn)
        except Exception: pass

        # Radio buttons modo horas/intervalo
        try:
            self.modo_auto_var  # existe
            for w in self.frame_horas.winfo_children():
                try: w.configure(state=estado_btn)
                except Exception: pass
            for w in self.frame_intervalo.winfo_children():
                try: w.configure(state=estado_btn)
                except Exception: pass
        except Exception: pass

        # Botón GUARDAR
        try:
            color_g = "#1a3000" if bloquear else "#2b78e4"
            txt_g   = "🔒 AUTOPILOTO ACTIVO" if bloquear else "💾  GUARDAR CONFIGURACIÓN Y HORARIOS"
            # Buscar el botón guardar
            for w in self.winfo_children():
                if hasattr(w, 'cget'):
                    try:
                        if "GUARDAR" in str(w.cget("text")) or "AUTOPILOTO ACTIVO" in str(w.cget("text")):
                            w.configure(state=estado_btn, fg_color=color_g, text=txt_g)
                            break
                    except Exception: pass
        except Exception: pass

        # Mensaje en log
        if bloquear:
            self.escribir_log("🔒 [AUTOPILOTO] Campos bloqueados — detén el autopiloto para editar.")
        else:
            self.escribir_log("🔓 [AUTOPILOTO] Campos desbloqueados — puedes editar la configuración.")

    # ── Autopiloto ───────────────────────────────────────────────
    def _toggle_autopiloto(self):
        if not self.autopiloto_activo:
            self.autopiloto_activo = True
            self.btn_auto.configure(text="🛑 DETENER AUTOPILOTO",
                                    fg_color="#b50000", hover_color="#8a0000")
            self._auto_activo_anim = True

            # ── Bloquear campos mientras autopiloto activo ──
            self._bloquear_campos_auto(True)

            # ── Mensaje informativo al activar ──
            f_ini   = self.ent_i.get()
            modo    = self.modo_auto_var.get()
            self._sep()
            self.escribir_log("⏳ [AUTOPILOTO] ✅ ACTIVADO")
            self.escribir_log(f"   📅 Fecha INICIO fija     : {f_ini} 00:00:00")
            self.escribir_log(f"   📅 Fecha FIN por disparo : HOY a la hora del disparo (se actualiza automáticamente)")
            if modo == "INTERVALO":
                try:
                    val   = int(self.ent_intervalo.get())
                    unid  = self.combo_intervalo.get()
                    self.escribir_log(f"   🔁 Modo                  : INTERVALO — cada {val} {unid}")
                except Exception:
                    self.escribir_log(f"   🔁 Modo                  : INTERVALO")
            else:
                h1 = self.ent_h1.get()
                h2 = self.ent_h2.get()
                h3 = self.ent_h3.get()
                self.escribir_log(f"   ⏰ Modo                  : HORAS FIJAS — {h1} | {h2} | {h3}")
            self.escribir_log(f"   ℹ️  La fecha FIN cambia a HOY cada vez que el autopiloto dispara")
            self.escribir_log(f"   ℹ️  La fecha INICIO ({f_ini}) permanece fija siempre")
            self._sep()

            # Mostrar popup informativo
            self._mostrar_popup_autopiloto(f_ini, modo)
            threading.Thread(target=self._loop_reloj, daemon=True).start()
        else:
            self.autopiloto_activo = False
            self.btn_auto.configure(text="⏳ ACTIVAR AUTOPILOTO",
                                    fg_color="#b58d00", hover_color="#8c6d00")
            self._auto_activo_anim = False
            self.lbl_proxima.configure(text="")
            self._bloquear_campos_auto(False)
            self.escribir_log("🛑 [AUTOPILOTO] Desactivado.")

    def _loop_reloj(self):
        from datetime import timedelta
        modo = self.modo_auto_var.get()

        if modo == "INTERVALO":
            # ── Modo intervalo ──
            try:
                val   = int(self.ent_intervalo.get())
                unidad = self.combo_intervalo.get()
                segs  = val * 60 if unidad == "minutos" else val * 3600
                segs  = max(segs, 60)   # mínimo 1 minuto
            except Exception:
                segs = 1800  # default 30 min
            self.escribir_log(f"🔁 [AUTOPILOTO] Modo intervalo: cada {segs//60} min")
            while self.autopiloto_activo:
                # Countdown
                for seg_restante in range(segs, 0, -1):
                    if not self.autopiloto_activo: break
                    mins_r = seg_restante // 60
                    segs_r = seg_restante % 60
                    try:
                        self.lbl_proxima.configure(
                            text=f"🔁 Próxima en {mins_r}m {segs_r:02d}s",
                            text_color="#e4a02b")
                        self.update()
                    except Exception:
                        break
                    time.sleep(1)
                if not self.autopiloto_activo: break
                if not self.ejecutando:
                    ahora_dt  = datetime.now()
                    fecha_hoy = ahora_dt.strftime("%Y-%m-%d")
                    hora_hoy  = ahora_dt.strftime("%H:%M:%S")
                    self.ent_f.configure(state="normal")
                    self.ent_f.delete(0, "end")
                    self.ent_f.insert(0, fecha_hoy)
                    self.ent_f.configure(state="readonly")
                    self.config["fec_fin"] = fecha_hoy
                    self._sep()
                    self.escribir_log(f"🔁 [AUTOPILOTO] ⚡ DISPARO POR INTERVALO")
                    self.escribir_log(f"   📅 Fecha INICIO : {self.ent_i.get()} 00:00:00 (fija)")
                    self.escribir_log(f"   📅 Fecha FIN    : {fecha_hoy} {hora_hoy} (actualizada ahora)")
                    self._sep()
                    self._ejecutar()
                    time.sleep(10)  # pequeña pausa post-ejecución

        else:
            # ── Modo horas fijas ──
            while self.autopiloto_activo:
                hora_actual = datetime.now().strftime("%H:%M")
                horarios = [self.ent_h1.get(), self.ent_h2.get(), self.ent_h3.get()]
                try:
                    ahora = datetime.now()
                    proximas = []
                    for h in horarios:
                        if len(h) == 5:
                            hh, mm = int(h[:2]), int(h[3:])
                            t = ahora.replace(hour=hh, minute=mm, second=0, microsecond=0)
                            if t <= ahora:
                                t += timedelta(days=1)
                            proximas.append(t)
                    if proximas:
                        proxima = min(proximas)
                        diff    = proxima - ahora
                        horas_r = diff.seconds // 3600
                        mins_r  = (diff.seconds % 3600) // 60
                        self.lbl_proxima.configure(
                            text=f"⏰ Próxima: {proxima.strftime('%H:%M')} (en {horas_r}h {mins_r:02d}m)",
                            text_color="#e4a02b")
                        self.update()
                except Exception:
                    pass
                if hora_actual in horarios and not self.ejecutando:
                    ahora_dt  = datetime.now()
                    fecha_hoy = ahora_dt.strftime("%Y-%m-%d")
                    hora_hoy  = ahora_dt.strftime("%H:%M:%S")
                    self.ent_f.configure(state="normal")
                    self.ent_f.delete(0, "end")
                    self.ent_f.insert(0, fecha_hoy)
                    self.ent_f.configure(state="readonly")
                    self.config["fec_fin"] = fecha_hoy
                    self._sep()
                    self.escribir_log(f"⏰ [AUTOPILOTO] ⚡ DISPARO POR HORA — {hora_actual}")
                    self.escribir_log(f"   📅 Fecha INICIO : {self.ent_i.get()} 00:00:00 (fija)")
                    self.escribir_log(f"   📅 Fecha FIN    : {fecha_hoy} {hora_hoy} (actualizada ahora)")
                    self._sep()
                    self._ejecutar()
                    time.sleep(61)
                else:
                    time.sleep(15)

        # Limpiar
        try:
            self.lbl_proxima.configure(text="")
        except Exception:
            pass

    # ── Login ────────────────────────────────────────────────────
    def _login_fracttal(self):
        try:
            r = sesion_web.post(URL_LOGIN, json={
                "email":       self.config.get("user_fracttal"),
                "password":    self.config.get("pass_fracttal"),
                "id_company":  int(self.config.get("id_company", 0)),
                "id_server":   "AMERICAN",
                "description": "INTERCORP",
                "platform":    "Fracttal/5.8.04 web",
            }, timeout=30)
            if r.status_code == 200:
                return r.json().get("data", {}).get("token")
        except Exception as e:
            self.escribir_log(f"⚠️  [AUTH] Error al hacer login: {e}")
        return None

    # ── Test de Selenium ─────────────────────────────────────────
    def _test_selenium_hilo(self):
        threading.Thread(target=self._test_selenium, daemon=True).start()

    def _test_selenium(self):
        """Prueba Selenium en tiempo real con una ventana de estado visible."""
        # Crear ventana de test
        win = ctk.CTkToplevel(self)
        win.title("🤖 Test de Selenium")
        win.geometry("560x520")
        win.resizable(False, False)
        win.attributes("-topmost", True)
        win.grab_set()

        ctk.CTkLabel(win, text="🤖  TEST DE SELENIUM",
                     font=("Impact", 20), text_color="#ffaa00").pack(pady=(18,4))
        ctk.CTkFrame(win, height=1, fg_color="#ffaa00").pack(fill="x", padx=20)

        # Log de test
        log_test = ctk.CTkTextbox(win, width=520, height=280,
                                   font=("Consolas", 10), fg_color="#080f00",
                                   text_color="#aaffaa", corner_radius=6)
        log_test.pack(padx=20, pady=12)

        # Barra de progreso
        pbar_test = ctk.CTkProgressBar(win, width=520, fg_color="#1a1a1a",
                                        progress_color="#ffaa00")
        pbar_test.pack(padx=20, pady=(0,8))
        pbar_test.set(0)
        pbar_test.start()

        # Resultado final
        lbl_resultado = ctk.CTkLabel(win, text="⏳ Ejecutando prueba...",
                                      font=("Consolas", 12, "bold"), text_color="#ffaa00")
        lbl_resultado.pack(pady=4)

        ctk.CTkButton(win, text="Cerrar", width=120, height=36,
                      fg_color="#2a2a2a", hover_color="#444",
                      command=win.destroy).pack(pady=(4,12))

        def log(msg, color="#aaffaa"):
            log_test.insert("end", f"  {msg}\n")
            log_test.see("end")
            win.update()

        def set_resultado(msg, ok=True):
            pbar_test.stop()
            pbar_test.set(1.0 if ok else 0.3)
            lbl_resultado.configure(
                text=msg,
                text_color="#00ff44" if ok else "#ff4444")
            win.update()

        try:
            # Paso 1 — Verificar imports
            log("🔍 Verificando dependencias de Selenium...")
            try:
                from selenium import webdriver
                from selenium.webdriver.chrome.options import Options
                from selenium.webdriver.chrome.service import Service
                from selenium.webdriver.common.by import By
                from selenium.webdriver.support.ui import WebDriverWait
                from selenium.webdriver.support import expected_conditions as EC
                log("✅ selenium instalado OK")
            except ImportError as e:
                log(f"❌ Selenium no instalado: {e}", "#ff4444")
                log("   → Instala con: pip install selenium", "#ffaa00")
                set_resultado("❌ Selenium no instalado", ok=False)
                return

            try:
                from webdriver_manager.chrome import ChromeDriverManager
                log("✅ webdriver-manager instalado OK")
            except ImportError:
                log("⚠️  webdriver-manager no instalado — usando ChromeDriver del sistema", "#ffaa00")
                ChromeDriverManager = None

            # Paso 2 — Verificar Chrome
            log("🔍 Verificando Google Chrome...")
            import shutil, subprocess as sp
            chrome_paths = [
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                shutil.which("chrome"), shutil.which("google-chrome"),
            ]
            chrome_found = any(p and os.path.exists(p) for p in chrome_paths if p)
            if chrome_found:
                log("✅ Google Chrome encontrado")
            else:
                log("⚠️  Chrome no encontrado en rutas estándar — Selenium lo buscará igual", "#ffaa00")

            # Paso 3 — Instalar ChromeDriver
            log("🔧 Instalando/verificando ChromeDriver automáticamente...")
            pbar_test.set(0.3)
            win.update()
            try:
                if ChromeDriverManager:
                    driver_path = ChromeDriverManager().install()
                    log(f"✅ ChromeDriver listo: ...{driver_path[-40:]}")
                else:
                    driver_path = None
                    log("⚠️  Usando ChromeDriver del sistema PATH")
            except Exception as e:
                log(f"⚠️  ChromeDriverManager falló: {str(e)[:60]}", "#ffaa00")
                driver_path = None

            # Paso 4 — Abrir Chrome headless
            log("🌐 Abriendo Chrome en modo silencioso (headless)...")
            pbar_test.set(0.5)
            win.update()

            opts = Options()
            opts.add_argument("--headless=new")
            opts.add_argument("--no-sandbox")
            opts.add_argument("--disable-dev-shm-usage")
            opts.add_argument("--disable-gpu")
            opts.add_argument("--window-size=1280,800")

            if driver_path:
                driver = webdriver.Chrome(service=Service(driver_path), options=opts)
            else:
                driver = webdriver.Chrome(options=opts)

            log("✅ Chrome abierto en modo headless")
            pbar_test.set(0.6)
            win.update()

            # Paso 5 — Navegar a Fracttal
            log("🌐 Navegando a https://one.fracttal.com ...")
            driver.get("https://one.fracttal.com")
            time.sleep(3)
            titulo = driver.title
            url    = driver.current_url
            log(f"✅ Página cargada: {titulo[:50]}")
            log(f"   URL: {url[:60]}")
            pbar_test.set(0.75)
            win.update()

            # Paso 6 — Buscar campo email
            log("🔍 Buscando campo de email en el formulario...")
            try:
                wait = WebDriverWait(driver, 10)
                # Esperar más tiempo para que Fracttal cargue con JS
                # Esperar más tiempo para que Fracttal cargue con JS
                time.sleep(3)
                email_field = wait.until(EC.presence_of_element_located(
                    (By.CSS_SELECTOR,
                     "input[type='email'], input[name='email'], "
                     "input[placeholder*='mail'], input[placeholder*='correo'], "
                     "input[autocomplete='email'], input[autocomplete='username']")))
                log("✅ Campo email encontrado — formulario de login detectado")
                pbar_test.set(0.85)
                win.update()

                # Paso 7 — Probar ingreso de email
                user = self.config.get("user_fracttal", "")
                if user:
                    email_field.send_keys(user)
                    log(f"✅ Email ingresado: {user[:30]}...")
                else:
                    log("⚠️  No hay usuario configurado en ⚙️ Credenciales", "#ffaa00")

            except Exception as e_form:
                log(f"⚠️  No se encontró campo email: {str(e_form)[:60]}", "#ffaa00")
                log("   → El formulario puede haber cambiado de estructura", "#ffaa00")

            driver.quit()
            log("🔒 Chrome cerrado correctamente")
            pbar_test.set(1.0)
            win.update()

            # Resultado final
            log("")
            log("═" * 55)
            log("✅ SELENIUM FUNCIONA CORRECTAMENTE en esta máquina")
            log("   Chrome, ChromeDriver y la navegación a Fracttal")
            log("   están operativos. El login automático está listo.")
            log("═" * 55)
            set_resultado("✅ Selenium operativo — Chrome y Fracttal accesibles", ok=True)

        except Exception as e:
            log(f"❌ ERROR: {str(e)[:120]}", "#ff4444")
            log("")
            log("Posibles causas:", "#ffaa00")
            log("  • Google Chrome no está instalado", "#ffaa00")
            log("  • ChromeDriver no es compatible con tu versión de Chrome", "#ffaa00")
            log("  • Sin acceso a internet desde esta máquina", "#ffaa00")
            set_resultado(f"❌ Selenium falló: {str(e)[:60]}", ok=False)
            try: driver.quit()
            except Exception: pass

    # ── Ventana Selenium visible ─────────────────────────────────
    def _mostrar_ventana_selenium(self, mensaje):
        """Muestra una ventana pequeña de estado de Selenium."""
        try:
            if not hasattr(self, '_win_sel') or not self._win_sel.winfo_exists():
                self._win_sel = ctk.CTkToplevel(self)
                self._win_sel.title("🤖 Selenium — Captura automática")
                self._win_sel.geometry("480x220")
                self._win_sel.resizable(False, False)
                self._win_sel.attributes("-topmost", True)
                ctk.CTkLabel(self._win_sel,
                    text="🤖  SELENIUM — Captura automática de sesión",
                    font=("Impact", 16), text_color="#ffaa00").pack(pady=(16, 4))
                ctk.CTkFrame(self._win_sel, height=1, fg_color="#ffaa00").pack(fill="x", padx=20)
                self._lbl_sel_estado = ctk.CTkLabel(self._win_sel, text="Iniciando...",
                    font=("Consolas", 12), text_color="#aaaaaa", wraplength=440)
                self._lbl_sel_estado.pack(pady=16, padx=20)
                self._pbar_sel = ctk.CTkProgressBar(self._win_sel, width=420,
                    fg_color="#1a1a1a", progress_color="#ffaa00")
                self._pbar_sel.pack(pady=4)
                self._pbar_sel.set(0)
                self._pbar_sel.start()
                ctk.CTkLabel(self._win_sel,
                    text="Chrome abre en modo silencioso — no verás ventanas",
                    font=("Consolas", 9), text_color="#555").pack(pady=(8, 0))
            self._lbl_sel_estado.configure(text=mensaje)
            self._win_sel.update()
        except Exception:
            pass

    def _cerrar_ventana_selenium(self):
        try:
            if hasattr(self, '_win_sel') and self._win_sel.winfo_exists():
                self._win_sel.destroy()
        except Exception:
            pass

    # ── Hilo ─────────────────────────────────────────────────────
    def _ejecutar_hilo(self):
        threading.Thread(target=self._ejecutar, daemon=True).start()

    # ═══════════════════════════════════════════════════════════════
    #  PROCESO PRINCIPAL
    # ═══════════════════════════════════════════════════════════════
    def _ejecutar(self):
        if self.ejecutando:
            return
        self.ejecutando = True
        self.btn_run.configure(state="disabled")
        self.pbar.set(0)
        self.lbl_tele.configure(text="Iniciando...", text_color="#aaaaaa")
        self._bot_corriendo = True
        self._gear_activo = True
        self.lbl_estado_txt.configure(text="⚡ Extrayendo...", text_color="#2b9eff")
        self._reset_timeline()
        self._ultimo_error = ""
        try:
            self.btn_analizar.grid_remove()
        except Exception:
            pass
        t_inicio = time.time()

        try:
            cfg        = self.config
            f_ini      = self.ent_i.get().strip()
            f_fin      = self.ent_f.get().strip()
            tabla      = cfg.get("tabla_supabase", "st_fracttal")
            path_drive = cfg.get("path_gdrive", "")

            fecha_inf = pd.to_datetime(f_ini, errors='coerce')
            fecha_sup = pd.to_datetime(f_fin, errors='coerce')
            if pd.isnull(fecha_inf) or pd.isnull(fecha_sup):
                raise Exception("Formato de fecha incorrecto. Use AAAA-MM-DD.")
            rango_dias = max(1, (fecha_sup - fecha_inf).days)

            self._sep()
            self.escribir_log(f"🚀 [INICIO] Rango: {f_ini}  →  {f_fin}")
            self.escribir_log(f"🗄️  [TABLA] Supabase: {tabla}")
            self._sep()

            # ──────────────────────────────────────────────────────
            #  FASE 1 — AUTENTICACIÓN
            # ──────────────────────────────────────────────────────
            modo_auth    = cfg.get("modo_auth", "AUTO")
            token_manual = cfg.get("token_manual", "").strip()

            if modo_auth == "MANUAL" and token_manual:
                self.escribir_log("🎫 [AUTH] Modo MANUAL — usando token del browser directamente.")
                token = token_manual
                self.escribir_log(f"✅ [AUTH] Token manual cargado: {token[:40]}...")
            else:
                self._set_fase("login", "activo")
                self.escribir_log("🔐 [AUTH] Modo AUTO — iniciando sesión en Fracttal One...")
                token = self._login_fracttal()
                if not token:
                    if token_manual:
                        self.escribir_log("⚠️  [AUTH] Login automático falló — usando token manual como respaldo...")
                        token = token_manual
                        self.escribir_log(f"✅ [AUTH] Token manual (respaldo) cargado: {token[:40]}...")
                    else:
                        self._activar_alerta("token", "Expirado")
                        self._set_fase("login", "error")
                        raise Exception("No se obtuvo el token. Ve a ⚙️ → Token Manual y pega tu token del browser.")
                else:
                    self.escribir_log("✅ [AUTH] Token automático obtenido correctamente.")
            self._set_fase("login", "ok")

            cookie_manual = cfg.get("cookie_manual", "").strip()

            # Token y cookie del browser como respaldo directo
            TOKEN_BROWSER  = (
                "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImdKUXYybVdtS3hhZGVaRWFJbkp3"
                "UnNEVU54czkwYXZtQWhLaVVUQ2lMYlJJWiIsImlkX2NvbXBhbnkiOjI2MzUsImVtYWlsIjoicmF1"
                "bC5xdWlzcGVAc3BzYS5wZSIsImlkX3NlcnZlciI6IkFNRVJJQ0FOIiwiaWF0IjoxNzgzMTk0Mzg3"
                "LCJleHAiOjE3ODMyMzc1ODd9.GGAzWomXFu-sTHvXsihrv_N6R_xC-KfKMtS893hmoZo"
            )
            COOKIE_BROWSER = (
                "session=e30=; session.sig=fpR225cqUeq9guW1OtGHu2nsV1Q; "
                "__cf_bm=yUj7S9SPAfN4Wgk4qxfCtuouKSPjxPzGT6nROGucfCE-1783193652.3741143-1.0.1.1-"
                "oGdqqHZfeRYyoaFdHY0hl.jDIuze9tTN5_grTQICrKmitiZZJNLpnq8GmA1YOF3m_M_HCfcDZHmu"
                "bqkpLWNG.zybyiXAJ2oBMqjaITBwi1oZHfHFVn3KsOzHtK7DTQqd"
            )
            if not token or not token.strip().startswith("eyJ"):
                token = TOKEN_BROWSER
                self.escribir_log("🎫 [AUTH] Token del browser cargado como respaldo.")
            cookie_activa = cookie_manual if cookie_manual else COOKIE_BROWSER
            self.escribir_log("🍪 [AUTH] Cookie de sesión activa.")

            headers = {
                "Authorization":  f"Bearer {token}",
                "Content-Type":   "application/json",
                "x-version":      cfg.get("x_version", "Fracttal/5.8.04 web"),
                "User-Agent":     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0",
                "accept":         "application/json, text/plain, */*",
                "origin":         "https://one.fracttal.com",
                "referer":        "https://one.fracttal.com/workrequest",
            }
            if cookie_activa:
                headers["Cookie"] = cookie_activa

            # ──────────────────────────────────────────────────────
            #  FASE 2 — DESCARGA PAGINADA
            # ──────────────────────────────────────────────────────
            self._sep()
            self._set_fase("descarga", "activo")
            self.escribir_log("📡 [DESCARGA] Iniciando extracción (avance dinámico + anti-cortes)...")
            self._sep()

            start, limit, page = 0, 1000, 1
            data_bruta, seguir = [], True
            t_bucle      = time.time()
            cronometro_token = time.time()

            while seguir:
                # Renovación de token cada N segundos (solo en modo AUTO)
                if time.time() - cronometro_token > RENOVAR_TOKEN_SEGS and modo_auth == "AUTO":
                    self.escribir_log("🔄 [AUTH] Renovando token silenciosamente...")
                    nuevo = self._login_fracttal()
                    if nuevo:
                        token = nuevo
                        headers["Authorization"] = f"Bearer {token}"
                        cronometro_token = time.time()
                        self.escribir_log("✅ [AUTH] Token renovado OK.")
                    else:
                        self.escribir_log("⚠️  [AUTH] Falló la renovación — continuando con token actual.")

                payload = [{"id": str(uuid.uuid4()), "jsonrpc": "2.0",
                            "method": "requests.requests_list",
                            "params": {"filter": [], "group": {"property": ""}, "is_tree": False,
                                       "limit": limit, "node": None, "page": page,
                                       "sort": [{"direction": "desc", "property": "id_code"}],
                                       "start": start}}]

                # Petición con reintentos
                res = None
                for intento in range(MAX_REINTENTOS_API):
                    try:
                        resp = sesion_web.post(URL_PROXY, headers=headers, json=payload, timeout=45)
                        if resp.status_code == 200:
                            raw = resp.json()
                            res = raw[0].get("result", {}).get("data", []) if isinstance(raw, list) and raw else []
                            break
                        else:
                            pausa = PAUSAS_API[min(intento, len(PAUSAS_API)-1)]
                            self.escribir_log(f"⚠️  [REINTENTO {intento+1}/{MAX_REINTENTOS_API}] HTTP {resp.status_code} — pausa {pausa}s...")
                            time.sleep(pausa)
                    except Exception as err:
                        pausa = PAUSAS_API[min(intento, len(PAUSAS_API)-1)]
                        self.escribir_log(f"⚠️  [REINTENTO {intento+1}/{MAX_REINTENTOS_API}] Micro-corte: {str(err)[:50]} — pausa {pausa}s...")
                        self.update()
                        time.sleep(pausa)

                if res is None:
                    self.escribir_log("❌ [FATAL] Error de red persistente — guardando lo extraído hasta ahora.")
                    seguir = False
                    break

                if not res:
                    self._sep()
                    self.escribir_log(f"🔎 [BLOQUE FINAL] Petición #{page} — Fracttal no envió más datos.")
                    self.escribir_log(f"   📌 Total acumulado: {len(data_bruta):,} ST — ninguna se pierde.")
                    self._sep()
                    break

                data_bruta.extend(res)
                cant = len(res)
                ultimo = res[-1]
                fecha_creacion_texto = ultimo.get('date')

                self.escribir_log(
                    f"⚡ Petición #{page:>3} │ +{cant:>4} filas │ Acum: {len(data_bruta):>7} │ "
                    f"📅 {fecha_creacion_texto[:10] if fecha_creacion_texto else '???'}"
                )

                if fecha_creacion_texto:
                    f_actual = pd.to_datetime(fecha_creacion_texto[:10], errors='coerce')
                    if pd.notnull(f_actual):
                        pct = max(0.0, min((fecha_sup - f_actual).days / rango_dias, 1.0))
                        self.pbar.set(pct)
                        t_transc = time.time() - t_bucle
                        if pct > 0:
                            eta_seg = max(0, (t_transc / pct) - t_transc)
                            self.lbl_tele.configure(
                                text=f"📅 {fecha_creacion_texto[:10]} │ {int(pct*100)}% │ ETA ~{int(eta_seg//60)}m{int(eta_seg%60)}s",
                                text_color="#00ff00")
                            self.update()

                        if f_actual < fecha_inf:
                            filas_ok  = sum(
                                1 for r in res
                                if r.get('date') and pd.to_datetime(r['date'][:10], errors='coerce') >= fecha_inf
                            )
                            filas_out = len(res) - filas_ok
                            self._sep()
                            self.escribir_log(f"🔎 [BLOQUE FINAL] Petición #{page} cruza el límite de fecha {f_ini}")
                            self.escribir_log(f"   📦 Filas en este bloque    : {len(res)}")
                            self.escribir_log(f"   ✅ Filas DENTRO del rango  : {filas_ok}  (desde {f_ini})")
                            self.escribir_log(f"   🚫 Filas FUERA del rango   : {filas_out}  (descartadas)")
                            if filas_ok == 1:
                                self.escribir_log(f"   📌 ¡1 sola fila rescatada — no se pierde!")
                            elif filas_ok > 0:
                                self.escribir_log(f"   📌 {filas_ok} filas rescatadas — ninguna se pierde.")
                            self.escribir_log(f"🔴 [CORTE] Fecha {fecha_creacion_texto[:10]} < límite {f_ini} — deteniendo.")
                            self._sep()
                            self.pbar.set(1.0)
                            seguir = False

                start += cant
                page  += 1
                time.sleep(1)

            total_peticiones = page - 1
            self._set_fase("descarga", "ok")
            self.escribir_log(f"📊 [DESCARGA COMPLETA] {len(data_bruta):,} registros brutos en {total_peticiones} peticiones")

            if not data_bruta:
                self.escribir_log("⚠️  [ALERTA] No se encontraron datos. Proceso detenido.")
                return

            # ──────────────────────────────────────────────────────
            #  FASE 3 — PROCESAMIENTO (traducciones + fechas)
            # ──────────────────────────────────────────────────────
            self._sep()
            self._set_fase("proceso", "activo")
            self.escribir_log("🔧 [PROCESO] Mapeando columnas y aplicando traducciones (zona Lima)...")
            df = pd.DataFrame(data_bruta).rename(columns=MAPEO_COLUMNAS)
            cols_bd = list(dict.fromkeys(MAPEO_COLUMNAS.values()))
            for c in cols_bd:
                if c not in df.columns:
                    df[c] = None
            df_final = df[cols_bd].copy()

            if 'es_urgente' in df_final.columns:
                df_final['es_urgente'] = df_final['es_urgente'].replace(
                    {True: 'Sí', False: 'No', 'True': 'Sí', 'False': 'No'})

            if 'estado' in df_final.columns:
                df_final['estado'] = df_final['estado'].astype(str).str.strip()
                df_final['estado'] = df_final['estado'].replace(TRADUCCION_ESTADOS)

            if 'prioridad' in df_final.columns:
                df_final['prioridad'] = df_final['prioridad'].astype(str).str.strip()
                df_final['prioridad'] = df_final['prioridad'].replace(TRADUCCION_PRIORIDADES)

            for col in df_final.columns:
                if 'fecha' in col:
                    tmp = pd.to_datetime(df_final[col], errors='coerce', utc=True)
                    df_final[col] = tmp.dt.tz_convert('America/Lima').dt.strftime('%Y-%m-%d %H:%M:%S')

            df_final = df_final[df_final['fecha_de_creacion'] >= f"{f_ini} 00:00:00"]
            df_final = df_final.sort_values(by='nro_solicitud', ascending=False)
            df_final = df_final.drop_duplicates(subset=['nro_solicitud'], keep='first')
            cant_filas = len(df_final)
            self.escribir_log(f"🧹 [LIMPIEZA] {cant_filas:,} solicitudes únicas listas para sincronizar.")
            self.escribir_log("🏷️  [TRADUCCIÓN] Estados y prioridades convertidos a texto en español.")
            self._set_fase("proceso", "ok")

            # ──────────────────────────────────────────────────────
            #  FASE 4 — GUARDAR EN GOOGLE DRIVE (con fallback)
            # ──────────────────────────────────────────────────────
            self._sep()
            self._set_fase("drive", "activo")
            drive_ok = False
            try:
                if not path_drive:
                    self.escribir_log("⚠️  [DRIVE] Sin ruta configurada — omitiendo CSV.")
                    self._set_fase("drive", "skip")
                    raise Exception("Ruta de Google Drive no configurada.")
                if not os.path.exists(path_drive):
                    os.makedirs(path_drive, exist_ok=True)
                    self.escribir_log(f"📁 [DRIVE] Carpeta no existía — creada: {path_drive}")

                # Limpiar CSVs anteriores
                for archivo in os.listdir(path_drive):
                    if archivo.endswith(".csv") and "CONSOLIDADO_ST_FRAC" in archivo:
                        try:
                            os.remove(os.path.join(path_drive, archivo))
                        except Exception:
                            pass

                nombre = f"CONSOLIDADO_ST_FRAC_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
                ruta_csv = os.path.join(path_drive, nombre)
                df_final.to_csv(ruta_csv, index=False, sep=';', encoding='utf-8-sig')
                self.escribir_log(f"✅ [DRIVE] Guardado exitoso: {nombre}  ({cant_filas:,} filas)")
                drive_ok = True
                self._set_fase("drive", "ok")

            except Exception as e_drive:
                self.escribir_log(f"⚠️  [DRIVE] No se pudo guardar el CSV: {str(e_drive)[:100]}")
                self.escribir_log(f"   → El respaldo en Drive es OPCIONAL. Continuando con Supabase sin detenerse...")
                self._set_fase("drive", "skip")

            # ──────────────────────────────────────────────────────
            #  FASE 5 — SINCRONIZACIÓN CON SUPABASE (siempre se ejecuta)
            # ──────────────────────────────────────────────────────
            self._sep()
            try:
                import httpx
                from supabase.lib.client_options import ClientOptions
                _opts = ClientOptions(postgrest_client_timeout=httpx.Timeout(120.0))
                supabase_db = create_client(cfg.get("url_supabase"), cfg.get("key_supabase"), options=_opts)
                self.escribir_log("🔌 [SUPABASE] Cliente conectado — timeout=120s configurado.")
            except Exception:
                supabase_db = create_client(cfg.get("url_supabase"), cfg.get("key_supabase"))
                self.escribir_log("🔌 [SUPABASE] Cliente conectado (timeout estándar).")

            df_db  = df_final.astype(object).where(pd.notnull(df_final), None)
            df_db  = df_db.replace({"nan": None, "NaT": None, "NaN": None})
            data_j = df_db.to_dict(orient='records')

            # ══ PASO 1: TRUNCATE VIA RPC ══════════════════════════════
            self._sep()
            self._set_fase("truncate", "activo")
            self.escribir_log(f"🗑️  [LIMPIEZA] Vaciando tabla '{tabla}' antes de insertar...")
            self.escribir_log(f"   ℹ️  Método: TRUNCATE via RPC — instantáneo, sin saturar Supabase")
            self.escribir_log(f"   ℹ️  Tablas NO afectadas: configbots, st_msp, ot_fracttal, invitaciones_msp")
            self.lbl_tele.configure(text=f"🗑️ Vaciando '{tabla}'...", text_color="#ffaa00")
            self.update()
            tabla_limpia = False

            # ── Nivel 1: TRUNCATE via RPC (milisegundos, carga mínima) ──
            try:
                supabase_db.rpc("truncate_tabla", {"nombre_tabla": tabla}).execute()
                self.escribir_log(f"✅ [TRUNCATE] Tabla '{tabla}' vaciada en milisegundos.")
                tabla_limpia = True
                self._set_fase("truncate", "ok")
            except Exception as e_trunc:
                self.escribir_log(f"⚠️  [TRUNCATE] RPC no disponible: {str(e_trunc)[:60]}")
                self.escribir_log(f"   → Ejecuta en Supabase SQL Editor:")
                self.escribir_log(f"   CREATE OR REPLACE FUNCTION truncate_tabla(nombre_tabla text)")
                self.escribir_log(f"   RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$")
                self.escribir_log(f"   BEGIN")
                self.escribir_log(f"     EXECUTE 'TRUNCATE TABLE public.' || quote_ident(nombre_tabla) || ' RESTART IDENTITY CASCADE';")
                self.escribir_log(f"   END; $$;")
                self.escribir_log(f"   → Usando DELETE por lotes como respaldo...")

            # ── Nivel 2: DELETE por lotes (si TRUNCATE no disponible) ──
            if not tabla_limpia:
                try:
                    ronda, total_del = 1, 0
                    self.escribir_log(f"🗑️  [DELETE] Borrando por lotes de {TAM_LOTE_DEL} IDs...")
                    while True:
                        ids = [r["nro_solicitud"] for r in
                               (supabase_db.table(tabla).select("nro_solicitud")
                                .limit(TAM_LOTE_DEL).execute().data or [])]
                        if not ids:
                            break
                        supabase_db.table(tabla).delete().in_("nro_solicitud", ids).execute()
                        total_del += len(ids)
                        self.escribir_log(
                            f"   🗑️  Lote #{ronda:>2} — {len(ids):>5,} filas │ "
                            f"Total eliminado: {total_del:>6,}")
                        self.lbl_tele.configure(
                            text=f"🗑️ Borrando... {total_del:,} filas eliminadas",
                            text_color="#ffaa00")
                        self.update()
                        ronda += 1
                        if len(ids) < TAM_LOTE_DEL:
                            break

                    # Verificar tabla vacía
                    check = supabase_db.table(tabla).select("nro_solicitud").limit(1).execute()
                    filas_rest = len(check.data or [])
                    if filas_rest == 0:
                        self.escribir_log(f"✅ [DELETE] Tabla vaciada — {total_del:,} filas eliminadas.")
                        tabla_limpia = True
                    else:
                        self.escribir_log(f"⚠️  [DELETE] Aún quedan ~{filas_rest} filas — activando UPSERT antiduplicados.")

                except Exception as e_del:
                    self.escribir_log(f"⚠️  [DELETE] Falló: {str(e_del)[:60]} — activando UPSERT antiduplicados.")

            # ── Resumen de limpieza ──
            self._sep()
            # Siempre UPSERT — evita duplicate key aunque haya índices únicos
            metodo = "upsert"
            if tabla_limpia:
                self.escribir_log(f"🟢 [MÉTODO] UPSERT sobre tabla limpia — 0 duplicados garantizados")
            else:
                self.escribir_log(f"🟡 [MÉTODO] UPSERT antiduplicados — tabla no pudo vaciarse completamente")

            self._set_fase("insertar", "activo")
            self.escribir_log(
                f"📤 [SUPABASE] {cant_filas:,} registros → bloques de {TAM_BLOQUE_SUP} filas "
                f"con {MAX_REINTENTOS_SUP} reintentos por bloque"
            )

            # ══ PASO 2: INSERTAR DATOS FRESCOS ═══════════════════════
            exitos, errores = 0, 0
            total_bloques = (cant_filas // TAM_BLOQUE_SUP) + (1 if cant_filas % TAM_BLOQUE_SUP else 0)

            for i in range(0, len(data_j), TAM_BLOQUE_SUP):
                batch    = data_j[i:i+TAM_BLOQUE_SUP]
                bloque_n = i // TAM_BLOQUE_SUP + 1
                item_a   = i + 1
                item_b   = min(i + len(batch), cant_filas)

                for intento in range(MAX_REINTENTOS_SUP):
                    try:
                        # Siempre UPSERT para evitar duplicate key violation
                        supabase_db.table(tabla).upsert(batch, on_conflict="nro_solicitud").execute()
                        exitos += len(batch)
                        sufijo = f" (reintento {intento+1})" if intento > 0 else ""
                        self.escribir_log(
                            f"   ⚡ Bloque {bloque_n:>4}/{total_bloques} │ "
                            f"Items {item_a:>6}–{item_b:>6} │ ✅ OK{sufijo}")
                        break
                    except Exception as e_sup:
                        msg = str(e_sup)[:55]
                        if intento < MAX_REINTENTOS_SUP - 1:
                            pausa = PAUSAS_SUP[intento]
                            # Si timeout con batch grande → dividir automáticamente
                            if "timeout" in msg.lower() and len(batch) > 100 and intento == 1:
                                tam_nuevo = max(100, len(batch) // 2)
                                self.escribir_log(f"   🔄 Timeout — reduciendo a {tam_nuevo} filas/bloque...")
                                sub_ok = 0
                                for j in range(0, len(batch), tam_nuevo):
                                    sub = batch[j:j+tam_nuevo]
                                    try:
                                        supabase_db.table(tabla).upsert(sub, on_conflict="nro_solicitud").execute()
                                        sub_ok += len(sub)
                                    except Exception:
                                        pass
                                if sub_ok > 0:
                                    exitos += sub_ok
                                    self.escribir_log(f"   ✅ Sub-bloques: {sub_ok}/{len(batch)} filas OK")
                                    break
                            self.escribir_log(
                                f"   ⚠️  Bloque {bloque_n} falló ({msg}) — "
                                f"reintento {intento+2}/{MAX_REINTENTOS_SUP} en {pausa}s...")
                            self.lbl_tele.configure(
                                text=f"⚠️ Bloque {bloque_n}/{total_bloques} en reintento...",
                                text_color="#ff9900")
                            self.update()
                            time.sleep(pausa)
                        else:
                            errores += len(batch)
                            self.escribir_log(
                                f"   ❌ Bloque {bloque_n:>4}/{total_bloques} │ "
                                f"Items {item_a:>6}–{item_b:>6} │ FALLÓ: {msg}")
                            self._activar_alerta("supabase", "Timeout")

                if bloque_n % 10 == 0:
                    self.lbl_tele.configure(
                        text=f"📤 Supabase: {exitos:,}/{cant_filas:,} ({bloque_n}/{total_bloques} bloques)",
                        text_color="#00ff00")
                    self.update()
                time.sleep(0.5)

            # ──────────────────────────────────────────────────────
            #  RESUMEN FINAL
            # ──────────────────────────────────────────────────────
            t_total = int(time.time() - t_inicio)
            mins, segs = divmod(t_total, 60)
            self._sep()
            self.escribir_log("🏁  RESUMEN FINAL")
            self.escribir_log(f"   ⏱️  Tiempo total          : {mins}m {segs}s")
            self.escribir_log(f"   📡 Peticiones API         : {total_peticiones}")
            self.escribir_log(f"   📥 Filas brutas bajadas  : {len(data_bruta):,}")
            self.escribir_log(f"   📋 ST únicas procesadas  : {cant_filas:,}")
            self.escribir_log(f"   📁 Respaldo en Drive     : {'✅ Guardado' if drive_ok else '⚠️ Omitido (no detuvo el proceso)'}")
            self.escribir_log(f"   ✅ Registros subidos OK  : {exitos:,}")
            self.escribir_log(f"   ❌ Errores en carga      : {errores:,}")
            self._sep()

            color_fin = "#00ff00" if errores == 0 else "#ff9900"
            if errores == 0:
                self._set_fase("insertar", "ok")
                self._set_fase("fin", "ok")
                self._desactivar_todas_alertas()
            else:
                self._set_fase("insertar", "error")
                self._set_fase("fin", "error")
            self.lbl_tele.configure(
                text=f"✅ Finalizado en {mins}m {segs}s — {exitos:,} ST subidas — {errores} errores",
                text_color=color_fin)
            self.pbar.set(1.0)

        except Exception as e:
            self._ultimo_error = str(e)
            self.escribir_log(f"❌ [ERROR CRÍTICO] {str(e)}")
            self.lbl_tele.configure(text="❌ Error crítico — presiona 🔍 ANALIZAR ERROR", text_color="#ff0000")
            self._set_fase("fin", "error")
            try:
                self.btn_analizar.grid()  # mostrar botón
            except Exception:
                pass

        finally:
            self.ejecutando = False
            self._bot_corriendo = False
            self._gear_activo = False
            self.btn_run.configure(state="normal")
            try:
                self.lbl_estado_txt.configure(text="", text_color="#555")
            except Exception:
                pass


# ═══════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    app = ConsolaFracttalST()
    app.mainloop()