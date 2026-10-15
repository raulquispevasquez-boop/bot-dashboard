-- SQL Script para crear la estructura de tablas de Power Monitoring Expert (PME) en Supabase (Esquema: energia)

-- Asegurar existencia del esquema energia
CREATE SCHEMA IF NOT EXISTS energia;

-- 1. Tabla de Catálogo y Mapeo de Dispositivos/Medidores PME
CREATE TABLE IF NOT EXISTS energia.pme_dispositivos_mapeo (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    sede TEXT NOT NULL,
    medidor_nombre TEXT NOT NULL,
    servicio TEXT NOT NULL, -- HVAC, Alumbrado, Frio, Total
    parametro TEXT NOT NULL, -- Potencia activa, Energía activa
    unidad TEXT DEFAULT 'kW',
    activo BOOLEAN DEFAULT TRUE,
    creado_el TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabla de Mediciones e Histórico de Telemetría PME
CREATE TABLE IF NOT EXISTS energia.pme_mediciones_spsa (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    timestamp_local TIMESTAMP WITH TIME ZONE NOT NULL,
    anio INT NOT NULL,                -- Ejemplo: 2026
    mes INT NOT NULL,                 -- Ejemplo: 7 (Julio)
    fecha DATE NOT NULL,              -- Ejemplo: 2026-07-31
    hora TIME NOT NULL,               -- Ejemplo: 12:15:00
    sede TEXT NOT NULL,
    ceco TEXT DEFAULT NULL,           -- Centro de Costos (se poblará desde catálogo)
    medidor_nombre TEXT NOT NULL,
    servicio TEXT NOT NULL,
    parametro TEXT NOT NULL,
    valor NUMERIC(12, 4) NOT NULL,
    unidad TEXT DEFAULT 'kW',
    creado_el TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT pme_mediciones_unq UNIQUE (timestamp_local, sede, medidor_nombre, servicio, parametro)
);

-- Indices para acelerar consultas por Fecha y-- Índices en esquema energia
CREATE INDEX IF NOT EXISTS idx_pme_mediciones_fecha ON energia.pme_mediciones_spsa (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_pme_mediciones_anio_mes ON energia.pme_mediciones_spsa (anio, mes);
CREATE INDEX IF NOT EXISTS idx_pme_mediciones_sede ON energia.pme_mediciones_spsa (sede, servicio);

-- Deshabilitar RLS para permitir inserciones y lecturas sin restricciones de política de filas
ALTER TABLE IF EXISTS energia.pme_dispositivos_mapeo DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS energia.pme_mediciones_spsa DISABLE ROW LEVEL SECURITY;

-- ==========================================
-- FASE 2: ARQUITECTURA DE AUTO-MAPEO (CECO)
-- ==========================================

-- 1. Agregamos la columna CECO a nuestro Diccionario Maestro
ALTER TABLE energia.pme_dispositivos_mapeo 
ADD COLUMN IF NOT EXISTS ceco TEXT;

-- 2. Creamos la Función del Trigger (El "Motor" que busca el CECO)
CREATE OR REPLACE FUNCTION energia.auto_asignar_ceco_pme()
RETURNS TRIGGER AS $$
DECLARE
    v_ceco TEXT;
BEGIN
    -- Buscamos el CECO en el Diccionario Maestro usando el nombre de la Sede y el Servicio
    SELECT ceco INTO v_ceco 
    FROM energia.pme_dispositivos_mapeo 
    WHERE sede = NEW.sede AND ceco IS NOT NULL
    LIMIT 1;
    
    -- Si encontramos un CECO, se lo asignamos a la fila antes de que se guarde
    IF v_ceco IS NOT NULL THEN
        NEW.ceco = v_ceco;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Adjuntamos el Trigger a tus tablas de telemetría PME
-- Para la tabla PME HVAC
DROP TRIGGER IF EXISTS trigger_auto_ceco_hvac ON energia.pme_hvac;
CREATE TRIGGER trigger_auto_ceco_hvac
BEFORE INSERT ON energia.pme_hvac
FOR EACH ROW
EXECUTE FUNCTION energia.auto_asignar_ceco_pme();

-- Para la tabla PME General
DROP TRIGGER IF EXISTS trigger_auto_ceco_general ON energia.pme_general;
CREATE TRIGGER trigger_auto_ceco_general
BEFORE INSERT ON energia.pme_general
FOR EACH ROW
EXECUTE FUNCTION energia.auto_asignar_ceco_pme();

-- Para la tabla PME Iluminacion
DROP TRIGGER IF EXISTS trigger_auto_ceco_iluminacion ON energia.pme_iluminacion;
CREATE TRIGGER trigger_auto_ceco_iluminacion
BEFORE INSERT ON energia.pme_iluminacion
FOR EACH ROW
EXECUTE FUNCTION energia.auto_asignar_ceco_pme();

-- Para la tabla PME Frio
DROP TRIGGER IF EXISTS trigger_auto_ceco_frio ON energia.pme_frio_alimentario;
CREATE TRIGGER trigger_auto_ceco_frio
BEFORE INSERT ON energia.pme_frio_alimentario
FOR EACH ROW
EXECUTE FUNCTION energia.auto_asignar_ceco_pme();

-- ==========================================
-- FASE 3: ACTUALIZACIÓN EN CASCADA (HISTÓRICO)
-- ==========================================

-- 1. Creamos la Función que propaga los cambios de CECO hacia el pasado
CREATE OR REPLACE FUNCTION energia.cascada_actualizar_ceco_pme()
RETURNS TRIGGER AS $$
BEGIN
    -- Si el CECO cambió (o se asignó por primera vez desde el Modal)
    IF NEW.ceco IS DISTINCT FROM OLD.ceco THEN
        -- Actualizar el histórico en todas las tablas de telemetría PME
        UPDATE energia.pme_hvac
        SET ceco = NEW.ceco
        WHERE sede = NEW.sede AND medidor_nombre = NEW.medidor_nombre;

        UPDATE energia.pme_general
        SET ceco = NEW.ceco
        WHERE sede = NEW.sede AND medidor_nombre = NEW.medidor_nombre;

        UPDATE energia.pme_iluminacion
        SET ceco = NEW.ceco
        WHERE sede = NEW.sede AND medidor_nombre = NEW.medidor_nombre;

        UPDATE energia.pme_frio_alimentario
        SET ceco = NEW.ceco
        WHERE sede = NEW.sede AND medidor_nombre = NEW.medidor_nombre;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Adjuntamos el Trigger al Diccionario Maestro (pme_dispositivos_mapeo)
DROP TRIGGER IF EXISTS trigger_cascada_ceco ON energia.pme_dispositivos_mapeo;
CREATE TRIGGER trigger_cascada_ceco
AFTER INSERT OR UPDATE ON energia.pme_dispositivos_mapeo
FOR EACH ROW
EXECUTE FUNCTION energia.cascada_actualizar_ceco_pme();
