-- Tabla maestra de estandarización de planes de acción
-- Basada en las 193 filas de 'tabla_plan_accion.xlsx'

CREATE TABLE energia.auditoria_plan_accion_maestro (
    clave_unica VARCHAR PRIMARY KEY,
    codigo_item VARCHAR NOT NULL,
    criterio_eleccion VARCHAR,
    naturaleza VARCHAR,
    id_nc VARCHAR,
    descripcion_no_conformidad TEXT,
    accion_estandar TEXT,
    tipo_proyecto VARCHAR,
    impacto VARCHAR,
    opex_capex VARCHAR,
    responsable VARCHAR,
    agrupacion_ticket VARCHAR,
    cod_tema_capacitacion VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Políticas de RLS (Opcional si usas anon/energia)
ALTER TABLE energia.auditoria_plan_accion_maestro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acceso total energia.auditoria_plan_accion_maestro" 
ON energia.auditoria_plan_accion_maestro 
FOR ALL 
TO anon
USING (true)
WITH CHECK (true);
