# -*- coding: utf-8 -*-
"""
Genera BAJO DEMANDA (fuera de una corrida del bot) el Excel de medidores
desconectados/sin datos recientes para un servicio, y lo imprime en stdout
como JSON con el archivo en base64, para que server.js lo pueda devolver
como descarga sin tener que esperar a la proxima corrida del bot.

Uso: python generar_excel_medidores.py "<Servicio>"
"""
import sys
import os
import json
import base64

sys.path.append(os.path.dirname(__file__))
import pme_common as pme


def main():
    servicio = sys.argv[1] if len(sys.argv) > 1 else ''
    if not servicio:
        print(json.dumps({'error': 'Falta indicar el servicio'}))
        return

    medidores = pme.obtener_medidores_desconectados(servicio)
    plan = []
    if medidores:
        descripcion = pme.DESCRIPCION_MEDIDOR_DESCONECTADO_DEFAULT
        plan = pme.generar_plan_accion_medidores(medidores, descripcion)

    datos = pme.generar_excel_medidores_desconectados(servicio, medidores, plan)
    print(json.dumps({
        'excel_base64': base64.b64encode(datos).decode('ascii'),
        'total': len(medidores)
    }))


if __name__ == '__main__':
    main()
