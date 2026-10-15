# -*- coding: utf-8 -*-
"""
El usuario eligió a mano, entre los candidatos ambiguos que mostró el
modal "Solicitudes Fracttal", cuál ubicación de Fracttal es la correcta
para una sede. Termina la resolución (busca el "Tablero" bajo esa
ubicación), la guarda como override permanente, y dispara el reintento
de creación de inmediato.

Uso:
  python fijar_ubicacion_fracttal.py "<Sede>" "<id_location>"
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
    id_location = sys.argv[2] if len(sys.argv) > 2 else ''
    if not sede or not id_location:
        print(json.dumps({'success': False, 'error': 'Faltan parámetros sede/id_location.'}, ensure_ascii=False))
        return
    with pme.salida_silenciada():
        resultado = pme.fijar_ubicacion_fracttal_y_reintentar(sede, int(id_location))
    print(json.dumps({'success': True, 'data': resultado}, ensure_ascii=False))


if __name__ == '__main__':
    main()
