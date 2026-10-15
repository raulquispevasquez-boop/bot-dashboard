# -*- coding: utf-8 -*-
"""
Actualiza (o agrega, si es nueva) UNA sola sede de la base de Activos
Maestros Fracttal — para cuando el usuario hace clic en una alerta
puntual, sin reconstruir las 515 sedes por un cambio en una sola. Rápido
(una sede), por eso es un script de un solo disparo (execFile), no spawn.

Uso:
  python actualizar_una_sede_fracttal.py <id_location>
"""
import sys
import os
import json

sys.stdout.reconfigure(encoding='utf-8')

sys.path.append(os.path.dirname(__file__))
import pme_common as pme


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'Falta id_location.'}, ensure_ascii=False))
        return
    try:
        id_location = int(sys.argv[1])
    except ValueError:
        print(json.dumps({'success': False, 'error': 'id_location inválido.'}, ensure_ascii=False))
        return

    with pme.salida_silenciada():
        sede, error = pme.actualizar_una_sede_fracttal(id_location)
    if error:
        print(json.dumps({'success': False, 'error': error}, ensure_ascii=False))
        return
    print(json.dumps({'success': True, 'data': sede}, ensure_ascii=False))


if __name__ == '__main__':
    main()
