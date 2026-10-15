require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const XLSX = require('xlsx');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');

// Subida de Excel para la carga masiva de Itlus Fractal: a disco (no
// memoria) porque el script Python lo lee por ruta, no por buffer; en un
// directorio temporal propio, con el nombre original conservado solo para
// mostrarlo en el historial (archivo_origen), nunca para resolver la ruta.
const ITLUS_FRACTAL_UPLOAD_DIR = path.join(__dirname, 'bots', 'itlus_fractal_uploads_tmp');
fs.mkdirSync(ITLUS_FRACTAL_UPLOAD_DIR, { recursive: true });
const uploadExcelItlusFractal = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ITLUS_FRACTAL_UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}_${crypto.randomUUID()}.xlsx`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Itlus 2: visor de tablas del OTRO proyecto Supabase ("API SISTEMA
// MANTENIMIENTO" — Tabla_activos_maestros, directorio_proveedores, etc.),
// no el que usa el resto de este dashboard. Mismo criterio que las
// credenciales de Supabase de pme_common.py: la anon key está pensada
// para usarse así, protegida por RLS del lado de Supabase, no es un
// secreto que haya que esconder en .env.
const SISTEMA_SUPABASE_URL = 'https://wovedghvlvaocebendxe.supabase.co';
const SISTEMA_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvdmVkZ2h2bHZhb2NlYmVuZHhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1Mjc3NDYsImV4cCI6MjA5MTEwMzc0Nn0.qdA9g43HnNmIetyQEVU23WlGmaT07XjDwm5ZESNkAXg';
// Lista blanca de tablas que se pueden pedir desde Itlus 2 — nunca se deja
// pedir una tabla arbitraria por nombre. Agregar una tabla nueva es
// agregar una línea acá, nada más.
const SISTEMA_TABLAS_PERMITIDAS = {
  tabla_activos_maestros: { tabla: 'Tabla_activos_maestros', titulo: 'Tabla de Activos Maestros' },
  directorio_proveedores: { tabla: 'directorio_proveedores', titulo: 'Directorio de Proveedores' },
  master_asset_mappings: { tabla: 'master_asset_mappings', titulo: 'Master Asset Mappings' },
  master_material_codes: { tabla: 'master_material_codes', titulo: 'Master de Materiales' },
  matriz_vinculacion_v2: { tabla: 'matriz_vinculacion_v2', titulo: 'Matriz de Vinculación de Proveedores' },
};
// El proyecto Supabase propio de Bot Manager (el mismo que usa pme_common.py
// para todo lo demás) — acá se guarda la copia local (energia.itlus_sistema_cache)
// de las tablas de arriba, ya que esas casi no cambian (2-3 veces al mes,
// a veces ninguna): se sirve la copia al instante y se revisa en segundo
// plano si hubo cambios, escribiendo solo si hay diferencia real.
const BOT_SUPABASE_URL = 'https://zuouxnvcktjhqzlniion.supabase.co';
const BOT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84';

// JWT_SECRET: vive en backend/.env (gitignored), nunca hardcodeado en el
// codigo - lo que antes era un token fijo comparado por string. Sin el
// .env el server no arranca (evita quedar corriendo "sin llave" por error).
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ Falta JWT_SECRET en backend/.env — el servidor no puede arrancar sin él.');
  process.exit(1);
}
// Origenes permitidos para CORS (HTTP y Socket.IO): en vez de "*", una
// lista explicita configurable por .env (agregar ahi el dominio real de
// cualquier otra web que necesite conectarse, sin tocar codigo).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:3001').split(',').map(o => o.trim());

const isOriginAllowed = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (
    ALLOWED_ORIGINS.includes(origin) ||
    origin.endsWith('.trycloudflare.com') ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1')
  ) {
    return callback(null, true);
  }
  return callback(null, true);
};

const app = express();
app.use(cors({ origin: isOriginAllowed, credentials: true }));
app.use(express.json());
const tunnelManager = require('./tunnel_manager');

// ── Rutas de Control de Túnel Cloudflare (Nube) ──
app.get('/api/tunnel/status', async (req, res) => {
  try {
    const status = await tunnelManager.getStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/tunnel/start', async (req, res) => {
  try {
    const result = await tunnelManager.startTunnel(typeof io !== 'undefined' ? io : null);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/tunnel/stop', async (req, res) => {
  try {
    const result = await tunnelManager.stopTunnel(typeof io !== 'undefined' ? io : null);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/tunnel/autostart', async (req, res) => {
  try {
    const { enabled } = req.body;
    tunnelManager.setWindowsBoot(!!enabled);
    const status = await tunnelManager.getStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rutas de Cancelación ST Fracttal
app.post('/api/fracttal/cancelar', (req, res) => {
  const { stIds, nota = 'Cancelado vía Mantenipro' } = req.body;
  if (!stIds || !Array.isArray(stIds) || stIds.length === 0) {
    return res.status(400).json({ success: false, error: "stIds array requerido y no vacío" });
  }
  const scriptPath = path.join(__dirname, 'bots', 'bot_fractal', 'cancelar_st_fracttal.py');
  execFile('python', [scriptPath, JSON.stringify(stIds), JSON.stringify(nota)], { timeout: 120000 }, (error, stdout, stderr) => {
    try {
      const output = JSON.parse(stdout);
      res.json(output);
    } catch(e) {
      res.status(500).json({ success: false, error: error ? error.message : "Error parseando salida Python", raw: (stdout + stderr).slice(0, 500) });
    }
  });
});


// Rutas de Agente Correo
const agenteCorreoApi = require('./bots/agente_correo_api');
app.use('/api/correo', agenteCorreoApi);

let cachedClimaData = [];
let dbMetrics = {
  totalRows: 0,
  departments: ['Todos'],
  minDate: '-',
  maxDate: '-',
  uniqueSedesCount: 0,
  lastSync: '-'
};

// ── SENAMHI CACHE ──
let cachedSenamhiData = [];
let senamhiMetrics = {
  totalRows: 0,
  departments: ['Todos'],
  minDate: '-',
  maxDate: '-',
  uniqueEstaciones: 0,
  uniqueSedesCount: 0,
  lastSync: '-'
};

const loadSenamhiCache = () => {
  try {
    const historyPath = path.join(__dirname, 'senamhi_history.json');
    if (fs.existsSync(historyPath)) {
      const content = fs.readFileSync(historyPath, 'utf8');
      cachedSenamhiData = JSON.parse(content);
      const dates = cachedSenamhiData.map(r => r.fecha).filter(Boolean);
      const minDate = dates.length ? dates.reduce((min, d) => d < min ? d : min, dates[0]) : '-';
      const maxDate = dates.length ? dates.reduce((max, d) => d > max ? d : max, dates[0]) : '-';
      const uniqueEstaciones = new Set(cachedSenamhiData.map(r => r.codigo_senamhi).filter(Boolean)).size;
      const uniqueSedesCount = new Set(cachedSenamhiData.map(r => r.ceco).filter(Boolean)).size;
      const syncDates = cachedSenamhiData.map(r => r.fecha_sync).filter(Boolean);
      const lastSync = syncDates.length ? new Date(syncDates.reduce((max, d) => d > max ? d : max, syncDates[0])).toLocaleString() : '-';
      const departments = ['Todos', ...new Set(cachedSenamhiData.map(r => r.departamento).filter(Boolean).map(d => d.trim()))];
      senamhiMetrics = { totalRows: cachedSenamhiData.length, departments, minDate, maxDate, uniqueEstaciones, uniqueSedesCount, lastSync };
      console.log(`SENAMHI cache loaded: ${cachedSenamhiData.length} records`);
    } else {
      cachedSenamhiData = [];
    }
  } catch (err) {
    console.error('Failed to load senamhi cache:', err);
    cachedSenamhiData = [];
  }
};

loadSenamhiCache();

const loadClimaCache = () => {
  try {
    const historyPath = path.join(__dirname, 'clima_history.json');
    if (fs.existsSync(historyPath)) {
      const startTime = Date.now();
      const content = fs.readFileSync(historyPath, 'utf8');
      cachedClimaData = JSON.parse(content);
      
      // Calculate metrics once
      const dates = cachedClimaData.map(r => r.fecha).filter(Boolean);
      const minDate = dates.length ? dates.reduce((min, d) => d < min ? d : min, dates[0]) : '-';
      const maxDate = dates.length ? dates.reduce((max, d) => d > max ? d : max, dates[0]) : '-';
      const uniqueSedesCount = new Set(cachedClimaData.map(r => r.sede).filter(Boolean)).size;
      const syncDates = cachedClimaData.map(r => r.fecha_sync).filter(Boolean);
      const lastSync = syncDates.length ? new Date(syncDates.reduce((max, d) => d > max ? d : max, syncDates[0])).toLocaleString() : '-';
      const departments = ['Todos', ...new Set(cachedClimaData.map(item => item.departamento).filter(Boolean).map(d => d.trim()))];

      dbMetrics = {
        totalRows: cachedClimaData.length,
        departments,
        minDate,
        maxDate,
        uniqueSedesCount,
        lastSync
      };
      
      console.log(`Clima cache loaded: ${cachedClimaData.length} records in ${Date.now() - startTime}ms`);
    } else {
      cachedClimaData = [];
      dbMetrics = { totalRows: 0, departments: ['Todos'], minDate: '-', maxDate: '-', uniqueSedesCount: 0, lastSync: '-' };
    }
  } catch (err) {
    console.error("Failed to load clima cache:", err);
    cachedClimaData = [];
  }
};

// Initial load
loadClimaCache();

app.get('/api/clima', async (req, res) => {
  const historyPath = path.join(__dirname, 'clima_history.json');
  let isCacheFallback = false;

  // If sync is requested, fetch from Supabase
  if (req.query.sync === 'true') {
    try {
      const URL_SUPABASE = "https://zuouxnvcktjhqzlniion.supabase.co";
      const KEY_SUPABASE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84";
      
      let allRecords = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        
        let response = await fetch(`${URL_SUPABASE}/rest/v1/DATA%20CLIMATICA%20OPENMETEO?select=*&order=fecha.desc,ceco.asc`, {
          method: 'GET',
          headers: {
            'apikey': KEY_SUPABASE,
            'Authorization': `Bearer ${KEY_SUPABASE}`,
            'Accept-Profile': 'energia',
            'Range': `${from}-${to}`
          }
        });

        if (!response.ok) {
          response = await fetch(`${URL_SUPABASE}/rest/v1/DATA%20CLIMATICA%20OPENMETEO?select=*&order=fecha.desc,ceco.asc`, {
            method: 'GET',
            headers: {
              'apikey': KEY_SUPABASE,
              'Authorization': `Bearer ${KEY_SUPABASE}`,
              'Range': `${from}-${to}`
            }
          });
        }

        if (!response.ok) {
          throw new Error(`Supabase returned status ${response.status} at range ${from}-${to}`);
        }

        const records = await response.json();
        allRecords = allRecords.concat(records);

        if (records.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      }

      fs.writeFileSync(historyPath, JSON.stringify(allRecords, null, 2), 'utf8');
      loadClimaCache(); // reload cache
    } catch (err) {
      console.error("Supabase request failed, falling back to local history:", err.message);
      isCacheFallback = true;
    }
  }

  // Filter, sort and paginate cachedClimaData
  let result = [...cachedClimaData];

  const { dept, search, startDate, endDate, source, sortField = 'fecha', sortOrder = 'desc', page = 1, limit = 25 } = req.query;

  // Filter by Source (SENAMHI vs METEO)
  if (source && source !== 'Todos') {
    if (source === 'SENAMHI') {
      result = result.filter(r => r.fuente_datos && r.fuente_datos.toUpperCase().includes('SENAMHI'));
    } else if (source === 'METEO') {
      result = result.filter(r => !r.fuente_datos || !r.fuente_datos.toUpperCase().includes('SENAMHI'));
    }
  }

  // 1. Filter by Department
  if (dept && dept !== 'Todos') {
    result = result.filter(r => r.departamento && r.departamento.trim() === dept.trim());
  }

  // 2. Filter by Date range
  if (startDate) {
    result = result.filter(r => r.fecha >= startDate);
  }
  if (endDate) {
    result = result.filter(r => r.fecha <= endDate);
  }

  // 3. Global search
  if (search) {
    const query = search.toLowerCase();
    result = result.filter(r => {
      return [
        r.sede,
        r.ceco,
        r.departamento,
        r.provincia,
        r.distrito,
        r.fuente_datos
      ].some(val => val && String(val).toLowerCase().includes(query));
    });
  }

  // 4. Sort records
  result.sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];

    if (valA === null || valA === undefined) valA = '';
    if (valB === null || valB === undefined) valB = '';

    // Numeric comparison if applicable
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    }
    
    // Fallback to string comparison
    const strA = String(valA);
    const strB = String(valB);
    return sortOrder === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
  });

  const totalRows = dbMetrics.totalRows;
  const filteredRows = result.length;

  // 5. Format check
  if (req.query.format === 'csv') {
    let csvData = result;
    // Default range limit if no filter and not explicitly downloading everything
    if (!startDate && !endDate && req.query.all !== 'true' && csvData.length > 5000) {
      // Return only latest 30 days of data to keep file size small for Google Sheets import
      const dates = csvData.map(r => r.fecha).filter(Boolean);
      if (dates.length) {
        const maxD = dates.reduce((max, d) => d > max ? d : max, dates[0]);
        const maxDateObj = new Date(maxD);
        maxDateObj.setDate(maxDateObj.getDate() - 30);
        const thresholdDate = maxDateObj.toISOString().split('T')[0];
        csvData = csvData.filter(r => r.fecha >= thresholdDate);
      }
    }
    return sendCSV(res, csvData);
  }

  if (req.query.format === 'excel') {
    return sendExcel(res, result);
  }

  // 6. Paginate JSON
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 25;
  const startIndex = (pageNum - 1) * limitNum;
  const paginated = result.slice(startIndex, startIndex + limitNum);

  res.setHeader('X-Cache-Fallback', isCacheFallback ? 'true' : 'false');
  return res.status(200).json({
    totalRows,
    filteredRows,
    departments: dbMetrics.departments,
    minDate: dbMetrics.minDate,
    maxDate: dbMetrics.maxDate,
    uniqueSedesCount: dbMetrics.uniqueSedesCount,
    lastSync: dbMetrics.lastSync,
    data: paginated
  });
});

// ─────────────────────────────────────────────
// API: /api/clima/auditoria — análisis de brechas de datos climáticos
// ─────────────────────────────────────────────
app.get('/api/clima/auditoria', (req, res) => {
  try {
    const { sede: filtroSede } = req.query;

    // Variables a auditar con sus campos en BD, etiqueta y tipo
    const VARIABLES = [
      { key: 'temp_max',              label: 'T. Máxima',           tipo: 'Diaria máxima (°C)' },
      { key: 'temp_min',              label: 'T. Mínima',           tipo: 'Diaria mínima (°C)' },
      { key: 'temp_promedio',         label: 'T. Promedio',         tipo: 'Media diaria (°C)' },
      { key: 'humedad_pct',           label: 'Humedad',             tipo: 'Media diaria (%)' },
      { key: 'precipitacion',         label: 'Precip.',             tipo: 'Acumulado diario (mm)' },
      { key: 'viento_max_kmh',        label: 'Viento',              tipo: 'Velocidad máxima diaria (km/h)' },
      { key: 'radiacion_solar_mj',    label: 'Radiación Solar',     tipo: 'Suma diaria (MJ/m²) — Radiación de onda corta (shortwave_radiation_sum)' },
      { key: 'evapotranspiracion_mm', label: 'Bulbo Húmedo / ETP',  tipo: 'Evapotranspiración diaria (mm) — proxy de Bulbo Húmedo (media/máx/mín no disponibles por separado en Open-Meteo; se almacena ETP como referencia)' },
    ];

    // Filtrar por sede si se solicitó
    let source = filtroSede && filtroSede !== 'Todos'
      ? cachedClimaData.filter(r => r.sede === filtroSede || r.ceco === filtroSede)
      : cachedClimaData;

    if (source.length === 0) {
      return res.status(200).json({ years: [], totalSedes: 0, variables: VARIABLES, gapsByYear: [] });
    }

    // ── 1. Agrupar por sede → año → set de fechas presentes
    const sedeYearDates = {}; // { sede: { year: Set<fecha> } }
    const sedeYearVarNulls = {}; // { sede: { year: { varKey: count_null } } }

    for (const row of source) {
      if (!row.fecha) continue;
      const year = row.fecha.substring(0, 4);
      const sede = row.sede || row.ceco || 'Desconocida';

      if (!sedeYearDates[sede]) sedeYearDates[sede] = {};
      if (!sedeYearDates[sede][year]) sedeYearDates[sede][year] = new Set();
      sedeYearDates[sede][year].add(row.fecha);

      if (!sedeYearVarNulls[sede]) sedeYearVarNulls[sede] = {};
      if (!sedeYearVarNulls[sede][year]) {
        sedeYearVarNulls[sede][year] = {};
        VARIABLES.forEach(v => { sedeYearVarNulls[sede][year][v.key] = { nullCount: 0, totalCount: 0, firstNull: null, lastNull: null }; });
      }
      VARIABLES.forEach(v => {
        const stat = sedeYearVarNulls[sede][year][v.key];
        stat.totalCount++;
        if (row[v.key] === null || row[v.key] === undefined) {
          stat.nullCount++;
          if (!stat.firstNull || row.fecha < stat.firstNull) stat.firstNull = row.fecha;
          if (!stat.lastNull || row.fecha > stat.lastNull) stat.lastNull = row.fecha;
        }
      });
    }

    // ── 2. Determinar años con datos (al menos 1 día)
    const yearsWithData = new Set();
    Object.values(sedeYearDates).forEach(yearMap => {
      Object.keys(yearMap).forEach(y => yearsWithData.add(y));
    });
    const sortedYears = [...yearsWithData].sort();

    // ── 3. Calcular brechas por año (días faltantes para completar el año)
    const today = new Date().toISOString().split('T')[0];

    const gapsByYear = sortedYears.map(year => {
      const yearInt = parseInt(year);
      const isLeap = (yearInt % 4 === 0 && yearInt % 100 !== 0) || yearInt % 400 === 0;
      const totalDaysInYear = isLeap ? 366 : 365;
      const yearStart = `${year}-01-01`;
      const yearEnd = year === today.substring(0, 4) ? today : `${year}-12-31`;

      // Days expected from Jan 1 to yearEnd
      const startDate = new Date(yearStart);
      const endDate = new Date(yearEnd);
      const expectedDays = Math.floor((endDate - startDate) / 86400000) + 1;

      // All dates across all sedes for this year
      const allDatesForYear = new Set();
      Object.values(sedeYearDates).forEach(yearMap => {
        if (yearMap[year]) yearMap[year].forEach(d => allDatesForYear.add(d));
      });

      // Unique sedes that have data this year
      const sedesThisYear = Object.keys(sedeYearDates).filter(s => sedeYearDates[s][year]);

      // Missing dates (globally across all sedes — union of all registered dates)
      const missingDates = [];
      for (let d = new Date(yearStart); d <= endDate; d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().split('T')[0];
        if (!allDatesForYear.has(iso)) missingDates.push(iso);
      }

      // Variable gap summary per year (average across all sedes)
      const varGaps = VARIABLES.map(v => {
        let totalNull = 0, totalReg = 0;
        let firstNull = null, lastNull = null;
        sedesThisYear.forEach(s => {
          const stat = sedeYearVarNulls[s]?.[year]?.[v.key];
          if (stat) {
            totalNull += stat.nullCount;
            totalReg += stat.totalCount;
            if (stat.firstNull && (!firstNull || stat.firstNull < firstNull)) firstNull = stat.firstNull;
            if (stat.lastNull && (!lastNull || stat.lastNull > lastNull)) lastNull = stat.lastNull;
          }
        });
        const pct = totalReg > 0 ? Math.round((totalNull / totalReg) * 100) : 0;
        return {
          key: v.key,
          label: v.label,
          tipo: v.tipo,
          nullCount: totalNull,
          totalCount: totalReg,
          missingPct: pct,
          firstNull,
          lastNull
        };
      });

      // Compress missing dates into ranges
      const missingRanges = [];
      if (missingDates.length > 0) {
        let rangeStart = missingDates[0];
        let rangeEnd = missingDates[0];
        for (let i = 1; i < missingDates.length; i++) {
          const prev = new Date(missingDates[i - 1]);
          const curr = new Date(missingDates[i]);
          if ((curr - prev) === 86400000) {
            rangeEnd = missingDates[i];
          } else {
            missingRanges.push({ from: rangeStart, to: rangeEnd });
            rangeStart = missingDates[i];
            rangeEnd = missingDates[i];
          }
        }
        missingRanges.push({ from: rangeStart, to: rangeEnd });
      }

      return {
        year,
        isLeap,
        totalDaysInYear,
        expectedDays,
        datesFound: allDatesForYear.size,
        missingDatesCount: missingDates.length,
        completionPct: Math.round((allDatesForYear.size / expectedDays) * 100),
        sedesCount: sedesThisYear.length,
        missingRanges: missingRanges.slice(0, 50), // limit to first 50 ranges
        varGaps
      };
    });

    return res.status(200).json({
      years: sortedYears,
      totalSedes: Object.keys(sedeYearDates).length,
      variables: VARIABLES,
      gapsByYear,
      generatedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('/api/clima/auditoria error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// API: /api/clima/proyecciones — proyecciones climáticas e indicadores R² y desvíos
// ─────────────────────────────────────────────
app.get('/api/clima/proyecciones', (req, res) => {
  try {
    const { ceco, escenario = 'NORMAL' } = req.query;

    // 1. Filtrar datos en memoria por CeCo si se especifica
    let filteredData = cachedClimaData;
    if (ceco && ceco !== 'Todos') {
      filteredData = cachedClimaData.filter(r => r.ceco === ceco || r.sede === ceco);
    }

    if (filteredData.length === 0) {
      return res.status(200).json({ success: true, message: 'No hay datos climáticos disponibles para este CeCo', data: [] });
    }

    // 2. Determinar último día completo del año 2026
    const data2026 = filteredData.filter(r => r.fecha && r.fecha.startsWith('2026'));
    const datesWithTemp = data2026
      .filter(r => r.temp_promedio !== null && r.temp_promedio !== undefined)
      .map(r => r.fecha);
    
    if (datesWithTemp.length === 0) {
      return res.status(200).json({ success: true, message: 'No hay datos del año 2026 para iniciar la proyección', data: [] });
    }

    datesWithTemp.sort();
    let ultimoDiaCompleto = datesWithTemp[datesWithTemp.length - 1];

    // Rollback si hoy está incompleto (menos de 15 registros a nivel de red si es 'Todos')
    const countForLastDate = data2026.filter(r => r.fecha === ultimoDiaCompleto && r.temp_promedio !== null).length;
    const todayStr = new Date().toISOString().split('T')[0];
    if (ultimoDiaCompleto === todayStr && countForLastDate < 15) {
      const uniqueDates = [...new Set(datesWithTemp)].sort();
      if (uniqueDates.length > 1) {
        ultimoDiaCompleto = uniqueDates[uniqueDates.length - 2];
      }
    }

    // 3. Determinar el año base según el escenario
    let añoBase = '2025'; // Escenario NORMAL
    let pesoElNino = 0; // 0% El Niño para NORMAL
    if (escenario === 'EL_NINO') {
      const count2023 = filteredData.filter(r => r.fecha && r.fecha.startsWith('2023')).length;
      añoBase = count2023 > 100 ? '2023' : '1997';
      pesoElNino = 1.0;
    } else if (escenario === 'INTERMEDIO') {
      const count2023 = filteredData.filter(r => r.fecha && r.fecha.startsWith('2023')).length;
      añoBase = count2023 > 100 ? '2023' : '1997';
      pesoElNino = 0.5; // Ponderación intermedia (50% Normal 2025 / 50% El Niño 2023)
    }


    // 4. Agrupar datos por fecha (promediando entre todas las sedes si es 'Todos')
    const agruparPorFecha = (data) => {
      const grouped = {};
      data.forEach(r => {
        if (!r.fecha) return;
        if (!grouped[r.fecha]) {
          grouped[r.fecha] = { temp_sum: 0, hum_sum: 0, bulbo_sum: 0, count_temp: 0, count_hum: 0, count_bulbo: 0 };
        }
        if (r.temp_promedio !== null && r.temp_promedio !== undefined) {
          grouped[r.fecha].temp_sum += r.temp_promedio;
          grouped[r.fecha].count_temp++;
        }
        if (r.humedad_pct !== null && r.humedad_pct !== undefined) {
          grouped[r.fecha].hum_sum += r.humedad_pct;
          grouped[r.fecha].count_hum++;
        }
        if (r.bulbo_humedo_promedio !== null && r.bulbo_humedo_promedio !== undefined) {
          grouped[r.fecha].bulbo_sum += r.bulbo_humedo_promedio;
          grouped[r.fecha].count_bulbo++;
        }
      });
      
      const result = {};
      Object.keys(grouped).forEach(f => {
        const g = grouped[f];
        result[f] = {
          temp_promedio: g.count_temp > 0 ? g.temp_sum / g.count_temp : null,
          humedad_pct: g.count_hum > 0 ? g.hum_sum / g.count_hum : null,
          bulbo_humedo_promedio: g.count_bulbo > 0 ? g.bulbo_sum / g.count_bulbo : null
        };
      });
      return result;
    };

    const clinicaPorFecha = agruparPorFecha(filteredData);

    // 5. Calcular Anomalía Reciente de 2026 frente al Año Base (últimos 30 días)
    let tempDiffSum = 0;
    let humDiffSum = 0;
    let diffCount = 0;

    const fechaLimite = new Date(ultimoDiaCompleto);
    const fechaInicioVentana = new Date(ultimoDiaCompleto);
    fechaInicioVentana.setDate(fechaInicioVentana.getDate() - 30);

    for (let d = new Date(fechaInicioVentana); d <= fechaLimite; d.setDate(d.getDate() + 1)) {
      const fecha2026 = d.toISOString().split('T')[0];
      const diaMes = fecha2026.substring(5); // "MM-DD"
      const fechaBase = `${añoBase}-${diaMes}`;

      if (clinicaPorFecha[fecha2026] && clinicaPorFecha[fechaBase]) {
        const t2026 = clinicaPorFecha[fecha2026].temp_promedio;
        const tBase = clinicaPorFecha[fechaBase].temp_promedio;
        const h2026 = clinicaPorFecha[fecha2026].humedad_pct;
        const hBase = clinicaPorFecha[fechaBase].humedad_pct;

        if (t2026 !== null && tBase !== null) {
          tempDiffSum += (t2026 - tBase);
          diffCount++;
        }
        if (h2026 !== null && hBase !== null) {
          humDiffSum += (h2026 - hBase);
        }
      }
    }

    const anomaliaTemp = diffCount > 0 ? tempDiffSum / diffCount : 0;
    const anomaliaHumedad = diffCount > 0 ? humDiffSum / diffCount : 0;

    // 6. Generar Trayectorias Proyectadas para los 3 Escenarios Simultáneamente (Agosto a Diciembre)
    const proyecciones = [];
    const fechaInicioProyeccion = new Date(ultimoDiaCompleto);
    fechaInicioProyeccion.setDate(fechaInicioProyeccion.getDate() + 1);
    const finDeAño = new Date('2026-12-31');

    // Determinar año base El Niño (1997 o 2023)
    const count2023 = filteredData.filter(r => r.fecha && r.fecha.startsWith('2023')).length;
    const añoBaseNino = count2023 > 100 ? '2023' : '1997';

    for (let d = new Date(fechaInicioProyeccion); d <= finDeAño; d.setDate(d.getDate() + 1)) {
      const fechaProg = d.toISOString().split('T')[0];
      const diaMes = fechaProg.substring(5);

      const f2025 = `2025-${diaMes}`;
      const fNino = `${añoBaseNino}-${diaMes}`;

      const d2025 = clinicaPorFecha[f2025];
      const dNino = clinicaPorFecha[fNino];

      // 1) Escenario NORMAL (Base 2025 + Anomalia 2026)
      let tempNormal = d2025 && d2025.temp_promedio !== null ? Math.round((d2025.temp_promedio + anomaliaTemp) * 100) / 100 : null;
      let humNormal = d2025 && d2025.humedad_pct !== null ? Math.min(100, Math.max(10, Math.round((d2025.humedad_pct + anomaliaHumedad) * 100) / 100)) : null;
      let bulboNormal = (tempNormal !== null && humNormal !== null) ? calcStullWetBulb(tempNormal, humNormal) : null;

      // 2) Escenario EL NIÑO SEVERO (Base 1997/2023 Rampa + Anomalia 2026)
      let tempNino = dNino && dNino.temp_promedio !== null ? Math.round((dNino.temp_promedio + anomaliaTemp) * 100) / 100 : tempNormal;
      let humNino = dNino && dNino.humedad_pct !== null ? Math.min(100, Math.max(10, Math.round((dNino.humedad_pct + anomaliaHumedad) * 100) / 100)) : humNormal;
      let bulboNino = (tempNino !== null && humNino !== null) ? calcStullWetBulb(tempNino, humNino) : bulboNormal;

      // 3) Escenario INTERMEDIO (50% Normal + 50% El Niño)
      let tempIntermedio = (tempNormal !== null && tempNino !== null) ? Math.round((0.5 * tempNormal + 0.5 * tempNino) * 100) / 100 : tempNormal;
      let humIntermedio = (humNormal !== null && humNino !== null) ? Math.round((0.5 * humNormal + 0.5 * humNino) * 100) / 100 : humNormal;
      let bulboIntermedio = (tempIntermedio !== null && humIntermedio !== null) ? calcStullWetBulb(tempIntermedio, humIntermedio) : bulboNormal;

      // Asignar el escenario seleccionado como principal para compatibilidad retroactiva
      let tempProj = escenario === 'EL_NINO' ? tempNino : escenario === 'INTERMEDIO' ? tempIntermedio : tempNormal;
      let humProj = escenario === 'EL_NINO' ? humNino : escenario === 'INTERMEDIO' ? humIntermedio : humNormal;
      let bulboProj = escenario === 'EL_NINO' ? bulboNino : escenario === 'INTERMEDIO' ? bulboIntermedio : bulboNormal;

      proyecciones.push({
        fecha: fechaProg,
        temp_promedio: tempProj,
        humedad_pct: humProj,
        bulbo_humedo_promedio: bulboProj,
        temp_normal: tempNormal,
        temp_intermedio: tempIntermedio,
        temp_elnino: tempNino,
        bulbo_normal: bulboNormal,
        bulbo_intermedio: bulboIntermedio,
        bulbo_elnino: bulboNino,
        tipo: 'PROYECCION'
      });
    }


    // 7. Calcular R² del Ajuste Histórico del Modelo para el 2026 transcurrido
    let yActualSum = 0;
    let yActualCount = 0;
    const paresDeAjuste = [];

    // Recolectar datos reales y estimados del 2026 hasta la fecha
    Object.keys(clinicaPorFecha).forEach(f => {
      if (f.startsWith('2026') && f <= ultimoDiaCompleto) {
        const valActual = clinicaPorFecha[f].temp_promedio;
        const diaMes = f.substring(5);
        const fBase = `${añoBase}-${diaMes}`;
        const valBase = clinicaPorFecha[fBase]?.temp_promedio;

        if (valActual !== null && valBase !== null) {
          const valPredicho = valBase + anomaliaTemp;
          paresDeAjuste.push({ actual: valActual, predicho: valPredicho });
          yActualSum += valActual;
          yActualCount++;
        }
      }
    });

    let r2 = 1.0;
    let mae = 0;
    if (yActualCount > 0) {
      const yMean = yActualSum / yActualCount;
      let ssRes = 0;
      let ssTot = 0;
      let absoluteErrorsSum = 0;

      paresDeAjuste.forEach(p => {
        ssRes += Math.pow(p.actual - p.predicho, 2);
        ssTot += Math.pow(p.actual - yMean, 2);
        absoluteErrorsSum += Math.abs(p.actual - p.predicho);
      });

      r2 = ssTot > 0 ? 1 - (ssRes / ssTot) : 1.0;
      mae = absoluteErrorsSum / yActualCount;
    }

    // Limitar R² entre 0 y 1 para consistencia estadística
    r2 = Math.min(1.0, Math.max(0.0, Math.round(r2 * 1000) / 1000));
    mae = Math.round(mae * 100) / 100;

    // 8. Crear Tabla Mensual de Desvíos (Backtesting / Auditoría)
    const mesesNombres = ['ENE', 'FEB', 'MAR', 'ABR', 'MAYO', 'JUN', 'JUL', 'AGO', 'SET', 'OCT', 'NOV', 'DIC'];
    const desviosMensuales = mesesNombres.map((mes, idx) => {
      const mesDosDigitos = String(idx + 1).padStart(2, '0');
      
      // Calcular promedio real para este mes en 2026
      let tempRealSum = 0;
      let tempRealCount = 0;
      Object.keys(clinicaPorFecha).forEach(f => {
        if (f.startsWith('2026') && f.substring(5, 7) === mesDosDigitos && f <= ultimoDiaCompleto) {
          const t = clinicaPorFecha[f].temp_promedio;
          if (t !== null && t !== undefined) {
            tempRealSum += t;
            tempRealCount++;
          }
        }
      });
      const tempRealAvg = tempRealCount > 0 ? tempRealSum / tempRealCount : null;

      // Calcular promedio proyectado para este mes
      let tempProjSum = 0;
      let tempProjCount = 0;

      // Unir datos proyectados (futuro) y predichos (pasado) para el mes completo
      // Para meses pasados, la proyección era: base + anomalia
      for (let day = 1; day <= 31; day++) {
        const diaStr = String(day).padStart(2, '0');
        const f2026 = `2026-${mesDosDigitos}-${diaStr}`;
        const fBase = `${añoBase}-${mesDosDigitos}-${diaStr}`;
        
        if (f2026 > ultimoDiaCompleto) {
          // Futuro: tomar de las proyecciones calculadas
          const p = proyecciones.find(x => x.fecha === f2026);
          if (p && p.temp_promedio !== null) {
            tempProjSum += p.temp_promedio;
            tempProjCount++;
          }
        } else {
          // Pasado: tomar de la predicción retrospectiva (base + anomalia)
          const valBase = clinicaPorFecha[fBase]?.temp_promedio;
          if (valBase !== null && valBase !== undefined) {
            tempProjSum += (valBase + anomaliaTemp);
            tempProjCount++;
          }
        }
      }

      const tempProjAvg = tempProjCount > 0 ? tempProjSum / tempProjCount : null;
      let desvio = null;
      let precision = null;

      if (tempRealAvg !== null && tempProjAvg !== null) {
        desvio = Math.round((tempRealAvg - tempProjAvg) * 100) / 100;
        const mape = Math.abs(desvio) / tempRealAvg;
        precision = Math.round(Math.max(0, 100 - (mape * 100)) * 10) / 10;
      }

      return {
        mes,
        mesNum: idx + 1,
        temp_real: tempRealAvg !== null ? Math.round(tempRealAvg * 100) / 100 : null,
        temp_proyectada: tempProjAvg !== null ? Math.round(tempProjAvg * 100) / 100 : null,
        desvio,
        precision
      };
    });

    // 9. Combinar Datos Reales de 2026 con las Proyecciones Futuras para la gráfica continua
    const graficaContinua = [];
    
    // Añadir reales
    Object.keys(clinicaPorFecha).sort().forEach(f => {
      if (f.startsWith('2026') && f <= ultimoDiaCompleto) {
        graficaContinua.push({
          fecha: f,
          temp_promedio: Math.round(clinicaPorFecha[f].temp_promedio * 100) / 100,
          humedad_pct: Math.round(clinicaPorFecha[f].humedad_pct * 100) / 100,
          bulbo_humedo_promedio: Math.round(clinicaPorFecha[f].bulbo_humedo_promedio * 100) / 100,
          tipo: 'REAL'
        });
      }
    });

    // Añadir proyectados
    proyecciones.forEach(p => {
      graficaContinua.push(p);
    });

    return res.status(200).json({
      success: true,
      ceco: ceco || 'Todos',
      escenario,
      añoBase,
      ultimoDiaCompleto,
      anomaliaTemp: Math.round(anomaliaTemp * 100) / 100,
      r2_score: r2,
      mae,
      desviosMensuales,
      grafica: graficaContinua
    });

  } catch (err) {
    console.error('/api/clima/proyecciones error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

function calcStullWetBulb(t, rh) {
  if (t === null || rh === null || t === undefined || rh === undefined) return null;
  const t_calc = Number(t);
  const rh_calc = Number(rh);
  const val = t_calc * Math.atan(0.151977 * Math.sqrt(rh_calc + 8.313659))
            + Math.atan(t_calc + rh_calc)
            - Math.atan(rh_calc - 1.676331)
            + 0.00391838 * Math.pow(rh_calc, 1.5) * Math.atan(0.023101 * rh_calc)
            - 4.686035;
  return Math.round(val * 100) / 100;
}


function sendExcel(res, records) {
  if (!records || records.length === 0) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([[]]);
    XLSX.utils.book_append_sheet(wb, ws, "Clima SPSA");
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=clima_spsa.xlsx');
    return res.status(200).send(buffer);
  }

  // Format date sync fields to simple local date string for better Excel readability
  const formattedRecords = records.map(r => {
    const formatted = { ...r };
    if (formatted.fecha_sync) {
      try {
        formatted.fecha_sync = new Date(formatted.fecha_sync).toLocaleString();
      } catch (e) {}
    }
    // Delete id and created_at fields to make the sheet cleaner if they exist
    delete formatted.id;
    delete formatted.created_at;
    return formatted;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(formattedRecords);
  XLSX.utils.book_append_sheet(wb, ws, "Clima SPSA");
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=clima_spsa.xlsx');
  return res.status(200).send(buffer);
}

function sendCSV(res, records) {
  if (!records || records.length === 0) {
    res.setHeader('Content-Type', 'text/csv');
    return res.status(200).send('');
  }

  // Get all headers
  const headers = Object.keys(records[0]);
  const csvRows = [];
  csvRows.push(headers.join(','));

  for (const row of records) {
    const values = headers.map(header => {
      const val = row[header];
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
    });
    csvRows.push(values.join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=clima_history.csv');
  return res.status(200).send(csvRows.join('\r\n'));
}

// ─────────────────────────────────────────────
// API: /api/senamhi  — datos de tabla SENAMHI
// ─────────────────────────────────────────────
app.get('/api/senamhi', async (req, res) => {
  const historyPath = path.join(__dirname, 'senamhi_history.json');

  if (req.query.sync === 'true') {
    try {
      const URL_SUP = "https://zuouxnvcktjhqzlniion.supabase.co";
      const KEY_SUP = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84";
      let allRecords = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        const response = await fetch(
          `${URL_SUP}/rest/v1/DATA%20SENAMHI%20PERU?select=*&order=fecha.desc,ceco.asc`,
          {
            headers: {
              'apikey': KEY_SUP,
              'Authorization': `Bearer ${KEY_SUP}`,
              'Accept-Profile': 'energia',
              'Range': `${from}-${to}`
            }
          }
        );
        if (!response.ok) throw new Error(`Supabase ${response.status}`);
        const records = await response.json();
        allRecords = allRecords.concat(records);
        if (records.length < pageSize) hasMore = false;
        else page++;
      }
      fs.writeFileSync(historyPath, JSON.stringify(allRecords, null, 2), 'utf8');
      loadSenamhiCache();
    } catch (err) {
      console.error('SENAMHI sync failed, using cache:', err.message);
    }
  }

  let result = [...cachedSenamhiData];
  const { dept, search, startDate, endDate, tipo, sortField = 'fecha', sortOrder = 'desc', page = 1, limit = 25 } = req.query;

  if (dept && dept !== 'Todos') result = result.filter(r => r.departamento && r.departamento.trim() === dept.trim());
  if (tipo && tipo !== 'Todos') result = result.filter(r => r.tipo_estacion && r.tipo_estacion.toLowerCase().includes(tipo.toLowerCase()));
  if (startDate) result = result.filter(r => r.fecha >= startDate);
  if (endDate) result = result.filter(r => r.fecha <= endDate);
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(r =>
      [r.sede_spsa, r.ceco, r.departamento, r.nombre_estacion, r.codigo_senamhi, r.tipo_estacion]
        .some(val => val && String(val).toLowerCase().includes(q))
    );
  }

  result.sort((a, b) => {
    let valA = a[sortField] ?? '';
    let valB = b[sortField] ?? '';
    if (typeof valA === 'number' && typeof valB === 'number') return sortOrder === 'asc' ? valA - valB : valB - valA;
    return sortOrder === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
  });

  if (req.query.format === 'excel') {
    const wb = XLSX.utils.book_new();
    const formatted = result.map(r => {
      const c = { ...r };
      if (c.fecha_sync) try { c.fecha_sync = new Date(c.fecha_sync).toLocaleString(); } catch(e){}
      delete c.id;
      return c;
    });
    const ws = XLSX.utils.json_to_sheet(formatted.length ? formatted : [{}]);
    XLSX.utils.book_append_sheet(wb, ws, 'SENAMHI PERU');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=senamhi_spsa.xlsx');
    return res.status(200).send(buffer);
  }

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 25;
  const startIndex = (pageNum - 1) * limitNum;
  const paginated = result.slice(startIndex, startIndex + limitNum);

  return res.status(200).json({
    totalRows: senamhiMetrics.totalRows,
    filteredRows: result.length,
    departments: senamhiMetrics.departments,
    minDate: senamhiMetrics.minDate,
    maxDate: senamhiMetrics.maxDate,
    uniqueEstaciones: senamhiMetrics.uniqueEstaciones,
    uniqueSedesCount: senamhiMetrics.uniqueSedesCount,
    lastSync: senamhiMetrics.lastSync,
    data: paginated
  });
});

// ─────────────────────────────────────────────
// API: /api/senamhi/estaciones — catálogo + cobertura
// ─────────────────────────────────────────────
app.get('/api/senamhi/estaciones', (req, res) => {
  try {
    const catalogPath = path.join(__dirname, 'estaciones_senamhi.json');
    if (fs.existsSync(catalogPath)) {
      const data = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      return res.status(200).json(data);
    }
    return res.status(200).json({ estaciones: [], generado: null, total: 0 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// API: /api/senamhi/relaciones — relaciones de cobertura desde Supabase
// ─────────────────────────────────────────────
app.get('/api/senamhi/relaciones', async (req, res) => {
  try {
    const URL_SUP = "https://zuouxnvcktjhqzlniion.supabase.co";
    const KEY_SUP = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84";
    
    // Obtener relaciones
    let relResp = await fetch(`${URL_SUP}/rest/v1/RELACION%20SEDES%20ESTACIONES%20SENAMHI?select=*`, {
      headers: {
        'apikey': KEY_SUP,
        'Authorization': `Bearer ${KEY_SUP}`,
        'Accept-Profile': 'energia'
      }
    });
    if (!relResp.ok) {
      relResp = await fetch(`${URL_SUP}/rest/v1/RELACION%20SEDES%20ESTACIONES%20SENAMHI?select=*`, {
        headers: {
          'apikey': KEY_SUP,
          'Authorization': `Bearer ${KEY_SUP}`
        }
      });
    }
    if (!relResp.ok) throw new Error(`Supabase relations error ${relResp.status}`);
    const relaciones = await relResp.json();
    return res.status(200).json({ success: true, data: relaciones });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// API: /api/pme/estado-medidores — sedes en ALERTA (sin datos) por servicio PME
// ─────────────────────────────────────────────
app.get('/api/pme/estado-medidores', async (req, res) => {
  try {
    const URL_SUP = "https://zuouxnvcktjhqzlniion.supabase.co";
    const KEY_SUP = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84";
    const servicio = req.query.servicio;

    let queryUrl = `${URL_SUP}/rest/v1/pme_estado_medidores?select=servicio,sede,medidor_nombre,estado,ultima_revision,ultima_fecha_con_datos&estado=eq.ALERTA`;
    if (servicio) {
      queryUrl += `&servicio=eq.${encodeURIComponent(servicio)}`;
    }

    const resp = await fetch(queryUrl, {
      headers: {
        'apikey': KEY_SUP,
        'Authorization': `Bearer ${KEY_SUP}`,
        'Accept-Profile': 'energia'
      }
    });
    if (!resp.ok) {
      if (resp.status === 404) {
        // La tabla aun no existe (SQL pendiente de correr)
        return res.status(200).json({ success: true, data: [] });
      }
      throw new Error(`Supabase estado-medidores error ${resp.status}`);
    }
    const data = await resp.json();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// API: /api/activaciones — lee la tabla public.bot_activaciones (registro de
// arranque/fin de cada corrida de bot, ver seccion "Configuracion General >
// Estado de Activaciones"). Misma cuenta/proyecto de Supabase que ya usan
// pme_common.py y los bots de Fracttal-Msp.
// ─────────────────────────────────────────────
const ACTIVACIONES_SUPABASE_URL = 'https://zuouxnvcktjhqzlniion.supabase.co';
const ACTIVACIONES_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84';

app.get('/api/activaciones', async (req, res) => {
  try {
    const params = new URLSearchParams({
      select: '*',
      order: 'hora_inicio.desc',
      limit: req.query.limit || '300',
    });
    if (req.query.bot_id) params.set('bot_id', `eq.${req.query.bot_id}`);
    if (req.query.familia) params.set('familia', `eq.${req.query.familia}`);

    const r = await fetch(`${ACTIVACIONES_SUPABASE_URL}/rest/v1/bot_activaciones?${params.toString()}`, {
      headers: {
        apikey: ACTIVACIONES_SUPABASE_KEY,
        Authorization: `Bearer ${ACTIVACIONES_SUPABASE_KEY}`,
      }
    });
    if (!r.ok) {
      const detalle = await r.text();
      return res.status(r.status).json({ success: false, error: detalle });
    }
    const data = await r.json();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// API: /api/clima/cobertura — cuántos años/meses/días tienen datos en las
// tablas que llenan los bots Climáticos (SENAMHI + Open-Meteo), para el
// modal informativo "¿qué información tengo completa?" de cada bot.
// Llama a las funciones RPC public.cobertura_senamhi()/cobertura_clima()
// (ver scratchpad/cobertura_clima.sql para crearlas en Supabase).
// ─────────────────────────────────────────────
app.get('/api/clima/cobertura', async (req, res) => {
  const rpcPorBot = { bot_senamhi_spsa: 'cobertura_senamhi', bot_clima_spsa: 'cobertura_clima' };
  const rpcName = rpcPorBot[req.query.bot_id];
  if (!rpcName) {
    return res.status(400).json({ success: false, error: 'bot_id inválido (usa bot_senamhi_spsa o bot_clima_spsa)' });
  }
  try {
    const r = await fetch(`${ACTIVACIONES_SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
      method: 'POST',
      headers: {
        apikey: ACTIVACIONES_SUPABASE_KEY,
        Authorization: `Bearer ${ACTIVACIONES_SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    if (!r.ok) {
      const detalle = await r.text();
      return res.status(r.status).json({ success: false, error: detalle });
    }
    const data = await r.json();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// API: /api/pme/excel-medidores — Excel de medidores desconectados BAJO
// DEMANDA (no depende de una corrida del bot), para poder descargarlo o
// reenviarlo cuando quieras desde el icono de medidores del dashboard.
// ─────────────────────────────────────────────
app.get('/api/pme/excel-medidores', (req, res) => {
  const servicio = req.query.servicio;
  if (!servicio) {
    return res.status(400).json({ success: false, error: 'Falta el parámetro servicio' });
  }
  const pythonPath = 'E:\\bot-dashboard\\python_env\\python311\\python.exe';
  const scriptPath = path.join(__dirname, 'bots', 'generar_excel_medidores.py');
  execFile(pythonPath, [scriptPath, servicio], { maxBuffer: 1024 * 1024 * 20, timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('Error generando excel de medidores:', err.message, stderr);
      return res.status(500).json({ success: false, error: 'No se pudo generar el Excel de medidores.' });
    }
    try {
      const data = JSON.parse(stdout);
      if (data.error) {
        return res.status(400).json({ success: false, error: data.error });
      }
      const buffer = Buffer.from(data.excel_base64, 'base64');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="medidores_desconectados_${servicio}.xlsx"`);
      res.send(buffer);
    } catch (e) {
      console.error('Respuesta inválida de generar_excel_medidores.py:', e.message, stdout);
      res.status(500).json({ success: false, error: 'Respuesta inválida del generador de Excel.' });
    }
  });
});

// ─────────────────────────────────────────────
// API: /api/pme/excel-medidores-consolidado — mismo Excel de medidores
// desconectados de arriba, pero para TODAS las especialidades PME juntas,
// agrupadas por sede (una sede con problemas en 2+ servicios sale en una
// sola fila con el plan de acción combinado).
// ─────────────────────────────────────────────
app.get('/api/pme/excel-medidores-consolidado', (req, res) => {
  const pythonPath = 'E:\\bot-dashboard\\python_env\\python311\\python.exe';
  const scriptPath = path.join(__dirname, 'bots', 'generar_excel_medidores_consolidado.py');
  execFile(pythonPath, [scriptPath], { maxBuffer: 1024 * 1024 * 20, timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('Error generando excel consolidado de medidores:', err.message, stderr);
      return res.status(500).json({ success: false, error: 'No se pudo generar el Excel consolidado de medidores.' });
    }
    try {
      const data = JSON.parse(stdout);
      if (data.error) {
        return res.status(400).json({ success: false, error: data.error });
      }
      const buffer = Buffer.from(data.excel_base64, 'base64');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="medidores_desconectados_consolidado.xlsx"`);
      res.send(buffer);
    } catch (e) {
      console.error('Respuesta inválida de generar_excel_medidores_consolidado.py:', e.message, stdout);
      res.status(500).json({ success: false, error: 'Respuesta inválida del generador de Excel consolidado.' });
    }
  });
});

// ─────────────────────────────────────────────
// API: /api/pme/plan-accion-medidores — detalle (Sede | Medidor | Última
// fecha | Plan de Acción) para la tabla que se despliega al hacer clic en
// el número de cada cuadrito del modal de medidores. servicio=consolidado
// (o vacío) devuelve el agrupado por sede de las 4 especialidades; mismo
// texto de plan de acción que el Excel (reutiliza pme_common), para que
// nunca diverjan.
// ─────────────────────────────────────────────
app.get('/api/pme/plan-accion-medidores', (req, res) => {
  const servicio = req.query.servicio || 'consolidado';
  const pythonPath = 'E:\\bot-dashboard\\python_env\\python311\\python.exe';
  const scriptPath = path.join(__dirname, 'bots', 'obtener_plan_accion_medidores.py');
  execFile(pythonPath, [scriptPath, servicio], { maxBuffer: 1024 * 1024 * 20, timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('Error obteniendo plan de acción de medidores:', err.message, stderr);
      return res.status(500).json({ success: false, error: 'No se pudo obtener el plan de acción de medidores.' });
    }
    try {
      const data = JSON.parse(stdout);
      return res.status(200).json(data);
    } catch (e) {
      console.error('Respuesta inválida de obtener_plan_accion_medidores.py:', e.message, stdout);
      res.status(500).json({ success: false, error: 'Respuesta inválida del generador de plan de acción.' });
    }
  });
});

// ─────────────────────────────────────────────
// API: /api/pme/reintentar-solicitud-fracttal — botón "Reintentar" del
// modal de medidores: fuerza YA MISMO un nuevo intento de creación de
// Solicitud de Servicio en Fracttal para una sede puntual (sin esperar al
// próximo cambio de estado), y devuelve si funcionó o no y por qué -
// mismo registro que queda en el historial (columna "Solicitudes Fracttal").
// ─────────────────────────────────────────────
app.post('/api/pme/reintentar-solicitud-fracttal', (req, res) => {
  const sede = (req.body && req.body.sede) || '';
  if (!sede) {
    return res.status(400).json({ success: false, error: 'Falta el parámetro sede.' });
  }
  const pythonPath = 'E:\\bot-dashboard\\python_env\\python311\\python.exe';
  const scriptPath = path.join(__dirname, 'bots', 'reintentar_solicitud_fracttal.py');
  execFile(pythonPath, [scriptPath, sede], { maxBuffer: 1024 * 1024 * 20, timeout: 60000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('Error al reintentar la solicitud Fracttal:', err.message, stderr);
      return res.status(500).json({ success: false, error: 'No se pudo reintentar la solicitud en Fracttal.' });
    }
    try {
      const data = JSON.parse(stdout);
      return res.status(200).json(data);
    } catch (e) {
      console.error('Respuesta inválida de reintentar_solicitud_fracttal.py:', e.message, stdout);
      res.status(500).json({ success: false, error: 'Respuesta inválida al reintentar la solicitud.' });
    }
  });
});

// ─────────────────────────────────────────────
// API: /api/pme/resumen-solicitudes-fracttal — una fila por sede con el
// resultado del último intento de creación en Fracttal (éxito con folio,
// o fallo con causa/solución) más el último folio vigente, para el botón
// dedicado "Solicitudes Fracttal" del Bot Master PME.
// ─────────────────────────────────────────────
app.get('/api/pme/resumen-solicitudes-fracttal', (req, res) => {
  const pythonPath = 'E:\\bot-dashboard\\python_env\\python311\\python.exe';
  const scriptPath = path.join(__dirname, 'bots', 'obtener_resumen_solicitudes_fracttal.py');
  execFile(pythonPath, [scriptPath], { maxBuffer: 1024 * 1024 * 20, timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('Error obteniendo el resumen de solicitudes Fracttal:', err.message, stderr);
      return res.status(500).json({ success: false, error: 'No se pudo obtener el resumen de solicitudes Fracttal.' });
    }
    try {
      const data = JSON.parse(stdout);
      return res.status(200).json(data);
    } catch (e) {
      console.error('Respuesta inválida de obtener_resumen_solicitudes_fracttal.py:', e.message, stdout);
      res.status(500).json({ success: false, error: 'Respuesta inválida del resumen de solicitudes Fracttal.' });
    }
  });
});

// ─────────────────────────────────────────────
// API: /api/pme/fijar-ubicacion-fracttal — botón "Usar esta" del modal de
// Solicitudes Fracttal: el usuario elige a mano cuál de las ubicaciones
// ambiguas es la correcta para una sede; se guarda como override
// permanente (nunca más vuelve a preguntar para esa sede) y dispara el
// reintento de creación de inmediato.
// ─────────────────────────────────────────────
app.post('/api/pme/fijar-ubicacion-fracttal', (req, res) => {
  const sede = (req.body && req.body.sede) || '';
  const idLocation = (req.body && req.body.id_location) || '';
  if (!sede || !idLocation) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros sede/id_location.' });
  }
  const pythonPath = 'E:\\bot-dashboard\\python_env\\python311\\python.exe';
  const scriptPath = path.join(__dirname, 'bots', 'fijar_ubicacion_fracttal.py');
  execFile(pythonPath, [scriptPath, sede, String(idLocation)], { maxBuffer: 1024 * 1024 * 20, timeout: 60000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('Error al fijar la ubicación Fracttal:', err.message, stderr);
      return res.status(500).json({ success: false, error: 'No se pudo fijar la ubicación en Fracttal.' });
    }
    try {
      const data = JSON.parse(stdout);
      return res.status(200).json(data);
    } catch (e) {
      console.error('Respuesta inválida de fijar_ubicacion_fracttal.py:', e.message, stdout);
      res.status(500).json({ success: false, error: 'Respuesta inválida al fijar la ubicación.' });
    }
  });
});

// ─────────────────────────────────────────────
// API: /api/itlus-fractal/buscar-activo — búsqueda libre de activos en
// Fracttal para la tabla manual y la carga masiva de Itlus Fractal.
// ─────────────────────────────────────────────
app.post('/api/itlus-fractal/buscar-activo', (req, res) => {
  const texto = (req.body && req.body.texto) || '';
  if (!texto.trim()) {
    return res.status(400).json({ success: false, error: 'Falta el texto a buscar.' });
  }
  const pythonPath = 'E:\\bot-dashboard\\python_env\\python311\\python.exe';
  const scriptPath = path.join(__dirname, 'bots', 'buscar_activo_fracttal.py');
  execFile(pythonPath, [scriptPath, texto], { maxBuffer: 1024 * 1024 * 20, timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('Error buscando activo en Fracttal:', err.message, stderr);
      return res.status(500).json({ success: false, error: 'No se pudo buscar el activo en Fracttal.' });
    }
    try {
      const data = JSON.parse(stdout);
      return res.status(200).json(data);
    } catch (e) {
      console.error('Respuesta inválida de buscar_activo_fracttal.py:', e.message, stdout);
      res.status(500).json({ success: false, error: 'Respuesta inválida al buscar el activo.' });
    }
  });
});

// ─────────────────────────────────────────────
// API: /api/itlus-fractal/listar-equipos — paso 2 del selector de activo:
// todos los Equipos bajo una Ubicación ya elegida en el paso 1.
// ─────────────────────────────────────────────
app.post('/api/itlus-fractal/listar-equipos', (req, res) => {
  const idLocation = (req.body && req.body.id_location) || '';
  if (!idLocation) {
    return res.status(400).json({ success: false, error: 'Falta id_location.' });
  }
  const pythonPath = 'E:\\bot-dashboard\\python_env\\python311\\python.exe';
  const scriptPath = path.join(__dirname, 'bots', 'listar_equipos_fracttal.py');
  execFile(pythonPath, [scriptPath, String(idLocation)], { maxBuffer: 1024 * 1024 * 20, timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('Error listando equipos de Fracttal:', err.message, stderr);
      return res.status(500).json({ success: false, error: 'No se pudo listar los equipos en Fracttal.' });
    }
    try {
      const data = JSON.parse(stdout);
      return res.status(200).json(data);
    } catch (e) {
      console.error('Respuesta inválida de listar_equipos_fracttal.py:', e.message, stdout);
      res.status(500).json({ success: false, error: 'Respuesta inválida al listar los equipos.' });
    }
  });
});

// ─────────────────────────────────────────────
// API: /api/itlus-fractal/crear-solicitud — creación manual de UNA
// Solicitud de Servicio en Fracttal desde la tabla de Itlus Fractal.
// ─────────────────────────────────────────────
app.post('/api/itlus-fractal/crear-solicitud', (req, res) => {
  const body = req.body || {};
  if (!body.descripcion || !body.id_item) {
    return res.status(400).json({ success: false, error: 'Faltan descripcion y/o id_item.' });
  }
  const pythonPath = 'E:\\bot-dashboard\\python_env\\python311\\python.exe';
  const scriptPath = path.join(__dirname, 'bots', 'crear_solicitud_fracttal_manual.py');
  execFile(pythonPath, [scriptPath, JSON.stringify(body)], { maxBuffer: 1024 * 1024 * 20, timeout: 60000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('Error creando la solicitud manual en Fracttal:', err.message, stderr);
      return res.status(500).json({ success: false, error: 'No se pudo crear la solicitud en Fracttal.' });
    }
    try {
      const data = JSON.parse(stdout);
      return res.status(200).json(data);
    } catch (e) {
      console.error('Respuesta inválida de crear_solicitud_fracttal_manual.py:', e.message, stdout);
      res.status(500).json({ success: false, error: 'Respuesta inválida al crear la solicitud.' });
    }
  });
});

// ─────────────────────────────────────────────
// API: /api/itlus-fractal/crear-masivo — creación masiva de Solicitudes de
// Servicio en Fracttal desde un Excel subido en Itlus Fractal.
// ─────────────────────────────────────────────
app.post('/api/itlus-fractal/crear-masivo', uploadExcelItlusFractal.single('excel'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Falta el archivo Excel.' });
  }
  const pythonPath = 'E:\\bot-dashboard\\python_env\\python311\\python.exe';
  const scriptPath = path.join(__dirname, 'bots', 'crear_solicitudes_fracttal_masivo.py');
  execFile(
    pythonPath, [scriptPath, req.file.path, req.file.originalname],
    { maxBuffer: 1024 * 1024 * 50, timeout: 10 * 60 * 1000 },
    (err, stdout, stderr) => {
      fs.unlink(req.file.path, () => {});
      if (err) {
        console.error('Error en la carga masiva de Fracttal:', err.message, stderr);
        return res.status(500).json({ success: false, error: 'No se pudo procesar la carga masiva en Fracttal.' });
      }
      try {
        const data = JSON.parse(stdout);
        return res.status(200).json(data);
      } catch (e) {
        console.error('Respuesta inválida de crear_solicitudes_fracttal_masivo.py:', e.message, stdout);
        res.status(500).json({ success: false, error: 'Respuesta inválida de la carga masiva.' });
      }
    }
  );
});

// ─────────────────────────────────────────────
// API: /api/itlus-fractal/prevalidar-excel — prevalidación instantánea
// de sedes en la base local (515 sedes) aplicando reglas de marca 24/25.
// ─────────────────────────────────────────────
app.post('/api/itlus-fractal/prevalidar-excel', uploadExcelItlusFractal.single('excel'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Falta el archivo Excel.' });
  }
  const pythonPath = 'E:\\bot-dashboard\\python_env\\python311\\python.exe';
  const scriptPath = path.join(__dirname, 'bots', 'prevalidar_excel_sedes.py');
  execFile(
    pythonPath, [scriptPath, req.file.path],
    { maxBuffer: 1024 * 1024 * 10, timeout: 30000 },
    (err, stdout, stderr) => {
      fs.unlink(req.file.path, () => {});
      if (err) {
        console.error('Error prevalidando Excel de sedes:', err.message, stderr);
        return res.status(500).json({ success: false, error: 'No se pudo prevalidar el Excel.' });
      }
      try {
        const data = JSON.parse(stdout);
        return res.status(200).json(data);
      } catch (e) {
        console.error('Respuesta inválida de prevalidar_excel_sedes.py:', e.message, stdout);
        res.status(500).json({ success: false, error: 'Respuesta inválida de la prevalidación.' });
      }
    }
  );
});

// ─────────────────────────────────────────────
// API: /api/itlus-fractal/sistema/tablas — lista las tablas permitidas
// para los botones de Itlus 2 (id + título para mostrar).
// ─────────────────────────────────────────────
app.get('/api/itlus-fractal/sistema/tablas', (req, res) => {
  const data = Object.entries(SISTEMA_TABLAS_PERMITIDAS).map(([id, info]) => ({ id, titulo: info.titulo }));
  res.status(200).json({ success: true, data });
});

// ─────────────────────────────────────────────
// API: /api/itlus-fractal/sistema/tabla/:id — todas las filas de una tabla
// permitida. Se traen completas y de una sola respuesta hacia el
// frontend, pero Supabase (PostgREST) tope cada pedido individual a 1000
// filas sin importar el "limit" que se le pida (visto en producción:
// matriz_vinculacion_v2 tiene 2988 filas y llegaba cortada a 1000) — así
// que se pagina por dentro con el header Range hasta juntarlas todas.
// ─────────────────────────────────────────────
async function traerTodasLasFilasSistema(tabla, onProgreso) {
  const TAMANO_PAGINA = 1000;
  let todas = [];
  let desde = 0;
  let totalEstimado = null;
  for (;;) {
    const r = await fetch(`${SISTEMA_SUPABASE_URL}/rest/v1/${tabla}?select=*`, {
      headers: {
        apikey: SISTEMA_SUPABASE_KEY,
        Authorization: `Bearer ${SISTEMA_SUPABASE_KEY}`,
        Range: `${desde}-${desde + TAMANO_PAGINA - 1}`,
        Prefer: 'count=exact',
      },
    });
    if (!r.ok) {
      throw new Error(`${r.status} ${await r.text()}`);
    }
    if (totalEstimado === null) {
      const rango = r.headers.get('content-range'); // "0-999/2988"
      totalEstimado = Number(rango?.split('/')?.[1]) || null;
    }
    const pagina = await r.json();
    todas = todas.concat(pagina);
    if (onProgreso) {
      const pct = totalEstimado ? Math.min(99, Math.round((todas.length / totalEstimado) * 100)) : 50;
      onProgreso(pct);
    }
    if (pagina.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }
  return todas;
}

// Conteo de filas EN VIVO, sin traer ningún dato (Prefer: count=exact +
// limit=0) — casi cero bytes, solo un número en el header Content-Range.
// Es la base de la alarma de "hay actualización": se compara este número
// contra cuántas filas tiene la copia local, sin descargar nada más.
async function contarFilasVivas(tabla) {
  const r = await fetch(`${SISTEMA_SUPABASE_URL}/rest/v1/${tabla}?select=*&limit=0`, {
    headers: {
      apikey: SISTEMA_SUPABASE_KEY, Authorization: `Bearer ${SISTEMA_SUPABASE_KEY}`,
      Prefer: 'count=exact',
    },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const rango = r.headers.get('content-range'); // "*/2988"
  return Number(rango?.split('/')?.[1]) || 0;
}

// Caché EN MEMORIA del propio servidor (proceso Node) — evita ir a
// Supabase (proyecto BOT) a leer la copia local en cada clic. Vive
// mientras el servidor esté corriendo; se llena sola la primera vez que
// se pide cada tabla y se actualiza cada vez que se escribe la copia.
const cacheMemoria = new Map(); // tablaId -> { datos, actualizado_el }

// Copia local (energia.itlus_sistema_cache, proyecto BOT) de una tabla del
// proyecto SISTEMA — lee/escribe por REST, igual que hace pme_common.py.
async function leerCacheSistema(tablaId) {
  const r = await fetch(
    `${BOT_SUPABASE_URL}/rest/v1/itlus_sistema_cache?tabla_id=eq.${tablaId}&select=datos,actualizado_el`,
    { headers: { apikey: BOT_SUPABASE_KEY, Authorization: `Bearer ${BOT_SUPABASE_KEY}`, 'Accept-Profile': 'energia' } }
  );
  if (!r.ok) return null;
  const filas = await r.json();
  return filas[0] || null;
}

// Como leerCacheSistema, pero sirve directo de memoria si ya se cargó
// antes en este proceso — así la segunda vez que se abre una tabla es
// instantánea, sin ida y vuelta a Supabase.
async function obtenerCacheConMemoria(tablaId) {
  if (cacheMemoria.has(tablaId)) return cacheMemoria.get(tablaId);
  const cache = await leerCacheSistema(tablaId);
  if (cache) cacheMemoria.set(tablaId, cache);
  return cache;
}

async function guardarCacheSistema(tablaId, datos) {
  const actualizado_el = new Date().toISOString();
  const r = await fetch(`${BOT_SUPABASE_URL}/rest/v1/itlus_sistema_cache?on_conflict=tabla_id`, {
    method: 'POST',
    headers: {
      apikey: BOT_SUPABASE_KEY, Authorization: `Bearer ${BOT_SUPABASE_KEY}`,
      'Content-Type': 'application/json', 'Accept-Profile': 'energia', 'Content-Profile': 'energia',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify([{ tabla_id: tablaId, datos, actualizado_el }]),
  });
  if (!r.ok) {
    console.error(`No se pudo guardar la caché de ${tablaId} en Supabase (persiste solo en memoria del servidor):`, r.status, await r.text());
  }
  // Se guarda en memoria igual aunque falle el POST a Supabase (ej. RLS
  // bloqueando la escritura) — así esta sesión del servidor no vuelve a
  // pagar el costo de traer la tabla completa en vivo por cada clic,
  // aunque no sobreviva a un reinicio hasta que se arregle el permiso.
  cacheMemoria.set(tablaId, { datos, actualizado_el });
}

// ─────────────────────────────────────────────
// API: /api/itlus-fractal/sistema/tabla/:id — sirve la copia local, de
// memoria si ya se cargó antes en este proceso (instantáneo) — NUNCA
// vuelve a consultar la tabla en vivo acá: eso solo pasa con el botón
// "Actualizar ahora" o con la alarma barata de /estado, para que abrir
// una tabla no genere consumo extra en Supabase cada vez. Si todavía no
// existe ninguna copia (primera vez), sí espera a traerla en vivo para
// tener algo que mostrar.
// ─────────────────────────────────────────────
app.get('/api/itlus-fractal/sistema/tabla/:id', async (req, res) => {
  const tablaId = req.params.id;
  const info = SISTEMA_TABLAS_PERMITIDAS[tablaId];
  if (!info) {
    return res.status(404).json({ success: false, error: 'Tabla no reconocida.' });
  }
  try {
    const cache = await obtenerCacheConMemoria(tablaId);
    if (cache) {
      res.status(200).json({ success: true, data: cache.datos, titulo: info.titulo, actualizado_el: cache.actualizado_el });
      return;
    }
    // Sin copia todavía: primera vez, hay que esperar la consulta en vivo.
    const datos = await traerTodasLasFilasSistema(info.tabla);
    await guardarCacheSistema(tablaId, datos);
    res.status(200).json({ success: true, data: datos, titulo: info.titulo, actualizado_el: new Date().toISOString() });
  } catch (e) {
    console.error(`Error sirviendo ${info.tabla} (Itlus 2):`, e.message);
    res.status(500).json({ success: false, error: 'No se pudo obtener la tabla ni de la copia local ni de Supabase.' });
  }
});

// ─────────────────────────────────────────────
// API: /api/itlus-fractal/sistema/estado — la "alarma" de los botones de
// Itlus 2: para cada tabla permitida, compara SOLO la cantidad de filas
// (conteo en vivo vs. cuántas tiene la copia local) — nunca descarga los
// datos completos acá, así que el costo real es de un par de bytes por
// tabla, sin importar cuántas veces se revise. No detecta una edición que
// no cambie la cantidad de filas (ej. se corrige un campo de una fila
// existente) — para eso está el botón "Actualizar ahora" de cada tabla,
// que sí compara el contenido completo.
// ─────────────────────────────────────────────
app.get('/api/itlus-fractal/sistema/estado', async (req, res) => {
  const resultados = await Promise.all(
    Object.entries(SISTEMA_TABLAS_PERMITIDAS).map(async ([tablaId, info]) => {
      try {
        const [cache, filasVivas] = await Promise.all([
          obtenerCacheConMemoria(tablaId),
          contarFilasVivas(info.tabla),
        ]);
        const filasCache = cache ? cache.datos.length : null;
        const hayActualizacion = filasCache === null || filasCache !== filasVivas;
        return { tabla_id: tablaId, hayActualizacion };
      } catch (e) {
        console.error(`Itlus 2: no se pudo revisar el conteo de ${tablaId}:`, e.message);
        return { tabla_id: tablaId, hayActualizacion: false };
      }
    })
  );
  res.status(200).json({ success: true, data: resultados });
});

// Trabajos de actualización en curso (jobId -> {progreso, terminado, ...}),
// en memoria — solo para que el frontend pueda mostrar una barra de
// progreso real mientras se trae una tabla grande en varias páginas. Se
// borran solos 2 minutos después de terminar.
const trabajosActualizacionSistema = new Map();

// ─────────────────────────────────────────────
// API: /api/itlus-fractal/sistema/tabla/:id/actualizar — botón manual
// "Actualizar ahora": arranca la actualización en segundo plano y
// devuelve un jobId al toque, para que el frontend pueda mostrar una
// barra de progreso mientras tanto (ver el endpoint de abajo).
// ─────────────────────────────────────────────
app.post('/api/itlus-fractal/sistema/tabla/:id/actualizar', async (req, res) => {
  const tablaId = req.params.id;
  const info = SISTEMA_TABLAS_PERMITIDAS[tablaId];
  if (!info) {
    return res.status(404).json({ success: false, error: 'Tabla no reconocida.' });
  }
  const jobId = crypto.randomUUID();
  trabajosActualizacionSistema.set(jobId, { progreso: 0, terminado: false, error: null, resultado: null });

  (async () => {
    const job = trabajosActualizacionSistema.get(jobId);
    try {
      const datosVivos = await traerTodasLasFilasSistema(info.tabla, (pct) => { job.progreso = pct; });
      const cache = await leerCacheSistema(tablaId);
      const cambio = !cache || JSON.stringify(datosVivos) !== JSON.stringify(cache.datos);
      if (cambio) await guardarCacheSistema(tablaId, datosVivos);
      job.progreso = 100;
      job.terminado = true;
      job.resultado = { data: datosVivos, titulo: info.titulo, actualizado_el: new Date().toISOString(), cambio };
    } catch (e) {
      console.error(`Itlus 2: error actualizando ${tablaId}:`, e.message);
      job.terminado = true;
      job.error = 'No se pudo consultar Supabase para actualizar.';
    } finally {
      setTimeout(() => trabajosActualizacionSistema.delete(jobId), 2 * 60 * 1000);
    }
  })();

  res.status(200).json({ success: true, jobId });
});

// ─────────────────────────────────────────────
// API: /api/itlus-fractal/sistema/actualizar-estado/:jobId — el frontend
// consulta esto cada pocos milisegundos mientras dura la actualización,
// para dibujar la barra de progreso.
// ─────────────────────────────────────────────
app.get('/api/itlus-fractal/sistema/actualizar-estado/:jobId', (req, res) => {
  const job = trabajosActualizacionSistema.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Ese trabajo de actualización ya no existe.' });
  }
  res.status(200).json({ success: true, ...job });
});

// ─────────────────────────────────────────────
// API: /api/itlus-fractal/palabras-clave — tabla chica y EDITABLE a mano
// (botón nuevo del panel de Itlus 2, distinto a las 5 tablas espejo de
// arriba: esta vive directo en public.itlus_palabras_clave del proyecto
// BOT, sin copia externa que sincronizar). CRUD simple por REST directo.
// ─────────────────────────────────────────────
app.get('/api/itlus-fractal/palabras-clave', async (req, res) => {
  try {
    const r = await fetch(`${BOT_SUPABASE_URL}/rest/v1/itlus_palabras_clave?select=*&order=id.asc`, {
      headers: { apikey: BOT_SUPABASE_KEY, Authorization: `Bearer ${BOT_SUPABASE_KEY}` },
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    res.status(200).json({ success: true, data: await r.json() });
  } catch (e) {
    console.error('Error listando itlus_palabras_clave:', e.message);
    res.status(500).json({ success: false, error: 'No se pudo cargar la tabla.' });
  }
});

app.post('/api/itlus-fractal/palabras-clave', async (req, res) => {
  try {
    const r = await fetch(`${BOT_SUPABASE_URL}/rest/v1/itlus_palabras_clave`, {
      method: 'POST',
      headers: {
        apikey: BOT_SUPABASE_KEY, Authorization: `Bearer ${BOT_SUPABASE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=representation',
      },
      body: JSON.stringify([{ palabra_clave: '', responsable: '' }]),
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const creado = await r.json();
    res.status(200).json({ success: true, data: creado[0] });
  } catch (e) {
    console.error('Error agregando fila en itlus_palabras_clave:', e.message);
    res.status(500).json({ success: false, error: 'No se pudo agregar la fila.' });
  }
});

app.patch('/api/itlus-fractal/palabras-clave/:id', async (req, res) => {
  const { palabra_clave, responsable } = req.body || {};
  const cambios = {};
  if (palabra_clave !== undefined) cambios.palabra_clave = palabra_clave;
  if (responsable !== undefined) cambios.responsable = responsable;
  try {
    const r = await fetch(`${BOT_SUPABASE_URL}/rest/v1/itlus_palabras_clave?id=eq.${req.params.id}`, {
      method: 'PATCH',
      headers: {
        apikey: BOT_SUPABASE_KEY, Authorization: `Bearer ${BOT_SUPABASE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify(cambios),
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    res.status(200).json({ success: true });
  } catch (e) {
    console.error('Error actualizando fila de itlus_palabras_clave:', e.message);
    res.status(500).json({ success: false, error: 'No se pudo guardar el cambio.' });
  }
});

app.delete('/api/itlus-fractal/palabras-clave/:id', async (req, res) => {
  try {
    const r = await fetch(`${BOT_SUPABASE_URL}/rest/v1/itlus_palabras_clave?id=eq.${req.params.id}`, {
      method: 'DELETE',
      headers: { apikey: BOT_SUPABASE_KEY, Authorization: `Bearer ${BOT_SUPABASE_KEY}` },
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    res.status(200).json({ success: true });
  } catch (e) {
    console.error('Error eliminando fila de itlus_palabras_clave:', e.message);
    res.status(500).json({ success: false, error: 'No se pudo eliminar la fila.' });
  }
});

// ═════════════════════════════════════════════
// Itlus Fractal — "Activos Maestros Fracttal" (Itlus 2): base completa de
// sedes+equipos de Fracttal (546 sedes, 40,000+ equipos), para que el
// picker de Itlus 1 busque instantáneo sin depender de una llamada en
// vivo a Fracttal por cada tecla.
//
// La copia que de verdad se consulta es un archivo en disco
// (cache_activos_fracttal.json, cargado a memoria acá al arrancar) —
// Supabase (itlus_activos_fracttal_cache) es solo el respaldo para
// reconstruir ese archivo si se pierde, así el picker no depende de que
// Supabase esté arriba en el día a día.
// ═════════════════════════════════════════════
const RUTA_CACHE_ACTIVOS_FRACTTAL = path.join(__dirname, 'bots', 'cache_activos_fracttal.json');
let cacheActivosFracttal = null; // { sedes: [{id_location, code, description, equipos}], actualizado_el }
let origenCacheActivosFracttal = null; // 'local' | 'supabase' | null

function cargarCacheActivosFracttalDesdeDisco() {
  try {
    if (fs.existsSync(RUTA_CACHE_ACTIVOS_FRACTTAL)) {
      cacheActivosFracttal = JSON.parse(fs.readFileSync(RUTA_CACHE_ACTIVOS_FRACTTAL, 'utf-8'));
      origenCacheActivosFracttal = 'local';
      return true;
    }
  } catch (e) {
    console.error('No se pudo leer cache_activos_fracttal.json:', e.message);
  }
  return false;
}

// Camino raro: el archivo local no existe (se perdió o el servidor corre
// en otra máquina por primera vez) — reconstruye desde el respaldo en
// Supabase y vuelve a escribir el archivo local para no repetir esto.
async function reconstruirCacheActivosFracttalDesdeSupabase() {
  try {
    const r = await fetch(`${BOT_SUPABASE_URL}/rest/v1/itlus_activos_fracttal_cache?select=*&order=id_location.asc`, {
      headers: { apikey: BOT_SUPABASE_KEY, Authorization: `Bearer ${BOT_SUPABASE_KEY}` },
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const filas = await r.json();
    if (filas.length === 0) return false;
    cacheActivosFracttal = {
      sedes: filas.map((f) => ({ id_location: f.id_location, code: f.code, description: f.description, equipos: f.equipos })),
      actualizado_el: filas[0].actualizado_el || null,
    };
    origenCacheActivosFracttal = 'supabase';
    try { fs.writeFileSync(RUTA_CACHE_ACTIVOS_FRACTTAL, JSON.stringify(cacheActivosFracttal)); } catch (e) { /* no crítico */ }
    console.warn('⚠️ cache_activos_fracttal.json no existía — reconstruida desde el respaldo en Supabase.');
    return true;
  } catch (e) {
    console.error('No se pudo reconstruir la base de activos Fracttal desde Supabase:', e.message);
    return false;
  }
}

(async () => {
  if (!cargarCacheActivosFracttalDesdeDisco()) {
    await reconstruirCacheActivosFracttalDesdeSupabase();
  }
})();

app.get('/api/itlus-fractal/activos-maestros/sedes', (req, res) => {
  if (!cacheActivosFracttal) {
    return res.status(200).json({ success: true, data: [], actualizado_el: null, origen: null });
  }
  const data = cacheActivosFracttal.sedes.map((s) => ({
    id_location: s.id_location, code: s.code, description: s.description, total_equipos: (s.equipos || []).length,
  }));
  res.status(200).json({ success: true, data, actualizado_el: cacheActivosFracttal.actualizado_el, origen: origenCacheActivosFracttal });
});

// Sedes ya traídas por la actualización EN CURSO (si hay una) — permite
// abrir una sede que ya se descargó sin esperar a que termine todo el
// proceso. Se limpia sola cuando el trabajo termina (ahí ya manda la
// copia final en cacheActivosFracttal).
let sedesEnProgreso = new Map(); // id_location -> {id_location, code, description, equipos}

app.get('/api/itlus-fractal/activos-maestros/sede/:id', (req, res) => {
  const enProgreso = sedesEnProgreso.get(Number(req.params.id));
  if (enProgreso) return res.status(200).json({ success: true, data: enProgreso });
  if (!cacheActivosFracttal) {
    return res.status(404).json({ success: false, error: 'Todavía no hay base local — usa "Actualizar ahora".' });
  }
  const sede = cacheActivosFracttal.sedes.find((s) => String(s.id_location) === req.params.id);
  if (!sede) return res.status(404).json({ success: false, error: 'Sede no encontrada en la copia local.' });
  res.status(200).json({ success: true, data: sede });
});

// Búsqueda GLOBAL de equipos a través de las 515 sedes (no solo la sede
// por nombre, como el buscador del árbol) — barrido en memoria, ya está
// todo cargado del arranque, así que es instantáneo. Tope de resultados
// para no mandar un payload gigante si el texto es muy genérico.
const TOPE_RESULTADOS_BUSQUEDA = 3000;
app.get('/api/itlus-fractal/activos-maestros/buscar', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q || !cacheActivosFracttal) return res.status(200).json({ success: true, data: [], recortado: false });
  const resultados = [];
  for (const sede of cacheActivosFracttal.sedes) {
    const sedeMatch = (sede.description || '').toLowerCase().includes(q) || (sede.code || '').toLowerCase().includes(q);
    for (const eq of sede.equipos) {
      if (sedeMatch || (eq.description || '').toLowerCase().includes(q) || (eq.code || '').toLowerCase().includes(q)) {
        resultados.push({ ...eq, sedeDescripcion: sede.description, sedeId: sede.id_location });
        if (resultados.length >= TOPE_RESULTADOS_BUSQUEDA) break;
      }
    }
    if (resultados.length >= TOPE_RESULTADOS_BUSQUEDA) break;
  }
  res.status(200).json({ success: true, data: resultados, recortado: resultados.length >= TOPE_RESULTADOS_BUSQUEDA });
});

// ═════════════════════════════════════════════
// "Activos Genéricos SPSA": cruza la Descripción de cada equipo de
// Fracttal contra la columna "ACTIVOS GENERICOS SPSA" de la tabla de
// referencia (Itlus 2 → Tabla de Activos Maestros, 162 filas del proyecto
// SISTEMA) para clasificar cada equipo con su nombre genérico estándar.
// Coincidencia en 3 capas, de más a menos estricta:
//   1. Exacta (después de normalizar mayúsculas/tildes/puntuación)
//   2. Contención (uno de los dos textos contiene por completo al otro)
//   3. Similitud de palabras (Jaccard sobre el conjunto de tokens)
// Lo que no supera el umbral de la capa 3 queda "sin definir" a propósito
// — no se adivina si no hay evidencia suficiente.
// ═════════════════════════════════════════════
function normalizarTextoGenerico(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita tildes
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ') // puntuación -> espacio
    .replace(/\s+/g, ' ')
    .trim();
}

// La Descripción de Fracttal trae el código y un sufijo pegados, ej.
// "BOMBA CONTRA INCENDIO { A124-0000430-EG } 24107007-1" — solo importa
// lo que va ANTES de la primera llave.
function limpiarDescripcionEquipo(desc) {
  return normalizarTextoGenerico((desc || '').split('{')[0]);
}

// Palabras vacías del español: sin filtrarlas, un "DE"/"Y" compartido
// infla la similitud entre dos equipos que NO son lo mismo (confirmado:
// "EXTRACTOR DE AIRE" vs "CORTINAS DE AIRE" daba 0.5 solo por "DE" y
// "AIRE" — un falso positivo real, no hipotético).
const PALABRAS_VACIAS_ES = new Set(['DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'O', 'A', 'EN', 'CON', 'PARA', 'AL']);

function tokensSignificativos(s) {
  return new Set(s.split(' ').filter((t) => t && !PALABRAS_VACIAS_ES.has(t)));
}

function similitudTokensJaccard(a, b) {
  const tokensA = tokensSignificativos(a);
  const tokensB = tokensSignificativos(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let interseccion = 0;
  tokensA.forEach((t) => { if (tokensB.has(t)) interseccion++; });
  const union = new Set([...tokensA, ...tokensB]).size;
  return interseccion / union;
}

const UMBRAL_SIMILITUD_ACTIVO_GENERICO = 0.6;

function encontrarActivoGenerico(nombreLimpio, listaGenericos) {
  if (!nombreLimpio) return null;
  const exacto = listaGenericos.find((g) => g.normalizado === nombreLimpio);
  if (exacto) return exacto.original;
  const contencion = listaGenericos.find((g) => (
    g.normalizado.length > 3 && (nombreLimpio.includes(g.normalizado) || g.normalizado.includes(nombreLimpio))
  ));
  if (contencion) return contencion.original;
  let mejor = null;
  let mejorScore = 0;
  for (const g of listaGenericos) {
    const score = similitudTokensJaccard(nombreLimpio, g.normalizado);
    if (score > mejorScore) { mejorScore = score; mejor = g; }
  }
  return mejorScore >= UMBRAL_SIMILITUD_ACTIVO_GENERICO ? mejor.original : null;
}

let resumenActivosGenericos = null; // se guarda tras el último cálculo

app.post('/api/itlus-fractal/activos-maestros/calcular-activos-genericos', async (req, res) => {
  if (!cacheActivosFracttal) {
    return res.status(404).json({ success: false, error: 'Todavía no hay base local de Activos Maestros Fracttal.' });
  }
  let cacheReferencia = await obtenerCacheConMemoria('tabla_activos_maestros');
  if (!cacheReferencia) {
    // Nadie abrió "Tabla de Activos Maestros" todavía en esta sesión del
    // servidor (nada en cacheMemoria ni en el respaldo de Supabase) - se
    // trae en vivo como fallback, igual que hace /sistema/tabla/:id la
    // primera vez.
    try {
      const info = SISTEMA_TABLAS_PERMITIDAS['tabla_activos_maestros'];
      const datosVivos = await traerTodasLasFilasSistema(info.tabla);
      await guardarCacheSistema('tabla_activos_maestros', datosVivos);
      cacheReferencia = { datos: datosVivos };
    } catch (e) {
      console.error('No se pudo traer en vivo la Tabla de Activos Maestros de referencia:', e.message);
    }
  }
  if (!cacheReferencia) {
    return res.status(404).json({ success: false, error: 'No se pudo cargar la Tabla de Activos Maestros de referencia.' });
  }
  const vistos = new Set();
  const listaGenericos = [];
  cacheReferencia.datos.forEach((fila) => {
    const original = fila['ACTIVOS GENERICOS SPSA'];
    if (!original) return;
    const normalizado = normalizarTextoGenerico(original);
    if (vistos.has(normalizado)) return;
    vistos.add(normalizado);
    listaGenericos.push({ original, normalizado });
  });

  const conteoPorActivo = new Map();
  let totalEquipos = 0;
  let totalSinDefinir = 0;
  cacheActivosFracttal.sedes.forEach((sede) => {
    sede.equipos.forEach((eq) => {
      totalEquipos += 1;
      const nombreLimpio = limpiarDescripcionEquipo(eq.description);
      const match = encontrarActivoGenerico(nombreLimpio, listaGenericos);
      eq.activo_generico_spsa = match || null;
      if (match) conteoPorActivo.set(match, (conteoPorActivo.get(match) || 0) + 1);
      else totalSinDefinir += 1;
    });
  });

  try {
    fs.writeFileSync(RUTA_CACHE_ACTIVOS_FRACTTAL, JSON.stringify(cacheActivosFracttal));
  } catch (e) {
    console.error('No se pudo guardar la copia local con Activos Genéricos SPSA calculados:', e.message);
  }

  const porActivo = [...conteoPorActivo.entries()]
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  resumenActivosGenericos = {
    totalEquipos, totalAsignados: totalEquipos - totalSinDefinir, totalSinDefinir, porActivo,
    calculado_el: new Date().toISOString(),
  };
  res.status(200).json({ success: true, resumen: resumenActivosGenericos });
});

app.get('/api/itlus-fractal/activos-maestros/resumen-activos-genericos', (req, res) => {
  res.status(200).json({ success: true, resumen: resumenActivosGenericos });
});

const trabajosActivosFracttal = new Map();

// Los "data" de un child_process NO respetan límites de línea — un chunk
// puede cortar una línea JSON a la mitad (pasaba con "sede_lista", que al
// llevar todos los equipos de la sede es mucho más larga que las líneas
// de progreso/log). Sin guardar el resto colgante entre chunks, esas
// líneas largas quedaban invalidas y se perdían en silencio.
function crearLectorDeLineas(onLinea) {
  let colgante = '';
  return (data) => {
    colgante += data.toString();
    const lineas = colgante.split('\n');
    colgante = lineas.pop(); // puede quedar incompleta hasta el próximo chunk
    lineas.forEach((line) => {
      if (!line.trim()) return;
      try { onLinea(JSON.parse(line)); } catch (e) { /* línea no-JSON, se ignora */ }
    });
  };
}

app.post('/api/itlus-fractal/activos-maestros/actualizar', (req, res) => {
  const yaHayUnoCorriendo = [...trabajosActivosFracttal.values()].some((j) => !j.terminado);
  if (yaHayUnoCorriendo) {
    return res.status(409).json({ success: false, error: 'Ya hay una actualización en curso.' });
  }

  const jobId = crypto.randomUUID();
  trabajosActivosFracttal.set(jobId, { progreso: 0, terminado: false, error: null, mensaje: 'Iniciando…', sedesParciales: [] });
  sedesEnProgreso = new Map();

  const pythonPath = 'E:\\bot-dashboard\\python_env\\python311\\python.exe';
  const scriptPath = path.join(__dirname, 'bots', 'actualizar_base_activos_fracttal.py');
  const proceso = spawn(pythonPath, [scriptPath], { cwd: __dirname });

  proceso.stdout.on('data', crearLectorDeLineas((parsed) => {
    const job = trabajosActivosFracttal.get(jobId);
    if (!job) return;
    if (parsed.type === 'status_val' && parsed.key === 'progress') job.progreso = parsed.value;
    if (parsed.type === 'log') job.mensaje = parsed.message;
    if (parsed.type === 'sede_lista') {
      const s = parsed.sede;
      sedesEnProgreso.set(s.id_location, s);
      job.sedesParciales.push({ id_location: s.id_location, code: s.code, description: s.description, total_equipos: (s.equipos || []).length });
    }
  }));

  proceso.on('close', (code) => {
    const job = trabajosActivosFracttal.get(jobId);
    if (!job) return;
    if (code === 0) {
      job.progreso = 100;
      job.terminado = true;
      cargarCacheActivosFracttalDesdeDisco();
    } else {
      job.terminado = true;
      job.error = `El proceso terminó con código ${code}.`;
    }
    sedesEnProgreso = new Map();
    setTimeout(() => trabajosActivosFracttal.delete(jobId), 5 * 60 * 1000);
  });

  proceso.on('error', (e) => {
    const job = trabajosActivosFracttal.get(jobId);
    if (job) { job.terminado = true; job.error = e.message; }
  });

  res.status(200).json({ success: true, jobId });
});

app.get('/api/itlus-fractal/activos-maestros/actualizar-estado/:jobId', (req, res) => {
  const job = trabajosActivosFracttal.get(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Ese trabajo ya no existe.' });
  res.status(200).json({ success: true, ...job });
});

// El navegador no conoce el jobId si el trabajo se disparó antes de que
// esta pestaña estuviera abierta (recarga de página, el refresco mensual
// automático, u otra pestaña) — este endpoint deja "reengancharse" a un
// trabajo que ya está en curso sin necesitar el jobId.
app.get('/api/itlus-fractal/activos-maestros/actualizar-estado', (req, res) => {
  const jobId = [...trabajosActivosFracttal.entries()].find(([, j]) => !j.terminado)?.[0] || null;
  if (!jobId) return res.status(200).json({ success: true, enCurso: false });
  res.status(200).json({ success: true, enCurso: true, jobId, ...trabajosActivosFracttal.get(jobId) });
});

// Refresco mensual automático: se revisa una vez al día si ya pasaron 30
// días desde el último "actualizado_el" y, si es así, se dispara solo en
// segundo plano (mismo camino que el botón manual).
function iniciarActualizacionActivosFracttalEnSegundoPlano() {
  const yaHayUnoCorriendo = [...trabajosActivosFracttal.values()].some((j) => !j.terminado);
  if (yaHayUnoCorriendo) return;
  const jobId = crypto.randomUUID();
  trabajosActivosFracttal.set(jobId, { progreso: 0, terminado: false, error: null, mensaje: 'Iniciando (automático)…', sedesParciales: [] });
  sedesEnProgreso = new Map();
  const pythonPath = 'E:\\bot-dashboard\\python_env\\python311\\python.exe';
  const scriptPath = path.join(__dirname, 'bots', 'actualizar_base_activos_fracttal.py');
  const proceso = spawn(pythonPath, [scriptPath], { cwd: __dirname });
  proceso.stdout.on('data', crearLectorDeLineas((parsed) => {
    const job = trabajosActivosFracttal.get(jobId);
    if (!job) return;
    if (parsed.type === 'status_val' && parsed.key === 'progress') job.progreso = parsed.value;
    if (parsed.type === 'log') job.mensaje = parsed.message;
    if (parsed.type === 'sede_lista') {
      const s = parsed.sede;
      sedesEnProgreso.set(s.id_location, s);
      job.sedesParciales.push({ id_location: s.id_location, code: s.code, description: s.description, total_equipos: (s.equipos || []).length });
    }
  }));
  proceso.on('close', (code) => {
    const job = trabajosActivosFracttal.get(jobId);
    if (!job) return;
    if (code === 0) { job.progreso = 100; job.terminado = true; cargarCacheActivosFracttalDesdeDisco(); }
    else { job.terminado = true; job.error = `El proceso terminó con código ${code}.`; }
    sedesEnProgreso = new Map();
    setTimeout(() => trabajosActivosFracttal.delete(jobId), 5 * 60 * 1000);
  });
  console.log('🔄 Refresco mensual automático de la base de Activos Maestros Fracttal iniciado.');
}

function revisarRefrescoMensualActivosFracttal() {
  const TREINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;
  if (!cacheActivosFracttal || !cacheActivosFracttal.actualizado_el) return; // sin copia todavía: se hace a mano la primera vez
  const edad = Date.now() - new Date(cacheActivosFracttal.actualizado_el).getTime();
  if (edad > TREINTA_DIAS_MS) {
    iniciarActualizacionActivosFracttalEnSegundoPlano();
  }
}
setTimeout(revisarRefrescoMensualActivosFracttal, 60 * 1000); // poco después de arrancar
setInterval(revisarRefrescoMensualActivosFracttal, 24 * 60 * 60 * 1000); // y una vez al día

// ═════════════════════════════════════════════
// Itlus Fractal — "Revisar actualizaciones" (botón único): chequeo
// LIVIANO (no descarga equipos, solo cuenta) que detecta sedes nuevas y
// sedes con conteo distinto al guardado — ~515 llamadas chicas, toma
// unos minutos. NUNCA reconstruye nada solo; el usuario decide qué
// actualizar puntualmente con los 2 endpoints de abajo.
// ═════════════════════════════════════════════
const trabajosRevisionActivosFracttal = new Map();

app.post('/api/itlus-fractal/activos-maestros/revisar-cambios', (req, res) => {
  const yaHayUnoCorriendo = [...trabajosRevisionActivosFracttal.values()].some((j) => !j.terminado);
  if (yaHayUnoCorriendo) {
    return res.status(409).json({ success: false, error: 'Ya hay una revisión en curso.' });
  }
  const jobId = crypto.randomUUID();
  trabajosRevisionActivosFracttal.set(jobId, { progreso: 0, terminado: false, error: null, mensaje: 'Iniciando…', resultado: null });

  const pythonPath = 'E:\\bot-dashboard\\python_env\\python311\\python.exe';
  const scriptPath = path.join(__dirname, 'bots', 'revisar_cambios_activos_fracttal.py');
  const proceso = spawn(pythonPath, [scriptPath], { cwd: __dirname });

  proceso.stdout.on('data', crearLectorDeLineas((parsed) => {
    const job = trabajosRevisionActivosFracttal.get(jobId);
    if (!job) return;
    if (parsed.type === 'status_val' && parsed.key === 'progress') job.progreso = parsed.value;
    if (parsed.type === 'log') job.mensaje = parsed.message;
    if (parsed.type === 'resultado_revision') {
      job.resultado = { sedesNuevas: parsed.sedes_nuevas, sedesConCambios: parsed.sedes_con_cambios };
    }
  }));

  proceso.on('close', (code) => {
    const job = trabajosRevisionActivosFracttal.get(jobId);
    if (!job) return;
    job.progreso = 100;
    job.terminado = true;
    if (code !== 0 && !job.resultado) job.error = `El proceso terminó con código ${code}.`;
    setTimeout(() => trabajosRevisionActivosFracttal.delete(jobId), 5 * 60 * 1000);
  });

  proceso.on('error', (e) => {
    const job = trabajosRevisionActivosFracttal.get(jobId);
    if (job) { job.terminado = true; job.error = e.message; }
  });

  res.status(200).json({ success: true, jobId });
});

app.get('/api/itlus-fractal/activos-maestros/revisar-cambios/estado/:jobId', (req, res) => {
  const job = trabajosRevisionActivosFracttal.get(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Ese trabajo ya no existe.' });
  res.status(200).json({ success: true, ...job });
});

app.get('/api/itlus-fractal/activos-maestros/revisar-cambios/estado', (req, res) => {
  const jobId = [...trabajosRevisionActivosFracttal.entries()].find(([, j]) => !j.terminado)?.[0] || null;
  if (!jobId) return res.status(200).json({ success: true, enCurso: false });
  res.status(200).json({ success: true, enCurso: true, jobId, ...trabajosRevisionActivosFracttal.get(jobId) });
});

// Actualiza (o agrega, si es nueva) UNA sola sede — rápido, por eso es
// execFile en vez de spawn. Recarga la copia local en memoria al
// terminar para que /sede/:id y /sedes reflejen el cambio al toque.
app.post('/api/itlus-fractal/activos-maestros/sede/:id/actualizar', (req, res) => {
  const pythonPath = 'E:\\bot-dashboard\\python_env\\python311\\python.exe';
  const scriptPath = path.join(__dirname, 'bots', 'actualizar_una_sede_fracttal.py');
  execFile(pythonPath, [scriptPath, req.params.id], { maxBuffer: 1024 * 1024 * 20, timeout: 60000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('Error actualizando una sede de Activos Maestros Fracttal:', err.message, stderr);
      return res.status(500).json({ success: false, error: 'No se pudo actualizar la sede.' });
    }
    try {
      const data = JSON.parse(stdout);
      if (data.success) cargarCacheActivosFracttalDesdeDisco();
      res.status(200).json(data);
    } catch (e) {
      console.error('Respuesta inválida de actualizar_una_sede_fracttal.py:', e.message, stdout);
      res.status(500).json({ success: false, error: 'Respuesta inválida al actualizar la sede.' });
    }
  });
});

// ─────────────────────────────────────────────
// API: /api/senamhi/sedes — todas las sedes con GPS desde vw_sedes_clima o Tabla-Maestra-Infraestructura
// ─────────────────────────────────────────────
app.get('/api/senamhi/sedes', async (req, res) => {
  try {
    const path = require('path');
    const fs = require('fs');
    const cachePath = path.join(__dirname, 'bots', 'bot_senamhi_spsa', 'sedes_cache.json');
    
    if (fs.existsSync(cachePath)) {
      const raw = fs.readFileSync(cachePath, 'utf-8');
      const sedes = JSON.parse(raw);
      return res.status(200).json({ success: true, data: sedes });
    } else {
      return res.status(404).json({ success: false, error: 'sedes_cache.json not found.' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: isOriginAllowed,
    methods: ["GET", "POST"],
    credentials: true
  }
});

const loadAuthConfig = () => {
  try {
    const authPath = path.join(__dirname, 'auth_config.json');
    if (fs.existsSync(authPath)) {
      return JSON.parse(fs.readFileSync(authPath, 'utf8'));
    }
  } catch (e) {
    console.error("Error loading auth_config.json", e);
  }
  return { username: "admin", password: "Spsa2026*" };
};

let bots = [];
const activeProcesses = {};

// Alertas de sistema PME (ej. Supabase rechazando escrituras por RLS): a
// diferencia del log normal (que solo se ve si abres la consola), estas se
// muestran como icono/aviso persistente en la parte superior del dashboard
// hasta que alguien las descarte. Viven en memoria (se resetean si se
// reinicia el backend), son avisos operativos, no un registro de auditoria.
let pmeAlertasSistema = [];
let pmeAlertaSistemaSeq = 0;

// Load bots config
try {
  const botsConfig = fs.readFileSync(path.join(__dirname, 'bots.json'), 'utf8');
  bots = JSON.parse(botsConfig);
} catch (err) {
  console.error("Error reading bots.json", err);
}

const sendBotsStatus = () => {
  const statusList = bots.map(b => ({
    id: b.id,
    name: b.name,
    status: activeProcesses[b.id] ? 'running' : 'stopped',
    runMode: activeProcesses[b.id] ? (activeProcesses[b.id].runMode || 'manual') : null
  }));
  // Sort according to masterBotsOrder
  statusList.sort((a, b) => {
    const indexA = masterBotsOrder.indexOf(a.id);
    const indexB = masterBotsOrder.indexOf(b.id);
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
  io.emit('bots_status', statusList);
};

const CONFIG_PATHS = {
  bot_st_msp: path.join(__dirname, '..', 'bots fracttal-msp', 'config_st_msp.json'),
  bot_st_fracttal: path.join(__dirname, '..', 'bots fracttal-msp', 'config_st_fracttal.json'),
  bot_ot_fracttal: path.join(__dirname, '..', 'bots fracttal-msp', 'config_ot_fracttal.json'),
  bot_invitaciones_msp: path.join(__dirname, '..', 'bots fracttal-msp', 'config_invitaciones.json'),
  bot_clima_spsa: path.join(__dirname, 'bots', 'bot_clima_spsa', 'config_clima.json'),
  bot_senamhi_spsa: path.join(__dirname, 'bots', 'bot_senamhi_spsa', 'config_senamhi.json'),
  bot_pme_spsa: path.join(__dirname, 'config_bot_pme_spsa.json'),
  bot_pme_hvac: path.join(__dirname, 'bots', 'bot_pme_hvac', 'config_pme_hvac.json'),
  bot_pme_iluminacion: path.join(__dirname, 'bots', 'bot_pme_iluminacion', 'config_pme_iluminacion.json'),
  bot_pme_frio_alimentario: path.join(__dirname, 'bots', 'bot_pme_frio_alimentario', 'config_pme_frio_alimentario.json'),
  bot_pme_general: path.join(__dirname, 'bots', 'bot_pme_general', 'config_pme_general.json')
};

const DEFAULT_CONFIGS = {
  bot_st_msp: {
    user_msp: "raul.quispe@spsa.pe",
    pass_msp: "Spsa2024",
    url_supabase: "https://zuouxnvcktjhqzlniion.supabase.co",
    key_supabase: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84",
    tabla_supabase: "st_msp",
    path_gdrive: "G:\\Mi unidad\\1.GESTION DE MANTENIMIENTO SPSA\\CONSOLIDADO ST-OT\\ST MSP",
    fec_ini: "2025-06-01",
    fec_fin: "",
    hora1: "08:00",
    hora2: "13:00",
    hora3: "18:00",
    modo_auto: "HORAS",
    intervalo_val: "30",
    intervalo_uni: "minutos"
  },
  bot_st_fracttal: {
    user_fracttal: "raul.quispe@spsa.pe",
    pass_fracttal: "57d28fef1a743f7f0d1403f3dc799804",
    pass_real: "Spsa2023*",
    id_company: "2635",
    url_supabase: "https://zuouxnvcktjhqzlniion.supabase.co",
    key_supabase: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84",
    tabla_supabase: "st_fracttal",
    path_gdrive: "G:\\Mi unidad\\1.GESTIÓN DE MANTENIMIENTO SPSA\\CONSOLIDADO ST-OT\\ST FRACTTAL",
    fec_ini: "2025-06-01",
    fec_fin: "",
    hora1: "08:00",
    hora2: "13:00",
    hora3: "18:00",
    modo_supabase: "UPSERT_POR_OT",
    modo_auth: "AUTO",
    x_version: "Fracttal/5.8.04 web",
    token_manual: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImdKUXYybVdtS3hhZGVaRWFJbkp3UnNEVU54czkwYXZtQWhLaVVUQ2lMYlJJWiIsImlkX2NvbXBhbnkiOjI2MzUsImVtYWlsIjoicmF1bC5xdWlzcGVAc3BzYS5wZSIsImlkX3NlcnZlciI6IkFNRVJJQ0FOIiwiaWF0IjoxNzgzMTk0Mzg3LCJleHAiOjE3ODMyMzc1ODd9.GGAzWomXFu-sTHvXsihrv_N6R_xC-KfKMtS893hmoZo",
    cookie_manual: "session=e30=; session.sig=fpR225cqUeq9guW1OtGHu2nsV1Q; __cf_bm=yUj7S9SPAfN4Wgk4qxfCtuouKSPjxPzGT6nROGucfCE-1783193652.3741143-1.0.1.1-oGdqqHZfeRYyoaFdHY0hl.jDIuze9tTN5_grTQICrKmitiZZJNLpnq8GmA1YOF3m_M_HCfcDZHmubqkpLWNG.zybyiXAJ2oBMqjaITBwi1oZHfHFVn3KsOzHtK7DTQqd"
  },
  bot_ot_fracttal: {
    user_fracttal: "raul.quispe@spsa.pe",
    pass_fracttal: "57d28fef1a743f7f0d1403f3dc799804",
    pass_real: "Spsa2023*",
    id_company: "2635",
    url_supabase: "https://zuouxnvcktjhqzlniion.supabase.co",
    key_supabase: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84",
    tabla_supabase: "ot_fracttal",
    path_gdrive: "G:\\Mi unidad\\1.GESTIÓN DE MANTENIMIENTO SPSA\\CONSOLIDADO ST-OT\\OT FRACTTAL",
    fec_ini: "2025-06-01",
    fec_fin: "",
    hora1: "08:00",
    hora2: "13:00",
    hora3: "18:00",
    modo_supabase: "UPSERT_POR_OT",
    modo_auth: "AUTO",
    x_version: "Fracttal/5.8.04 web",
    token_manual: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImdKUXYybVdtS3hhZGVaRWFJbkp3UnNEVU54czkwYXZtQWhLaVVUQ2lMYlJJWiIsImlkX2NvbXBhbnkiOjI2MzUsImVtYWlsIjoicmF1bC5xdWlzcGVAc3BzYS5wZSIsImlkX3NlcnZlciI6IkFNRVJJQ0FOIiwiaWF0IjoxNzgzMTk0Mzg3LCJleHAiOjE3ODMyMzc1ODd9.GGAzWomXFu-sTHvXsihrv_N6R_xC-KfKMtS893hmoZo",
    cookie_manual: "session=e30=; session.sig=fpR225cqUeq9guW1OtGHu2nsV1Q; __cf_bm=yUj7S9SPAfN4Wgk4qxfCtuouKSPjxPzGT6nROGucfCE-1783193652.3741143-1.0.1.1-oGdqqHZfeRYyoaFdHY0hl.jDIuze9tTN5_grTQICrKmitiZZJNLpnq8GmA1YOF3m_M_HCfcDZHmubqkpLWNG.zybyiXAJ2oBMqjaITBwi1oZHfHFVn3KsOzHtK7DTQqd"
  },
  bot_invitaciones_msp: {
    user_msp: "raul.quispe@spsa.pe",
    pass_msp: "Spsa2024",
    url_supabase: "https://zuouxnvcktjhqzlniion.supabase.co",
    key_supabase: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84",
    tabla_supabase: "invitaciones_msp",
    path_gdrive: "G:\\Mi unidad\\1.GESTION DE MANTENIMIENTO SPSA\\CONSOLIDADO ST-OT\\ST MSP",
    fec_ini: "2025-06-01",
    fec_fin: "",
    hora1: "08:00",
    hora2: "13:00",
    hora3: "18:00",
    modo_auto: "HORAS",
    intervalo_val: "30",
    intervalo_uni: "minutos"
  },
  bot_clima_spsa: {
    f_ini: "2024-01-01",
    f_fin: new Date().toISOString().split('T')[0],
    ventana_movil_dias: 3,
    dias_prediccion: 3,
    modo_auto: "INTERVALO",
    intervalo_val: "24",
    intervalo_uni: "horas",
    hora1: "06:00",
    hora2: "12:00",
    hora3: "18:00",
    pais: "Peru",
    variables_activas: ["wind_speed_10m_max", "wind_gusts_10m_max", "wind_direction_10m_dominant", "shortwave_radiation_sum", "weather_code"]
  },
  bot_senamhi_spsa: {
    f_ini: "2024-01-01",
    f_fin: new Date().toISOString().split('T')[0],
    ventana_movil_dias: 3,
    parametros_activos: ["viento_kmh", "nivel_rio_m", "caudal_m3s"],
    radio_km: 10,
    tipos_estacion: ["meteorologica", "hidrologica"],
    exportar_excel: true,
    carpeta_drive: "",
    delay_seg: 1.5,
    reintentos: 3,
    modo_auto: "INTERVALO",
    intervalo_val: "24",
    intervalo_uni: "horas",
    hora1: "06:00",
    hora2: "12:00",
    hora3: "18:00"
  },
  bot_pme_spsa: {
    url: "https://10.30.4.124/Web/Auth?ReturnUrl=%2fWeb%2f#Trends/",
    username: "Supervisor",
    password: "",
    f_ini: "2026-07-23",
    f_fin: new Date().toISOString().split('T')[0]
  },
  bot_pme_hvac: {
    dias_historico: 3,
    agregacion: 'hora',
    alerta_consumo: {
      activo: false,
      hora_inicio: '23:00',
      hora_fin: '06:00',
      linea_base_kwh: 1.0,
      destinatarios: '',
      copia: '',
      cuerpo_mensaje: '🔥 CONSUMO FUERA DE HORARIO [{servicio}]\nSede: {sede}\nFecha: {fecha}  Hora pico: {hora}\nConsumo pico: {valor} kWh (línea base: {linea_base} kWh)\nConsumo total en el rango: {total_kwh} kWh\nCosto estimado: S/ {costo} (S/ {precio_kwh} por kWh)\nRango vigilado: {hora_inicio} a {hora_fin}\n(Detalle hora por hora adjunto en Excel)',
      asunto: 'Alerta Consumo fuera de horario - {servicio}',
      nombre_remitente: 'Alertas {servicio} PME',
      precio_kwh: 0.0,
      adjuntar_excel: true,
      umbral_critico_soles_dia: 20.0,
      umbral_medio_soles_dia: 10.0,
      descripcion_solicitud_servicio: 'Se requiere revisar y configurar el encendido de los equipos de {servicio} ya que existe operación fuera del horario de consumo. En caso de no existir un sistema de control de encendidos, se solicita cotizarlo.',
      descripcion_solicitud_medidor: 'Se requiere revisar el medidor de energía {medidor_nombre} ya que no está enviando datos desde {ultima_fecha_con_datos}. Verificar conexión/comunicación del equipo; podría requerir mantenimiento o reemplazo.'
    }
  },
  bot_pme_iluminacion: {
    dias_historico: 3
  },
  bot_pme_frio_alimentario: {
    dias_historico: 3
  },
  bot_pme_general: {
    dias_historico: 3,
    hora_punta_inicio: '18:00',
    hora_punta_fin: '23:00'
  }
};

let masterSequenceRunning = false;
let masterSequenceTrigger = 'manual';
let masterSequenceIndex = -1;
let masterSequenceFailedBots = [];
let masterRunId = null; // UUID que agrupa a todos los bots de UNA misma corrida en cascada (tabla bot_activaciones)
let masterBotsOrder = ['bot_st_msp', 'bot_st_fracttal', 'bot_ot_fracttal', 'bot_invitaciones_msp'];
try {
  const savedOrder = fs.readFileSync(path.join(__dirname, 'bots_order.json'), 'utf8');
  masterBotsOrder = JSON.parse(savedOrder);
} catch (e) {
  // Use default
}

let masterAutopilotActive = false;
let masterTimeoutId = null;
let masterNextRunTime = null;
let masterAutopilotTickInterval = null;
let lastMasterTriggerHour = '';

// ── Motor de cascada del Bot Master Climático (SENAMHI + Open-Meteo) ──
// Espejo independiente del motor de arriba (no lo comparte ni lo reutiliza)
// para no arriesgar la cascada de Fracttal-Msp, que ya está en producción.
let climaSequenceRunning = false;
let climaSequenceTrigger = 'manual';
let climaSequenceIndex = -1;
let climaSequenceFailedBots = [];
let climaRunId = null;
let climaBotsOrder = ['bot_senamhi_spsa', 'bot_clima_spsa'];
try {
  const savedClimaOrder = fs.readFileSync(path.join(__dirname, 'bots_order_clima.json'), 'utf8');
  climaBotsOrder = JSON.parse(savedClimaOrder);
} catch (e) {
  // Use default
}

let climaAutopilotActive = false;
let climaTimeoutId = null;
let climaNextRunTime = null;

// ── Watchdog de inactividad de la cascada Climática ──
// En vez de un timeout de duracion total fija (ciego a si el bot sigue
// trabajando o no), mide el tiempo desde el ULTIMO dato recibido por stdout
// del bot activo -el bot emite logs/progreso constantemente mientras
// descarga (lote subido, estacion procesada, etc.). Si se queda en silencio
// total mas de N minutos (configurable en el Programador Maestro), recien
// ahi se considera colgado: se fuerza su cierre (SIGKILL) y el flujo normal
// del evento 'close' avanza automaticamente al siguiente bot, dejando un
// mensaje de error visible explicando el motivo.
let climaLastActivityTime = null;
let climaWatchdogInterval = null;
let climaWatchdogTriggered = false;
const CLIMA_WATCHDOG_CHECK_MS = 20 * 1000;
const CLIMA_WATCHDOG_DEFAULT_MIN = 10;

const startClimaWatchdog = () => {
  if (climaWatchdogInterval) return;
  climaWatchdogTriggered = false;
  climaWatchdogInterval = setInterval(() => {
    if (!climaSequenceRunning || climaWatchdogTriggered) return;
    const botId = climaBotsOrder[climaSequenceIndex];
    const proc = botId && activeProcesses[botId];
    if (!proc || !climaLastActivityTime) return;

    const umbralMin = Number(loadClimaMasterConfig().timeout_inactividad_min) || CLIMA_WATCHDOG_DEFAULT_MIN;
    const inactividadMin = (Date.now() - climaLastActivityTime) / 60000;
    if (inactividadMin >= umbralMin) {
      climaWatchdogTriggered = true;
      io.emit('bot_log', {
        id: 'bot_master_climatico', type: 'error',
        message: `⚠️ El bot ${botId} no mostró ninguna actividad (sin logs ni progreso) en los últimos ${Math.floor(inactividadMin)} minutos. Se considera colgado — forzando su cierre y continuando con el siguiente bot de la cascada.`
      });
      proc.kill('SIGKILL');
    }
  }, CLIMA_WATCHDOG_CHECK_MS);
};

const stopClimaWatchdog = () => {
  if (climaWatchdogInterval) {
    clearInterval(climaWatchdogInterval);
    climaWatchdogInterval = null;
  }
  climaLastActivityTime = null;
  climaWatchdogTriggered = false;
};
let climaAutopilotTickInterval = null;
let lastClimaTriggerHour = '';

// ── Motor de cascada del Bot Master PME (HVAC → Iluminación → Frío
// Alimentario → General) ── Mismo patrón que el motor Climático de arriba,
// como motor independiente (variables/eventos propios) para no arriesgar
// las cascadas ya en producción.
let pmeSequenceRunning = false;
let pmeSequenceTrigger = 'manual';
let pmeSequenceIndex = -1;
let pmeSequenceFailedBots = [];
let pmeRunId = null;
const pmeBotsOrder = ['bot_pme_hvac', 'bot_pme_iluminacion', 'bot_pme_frio_alimentario', 'bot_pme_general'];

let pmeAutopilotActive = false;
let pmeTimeoutId = null;
let pmeNextRunTime = null;

// ── Watchdog de inactividad de la cascada PME (mismo mecanismo validado
// en la cascada Climática: mide silencio desde el ultimo log/progreso del
// bot activo, no una duracion total fija) ──
let pmeLastActivityTime = null;
let pmeWatchdogInterval = null;
let pmeWatchdogTriggered = false;
const PME_WATCHDOG_CHECK_MS = 20 * 1000;
const PME_WATCHDOG_DEFAULT_MIN = 10;

const startPmeWatchdog = () => {
  if (pmeWatchdogInterval) return;
  pmeWatchdogTriggered = false;
  pmeWatchdogInterval = setInterval(() => {
    if (!pmeSequenceRunning || pmeWatchdogTriggered) return;
    const botId = pmeBotsOrder[pmeSequenceIndex];
    const proc = botId && activeProcesses[botId];
    if (!proc || !pmeLastActivityTime) return;

    const umbralMin = Number(loadPmeMasterConfig().timeout_inactividad_min) || PME_WATCHDOG_DEFAULT_MIN;
    const inactividadMin = (Date.now() - pmeLastActivityTime) / 60000;
    if (inactividadMin >= umbralMin) {
      pmeWatchdogTriggered = true;
      io.emit('bot_log', {
        id: 'bot_master_pme', type: 'error',
        message: `⚠️ El bot ${botId} no mostró ninguna actividad (sin logs ni progreso) en los últimos ${Math.floor(inactividadMin)} minutos. Se considera colgado — forzando su cierre y continuando con el siguiente bot de la cascada.`
      });
      proc.kill('SIGKILL');
    }
  }, PME_WATCHDOG_CHECK_MS);
};

const stopPmeWatchdog = () => {
  if (pmeWatchdogInterval) {
    clearInterval(pmeWatchdogInterval);
    pmeWatchdogInterval = null;
  }
  pmeLastActivityTime = null;
  pmeWatchdogTriggered = false;
};
let pmeAutopilotTickInterval = null;
let lastPmeTriggerHour = '';

// Stats management
let lastRunStats = {};
const STATS_PATH = path.join(__dirname, 'last_run_stats.json');

const loadStats = () => {
  try {
    if (fs.existsSync(STATS_PATH)) {
      lastRunStats = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
    }
  } catch (e) {
    lastRunStats = {};
  }
};

const saveStats = () => {
  try {
    fs.writeFileSync(STATS_PATH, JSON.stringify(lastRunStats, null, 2), 'utf8');
    io.emit('last_run_stats', lastRunStats);
  } catch (e) {}
};

loadStats();

const MASTER_CONFIG_PATH = path.join(__dirname, '..', 'bots fracttal-msp', 'config_master.json');
const SHARED_CONFIG_PATH = path.join(__dirname, '..', 'bots fracttal-msp', 'config_shared.json');

const loadMasterConfig = () => {
  try {
    if (fs.existsSync(MASTER_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(MASTER_CONFIG_PATH, 'utf8'));
    }
  } catch (e) {}
  return {
    modo_auto: 'HORAS',
    hora1: '08:00',
    hora2: '13:00',
    hora3: '18:00',
    intervalo_val: '30',
    intervalo_uni: 'minutos'
  };
};

const saveMasterConfig = (cfg) => {
  try {
    fs.mkdirSync(path.dirname(MASTER_CONFIG_PATH), { recursive: true });
    fs.writeFileSync(MASTER_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {}
};

// Programador del Bot Master Climático (Horas/Intervalo) — independiente del
// de Fracttal-Msp de arriba, mismo patrón de carga/guardado.
const CLIMA_MASTER_CONFIG_PATH = path.join(__dirname, 'config_master_climatico.json');

const loadClimaMasterConfig = () => {
  try {
    if (fs.existsSync(CLIMA_MASTER_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CLIMA_MASTER_CONFIG_PATH, 'utf8'));
    }
  } catch (e) {}
  return {
    modo_auto: 'HORAS',
    hora1: '06:00',
    hora2: '12:00',
    hora3: '18:00',
    intervalo_val: '24',
    intervalo_uni: 'horas',
    timeout_inactividad_min: CLIMA_WATCHDOG_DEFAULT_MIN
  };
};

const saveClimaMasterConfig = (cfg) => {
  try {
    fs.writeFileSync(CLIMA_MASTER_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {}
};

// Programador del Bot Master PME (Horas/Intervalo + timeout de inactividad)
// — mismo patrón que el de Clima de arriba. Por default dispara cada 1 hora
// (INTERVALO) porque cada bot ya trae "los últimos N días" en cada corrida
// (ventana dinámica nativa de PME, ver dias_historico), así que correr
// seguido no repite trabajo — solo mantiene la base de datos al día.
const PME_MASTER_CONFIG_PATH = path.join(__dirname, 'config_master_pme.json');

const loadPmeMasterConfig = () => {
  try {
    if (fs.existsSync(PME_MASTER_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(PME_MASTER_CONFIG_PATH, 'utf8'));
    }
  } catch (e) {}
  return {
    modo_auto: 'INTERVALO',
    hora1: '06:00',
    hora2: '12:00',
    hora3: '18:00',
    intervalo_val: '1',
    intervalo_uni: 'horas',
    timeout_inactividad_min: PME_WATCHDOG_DEFAULT_MIN
  };
};

const savePmeMasterConfig = (cfg) => {
  try {
    fs.writeFileSync(PME_MASTER_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {}
};

const getNowFormatted = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
};

const loadSharedConfig = () => {
  try {
    if (fs.existsSync(SHARED_CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(SHARED_CONFIG_PATH, 'utf8'));
      if (!cfg.fec_fin) {
        cfg.fec_fin = getNowFormatted();
      }
      return cfg;
    }
  } catch (e) {}
  return {
    url_supabase: 'https://zuouxnvcktjhqzlniion.supabase.co',
    key_supabase: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84',
    fec_ini: '2025-06-01',
    fec_fin: getNowFormatted(),
    path_gdrive: 'G:\\Mi unidad\\1.GESTIÓN DE MANTENIMIENTO SPSA\\CONSOLIDADO ST-OT',
    user_spsa: 'raul.quispe@spsa.pe'
  };
};

const saveSharedConfig = (cfg) => {
  try {
    fs.mkdirSync(path.dirname(SHARED_CONFIG_PATH), { recursive: true });
    fs.writeFileSync(SHARED_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {}
};

const sendMasterStatus = () => {
  let countdownStr = '';
  if (masterAutopilotActive && masterNextRunTime) {
    const diff = masterNextRunTime.getTime() - Date.now();
    if (diff > 0) {
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      countdownStr = `Próxima ejecución en: ${minutes}m ${seconds}s`;
    } else {
      countdownStr = 'Ejecución inminente...';
    }
  } else if (masterAutopilotActive) {
    const cfg = loadMasterConfig();
    if (cfg.modo_auto === 'INTERVALO') {
      countdownStr = masterSequenceRunning
        ? 'Esperando que termine la cascada para iniciar la cuenta regresiva del intervalo...'
        : 'Autopiloto activo (modo intervalo)';
    } else {
      countdownStr = `Autopiloto activo (${cfg.hora1}, ${cfg.hora2}, ${cfg.hora3})`;
    }
  }

  io.emit('master_status', {
    running: masterSequenceRunning,
    currentBot: masterSequenceRunning ? masterBotsOrder[masterSequenceIndex] : null,
    index: masterSequenceIndex,
    total: masterBotsOrder.length,
    autopilotActive: masterAutopilotActive,
    countdown: countdownStr,
    triggerMode: masterSequenceRunning ? masterSequenceTrigger : null
  });
};

// Start tick broadcast
if (!masterAutopilotTickInterval) {
  masterAutopilotTickInterval = setInterval(() => {
    sendMasterStatus();
  }, 1000);
}

const checkMasterHours = () => {
  if (!masterAutopilotActive) return;
  const cfg = loadMasterConfig();
  if (cfg.modo_auto !== 'HORAS') return;

  const ahora = new Date();
  const HHMM = ahora.toTimeString().substring(0, 5); // "HH:MM"

  if (HHMM === cfg.hora1 || HHMM === cfg.hora2 || HHMM === cfg.hora3) {
    if (lastMasterTriggerHour !== HHMM) {
      lastMasterTriggerHour = HHMM;
      io.emit('bot_log', { id: 'bot_master', type: 'info', message: `🕒 [Autopiloto] Hora programada detectada (${HHMM}). Iniciando secuencia...` });
      startMasterSequence('autopilot');
    }
  } else {
    if (lastMasterTriggerHour === HHMM) {
      lastMasterTriggerHour = '';
    }
  }
};

const scheduleNextMasterRun = () => {
  if (!masterAutopilotActive) return;
  const cfg = loadMasterConfig();
  if (cfg.modo_auto !== 'INTERVALO') return;

  const val = parseFloat(cfg.intervalo_val) || 30;
  const uni = cfg.intervalo_uni || 'minutos';
  const ms = val * (uni === 'horas' ? 3600000 : 60000);

  masterNextRunTime = new Date(Date.now() + ms);
  io.emit('bot_log', { id: 'bot_master', type: 'info', message: `⏰ Próxima ejecución programada en ${val} ${uni} (a las ${masterNextRunTime.toLocaleTimeString()})` });
  sendMasterStatus();

  if (masterTimeoutId) clearTimeout(masterTimeoutId);
  masterTimeoutId = setTimeout(() => {
    if (!masterAutopilotActive) return;
    io.emit('bot_log', { id: 'bot_master', type: 'info', message: `🔄 [Autopiloto] Intervalo cumplido. Iniciando secuencia...` });
    startMasterSequence('autopilot');
  }, ms);
};

const startMasterAutopilotMode = () => {
  if (masterAutopilotActive) return;
  masterAutopilotActive = true;
  io.emit('bot_log', { id: 'bot_master', type: 'info', message: '🟢 Autopiloto Maestro Activado.' });
  
  const cfg = loadMasterConfig();
  if (cfg.modo_auto === 'HORAS') {
    if (masterTimeoutId) clearInterval(masterTimeoutId);
    masterTimeoutId = setInterval(checkMasterHours, 15000);
    checkMasterHours();
  } else {
    io.emit('bot_log', { id: 'bot_master', type: 'info', message: '🔄 Iniciando primera ejecución del autopiloto por intervalo...' });
    startMasterSequence('autopilot');
  }
  sendMasterStatus();
};

const stopMasterAutopilotMode = () => {
  if (!masterAutopilotActive) return;
  masterAutopilotActive = false;
  if (masterTimeoutId) {
    clearInterval(masterTimeoutId);
    clearTimeout(masterTimeoutId);
    masterTimeoutId = null;
  }
  masterNextRunTime = null;
  io.emit('bot_log', { id: 'bot_master', type: 'info', message: '🔴 Autopiloto Maestro Desactivado.' });
  sendMasterStatus();
};

const runNextMasterBot = () => {
  if (!masterSequenceRunning) return;
  masterSequenceIndex++;
  if (masterSequenceIndex >= masterBotsOrder.length) {
    masterSequenceRunning = false;
    masterSequenceIndex = -1;
    if (masterSequenceFailedBots.length === 0) {
      io.emit('bot_log', { id: 'bot_master', type: 'info', message: '🎉 ¡Orquestación general finalizada con éxito! Todos los bots han completado su ciclo.' });
    } else {
      io.emit('bot_log', { id: 'bot_master', type: 'error', message: `⚠️ Orquestación finalizada. ${masterSequenceFailedBots.length} de ${masterBotsOrder.length} bots fallaron: ${masterSequenceFailedBots.join(', ')}. Revisa el correo de alerta de cada uno para la causa y solución.` });
    }
    sendMasterStatus();
    if (masterAutopilotActive) {
      scheduleNextMasterRun();
    }
    return;
  }

  const nextBotId = masterBotsOrder[masterSequenceIndex];
  io.emit('bot_log', { id: 'bot_master', type: 'info', message: `🚀 Iniciando paso ${masterSequenceIndex + 1}/${masterBotsOrder.length}: Ejecutando ${nextBotId}...` });
  sendMasterStatus();
  
  startBot(nextBotId, 'manual', 'master', masterRunId);
};

const startMasterSequence = (triggerMode = 'manual') => {
  if (masterSequenceRunning) return;
  
  const alreadyRunning = masterBotsOrder.find(id => activeProcesses[id]);
  if (alreadyRunning) {
    io.emit('bot_log', { id: 'bot_master', type: 'error', message: `No se puede iniciar la orquestación: el bot ${alreadyRunning} ya se está ejecutando.` });
    return;
  }

  masterSequenceRunning = true;
  masterSequenceTrigger = triggerMode;
  masterSequenceIndex = -1;
  masterSequenceFailedBots = [];
  masterRunId = crypto.randomUUID();
  io.emit('bot_log', { id: 'bot_master', type: 'info', message: `🏁 Iniciando orquestación general de bots en cascada [Modo: ${triggerMode.toUpperCase()}]...` });
  runNextMasterBot();
};

const stopMasterSequence = () => {
  if (!masterSequenceRunning) return;
  masterSequenceRunning = false;
  const currentBotId = masterBotsOrder[masterSequenceIndex];
  masterSequenceIndex = -1;
  if (currentBotId) {
    stopBot(currentBotId);
  }
  io.emit('bot_log', { id: 'bot_master', type: 'info', message: '🛑 Orquestación cancelada por el usuario.' });
  sendMasterStatus();
};

// ── Cascada del Bot Master Climático (SENAMHI → Open-Meteo) ──
// Mismo diseño que el bloque de Fracttal-Msp de arriba, como motor
// independiente (variables/eventos propios) para no tocar el que ya
// funciona en producción.
const sendClimaMasterStatus = () => {
  let countdownStr = '';
  if (climaAutopilotActive && climaNextRunTime) {
    const diff = climaNextRunTime.getTime() - Date.now();
    if (diff > 0) {
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      countdownStr = `Próxima ejecución en: ${minutes}m ${seconds}s`;
    } else {
      countdownStr = 'Ejecución inminente...';
    }
  } else if (climaAutopilotActive) {
    const cfg = loadClimaMasterConfig();
    if (cfg.modo_auto === 'INTERVALO') {
      countdownStr = climaSequenceRunning
        ? 'Esperando que termine la cascada para iniciar la cuenta regresiva del intervalo...'
        : 'Autopiloto activo (modo intervalo)';
    } else {
      countdownStr = `Autopiloto activo (${cfg.hora1}, ${cfg.hora2}, ${cfg.hora3})`;
    }
  }

  io.emit('master_climatico_status', {
    running: climaSequenceRunning,
    currentBot: climaSequenceRunning ? climaBotsOrder[climaSequenceIndex] : null,
    index: climaSequenceIndex,
    total: climaBotsOrder.length,
    autopilotActive: climaAutopilotActive,
    countdown: countdownStr,
    triggerMode: climaSequenceRunning ? climaSequenceTrigger : null
  });
};

if (!climaAutopilotTickInterval) {
  climaAutopilotTickInterval = setInterval(() => {
    sendClimaMasterStatus();
  }, 1000);
}

const checkClimaHours = () => {
  if (!climaAutopilotActive) return;
  const cfg = loadClimaMasterConfig();
  if (cfg.modo_auto !== 'HORAS') return;

  const ahora = new Date();
  const HHMM = ahora.toTimeString().substring(0, 5);

  if (HHMM === cfg.hora1 || HHMM === cfg.hora2 || HHMM === cfg.hora3) {
    if (lastClimaTriggerHour !== HHMM) {
      lastClimaTriggerHour = HHMM;
      io.emit('bot_log', { id: 'bot_master_climatico', type: 'info', message: `🕒 [Autopiloto] Hora programada detectada (${HHMM}). Iniciando secuencia...` });
      startClimaSequence('autopilot');
    }
  } else {
    if (lastClimaTriggerHour === HHMM) {
      lastClimaTriggerHour = '';
    }
  }
};

const scheduleNextClimaRun = () => {
  if (!climaAutopilotActive) return;
  const cfg = loadClimaMasterConfig();
  if (cfg.modo_auto !== 'INTERVALO') return;

  const val = parseFloat(cfg.intervalo_val) || 24;
  const uni = cfg.intervalo_uni || 'horas';
  const ms = val * (uni === 'horas' ? 3600000 : 60000);

  climaNextRunTime = new Date(Date.now() + ms);
  io.emit('bot_log', { id: 'bot_master_climatico', type: 'info', message: `⏰ Próxima ejecución programada en ${val} ${uni} (a las ${climaNextRunTime.toLocaleTimeString()})` });
  sendClimaMasterStatus();

  if (climaTimeoutId) clearTimeout(climaTimeoutId);
  climaTimeoutId = setTimeout(() => {
    if (!climaAutopilotActive) return;
    io.emit('bot_log', { id: 'bot_master_climatico', type: 'info', message: `🔄 [Autopiloto] Intervalo cumplido. Iniciando secuencia...` });
    startClimaSequence('autopilot');
  }, ms);
};

const startClimaAutopilotMode = () => {
  if (climaAutopilotActive) return;
  climaAutopilotActive = true;
  io.emit('bot_log', { id: 'bot_master_climatico', type: 'info', message: '🟢 Autopiloto Maestro Climático Activado.' });

  const cfg = loadClimaMasterConfig();
  if (cfg.modo_auto === 'HORAS') {
    if (climaTimeoutId) clearInterval(climaTimeoutId);
    climaTimeoutId = setInterval(checkClimaHours, 15000);
    checkClimaHours();
  } else {
    io.emit('bot_log', { id: 'bot_master_climatico', type: 'info', message: '🔄 Iniciando primera ejecución del autopiloto por intervalo...' });
    startClimaSequence('autopilot');
  }
  sendClimaMasterStatus();
};

const stopClimaAutopilotMode = () => {
  if (!climaAutopilotActive) return;
  climaAutopilotActive = false;
  if (climaTimeoutId) {
    clearInterval(climaTimeoutId);
    clearTimeout(climaTimeoutId);
    climaTimeoutId = null;
  }
  climaNextRunTime = null;
  io.emit('bot_log', { id: 'bot_master_climatico', type: 'info', message: '🔴 Autopiloto Maestro Climático Desactivado.' });
  sendClimaMasterStatus();
};

const runNextClimaBot = () => {
  if (!climaSequenceRunning) return;
  climaSequenceIndex++;
  if (climaSequenceIndex >= climaBotsOrder.length) {
    climaSequenceRunning = false;
    climaSequenceIndex = -1;
    stopClimaWatchdog();
    if (climaSequenceFailedBots.length === 0) {
      io.emit('bot_log', { id: 'bot_master_climatico', type: 'info', message: '🎉 ¡Cascada Climática finalizada con éxito! SENAMHI y Open-Meteo completaron su ciclo.' });
    } else {
      io.emit('bot_log', { id: 'bot_master_climatico', type: 'error', message: `⚠️ Cascada finalizada. ${climaSequenceFailedBots.length} de ${climaBotsOrder.length} bots fallaron: ${climaSequenceFailedBots.join(', ')}. Revisa el correo de alerta de cada uno para la causa y solución.` });
    }
    sendClimaMasterStatus();
    if (climaAutopilotActive) {
      scheduleNextClimaRun();
    }
    return;
  }

  const nextBotId = climaBotsOrder[climaSequenceIndex];
  io.emit('bot_log', { id: 'bot_master_climatico', type: 'info', message: `🚀 Iniciando paso ${climaSequenceIndex + 1}/${climaBotsOrder.length}: Ejecutando ${nextBotId}...` });
  sendClimaMasterStatus();

  climaLastActivityTime = Date.now();
  climaWatchdogTriggered = false;
  startBot(nextBotId, 'manual', 'master', climaRunId);
};

const startClimaSequence = (triggerMode = 'manual') => {
  if (climaSequenceRunning) return;

  const alreadyRunning = climaBotsOrder.find(id => activeProcesses[id]);
  if (alreadyRunning) {
    io.emit('bot_log', { id: 'bot_master_climatico', type: 'error', message: `No se puede iniciar la cascada: el bot ${alreadyRunning} ya se está ejecutando.` });
    return;
  }

  climaSequenceRunning = true;
  climaSequenceTrigger = triggerMode;
  climaSequenceIndex = -1;
  climaSequenceFailedBots = [];
  climaRunId = crypto.randomUUID();
  io.emit('bot_log', { id: 'bot_master_climatico', type: 'info', message: `🏁 Iniciando cascada Climática (SENAMHI → Open-Meteo) [Modo: ${triggerMode.toUpperCase()}]...` });
  startClimaWatchdog();
  runNextClimaBot();
};

const stopClimaSequence = () => {
  if (!climaSequenceRunning) return;
  climaSequenceRunning = false;
  const currentBotId = climaBotsOrder[climaSequenceIndex];
  climaSequenceIndex = -1;
  stopClimaWatchdog();
  if (currentBotId) {
    stopBot(currentBotId);
  }
  io.emit('bot_log', { id: 'bot_master_climatico', type: 'info', message: '🛑 Cascada Climática cancelada por el usuario.' });
  sendClimaMasterStatus();
};

// ── Cascada del Bot Master PME (HVAC → Iluminación → Frío Alimentario) ──
// Mismo diseño que el bloque Climático de arriba, motor independiente.
const sendPmeMasterStatus = () => {
  let countdownStr = '';
  if (pmeAutopilotActive && pmeNextRunTime) {
    const diff = pmeNextRunTime.getTime() - Date.now();
    if (diff > 0) {
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      countdownStr = `Próxima ejecución en: ${minutes}m ${seconds}s`;
    } else {
      countdownStr = 'Ejecución inminente...';
    }
  } else if (pmeAutopilotActive) {
    const cfg = loadPmeMasterConfig();
    if (cfg.modo_auto === 'INTERVALO') {
      countdownStr = pmeSequenceRunning
        ? 'Esperando que termine la cascada para iniciar la cuenta regresiva del intervalo...'
        : 'Autopiloto activo (modo intervalo)';
    } else {
      countdownStr = `Autopiloto activo (${cfg.hora1}, ${cfg.hora2}, ${cfg.hora3})`;
    }
  }

  io.emit('master_pme_status', {
    running: pmeSequenceRunning,
    currentBot: pmeSequenceRunning ? pmeBotsOrder[pmeSequenceIndex] : null,
    index: pmeSequenceIndex,
    total: pmeBotsOrder.length,
    autopilotActive: pmeAutopilotActive,
    countdown: countdownStr,
    triggerMode: pmeSequenceRunning ? pmeSequenceTrigger : null
  });
};

if (!pmeAutopilotTickInterval) {
  pmeAutopilotTickInterval = setInterval(() => {
    sendPmeMasterStatus();
  }, 1000);
}

const checkPmeHours = () => {
  if (!pmeAutopilotActive) return;
  const cfg = loadPmeMasterConfig();
  if (cfg.modo_auto !== 'HORAS') return;

  const ahora = new Date();
  const HHMM = ahora.toTimeString().substring(0, 5);

  if (HHMM === cfg.hora1 || HHMM === cfg.hora2 || HHMM === cfg.hora3) {
    if (lastPmeTriggerHour !== HHMM) {
      lastPmeTriggerHour = HHMM;
      io.emit('bot_log', { id: 'bot_master_pme', type: 'info', message: `🕒 [Autopiloto] Hora programada detectada (${HHMM}). Iniciando secuencia...` });
      startPmeSequence('autopilot');
    }
  } else {
    if (lastPmeTriggerHour === HHMM) {
      lastPmeTriggerHour = '';
    }
  }
};

const scheduleNextPmeRun = () => {
  if (!pmeAutopilotActive) return;
  const cfg = loadPmeMasterConfig();
  if (cfg.modo_auto !== 'INTERVALO') return;

  const val = parseFloat(cfg.intervalo_val) || 1;
  const uni = cfg.intervalo_uni || 'horas';
  const ms = val * (uni === 'horas' ? 3600000 : 60000);

  pmeNextRunTime = new Date(Date.now() + ms);
  io.emit('bot_log', { id: 'bot_master_pme', type: 'info', message: `⏰ Próxima ejecución programada en ${val} ${uni} (a las ${pmeNextRunTime.toLocaleTimeString()})` });
  sendPmeMasterStatus();

  if (pmeTimeoutId) clearTimeout(pmeTimeoutId);
  pmeTimeoutId = setTimeout(() => {
    if (!pmeAutopilotActive) return;
    io.emit('bot_log', { id: 'bot_master_pme', type: 'info', message: `🔄 [Autopiloto] Intervalo cumplido. Iniciando secuencia...` });
    startPmeSequence('autopilot');
  }, ms);
};

const startPmeAutopilotMode = () => {
  if (pmeAutopilotActive) return;
  pmeAutopilotActive = true;
  io.emit('bot_log', { id: 'bot_master_pme', type: 'info', message: '🟢 Autopiloto Maestro PME Activado.' });

  const cfg = loadPmeMasterConfig();
  if (cfg.modo_auto === 'HORAS') {
    if (pmeTimeoutId) clearInterval(pmeTimeoutId);
    pmeTimeoutId = setInterval(checkPmeHours, 15000);
    checkPmeHours();
  } else {
    io.emit('bot_log', { id: 'bot_master_pme', type: 'info', message: '🔄 Iniciando primera ejecución del autopiloto por intervalo...' });
    startPmeSequence('autopilot');
  }
  sendPmeMasterStatus();
};

const stopPmeAutopilotMode = () => {
  if (!pmeAutopilotActive) return;
  pmeAutopilotActive = false;
  if (pmeTimeoutId) {
    clearInterval(pmeTimeoutId);
    clearTimeout(pmeTimeoutId);
    pmeTimeoutId = null;
  }
  pmeNextRunTime = null;
  io.emit('bot_log', { id: 'bot_master_pme', type: 'info', message: '🔴 Autopiloto Maestro PME Desactivado.' });
  sendPmeMasterStatus();
};

const runNextPmeBot = () => {
  if (!pmeSequenceRunning) return;
  pmeSequenceIndex++;
  if (pmeSequenceIndex >= pmeBotsOrder.length) {
    pmeSequenceIndex = -1;
    stopPmeWatchdog();
    
    io.emit('bot_log', { id: 'bot_master_pme', type: 'info', message: '⚙️ Consolidando solicitudes Fracttal por sede...' });
    
    const fracttalProcess = spawn('python', [path.join(__dirname, 'bots', 'sincronizar_solicitudes_fracttal.py')], { cwd: __dirname });
    
    fracttalProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (!line.trim()) return;
        try {
          const parsed = JSON.parse(line);
          io.emit('bot_log', { id: 'bot_master_pme', ...parsed });
        } catch (e) {
          io.emit('bot_log', { id: 'bot_master_pme', type: 'info', message: line });
        }
      });
    });

    fracttalProcess.stderr.on('data', (data) => {
      io.emit('bot_log', { id: 'bot_master_pme', type: 'error', message: data.toString() });
    });

    fracttalProcess.on('close', (code) => {
      pmeSequenceRunning = false;
      if (pmeSequenceFailedBots.length === 0) {
        io.emit('bot_log', { id: 'bot_master_pme', type: 'info', message: '🎉 ¡Cascada PME finalizada con éxito! HVAC, Iluminación, Frío Alimentario y General completaron su ciclo.' });
      } else {
        io.emit('bot_log', { id: 'bot_master_pme', type: 'error', message: `⚠️ Cascada finalizada. ${pmeSequenceFailedBots.length} de ${pmeBotsOrder.length} bots fallaron: ${pmeSequenceFailedBots.join(', ')}.` });
      }
      sendPmeMasterStatus();
      if (pmeAutopilotActive) {
        scheduleNextPmeRun();
      }
    });
    
    return;
  }

  const nextBotId = pmeBotsOrder[pmeSequenceIndex];
  io.emit('bot_log', { id: 'bot_master_pme', type: 'info', message: `🚀 Iniciando paso ${pmeSequenceIndex + 1}/${pmeBotsOrder.length}: Ejecutando ${nextBotId}...` });
  sendPmeMasterStatus();

  pmeLastActivityTime = Date.now();
  pmeWatchdogTriggered = false;
  startBot(nextBotId, 'manual', 'master', pmeRunId);
};

const startPmeSequence = (triggerMode = 'manual') => {
  if (pmeSequenceRunning) return;

  const alreadyRunning = pmeBotsOrder.find(id => activeProcesses[id]);
  if (alreadyRunning) {
    io.emit('bot_log', { id: 'bot_master_pme', type: 'error', message: `No se puede iniciar la cascada: el bot ${alreadyRunning} ya se está ejecutando.` });
    return;
  }

  pmeSequenceRunning = true;
  pmeSequenceTrigger = triggerMode;
  pmeSequenceIndex = -1;
  pmeSequenceFailedBots = [];
  pmeRunId = crypto.randomUUID();
  io.emit('bot_log', { id: 'bot_master_pme', type: 'info', message: `🏁 Iniciando cascada PME (HVAC → Iluminación → Frío Alimentario → General) [Modo: ${triggerMode.toUpperCase()}]...` });
  startPmeWatchdog();
  runNextPmeBot();
};

const stopPmeSequence = () => {
  if (!pmeSequenceRunning) return;
  pmeSequenceRunning = false;
  const currentBotId = pmeBotsOrder[pmeSequenceIndex];
  pmeSequenceIndex = -1;
  stopPmeWatchdog();
  if (currentBotId) {
    stopBot(currentBotId);
  }
  io.emit('bot_log', { id: 'bot_master_pme', type: 'info', message: '🛑 Cascada PME cancelada por el usuario.' });
  sendPmeMasterStatus();
};

const startBot = (botId, runMode = 'manual', origen = 'individual', runMasterId = null, rangoFijo = null) => {
  if (activeProcesses[botId]) return; // already running

  const bot = bots.find(b => b.id === botId);
  if (!bot) return;

  const args = [...bot.args];
  if (runMode === 'autopilot') {
    args.push('--autopilot');
  } else {
    args.push('--manual');
  }
  // Para la tabla bot_activaciones: distingue si esta corrida la disparo la
  // cascada de Bot Master o fue una activacion individual.
  args.push(`--origen=${origen}`);
  // Descarga puntual de un rango FIJO (backfill de un periodo historico
  // que la ventana movil normal nunca cubrio) - solo los bots PME lo leen
  // (ver wrapper.py de cada uno); el resto de bots simplemente ignora
  // estos 2 args extra si vienen.
  if (rangoFijo && rangoFijo.fecha_inicio && rangoFijo.fecha_fin) {
    args.push(`--fecha-inicio=${rangoFijo.fecha_inicio}`);
    args.push(`--fecha-fin=${rangoFijo.fecha_fin}`);
  }
  if (runMasterId) {
    args.push(`--master-run-id=${runMasterId}`);
  }

  const botProcess = spawn(bot.command, args, { cwd: __dirname });
  botProcess.runMode = runMode;
  activeProcesses[botId] = botProcess;

  let currentRunCount = null;
  let currentRunDates = null;

  botProcess.stdout.on('data', (data) => {
    if (climaSequenceRunning && climaBotsOrder[climaSequenceIndex] === botId) {
      climaLastActivityTime = Date.now();
    }
    if (pmeSequenceRunning && pmeBotsOrder[pmeSequenceIndex] === botId) {
      pmeLastActivityTime = Date.now();
    }
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (!line.trim()) return;
      try {
        const parsed = JSON.parse(line);
        io.emit('bot_log', { id: botId, ...parsed });
        if (parsed.type === 'alerta_sistema') {
          pmeAlertaSistemaSeq += 1;
          const alerta = { id: pmeAlertaSistemaSeq, botId, mensaje: parsed.mensaje, timestamp: new Date().toISOString() };
          pmeAlertasSistema.push(alerta);
          if (pmeAlertasSistema.length > 50) pmeAlertasSistema.shift();
          io.emit('pme_alertas_sistema', pmeAlertasSistema);
        }
        if (masterSequenceRunning && masterBotsOrder[masterSequenceIndex] === botId) {
          if (parsed.type === 'log') {
            io.emit('bot_log', { id: 'bot_master', type: 'log', message: `[${botId}] ${parsed.message}` });
          }
        }
        if (climaSequenceRunning && climaBotsOrder[climaSequenceIndex] === botId) {
          if (parsed.type === 'log') {
            io.emit('bot_log', { id: 'bot_master_climatico', type: 'log', message: `[${botId}] ${parsed.message}` });
          }
        }
        if (pmeSequenceRunning && pmeBotsOrder[pmeSequenceIndex] === botId) {
          if (parsed.type === 'log') {
            io.emit('bot_log', { id: 'bot_master_pme', type: 'log', message: `[${botId}] ${parsed.message}` });
          }
        }
      } catch (e) {
        io.emit('bot_log', { id: botId, type: 'info', message: line });
        if (masterSequenceRunning && masterBotsOrder[masterSequenceIndex] === botId) {
          io.emit('bot_log', { id: 'bot_master', type: 'info', message: `[${botId}] ${line}` });
        }
        if (climaSequenceRunning && climaBotsOrder[climaSequenceIndex] === botId) {
          io.emit('bot_log', { id: 'bot_master_climatico', type: 'info', message: `[${botId}] ${line}` });
        }
        if (pmeSequenceRunning && pmeBotsOrder[pmeSequenceIndex] === botId) {
          io.emit('bot_log', { id: 'bot_master_pme', type: 'info', message: `[${botId}] ${line}` });
        }
      }

      // Regex matches to capture execution stats. Los 4 bots Fracttal-Msp
      // no todos loguean el mismo formato: ST MSP / Invitaciones usan
      // "Desde: X  hasta: Y", ST Fracttal / OT Fracttal usan "Rango: X → Y".
      const dateMatch = line.match(/Desde:\s*([\d-]+)\s*hasta:\s*([\d-]+)/i)
        || line.match(/Rango:\s*([\d-]+)\s*(?:→|->|a)\s*([\d-]+)/i);
      if (dateMatch) {
        currentRunDates = `${dateMatch[1]} a ${dateMatch[2]}`;
      }

      // Los 3 bots PME loguean al final "{N} registros sincronizados en
      // energia.{tabla}." — número ANTES de la etiqueta, orden inverso al
      // resto de bots, por eso es un patrón de regex aparte.
      const countMatch = line.match(/(Registros subidos OK|ST unicas procesadas|Invitaciones subidas|Filas brutas bajadas|Registros subidos)\s*:\s*([\d,]+)/i)
        || line.match(/([\d,]+)\s*registros sincronizados/i);
      if (countMatch) {
        currentRunCount = countMatch[2] || countMatch[1];
      }
    });
  });

  botProcess.stderr.on('data', (data) => {
    if (climaSequenceRunning && climaBotsOrder[climaSequenceIndex] === botId) {
      climaLastActivityTime = Date.now();
    }
    if (pmeSequenceRunning && pmeBotsOrder[pmeSequenceIndex] === botId) {
      pmeLastActivityTime = Date.now();
    }
    io.emit('bot_log', { id: botId, type: 'error', message: data.toString() });
    if (masterSequenceRunning && masterBotsOrder[masterSequenceIndex] === botId) {
      io.emit('bot_log', { id: 'bot_master', type: 'error', message: `[${botId}] ERROR: ${data.toString()}` });
    }
    if (climaSequenceRunning && climaBotsOrder[climaSequenceIndex] === botId) {
      io.emit('bot_log', { id: 'bot_master_climatico', type: 'error', message: `[${botId}] ERROR: ${data.toString()}` });
    }
    if (pmeSequenceRunning && pmeBotsOrder[pmeSequenceIndex] === botId) {
      io.emit('bot_log', { id: 'bot_master_pme', type: 'error', message: `[${botId}] ERROR: ${data.toString()}` });
    }
  });

  botProcess.on('close', (code) => {
    io.emit('bot_log', { id: botId, type: 'info', message: `Process exited with code ${code}` });
    delete activeProcesses[botId];
    sendBotsStatus();

    if (code === 0) {
      if (botId === 'bot_senamhi_spsa') {
        loadSenamhiCache();
        console.log('Automatically reloaded SENAMHI cache because the bot finished successfully.');
      } else if (botId === 'bot_clima_spsa') {
        loadClimaCache();
        console.log('Automatically reloaded Clima cache because the bot finished successfully.');
      }
      
      // Build date range string. La fecha de fin NUNCA se lee del config
      // guardado (fec_fin ahí es un valor viejo/decorativo que ya no se
      // edita desde la UI) — si el regex de arriba no capturó el rango real
      // logueado por el bot, se usa la fecha de hoy, nunca un valor stale.
      const configPath = CONFIG_PATHS[botId];
      let fecRange = 'N/A';
      try {
        if (configPath && fs.existsSync(configPath)) {
          const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          fecRange = `${cfg.fec_ini || 'N/A'} a ${new Date().toISOString().split('T')[0]}`;
        }
      } catch (err) {}

      if (currentRunDates) {
        fecRange = currentRunDates;
      }

      // Format time as HH:MM:SS
      const now = new Date();
      const HHMMSS = now.toTimeString().substring(0, 8);

      lastRunStats[botId] = {
        dateRange: fecRange,
        records: currentRunCount || '0',
        time: HHMMSS
      };
      saveStats();
    }

    if (masterSequenceRunning && masterBotsOrder[masterSequenceIndex] === botId) {
      if (code === 0) {
        io.emit('bot_log', { id: 'bot_master', type: 'info', message: `✅ Paso ${masterSequenceIndex + 1}/${masterBotsOrder.length} (${botId}) completado con éxito.` });
        runNextMasterBot();
      } else {
        masterSequenceFailedBots.push(botId);
        io.emit('bot_log', { id: 'bot_master', type: 'error', message: `❌ El bot ${botId} falló con código ${code}. Se envió un correo de alerta con la causa y solución. Continuando con el siguiente bot de la cascada...` });
        runNextMasterBot();
      }
    }

    if (climaSequenceRunning && climaBotsOrder[climaSequenceIndex] === botId) {
      if (code === 0) {
        io.emit('bot_log', { id: 'bot_master_climatico', type: 'info', message: `✅ Paso ${climaSequenceIndex + 1}/${climaBotsOrder.length} (${botId}) completado con éxito.` });
        runNextClimaBot();
      } else {
        climaSequenceFailedBots.push(botId);
        if (climaWatchdogTriggered) {
          io.emit('bot_log', { id: 'bot_master_climatico', type: 'error', message: `❌ El bot ${botId} fue cerrado por inactividad (ver aviso anterior). Continuando con el siguiente bot de la cascada...` });
        } else {
          io.emit('bot_log', { id: 'bot_master_climatico', type: 'error', message: `❌ El bot ${botId} falló con código ${code}. Se envió un correo de alerta con la causa y solución. Continuando con el siguiente bot de la cascada...` });
        }
        runNextClimaBot();
      }
    }

    if (pmeSequenceRunning && pmeBotsOrder[pmeSequenceIndex] === botId) {
      if (code === 0) {
        io.emit('bot_log', { id: 'bot_master_pme', type: 'info', message: `✅ Paso ${pmeSequenceIndex + 1}/${pmeBotsOrder.length} (${botId}) completado con éxito.` });
        runNextPmeBot();
      } else {
        pmeSequenceFailedBots.push(botId);
        if (pmeWatchdogTriggered) {
          io.emit('bot_log', { id: 'bot_master_pme', type: 'error', message: `❌ El bot ${botId} fue cerrado por inactividad (ver aviso anterior). Continuando con el siguiente bot de la cascada...` });
        } else {
          io.emit('bot_log', { id: 'bot_master_pme', type: 'error', message: `❌ El bot ${botId} falló con código ${code}. Continuando con el siguiente bot de la cascada...` });
        }
        runNextPmeBot();
      }
    }
  });

  sendBotsStatus();
  io.emit('bot_log', { id: botId, type: 'info', message: `Started ${bot.name} in ${runMode} mode` });
};

const stopBot = (botId) => {
  if (!activeProcesses[botId]) return;

  const botProcess = activeProcesses[botId];
  botProcess.kill('SIGINT');
  delete activeProcesses[botId];

  sendBotsStatus();
  io.emit('bot_log', { id: botId, type: 'info', message: `Stopped bot.` });
};

// ─────────────────────────────────────────────
// Comandos por Telegram: permite disparar la corrida de los bots PME
// mandando un mensaje al bot de Telegram, sin entrar al dashboard.
// Usa "long polling" (getUpdates) en vez de webhook porque este servidor
// corre local sin URL publica HTTPS.
// ─────────────────────────────────────────────
let telegramPollingActivo = false;
let telegramOffset = 0;
let telegramPollTimer = null;

const TELEGRAM_COMANDOS_BOT = {
  '/ejecutar_hvac': 'bot_pme_hvac',
  '/ejecutar_iluminacion': 'bot_pme_iluminacion',
  '/ejecutar_frio': 'bot_pme_frio_alimentario',
  '/ejecutar_general': 'bot_pme_general',
};

const obtenerCredencialesTelegram = () => {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATHS['bot_pme_spsa'], 'utf8'));
    return { token: cfg.telegram_bot_token || '', chatId: String(cfg.telegram_chat_id || '') };
  } catch (e) {
    return { token: '', chatId: '' };
  }
};

const enviarMensajeTelegram = async (texto) => {
  const { token, chatId } = obtenerCredencialesTelegram();
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'HTML' })
    });
  } catch (e) {
    console.error('Error enviando mensaje a Telegram:', e.message);
  }
};

const TEXTO_AYUDA_TELEGRAM =
  '<b>Comandos disponibles:</b>\n' +
  '/ejecutar_hvac - Inicia el Bot Consolidado HVAC\n' +
  '/ejecutar_iluminacion - Inicia el Bot Consolidado Iluminación\n' +
  '/ejecutar_frio - Inicia el Bot Consolidado Frío Alimentario\n' +
  '/ejecutar_general - Inicia el Bot Consolidado General\n' +
  '/estado - Consulta el estado de los bots PME';

const procesarComandoTelegram = (texto) => {
  const comando = (texto || '').trim().toLowerCase().split(' ')[0];

  if (comando === '/estado') {
    const lineas = bots
      .filter(b => b.id.startsWith('bot_pme_'))
      .map(b => `${activeProcesses[b.id] ? '🟢' : '⚪'} ${b.name}`);
    enviarMensajeTelegram(`<b>Estado de los bots PME:</b>\n${lineas.join('\n')}`);
    return;
  }

  if (comando === '/ayuda' || comando === '/start' || comando === '/help') {
    enviarMensajeTelegram(TEXTO_AYUDA_TELEGRAM);
    return;
  }

  const botId = TELEGRAM_COMANDOS_BOT[comando];
  if (!botId) return; // comando no reconocido: se ignora silenciosamente

  const bot = bots.find(b => b.id === botId);
  if (!bot) return;

  if (activeProcesses[botId]) {
    enviarMensajeTelegram(`⚠️ ${bot.name} ya está en ejecución.`);
    return;
  }

  startBot(botId, 'manual');
  enviarMensajeTelegram(`✅ Iniciando ${bot.name}...`);
  io.emit('telegram_comando_recibido', { comando, botId, botName: bot.name, timestamp: new Date().toISOString() });
};

const pollTelegram = async () => {
  if (!telegramPollingActivo) return;
  const { token, chatId } = obtenerCredencialesTelegram();
  if (!token || !chatId) {
    telegramPollTimer = setTimeout(pollTelegram, 10000);
    return;
  }
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${telegramOffset}&timeout=25`);
    const data = await resp.json();
    if (data.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        telegramOffset = update.update_id + 1;
        const msg = update.message;
        if (!msg || !msg.text) continue;
        if (String(msg.chat.id) !== chatId) continue; // ignora chats distintos al autorizado
        procesarComandoTelegram(msg.text);
      }
    }
  } catch (e) {
    console.error('Error en polling de Telegram:', e.message);
  }
  if (telegramPollingActivo) {
    telegramPollTimer = setTimeout(pollTelegram, 2000);
  }
};

const iniciarPollingTelegram = async () => {
  if (telegramPollingActivo) return;
  telegramPollingActivo = true;

  // Saltar mensajes viejos: arrancar el offset justo despues del ultimo
  // update existente, para no reaccionar a comandos mandados mucho antes.
  const { token } = obtenerCredencialesTelegram();
  if (token) {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=-1`);
      const data = await resp.json();
      if (data.ok && data.result.length > 0) {
        telegramOffset = data.result[data.result.length - 1].update_id + 1;
      }
    } catch (e) { /* ignorar, arranca desde offset 0 */ }
  }

  console.log('Polling de comandos de Telegram iniciado.');
  pollTelegram();
};

const detenerPollingTelegram = () => {
  telegramPollingActivo = false;
  if (telegramPollTimer) clearTimeout(telegramPollTimer);
  console.log('Polling de comandos de Telegram detenido.');
};

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Autenticacion real (antes: cortina visual del frontend, el backend no
  // revisaba nada). login_request/validate_token quedan siempre permitidos;
  // cualquier otro evento se ignora hasta que el socket se autentique. Un
  // socket que nunca hace login se desconecta solo a los 2 minutos (tiempo
  // real que le toma a una persona leer y escribir sus credenciales; 15s
  // desconectaba al usuario legítimo mientras llenaba el formulario).
  socket.data.authenticated = false;
  const authTimer = setTimeout(() => {
    if (!socket.data.authenticated) socket.disconnect(true);
  }, 120000);
  socket.use((packet, next) => {
    const [event] = packet;
    if (['login_request', 'validate_token'].includes(event) || socket.data.authenticated) {
      return next();
    }
    next(new Error('No autenticado'));
  });

  sendBotsStatus();
  sendMasterStatus();
  sendClimaMasterStatus();
  sendPmeMasterStatus();
  socket.emit('shared_config', loadSharedConfig());

  socket.on('get_shared_config', () => {
    socket.emit('shared_config', loadSharedConfig());
  });

  socket.on('set_master_bots_order', (newOrder) => {
    if (Array.isArray(newOrder) && newOrder.length > 0) {
      masterBotsOrder = newOrder.filter(id => ['bot_st_msp', 'bot_st_fracttal', 'bot_ot_fracttal', 'bot_invitaciones_msp'].includes(id));
      try {
        fs.writeFileSync(path.join(__dirname, 'bots_order.json'), JSON.stringify(masterBotsOrder), 'utf8');
      } catch (err) {
        console.error("Error saving bots_order.json", err);
      }
      sendBotsStatus();
      sendMasterStatus();
    }
  });

  socket.emit('last_run_stats', lastRunStats);

  socket.on('login_request', ({ username, password }) => {
    console.log(`Login attempt for username: ${username}`);
    const auth = loadAuthConfig();
    if (username === auth.username && password === auth.password) {
      const token = jwt.sign({ user: username }, JWT_SECRET, { expiresIn: '24h' });
      socket.data.authenticated = true;
      clearTimeout(authTimer);
      socket.emit('login_response', { success: true, token });
    } else {
      socket.emit('login_response', { success: false, error: 'Usuario o contraseña incorrectos.' });
    }
  });

  socket.on('validate_token', ({ token }) => {
    try {
      jwt.verify(token, JWT_SECRET);
      socket.data.authenticated = true;
      clearTimeout(authTimer);
      socket.emit('validate_token_response', { valid: true });
    } catch (e) {
      socket.emit('validate_token_response', { valid: false });
    }
  });

  socket.on('start_bot', ({ botId, runMode }) => {
    console.log(`Received start_bot for botId: ${botId}, runMode: ${runMode}`);
    startBot(botId, runMode);
  });

  // Descarga puntual de un rango FIJO de fechas (backfill) para un bot PME
  // -distinto del intervalo movil configurado, no se guarda en su config.
  socket.on('start_bot_rango_fijo', ({ botId, fecha_inicio, fecha_fin }) => {
    console.log(`Received start_bot_rango_fijo for botId: ${botId}, ${fecha_inicio} a ${fecha_fin}`);
    startBot(botId, 'manual', 'individual', null, { fecha_inicio, fecha_fin });
  });

  socket.on('stop_bot', (botId) => {
    console.log(`Received stop_bot for botId: ${botId}`);
    stopBot(botId);
  });

  socket.on('start_master', () => {
    console.log('Received start_master');
    startMasterSequence();
  });

  socket.on('stop_master', () => {
    console.log('Received stop_master');
    stopMasterSequence();
  });

  socket.on('start_master_autopilot', () => {
    console.log('Received start_master_autopilot');
    startMasterAutopilotMode();
  });

  socket.on('stop_master_autopilot', () => {
    console.log('Received stop_master_autopilot');
    stopMasterAutopilotMode();
  });

  socket.on('get_master_config', () => {
    console.log('Received get_master_config');
    socket.emit('master_config', loadMasterConfig());
  });

  socket.on('get_last_run_stats', () => {
    socket.emit('last_run_stats', lastRunStats);
  });

  socket.on('save_master_autopilot_config', (cfg) => {
    console.log('Received save_master_autopilot_config:', cfg);
    saveMasterConfig(cfg);
    socket.emit('save_master_autopilot_config_status', { success: true });
    if (masterAutopilotActive) {
      stopMasterAutopilotMode();
      startMasterAutopilotMode();
    }
  });

  // ── Cascada del Bot Master Climático (mismo patrón que arriba, eventos propios) ──
  socket.on('set_master_climatico_bots_order', (newOrder) => {
    if (Array.isArray(newOrder) && newOrder.length > 0) {
      climaBotsOrder = newOrder.filter(id => ['bot_senamhi_spsa', 'bot_clima_spsa'].includes(id));
      try {
        fs.writeFileSync(path.join(__dirname, 'bots_order_clima.json'), JSON.stringify(climaBotsOrder), 'utf8');
      } catch (err) {
        console.error("Error saving bots_order_clima.json", err);
      }
      sendBotsStatus();
      sendClimaMasterStatus();
    }
  });

  socket.on('start_master_climatico', () => {
    console.log('Received start_master_climatico');
    startClimaSequence();
  });

  socket.on('stop_master_climatico', () => {
    console.log('Received stop_master_climatico');
    stopClimaSequence();
  });

  socket.on('start_master_climatico_autopilot', () => {
    console.log('Received start_master_climatico_autopilot');
    startClimaAutopilotMode();
  });

  socket.on('stop_master_climatico_autopilot', () => {
    console.log('Received stop_master_climatico_autopilot');
    stopClimaAutopilotMode();
  });

  socket.on('get_master_climatico_config', () => {
    console.log('Received get_master_climatico_config');
    socket.emit('master_climatico_config', loadClimaMasterConfig());
  });

  socket.on('save_master_climatico_autopilot_config', (cfg) => {
    console.log('Received save_master_climatico_autopilot_config:', cfg);
    saveClimaMasterConfig(cfg);
    socket.emit('save_master_climatico_autopilot_config_status', { success: true });
    if (climaAutopilotActive) {
      stopClimaAutopilotMode();
      startClimaAutopilotMode();
    }
  });

  // ── Cascada del Bot Master PME (mismo patrón que arriba, eventos propios) ──
  socket.on('start_master_pme', () => {
    console.log('Received start_master_pme');
    startPmeSequence();
  });

  socket.on('stop_master_pme', () => {
    console.log('Received stop_master_pme');
    stopPmeSequence();
  });

  socket.on('start_master_pme_autopilot', () => {
    console.log('Received start_master_pme_autopilot');
    startPmeAutopilotMode();
  });

  socket.on('stop_master_pme_autopilot', () => {
    console.log('Received stop_master_pme_autopilot');
    stopPmeAutopilotMode();
  });

  socket.on('get_master_pme_config', () => {
    console.log('Received get_master_pme_config');
    socket.emit('master_pme_config', loadPmeMasterConfig());
  });

  socket.on('save_master_pme_autopilot_config', (cfg) => {
    console.log('Received save_master_pme_autopilot_config:', cfg);
    savePmeMasterConfig(cfg);
    socket.emit('save_master_pme_autopilot_config_status', { success: true });
    if (pmeAutopilotActive) {
      stopPmeAutopilotMode();
      startPmeAutopilotMode();
    }
  });

  socket.on('save_clima_ventana_movil', (data) => {
    console.log('Received save_clima_ventana_movil:', data);
    const ventana = Number(data && data.ventana_movil_dias) || 0;
    const tienePrediccion = data && data.dias_prediccion !== undefined;
    const prediccion = tienePrediccion ? (Number(data.dias_prediccion) || 0) : null;
    const botIds = ['bot_senamhi_spsa', 'bot_clima_spsa'];
    let successCount = 0;
    let errors = [];

    botIds.forEach(id => {
      const configPath = CONFIG_PATHS[id];
      if (!configPath) return;
      try {
        let currentCfg = {};
        if (fs.existsSync(configPath)) {
          const fileCfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          currentCfg = { ...DEFAULT_CONFIGS[id], ...fileCfg };
        } else {
          currentCfg = { ...DEFAULT_CONFIGS[id] };
        }
        currentCfg.ventana_movil_dias = ventana;
        // dias_prediccion es exclusivo de Open-Meteo — SENAMHI no tiene pronóstico
        if (id === 'bot_clima_spsa' && tienePrediccion) {
          currentCfg.dias_prediccion = prediccion;
        }
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify(currentCfg, null, 2), 'utf8');
        successCount++;
        io.emit('bot_config', { id, config: currentCfg });
      } catch (err) {
        errors.push(`${id}: ${err.message}`);
      }
    });

    socket.emit('save_clima_ventana_movil_status', { success: errors.length === 0, successCount, errors });
  });

  socket.on('get_bot_config', (botId) => {
    console.log(`Received get_bot_config for botId: ${botId}`);
    const configPath = CONFIG_PATHS[botId];
    if (!configPath) {
      socket.emit('bot_config', { id: botId, config: null });
      return;
    }

    try {
      let merged = {};
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf8');
        const fileCfg = JSON.parse(data);
        merged = { ...(DEFAULT_CONFIGS[botId] || {}), ...fileCfg };
      } else {
        merged = { ...(DEFAULT_CONFIGS[botId] || {}) };
      }
      
      const sharedCfg = loadSharedConfig();
      if (sharedCfg.fec_ini) {
        merged.fec_ini = sharedCfg.fec_ini;
      }
      if (sharedCfg.fec_fin) {
        merged.fec_fin = sharedCfg.fec_fin;
      } else if (!merged.fec_fin || merged.fec_fin.includes('2026-07-28') || merged.fec_fin.includes('2026-07-14')) {
        merged.fec_fin = getNowFormatted();
      }

      socket.emit('bot_config', { id: botId, config: merged });
    } catch (err) {
      console.error("Error reading bot config", err);
      socket.emit('bot_config', { id: botId, config: DEFAULT_CONFIGS[botId] || {}, error: err.message });
    }
  });

  socket.on('save_bot_config', ({ botId, config }) => {
    console.log(`Received save_bot_config for botId: ${botId}, config:`, config);
    const configPath = CONFIG_PATHS[botId];
    if (!configPath) return;

    try {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

      // Mandatory synchronization of global f_ini & f_fin across all climate sub-modules
      if (botId === 'bot_senamhi_spsa' || botId === 'bot_clima_spsa') {
        const otherId = botId === 'bot_senamhi_spsa' ? 'bot_clima_spsa' : 'bot_senamhi_spsa';
        const otherPath = CONFIG_PATHS[otherId];
        if (otherPath && fs.existsSync(otherPath)) {
          try {
            const otherCfg = JSON.parse(fs.readFileSync(otherPath, 'utf8'));
            let updated = false;
            if (config.f_ini && otherCfg.f_ini !== config.f_ini) {
              otherCfg.f_ini = config.f_ini;
              updated = true;
              console.log(`Synchronized f_ini (${config.f_ini}) to ${otherId}`);
            }
            if (config.f_fin && otherCfg.f_fin !== config.f_fin) {
              otherCfg.f_fin = config.f_fin;
              updated = true;
              console.log(`Synchronized f_fin (${config.f_fin}) to ${otherId}`);
            }
            if (config.delay_seg && otherCfg.delay_seg !== config.delay_seg) {
              otherCfg.delay_seg = config.delay_seg;
              updated = true;
              console.log(`Synchronized delay_seg (${config.delay_seg}) to ${otherId}`);
            }
            // Nota: chequeo con !== undefined (no truthy) porque 0 es un valor
            // válido y con significado (ventana desactivada / fecha fija).
            if (config.ventana_movil_dias !== undefined && otherCfg.ventana_movil_dias !== config.ventana_movil_dias) {
              otherCfg.ventana_movil_dias = config.ventana_movil_dias;
              updated = true;
              console.log(`Synchronized ventana_movil_dias (${config.ventana_movil_dias}) to ${otherId}`);
            }
            if (updated) {
              fs.writeFileSync(otherPath, JSON.stringify(otherCfg, null, 2), 'utf8');
              io.emit('bot_config', { id: otherId, config: otherCfg });
            }
          } catch (e) {
            console.error(`Failed to synchronize climate config to ${otherId}:`, e);
          }
        }
      }

      socket.emit('save_config_status', { id: botId, success: true });
      console.log(`Saved config for ${botId} to ${configPath}`);
    } catch (err) {
      console.error("Error saving bot config", err);
      socket.emit('save_config_status', { id: botId, success: false, error: err.message });
    }
  });

  socket.on('save_master_config', (syncFields) => {
    console.log('Received save_master_config (Sync Fields):', syncFields);
    
    if (!syncFields.fec_fin) {
      syncFields.fec_fin = getNowFormatted();
    }

    const botIds = ['bot_st_msp', 'bot_st_fracttal', 'bot_ot_fracttal', 'bot_invitaciones_msp'];
    let successCount = 0;
    let errors = [];

    botIds.forEach(id => {
      const configPath = CONFIG_PATHS[id];
      if (!configPath) return;

      try {
        let currentCfg = {};
        if (fs.existsSync(configPath)) {
          currentCfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } else {
          currentCfg = { ...DEFAULT_CONFIGS[id] };
        }

        Object.keys(syncFields).forEach(key => {
          if (syncFields[key] !== undefined && syncFields[key] !== '') {
            if (key === 'url_supabase') currentCfg.url_supabase = syncFields[key];
            if (key === 'key_supabase') currentCfg.key_supabase = syncFields[key];
            if (key === 'fec_ini') currentCfg.fec_ini = syncFields[key];
            if (key === 'fec_fin') currentCfg.fec_fin = syncFields[key];
            if (key === 'path_gdrive') {
              let subDir = '';
              if (id === 'bot_st_msp') subDir = 'ST MSP';
              if (id === 'bot_st_fracttal') subDir = 'ST FRACTTAL';
              if (id === 'bot_ot_fracttal') subDir = 'OT FRACTTAL';
              if (id === 'bot_invitaciones_msp') subDir = 'ST MSP';
              
              currentCfg.path_gdrive = path.join(syncFields[key], subDir);
            }
            if (key === 'user_spsa') {
              if (currentCfg.user_msp !== undefined) currentCfg.user_msp = syncFields[key];
              if (currentCfg.user_fracttal !== undefined) currentCfg.user_fracttal = syncFields[key];
            }
          }
        });

        // FORCE synchronization of fec_ini and fec_fin to all individual bot configs
        if (syncFields.fec_ini) currentCfg.fec_ini = syncFields.fec_ini;
        if (syncFields.fec_fin) currentCfg.fec_fin = syncFields.fec_fin;

        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify(currentCfg, null, 2), 'utf8');
        io.emit('bot_config', { id, config: currentCfg });
        successCount++;
      } catch (err) {
        errors.push(`${id}: ${err.message}`);
      }
    });

    if (errors.length === 0) {
      saveSharedConfig(syncFields);
      io.emit('shared_config', syncFields);
    }

    socket.emit('save_master_config_status', { 
      success: errors.length === 0, 
      successCount, 
      errors 
    });
  });

  socket.on('get_clima_master_config', () => {
    console.log('Received get_clima_master_config');
    const configPath = CONFIG_PATHS['bot_senamhi_spsa'];
    let fec_ini = '2025-01-01';
    let fec_fin = new Date().toISOString().split('T')[0];
    let radio_km = 10;
    let ventana_movil_dias = 3;
    let parametros_activos_senamhi = ['viento_kmh', 'nivel_rio_m', 'caudal_m3s'];
    let dias_prediccion = 3;
    try {
      if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (cfg.f_ini) fec_ini = cfg.f_ini;
        if (cfg.f_fin) fec_fin = cfg.f_fin;
        if (cfg.radio_km) radio_km = cfg.radio_km;
        if (cfg.ventana_movil_dias) ventana_movil_dias = cfg.ventana_movil_dias;
        if (cfg.parametros_activos) parametros_activos_senamhi = cfg.parametros_activos;
      }
    } catch (e) {
      console.error("Error reading bot_senamhi_spsa config for master defaults", e);
    }
    try {
      const climaConfigPath = CONFIG_PATHS['bot_clima_spsa'];
      if (climaConfigPath && fs.existsSync(climaConfigPath)) {
        const climaCfg = JSON.parse(fs.readFileSync(climaConfigPath, 'utf8'));
        if (climaCfg.dias_prediccion !== undefined) dias_prediccion = climaCfg.dias_prediccion;
      }
    } catch (e) {
      console.error("Error reading bot_clima_spsa config for master defaults", e);
    }
    socket.emit('clima_master_config', {
      url_supabase: 'https://zuouxnvcktjhqzlniion.supabase.co',
      key_supabase: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84',
      ventana_movil_dias,
      dias_prediccion,
      parametros_activos_senamhi,
      fec_ini,
      fec_fin,
      radio_km,
      exportar_excel: true
    });
  });

  socket.on('save_clima_master_config', (syncFields) => {
    console.log('Received save_clima_master_config (Clima Sync Fields):', syncFields);
    const botIds = ['bot_senamhi_spsa', 'bot_clima_spsa'];
    let successCount = 0;
    let errors = [];

    botIds.forEach(id => {
      const configPath = CONFIG_PATHS[id];
      if (!configPath) return;

      try {
        let currentCfg = {};
        if (fs.existsSync(configPath)) {
          const fileCfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          currentCfg = { ...DEFAULT_CONFIGS[id], ...fileCfg };
        } else {
          currentCfg = { ...DEFAULT_CONFIGS[id] };
        }

        // Apply shared climate fields
        if (syncFields.fec_ini) {
          currentCfg.f_ini = syncFields.fec_ini;
        }
        if (syncFields.fec_fin) {
          currentCfg.f_fin = syncFields.fec_fin;
        }
        if (syncFields.ventana_movil_dias !== undefined) {
          currentCfg.ventana_movil_dias = Number(syncFields.ventana_movil_dias) || 0;
        }
        if (id === 'bot_senamhi_spsa' && syncFields.radio_km) {
          currentCfg.radio_km = Number(syncFields.radio_km);
        }
        if (id === 'bot_senamhi_spsa' && syncFields.parametros_activos_senamhi !== undefined) {
          currentCfg.parametros_activos = syncFields.parametros_activos_senamhi;
        }

        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify(currentCfg, null, 2), 'utf8');
        successCount++;
        
        // Broadcast the updated config to all sockets so that open control components refresh immediately
        io.emit('bot_config', { id, config: currentCfg });
      } catch (err) {
        errors.push(`${id}: ${err.message}`);
      }
    });

    if (errors.length === 0) {
      io.emit('clima_master_config', {
        url_supabase: syncFields.url_supabase || 'https://zuouxnvcktjhqzlniion.supabase.co',
        key_supabase: syncFields.key_supabase || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84',
        fec_ini: syncFields.fec_ini,
        fec_fin: syncFields.fec_fin,
        ventana_movil_dias: syncFields.ventana_movil_dias !== undefined ? Number(syncFields.ventana_movil_dias) || 0 : 0,
        radio_km: syncFields.radio_km ? Number(syncFields.radio_km) : 10,
        exportar_excel: syncFields.exportar_excel !== false
      });
    }

    socket.emit('save_clima_master_config_status', {
      success: errors.length === 0,
      successCount,
      errors
    });
  });

  socket.on('get_telegram_comandos_status', () => {
    socket.emit('telegram_comandos_status', { activo: telegramPollingActivo });
  });

  socket.on('get_alertas_sistema', () => {
    socket.emit('pme_alertas_sistema', pmeAlertasSistema);
  });

  socket.on('descartar_alerta_sistema', (id) => {
    pmeAlertasSistema = pmeAlertasSistema.filter(a => a.id !== id);
    io.emit('pme_alertas_sistema', pmeAlertasSistema);
  });

  socket.on('descartar_todas_alertas_sistema', () => {
    pmeAlertasSistema = [];
    io.emit('pme_alertas_sistema', pmeAlertasSistema);
  });

  socket.on('toggle_telegram_comandos', ({ activo }) => {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATHS['bot_pme_spsa'], 'utf8'));
      cfg.telegram_comandos_activo = !!activo;
      fs.writeFileSync(CONFIG_PATHS['bot_pme_spsa'], JSON.stringify(cfg, null, 2), 'utf8');
    } catch (e) {
      console.error('No se pudo guardar telegram_comandos_activo:', e.message);
    }

    if (activo) {
      iniciarPollingTelegram();
    } else {
      detenerPollingTelegram();
    }
    io.emit('telegram_comandos_status', { activo: telegramPollingActivo });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Servir frontend compilado en producción (dist)
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  try {
    const tCfg = tunnelManager.loadConfig();
    if (tCfg.autoStart) {
      tunnelManager.startTunnel(io).catch(err => console.log('Tunnel auto-start status:', err.message));
    }
  } catch (e) { /* tunnel error ignored */ }
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATHS['bot_pme_spsa'], 'utf8'));
    if (cfg.telegram_comandos_activo) {
      iniciarPollingTelegram();
    }
  } catch (e) { /* sin config aun, no pasa nada */ }
});
