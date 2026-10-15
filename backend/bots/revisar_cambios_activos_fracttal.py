# -*- coding: utf-8 -*-
"""
Revisión LIVIANA (solo cuenta, no descarga equipos) de cambios en la base
de Activos Maestros Fracttal — detecta sedes nuevas y sedes con conteo de
equipos distinto al guardado. Larga (~515 chequeos livianos, unos
minutos), por eso se invoca con spawn (no execFile) para reportar avance
línea por línea, igual que actualizar_base_activos_fracttal.py.

Uso:
  python revisar_cambios_activos_fracttal.py
"""
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

sys.path.append(os.path.dirname(__file__))
import pme_common as pme


def main():
    resultado = pme.revisar_cambios_activos_fracttal()
    sys.exit(0 if resultado is not None else 1)


if __name__ == '__main__':
    main()
