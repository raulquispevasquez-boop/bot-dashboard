-- ============================================================================
-- AUTOMATIZACIÓN INTELIGENTE DE CÁLCULO DE BULBO HÚMEDO EN SUPABASE (HÍBRIDO)
-- Proyecto: BOT MANAGER
-- Schema: energia
-- Tablas: energia."DATA SENAMHI PERU" y energia."DATA METEO CLIMA"
-- ============================================================================

-- 1) Función psicrométrica de Stull (2011) para Temperatura de Bulbo Húmedo (°C)
CREATE OR REPLACE FUNCTION energia.fn_stull_wet_bulb(t double precision, rh double precision)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE 
        WHEN t IS NULL OR rh IS NULL THEN NULL
        ELSE ROUND(
            (
                (t * atan(0.151977 * sqrt(rh + 8.313659)))
                + atan(t + rh)
                - atan(rh - 1.676331)
                + (0.00391838 * power(rh, 1.5) * atan(0.023101 * rh))
                - 4.686035
            )::numeric, 2
        )::double precision
    END;
$$;

-- 2) Función Trigger Inteligente: realiza cruce de datos y sincronización bidireccional
CREATE OR REPLACE FUNCTION energia.fn_calc_clima_derivados()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_humedad double precision;
    v_temp_max double precision;
    v_temp_min double precision;
    v_temp_prom double precision;
BEGIN
    -- Cargar valores base del registro actual
    v_humedad := NEW.humedad_pct;
    v_temp_max := NEW.temp_max;
    v_temp_min := NEW.temp_min;
    v_temp_prom := NEW.temp_promedio;

    -- A) Caso: DATA SENAMHI PERU
    IF TG_TABLE_NAME = 'DATA SENAMHI PERU' THEN
        -- Calcular temp_promedio si no viene informado
        IF v_temp_prom IS NULL AND v_temp_max IS NOT NULL AND v_temp_min IS NOT NULL THEN
            v_temp_prom := ROUND(((v_temp_max + v_temp_min) / 2.0)::numeric, 2);
            NEW.temp_promedio := v_temp_prom;
        END IF;

        -- Cruce Híbrido: Si la estación física no reporta humedad, la buscamos de METEO CLIMA
        IF v_humedad IS NULL THEN
            SELECT humedad_pct INTO v_humedad
            FROM energia."DATA METEO CLIMA"
            WHERE ceco = NEW.ceco AND fecha = NEW.fecha
            LIMIT 1;
            
            -- Guardamos la humedad cruzada en la fila para consistencia
            IF v_humedad IS NOT NULL THEN
                NEW.humedad_pct := v_humedad;
            END IF;
        END IF;

        -- Sincronización posterior: Si acabamos de recibir temperaturas y existe un registro satelital
        -- sin temperaturas para el mismo día, se las inyectamos para que complete su cálculo.
        IF v_temp_max IS NOT NULL OR v_temp_min IS NOT NULL THEN
            UPDATE energia."DATA METEO CLIMA"
            SET temp_max = COALESCE(temp_max, v_temp_max),
                temp_min = COALESCE(temp_min, v_temp_min),
                temp_promedio = COALESCE(temp_promedio, v_temp_prom)
            WHERE ceco = NEW.ceco AND fecha = NEW.fecha AND (temp_max IS NULL OR temp_min IS NULL);
        END IF;
    END IF;

    -- B) Caso: DATA METEO CLIMA
    IF TG_TABLE_NAME = 'DATA METEO CLIMA' THEN
        -- Calcular temp_promedio si no viene informado
        IF v_temp_prom IS NULL AND v_temp_max IS NOT NULL AND v_temp_min IS NOT NULL THEN
            v_temp_prom := ROUND(((v_temp_max + v_temp_min) / 2.0)::numeric, 2);
            NEW.temp_promedio := v_temp_prom;
        END IF;

        -- Cruce Híbrido: Si el satélite no tiene temperaturas, intentamos rescatarlas de la estación física SENAMHI
        IF v_temp_max IS NULL OR v_temp_min IS NULL OR v_temp_prom IS NULL THEN
            SELECT temp_max, temp_min, temp_promedio 
            INTO v_temp_max, v_temp_min, v_temp_prom
            FROM energia."DATA SENAMHI PERU"
            WHERE ceco = NEW.ceco AND fecha = NEW.fecha
            LIMIT 1;
            
            -- Guardamos las temperaturas rescatadas
            IF NEW.temp_max IS NULL THEN NEW.temp_max := v_temp_max; END IF;
            IF NEW.temp_min IS NULL THEN NEW.temp_min := v_temp_min; END IF;
            IF NEW.temp_promedio IS NULL THEN NEW.temp_promedio := v_temp_prom; END IF;
        END IF;

        -- Sincronización posterior: Si este registro satelital trae humedad y la estación física
        -- para el mismo día no tenía humedad ni bulbo calculado, le inyectamos la humedad.
        IF v_humedad IS NOT NULL THEN
            UPDATE energia."DATA SENAMHI PERU"
            SET humedad_pct = NEW.humedad_pct
            WHERE ceco = NEW.ceco AND fecha = NEW.fecha AND bulbo_humedo_max IS NULL;
        END IF;
    END IF;

    -- C) Calcular bulbo húmedo usando la humedad y temperaturas consolidadas
    IF v_humedad IS NOT NULL THEN
        IF v_temp_max IS NOT NULL THEN
            NEW.bulbo_humedo_max := energia.fn_stull_wet_bulb(v_temp_max, v_humedad);
        END IF;
        IF v_temp_min IS NOT NULL THEN
            NEW.bulbo_humedo_min := energia.fn_stull_wet_bulb(v_temp_min, v_humedad);
        END IF;
        IF v_temp_prom IS NOT NULL THEN
            NEW.bulbo_humedo_promedio := energia.fn_stull_wet_bulb(v_temp_prom, v_humedad);
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- 3) Vincular Triggers
DROP TRIGGER IF EXISTS trg_calc_derivados ON energia."DATA SENAMHI PERU";
CREATE TRIGGER trg_calc_derivados
BEFORE INSERT OR UPDATE ON energia."DATA SENAMHI PERU"
FOR EACH ROW EXECUTE FUNCTION energia.fn_calc_clima_derivados();

DROP TRIGGER IF EXISTS trg_calc_derivados ON energia."DATA METEO CLIMA";
CREATE TRIGGER trg_calc_derivados
BEFORE INSERT OR UPDATE ON energia."DATA METEO CLIMA"
FOR EACH ROW EXECUTE FUNCTION energia.fn_calc_clima_derivados();
