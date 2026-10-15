# -*- coding: utf-8 -*-
"""
Constantes del plan de acción de auditoría energética.

Estas NO van en la base de datos: no cambian entre auditorías y son reglas,
no datos. La única tabla que se crea es `plan_accion` (193 filas).
"""

# ---------------------------------------------------------------- SLA
# Plazo de cierre en días, según el impacto de la no conformidad.
SLA = {
    "Muy Alto": ("P1", 7),
    "Alto":     ("P2", 15),
    "Medio":    ("P3", 30),
    "Bajo":     ("P4", 60),
}


def prioridad_y_vencimiento(impacto, fecha_auditoria):
    from datetime import timedelta
    pri, dias = SLA.get(impacto, ("P4", 60))
    return pri, fecha_auditoria + timedelta(days=dias)


# ---------------------------------------------------------------- Tipo de ticket
# Se deriva; no hace falta guardarlo.
def tipo_ticket(naturaleza, opex_capex, cod_tema_capacitacion):
    if cod_tema_capacitacion:
        return "Capacitación" if naturaleza == "Comportamiento" else "Señalización"
    if naturaleza == "Configuración":
        return "Configuración"
    if naturaleza == "Medición / Gestión":
        return "Medición / Gestión"
    return "Instalación" if opex_capex == "CAPEX" else "Correctivo"


# ---------------------------------------------------------------- Clave de agrupación
def clave_ticket(fila, hallazgo):
    """`fila` viene de plan_accion, `hallazgo` del check list."""
    base = f"{hallazgo['tienda']}|{hallazgo['id_auditoria']}"
    grp = fila["agrupacion_ticket"]
    if grp == "Por equipo":
        return f"{base}|{fila['codigo_item']}|{hallazgo['equipo']}"
    if grp == "Por sistema":
        return f"{base}|{fila['id_nc']}|{hallazgo['sistema']}"
    tema = TEMAS[fila["cod_tema_capacitacion"]]
    return f"{base}|{fila['cod_tema_capacitacion']}|{tema['area_responsable']}"


# ---------------------------------------------------------------- Plantillas
TITULO = "{{ACCION_ESTANDAR}} — {{EQUIPO}} — {{TIENDA}}"

DESCRIPCION = """Código: {{CODIGO}} ({{HOJA_CHECKLIST}})
Ítem evaluado: {{DESCRIPCION_ITEM}}
Hallazgo del auditor: {{OBSERVACION}}
No conformidad: {{NO_CONFORMIDAD}}
Acción a ejecutar: {{ACCION_ESTANDAR}}
Equipo: {{EQUIPO}} | Ubicación: {{UBICACION}}
Tipo de proyecto: {{TIPO_PROYECTO}} | Impacto: {{IMPACTO}} | {{OPEX_CAPEX}}
Responsable: {{RESPONSABLE}} | Vence: {{FECHA_VENCIMIENTO}}
Tienda: {{TIENDA}} | Auditor: {{AUDITOR}} | Fecha auditoría: {{FECHA_AUDITORIA}}"""

TITULO_CAPACITACION = "Capacitación: {{TEMA_CAPACITACION}} — {{AREA_RESPONSABLE}} — {{TIENDA}}"

DESCRIPCION_CAPACITACION = """Tema: {{TEMA_CAPACITACION}}
Área responsable: {{AREA_RESPONSABLE}} | Audiencia: {{AUDIENCIA}}
Alcance: {{ALCANCE_EQUIPO}}
Origen: {{N_HALLAZGOS}} hallazgo(s) en {{LISTA_EQUIPOS}}
Códigos: {{LISTA_CODIGOS}}
Tienda: {{TIENDA}} | Auditor: {{AUDITOR}} | Fecha auditoría: {{FECHA_AUDITORIA}}"""


def render(plantilla, valores):
    """Reemplaza {{TOKEN}} por su valor. Los faltantes quedan vacíos."""
    import re
    return re.sub(r"\{\{(\w+)\}\}", lambda m: str(valores.get(m.group(1), "")), plantilla)


# ---------------------------------------------------------------- Temas de capacitación
TEMAS = {
    "CAP-01": {"tema": "Cierre correcto de puertas de equipos de frío",
               "area_responsable": "Frescos",
               "audiencia": "Carnes, Lácteos, Fiambres, Frutas y Verduras, Reposición",
               "alcance_equipo": "Cámaras y muebles de frío"},
    "CAP-02": {"tema": "Orden y distribución de mercadería en equipos de frío",
               "area_responsable": "Frescos",
               "audiencia": "Reposición, Frescos",
               "alcance_equipo": "Cámaras y muebles de frío"},
    "CAP-03": {"tema": "Ejecución de inventarios con puertas cerradas",
               "area_responsable": "Control de inventarios",
               "audiencia": "Control de inventarios, Frescos",
               "alcance_equipo": "Cámaras de frío"},
    "CAP-04": {"tema": "Reposición de productos por la puerta adecuada",
               "area_responsable": "Reposición",
               "audiencia": "Reposición, Almacén",
               "alcance_equipo": "Walk-in cooler y walk-in freezer"},
    "CAP-05": {"tema": "Libre circulación de aire en equipos y condensadores",
               "area_responsable": "Frescos",
               "audiencia": "Reposición, Frescos, Mantenimiento",
               "alcance_equipo": "Muebles de frío, condensadores y equipos HVAC"},
    "CAP-06": {"tema": "Retiro de objetos ajenos al equipamiento",
               "area_responsable": "Frescos",
               "audiencia": "Reposición, Frescos, Visual Merchandising",
               "alcance_equipo": "Muebles de frío"},
    "CAP-07": {"tema": "Apagado de iluminación en áreas sin uso",
               "area_responsable": "Gerencia de tienda",
               "audiencia": "Todo el personal, Almacén, Seguridad",
               "alcance_equipo": "Iluminación interior"},
    "CAP-08": {"tema": "Apagado de aire acondicionado al término de labores",
               "area_responsable": "Administración",
               "audiencia": "Trastienda, Oficinas, Seguridad",
               "alcance_equipo": "HVAC trastienda y oficinas"},
    "CAP-09": {"tema": "Consumo fantasma y desconexión de equipos sin uso",
               "area_responsable": "Gerencia de tienda",
               "audiencia": "Todo el personal",
               "alcance_equipo": "Equipos de cómputo y eléctricos"},
    "CAP-10": {"tema": "Uso de señalización, avisos y fichas informativas",
               "area_responsable": "Frescos",
               "audiencia": "Frescos, Jefatura de sección",
               "alcance_equipo": "Cámaras y muebles de frío"},
    "CAP-11": {"tema": "Buenas prácticas de uso eficiente de la energía",
               "area_responsable": "Gerencia de tienda",
               "audiencia": "Todo el personal",
               "alcance_equipo": "Transversal a toda la tienda"},
}


# ---------------------------------------------------------------- Resolución del hallazgo
CRITERIO_COMPORTAMIENTO = "Comportamiento"
CRITERIO_ESTADO = "Estado"


def clave_lookup(codigo_item, criterio=None, codigos_duales=frozenset()):
    """
    Los 8 códigos de puertas necesitan criterio. `codigos_duales` se carga una vez
    al arrancar:  SELECT DISTINCT codigo_item FROM plan_accion
                   WHERE criterio_eleccion IS NOT NULL
    """
    if codigo_item in codigos_duales:
        return f"{codigo_item}|{criterio or CRITERIO_COMPORTAMIENTO}"
    return codigo_item
