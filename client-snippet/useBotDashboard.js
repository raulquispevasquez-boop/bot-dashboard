// Hook de React opcional sobre botDashboardClient.js — copia ambos archivos
// juntos a tu proyecto. Ejemplo:
//
//   const { isConnected, isAuthenticated, bots, logs, login, startBot } =
//     useBotDashboard('https://tu-url-del-tunel.trycloudflare.com');
//
//   if (!isAuthenticated) return <LoginForm onSubmit={login} />;
//   return <button onClick={() => startBot('bot_pme_hvac')}>Ejecutar HVAC</button>;

import { useEffect, useMemo, useState, useCallback } from 'react';
import { createBotDashboardClient } from './botDashboardClient';

export function useBotDashboard(socketUrl) {
  const client = useMemo(() => createBotDashboardClient(socketUrl), [socketUrl]);

  const [isConnected, setIsConnected] = useState(client.isConnected());
  const [isAuthenticated, setIsAuthenticated] = useState(client.isAuthenticated());
  const [bots, setBots] = useState([]);
  const [logs, setLogs] = useState({});

  useEffect(() => {
    const offConn = client.onConnectionChange(setIsConnected);
    const offAuth = client.onAuthChange(setIsAuthenticated);
    const offStatus = client.onBotsStatus(setBots);
    const offLog = client.onBotLog((entry) => {
      setLogs((prev) => {
        const botLogs = prev[entry.id] || [];
        return { ...prev, [entry.id]: [...botLogs.slice(-100), entry] };
      });
    });

    return () => {
      offConn();
      offAuth();
      offStatus();
      offLog();
    };
  }, [client]);

  const login = useCallback((username, password) => client.login(username, password), [client]);

  return {
    isConnected,
    isAuthenticated,
    bots,
    logs,
    login,
    logout: client.logout,
    startBot: client.startBot,
    startBotRangoFijo: client.startBotRangoFijo,
    stopBot: client.stopBot,
    saveBotConfig: client.saveBotConfig,
    getBotConfig: client.getBotConfig,
  };
}
