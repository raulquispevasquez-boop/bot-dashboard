# -*- coding: utf-8 -*-
"""
Búsqueda libre de activos en Fracttal para Itlus Fractal (creación manual o
masiva de solicitudes) — el usuario escribe un texto y elige de la lista de
resultados reales, nunca se adivina.

Uso:
  python buscar_activo_fracttal.py "<texto>"
"""
import sys
import os
import json

# En Windows, cuando stdout se redirige a una tuberia (como hace execFile
# de Node, a diferencia de una consola real), Python cae por defecto a la
# codificacion ANSI del sistema (cp1252) en vez de UTF-8 - corrompe
# cualquier tilde/enie del JSON (visto en produccion: "encontr�" en
# vez de "encontró"). Forzar UTF-8 explicito antes de imprimir nada.
sys.stdout.reconfigure(encoding='utf-8')

sys.path.append(os.path.dirname(__file__))
import pme_common as pme


def main():
    texto = sys.argv[1] if len(sys.argv) > 1 else ''
    with pme.salida_silenciada():
        candidatos, error = pme.buscar_activos_fracttal(texto)
    if error and not candidatos:
        print(json.dumps({'success': False, 'error': error}, ensure_ascii=False))
        return
    print(json.dumps({'success': True, 'data': candidatos}, ensure_ascii=False))


if __name__ == '__main__':
    main()
