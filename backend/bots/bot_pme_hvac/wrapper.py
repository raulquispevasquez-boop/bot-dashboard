# -*- coding: utf-8 -*-
"""
Bot Consolidado HVAC - punto de entrada estandar (usado por bots.json).
Primer bot de la familia "PME" orquestada por el Bot Master PME.
"""

import sys
import os
import json
import time
import threading

sys.path.append(os.path.abspath(os.path.dirname(__file__)))

import extraccion

_stop_event = threading.Event()

INTERVALO_SEG = 3600  # frecuencia del autopiloto: cada 1 hora


def _leer_arg(nombre):
    """Lee --nombre=valor de sys.argv, o None si no vino."""
    prefijo = f'--{nombre}='
    for a in sys.argv[1:]:
        if a.startswith(prefijo):
            return a[len(prefijo):]
    return None


def main():
    mode = 'manual'
    if len(sys.argv) > 1 and sys.argv[1] == '--autopilot':
        mode = 'autopilot'

    # Descarga puntual de un rango FIJO (backfill) - solo tiene sentido en
    # modo manual, nunca en autopiloto (que siempre usa la ventana movil).
    fecha_inicio = _leer_arg('fecha-inicio')
    fecha_fin = _leer_arg('fecha-fin')

    if mode == 'autopilot':
        print(json.dumps({'type': 'log', 'message': '🔄 Bot Consolidado HVAC iniciando en modo AUTOPILOTO...'}), flush=True)
        try:
            while not _stop_event.is_set():
                extraccion.ejecutar()
                for _ in range(INTERVALO_SEG):
                    if _stop_event.is_set():
                        break
                    time.sleep(1)
        except KeyboardInterrupt:
            _stop_event.set()
            print(json.dumps({'type': 'log', 'message': '🛑 Autopiloto detenido.'}), flush=True)
    else:
        print(json.dumps({'type': 'log', 'message': '▶️ Bot Consolidado HVAC iniciando en modo MANUAL...'}), flush=True)
        try:
            extraccion.ejecutar(fecha_inicio=fecha_inicio, fecha_fin=fecha_fin)
        except KeyboardInterrupt:
            print(json.dumps({'type': 'log', 'message': '🛑 Bot detenido.'}), flush=True)


if __name__ == '__main__':
    main()
