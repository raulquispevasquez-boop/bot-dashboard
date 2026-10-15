// Cliente para controlar Bot Manager (este dashboard) desde otra web.
// Copia este archivo (y opcionalmente useBotDashboard.js) a tu proyecto React/Vite.
// Requiere: npm install socket.io-client
//
// Uso mínimo:
//   import { createBotDashboardClient } from './botDashboardClient';
//   const client = createBotDashboardClient('https://tu-url-del-tunel.trycloudflare.com');
//   await client.login('admin', 'tu-password');
//   client.startBot('bot_pme_hvac');
//
// El socketUrl es la URL pública del túnel de Cloudflare (o http://localhost:3001
// en desarrollo). Esa misma URL/origen debe estar agregada a ALLOWED_ORIGINS en el
// .env del backend (backend/.env), si no, el navegador la bloquea por CORS.

import { io } from 'socket.io-client';

const TOKEN_KEY = 'bot_dashboard_token';

export function createBotDashboardClient(socketUrl) {
  const socket = io(socketUrl);

  let authenticated = false;
  const authListeners = new Set();
  const connectListeners = new Set();

  const setAuthenticated = (val) => {
    authenticated = val;
    authListeners.forEach((cb) => cb(val));
  };

  socket.on('connect', () => {
    connectListeners.forEach((cb) => cb(true));
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) socket.emit('validate_token', { token });
  });

  socket.on('disconnect', () => {
    connectListeners.forEach((cb) => cb(false));
    setAuthenticated(false);
  });

  socket.on('validate_token_response', (res) => {
    if (res.valid) {
      setAuthenticated(true);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      setAuthenticated(false);
    }
  });

  // Si el token ya estaba guardado y el socket se conecta antes de que el
  // código de arriba alcance a registrarse, no perdemos el estado inicial.
  if (socket.connected) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) socket.emit('validate_token', { token });
  }

  function login(username, password) {
    return new Promise((resolve, reject) => {
      socket.emit('login_request', { username, password });
      socket.once('login_response', (res) => {
        if (res.success) {
          localStorage.setItem(TOKEN_KEY, res.token);
          setAuthenticated(true);
          resolve(res.token);
        } else {
          reject(new Error(res.error || 'Credenciales inválidas.'));
        }
      });
    });
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setAuthenticated(false);
  }

  // ── Control de bots (mismos eventos que usa este dashboard) ─────────────

  function startBot(botId, runMode = 'manual') {
    socket.emit('start_bot', { botId, runMode });
  }

  // Descarga puntual de un rango fijo de fechas (backfill), solo para los
  // bots PME (bot_pme_hvac, bot_pme_iluminacion, bot_pme_frio_alimentario,
  // bot_pme_general). fechaInicio/fechaFin en formato 'YYYY-MM-DD'.
  function startBotRangoFijo(botId, fechaInicio, fechaFin) {
    socket.emit('start_bot_rango_fijo', { botId, fecha_inicio: fechaInicio, fecha_fin: fechaFin });
  }

  function stopBot(botId) {
    socket.emit('stop_bot', botId);
  }

  // Sin confirmación del servidor (fire-and-forget, igual que el dashboard
  // original) — si necesitas confirmar, vuelve a pedir con getBotConfig.
  function saveBotConfig(botId, config) {
    socket.emit('save_bot_config', { botId, config });
  }

  function getBotConfig(botId) {
    return new Promise((resolve) => {
      const handler = (res) => {
        if (res.id === botId) {
          socket.off('bot_config', handler);
          resolve(res.config);
        }
      };
      socket.on('bot_config', handler);
      socket.emit('get_bot_config', botId);
    });
  }

  // ── Suscripciones en vivo ────────────────────────────────────────────────
  // Todas devuelven una función para des-suscribirse (llámala en el cleanup
  // de tu useEffect).

  function onBotLog(cb) {
    socket.on('bot_log', cb);
    return () => socket.off('bot_log', cb);
  }

  function onBotsStatus(cb) {
    socket.on('bots_status', cb);
    return () => socket.off('bots_status', cb);
  }

  function onAuthChange(cb) {
    authListeners.add(cb);
    return () => authListeners.delete(cb);
  }

  function onConnectionChange(cb) {
    connectListeners.add(cb);
    cb(socket.connected);
    return () => connectListeners.delete(cb);
  }

  return {
    socket,
    login,
    logout,
    isAuthenticated: () => authenticated,
    isConnected: () => socket.connected,
    startBot,
    startBotRangoFijo,
    stopBot,
    saveBotConfig,
    getBotConfig,
    onBotLog,
    onBotsStatus,
    onAuthChange,
    onConnectionChange,
  };
}
