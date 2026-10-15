# -*- coding: utf-8 -*-
"""
Creación MANUAL de una Solicitud de Servicio en Fracttal desde la tabla de
Itlus Fractal — recibe todos los campos como un único JSON (para no depender
del orden/escapado de varios argumentos posicionales).

Uso:
  python crear_solicitud_fracttal_manual.py '{"descripcion": "...", "id_item": 123, ...}'

Campos esperados en el JSON:
  descripcion (obligatorio), id_item (obligatorio), activo_descripcion,
  fecha_incidente (ISO 8601, opcional), solicitado_por, email, referencia,
  activo_maestro.
"""
import sys
import os
import json
from datetime import datetime, timezone

# Ver comentario equivalente en buscar_activo_fracttal.py: sin esto, stdout
# cae a cp1252 al correr via execFile en Windows y corrompe tildes/eñes.
sys.stdout.reconfigure(encoding='utf-8')

sys.path.append(os.path.dirname(__file__))
import pme_common as pme


def main():
    crudo = sys.argv[1] if len(sys.argv) > 1 else '{}'
    try:
        datos = json.loads(crudo)
    except Exception as e:
        print(json.dumps({'success': False, 'error': f'JSON inválido: {e}'}, ensure_ascii=False))
        return

    descripcion = (datos.get('descripcion') or '').strip()
    id_item = datos.get('id_item')
    if not descripcion or not id_item:
        print(json.dumps({'success': False, 'error': 'Faltan descripcion y/o id_item.'}, ensure_ascii=False))
        return

    fecha_incidente = None
    if datos.get('fecha_incidente'):
        try:
            fecha_incidente = datetime.fromisoformat(datos['fecha_incidente'].replace('Z', '+00:00'))
            if fecha_incidente.tzinfo is None:
                fecha_incidente = fecha_incidente.replace(tzinfo=timezone.utc)
        except Exception:
            fecha_incidente = None

    with pme.salida_silenciada():
        resultado = pme.crear_solicitud_fracttal_manual(
            descripcion, id_item,
            activo_descripcion=datos.get('activo_descripcion'),
            fecha_incidente=fecha_incidente,
            solicitado_por=(datos.get('solicitado_por') or '').strip(),
            email_solicitado_por=(datos.get('email') or '').strip(),
            referencia=(datos.get('referencia') or '').strip(),
            activo_maestro=(datos.get('activo_maestro') or '').strip(),
        )
    print(json.dumps({'success': True, 'data': resultado}, ensure_ascii=False))


if __name__ == '__main__':
    main()
