import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import Dashboard from './pages/Dashboard';
import BotFracttalMsp from './pages/BotFracttalMsp';
import ItlusFractal from './pages/ItlusFractal';
import BotClimatico from './pages/BotClimatico';
import BotSenamhiPage from './pages/BotSenamhiPage';
import BotPmePage from './pages/BotPmePage';
import BotAuditoriaEnPage from './pages/BotAuditoriaEnPage';
import Sidebar from './components/Sidebar';
import Login from './components/Login';
import AgenteCorreo from './pages/AgenteCorreo';
import ConfiguracionGeneral from './pages/ConfiguracionGeneral';
import ModuloFacturacionPage from './pages/modulo_facturacion/ModuloFacturacionPage';

// Dynamic server address resolution
const isLocal = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' || 
  window.location.hostname === '127.0.0.1'
);
const socketUrl = isLocal
  ? `${window.location.protocol}//${window.location.hostname}:3001`
  : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
const socket = io(socketUrl);

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('auth_token'));
  const [activeTab, setActiveTab] = useState('dashboard');
  const [bots, setBots] = useState([]);
  const [logs, setLogs] = useState({});
  const [isConnected, setIsConnected] = useState(socket.connected);

  useEffect(() => {
    // Validar el token guardado al montar (por si expiró o el servidor cambió de secreto)
    const token = localStorage.getItem('auth_token');
    if (token) {
      socket.emit('validate_token', { token });
    }

    const handleValidateTokenResponse = (res) => {
      if (!res.valid) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        setIsAuthenticated(false);
      }
    };

    socket.on('validate_token_response', handleValidateTokenResponse);
    return () => {
      socket.off('validate_token_response', handleValidateTokenResponse);
    };
  }, []);

  const sortBots = (statusList) => {
    const savedOrderStr = localStorage.getItem('bots_order');
    if (!savedOrderStr) return statusList;
    try {
      const savedOrder = JSON.parse(savedOrderStr);
      return [...statusList].sort((a, b) => {
        const indexA = savedOrder.indexOf(a.id);
        const indexB = savedOrder.indexOf(b.id);
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      });
    } catch (e) {
      return statusList;
    }
  };

  const handleReorderBots = (newOrder) => {
    setBots((prevBots) => {
      return [...prevBots].sort((a, b) => {
        const indexA = newOrder.indexOf(a.id);
        const indexB = newOrder.indexOf(b.id);
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      });
    });
  };

  const handleFinalReorder = (finalOrder) => {
    localStorage.setItem('bots_order', JSON.stringify(finalOrder));
    socket.emit('set_master_bots_order', finalOrder);
    handleReorderBots(finalOrder);
  };

  useEffect(() => {
    const onConnect = () => {
      setIsConnected(true);
      const token = localStorage.getItem('auth_token');
      if (token) {
        socket.emit('validate_token', { token });
      }
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    setIsConnected(socket.connected);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    socket.on('bots_status', (statusList) => {
      setBots(sortBots(statusList));
    });

    socket.on('bot_log', (logEntry) => {
      setLogs((prevLogs) => {
        const botLogs = prevLogs[logEntry.id] || [];
        return {
          ...prevLogs,
          [logEntry.id]: [...botLogs.slice(-100), logEntry] // keep last 100 logs
        };
      });
    });

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('bots_status');
      socket.off('bot_log');
    };
  }, []);

  const handleStart = (id, runMode = 'manual') => {
    console.log("Emitting start_bot:", { botId: id, runMode });
    socket.emit('start_bot', { botId: id, runMode });
  };

  const handleStop = (id) => {
    console.log("Emitting stop_bot:", id);
    socket.emit('stop_bot', id);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <Login socket={socket} onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="app-container">
      {/* Left Sidebar Component */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isConnected={isConnected} 
        onLogout={handleLogout} 
      />

      {/* Main Content Area */}
      <main
        className="main-content"
        style={
          activeTab === 'modulo_facturacion'
            ? { overflow: 'hidden', height: '100vh', padding: '1rem 1.25rem', boxSizing: 'border-box' }
            : {}
        }
      >
        {activeTab === 'dashboard' && (
          <Dashboard 
            bots={bots} 
            logs={logs} 
            onStart={handleStart} 
            onStop={handleStop} 
            onReorderBots={handleReorderBots}
            onFinalReorder={handleFinalReorder}
          />
        )}

        
        {activeTab === 'bot_fracttal_msp' && (
          <BotFracttalMsp
            bots={bots}
            logs={logs}
            onStart={handleStart}
            onStop={handleStop}
            socket={socket}
            onReorderBots={handleReorderBots}
            onFinalReorder={handleFinalReorder}
          />
        )}

        {activeTab === 'itlus_fractal' && (
          <ItlusFractal />
        )}


        {activeTab === 'bot_climatico' && (
          <BotClimatico 
            bots={bots}
            logs={logs}
            onStart={handleStart}
            onStop={handleStop}
            socket={socket}
            initialInnerTab="bot_master_climatico"
          />
        )}

        {activeTab === 'bot_senamhi' && (
          <BotClimatico 
            bots={bots}
            logs={logs}
            onStart={handleStart}
            onStop={handleStop}
            socket={socket}
            initialInnerTab="bot_senamhi"
          />
        )}

        {activeTab === 'bot_pme' && (
          <BotPmePage 
            bots={bots}
            logs={logs}
            onStart={handleStart}
            onStop={handleStop}
            socket={socket}
          />
        )}

        {activeTab === 'bot_auditoria_en' && (
          <BotAuditoriaEnPage 
            bots={bots}
            logs={logs}
            onStart={handleStart}
            onStop={handleStop}
            socket={socket}
          />
        )}

        {activeTab === 'agente_correo' && (
          <AgenteCorreo />
        )}

        {activeTab === 'configuracion_general' && (
          <ConfiguracionGeneral />
        )}

        {activeTab === 'modulo_facturacion' && (
          <ModuloFacturacionPage />
        )}
      </main>
    </div>
  );
}

export default App;
