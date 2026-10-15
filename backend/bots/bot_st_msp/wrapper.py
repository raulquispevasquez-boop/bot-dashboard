import sys
import json
import time
from datetime import datetime

# Fake UI base classes to preserve method inheritance
class FakeCTk:
    def __init__(self, *args, **kwargs): pass
    def title(self, *args): pass
    def geometry(self, *args): pass
    def protocol(self, *args): pass
    def after(self, *args): pass
    def quit(self): pass
    def update(self): pass

class MockModule:
    CTk = FakeCTk
    def __getattr__(self, name):
        return FakeCTk

sys.modules['customtkinter'] = MockModule()
sys.modules['tkinter'] = MockModule()
sys.modules['tkinter.filedialog'] = MockModule()

sys.path.append(r"E:\bot-dashboard\bots fracttal-msp")
import bot_st_msp_v6_LIBRE as bot

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
    def get(self): return ""
    def pack(self, **kwargs): pass
    def grid(self, **kwargs): pass
    def delete(self, *args): pass
    def insert(self, *args): pass

class HeadlessApp(bot.ConsolaSTMSP):
    def __init__(self):
        # Initialize configuration variables
        self.config = bot.CONFIG_DEFAULTS.copy()
        self.autopiloto_activo = False
        self.ejecutando = False
        self._bot_corriendo = False
        self._ultimo_error = ""
        self._fase_estado = {}
        self._alertas_activas = set()
        self._alertas_widgets = {}

        # Mocks of UI elements that the script interacts with
        self.lbl_tele = FakeWidget("telemetry")
        self.pbar = FakeWidget("progress")
        self.btn_run = FakeWidget("btn_run")
        self.btn_analizar = FakeWidget("btn_analizar")
        self.lbl_estado_txt = FakeWidget("status_txt")
        self.lbl_proxima = FakeWidget("proxima")
        self.modo_auto_var = FakeWidget("modo_auto")
        self.combo_intervalo = FakeWidget("combo_intervalo")
        
        # Load configs
        self._cargar_config_json()
        
        self.ent_i = FakeWidget("ent_i")
        self.ent_i.get = lambda: self.config.get("fec_ini", "2024-01-01")
        
        self.ent_f = FakeWidget("ent_f")
        self.ent_f.get = lambda: datetime.now().strftime('%Y-%m-%d')
        
        # For autopilot hours
        self.ent_h1 = FakeWidget("ent_h1")
        self.ent_h1.get = lambda: self.config.get("hora1", "08:00")
        self.ent_h2 = FakeWidget("ent_h2")
        self.ent_h2.get = lambda: self.config.get("hora2", "13:00")
        self.ent_h3 = FakeWidget("ent_h3")
        self.ent_h3.get = lambda: self.config.get("hora3", "18:00")
        
        self.ent_intervalo = FakeWidget("ent_intervalo")
        self.ent_intervalo.get = lambda: self.config.get("intervalo_val", "30")
        
        self.combo_intervalo.get = lambda: self.config.get("intervalo_uni", "minutos")
        self.modo_auto_var.get = lambda: self.config.get("modo_auto", "HORAS")

    def _cargar_config_json(self):
        bot.ConsolaSTMSP._cargar_config_json(self)

    def _sep(self):
        print(json.dumps({"type": "log", "message": "━" * 62}), flush=True)

    def escribir_log(self, texto):
        ts = datetime.now().strftime('%H:%M:%S')
        print(json.dumps({"type": "log", "message": f"[{ts}] {texto}"}), flush=True)
        
    def _set_fase(self, key, estado):
        print(json.dumps({"type": "fase", "fase": key, "estado": estado}), flush=True)

    def _reset_timeline(self):
        for key in ["login", "descarga", "proceso", "drive", "truncate", "insertar", "fin"]:
            self._set_fase(key, "idle")

    def update(self):
        pass
        
    def _activar_alerta(self, *args):
        pass
        
    def _desactivar_todas_alertas(self):
        pass
        
    def _bloquear_campos_auto(self, b):
        pass

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
        print(json.dumps({"type": "log", "message": "Iniciando AUTOPILOTO en modo headless..."}), flush=True)
        # Activar autopilot (original code logic)
        app.autopiloto_activo = True
        import threading
        t = threading.Thread(target=app._loop_reloj, daemon=True)
        t.start()
        
        # Keep process alive
        try:
            while app.autopiloto_activo:
                time.sleep(1)
        except KeyboardInterrupt:
            app.autopiloto_activo = False
            print(json.dumps({"type": "log", "message": "Autopiloto detenido."}), flush=True)
    else:
        print(json.dumps({"type": "log", "message": "Iniciando EJECUCION MANUAL en modo headless..."}), flush=True)
        app._ejecutar()
        # Wait for extraction thread to finish
        while app._bot_corriendo:
            time.sleep(0.5)
        print(json.dumps({"type": "log", "message": "Proceso manual finalizado."}), flush=True)
        if getattr(app, "_ultimo_error", ""):
            print(json.dumps({"type": "log", "message": f"❌ Finalizado con error: {app._ultimo_error}"}), flush=True)
            sys.exit(1)
