import React, { useEffect, useRef } from 'react';
import { Play, Square, Activity } from 'lucide-react';
import RunningBot from '../components/common/RunningBot';

const Terminal = ({ logs }) => {
  const bodyRef = useRef(null);

  useEffect(() => {
    // Solo mueve el scroll interno de este terminal, nunca el de la pagina.
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="terminal" ref={bodyRef}>
      {logs && logs.length > 0 ? (
        logs.map((log, index) => (
          <div key={index} className={`log-line log-${log.type}`}>
            <span style={{ color: '#666', marginRight: '8px' }}>[{new Date().toLocaleTimeString()}]</span>
            {log.message}
          </div>
        ))
      ) : (
        <div style={{ color: '#666', fontStyle: 'italic' }}>Esperando ejecución...</div>
      )}
    </div>
  );
};

const Dashboard = ({ bots, logs, onStart, onStop, onReorderBots, onFinalReorder }) => {
  const [draggedId, setDraggedId] = React.useState(null);

  const handleDragStart = (e, id) => {
    e.dataTransfer.setData('text/plain', id);
    e.currentTarget.style.opacity = '0.5';
    e.currentTarget.style.transform = 'scale(0.98)';
    setTimeout(() => {
      setDraggedId(id);
    }, 0);
  };

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    e.currentTarget.style.transform = 'scale(1)';
    setDraggedId(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDragEnter = (e, targetId) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const currentOrder = bots.map(b => b.id);
    const draggedIdx = currentOrder.indexOf(draggedId);
    const targetIdx = currentOrder.indexOf(targetId);

    const newOrder = [...currentOrder];
    newOrder.splice(draggedIdx, 1);
    newOrder.splice(targetIdx, 0, draggedId);

    if (onReorderBots) {
      onReorderBots(newOrder);
    }
  };

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    const finalOrder = bots.map(b => b.id);
    if (onFinalReorder) {
      onFinalReorder(finalOrder);
    }
    setDraggedId(null);
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 4rem)', overflow: 'hidden' }}>
      {/* Header real (no sticky): nunca se mueve, no comparte scroll con la grilla */}
      <header style={{ flexShrink: 0, marginBottom: '1.5rem' }}>
        <h1>Tablero Principal</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Vista general de todos tus bots y procesos en ejecución. (Arrastra las tarjetas para reordenarlas)</p>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.25rem' }}>
      <div className="bots-grid">
        {bots.map((bot) => {
          if (bot.id === draggedId) {
            return (
              <div 
                key={bot.id} 
                className="glass-panel bot-card"
                onDragOver={handleDragOver}
                onDragEnter={(e) => handleDragEnter(e, bot.id)}
                onDrop={(e) => handleDrop(e, bot.id)}
                style={{ 
                  height: '100%',
                  minHeight: '340px',
                  border: '2px dashed rgba(59, 130, 246, 0.4)',
                  backgroundColor: 'rgba(15, 17, 21, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'inset 0 0 16px rgba(59, 130, 246, 0.08)',
                  transition: 'all 0.2s ease',
                  opacity: 0.85
                }}
              >
                <div style={{ color: 'rgba(96, 165, 250, 0.5)', fontSize: '0.9rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                  Soltar aquí
                </div>
              </div>
            );
          }

          return (
            <div 
              key={bot.id} 
              className="glass-panel bot-card"
              draggable="true"
              onDragStart={(e) => handleDragStart(e, bot.id)}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDragEnter={(e) => handleDragEnter(e, bot.id)}
              onDrop={(e) => handleDrop(e, bot.id)}
              style={{ 
                cursor: 'grab', 
                transition: 'transform 0.2s ease, opacity 0.2s ease, border-color 0.2s ease'
              }}
            >
            <div className="bot-header" style={{ userSelect: 'none' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={18} color={bot.status === 'running' ? 'var(--success)' : 'var(--text-secondary)'} />
                {bot.name}
              </h2>
              <span className={`status-badge status-${bot.status}`}>
                {bot.status === 'running' ? 'Ejecutando' : 'Detenido'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
              <button 
                className="btn btn-start" 
                onClick={() => onStart(bot.id)}
                disabled={bot.status === 'running'}
                style={{ opacity: bot.status === 'running' ? 0.5 : 1, cursor: bot.status === 'running' ? 'not-allowed' : 'pointer' }}
              >
                <Play size={16} /> Iniciar
              </button>
              <button 
                className="btn btn-stop" 
                onClick={() => onStop(bot.id)}
                disabled={bot.status === 'stopped'}
                style={{ opacity: bot.status === 'stopped' ? 0.5 : 1, cursor: bot.status === 'stopped' ? 'not-allowed' : 'pointer' }}
              >
                <Square size={16} /> Detener
              </button>
              <div style={{ marginLeft: 'auto' }}>
                <RunningBot isRunning={bot.status === 'running'} />
              </div>
            </div>

            <Terminal logs={logs[bot.id]} />
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
};

export default Dashboard;
