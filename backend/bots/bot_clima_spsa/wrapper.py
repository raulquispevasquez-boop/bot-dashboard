import sys
import json
import time
import os
from datetime import datetime

# Fake UI base classes to bypass customtkinter/tkinter graphical elements
class FakeCTk:
    def __init__(self, *args, **kwargs): pass
    def title(self, *args): pass
    def geometry(self, *args): pass
    def minsize(self, *args): pass
    def protocol(self, *args): pass
    def after(self, *args): pass
    def quit(self): pass
    def update(self): pass
    def mainloop(self): pass

class MockModule:
    CTk = FakeCTk
    set_appearance_mode = lambda *args: None
    set_default_color_theme = lambda *args: None
    def __getattr__(self, name):
        return FakeCTk

sys.modules['customtkinter'] = MockModule()
sys.modules['tkinter'] = MockModule()
sys.modules['tkinter.filedialog'] = MockModule()

# Inject the bots folder path so Python can find the imported script
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

def save_local_history(records):
    history_file = os.path.join(os.path.dirname(__file__), "..", "..", "clima_history.json")
    history_file = os.path.abspath(history_file)
    
    # Read existing
    history = {}
    if os.path.exists(history_file):
        try:
            with open(history_file, 'r', encoding='utf-8') as f:
                existing = json.load(f)
                for r in existing:
                    key = f"{r.get('ceco')}_{r.get('fecha')}"
                    history[key] = r
        except Exception:
            pass
            
    # Merge new
    for r in records:
        key = f"{r.get('ceco')}_{r.get('fecha')}"
        history[key] = r
        
    # Save back
    try:
        with open(history_file, 'w', encoding='utf-8') as f:
            json.dump(list(history.values()), f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving local history: {e}")

import bot_clima_spsa_v1_LIBRE as bot

# Store original create_client to avoid infinite recursion
original_create_client = bot.create_client

# Intercept and mock supabase client to save a local backup JSON
def mock_create_client(url, key):
    real_client = original_create_client(url, key)
    
    class InterceptTable:
        def __init__(self, table_obj):
            self.table_obj = table_obj
        def upsert(self, records, on_conflict=None):
            # Save local history copy
            save_local_history(records)
            return self.table_obj.upsert(records, on_conflict=on_conflict)
        def __getattr__(self, name):
            return getattr(self.table_obj, name)
            
    class InterceptSchema:
        def __init__(self, schema_obj):
            self.schema_obj = schema_obj
        def table(self, name):
            return InterceptTable(self.schema_obj.table(name))
        def __getattr__(self, name):
            return getattr(self.schema_obj, name)

    class InterceptClient:
        def __init__(self, client_obj):
            self.client_obj = client_obj
        def schema(self, name):
            return InterceptSchema(self.client_obj.schema(name))
        def table(self, name):
            return InterceptTable(self.client_obj.table(name))
        def __getattr__(self, name):
            return getattr(self.client_obj, name)
            
    return InterceptClient(real_client)

bot.create_client = mock_create_client

class FakeWidget:
    def __init__(self, name):
        self.name = name
    def configure(self, **kwargs):
        if "text" in kwargs:
            print(json.dumps({"type": "status_val", "key": self.name, "value": kwargs["text"]}), flush=True)
    def set(self, val):
        if self.name == "progress":
            try:
                pct = int(float(val) * 100)
                pct = max(0, min(100, pct))
                print(json.dumps({"type": "status_val", "key": "progress", "value": pct}), flush=True)
            except Exception:
                pass
    def get(self, *args): return ""
    def pack(self, **kwargs): pass
    def grid(self, **kwargs): pass
    def delete(self, *args): pass
    def insert(self, *args): pass

class HeadlessApp(bot.ConsolaClima):
    def __init__(self):
        # Config defaults copy
        self.config = bot.cfg_cargar()
        self.cfg = self.config
        self.ejecutando = False
        self.autopiloto = False
        self._stop = bot.threading.Event()
        self._gear_activo = False
        self._auto_activo = False
        self._angulo_gear = 0
        self._angulo_auto = 0
        self._fase_estado = {k: "idle" for k, _, _ in bot.ConsolaClima.FASES}
        self._fase_tick = {k: 0 for k, _, _ in bot.ConsolaClima.FASES}
        self._cvs_fases = {k: FakeWidget(k) for k, _, _ in bot.ConsolaClima.FASES}

        # Mock widgets that Consolidated Bot accesses
        self.lbl_reloj = FakeWidget("reloj")
        self.lbl_tele = FakeWidget("telemetry")
        self.lbl_estado = FakeWidget("status_txt")
        self.pbar = FakeWidget("progress")
        self.btn_run = FakeWidget("btn_run")
        self.btn_auto = FakeWidget("btn_auto")
        self.log_box = FakeWidget("log_box")

        # Fake inputs
        self.ent_i = FakeWidget("ent_i")
        self.ent_i.get = lambda: self.config.get("f_ini", (datetime.now() - bot.timedelta(days=7)).strftime("%Y-%m-%d"))
        
        self.ent_f = FakeWidget("ent_f")
        self.ent_f.get = lambda: self.config.get("f_fin", datetime.now().strftime("%Y-%m-%d"))

        self._ent_h = [FakeWidget(f"hora{i}") for i in [1, 2, 3]]
        for i, e in enumerate(self._ent_h):
            e.get = lambda idx=i: self.config.get(f"hora{idx+1}", ["06:00", "12:00", "18:00"][idx])

        self._ent_inter = FakeWidget("ent_inter")
        self._ent_inter.get = lambda: self.config.get("intervalo_val", "24")

        self._cmb_uni = FakeWidget("cmb_uni")
        self._cmb_uni.get = lambda: self.config.get("intervalo_uni", "horas")

        self._modo_var = FakeWidget("modo_var")
        self._modo_var.get = lambda: self.config.get("modo_auto", "INTERVALO")

    def _dibujar_robot(self, *args, **kwargs): pass
    def _dibujar_auto(self, *args, **kwargs): pass
    def _timeline_loop(self): pass
    def _robot_loop(self): pass
    def _loop_reloj(self): pass

    def after(self, ms, func):
        # headlessly run Tkinter's "after" callbacks instantly
        try:
            func()
        except:
            pass

    def escribir_log(self, texto):
        ts = datetime.now().strftime('%H:%M:%S')
        print(json.dumps({"type": "log", "message": f"[{ts}] {texto}"}), flush=True)

    def _set_fase(self, key, estado):
        print(json.dumps({"type": "fase", "fase": key, "estado": estado}), flush=True)

    def _sep(self):
        print(json.dumps({"type": "log", "message": "━" * 62}), flush=True)

if __name__ == "__main__":
    app = HeadlessApp()

    # Parse running mode + origen (para la tabla de seguimiento bot_activaciones)
    mode = "manual"
    origen = "individual"
    master_run_id = None
    for arg in sys.argv[1:]:
        if arg == "--autopilot":
            mode = "autopilot"
        elif arg.startswith("--origen="):
            origen = arg.split("=", 1)[1]
        elif arg.startswith("--master-run-id="):
            master_run_id = arg.split("=", 1)[1]
    app._origen_activacion = origen
    app._master_run_id_activacion = master_run_id

    if mode == "autopilot":
        print(json.dumps({"type": "log", "message": "Iniciando AUTOPILOTO en modo headless para Bot Clima SPSA..."}), flush=True)
        app.autopiloto = True
        import threading
        t = threading.Thread(target=app._loop_auto, daemon=True)
        t.start()
        
        try:
            while app.autopiloto:
                time.sleep(1)
        except KeyboardInterrupt:
            app.autopiloto = False
            print(json.dumps({"type": "log", "message": "Autopiloto detenido."}), flush=True)
    else:
        print(json.dumps({"type": "log", "message": "Iniciando EJECUCION MANUAL en modo headless para Bot Clima SPSA..."}), flush=True)
        app._ejecutar()
        # Wait for the bot execution thread to finish
        while app.ejecutando:
            time.sleep(0.5)
        print(json.dumps({"type": "log", "message": "Proceso manual finalizado."}), flush=True)
        if getattr(app, "_ultimo_error", ""):
            print(json.dumps({"type": "log", "message": f"❌ Finalizado con error: {app._ultimo_error}"}), flush=True)
            sys.exit(1)
