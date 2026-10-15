# -*- coding: utf-8 -*-
"""
Prevalidación instantánea (0ms) de sedes en un archivo Excel para Itlus Fractal.
Analiza cada fila contra la base local de 515 sedes usando las reglas:
- CECO 24 / MK / Makro -> Makro
- CECO 25 / PVH / PVS / Plaza Vea -> Plaza Vea
- Ambigüedad (ej: 'CALLAO') -> Muestra candidatos Makro y Plaza Vea para resolución previa.

Uso:
  python prevalidar_excel_sedes.py "<ruta_excel>"
"""
import sys
import os
import json
import re
import pandas as pd

sys.stdout.reconfigure(encoding='utf-8')
sys.path.append(os.path.dirname(__file__))
import pme_common as pme


def prevalidar_excel(ruta_excel):
    if not os.path.isfile(ruta_excel):
        return {'success': False, 'error': 'No se encontró el archivo Excel.'}

    try:
        df = pd.read_excel(ruta_excel, dtype=str)
    except Exception as e:
        return {'success': False, 'error': f'No se pudo leer el archivo Excel: {e}'}

    df.columns = [str(c).strip().lower() for c in df.columns]
    df = df.rename(columns={k: v for k, v in pme._COLUMNAS_EXCEL_ITLUS_FRACTAL.items() if k in df.columns})

    filas = []
    total_resueltas = 0
    total_ambiguas = 0
    total_no_encontradas = 0

    for i, r in df.iterrows():
        num_fila = i + 2
        desc = str(r.get('descripcion') or '').strip()
        activo = str(r.get('activo') or '').strip()
        sede = str(r.get('sede_ceco') or '').strip()

        # Omitir filas vacías
        if (not desc or desc.lower() == 'nan') and (not activo or activo.lower() == 'nan') and (not sede or sede.lower() == 'nan'):
            continue

        item_res = {
            'fila': num_fila,
            'descripcion': desc if desc.lower() != 'nan' else '—',
            'activo': activo if activo.lower() != 'nan' else '—',
            'sede_ceco_original': sede if sede.lower() != 'nan' else '',
            'estado': 'vacia',
            'sede_resuelta': None,
            'candidatos': [],
        }

        if not item_res['sede_ceco_original']:
            item_res['estado'] = 'sin_sede'
            filas.append(item_res)
            continue

        coincidencias = pme.resolver_sede_ceco_local(item_res['sede_ceco_original'], texto_activo=activo)
        # Priorizar tiendas físicas
        tiendas_fisicas = [s for s in coincidencias if not re.match(r'^(e-tienda|tienda virtual|ddc|cdc)\b', s.get('description', '').lower())]
        evaluar = tiendas_fisicas if tiendas_fisicas else coincidencias

        if len(evaluar) == 1:
            s = evaluar[0]
            marca = 'Makro (CECO 24)' if '-24' in s.get('code', '') or 'mk' in s.get('description', '').lower() else ('Plaza Vea (CECO 25)' if '-25' in s.get('code', '') or any(k in s.get('description', '').lower() for k in ('pvh', 'pvs', 'vea')) else 'Sede identificada')
            item_res['estado'] = 'resuelta'
            item_res['sede_resuelta'] = {
                'id_location': s['id_location'],
                'code': s['code'],
                'description': s['description'],
                'marca': marca,
            }
            total_resueltas += 1
        elif len(evaluar) > 1:
            item_res['estado'] = 'ambigua'
            item_res['candidatos'] = [
                {
                    'id_location': s['id_location'],
                    'code': s['code'],
                    'description': s['description'],
                    'marca': 'Makro (CECO 24)' if '-24' in s.get('code', '') or 'mk' in s.get('description', '').lower() else ('Plaza Vea (CECO 25)' if '-25' in s.get('code', '') or any(k in s.get('description', '').lower() for k in ('pvh', 'pvs', 'vea')) else 'Otra tienda'),
                }
                for s in evaluar[:4]
            ]
            total_ambiguas += 1
        else:
            item_res['estado'] = 'no_encontrada'
            total_no_encontradas += 1

        filas.append(item_res)

    return {
        'success': True,
        'total_filas': len(filas),
        'resueltas': total_resueltas,
        'ambiguas': total_ambiguas,
        'no_encontradas': total_no_encontradas,
        'filas': filas,
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'Falta la ruta del archivo Excel.'}, ensure_ascii=False))
        return

    ruta_excel = sys.argv[1]
    resultado = prevalidar_excel(ruta_excel)
    print(json.dumps(resultado, ensure_ascii=False))


if __name__ == '__main__':
    main()
