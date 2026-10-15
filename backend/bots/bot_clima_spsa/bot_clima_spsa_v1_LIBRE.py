#!/usr/bin/env python3
# ══════════════════════════════════════════════════════════════════════════════
#  SPSA — BOT CLIMA V1.0
#  Descarga temperatura, humedad y precipitación diaria para las 140 sedes
#  Fuente: Open-Meteo API (gratuita, sin API key, por GPS exacto)
#  Destino: Supabase energia."DATA CLIMATICA OPENMETEO"
#  Raúl Quispe · raul.quispe@spsa.pe · Julio 2026
# ══════════════════════════════════════════════════════════════════════════════
import customtkinter as ctk
import tkinter as tk
from tkinter import filedialog
import threading, time, json, os, math
import hashlib, calendar as _cal, base64
from datetime import datetime, timedelta
import requests
import pandas as pd
from supabase import create_client

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

VERSION = "1.0"
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "config_clima.json")

# ── Supabase (proyecto UNICO: API SISTEMA MANTENIMIENTO) ────────────────────
# Ambas tablas viven en el MISMO proyecto Supabase, solo en schemas distintos:
#   - infraestructura."Tabla-Maestra-Infraestructura" -> sedes
#   - energia."DATA CLIMATICA OPENMETEO"               -> destino clima
#   - public.vw_sedes_clima                            -> vista de sedes expuesta
URL_SUPABASE  = "https://zuouxnvcktjhqzlniion.supabase.co"
KEY_SUPABASE  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84"
# Respaldo: solo se usa si la subida falla por permisos del rol anon.
SECRET_KEY_SUPABASE = os.getenv("SECRET_KEY_SUPABASE", "")
TABLA_CLIMA   = 'DATA METEO CLIMA'
SCHEMA_CLIMA  = 'energia'

# ── Alertas de fallo / seguimiento (reutiliza pme_common de PME) ──
import sys as _sys
try:
    _sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    import pme_common
except Exception:
    pme_common = None

# ── Open-Meteo ────────────────────────────────────────────────────────────────
URL_METEO   = "https://api.open-meteo.com/v1/forecast"
URL_ARCHIVO = "https://archive-api.open-meteo.com/v1/archive"  # ERA5, dato historico consolidado
# ── Catalogo de variables diarias disponibles en Open-Meteo (nombres oficiales) ──
# Formato: clave_api -> (columna_supabase, etiqueta, categoria, activa_por_defecto)
VARIABLES_CATALOGO = {
    # Nucleo (siempre activas, no seleccionables)
    "temperature_2m_max":        ("temp_max",              "Temperatura maxima",         "core", True),
    "temperature_2m_min":        ("temp_min",              "Temperatura minima",         "core", True),
    "temperature_2m_mean":       ("temp_promedio",         "Temperatura promedio",       "core", True),
    "relative_humidity_2m_mean": ("humedad_pct",           "Humedad relativa promedio",  "core", True),
    "precipitation_sum":         ("precipitacion",         "Precipitacion acumulada",    "core", True),
    # Viento
    "wind_speed_10m_max":        ("viento_max_kmh",        "Viento - velocidad maxima",       "viento", True),
    "wind_gusts_10m_max":        ("viento_rafaga_kmh",     "Viento - rafaga maxima",          "viento", True),
    "wind_direction_10m_dominant":("viento_direccion_grados","Viento - direccion dominante",   "viento", True),
    # Radiacion solar
    "shortwave_radiation_sum":   ("radiacion_solar_mj",    "Radiacion solar (onda corta)",    "solar", True),
    "et0_fao_evapotranspiration":("evapotranspiracion_mm", "Evapotranspiracion de referencia","solar", False),
    # Condicion general
    "weather_code":              ("condicion_codigo",      "Condicion del clima (codigo WMO)","condicion", True),
    # Sensacion termica
    "apparent_temperature_max":  ("temp_sensacion_max",    "Sensacion termica maxima",   "sensacion", False),
    "apparent_temperature_min":  ("temp_sensacion_min",    "Sensacion termica minima",   "sensacion", False),
    # Precipitacion detallada
    "precipitation_hours":       ("precipitacion_horas",   "Horas con precipitacion",    "precip_detalle", False),
    "rain_sum":                  ("lluvia_mm",             "Lluvia acumulada",           "precip_detalle", False),
    "showers_sum":                ("chubascos_mm",         "Chubascos acumulados",       "precip_detalle", False),
    "snowfall_sum":               ("nieve_cm",             "Nieve acumulada",            "precip_detalle", False),
    # Sol / UV (solo disponibles de forma confiable en Forecast, no en Archive/ERA5)
    "uv_index_max":               ("uv_max",               "Indice UV maximo (solo forecast)", "sol_uv", False),
    "sunrise":                    ("amanecer",             "Hora de amanecer",           "sol_uv", False),
    "sunset":                     ("atardecer",            "Hora de atardecer",          "sol_uv", False),
    "daylight_duration":          ("duracion_luz_seg",     "Duracion de luz de dia (seg)","sol_uv", False),
    "sunshine_duration":          ("duracion_sol_seg",     "Duracion de sol directo (seg)","sol_uv", False),
}
CATEGORIAS_VARIABLES = [
    ("viento",        "🌬 Viento"),
    ("solar",         "☀️ Radiacion solar"),
    ("condicion",     "🌤 Condicion general"),
    ("sensacion",     "🌡 Sensacion termica"),
    ("precip_detalle","🌧 Precipitacion detallada"),
    ("sol_uv",        "🌅 Sol / UV (solo Forecast)"),
]

def _variables_api_activas(cfg):
    """Lista de claves API activas: nucleo + las opcionales marcadas en config."""
    activas_opcionales = set(cfg.get("variables_activas", []))
    claves = []
    for clave, (_col, _lbl, cat, default) in VARIABLES_CATALOGO.items():
        if cat == "core" or clave in activas_opcionales:
            claves.append(clave)
    return claves

def _variables_default_activas():
    return [k for k,(_c,_l,cat,default) in VARIABLES_CATALOGO.items()
            if cat != "core" and default]
# Fechas mas antiguas que este umbral (dias) se piden al archivo ERA5 (fijo/consolidado).
# Fechas mas recientes usan el pronostico (forecast), que aun puede recibir pequeños ajustes.
UMBRAL_DIAS_ARCHIVO = 7
# Open-Meteo no usa estaciones fisicas puntuales para este endpoint: combina modelos
# meteorologicos globales (GFS, ECMWF, ICON, etc.) segun la ubicacion GPS, eligiendo
# automaticamente el de mejor resolucion disponible para cada punto (best-match).
FUENTE_DATOS_LABEL = "Open-Meteo API (modelo meteorologico best-match por GPS)"
FUENTE_ARCHIVO_LABEL = "Open-Meteo Archive API (ERA5, dato historico consolidado)"
FUENTE_MIXTA_LABEL = "Open-Meteo (mixto: ERA5 historico + modelo reciente)"

def _elegir_tramos_meteo(f_ini_str, f_fin_str):
    """Divide el rango de fechas pedido entre el endpoint de archivo (ERA5, para
    fechas ya consolidadas hace mas de UMBRAL_DIAS_ARCHIVO dias) y el de pronostico
    (para fechas recientes). Devuelve lista de (url, start, end, tipo)."""
    f_ini = datetime.strptime(f_ini_str, "%Y-%m-%d").date()
    f_fin = datetime.strptime(f_fin_str, "%Y-%m-%d").date()
    corte = datetime.now().date() - timedelta(days=UMBRAL_DIAS_ARCHIVO)

    if f_fin < corte:
        return [(URL_ARCHIVO, f_ini_str, f_fin_str, "archive")]
    if f_ini >= corte:
        return [(URL_METEO, f_ini_str, f_fin_str, "forecast")]
    corte_archivo = corte - timedelta(days=1)
    return [
        (URL_ARCHIVO, f_ini_str, corte_archivo.strftime("%Y-%m-%d"), "archive"),
        (URL_METEO,   corte.strftime("%Y-%m-%d"), f_fin_str,        "forecast"),
    ]

# ── Paises soportados (Peru primero) y su timezone IANA ──────────────────────
PAISES_TZ = {
    "Peru": "America/Lima",
    "Chile": "America/Santiago",
    "Colombia": "America/Bogota",
    "Ecuador": "America/Guayaquil",
    "Bolivia": "America/La_Paz",
    "Argentina": "America/Argentina/Buenos_Aires",
    "Mexico": "America/Mexico_City",
    "Brasil": "America/Sao_Paulo",
    "Uruguay": "America/Montevideo",
    "Paraguay": "America/Asuncion",
    "Venezuela": "America/Caracas",
    "Panama": "America/Panama",
    "Costa Rica": "America/Costa_Rica",
    "Republica Dominicana": "America/Santo_Domingo",
    "Espana": "Europe/Madrid",
    "Estados Unidos": "America/New_York",
}

# ── Config defaults ───────────────────────────────────────────────────────────
CFG_DEF = {
    "f_ini":         (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d"),
    "f_fin":         datetime.now().strftime("%Y-%m-%d"),
    "modo_auto":     "INTERVALO",
    "intervalo_val": "24",
    "intervalo_uni": "horas",
    "hora1": "06:00", "hora2": "12:00", "hora3": "18:00",
    "carpeta_drive": "",        # ruta local a la carpeta sincronizada de Google Drive
    "exportar_excel": True,     # True = genera .xlsx (en vez de .csv) en esa carpeta
    "otros_accesos": [],        # lista de {"sitio":..,"usuario":..,"clave":..}
    "pais": "Peru",             # pais activo (define timezone para Open-Meteo)
    "variables_activas": None,  # se completa dinamicamente con los defaults la 1ra vez
}

# ── Cifrado XOR + SHA-256 del config local (mismo esquema que bots LIBRE/SEGURO) ──
_CIFRADO_SEMILLA = "SPSA_CLIMA_V1_2024_CFG"

def _clave_cifrado():
    return hashlib.sha256(_CIFRADO_SEMILLA.encode("utf-8")).digest()

def _xor_bytes(data: bytes, clave: bytes) -> bytes:
    return bytes(b ^ clave[i % len(clave)] for i, b in enumerate(data))

def cfg_cargar():
    d = CFG_DEF.copy()
    cargado = False
    if os.path.exists(CONFIG_FILE):
        # 1) Intenta el formato cifrado (nuevo)
        try:
            with open(CONFIG_FILE, "rb") as f:
                contenido = f.read()
            raw = _xor_bytes(base64.b64decode(contenido), _clave_cifrado())
            d.update(json.loads(raw.decode("utf-8")))
            cargado = True
        except Exception:
            pass
        # 2) Compatibilidad hacia atras: config viejo en JSON plano (sin cifrar)
        if not cargado:
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    d.update(json.load(f))
            except Exception:
                pass
    if not d.get("variables_activas"):
        d["variables_activas"] = _variables_default_activas()
    return d

def cfg_guardar(cfg):
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving config: {e}")

# ══════════════════════════════════════════════════════════════════════════════
#  CALENDARIO MODAL
# ══════════════════════════════════════════════════════════════════════════════
class CalendarioModal(ctk.CTkToplevel):
    MESES    = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
    DIAS_SEM = ["Lu","Ma","Mi","Ju","Vi","Sa","Do"]

    def __init__(self, parent, titulo="Selecciona fecha",
                 fecha_inicial=None, callback=None):
        super().__init__(parent)
        self.title(titulo); self.geometry("370x370")
        self.resizable(False,False); self.attributes("-topmost",True)
        self.grab_set()
        self.callback = callback
        hoy = datetime.now(); self._hoy = hoy
        try:
            dt = datetime.strptime(fecha_inicial,"%Y-%m-%d") if fecha_inicial else hoy
        except: dt = hoy
        self._anio=dt.year; self._mes=dt.month; self._dia=dt.day
        self._build()

    def _build(self):
        nav = ctk.CTkFrame(self,fg_color="#0d1520",corner_radius=0)
        nav.pack(fill="x")
        ctk.CTkButton(nav,text="◀",width=32,height=34,font=("Arial",14),
            fg_color="transparent",hover_color="#1a3d61",
            command=self._mes_ant).pack(side="left",padx=4,pady=4)
        self.cmb_mes = ctk.CTkOptionMenu(nav,values=self.MESES,width=130,height=30,
            font=("Consolas",12,"bold"),fg_color="#0a1a2e",button_color="#1a3d61",
            dropdown_fg_color="#0a1118",text_color="#2b9eff",command=self._on_mes)
        self.cmb_mes.set(self.MESES[self._mes-1]); self.cmb_mes.pack(side="left",padx=4,pady=4)
        anios=[str(a) for a in range(2020,self._hoy.year+3)]
        self.cmb_anio = ctk.CTkOptionMenu(nav,values=anios,width=80,height=30,
            font=("Consolas",12,"bold"),fg_color="#0a1a2e",button_color="#1a3d61",
            dropdown_fg_color="#0a1118",text_color="#2b9eff",command=self._on_anio)
        self.cmb_anio.set(str(self._anio)); self.cmb_anio.pack(side="left",padx=4,pady=4)
        ctk.CTkButton(nav,text="▶",width=32,height=34,font=("Arial",14),
            fg_color="transparent",hover_color="#1a3d61",
            command=self._mes_sig).pack(side="right",padx=4,pady=4)
        f_sem=ctk.CTkFrame(self,fg_color="#080e18",corner_radius=0); f_sem.pack(fill="x")
        for idx,d in enumerate(self.DIAS_SEM):
            ctk.CTkLabel(f_sem,text=d,width=48,height=24,
                font=("Consolas",11,"bold"),
                text_color="#e4a02b" if idx>=5 else "#666").pack(side="left")
        self._frame_dias=ctk.CTkFrame(self,fg_color="#080e18",corner_radius=0)
        self._frame_dias.pack(fill="both",expand=True)
        self._dibujar_dias()
        pie=ctk.CTkFrame(self,fg_color="#0d1520",corner_radius=0); pie.pack(fill="x")
        ctk.CTkButton(pie,text="📅 HOY",width=100,height=30,
            font=("Consolas",11),fg_color="#1a3d61",hover_color="#2b78e4",
            command=self._ir_hoy).pack(side="left",padx=8,pady=4)
        ctk.CTkButton(pie,text="✔  CONFIRMAR",width=140,height=30,
            font=("Consolas",11,"bold"),fg_color="#1f8d3d",hover_color="#145a28",
            command=self._confirmar).pack(side="right",padx=8,pady=4)

    def _dibujar_dias(self):
        for w in self._frame_dias.winfo_children(): w.destroy()
        primer_dia,total_dias=_cal.monthrange(self._anio,self._mes)
        fila=ctk.CTkFrame(self._frame_dias,fg_color="transparent"); fila.pack(fill="x")
        for _ in range(primer_dia):
            ctk.CTkLabel(fila,text="",width=48,height=40).pack(side="left")
        col=primer_dia
        for d in range(1,total_dias+1):
            es_hoy=(d==self._hoy.day and self._mes==self._hoy.month and self._anio==self._hoy.year)
            es_sel=(d==self._dia)
            wd=_cal.weekday(self._anio,self._mes,d)
            if es_sel: bg,txt="#1a52a3","#ffffff"
            elif es_hoy: bg,txt="#1f8d3d","#ffffff"
            elif wd>=5: bg,txt="transparent","#e4a02b"
            else: bg,txt="transparent","#aaaaaa"
            btn=ctk.CTkButton(fila,text=str(d),width=46,height=38,
                font=("Consolas",12,"bold" if es_hoy or es_sel else "normal"),
                fg_color=bg,hover_color="#1a3d61",text_color=txt,
                command=lambda dd=d:self._sel(dd))
            btn.pack(side="left",padx=1,pady=1)
            col+=1
            if col%7==0 and d<total_dias:
                fila=ctk.CTkFrame(self._frame_dias,fg_color="transparent"); fila.pack(fill="x")

    def _sel(self,d): self._dia=d; self._dibujar_dias()
    def _mes_ant(self):
        self._mes-=1
        if self._mes<1: self._mes=12; self._anio-=1
        self.cmb_mes.set(self.MESES[self._mes-1]); self.cmb_anio.set(str(self._anio))
        self._dibujar_dias()
    def _mes_sig(self):
        self._mes+=1
        if self._mes>12: self._mes=1; self._anio+=1
        self.cmb_mes.set(self.MESES[self._mes-1]); self.cmb_anio.set(str(self._anio))
        self._dibujar_dias()
    def _on_mes(self,v): self._mes=self.MESES.index(v)+1; self._dibujar_dias()
    def _on_anio(self,v): self._anio=int(v); self._dibujar_dias()
    def _ir_hoy(self):
        self._anio=self._hoy.year; self._mes=self._hoy.month; self._dia=self._hoy.day
        self.cmb_mes.set(self.MESES[self._mes-1]); self.cmb_anio.set(str(self._anio))
        self._dibujar_dias()
    def _confirmar(self):
        fecha=f"{self._anio:04d}-{self._mes:02d}-{self._dia:02d}"
        if self.callback: self.callback(fecha)
        self.destroy()

# ══════════════════════════════════════════════════════════════════════════════
#  CONSOLA PRINCIPAL
# ══════════════════════════════════════════════════════════════════════════════
class ConsolaClima(ctk.CTk):
    FASES = [
        ("sedes",    "SEDES",  "Leyendo\nsedes"),
        ("meteo",    "METEO",  "Consultando\nOpen-Meteo"),
        ("proceso",  "PROC",   "Procesando\ndatos"),
        ("drive",    "DRV",    "Google\nDrive"),
        ("insertar", "UP",     "Subiendo\nSupabase"),
        ("fin",      "FIN",    "Completado"),
    ]
    C_FASE = {
        "idle":   "#0a0f18","activo": "#2b78e4",
        "ok":     "#00aa33","skip":   "#e4a02b","error": "#cc0000",
    }

    def __init__(self):
        super().__init__()
        self.config = cfg_cargar()
        self.title(f"SPSA — BOT CLIMA V{VERSION} (LIBRE - sin login)")
        self.geometry("1280x860")
        self.minsize(1100,780)
        self.ejecutando  = False
        self.autopiloto  = False
        self._stop       = threading.Event()
        self._gear_activo= False
        self._auto_activo= False
        self._angulo_gear= 0
        self._angulo_auto= 0
        self._fase_estado= {k:"idle" for k,_,_ in self.FASES}
        self._fase_tick  = {k:0      for k,_,_ in self.FASES}
        self._cvs_fases  = {}
        self._build_ui()
        self._cargar_ui()
        threading.Thread(target=self._robot_loop,  daemon=True).start()
        threading.Thread(target=self._timeline_loop,daemon=True).start()
        threading.Thread(target=self._loop_reloj,  daemon=True).start()
        self.escribir_log(f">>> SPSA Bot Clima V{VERSION} iniciado.")
        self.escribir_log("Fuente: Open-Meteo API (gratuita, sin API key)")
        self.escribir_log("Destino: energia.DATA CLIMATICA PERU (Supabase)")

    # ── ROBOT ANIMADO ─────────────────────────────────────────────────────────
    def _dibujar_robot(self, angulo=0, parado=True):
        import math as _m
        c=self._cv_robot; c.delete("all"); cx,cy=24,24
        if parado:
            c.create_rectangle(14,3,34,13,fill="#1a1a2e",outline="#333355",width=1)
            c.create_oval(16,5,20,9,fill="#222244",outline="#333366")
            c.create_oval(28,5,32,9,fill="#222244",outline="#333366")
            c.create_rectangle(12,14,36,27,fill="#111122",outline="#333355",width=1)
            c.create_rectangle(5,15,12,22,fill="#111122",outline="#333355",width=1)
            c.create_rectangle(36,15,43,22,fill="#111122",outline="#333355",width=1)
            c.create_rectangle(14,27,20,38,fill="#111122",outline="#333355",width=1)
            c.create_rectangle(28,27,34,38,fill="#111122",outline="#333355",width=1)
        else:
            ang_r=_m.radians(angulo)
            for g,gcol in enumerate(["#0a1a40","#0a2860","#0a3880"]):
                c.create_oval(2-g,2-g,42+g,42+g,fill="",outline=gcol,width=1)
            c.create_line(cx,1,cx,5,fill="#2b9eff",width=2)
            ant_col="#00ffff" if (angulo//6)%2==0 else "#2b9eff"
            c.create_oval(cx-2,1,cx+2,5,fill=ant_col,outline="")
            c.create_rectangle(14,5,34,14,fill="#0a1a3a",outline="#2b9eff",width=2)
            ojo_col="#00ffff" if (angulo//8)%2==0 else "#2b9eff"
            c.create_oval(16,7,20,11,fill=ojo_col,outline="")
            c.create_oval(28,7,32,11,fill=ojo_col,outline="")
            c.create_rectangle(12,15,36,29,fill="#0a1a3a",outline="#2b9eff",width=2)
            c.create_text(cx,22,text="<>",font=("Consolas",8,"bold"),fill="#00ffff")
            ab=_m.sin(ang_r*2)*0.5
            bx1=int(12+_m.sin(ab)*7)
            c.create_line(12,20,bx1,26,fill="#2b9eff",width=2)
            ab2=_m.sin(ang_r*2+_m.pi)*0.5
            bx2=int(36-_m.sin(ab2)*7)
            c.create_line(36,20,bx2,26,fill="#2b9eff",width=2)
            py1=int(36+_m.sin(ang_r)*4); py2=int(36-_m.sin(ang_r)*4)
            c.create_rectangle(14,27,20,py1,fill="#0a1a3a",outline="#2b9eff",width=1)
            c.create_rectangle(28,27,34,py2,fill="#0a1a3a",outline="#2b9eff",width=1)

    def _dibujar_auto(self, angulo=0, activo=False):
        import math as _m
        c=self._cv_auto; c.delete("all"); cx,cy=24,24
        if not activo:
            c.create_oval(3,3,45,45,fill="#0a0800",outline="#333322",width=1)
            c.create_rectangle(13,12,19,34,fill="#222211",outline="#333322")
            c.create_rectangle(29,12,35,34,fill="#222211",outline="#333322")
        else:
            def _gear(gcx,gcy,r,dientes,ang,color,color2,r_inner=None):
                if r_inner is None: r_inner=r*0.55
                for g in range(3,0,-1):
                    c.create_oval(gcx-r-g-1,gcy-r-g-1,gcx+r+g+1,gcy+r+g+1,
                        fill="",outline=color2,width=1)
                pts=[]
                for i in range(dientes*2):
                    radio=(r+4) if i%2==0 else r
                    a=_m.radians(ang+i*180/dientes)
                    pts.extend([gcx+radio*_m.cos(a),gcy+radio*_m.sin(a)])
                c.create_polygon(pts,fill=color,outline=color,smooth=False)
                c.create_oval(gcx-r,gcy-r,gcx+r,gcy+r,fill="#0a0800",outline=color,width=2)
                c.create_oval(gcx-r_inner,gcy-r_inner,gcx+r_inner,gcy+r_inner,
                    fill="#050500",outline=color2,width=1)
            _gear(18,22,13,8,angulo,"#e4a02b","#ffcc44")
            _gear(36,13,8,6,-angulo*1.5,"#ff7700","#ffaa33",r_inner=3)
            if (angulo//5)%2==0:
                c.create_oval(2,2,46,46,fill="",outline="#ff9900",width=1)

    def _robot_loop(self):
        while True:
            try:
                if self._gear_activo:
                    self._angulo_gear=(self._angulo_gear+5)%360
                    self._dibujar_robot(angulo=self._angulo_gear,parado=False)
                else:
                    self._dibujar_robot(parado=True)
                if self._auto_activo:
                    self._angulo_auto=(self._angulo_auto+4)%360
                    self._dibujar_auto(angulo=self._angulo_auto,activo=True)
                else:
                    self._dibujar_auto(activo=False)
            except: break
            time.sleep(0.05)

    # ── TIMELINE ──────────────────────────────────────────────────────────────
    def _timeline_loop(self):
        import math as _m
        tick=0
        while True:
            for key,_,_ in self.FASES:
                cv=self._cvs_fases.get(key)
                if not cv: continue
                estado=self._fase_estado.get(key,"idle")
                t=self._fase_tick.get(key,0)
                self._fase_tick[key]=t+1
                cx=cy=22
                try:
                    cv.delete("all")
                    if estado=="idle":
                        cv.create_oval(4,4,40,40,fill="#0a0f18",outline="#1a2a44",width=1)
                        cv.create_text(cx,cy,text="○",font=("Arial",14),fill="#222244")
                    elif estado=="activo":
                        pulso=abs(_m.sin(t*0.15)); r_g=int(18+pulso*6)
                        for g,gcol in enumerate(["#0a2040","#0a3060","#1a4880"]):
                            off=g*2
                            cv.create_oval(cx-r_g-off,cy-r_g-off,cx+r_g+off,cy+r_g+off,
                                fill="",outline=gcol,width=1)
                        cv.create_oval(4,4,40,40,fill="#0a1a3a",outline="#2b9eff",width=2)
                        alpha="#2b9eff" if (t//4)%2==0 else "#88ccff"
                        cv.create_text(cx,cy-2,text="●",font=("Arial",14),fill=alpha)
                        for d in range(4):
                            ang=_m.radians(t*8+d*90)
                            px=cx+17*_m.cos(ang); py=cy+17*_m.sin(ang)
                            cv.create_oval(px-2,py-2,px+2,py+2,fill="#2b9eff",outline="")
                    elif estado=="ok":
                        if t<20:
                            intensidad=1.0-(t/20); r_exp=int(18+intensidad*10)
                            for g,gcol in enumerate(["#004020","#006030","#00aa44"]):
                                off=g*3
                                cv.create_oval(cx-r_exp-off,cy-r_exp-off,
                                    cx+r_exp+off,cy+r_exp+off,fill="",outline=gcol,width=2)
                        pulso_ok=abs(_m.sin(t*0.08))*0.4+0.6
                        for g,gcol in enumerate(["#002010","#003818","#005525"]):
                            cv.create_oval(4-g,4-g,40+g,40+g,fill="",outline=gcol,width=1)
                        cv.create_oval(4,4,40,40,fill="#001a08",outline="#00ff44",width=2)
                        alpha_ok="#00ff44" if int(pulso_ok*10)%2==0 else "#88ffaa"
                        cv.create_text(cx,cy-2,text="✔",font=("Arial",16,"bold"),fill=alpha_ok)
                        for d in range(3):
                            ang=_m.radians(t*3+d*120)
                            px=cx+16*_m.cos(ang); py=cy+16*_m.sin(ang)
                            cv.create_oval(px-1.5,py-1.5,px+1.5,py+1.5,fill="#00ff44",outline="")
                    elif estado=="skip":
                        pulso_s=abs(_m.sin(t*0.1))*0.5+0.5
                        cv.create_oval(4,4,40,40,fill="#120800",outline="#ff9900",width=2)
                        alpha_s="#ff9900" if int(pulso_s*10)%2==0 else "#ffcc44"
                        cv.create_text(cx,cy-2,text="!",font=("Arial",18,"bold"),fill=alpha_s)
                    elif estado=="error":
                        if (t//6)%2==0:
                            cv.create_oval(2,2,42,42,fill="",outline="#ff3333",width=2)
                            cv.create_oval(4,4,40,40,fill="#1a0000",outline="#ff6666",width=1)
                            cv.create_text(cx,cy-2,text="✗",font=("Arial",16),fill="#ff3333")
                        else:
                            cv.create_oval(4,4,40,40,fill="#0a0000",outline="#551111",width=1)
                            cv.create_text(cx,cy-2,text="✗",font=("Arial",16),fill="#551111")
                except: pass
            tick+=1
            time.sleep(0.05)

    def _set_fase(self, key, estado):
        self._fase_estado[key]=estado
        self._fase_tick[key]=0

    def _reset_timeline(self):
        for k,_,_ in self.FASES:
            self._fase_estado[k]="idle"
            self._fase_tick[k]=0

    # ── BUILD UI ──────────────────────────────────────────────────────────────
    def _build_ui(self):
        # HEADER
        hdr=ctk.CTkFrame(self,fg_color="#060a10",height=62,corner_radius=0)
        hdr.pack(fill="x"); hdr.pack_propagate(False)

        self._cv_robot=tk.Canvas(hdr,width=48,height=48,bg="#060a10",highlightthickness=0)
        self._cv_robot.pack(side="left",padx=10,pady=7)
        self._cv_auto=tk.Canvas(hdr,width=48,height=48,bg="#060a10",highlightthickness=0)
        self._cv_auto.pack(side="left",padx=4,pady=7)

        ctk.CTkLabel(hdr,text="SPSA: BOT CLIMA PERU",
            font=("Impact",24),text_color="#2b9eff").pack(side="left",padx=12,pady=10)

        self.lbl_reloj=ctk.CTkLabel(hdr,text="",font=("Consolas",14),text_color="#2b9eff")
        self.lbl_reloj.pack(side="right",padx=16)
        ctk.CTkButton(hdr,text="⚙️",width=46,height=38,font=("Arial",18),
            fg_color="#1a3d61",hover_color="#2b78e4",
            command=self._abrir_config).pack(side="right",padx=8,pady=10)

        self.lbl_tele=ctk.CTkLabel(hdr,text="",font=("Consolas",11),text_color="#444")
        self.lbl_tele.pack(side="right",padx=8)

        # TABVIEW: Sincronizacion / Informacion
        self.tabview = ctk.CTkTabview(self, fg_color="#0a0f1a",
            segmented_button_fg_color="#0a1420",
            segmented_button_selected_color="#2b78e4",
            segmented_button_unselected_color="#1a3d61")
        self.tabview.pack(fill="both", expand=True)
        tab_sync = self.tabview.add("🌤 Sincronizacion")
        tab_info = self.tabview.add("ℹ️ Informacion")

        # CONTROL
        ctrl=ctk.CTkFrame(tab_sync,fg_color="#0a0f1a",corner_radius=0)
        ctrl.pack(fill="x")

        # Fila 1: Fechas
        f1=ctk.CTkFrame(ctrl,fg_color="transparent"); f1.pack(fill="x",padx=16,pady=(10,2))
        ctk.CTkLabel(f1,text="📅 Inicio:",font=("Consolas",12)).pack(side="left")
        self.ent_i=ctk.CTkEntry(f1,width=120,font=("Consolas",12),
            fg_color="#0a1420",border_color="#1a3d61",state="readonly")
        self.ent_i.pack(side="left",padx=(4,2))
        ctk.CTkButton(f1,text="📅",width=32,height=30,fg_color="#1a3d61",hover_color="#2b78e4",
            command=lambda:CalendarioModal(self,"Fecha Inicio",
                self.ent_i.get(),self._set_ini)).pack(side="left",padx=(0,12))

        ctk.CTkLabel(f1,text="📅 Fin:",font=("Consolas",12)).pack(side="left")
        self.ent_f=ctk.CTkEntry(f1,width=120,font=("Consolas",12),
            fg_color="#0a1420",border_color="#1a3d61",state="readonly")
        self.ent_f.pack(side="left",padx=(4,2))
        ctk.CTkButton(f1,text="📅",width=32,height=30,fg_color="#1a3d61",hover_color="#2b78e4",
            command=lambda:CalendarioModal(self,"Fecha Fin",
                self.ent_f.get(),self._set_fin)).pack(side="left",padx=(0,4))
        ctk.CTkButton(f1,text="HOY",width=56,height=30,fg_color="#1f8d3d",hover_color="#145a28",
            font=("Arial",11,"bold"),command=self._set_hoy).pack(side="left",padx=4)
        ctk.CTkButton(f1,text="AYER",width=60,height=30,fg_color="#1a3d61",hover_color="#2b78e4",
            font=("Arial",11,"bold"),command=self._set_ayer).pack(side="left",padx=4)

        # Fila 2: Autopiloto
        f2=ctk.CTkFrame(ctrl,fg_color="transparent"); f2.pack(fill="x",padx=16,pady=(4,10))
        self._modo_var=ctk.StringVar(value="INTERVALO")
        ctk.CTkRadioButton(f2,text="⏰ Horas fijas",variable=self._modo_var,
            value="HORAS",font=("Consolas",12),command=self._cambiar_modo).pack(side="left")
        ctk.CTkRadioButton(f2,text="🔁 Intervalo",variable=self._modo_var,
            value="INTERVALO",font=("Consolas",12),command=self._cambiar_modo).pack(side="left",padx=12)

        self._f_horas=ctk.CTkFrame(f2,fg_color="transparent"); self._f_horas.pack(side="left",padx=4)
        self._ent_h=[]
        for lbl in ["T1:","T2:","T3:"]:
            ctk.CTkLabel(self._f_horas,text=lbl,font=("Consolas",12)).pack(side="left")
            e=ctk.CTkEntry(self._f_horas,width=68,font=("Consolas",12),
                fg_color="#0a1420",border_color="#1a3d61")
            e.pack(side="left",padx=3); self._ent_h.append(e)

        self._f_inter=ctk.CTkFrame(f2,fg_color="transparent"); self._f_inter.pack(side="left",padx=4)
        ctk.CTkLabel(self._f_inter,text="Cada:",font=("Consolas",12)).pack(side="left")
        self._ent_inter=ctk.CTkEntry(self._f_inter,width=55,font=("Consolas",12),
            fg_color="#0a1420",border_color="#1a3d61")
        self._ent_inter.pack(side="left",padx=4)
        self._cmb_uni=ctk.CTkOptionMenu(self._f_inter,values=["horas","minutos"],width=96,
            font=("Consolas",12),fg_color="#1a3d61")
        self._cmb_uni.pack(side="left",padx=4)

        self.btn_auto=ctk.CTkButton(f2,text="⏳ ACTIVAR AUTOPILOTO",width=210,height=38,
            font=("Arial",12,"bold"),fg_color="#e4a02b",hover_color="#b37e22",
            text_color="#000",command=self._toggle_auto)
        self.btn_auto.pack(side="right",padx=6)
        self.btn_run=ctk.CTkButton(f2,text="🌤  EXTRAER CLIMA AHORA",width=210,height=38,
            font=("Arial",12,"bold"),fg_color="#2b78e4",hover_color="#1a52a3",
            command=self._run_hilo)
        self.btn_run.pack(side="right",padx=4)
        ctk.CTkButton(f2,text="💾 GUARDAR",width=95,height=38,
            font=("Arial",11,"bold"),fg_color="#1a3d61",hover_color="#2b78e4",
            command=self._guardar_todo).pack(side="right",padx=4)

        # Telemetría + progreso
        self.lbl_estado=ctk.CTkLabel(tab_sync,text="— Sin actividad —",
            font=("Consolas",12,"bold"),text_color="#555")
        self.lbl_estado.pack(pady=(6,0))
        self.pbar=ctk.CTkProgressBar(tab_sync,height=10,fg_color="#0a0f18",
            progress_color="#2b78e4",corner_radius=4)
        self.pbar.pack(fill="x",padx=16,pady=(4,0)); self.pbar.set(0)

        # TIMELINE
        frame_tl=ctk.CTkFrame(tab_sync,fg_color="#080f18",corner_radius=8,
            border_width=1,border_color="#1a3d61")
        frame_tl.pack(fill="x",padx=16,pady=(6,4))
        ctk.CTkLabel(frame_tl,text="ESTADO DEL PROCESO",
            font=("Consolas",9,"bold"),text_color="#1a3d61").pack(anchor="w",padx=12,pady=(4,0))
        fases_row=ctk.CTkFrame(frame_tl,fg_color="transparent"); fases_row.pack(fill="x",pady=4)
        for key,ico,nom in self.FASES:
            col=ctk.CTkFrame(fases_row,fg_color="transparent"); col.pack(side="left",expand=True,pady=4)
            cv=tk.Canvas(col,width=44,height=44,bg="#080f18",highlightthickness=0); cv.pack()
            cv.create_oval(4,4,40,40,fill="#0a0f18",outline="#1a2a44",width=1)
            cv.create_text(22,22,text=ico,font=("Impact",10),fill="#222244")
            self._cvs_fases[key]=cv
            ctk.CTkLabel(col,text=nom,font=("Consolas",8),
                text_color="#333355",justify="center").pack()

        # LOG
        log_frame=ctk.CTkFrame(tab_sync,fg_color="#080f18",corner_radius=8,
            border_width=1,border_color="#1a3d61")
        log_frame.pack(fill="both",expand=True,padx=16,pady=(4,8))
        hdr_log=ctk.CTkFrame(log_frame,fg_color="transparent"); hdr_log.pack(fill="x",padx=8,pady=(4,0))
        ctk.CTkLabel(hdr_log,text="📋 LOG",font=("Consolas",9,"bold"),text_color="#2b9eff").pack(side="left")
        ctk.CTkButton(hdr_log,text="📋 COPIAR LOG",width=120,height=24,
            font=("Consolas",9),fg_color="#1a3d61",hover_color="#2b78e4",
            command=self._copiar_log).pack(side="right")
        ctk.CTkButton(hdr_log,text="Limpiar",width=70,height=24,
            font=("Consolas",9),fg_color="#1a2a3a",hover_color="#333",
            command=lambda:(self.log_box.configure(state="normal"),
                           self.log_box.delete("1.0","end"),
                           self.log_box.configure(state="disabled"))).pack(side="right",padx=4)
        self.log_box=ctk.CTkTextbox(log_frame,font=("Consolas",11),
            fg_color="#050810",text_color="#cccccc",border_width=0,wrap="word")
        self.log_box.pack(fill="both",expand=True,padx=6,pady=(2,6))
        self.log_box.configure(state="disabled")

        # ── PESTAÑA INFORMACION ──────────────────────────────────────────────
        info_scroll = ctk.CTkScrollableFrame(tab_info, fg_color="transparent")
        info_scroll.pack(fill="both", expand=True, padx=16, pady=12)

        def _titulo(txt):
            ctk.CTkLabel(info_scroll, text=txt, font=("Arial",14,"bold"),
                text_color="#2b9eff").pack(anchor="w", pady=(14,4))
        def _texto(txt):
            ctk.CTkLabel(info_scroll, text=txt, font=("Consolas",11),
                text_color="#ccc", justify="left", wraplength=760).pack(anchor="w", pady=(0,2))

        _titulo("¿Que descarga este bot?")
        _texto(
            "Por cada sede SPSA (140 en total), consulta a Open-Meteo el clima diario del\n"
            "rango de fechas seleccionado. Nucleo (siempre incluido):\n"
            "  • Temperatura maxima, minima y promedio (°C)\n"
            "  • Humedad relativa promedio (%)\n"
            "  • Precipitacion acumulada (mm)\n"
            "Por defecto TAMBIEN incluye (activables/desactivables en Configuracion):\n"
            "  • Viento: velocidad maxima, rafaga maxima, direccion dominante\n"
            "  • Radiacion solar (onda corta, MJ/m2)\n"
            "  • Condicion general del clima (codigo WMO)\n"
            "Ademas hay variables opcionales apagadas por defecto: sensacion termica,\n"
            "precipitacion detallada (lluvia/chubascos/nieve/horas), evapotranspiracion,\n"
            "amanecer/atardecer, duracion de luz/sol y UV maximo — todas seleccionables\n"
            "con checkboxes en Configuracion (⚙️).\n\n"
            "Los datos se guardan en Supabase (energia.\"DATA CLIMATICA PERU\") y ademas\n"
            "se genera un respaldo local en Excel/CSV en la carpeta de Google Drive configurada."
        )

        _titulo("Limites reales de la API de Open-Meteo (nivel gratuito)")
        _texto(
            "Segun los terminos oficiales de Open-Meteo (open-meteo.com/en/terms):\n"
            "  • Maximo 10,000 llamadas por dia\n"
            "  • Maximo 5,000 llamadas por hora\n"
            "  • Maximo 600 llamadas por minuto\n"
            "Cada sede = 1 llamada aproximada (si el rango de fechas es corto, <2 semanas,\n"
            "y se piden hasta 10 variables, que es nuestro caso con 5)."
        )

        _titulo("¿Cada cuanto puedo correr la sincronizacion completa (140 sedes)?")
        _texto(
            "Una corrida completa de las 140 sedes usa ~140 llamadas a Open-Meteo\n"
            "SOLO si el rango de fechas es corto (1-2 semanas). Con el limite de\n"
            "10,000/dia, se podrian hacer hasta ~71 corridas cortas por dia sin\n"
            "problema (una cada ~20 minutos, corriendo 24/7)."
        )
        _texto(
            "\nOJO al pedir AÑOS de historia de una sola vez: Open-Meteo cuenta cada\n"
            "peticion de mas de 2 semanas como VARIAS llamadas (proporcional a las\n"
            "semanas pedidas). Un año completo (52 semanas) equivale a ~26 llamadas\n"
            "por sede. Con 140 sedes, bajar 1 año completo de una corrida cuesta\n"
            "aprox. 140 x 26 = ~3,640 llamadas -> seguro dentro del limite diario,\n"
            "pero bajar VARIOS años en una sola corrida (ej. 5 años = ~18,200\n"
            "llamadas) SI puede agotar el cupo de 10,000/dia a mitad de camino.\n\n"
            "Recomendacion practica para backfill de años: correr el bot por\n"
            "tramos de 1 año por vez (usando el selector de fechas), en corridas\n"
            "separadas por dia, en vez de pedir 5-10 años de un solo tiron."
        )

        _titulo("Autopiloto: que pasa segun el modo elegido")
        _texto(
            "Modo INTERVALO: corre cada X horas/minutos desde la ultima ejecucion.\n"
            "  Ej: cada 6 horas = 4 corridas/dia = ~560 llamadas/dia (muy por debajo del limite).\n\n"
            "Modo HORAS FIJAS (T1/T2/T3): corre 3 veces al dia a horas exactas que definas\n"
            "  en la pestaña de Sincronizacion (ej. 06:00, 12:00, 18:00).\n"
            "  Esto es lo mas recomendable para datos climaticos diarios, ya que evita\n"
            "  corridas innecesarias y usa una fraccion minima del cupo de la API."
        )

        _titulo("Nota sobre uso no-comercial")
        _texto(
            "Open-Meteo es gratuito solo para uso NO comercial (uso interno como este\n"
            "califica). Si en algun momento se requiere alto volumen o garantia de\n"
            "disponibilidad (SLA), existe un plan pago (customer-api.open-meteo.com)."
        )

        _titulo("¿Que tan confiable es esta data? ¿Como la genera Open-Meteo?")
        _texto(
            "Open-Meteo NO tiene estaciones meteorologicas propias. Combina datos de\n"
            "estaciones terrestres, radiosondas, aviones, radar y satelites de servicios\n"
            "meteorologicos nacionales (NOAA/GFS, ECMWF, DWD/ICON, MeteoFrance, JMA, etc.)\n"
            "y los procesa con modelos numericos que rellenan zonas sin estaciones cercanas\n"
            "mediante interpolacion fisica-matematica. Para cada coordenada GPS, elige\n"
            "automaticamente el modelo de mejor resolucion disponible en esa zona\n"
            "('best-match'); en Sudamerica esto normalmente son modelos globales\n"
            "(ECMWF / GFS) de ~9-11 km de resolucion."
        )
        _texto(
            "\nDESDE ESTA VERSION - el bot elige el endpoint automaticamente segun\n"
            "que tan antigua es la fecha pedida:\n"
            f"  • Fechas de mas de {UMBRAL_DIAS_ARCHIVO} dias atras -> Archive API (ERA5),\n"
            "    dataset de reanalisis FIJO y consolidado (no cambia con el tiempo,\n"
            "    salvo un ajuste minimo dentro de los primeros 5-7 dias tras la fecha).\n"
            f"  • Fechas de los ultimos {UMBRAL_DIAS_ARCHIVO} dias -> Forecast API,\n"
            "    el mas reciente disponible, aunque puede recibir pequeños ajustes\n"
            "    si el modelo se actualiza de version en el futuro.\n"
            "  • Si un mismo rango cruza ambos periodos, el bot pide cada tramo al\n"
            "    endpoint correcto y los une automaticamente en un solo resultado.\n"
            "La columna 'fuente_datos' de cada fila indica cual de los dos se uso,\n"
            "para que quede trazado de donde vino cada dato historico."
        )
        _texto(
            "\nEsto es ideal para trabajar con años de historia: al pedir un rango de\n"
            "fechas antiguo (ej. todo el 2023), el bot usa ERA5 automaticamente, que\n"
            "es el dataset diseñado para ser un archivo permanente y reproducible."
        )
        _texto(
            "\nResolucion espacial: 9-11 km en la mayoria de Peru (modelos globales).\n"
            "Esto significa que dos sedes muy cercanas entre si (a pocos km) pueden\n"
            "compartir practicamente el mismo dato de clima, ya que se ubican dentro\n"
            "de la misma celda de la grilla del modelo."
        )



    def _cargar_ui(self):
        cfg=self.config
        self._set_entry(self.ent_i,cfg.get("f_ini",(datetime.now()-timedelta(days=1)).strftime("%Y-%m-%d")))
        self._set_entry(self.ent_f,cfg.get("f_fin",datetime.now().strftime("%Y-%m-%d")))
        for i,hk in enumerate(["hora1","hora2","hora3"]):
            self._ent_h[i].delete(0,"end"); self._ent_h[i].insert(0,cfg.get(hk,["06:00","12:00","18:00"][i]))
        self._ent_inter.delete(0,"end"); self._ent_inter.insert(0,cfg.get("intervalo_val","24"))
        self._cmb_uni.set(cfg.get("intervalo_uni","horas"))
        self._modo_var.set(cfg.get("modo_auto","INTERVALO"))
        self._cambiar_modo()

    def _set_entry(self,ent,val):
        ent.configure(state="normal"); ent.delete(0,"end"); ent.insert(0,val)
        ent.configure(state="readonly")

    def _cambiar_modo(self):
        if self._modo_var.get()=="HORAS":
            self._f_horas.pack(side="left",padx=4); self._f_inter.pack_forget()
        else:
            self._f_inter.pack(side="left",padx=4); self._f_horas.pack_forget()

    def _set_ini(self,f): self._set_entry(self.ent_i,f)
    def _set_fin(self,f): self._set_entry(self.ent_f,f)
    def _set_hoy(self):
        hoy=datetime.now().strftime("%Y-%m-%d")
        self._set_entry(self.ent_i,hoy); self._set_entry(self.ent_f,hoy)
    def _set_ayer(self):
        ayer=(datetime.now()-timedelta(days=1)).strftime("%Y-%m-%d")
        self._set_entry(self.ent_i,ayer); self._set_entry(self.ent_f,ayer)

    def _guardar_todo(self):
        self.config["f_ini"]=self.ent_i.get()
        self.config["f_fin"]=self.ent_f.get()
        for i,hk in enumerate(["hora1","hora2","hora3"]):
            self.config[hk]=self._ent_h[i].get()
        self.config["intervalo_val"]=self._ent_inter.get()
        self.config["intervalo_uni"]=self._cmb_uni.get()
        self.config["modo_auto"]=self._modo_var.get()
        cfg_guardar(self.config)
        self.escribir_log("Configuracion guardada.")

    def _sep(self): self.escribir_log("─"*62)

    def escribir_log(self,txt):
        def _do():
            self.log_box.configure(state="normal")
            ts=datetime.now().strftime("%H:%M:%S")
            self.log_box.insert("end",f"[{ts}] {txt}\n")
            self.log_box.see("end"); self.log_box.configure(state="disabled")
        self.after(0,_do)

    def _copiar_log(self):
        txt=self.log_box.get("1.0","end")
        self.clipboard_clear(); self.clipboard_append(txt)
        self.escribir_log("📋 Log copiado al portapapeles.")

    def _loop_reloj(self):
        while True:
            self.after(0,lambda:self.lbl_reloj.configure(
                text=datetime.now().strftime("🕐 %H:%M:%S")))
            time.sleep(1)

    # ── PROCESO PRINCIPAL ─────────────────────────────────────────────────────
    def _run_hilo(self):
        threading.Thread(target=self._ejecutar,daemon=True).start()

    def _ejecutar(self):
        if self.ejecutando:
            self.escribir_log("Ya hay una extraccion en curso."); return
        self.ejecutando=True; self._stop.clear(); self._gear_activo=True
        self.after(0,lambda:(
            self.btn_run.configure(state="disabled",text="⏳ Extrayendo..."),
            self.pbar.set(0), self._reset_timeline(),
            self.lbl_estado.configure(text="⚡ Iniciando extraccion...",text_color="#2b9eff")
        ))
        t0=time.time()
        # La fecha guardada solo se respeta en una corrida MANUAL individual
        # (útil para un backfill histórico puntual). Cualquier corrida automática
        # -autopiloto propio o disparada por la cascada del Bot Master- siempre
        # usa el momento exacto, para nunca quedarse pegada en una fecha vieja.
        # "Ventana móvil" (últimos N días) evita repedir meses de historia ya
        # cargada en cada corrida; "días de pronóstico" extiende f_fin al
        # futuro -el endpoint de Open-Meteo que ya se usa para fechas
        # recientes (URL_METEO, ver _elegir_tramos_meteo) es el mismo de
        # pronóstico real, soporta hasta 16 días adelante sin cambios.
        usar_fecha_dinamica = self.autopiloto or (getattr(self, "_origen_activacion", "individual") == "master")
        ventana_dias = int(self.config.get("ventana_movil_dias", 3) or 0)
        dias_prediccion = int(self.config.get("dias_prediccion", 3) or 0)
        if usar_fecha_dinamica and ventana_dias > 0:
            f_ini = (datetime.now() - timedelta(days=ventana_dias)).strftime('%Y-%m-%d')
        else:
            f_ini = self.ent_i.get().strip()
        f_fin = (datetime.now() + timedelta(days=dias_prediccion)).strftime('%Y-%m-%d') if usar_fecha_dinamica else self.ent_f.get().strip()
        url_sb = self.config.get("url_supabase", URL_SUPABASE)
        key_sb = self.config.get("key_supabase", KEY_SUPABASE)
        secret_sb = self.config.get("secret_key_supabase", SECRET_KEY_SUPABASE)

        # ── Registro de seguimiento (tabla bot_activaciones) ──
        _activacion_id = None
        if pme_common:
            try:
                _activacion_id = pme_common.registrar_inicio_activacion(
                    bot_id="bot_clima_spsa", bot_nombre="Bot Open-Meteo V1.0", familia="climatico",
                    origen=getattr(self, "_origen_activacion", "individual"),
                    modo_ejecucion="autopilot" if self.autopiloto else "manual",
                    master_run_id=getattr(self, "_master_run_id_activacion", None),
                    autopilot_modo=self.config.get("modo_auto") if self.autopiloto else None,
                    autopilot_intervalo_val=self.config.get("intervalo_val") if self.autopiloto else None,
                    autopilot_intervalo_uni=self.config.get("intervalo_uni") if self.autopiloto else None,
                )
            except Exception:
                pass

        try:
            # ── FASE 1: Leer sedes de Supabase ──
            self._set_fase("sedes","activo")
            self._sep()
            self.escribir_log("Leyendo sedes desde Supabase (schema infraestructura, vista publica)...")
            sb_infra=create_client(url_sb,key_sb)
            sb_infra.postgrest.timeout = 15
            sedes = []
            try:
                resp = sb_infra.table("vw_sedes_clima")\
                    .select("ceco,sede,tag,latitud,longitud,departamento,provincia,distrito")\
                    .execute()
                sedes = resp.data or []
                if sedes:
                    self.escribir_log("   OK — vista publica cargada correctamente.")
            except Exception as e_vista:
                self.escribir_log(f"   Vista no disponible ({str(e_vista)[:60]})")

            if not sedes:
                self.escribir_log("   Intentando consulta directa a schema infraestructura...")
                try:
                    resp_infra = sb_infra.schema("infraestructura").table("Tabla-Maestra-Infraestructura").select("*").execute()
                    raw = resp_infra.data or []
                    for r in raw:
                        lat = r.get('LATITUD') or r.get('latitud') or r.get('Latitud')
                        lon = r.get('LONGITUD') or r.get('longitud') or r.get('Longitud')
                        sede_nom = r.get('SEDE') or r.get('sede') or r.get('Sede') or ''
                        ceco = r.get('CECO') or r.get('ceco') or r.get('Ceco') or ''
                        tag = r.get('TAG') or r.get('tag') or r.get('Tag') or ''
                        dep = r.get('DEPARTAMENTO') or r.get('departamento') or ''
                        prov = r.get('PROVINCIA') or r.get('provincia') or ''
                        dist = r.get('DISTRITO') or r.get('distrito') or ''
                        if lat and lon:
                            try:
                                sedes.append({
                                    "ceco": str(ceco),
                                    "sede": str(sede_nom),
                                    "tag": str(tag),
                                    "latitud": float(lat),
                                    "longitud": float(lon),
                                    "departamento": str(dep),
                                    "provincia": str(prov),
                                    "distrito": str(dist)
                                })
                            except (ValueError, TypeError):
                                pass
                    if sedes:
                        self.escribir_log(f"   OK — {len(sedes)} sedes obtenidas desde schema infraestructura.")
                except Exception as e_infra:
                    self.escribir_log(f"   Schema infraestructura no disponible ({str(e_infra)[:60]})")

            if not sedes:
                cache_path = os.path.join(os.path.dirname(__file__), "..", "bot_senamhi_spsa", "sedes_cache.json")
                if os.path.exists(cache_path):
                    self.escribir_log("   Cargando sedes desde cache local (sedes_cache.json)...")
                    try:
                        with open(cache_path, "r", encoding="utf-8") as f:
                            sedes = json.load(f)
                        self.escribir_log(f"   OK — {len(sedes)} sedes cargadas desde cache local.")
                    except Exception as e_cache:
                        self.escribir_log(f"   Error leyendo cache local: {e_cache}")

            total_sedes = len(sedes)
            self.escribir_log(f"   {total_sedes} sedes con coordenadas GPS encontradas.")
            if not sedes:
                raise ValueError(
                    "No se pudieron cargar las sedes ni de Supabase ni del cache local.\n"
                    "Si deseas crear la vista publica en Supabase, ejecuta este SQL:\n"
                    "CREATE OR REPLACE VIEW public.vw_sedes_clima AS\n"
                    "SELECT ceco,sede,tag,latitud,longitud,departamento,provincia,distrito\n"
                    "FROM infraestructura.\"Tabla-Maestra-Infraestructura\"\n"
                    "WHERE latitud IS NOT NULL AND longitud IS NOT NULL;\n"
                    "GRANT SELECT ON public.vw_sedes_clima TO anon;")
            self._set_fase("sedes","ok")
            self.after(0,lambda:self.pbar.set(0.1))

            # ── FASE 2: Consultar Open-Meteo por cada sede ──
            self._set_fase("meteo","activo")
            self._sep()
            self.escribir_log(f"Consultando clima del {f_ini} al {f_fin}...")
            claves_api_activas = _variables_api_activas(self.config)
            variables_query = ",".join(claves_api_activas)
            nombres_legibles = [VARIABLES_CATALOGO[k][1] for k in claves_api_activas]
            self.escribir_log(f"Variables activas ({len(claves_api_activas)}): " + ", ".join(nombres_legibles))
            _tramos_preview = _elegir_tramos_meteo(f_ini, f_fin)
            for _u, _ti, _tf, _tipo in _tramos_preview:
                etiqueta = "Archive/ERA5 (historico fijo)" if _tipo=="archive" else "Forecast (reciente)"
                self.escribir_log(f"   Tramo {_ti} a {_tf} -> {etiqueta}")
            self._sep()

            resultados=[]
            errores_meteo=0

            for idx,sede in enumerate(sedes):
                if self._stop.is_set(): break
                ceco    =str(sede.get("ceco",""))
                nombre  =str(sede.get("sede",""))
                tag     =str(sede.get("tag",""))
                lat     =sede.get("latitud")
                lon     =sede.get("longitud")
                dpto    =str(sede.get("departamento",""))
                prov    =str(sede.get("provincia",""))
                dist    =str(sede.get("distrito",""))

                if not lat or not lon: continue

                # Elegir endpoint(s): archive (ERA5, historico fijo) y/o forecast (reciente)
                tz_pais = PAISES_TZ.get(self.config.get("pais","Peru"), "America/Lima")
                tramos = _elegir_tramos_meteo(f_ini, f_fin)

                daily_acum = {"time": []}
                for clave in claves_api_activas:
                    daily_acum[clave] = []
                elevacion = None
                tipos_usados = set()

                for url_api, t_ini, t_fin, tipo in tramos:
                    params={
                        "latitude":  lat,
                        "longitude": lon,
                        "daily":     variables_query,
                        "timezone":  tz_pais,
                        "start_date":t_ini,
                        "end_date":  t_fin,
                    }
                    datos=None
                    for intento in range(6):
                        try:
                            r=requests.get(url_api,params=params,timeout=40)
                            if r.status_code == 429:
                                reason_msg = ""
                                try:
                                    reason_msg = r.json().get('reason', '')
                                except Exception: pass
                                
                                if "Hourly API request limit exceeded" in reason_msg:
                                    self.escribir_log(f"   🛑 Límite por hora de Open-Meteo alcanzado ({ceco}). El servidor liberará la cuota al inicio de la siguiente hora.")
                                
                                wait_sec = 15 + (intento * 10)
                                self.escribir_log(f"   ⚠️ Límite API Open-Meteo (429) en {ceco}. Enfriando {wait_sec}s (intento {intento+1}/6)...")
                                time.sleep(wait_sec)
                                continue
                            r.raise_for_status()
                            datos=r.json()
                            break
                        except Exception as e_m:
                            if "429" in str(e_m) or "Too Many Requests" in str(e_m):
                                wait_sec = 15 + (intento * 10)
                                self.escribir_log(f"   ⚠️ Límite 429 en {ceco}. Enfriando {wait_sec}s...")
                                time.sleep(wait_sec)
                            elif intento < 5:
                                time.sleep(3*(intento+1))
                            else:
                                self.escribir_log(f"   ERROR {ceco} ({tipo}): {str(e_m)[:60]}")
                    if not datos:
                        continue
                    if elevacion is None:
                        elevacion = datos.get("elevation")
                    tipos_usados.add(tipo)
                    d = datos.get("daily", {})
                    n_dias_tramo = len(d.get("time", []))
                    for k in daily_acum:
                        valores = d.get(k)
                        if valores is None:
                            valores = [None]*n_dias_tramo  # variable no soportada en este tramo/endpoint
                        daily_acum[k].extend(valores)

                if not daily_acum["time"]:
                    errores_meteo+=1
                    continue

                if tipos_usados == {"archive"}:
                    fuente_reg = FUENTE_ARCHIVO_LABEL
                elif tipos_usados == {"forecast"}:
                    fuente_reg = FUENTE_DATOS_LABEL
                else:
                    fuente_reg = FUENTE_MIXTA_LABEL

                datos = {"elevation": elevacion, "daily": daily_acum}

                daily=datos.get("daily",{})
                fechas    =daily.get("time",[])

                for i,fecha in enumerate(fechas):
                    fila = {
                        "ceco":           ceco,
                        "sede":           nombre,
                        "tag":            tag,
                        "fecha":          fecha,
                        "departamento":   dpto,
                        "provincia":      prov,
                        "distrito":       dist,
                        "latitud":        lat,
                        "longitud":       lon,
                        "elevacion_m":    elevacion,
                        "fuente_datos":   fuente_reg,
                        "fecha_sync":     datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    }
                    for clave_api in claves_api_activas:
                        col_supabase = VARIABLES_CATALOGO[clave_api][0]
                        serie = daily.get(clave_api, [])
                        fila[col_supabase] = serie[i] if i < len(serie) else None
                    resultados.append(fila)

                pct=0.1+(idx+1)/total_sedes*0.5
                self.after(0,lambda p=pct:self.pbar.set(p))
                self.after(0,lambda i=idx,t=total_sedes,n=nombre,c=len(resultados):
                    self.lbl_estado.configure(
                        text=f"⚡ Sede {i+1}/{t}: {n} | Registros: {c:,}",
                        text_color="#2b9eff"))
                
                # Log cada sede individualmente para máxima visibilidad en terminal
                self.escribir_log(
                    f"   ⚡ Sede [{idx+1:>3}/{total_sedes}]: {nombre} -> OK ({len(resultados):,} acumulados)")

                if (idx+1)%10==0 or idx==total_sedes-1:
                    self.escribir_log(
                        f"📊 Avance General: {idx+1:>4}/{total_sedes} sedes | "
                        f"Registros acumulados: {len(resultados):>6,} | "
                        f"Errores: {errores_meteo}")
                
                # Pausa configurable desde config (por defecto 1.5s para 30 años)
                cfg_obj = getattr(self, 'cfg', getattr(self, 'config', {}))
                delay_actual = float(cfg_obj.get('delay_seg', 1.5))
                time.sleep(delay_actual)

            self._set_fase("meteo","ok")
            self._sep()
            self.escribir_log(f"Total registros climaticos obtenidos: {len(resultados):,}")
            self.escribir_log(f"Sedes con error de conexion: {errores_meteo}")

            if not resultados:
                raise ValueError("No se obtuvieron datos climaticos de ninguna sede.")

            # ── FASE 3: Proceso ──
            self._set_fase("proceso","activo")
            self._sep()
            self.escribir_log("Procesando y validando datos...")
            df=pd.DataFrame(resultados)
            df=df.where(pd.notnull(df),None)
            df=df.drop_duplicates(subset=["ceco","fecha"],keep="last")
            self.escribir_log(f"   Registros unicos (ceco+fecha): {len(df):,}")
            self._set_fase("proceso","ok")
            self.after(0,lambda:self.pbar.set(0.65))

            # ── FASE 4: Backup en Excel (carpeta local de Google Drive) ──
            self._set_fase("drive","activo")
            try:
                carpeta_drive = self.config.get("carpeta_drive","").strip()
                if carpeta_drive and os.path.isdir(carpeta_drive):
                    carpeta_destino = carpeta_drive
                else:
                    if carpeta_drive:
                        self.escribir_log(
                            f"   Carpeta Google Drive configurada no existe ({carpeta_drive}); "
                            f"se usa la carpeta del bot.")
                    carpeta_destino = os.path.dirname(os.path.abspath(__file__))

                nombre_base = f"CLIMA_SPSA_{f_ini}_{f_fin}_{datetime.now().strftime('%H%M')}"
                if self.config.get("exportar_excel", True):
                    ruta_excel = os.path.join(carpeta_destino, nombre_base + ".xlsx")
                    with pd.ExcelWriter(ruta_excel, engine="openpyxl") as writer:
                        df.to_excel(writer, index=False, sheet_name="Clima SPSA")
                        ws = writer.sheets["Clima SPSA"]
                        for i, col in enumerate(df.columns, start=1):
                            ancho = max(12, min(30, df[col].astype(str).str.len().max() if len(df) else 12))
                            ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = ancho
                    self.escribir_log(f"Excel guardado en Drive: {ruta_excel}")
                else:
                    ruta_csv = os.path.join(carpeta_destino, nombre_base + ".csv")
                    df.to_csv(ruta_csv, index=False, sep=";", encoding="utf-8-sig")
                    self.escribir_log(f"CSV guardado en Drive: {ruta_csv}")
                self._set_fase("drive","ok")
            except Exception as e_csv:
                self.escribir_log(f"Backup error: {str(e_csv)[:80]}")
                self._set_fase("drive","skip")

            # ── FASE 5: Subir a Supabase ──
            self._set_fase("insertar","activo")
            self._sep()
            self.escribir_log(f"Subiendo {len(df):,} registros a Supabase...")
            sb_clima=create_client(url_sb,key_sb)
            sb_clima.postgrest.timeout = 15
            sb_clima_secret=None  # se crea solo si hace falta (respaldo)
            usando_respaldo=False
            dicts=df.to_dict(orient="records")
            # Sanitizar llaves para la tabla energia."DATA METEO CLIMA"
            COLUMNAS_OPENMETEO = {
                'ceco', 'sede', 'fecha', 'precipitacion_mm', 'temp_max', 'temp_min',
                'temp_promedio', 'humedad_pct', 'viento_kmh', 'latitud', 'longitud',
                'fuente_datos', 'fecha_sync'
            }

            def _bulbo_humedo(t, rh):
                """Stull (2011): Tw approx. Valido 0-60°C, 5-99% HR."""
                import math as _m
                if t is None or rh is None or rh <= 0:
                    return None
                try:
                    tw = (t * _m.atan(0.151977 * _m.sqrt(rh + 8.313659))
                          + _m.atan(t + rh)
                          - _m.atan(rh - 1.676331)
                          + 0.00391838 * (rh ** 1.5) * _m.atan(0.023101 * rh)
                          - 4.686035)
                    return round(tw, 2)
                except Exception:
                    return None

            # Obtener config de indicadores derivados
            calcular_bulbo = self.config.get("calcular_bulbo_humedo", True)

            clean_dicts = []
            for d in dicts:
                c_row = {}
                for col in COLUMNAS_OPENMETEO:
                    if col in d:
                        c_row[col] = d[col]
                    elif col == 'precipitacion_mm' and 'precipitacion' in d:
                        c_row['precipitacion_mm'] = d['precipitacion']
                    elif col == 'viento_kmh' and 'viento_max_kmh' in d:
                        c_row['viento_kmh'] = d['viento_max_kmh']
                # temp_promedio derivada
                if 'temp_promedio' not in c_row or c_row.get('temp_promedio') is None:
                    t_max = c_row.get('temp_max')
                    t_min = c_row.get('temp_min')
                    if t_max is not None and t_min is not None:
                        c_row['temp_promedio'] = round((t_max + t_min) / 2.0, 2)
                # Bulbo húmedo calculado
                if calcular_bulbo:
                    rh = c_row.get('humedad_pct')
                    t_max = c_row.get('temp_max')
                    t_min = c_row.get('temp_min')
                    t_prom = c_row.get('temp_promedio')
                    c_row['bulbo_humedo_max'] = _bulbo_humedo(t_max, rh)
                    c_row['bulbo_humedo_min'] = _bulbo_humedo(t_min, rh)
                    c_row['bulbo_humedo_promedio'] = _bulbo_humedo(t_prom, rh)
                clean_dicts.append(c_row)
            dicts = clean_dicts

            total=len(dicts); ok=0
            TAM=200
            total_bloques=math.ceil(total/TAM)

            for i in range(0,total,TAM):
                if self._stop.is_set(): break
                fin=min(i+TAM,total); chunk=dicts[i:fin]
                blq=i//TAM+1
                for intento in range(5):
                    try:
                        cliente_activo = sb_clima_secret if usando_respaldo else sb_clima
                        
                        # Intento 1: esquema 'energia' -> DATA CLIMATICA OPENMETEO
                        try:
                            cliente_activo.schema(SCHEMA_CLIMA).table(TABLA_CLIMA)\
                                .upsert(chunk,on_conflict="ceco,fecha").execute()
                        except Exception as e_sub1:
                            err_sub1 = str(e_sub1)
                            if any(tok in err_sub1 for tok in ["PGRST205", "PGRST106", "schema cache", "Invalid schema", "42501"]):
                                # Intento 2: esquema vista 'public' -> DATA CLIMATICA OPENMETEO
                                try:
                                    cliente_activo.table(TABLA_CLIMA)\
                                        .upsert(chunk,on_conflict="ceco,fecha").execute()
                                except Exception as e_sub2:
                                    err_sub2 = str(e_sub2)
                                    if any(tok in err_sub2 for tok in ["PGRST205", "PGRST106", "schema cache"]):
                                        # Intento 3: esquema vista 'public' -> DATA CLIMATICA PERU
                                        cliente_activo.table("DATA CLIMATICA PERU")\
                                            .upsert(chunk,on_conflict="ceco,fecha").execute()
                                    else:
                                        raise e_sub2
                            else:
                                raise e_sub1

                        ok+=len(chunk)
                        etiqueta = " (via respaldo)" if usando_respaldo else ""
                        self.escribir_log(
                            f"   Bloque {blq:>3}/{total_bloques} | "
                            f"+{len(chunk):>3} | Acum: {ok:>6,}/{total:,} | OK{etiqueta}")
                        break
                    except Exception as e_s:
                        es_permiso = "permission denied" in str(e_s).lower() or "42501" in str(e_s)
                        if es_permiso and not usando_respaldo:
                            self.escribir_log(
                                "   Permiso denegado con key publishable. "
                                "Reintentando con SECRET_KEY de respaldo...")
                            sb_clima_secret=create_client(url_sb,secret_sb)
                            sb_clima_secret.postgrest.timeout = 15
                            usando_respaldo=True
                            continue  # reintenta este mismo bloque ya con el respaldo
                        if intento<4:
                            time.sleep(2**intento)
                        else:
                            self.escribir_log(f"   Bloque {blq} FALLIDO: {str(e_s)[:80]}")
                pct=0.65+fin/total*0.35
                self.after(0,lambda p=pct:self.pbar.set(p))
                self.after(0,lambda o=ok,t=total:self.lbl_tele.configure(
                    text=f"Supabase: {o:,}/{t:,} registros subidos",text_color="#2b9eff"))
                time.sleep(0.1)

            self._set_fase("insertar","ok")
            self._set_fase("fin","ok")

            # ── RESUMEN ──
            mins,segs=divmod(int(time.time()-t0),60)
            self._sep()
            self.escribir_log("RESUMEN FINAL")
            self.escribir_log(f"   Tiempo total        : {mins}m {segs}s")
            self.escribir_log(f"   Sedes procesadas    : {total_sedes}")
            self.escribir_log(f"   Rango fechas        : {f_ini} a {f_fin}")
            self.escribir_log(f"   Registros obtenidos : {len(resultados):,}")
            self.escribir_log(f"   Registros subidos   : {ok:,}")
            self.escribir_log(f"   Errores conexion    : {errores_meteo}")
            self._sep()
            self.after(0,lambda m=mins,s=segs,o=ok:(
                self.lbl_estado.configure(
                    text=f"✅ Completado — {m}m {s}s — {o:,} registros",
                    text_color="#00ff44"),
                self.pbar.set(1.0),
                self.pbar.configure(progress_color="#00aa33")
            ))

            if pme_common and _activacion_id:
                try:
                    pme_common.registrar_fin_activacion(
                        _activacion_id,
                        estado="exito",
                        codigo_salida=0,
                        duracion_seg=int(time.time() - t0),
                        fecha_datos_desde=f_ini,
                        fecha_datos_hasta=f_fin,
                        registros_procesados=ok,
                        tipo_escritura="incremental",
                        tabla_destino=TABLA_CLIMA,
                        ram_mb_pico=pme_common.medir_ram_actual_mb(),
                    )
                except Exception:
                    pass

        except Exception as e:
            self._ultimo_error = str(e)
            self.escribir_log(f"ERROR CRITICO: {str(e)}")
            self._set_fase("fin","error")
            self.after(0,lambda:self.lbl_estado.configure(
                text=f"❌ Error — {str(e)[:50]}",text_color="#ff3333"))
            if pme_common:
                try:
                    pme_common.enviar_alerta_fallo_bot("Bot Open-Meteo (Clima)", e)
                except Exception:
                    pass
                if _activacion_id:
                    try:
                        pme_common.registrar_fin_activacion(
                            _activacion_id,
                            estado="fallo",
                            codigo_salida=1,
                            duracion_seg=int(time.time() - t0),
                            fecha_datos_desde=f_ini,
                            fecha_datos_hasta=f_fin,
                            tabla_destino=TABLA_CLIMA,
                            exc=e,
                            ram_mb_pico=pme_common.medir_ram_actual_mb(),
                        )
                    except Exception:
                        pass

        finally:
            self.ejecutando=False; self._gear_activo=False
            self.after(0,lambda:self.btn_run.configure(
                state="normal",text="🌤  EXTRAER CLIMA AHORA"))

    # ── AUTOPILOTO ────────────────────────────────────────────────────────────
    def _toggle_auto(self):
        if not self.autopiloto:
            self.autopiloto=True; self._stop.clear(); self._auto_activo=True
            self.btn_auto.configure(text="🛑 DETENER AUTOPILOTO",
                fg_color="#cc0000",hover_color="#880000",text_color="#fff")
            self.escribir_log("Autopiloto ACTIVADO.")
            threading.Thread(target=self._loop_auto,daemon=True).start()
        else:
            self.autopiloto=False; self._stop.set(); self._auto_activo=False
            self.btn_auto.configure(text="⏳ ACTIVAR AUTOPILOTO",
                fg_color="#e4a02b",hover_color="#b37e22",text_color="#000")
            self.lbl_tele.configure(text="")
            self.escribir_log("Autopiloto DETENIDO.")

    def _loop_auto(self):
        while self.autopiloto:
            modo=self.config.get("modo_auto","INTERVALO")
            if modo=="INTERVALO":
                val=int(self.config.get("intervalo_val","24"))
                uni=self.config.get("intervalo_uni","horas")
                total=val*3600 if uni=="horas" else val*60
                # Actualizar fecha fin a ayer antes de cada ejecucion
                ayer=(datetime.now()-timedelta(days=1)).strftime("%Y-%m-%d")
                self.after(0,lambda a=ayer:self._set_entry(self.ent_f,a))
                threading.Thread(target=self._ejecutar,daemon=True).start()
                for s in range(total,0,-1):
                    if not self.autopiloto: return
                    mr,sr=divmod(s,60)
                    self.after(0,lambda m=mr,ss=sr:self.lbl_tele.configure(
                        text=f"Proxima ejecucion en: {m}m {ss:02d}s",text_color="#444"))
                    time.sleep(1)
            else:
                while self.autopiloto:
                    ahora=datetime.now().strftime("%H:%M")
                    for hk in ["hora1","hora2","hora3"]:
                        if ahora==self.config.get(hk,""):
                            ayer=(datetime.now()-timedelta(days=1)).strftime("%Y-%m-%d")
                            self.after(0,lambda a=ayer:self._set_entry(self.ent_f,a))
                            threading.Thread(target=self._ejecutar,daemon=True).start()
                            time.sleep(61)
                    self.after(0,lambda:self.lbl_tele.configure(
                        text=f"Auto: {datetime.now().strftime('%H:%M:%S')}",text_color="#333"))
                    time.sleep(1)

    # ── CONFIG ────────────────────────────────────────────────────────────────
    def _abrir_config(self):
        w=ctk.CTkToplevel(self); w.title("Configuracion")
        w.geometry("600x760"); w.resizable(False,True)
        w.attributes("-topmost",True); w.grab_set(); w.lift(); w.focus_force()
        ctk.CTkLabel(w,text="Configuracion Bot Clima V1.0",
            font=("Impact",20),text_color="#2b9eff").pack(pady=(16,4))
        ctk.CTkFrame(w,height=1,fg_color="#2b9eff").pack(fill="x",padx=20)

        scroll = ctk.CTkScrollableFrame(w, width=520, height=540, fg_color="transparent")
        scroll.pack(padx=16, pady=(10,4), fill="both", expand=True)

        # --- Seccion: Exportacion / Google Drive local ---
        ctk.CTkLabel(scroll,text="Exportacion a Google Drive (local)",
            font=("Arial",13,"bold"),text_color="#2b9eff").pack(anchor="w",pady=(4,6))

        ctk.CTkLabel(scroll,text="Carpeta local sincronizada con Google Drive:",
            font=("Consolas",11),text_color="#ccc").pack(anchor="w")
        frame_carpeta = ctk.CTkFrame(scroll, fg_color="transparent")
        frame_carpeta.pack(fill="x", pady=(2,10))
        self._ent_carpeta = ctk.CTkEntry(frame_carpeta, width=360, height=34,
            font=("Consolas",10), fg_color="#0a1420", border_color="#1a3d61")
        self._ent_carpeta.insert(0, self.config.get("carpeta_drive",""))
        self._ent_carpeta.pack(side="left", padx=(0,6))
        ctk.CTkButton(frame_carpeta, text="Examinar...", width=90, height=34,
            fg_color="#1a3d61", hover_color="#2b78e4",
            command=self._elegir_carpeta_drive).pack(side="left")

        self._var_formato = ctk.StringVar(
            value="excel" if self.config.get("exportar_excel", True) else "csv")
        frame_fmt = ctk.CTkFrame(scroll, fg_color="transparent")
        frame_fmt.pack(fill="x", pady=(0,14))
        ctk.CTkLabel(frame_fmt, text="Formato de backup:",
            font=("Consolas",11), text_color="#ccc").pack(side="left", padx=(0,10))
        ctk.CTkRadioButton(frame_fmt, text="Excel (.xlsx)", variable=self._var_formato,
            value="excel", fg_color="#2b9eff").pack(side="left", padx=6)
        ctk.CTkRadioButton(frame_fmt, text="CSV (.csv)", variable=self._var_formato,
            value="csv", fg_color="#2b9eff").pack(side="left", padx=6)

        ctk.CTkFrame(scroll,height=1,fg_color="#1a3d61").pack(fill="x",pady=10)

        # --- Seccion: Pais activo ---
        ctk.CTkLabel(scroll,text="Pais (define el timezone para Open-Meteo)",
            font=("Arial",13,"bold"),text_color="#2b9eff").pack(anchor="w",pady=(4,6))
        lista_paises = list(PAISES_TZ.keys())  # Peru ya esta primero en el dict
        self._cmb_pais = ctk.CTkOptionMenu(scroll, values=lista_paises, width=240,
            font=("Consolas",11), fg_color="#1a3d61")
        self._cmb_pais.set(self.config.get("pais","Peru"))
        self._cmb_pais.pack(anchor="w", pady=(0,4))
        ctk.CTkLabel(scroll,
            text="Afecta la hora local usada al pedir clima diario a Open-Meteo\n"
                 "(no cambia el pais de las sedes, solo el timezone de referencia).",
            font=("Consolas",9),text_color="#555",justify="left").pack(anchor="w",pady=(0,4))

        ctk.CTkFrame(scroll,height=1,fg_color="#1a3d61").pack(fill="x",pady=10)

        # --- Seccion: Variables climaticas a descargar ---
        ctk.CTkLabel(scroll,text="Variables climaticas a descargar",
            font=("Arial",13,"bold"),text_color="#2b9eff").pack(anchor="w",pady=(4,6))
        ctk.CTkLabel(scroll,
            text="Nucleo (siempre incluidas): temp. max/min/prom, humedad, precipitacion.\n"
                 "Marca abajo cuales variables adicionales quieres tambien:",
            font=("Consolas",9),text_color="#888",justify="left").pack(anchor="w",pady=(0,6))

        self._chk_variables = {}
        activas_actuales = set(self.config.get("variables_activas", _variables_default_activas()))
        for cat_key, cat_lbl in CATEGORIAS_VARIABLES:
            ctk.CTkLabel(scroll, text=cat_lbl, font=("Consolas",11,"bold"),
                text_color="#e4a02b").pack(anchor="w", pady=(6,2))
            for clave_api,(col,etiqueta,cat,default) in VARIABLES_CATALOGO.items():
                if cat != cat_key: continue
                var = ctk.BooleanVar(value=(clave_api in activas_actuales))
                chk = ctk.CTkCheckBox(scroll, text=etiqueta, variable=var,
                    font=("Consolas",10), fg_color="#2b9eff", hover_color="#1a52a3")
                chk.pack(anchor="w", padx=(12,0), pady=1)
                self._chk_variables[clave_api] = var

        ctk.CTkFrame(scroll,height=1,fg_color="#1a3d61").pack(fill="x",pady=10)

        # --- Seccion: Indicadores derivados (calculados automaticamente) ---
        ctk.CTkLabel(scroll, text="🌡 Indicadores derivados (calculados al guardar)",
            font=("Arial",13,"bold"), text_color="#00cc88").pack(anchor="w", pady=(4,2))
        ctk.CTkLabel(scroll,
            text="Estos indicadores NO se descargan de la API — se calculan a partir\n"
                 "de temperatura y humedad usando la formula Stull (2011).\n"
                 "Se guardan como columnas adicionales en la tabla de Supabase.",
            font=("Consolas",9), text_color="#555", justify="left").pack(anchor="w", pady=(0,6))

        self._var_bulbo = ctk.BooleanVar(value=self.config.get("calcular_bulbo_humedo", True))
        ctk.CTkCheckBox(scroll,
            text="🌡 Temperatura de Bulbo Humedo (max, min, promedio)",
            variable=self._var_bulbo,
            font=("Consolas",10), fg_color="#00cc88", hover_color="#009966"
        ).pack(anchor="w", padx=(12,0), pady=2)
        ctk.CTkLabel(scroll,
            text="   Tw_max = f(temp_max, humedad%)   Tw_min = f(temp_min, humedad%)\n"
                 "   Tw_prom = f(temp_prom, humedad%)  — precision ±0.5°C en clima tropical",
            font=("Consolas",8), text_color="#444", justify="left").pack(anchor="w", padx=(12,0))

        ctk.CTkFrame(scroll,height=1,fg_color="#1a3d61").pack(fill="x",pady=10)

        # --- Seccion: Supabase (referencia) ---
        ctk.CTkLabel(scroll,text="Conexion Supabase (este proyecto)",
            font=("Arial",13,"bold"),text_color="#2b9eff").pack(anchor="w",pady=(4,6))
        cfg_items=[
            ("URL Supabase",  URL_SUPABASE),
            ("Publishable Key", KEY_SUPABASE[:26]+"..."),
            ("Secret Key (respaldo)", SECRET_KEY_SUPABASE[:16]+"..."),
        ]
        for lbl,val in cfg_items:
            ctk.CTkLabel(scroll,text=lbl,font=("Consolas",10),text_color="#888")\
                .pack(anchor="w",pady=(4,0))
            e=ctk.CTkEntry(scroll,width=500,height=30,font=("Consolas",10),
                fg_color="#0a1420",border_color="#1a3d61")
            e.insert(0,val); e.configure(state="readonly"); e.pack(anchor="w")
        ctk.CTkLabel(scroll,
            text="Estas credenciales estan fijas en el codigo del bot (no editables aqui).",
            font=("Consolas",9),text_color="#555",justify="left").pack(anchor="w",pady=(6,0))

        ctk.CTkFrame(scroll,height=1,fg_color="#1a3d61").pack(fill="x",pady=10)

        # --- Seccion: Accesos adicionales (otras paginas/credenciales) ---
        ctk.CTkLabel(scroll,text="Accesos adicionales (otras paginas necesarias)",
            font=("Arial",13,"bold"),text_color="#2b9eff").pack(anchor="w",pady=(4,6))

        self._frame_accesos = ctk.CTkFrame(scroll, fg_color="transparent")
        self._frame_accesos.pack(fill="x")
        self._filas_accesos = []
        accesos_guardados = self.config.get("otros_accesos", [])
        if accesos_guardados:
            for acc in accesos_guardados:
                self._agregar_fila_acceso(acc.get("sitio",""), acc.get("usuario",""), acc.get("clave",""))
        else:
            self._agregar_fila_acceso()

        ctk.CTkButton(scroll, text="+ Agregar acceso", width=160, height=30,
            fg_color="#1a3d61", hover_color="#2b78e4",
            command=lambda: self._agregar_fila_acceso()).pack(anchor="w", pady=(6,4))

        ctk.CTkButton(w,text="GUARDAR Y CERRAR",width=240,height=42,
            font=("Arial",12,"bold"),fg_color="#2b9eff",hover_color="#1a52a3",
            command=lambda: self._guardar_config_ventana(w)).pack(pady=(10,14))

    def _elegir_carpeta_drive(self):
        ruta = filedialog.askdirectory(title="Selecciona la carpeta local de Google Drive")
        if ruta:
            self._ent_carpeta.delete(0,"end")
            self._ent_carpeta.insert(0, ruta)

    def _agregar_fila_acceso(self, sitio="", usuario="", clave=""):
        fila = ctk.CTkFrame(self._frame_accesos, fg_color="transparent")
        fila.pack(fill="x", pady=3)
        e_sitio = ctk.CTkEntry(fila, width=150, height=30, placeholder_text="Sitio / Sistema",
            font=("Consolas",10), fg_color="#0a1420", border_color="#1a3d61")
        e_sitio.insert(0, sitio); e_sitio.pack(side="left", padx=(0,4))
        e_user = ctk.CTkEntry(fila, width=140, height=30, placeholder_text="Usuario",
            font=("Consolas",10), fg_color="#0a1420", border_color="#1a3d61")
        e_user.insert(0, usuario); e_user.pack(side="left", padx=4)
        e_pass = ctk.CTkEntry(fila, width=140, height=30, placeholder_text="Contrasena",
            show="*", font=("Consolas",10), fg_color="#0a1420", border_color="#1a3d61")
        e_pass.insert(0, clave); e_pass.pack(side="left", padx=4)
        btn_del = ctk.CTkButton(fila, text="X", width=28, height=30,
            fg_color="#5a1a1a", hover_color="#ff4444",
            command=lambda: self._quitar_fila_acceso(fila))
        btn_del.pack(side="left", padx=(4,0))
        self._filas_accesos.append((fila, e_sitio, e_user, e_pass))

    def _quitar_fila_acceso(self, fila):
        self._filas_accesos = [f for f in self._filas_accesos if f[0] is not fila]
        fila.destroy()

    def _guardar_config_ventana(self, ventana):
        self.config["carpeta_drive"] = self._ent_carpeta.get().strip()
        self.config["exportar_excel"] = (self._var_formato.get() == "excel")
        self.config["pais"] = self._cmb_pais.get()
        self.config["variables_activas"] = [
            clave for clave, var in self._chk_variables.items() if var.get()
        ]
        self.config["calcular_bulbo_humedo"] = self._var_bulbo.get()
        accesos = []
        for _, e_sitio, e_user, e_pass in self._filas_accesos:
            sitio = e_sitio.get().strip()
            if sitio:
                accesos.append({
                    "sitio": sitio,
                    "usuario": e_user.get().strip(),
                    "clave": e_pass.get().strip(),
                })
        self.config["otros_accesos"] = accesos
        cfg_guardar(self.config)
        derivados = "Bulbo Humedo (max/min/prom)" if self.config["calcular_bulbo_humedo"] else "ninguno"
        self.escribir_log(
            f"Configuracion guardada. Pais: {self.config['pais']} | Backup: "
            f"{'Excel' if self.config['exportar_excel'] else 'CSV'} -> "
            f"{self.config['carpeta_drive'] or '(carpeta del bot)'} | "
            f"Indicadores derivados: {derivados} | "
            f"Accesos guardados: {len(accesos)}")
        ventana.destroy()

# ══════════════════════════════════════════════════════════════════════════════
#  VERSION LIBRE — sin pantalla de login, arranca directo en la consola
# ══════════════════════════════════════════════════════════════════════════════
if __name__=="__main__":
    ConsolaClima().mainloop()
