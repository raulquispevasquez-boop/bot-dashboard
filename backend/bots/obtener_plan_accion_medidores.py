# -*- coding: utf-8 -*-
"""
Genera BAJO DEMANDA el detalle (Sede | Medidor | Última fecha | Plan de
Acción) de los medidores en mal estado, para la tabla de detalle del modal
"Medidores en Mal Estado" del dashboard -reutiliza exactamente la misma
plantilla/logica que ya arma el Excel, para que el texto del plan de accion
nunca diverja entre lo que se ve en pantalla y lo que se descarga.

Uso:
  python obtener_plan_accion_medidores.py "<Servicio>"   -> detalle de 1 especialidad
  python obtener_plan_accion_medidores.py consolidado    -> agrupado por sede, todas las especialidades
"""
import sys
import os
import json

sys.path.append(os.path.dirname(__file__))
import pme_common as pme

SERVICIOS = ["HVAC", "Iluminación", "Frío Alimentario", "General"]


def _solicitudes_de(historial_por_sede, sede):
    """Historial de intentos de Solicitud Fracttal para una sede (mas
    reciente primero), cruzado por normalizar_sede - mismo cruce que ya
    usa agrupar_medidores_por_sede, para que no diverja aunque 2
    especialidades escriban el nombre de la sede distinto."""
    return historial_por_sede.get(pme.normalizar_sede(sede), [])


def plan_individual(servicio):
    medidores = pme.obtener_medidores_desconectados(servicio)
    plan = pme.generar_plan_accion_medidores(medidores, pme.DESCRIPCION_MEDIDOR_DESCONECTADO_DEFAULT)
    descripcion_por_sede = {p['sede']: p['descripcion'] for p in plan}
    historial_por_sede = pme.agrupar_historial_fracttal_por_sede()
    filas = []
    for m in sorted(medidores, key=lambda x: x['sede']):
        filas.append({
            'sede': m['sede'],
            'medidor_nombre': m.get('medidor_nombre', ''),
            'ultima_fecha_con_datos': m.get('ultima_fecha_con_datos'),
            'plan_accion': descripcion_por_sede.get(m['sede'], ''),
            'solicitudes_fracttal': _solicitudes_de(historial_por_sede, m['sede']),
        })
    return filas


def plan_consolidado():
    medidores_todos = pme.obtener_medidores_desconectados_todos(SERVICIOS)
    agrupado = pme.agrupar_medidores_por_sede(medidores_todos)
    historial_por_sede = pme.agrupar_historial_fracttal_por_sede()
    return [{
        'sede': f['sede'],
        'medidor_nombre': f['servicios_txt'],  # aca "medidor" son los servicios afectados
        'ultima_fecha_con_datos': f['ultima_fecha_con_datos'],
        'plan_accion': f['plan_accion'],
        'solicitudes_fracttal': _solicitudes_de(historial_por_sede, f['sede']),
    } for f in agrupado]


def main():
    servicio = sys.argv[1] if len(sys.argv) > 1 else ''
    if not servicio or servicio.lower() == 'consolidado':
        filas = plan_consolidado()
    else:
        filas = plan_individual(servicio)
    print(json.dumps({'success': True, 'data': filas}, ensure_ascii=False))


if __name__ == '__main__':
    main()
