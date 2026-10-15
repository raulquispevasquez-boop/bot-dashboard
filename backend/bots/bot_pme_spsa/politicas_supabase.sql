-- Habilitar permisos de inserción y lectura en el esquema 'energia' para Supabase
CREATE POLICY "Permitir insercion publica en pme_dispositivos_mapeo" ON energia.pme_dispositivos_mapeo FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir insercion publica en pme_mediciones_spsa" ON energia.pme_mediciones_spsa FOR ALL USING (true) WITH CHECK (true);

-- Asegurar deshabilitacion de RLS por si acaso
ALTER TABLE energia.pme_dispositivos_mapeo DISABLE ROW LEVEL SECURITY;
ALTER TABLE energia.pme_mediciones_spsa DISABLE ROW LEVEL SECURITY;
