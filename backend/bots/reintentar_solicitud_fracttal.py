# -*- coding: utf-8 -*-
"""
Reintento MANUAL de creación de Solicitud de Servicio en Fracttal para una
sede puntual, disparado por el botón "Reintentar" del modal de medidores en
mal estado (a diferencia de sincronizar_solicitudes_fracttal, que corre sola
por cambios de estado). No inventa nada nuevo: reutiliza la misma lógica de
pme_common (resolución de activo, creación, registro en el historial), solo
que fuerza el intento ya mismo para una sede en vez de esperar.

Uso:
  python reintentar_solicitud_fracttal.py "<Sede>"
"""
import sys
import os
import json

# Ver comentario equivalente en buscar_activo_fracttal.py: sin esto, stdout
# cae a cp1252 al correr via execFile en Windows y corrompe tildes/eñes.
sys.stdout.reconfigure(encoding='utf-8')

sys.path.append(os.path.dirname(__file__))
import pme_common as pme


def main():
    sede = sys.argv[1] if len(sys.argv) > 1 else ''
    if not sede:
        print(json.dumps({'success': False, 'error': 'Falta el parámetro sede.'}, ensure_ascii=False))
        return
    with pme.salida_silenciada():
        resultado = pme.reintentar_solicitud_fracttal(sede)
    print(json.dumps({'success': True, 'data': resultado}, ensure_ascii=False))


if __name__ == '__main__':
    main()
