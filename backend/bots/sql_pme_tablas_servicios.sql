-- =====================================================================
-- Tablas dedicadas por servicio para la familia de bots PME (Schneider
-- EcoStruxure Power Monitoring Expert), esquema "energia".
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS energia;

-- 1. HVAC (Climatización)
CREATE TABLE IF NOT EXISTS energia.pme_hvac (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    timestamp_local TIMESTAMP WITH TIME ZONE NOT NULL,
    anio INT NOT NULL,
    mes INT NOT NULL,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    sede TEXT NOT NULL,
    ceco TEXT DEFAULT NULL,
    medidor_nombre TEXT NOT NULL,
    parametro TEXT NOT NULL,
    valor NUMERIC(12, 4) NOT NULL,
    unidad TEXT DEFAULT 'kWh',
    creado_el TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT pme_hvac_unq UNIQUE (timestamp_local, sede, medidor_nombre, parametro)
);
CREATE INDEX IF NOT EXISTS idx_pme_hvac_fecha ON energia.pme_hvac (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_pme_hvac_anio_mes ON energia.pme_hvac (anio, mes);
CREATE INDEX IF NOT EXISTS idx_pme_hvac_sede ON energia.pme_hvac (sede);
ALTER TABLE energia.pme_hvac DISABLE ROW LEVEL SECURITY;

-- 2. Iluminación (Alumbrado)
CREATE TABLE IF NOT EXISTS energia.pme_iluminacion (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    timestamp_local TIMESTAMP WITH TIME ZONE NOT NULL,
    anio INT NOT NULL,
    mes INT NOT NULL,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    sede TEXT NOT NULL,
    ceco TEXT DEFAULT NULL,
    medidor_nombre TEXT NOT NULL,
    parametro TEXT NOT NULL,
    valor NUMERIC(12, 4) NOT NULL,
    unidad TEXT DEFAULT 'kWh',
    creado_el TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT pme_iluminacion_unq UNIQUE (timestamp_local, sede, medidor_nombre, parametro)
);
CREATE INDEX IF NOT EXISTS idx_pme_iluminacion_fecha ON energia.pme_iluminacion (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_pme_iluminacion_anio_mes ON energia.pme_iluminacion (anio, mes);
CREATE INDEX IF NOT EXISTS idx_pme_iluminacion_sede ON energia.pme_iluminacion (sede);
ALTER TABLE energia.pme_iluminacion DISABLE ROW LEVEL SECURITY;

-- 3. Frío Alimentario (Refrigeración)
CREATE TABLE IF NOT EXISTS energia.pme_frio_alimentario (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    timestamp_local TIMESTAMP WITH TIME ZONE NOT NULL,
    anio INT NOT NULL,
    mes INT NOT NULL,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    sede TEXT NOT NULL,
    ceco TEXT DEFAULT NULL,
    medidor_nombre TEXT NOT NULL,
    parametro TEXT NOT NULL,
    valor NUMERIC(12, 4) NOT NULL,
    unidad TEXT DEFAULT 'kWh',
    creado_el TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT pme_frio_alimentario_unq UNIQUE (timestamp_local, sede, medidor_nombre, parametro)
);
CREATE INDEX IF NOT EXISTS idx_pme_frio_alimentario_fecha ON energia.pme_frio_alimentario (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_pme_frio_alimentario_anio_mes ON energia.pme_frio_alimentario (anio, mes);
CREATE INDEX IF NOT EXISTS idx_pme_frio_alimentario_sede ON energia.pme_frio_alimentario (sede);
ALTER TABLE energia.pme_frio_alimentario DISABLE ROW LEVEL SECURITY;

-- 4. General (Línea Base Total / Subestación)
CREATE TABLE IF NOT EXISTS energia.pme_general (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    timestamp_local TIMESTAMP WITH TIME ZONE NOT NULL,
    anio INT NOT NULL,
    mes INT NOT NULL,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    sede TEXT NOT NULL,
    ceco TEXT DEFAULT NULL,
    medidor_nombre TEXT NOT NULL,
    parametro TEXT NOT NULL,
    valor NUMERIC(12, 4) NOT NULL,
    unidad TEXT DEFAULT 'kWh',
    creado_el TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT pme_general_unq UNIQUE (timestamp_local, sede, medidor_nombre, parametro)
);
CREATE INDEX IF NOT EXISTS idx_pme_general_fecha ON energia.pme_general (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_pme_general_anio_mes ON energia.pme_general (anio, mes);
CREATE INDEX IF NOT EXISTS idx_pme_general_sede ON energia.pme_general (sede);
ALTER TABLE energia.pme_general DISABLE ROW LEVEL SECURITY;

-- 5. Estado de medidores (deteccion de sedes sin datos / posible falla)
CREATE TABLE IF NOT EXISTS energia.pme_estado_medidores (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    servicio TEXT NOT NULL,
    sede TEXT NOT NULL,
    medidor_nombre TEXT,
    ultima_revision TIMESTAMP WITH TIME ZONE NOT NULL,
    tiene_datos BOOLEAN NOT NULL,
    ultima_fecha_con_datos DATE,
    estado TEXT NOT NULL DEFAULT 'OK',  -- 'OK' | 'ALERTA'
    creado_el TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT pme_estado_medidores_unq UNIQUE (servicio, sede)
);
CREATE INDEX IF NOT EXISTS idx_pme_estado_medidores_estado ON energia.pme_estado_medidores (estado);
ALTER TABLE energia.pme_estado_medidores DISABLE ROW LEVEL SECURITY;

-- 6. Alertas de consumo (fuera de horario, y futuros tipos de alerta de consumo)
-- La columna "servicio" ya hace esta tabla generica para HVAC, Iluminacion,
-- Frio Alimentario, General, etc. "tipo_alerta" permite que en el futuro
-- convivan otros tipos de alerta de consumo (no solo "fuera_horario") sin
-- pisarse entre si el mismo dia.
CREATE TABLE IF NOT EXISTS energia.pme_alertas_consumo (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    servicio TEXT NOT NULL,
    tipo_alerta TEXT NOT NULL DEFAULT 'fuera_horario',
    sede TEXT NOT NULL,
    fecha DATE NOT NULL,
    hora_pico TIME NOT NULL,
    valor_pico NUMERIC(12, 4) NOT NULL,
    linea_base_kwh NUMERIC(12, 4) NOT NULL,
    mensaje TEXT,
    enviado_telegram BOOLEAN DEFAULT FALSE,
    enviado_email BOOLEAN DEFAULT FALSE,
    notificado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT pme_alertas_consumo_unq UNIQUE (servicio, sede, fecha, tipo_alerta)
);
ALTER TABLE energia.pme_alertas_consumo DISABLE ROW LEVEL SECURITY;

-- 7. Mapeo de medidores <-> CECO: se reutiliza la tabla ya existente
-- energia.pme_dispositivos_mapeo (sede, medidor_nombre, servicio, ...) en
-- vez de crear una tabla nueva. El usuario la llena manualmente; los bots
-- solo LEEN de aca (por medidor_nombre, sin distinguir mayus/minus) para
-- completar el CECO en las tablas de descarga y en el historial de
-- resultados. Este ALTER es idempotente: si la columna ya existe, no hace nada.
ALTER TABLE energia.pme_dispositivos_mapeo ADD COLUMN IF NOT EXISTS ceco TEXT;

-- 7.1 Incidentes Fracttal: registro de que servicios, por sede, ya estan
-- cubiertos por una Solicitud de Servicio ABIERTA en Fracttal. La llena y
-- lee sola sincronizar_solicitudes_fracttal() (energia.pme_common.py) -
-- el usuario no toca esta tabla a mano. Sirve para unificar por sede (si
-- HVAC e Iluminacion caen a la vez en la misma sede, se crea UNA sola
-- solicitud) y para detectar el "delta" cuando se agrega un medidor
-- nuevo en alerta mientras los anteriores siguen sin arreglarse (solo
-- ese delta genera una solicitud nueva). Se limpia sola cuando la sede
-- se recupera del todo, para que la proxima falla abra un incidente
-- nuevo desde cero. El activo (id_item de Fracttal) NO se guarda aca
-- a mano: se resuelve automaticamente por sede (buscando "tablero" en
-- la descripcion del activo, ver resolver_activo_tablero_sede()).
CREATE TABLE IF NOT EXISTS energia.pme_fracttal_incidentes (
    sede TEXT PRIMARY KEY,                        -- normalizar_sede(sede)
    servicios_cubiertos TEXT[] DEFAULT '{}',       -- servicios ya incluidos en la solicitud abierta
    id_solicitud_fracttal TEXT,                    -- ultimo folio creado (id_code de Fracttal), solo referencia
    actualizado_el TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE energia.pme_fracttal_incidentes DISABLE ROW LEVEL SECURITY;

-- 7.2 Historial de solicitudes Fracttal: log append-only (nunca se
-- actualiza ni se borra) de CADA intento de creacion de Solicitud de
-- Servicio en Fracttal, exitoso o fallido, con causa/solucion cuando
-- falla. A diferencia de pme_fracttal_incidentes (que solo guarda el
-- estado ACTUAL para calcular el delta), esta tabla es lo que alimenta
-- la columna "Solicitudes Fracttal" del modal de medidores en mal
-- estado -para que el usuario vea, por sede, que se creo, que folio
-- quedo, y si algo fallo, por que y que revisar.
CREATE TABLE IF NOT EXISTS energia.pme_fracttal_solicitudes (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    sede TEXT NOT NULL,
    servicios TEXT[] DEFAULT '{}',
    descripcion TEXT,
    exito BOOLEAN NOT NULL,
    folio TEXT,
    causa TEXT,
    solucion TEXT,
    candidatos_activo JSONB,
    creado_el TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE energia.pme_fracttal_solicitudes DISABLE ROW LEVEL SECURITY;

-- 7.2.1 candidatos_activo: cuando resolver_activo_tablero_sede() falla
-- por ubicacion AMBIGUA en Fracttal (2+ ubicaciones distintas matchean el
-- nombre de la sede), guarda aca la lista [{id_location, descripcion}]
-- para que el modal "Solicitudes Fracttal" pueda mostrar un boton "Usar
-- esta" por cada candidato en vez de tener que re-parsear el texto de la
-- causa. Este ALTER es idempotente (por si la tabla ya existia sin esta
-- columna de una corrida anterior de este script).
ALTER TABLE energia.pme_fracttal_solicitudes ADD COLUMN IF NOT EXISTS candidatos_activo JSONB;

-- 7.3 Override manual del activo Fracttal por sede: se llena SOLA (no a
-- mano) cuando el usuario hace clic en "Usar esta" sobre uno de los
-- candidatos ambiguos del modal - fijar_ubicacion_fracttal_y_reintentar()
-- (pme_common.py) la llena tras confirmar que esa ubicacion sí tiene un
-- equipo "tablero". Una vez guardada, resolver_activo_tablero_sede() la
-- usa SIEMPRE para esa sede, sin volver a buscar ni preguntar de nuevo.
CREATE TABLE IF NOT EXISTS energia.pme_fracttal_activo_override (
    sede TEXT PRIMARY KEY,           -- normalizar_sede(sede)
    id_item INTEGER NOT NULL,        -- activo "tablero" ya resuelto (no la ubicacion)
    descripcion TEXT,                -- descripcion del activo, solo referencia
    creado_el TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE energia.pme_fracttal_activo_override DISABLE ROW LEVEL SECURITY;

-- 7.4 Itlus Fractal: log append-only de cada intento de creacion MANUAL o
-- MASIVA (Excel) de Solicitud de Servicio en Fracttal, via crear_solicitud_
-- fracttal()/buscar_activos_fracttal() en pme_common.py. Separada de
-- pme_fracttal_solicitudes porque esa es especifica del flujo automatico
-- por sede+especialidad PME (fuerza columnas sede/servicios que no
-- aplican aca).
-- En "public" (no en "energia"): a diferencia del resto de tablas de este
-- archivo, esta no es una medicion/consolidado de sede - PostgREST expone
-- "public" sin necesitar el header Accept-Profile/Content-Profile, asi que
-- se deja ahi a proposito.
-- Si la tabla ya existia de antes en el esquema "energia" (folios de prueba
-- ya creados en esta sesion), esto la mueve a "public" conservando los
-- datos, en vez de crear una nueva vacia. Va PRIMERO: el CREATE TABLE IF
-- NOT EXISTS de abajo es un no-op si esto ya la trajo a public.
ALTER TABLE IF EXISTS energia.itlus_fractal_solicitudes SET SCHEMA public;
CREATE TABLE IF NOT EXISTS public.itlus_fractal_solicitudes (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    descripcion TEXT,
    exito BOOLEAN NOT NULL,
    id_item INTEGER,                 -- activo elegido en Fracttal, si se resolvio
    activo_descripcion TEXT,         -- descripcion del activo, solo referencia
    fecha_incidente TIMESTAMPTZ,
    solicitado_por TEXT,
    email_solicitado_por TEXT,
    referencia TEXT,
    activo_maestro TEXT,             -- nombre libre del Activo Maestro (Itlus 2), solo referencia
    folio TEXT,
    causa TEXT,
    solucion TEXT,
    candidatos JSONB,                -- [{id_item, code, description}] cuando la busqueda del activo fue ambigua
    origen TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'excel'
    archivo_origen TEXT,             -- nombre del Excel subido, solo si origen='excel'
    creado_el TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.itlus_fractal_solicitudes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.itlus_fractal_solicitudes ADD COLUMN IF NOT EXISTS activo_maestro TEXT;

-- 8. Historial de resultados por corrida (agregado por servicio/especialidad)
CREATE TABLE IF NOT EXISTS energia.pme_historial_resultados (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    servicio TEXT NOT NULL,
    fecha_ejecucion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    dias_historico INT NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    precio_kwh NUMERIC(10, 4),
    umbral_critico_soles_dia NUMERIC(10, 2),
    umbral_medio_soles_dia NUMERIC(10, 2),
    total_sedes INT NOT NULL DEFAULT 0,
    sedes_con_consumo INT NOT NULL DEFAULT 0,
    sedes_criticas INT NOT NULL DEFAULT 0,
    sedes_medias INT NOT NULL DEFAULT 0,
    sedes_bajas INT NOT NULL DEFAULT 0,
    sedes_buenas_practicas INT NOT NULL DEFAULT 0,
    medidores_desconectados INT NOT NULL DEFAULT 0,
    kwh_dia_fuga NUMERIC(12, 2),
    costo_dia_fuga NUMERIC(12, 2),
    total_kwh_periodo NUMERIC(14, 2),
    total_costo_periodo NUMERIC(14, 2),
    proyeccion_mensual NUMERIC(14, 2),
    proyeccion_anual NUMERIC(14, 2),
    creado_el TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pme_hist_resultados_servicio_fecha
    ON energia.pme_historial_resultados (servicio, fecha_ejecucion DESC);
ALTER TABLE energia.pme_historial_resultados DISABLE ROW LEVEL SECURITY;

-- 9. Historial por sede (detalle, con CECO para enlazar a futuro)
CREATE TABLE IF NOT EXISTS energia.pme_historial_sedes (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    historial_id BIGINT REFERENCES energia.pme_historial_resultados(id) ON DELETE CASCADE,
    servicio TEXT NOT NULL,
    fecha_ejecucion TIMESTAMP WITH TIME ZONE NOT NULL,
    sede TEXT NOT NULL,
    ceco TEXT DEFAULT NULL,
    kwh_dia NUMERIC(12, 2) NOT NULL DEFAULT 0,
    costo_dia NUMERIC(12, 2) NOT NULL DEFAULT 0,
    categoria TEXT NOT NULL DEFAULT 'BUENA_PRACTICA'  -- CRITICA | MEDIA | BAJA | BUENA_PRACTICA | DESCONECTADA
);
CREATE INDEX IF NOT EXISTS idx_pme_hist_sedes_servicio_sede
    ON energia.pme_historial_sedes (servicio, sede, fecha_ejecucion DESC);
CREATE INDEX IF NOT EXISTS idx_pme_hist_sedes_ceco ON energia.pme_historial_sedes (ceco);
ALTER TABLE energia.pme_historial_sedes DISABLE ROW LEVEL SECURITY;

-- 10. Configuracion/afinamiento por sede (override de los umbrales globales).
-- Generica por "servicio" para poder reutilizarla si mas adelante otras
-- especialidades tambien necesitan afinar por sede, no solo Frio Alimentario.
-- Si una sede no tiene fila aca (o un campo especifico esta vacio), el bot
-- usa el valor global configurado en el panel de esa especialidad.
-- area_sala_ventas_m2 / carga_termica_diseno: datos de infraestructura que
-- se llenan progresivamente, pensados para habilitar comparaciones entre
-- sedes de tamano distinto (ej. kWh/m2) mas adelante.
CREATE TABLE IF NOT EXISTS energia.pme_config_sedes (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    servicio TEXT NOT NULL,
    sede TEXT NOT NULL,
    -- Infraestructura (se llena manualmente, para comparaciones futuras)
    area_sala_ventas_m2 NUMERIC(10, 2),
    carga_termica_diseno NUMERIC(12, 2),
    carga_termica_diseno_unidad TEXT,  -- ej. 'kW', 'TR', 'kcal/h' (lo que uses tu)
    -- Señal 1: techo del consumo total del dia
    maximo_kwh_dia NUMERIC(10, 2),
    -- Señal 2: techo por cada hora individual, las 24 horas del dia
    maximo_kwh_hora NUMERIC(10, 2),
    -- Señal 3 (opcional): ventana horaria de bajo consumo esperado
    ventana_baja_activo BOOLEAN NOT NULL DEFAULT FALSE,
    ventana_baja_hora_inicio TIME,
    ventana_baja_hora_fin TIME,
    ventana_baja_linea_base_kwh NUMERIC(10, 2),
    -- Señal 4: linea base dinamica (semana actual vs. semana anterior)
    linea_base_dinamica_activo BOOLEAN NOT NULL DEFAULT TRUE,
    linea_base_dinamica_umbral_pct NUMERIC(5, 2) DEFAULT 20,
    actualizado_el TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT pme_config_sedes_unq UNIQUE (servicio, sede)
);
CREATE INDEX IF NOT EXISTS idx_pme_config_sedes_servicio ON energia.pme_config_sedes (servicio);
ALTER TABLE energia.pme_config_sedes DISABLE ROW LEVEL SECURITY;

-- Por si alguien ya habia corrido una version anterior de esta tabla sin
-- las columnas de infraestructura: agregarlas ahora es idempotente.
ALTER TABLE energia.pme_config_sedes ADD COLUMN IF NOT EXISTS area_sala_ventas_m2 NUMERIC(10, 2);
ALTER TABLE energia.pme_config_sedes ADD COLUMN IF NOT EXISTS carga_termica_diseno NUMERIC(12, 2);
ALTER TABLE energia.pme_config_sedes ADD COLUMN IF NOT EXISTS carga_termica_diseno_unidad TEXT;
-- volumen_refrigerado_m3: mismo patron que area_sala_ventas_m2, pero para el
-- indicador de Frio Alimentario (kWh/dia por m3 refrigerado en vez de por m2
-- de sala de ventas). Misma tabla generica por servicio+sede, no una tabla aparte.
ALTER TABLE energia.pme_config_sedes ADD COLUMN IF NOT EXISTS volumen_refrigerado_m3 NUMERIC(10, 2);

-- =====================================================================
-- Catalogo crudo de dispositivos de PME (ION_Network.dbo.Device), copiado
-- manualmente via SSMS por el usuario (no hay conexion directa del bot a
-- ese SQL Server - el puerto 1433 no es alcanzable desde donde corre el
-- bot). pme_device_id es el identificador INMUTABLE de PME: no cambia
-- aunque alguien renombre el titulo del grafico en el dashboard web.
--
-- Es un catalogo APARTE de energia.pme_dispositivos_mapeo (que es nuestro
-- mapeo de negocio medidor_nombre -> CECO). Este es solo el inventario
-- crudo de PME, para ir enlazando de a poco: primero se carga tal cual
-- viene del SQL Server, y conforme se va identificando a que sede/medidor
-- de nuestro sistema corresponde cada pme_device_id, se completan ceco/
-- idsede manualmente. No se automatiza el cruce todavia (los nombres en
-- PME usan una tercera convención distinta, ej.
-- "MAKRO_SANTA_ANITA.ALUMBRADO_1", hay que revisarlo caso por caso).
-- =====================================================================
CREATE TABLE IF NOT EXISTS energia.master_devices_pme (
    pme_device_id INT PRIMARY KEY,               -- d.ID (Llave inmutable de ION_Network)
    device_name VARCHAR(200) NOT NULL,           -- d.Name
    device_type VARCHAR(100),                    -- dt.DisplayName
    network_address VARCHAR(100),                -- d.Address
    port_id INT,                                 -- d.PortID
    is_enabled BOOLEAN DEFAULT TRUE,             -- d.Enabled
    description TEXT,                            -- d.Description
    custom_prop_1 VARCHAR(255),                  -- d.CustomProperty1
    custom_prop_2 VARCHAR(255),                  -- d.CustomProperty2
    custom_prop_3 VARCHAR(255),                  -- d.CustomProperty3
    custom_prop_4 VARCHAR(255),                  -- d.CustomProperty4
    custom_prop_5 VARCHAR(255),                  -- d.CustomProperty5
    last_update_pme VARCHAR(50),                 -- Binary timestamp/rowversion a String Hex

    -- Campos personalizados de integración para AXIS RCM Pro / ERP / CMMS
    ceco VARCHAR(50),                            -- Centro de Costos
    idsede VARCHAR(50),                          -- Identificador de Sede (Ej: PV_AGUSTINO)
    ID_activo_rcm VARCHAR(100),                  -- ID de Activo en Fractal CMMS / AXIS
    fecha_actualizacion TIMESTAMPTZ DEFAULT NOW() -- Timestamp en español
);
ALTER TABLE energia.master_devices_pme DISABLE ROW LEVEL SECURITY;

-- servicio: se llena a mano (igual que ceco/idsede/ID_activo_rcm) para
-- clasificar cada dispositivo fisico entre los 4 servicios que ya maneja
-- el bot (HVAC, Iluminacion, Frio Alimentario, General) - mismos valores
-- de texto que usa energia.pme_dispositivos_mapeo.servicio, para que se
-- puedan cruzar ambas tablas mas adelante. Sin CHECK constraint a
-- proposito: es carga manual progresiva, mejor no bloquear la escritura
-- por un typo mientras se va llenando.
ALTER TABLE energia.master_devices_pme ADD COLUMN IF NOT EXISTS servicio VARCHAR(50);

-- pme_device_id en las 3 tablas de datos: el/los DeviceId(s) inmutables de
-- PME que alimentan ese grafico (ver PrimaryDataSeriesN/SecondaryDataSeriesN
-- en la respuesta de /Dashboards/data/dashboard/{id}). Es ARRAY porque un
-- grafico podria sumar mas de 1 dispositivo fisico directo. Permite
-- resolver el CECO por ID contra energia.master_devices_pme en vez de por
-- nombre, inmune a que renombren el titulo del grafico.
ALTER TABLE energia.pme_hvac ADD COLUMN IF NOT EXISTS pme_device_id INTEGER[];
ALTER TABLE energia.pme_iluminacion ADD COLUMN IF NOT EXISTS pme_device_id INTEGER[];
ALTER TABLE energia.pme_frio_alimentario ADD COLUMN IF NOT EXISTS pme_device_id INTEGER[];
ALTER TABLE energia.pme_general ADD COLUMN IF NOT EXISTS pme_device_id INTEGER[];

-- =====================================================================
-- Medidores VIRTUALES de PME: un grafico puede en vez de apuntar a un
-- DeviceId entero (dispositivo fisico), apuntar a una "formula" que suma
-- 2+ dispositivos (ej. Huanuco - Frio = TF-COM + TF-VI). Ese origen viene
-- codificado como un blob base64+gzip con un GUID de nodo
-- (uri:application-modules/power/model/node#<guid>), de un espacio de
-- IDs DISTINTO al de ION_Network.dbo.Device - por eso es tabla aparte de
-- master_devices_pme, no una columna ahi.
--
-- device_ids_componentes: se llena a mano cuando se identifique (viendo
-- en PME > Editar series de datos > Origenes, como hizo el usuario con
-- Huanuco = TF-COM + TF-VI) cuales pme_device_id de master_devices_pme
-- componen ese medidor virtual. Puede quedar vacio mientras tanto: el
-- CECO/servicio de este medidor virtual se puede llenar directo aca sin
-- necesitar tener resueltos los componentes primero.
-- =====================================================================
CREATE TABLE IF NOT EXISTS energia.master_virtual_meters_pme (
    virtual_meter_id UUID PRIMARY KEY,
    nombre_referencia TEXT,
    device_ids_componentes INTEGER[],
    ceco VARCHAR(50),
    servicio VARCHAR(50),
    actualizado_el TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE energia.master_virtual_meters_pme DISABLE ROW LEVEL SECURITY;

ALTER TABLE energia.pme_hvac ADD COLUMN IF NOT EXISTS pme_virtual_meter_id UUID[];
ALTER TABLE energia.pme_iluminacion ADD COLUMN IF NOT EXISTS pme_virtual_meter_id UUID[];
ALTER TABLE energia.pme_frio_alimentario ADD COLUMN IF NOT EXISTS pme_virtual_meter_id UUID[];
ALTER TABLE energia.pme_general ADD COLUMN IF NOT EXISTS pme_virtual_meter_id UUID[];

-- =====================================================================
-- OPCIONAL: migrar el histórico de HVAC ya extraído (tabla antigua
-- consolidada energia.pme_mediciones_spsa) hacia la nueva tabla dedicada.
-- No borra nada de la tabla antigua; solo copia.
-- =====================================================================
INSERT INTO energia.pme_hvac (timestamp_local, anio, mes, fecha, hora, sede, ceco, medidor_nombre, parametro, valor, unidad)
SELECT timestamp_local, anio, mes, fecha, hora, sede, ceco, medidor_nombre, parametro, valor, unidad
FROM energia.pme_mediciones_spsa
WHERE servicio = 'HVAC'
ON CONFLICT (timestamp_local, sede, medidor_nombre, parametro) DO NOTHING;

-- =====================================================================
-- Itlus Fractal (Itlus 2) — copia local de las tablas del OTRO proyecto
-- Supabase ("API SISTEMA MANTENIMIENTO"). Esas tablas casi no cambian (2-3
-- veces al mes, a veces ninguna), así que en vez de consultarlas en vivo
-- cada vez, se guarda acá una copia; server.js la sirve al instante y
-- revisa en segundo plano si hubo cambios, escribiendo solo si hay
-- diferencia real. Una fila por tabla origen, con los datos completos en
-- JSONB (son tablas chicas, unos cientos de KB cada una como mucho).
-- =====================================================================
CREATE TABLE IF NOT EXISTS energia.itlus_sistema_cache (
    tabla_id TEXT PRIMARY KEY,
    datos JSONB NOT NULL,
    actualizado_el TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE energia.itlus_sistema_cache DISABLE ROW LEVEL SECURITY;

-- =====================================================================
-- Itlus Fractal (Itlus 2) — "Palabras Clave": tabla chica y EDITABLE a
-- mano desde el propio botón nuevo del panel izquierdo (no es una copia de
-- otro Supabase, como las 5 de arriba). En "public", igual que
-- itlus_fractal_solicitudes, para no necesitar el header Accept-Profile.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.itlus_palabras_clave (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    palabra_clave TEXT,
    responsable TEXT,
    creado_el TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.itlus_palabras_clave DISABLE ROW LEVEL SECURITY;

-- =====================================================================
-- Itlus Fractal (Itlus 2) — "Activos Maestros Fracttal": RESPALDO de la
-- base completa de sedes+equipos que se trae de Fracttal (546 sedes, mas
-- de 40,000 equipos en total). La copia que de verdad se consulta en cada
-- busqueda es un archivo en disco del propio servidor
-- (backend/bots/cache_activos_fracttal.json, cargado a memoria al
-- arrancar) - esta tabla es solo para reconstruir ese archivo si se
-- pierde o el servidor corre en otra maquina, asi no se depende de que
-- Supabase este arriba para que el picker funcione.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.itlus_activos_fracttal_cache (
    id_location BIGINT PRIMARY KEY,
    code TEXT,
    description TEXT,
    equipos JSONB NOT NULL,
    actualizado_el TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.itlus_activos_fracttal_cache DISABLE ROW LEVEL SECURITY;
