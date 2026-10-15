# -*- coding: utf-8 -*-
"""
Creación MASIVA de Solicitudes de Servicio en Fracttal desde un Excel,
subido en Itlus Fractal.

Uso:
  python crear_solicitudes_fracttal_masivo.py "<ruta_excel_temporal>" ["<nombre_original>"]
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
    ruta_excel = sys.argv[1] if len(sys.argv) > 1 else ''
    archivo_origen = sys.argv[2] if len(sys.argv) > 2 else os.path.basename(ruta_excel)
    if not ruta_excel or not os.path.isfile(ruta_excel):
        print(json.dumps({'success': False, 'error': 'No se encontró el archivo Excel subido.'}, ensure_ascii=False))
        return

    with pme.salida_silenciada():
        resultados = pme.crear_solicitudes_fracttal_masivo(ruta_excel, archivo_origen=archivo_origen)
    print(json.dumps({'success': True, 'data': resultados}, ensure_ascii=False))


if __name__ == '__main__':
    main()
