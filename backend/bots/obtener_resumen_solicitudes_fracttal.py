# -*- coding: utf-8 -*-
"""
Vista resumen (una fila por sede) de las Solicitudes de Servicio creadas
en Fracttal y las que fallaron al crearse, para el botón/modal dedicado
"Solicitudes Fracttal" del Bot Master PME. Reutiliza
pme_common.resumen_solicitudes_fracttal() - misma fuente de datos que el
historial embebido en el modal de medidores, para que nunca diverjan.

Uso:
  python obtener_resumen_solicitudes_fracttal.py
"""
import sys
import os
import json

sys.path.append(os.path.dirname(__file__))
import pme_common as pme


def main():
    resumen = pme.resumen_solicitudes_fracttal()
    print(json.dumps({'success': True, 'data': resumen}, ensure_ascii=False))


if __name__ == '__main__':
    main()
