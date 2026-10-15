# -*- coding: utf-8 -*-
"""
Genera BAJO DEMANDA (fuera de una corrida del bot) el Excel consolidado de
medidores desconectados/sin datos de TODAS las especialidades PME juntas
(HVAC, Iluminacion, Frio Alimentario, General), agrupado por sede -para no
tener que revisar 4 excels sueltos uno por servicio. Lo imprime en stdout
como JSON con el archivo en base64, para que server.js lo pueda devolver
como descarga.

Uso: python generar_excel_medidores_consolidado.py
"""
import sys
import os
import json
import base64

sys.path.append(os.path.dirname(__file__))
import pme_common as pme

SERVICIOS = ["HVAC", "Iluminación", "Frío Alimentario", "General"]


def main():
    medidores = pme.obtener_medidores_desconectados_todos(SERVICIOS)
    datos = pme.generar_excel_medidores_consolidado(medidores)
    print(json.dumps({
        'excel_base64': base64.b64encode(datos).decode('ascii'),
        'total': len(medidores)
    }))


if __name__ == '__main__':
    main()
