const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const router = express.Router();

const PYTHON_EXEC = 'e:\\bot-dashboard\\python_env\\python\\python.exe';
const SCRIPT_PATH = path.join(__dirname, 'agente_correo.py');

// Clientes SSE suscritos
const sseClients = new Map();
let clientCounter = 0;

// Proceso del bot activo — se guarda para poder matarlo
let activeBot = null;

// ─── SSE: Canal de eventos en tiempo real ─────────────────────────────────────
router.get('/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const id = ++clientCounter;
  sseClients.set(id, res);

  const ping = setInterval(() => res.write('event: ping\ndata: {}\n\n'), 20000);
  req.on('close', () => { clearInterval(ping); sseClients.delete(id); });
});

const broadcast = (event, data) => {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => { try { res.write(payload); } catch (_) {} });
};

// ─── POST /detener ─────────────────────────────────────────────────────
router.post('/detener', (req, res) => {
  if (activeBot) {
    try {
      // En Windows necesitamos matar el proceso y sus hijos (el Chrome incluido)
      const { execSync } = require('child_process');
      try {
        execSync(`taskkill /PID ${activeBot.pid} /T /F`, { stdio: 'ignore' });
      } catch (_) {}
      activeBot.kill('SIGKILL');
    } catch (_) {}
    activeBot = null;
    broadcast('log',    { msg: '⛔ Bot detenido por el usuario.', ts: new Date().toLocaleTimeString('es-PE') });
    broadcast('status', { running: false });
    broadcast('result', { type: 'done', success: false, error: 'Detenido por el usuario.' });
    return res.json({ ok: true, msg: 'Bot detenido.' });
  }
  res.json({ ok: false, msg: 'No hay bot activo.' });
});

// ─── POST /kill-excel ──────────────────────────────────────────────────
router.post('/kill-excel', (req, res) => {
  try {
    const { execSync } = require('child_process');
    execSync('taskkill /F /IM excel.exe', { stdio: 'ignore' });
    broadcast('log', { msg: '🔨 Limpieza: Todas las instancias de Excel fueron cerradas a la fuerza.', ts: new Date().toLocaleTimeString('es-PE'), type: 'SUCCESS' });
    return res.json({ ok: true, msg: 'Excel forzado a cerrar.' });
  } catch (e) {
    return res.json({ ok: false, msg: 'No se encontraron instancias de Excel o no se pudieron cerrar.' });
  }
});

// ─── POST /pausar ──────────────────────────────────────────────────────
router.post('/pausar', (req, res) => {
  try {
    const fs = require('fs');
    const pauseFile = path.join(__dirname, 'outlook_profile', 'pause.lock');
    fs.writeFileSync(pauseFile, 'pause');
    broadcast('status', { running: true, paused: true });
    return res.json({ ok: true });
  } catch (e) {
    return res.json({ ok: false });
  }
});

// ─── POST /reanudar ────────────────────────────────────────────────────
router.post('/reanudar', (req, res) => {
  try {
    const fs = require('fs');
    const pauseFile = path.join(__dirname, 'outlook_profile', 'pause.lock');
    if (fs.existsSync(pauseFile)) {
      fs.unlinkSync(pauseFile);
    }
    broadcast('status', { running: true, paused: false });
    return res.json({ ok: true });
  } catch (e) {
    return res.json({ ok: false });
  }
});


// ─── Lanza el bot Python y procesa eventos línea por línea ────────────────────
const runPythonBot = (action, args, timeoutMs = 360_000) => {
  return new Promise((resolve) => {
    const proc = spawn(PYTHON_EXEC, [SCRIPT_PATH, action, ...args], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
    activeBot = proc;  // ← Guardamos referencia para poder detenerlo
    let lineBuffer = '';
    let resolved   = false;

    // stderr → logs de texto al frontend en tiempo real
    proc.stderr.on('data', (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      lines.forEach(line => {
        // Limpiar prefijos del bot
        const clean = line.replace(/\[LOGIN\]|\[ANALIZAR\]|\[EXTRAER\]|\[FOLDER\]|\[BOT\]/g, '').trim();
        if (clean) {
          broadcast('log', { msg: clean, ts: new Date().toLocaleTimeString('es-PE') });
        }
      });
    });

    // stdout → eventos JSON con type: "done" | "email_progress" | "start"
    proc.stdout.on('data', (data) => {
      lineBuffer += data.toString();
      const lines = lineBuffer.split('\n');

      // Procesa todas las líneas completas, deja el fragmento incompleto en buffer
      lineBuffer = lines.pop(); // último fragmento (puede ser incompleto)

      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('{')) continue;

        try {
          const event = JSON.parse(t);

          if (event.type === 'start') {
            // Inicio de extracción: informa total de correos
            broadcast('extract_start', { total: event.total, excel_path: event.excel_path });

          } else if (event.type === 'email_progress') {
            // Un correo procesado → actualizar tabla y consola
            broadcast('email_progress', {
              index:  event.index,
              total:  event.total,
              email:  event.email,
            });
            // También como log
            broadcast('log', {
              msg: `📧 [${event.index}/${event.total}] ${event.email.remitente} — ${event.email.asunto.slice(0, 55)}`,
              ts:  new Date().toLocaleTimeString('es-PE'),
            });

          } else if (event.type === 'done') {
            // Evento final
            if (!resolved) {
              resolved = true;
              resolve(event);
            }
            broadcast('result', event);
            broadcast('status', { running: false });
          }

        } catch (_) {
          // Línea no es JSON válido, ignorar
        }
      }
    });

    proc.on('close', (code) => {
      if (!resolved) {
        const r = { success: false, error: `Proceso cerrado (código ${code})` };
        resolved = true;
        resolve(r);
        broadcast('result', r);
        broadcast('status', { running: false });
      }
    });

    proc.on('error', (err) => {
      const r = { success: false, error: 'No se pudo iniciar Python: ' + err.message };
      if (!resolved) { resolved = true; resolve(r); }
      broadcast('log',    { msg: '❌ ' + r.error, ts: new Date().toLocaleTimeString('es-PE') });
      broadcast('result', r);
    });

    // Timeout de seguridad
    setTimeout(() => {
      if (!resolved) {
        const r = { success: false, error: `Timeout: sin respuesta en ${timeoutMs / 60000} min.` };
        resolved = true;
        resolve(r);
        broadcast('result', r);
      }
    }, timeoutMs);

    broadcast('status', { running: true });
  });
};

// ─── POST /analizar ───────────────────────────────────────────────────────────
router.post('/analizar', async (req, res) => {
  const { email, password, folder } = req.body;
  if (!email || !password || !folder)
    return res.status(400).json({ error: 'Correo, contraseña y carpeta son requeridos.' });

  req.socket.setTimeout(420_000);
  res.setTimeout(420_000);

  broadcast('log', { msg: `▶ Analizando carpeta: "${folder}"`, ts: new Date().toLocaleTimeString('es-PE') });

  try {
    const result = await runPythonBot('analizar', [email, password, folder], 360_000);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /inventario ─────────────────────────────────────────────────────────
// Escaneo rápido (~0.35s/correo) — solo captura metadata, sin descargar EML.
// Genera Inventario_Correos.xlsx con fecha, remitente, asunto, tiene_adjuntos.
// Retomable: si el Excel existe, continúa desde donde quedó.
router.post('/inventario', async (req, res) => {
  const { email, password, folder, downloadPath, batchSize } = req.body;
  if (!email || !password || !folder || !downloadPath)
    return res.status(400).json({ error: 'Faltan: email, password, folder, downloadPath.' });

  const batch = batchSize || 2000;
  req.socket.setTimeout(0); // Sin timeout — puede correr horas

  broadcast('log', {
    msg: `📋 Iniciando INVENTARIO de "${folder}" | Lote: ${batch} correos`,
    ts: new Date().toLocaleTimeString('es-PE'), type: 'INFO'
  });

  try {
    // timeout = 8 horas — para cubrir un lote de 2000 correos a 0.4s/c
    const result = await runPythonBot('inventario', [email, password, folder, downloadPath, String(batch)], 28_800_000);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /extraer ────────────────────────────────────────────────────────────
// Descarga completa: EML + adjuntos + registro en Excel.
// batchSize (default 500) controla cuántos correos por sesión (retomable).
router.post('/extraer', async (req, res) => {
  const { email, password, folder, downloadPath, apiKey, soloAdjuntos, batchSize } = req.body;
  if (!email || !password || !folder || !downloadPath)
    return res.status(400).json({ error: 'Faltan: email, password, folder, downloadPath.' });

  const batch = batchSize || 500;
  req.socket.setTimeout(0); // Sin timeout fijo — corre hasta completar el lote

  broadcast('log', {
    msg: `▶ EXTRACCIÓN MASIVA de "${folder}" → ${downloadPath} | Lote: ${batch}`,
    ts: new Date().toLocaleTimeString('es-PE')
  });

  try {
    // timeout = 12 horas para lotes grandes
    const result = await runPythonBot(
      'extraer',
      [email, password, folder, downloadPath, apiKey || '', soloAdjuntos ? 'true' : 'false', String(batch)],
      43_200_000
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /seleccionar ────────────────────────────────────────────────────────
router.post('/seleccionar', async (req, res) => {
  const { email, password, folder, downloadPath } = req.body;
  if (!email || !password || !folder || !downloadPath)
    return res.status(400).json({ error: 'Faltan: email, password, folder, downloadPath.' });

  req.socket.setTimeout(600_000);

  broadcast('log', { msg: `▶ Seleccionando correos extraídos de: "${folder}"`, ts: new Date().toLocaleTimeString('es-PE') });

  try {
    const result = await runPythonBot('seleccionar', [email, password, folder, downloadPath], 540_000);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /eliminar ────────────────────────────────────────────────────────
router.post('/eliminar', async (req, res) => {
  const { email, password, folder, downloadPath } = req.body;
  if (!email || !password || !folder || !downloadPath)
    return res.status(400).json({ error: 'Faltan: email, password, folder, downloadPath.' });

  req.socket.setTimeout(600_000);

  broadcast('log', { msg: `▶ Eliminando automáticamente correos descargados de: "${folder}"`, ts: new Date().toLocaleTimeString('es-PE') });

  try {
    const result = await runPythonBot('eliminar', [email, password, folder, downloadPath], 540_000);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
