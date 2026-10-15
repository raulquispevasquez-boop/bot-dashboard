const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(__dirname, 'tunnel_config.json');
const CLOUDFLARED_PATH = path.join(__dirname, '..', 'tools', 'cloudflared.exe');
const STARTUP_DIR = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
  : null;
const STARTUP_VBS_PATH = STARTUP_DIR ? path.join(STARTUP_DIR, 'BotManager_AutoStart.vbs') : null;

const DEFAULT_CONFIG = {
  token: 'eyJhIjoiODk4MzNiNDUxNGI5MGI0ZTk4YjJiZjU2NTZkNzRiNTAiLCJ0IjoiNmE2Mjc1YTYtZjFkNy00NGYzLTk5ZTYtYzBhNTczODU4NmFjIiwicyI6IllqWmpNMlExWWpndE5USmxPQzAwT0dRNExXSmhNemd0TWpZMk1HRXlZV1k1WTJabCJ9',
  domain: 'https://www.botmanager.date',
  protocol: 'http2',
  autoStart: true,
  startOnWindowsBoot: false,
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    }
  } catch (e) {
    console.error('Error cargando tunnel_config.json:', e);
  }
  saveConfig(DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error guardando tunnel_config.json:', e);
    return false;
  }
}

function isProcessRunning() {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq cloudflared.exe" /NH', (err, stdout) => {
      if (err || !stdout) return resolve(false);
      const isRunning = stdout.toLowerCase().includes('cloudflared.exe');
      resolve(isRunning);
    });
  });
}

async function getStatus() {
  const cfg = loadConfig();
  const running = await isProcessRunning();
  const hasStartupVbs = STARTUP_VBS_PATH ? fs.existsSync(STARTUP_VBS_PATH) : false;

  return {
    running,
    domain: cfg.domain,
    protocol: cfg.protocol,
    autoStart: cfg.autoStart,
    startOnWindowsBoot: hasStartupVbs,
    tokenConfigured: !!cfg.token,
  };
}

async function startTunnel(io = null) {
  const cfg = loadConfig();
  if (!cfg.token) {
    throw new Error('No hay token de Cloudflare configurado');
  }

  const alreadyRunning = await isProcessRunning();
  if (alreadyRunning) {
    if (io) io.emit('tunnel_status', await getStatus());
    return { success: true, message: 'El túnel ya está en ejecución' };
  }

  if (!fs.existsSync(CLOUDFLARED_PATH)) {
    throw new Error(`No se encontró el ejecutable en: ${CLOUDFLARED_PATH}`);
  }

  const args = ['tunnel', '--protocol', cfg.protocol || 'http2', 'run', '--token', cfg.token];
  const child = spawn(CLOUDFLARED_PATH, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });

  child.unref();

  // Esperar un momento a que el proceso se registre
  await new Promise((r) => setTimeout(r, 1500));

  const status = await getStatus();
  if (io) io.emit('tunnel_status', status);

  return { success: status.running, message: status.running ? 'Túnel iniciado correctamente' : 'Iniciando túnel...' };
}

async function stopTunnel(io = null) {
  return new Promise((resolve) => {
    exec('taskkill /F /IM cloudflared.exe /T', async () => {
      await new Promise((r) => setTimeout(r, 1000));
      const status = await getStatus();
      if (io) io.emit('tunnel_status', status);
      resolve({ success: true, message: 'Túnel detenido correctamente' });
    });
  });
}

function setWindowsBoot(enable) {
  if (!STARTUP_VBS_PATH) return false;
  try {
    if (enable) {
      // VBS invisible que arranca el servidor Node silenciosamente
      const backendDir = path.resolve(__dirname);
      const vbsContent = `' Script para iniciar Bot Manager y Tunel Cloudflare en segundo plano sin ventanas
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "${backendDir}"
WshShell.Run "node server.js", 0, False
`;
      fs.writeFileSync(STARTUP_VBS_PATH, vbsContent, 'utf8');
    } else {
      if (fs.existsSync(STARTUP_VBS_PATH)) {
        fs.unlinkSync(STARTUP_VBS_PATH);
      }
    }

    const cfg = loadConfig();
    cfg.startOnWindowsBoot = enable;
    saveConfig(cfg);
    return true;
  } catch (e) {
    console.error('Error configurando inicio con Windows:', e);
    return false;
  }
}

module.exports = {
  loadConfig,
  saveConfig,
  getStatus,
  startTunnel,
  stopTunnel,
  setWindowsBoot,
};
