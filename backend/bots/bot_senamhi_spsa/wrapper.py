"""
Wrapper headless para Bot SENAMHI SPSA.
Lanza el bot sin interfaz gráfica (headless), emitiendo JSON por stdout
para que el servidor Node.js lo capture via socket.io.
"""

import sys
import os
import json
import time
import threading

sys.path.append(os.path.abspath(os.path.dirname(__file__)))

# ─────────────────────────────────────────────
# IMPORT BOT
# ─────────────────────────────────────────────
import bot_senamhi_v1 as bot

if __name__ == '__main__':
    mode = 'manual'
    origen = 'individual'
    master_run_id = None
    for arg in sys.argv[1:]:
        if arg == '--autopilot':
            mode = 'autopilot'
        elif arg.startswith('--origen='):
            origen = arg.split('=', 1)[1]
        elif arg.startswith('--master-run-id='):
            master_run_id = arg.split('=', 1)[1]

    if mode == 'autopilot':
        print(json.dumps({'type': 'log', 'message': '🔄 Bot SENAMHI iniciando en modo AUTOPILOTO...'}), flush=True)
        t = threading.Thread(target=bot.loop_autopilot, daemon=True)
        t.start()
        try:
            while not bot._stop_event.is_set():
                time.sleep(1)
        except KeyboardInterrupt:
            bot._stop_event.set()
            print(json.dumps({'type': 'log', 'message': '🛑 Autopiloto detenido.'}), flush=True)
    else:
        print(json.dumps({'type': 'log', 'message': '▶️ Bot SENAMHI iniciando en modo MANUAL...'}), flush=True)
        error_fatal = None
        try:
            bot.ejecutar('manual', origen=origen, master_run_id=master_run_id)
        except KeyboardInterrupt:
            bot._stop_event.set()
            print(json.dumps({'type': 'log', 'message': '🛑 Bot detenido.'}), flush=True)
        except Exception as e:
            error_fatal = str(e)
            print(json.dumps({'type': 'log', 'message': f'❌ Error fatal: {error_fatal}'}), flush=True)
            if getattr(bot, 'pme_common', None):
                try:
                    bot.pme_common.enviar_alerta_fallo_bot('Bot SENAMHI', e)
                except Exception:
                    pass
                try:
                    bot.pme_common.registrar_fin_activacion(
                        bot._activacion_id_actual, estado='fallo', exc=e,
                        ram_mb_pico=bot.pme_common.medir_ram_actual_mb(),
                    )
                except Exception:
                    pass
        print(json.dumps({'type': 'log', 'message': 'Proceso manual finalizado.'}), flush=True)
        if error_fatal or getattr(bot, '_ultimo_error_actual', ''):
            msg = error_fatal or bot._ultimo_error_actual
            print(json.dumps({'type': 'log', 'message': f'❌ Finalizado con error: {msg}'}), flush=True)
            sys.exit(1)
