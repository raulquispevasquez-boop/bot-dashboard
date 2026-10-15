# -*- coding: utf-8 -*-
"""
Refresco completo de la base local de Activos Maestros de Fracttal (todas
las sedes + todos sus equipos) para Itlus Fractal — a diferencia del resto
de scripts CLI de esta carpeta, este es de LARGA duración (~15-25 min,
546 sedes al momento de escribir esto) y se invoca con spawn (no execFile)
para que server.js pueda leer su avance línea por línea mientras corre,
igual que el resto de bots del dashboard. Por eso NO usa salida_silenciada:
acá sí queremos que log()/progreso() lleguen a stdout.

Uso:
  python actualizar_base_activos_fracttal.py
"""
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

sys.path.append(os.path.dirname(__file__))
import pme_common as pme


def main():
    ok = pme.construir_base_activos_fracttal()
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
