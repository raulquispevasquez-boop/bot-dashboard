# -*- coding: utf-8 -*-
"""
Paso 2 del selector de activo en 2 pasos de Itlus Fractal: lista todos los
Equipos bajo una Ubicación ya elegida en el paso 1 (buscar_activo_fracttal.py).

Uso:
  python listar_equipos_fracttal.py "<id_location>"
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
    id_location = sys.argv[1] if len(sys.argv) > 1 else ''
    if not id_location:
        print(json.dumps({'success': False, 'error': 'Falta el parámetro id_location.'}, ensure_ascii=False))
        return
    with pme.salida_silenciada():
        equipos, error = pme.listar_equipos_ubicacion_fracttal(int(id_location))
    if error and not equipos:
        print(json.dumps({'success': False, 'error': error}, ensure_ascii=False))
        return
    print(json.dumps({'success': True, 'data': equipos}, ensure_ascii=False))


if __name__ == '__main__':
    main()
