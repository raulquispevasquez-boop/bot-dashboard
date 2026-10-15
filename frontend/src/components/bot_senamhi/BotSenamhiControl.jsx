import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Settings, RefreshCw, Terminal, Satellite, ChevronDown, ChevronUp, X, Calendar, Radio, HelpCircle } from 'lucide-react';
import Toast from '../common/Toast';
import InfoModal from '../common/InfoModal';
import RunningBot from '../common/RunningBot';
import SenamhiMapa from './SenamhiMapa';

const FASES = [
  { key: 'sedes',      label: 'Sedes',       icon: '🏢' },
  { key: 'estaciones', label: 'Estaciones',   icon: '📡' },
  { key: 'radio',      label: 'Radio',        icon: '🔗' },
  { key: 'descarga',   label: 'Descarga',     icon: '📥' },
  { key: 'local',      label: 'Local',        icon: '💾' },
  { key: 'drive',      label: 'Drive',        icon: '📁' },
  { key: 'supabase',   label: 'Supabase',     icon: '☁️' },
  { key: 'fin',        label: 'Fin',          icon: '🎉' },
];

const BotSenamhiControl = ({ bot, logs, onStart, onStop, socket }) => {
  const botId = 'bot_senamhi_spsa';

  const [fases, setFases] = useState(Object.fromEntries(FASES.map(f => [f.key, 'idle'])));
  const [statusVals, setStatusVals] = useState({ progress: 0, status_txt: 'Detenido', reloj: '' });
  const [config, setConfig] = useState({
    f_ini: '2024-01-01', f_fin: '',
    radio_km: 10,
    tipos_estacion: ['meteorologica', 'hidrologica'],
    exportar_excel: true,
    carpeta_drive: '',
    delay_seg: 1.5,
    reintentos: 3,
    modo_auto: 'INTERVALO',
    intervalo_val: '24',
    intervalo_uni: 'horas',
    hora1: '06:00', hora2: '12:00', hora3: '18:00',
  });
  const [showConfig, setShowConfig] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const consoleEndRef = useRef(null);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setConfig(prev => ({ ...prev, f_fin: prev.f_fin || today }));
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.emit('get_bot_config', botId);
    const handleConfig = (d) => {
      if (d.id === botId && d.config) {
        setConfig(prev => {
          const today = new Date().toISOString().split('T')[0];
          return {
            ...prev,
            ...d.config,
            f_fin: d.config.f_fin || prev.f_fin || today
          };
        });
      }
    };
    const handleSaveStatus = (d) => {
      if (d.id === botId) {
        if (d.success) setToast({ message: 'Configuración guardada', type: 'success' });
        else setModal({ isOpen: true, title: 'Error', message: d.error, type: 'error' });
      }
    };
    socket.on('bot_config', handleConfig);
    socket.on('save_config_status', handleSaveStatus);
    return () => { socket.off('bot_config', handleConfig); socket.off('save_config_status', handleSaveStatus); };
  }, [socket]);

  useEffect(() => {
    let newFases = { ...fases };
    let newStatus = { ...statusVals };
    let changed = false, statusChanged = false;
    logs.forEach(l => {
      if (l.type === 'fase') { newFases[l.fase] = l.estado; changed = true; }
      if (l.type === 'status_val') { newStatus[l.key] = l.value; statusChanged = true; }
    });
    if (changed) setFases(newFases);
    if (statusChanged) setStatusVals(newStatus);
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const displayLogs = logs.filter(l => ['log', 'info', 'error'].includes(l.type));
  const isRunning = bot?.status === 'running';

  const getPhaseColor = s => ({ activo: '#3b82f6', ok: '#22c55e', skip: '#e4a02b', error: '#ef4444' }[s] || '#2a2a2a');
  const getPhaseGlow  = s => ({ activo: '0 0 10px #3b82f6', ok: '0 0 10px #22c55e', skip: '0 0 10px #e4a02b', error: '0 0 10px #ef4444' }[s] || 'none');

  const saveConfig = () => {
    if (socket) {
      socket.emit('save_bot_config', { botId, config });
      setToast({ message: 'Guardando configuración...', type: 'info' });
    }
  };

  const toggleTipo = (tipo) => {
    setConfig(prev => {
      const arr = prev.tipos_estacion || [];
      return { ...prev, tipos_estacion: arr.includes(tipo) ? arr.filter(t => t !== tipo) : [...arr, tipo] };
    });
  };

  return (
    <div style={{ display: 'flex', gap: '1rem', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <InfoModal isOpen={modal.isOpen} title={modal.title} message={modal.message} type={modal.type} onClose={() => setModal(p => ({ ...p, isOpen: false }))} />

      {/* LEFT COLUMN: Header + Fases + Consola */}
      <div style={{ flex: '1 1 52%', display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
        
        {/* Header Control Bar */}
        <div className="glass-panel" style={{
          flexShrink: 0,
          padding: '1rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '16px',
          background: 'rgba(15, 17, 21, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(37,99,235,0.05))',
              border: '1px solid rgba(59,130,246,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(59,130,246,0.15)'
            }}>
              <Satellite size={22} color="#60a5fa" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{ margin: 0, color: '#fff', fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                  SPSA — Bot SENAMHI V1.0
                </h2>
                <RunningBot isRunning={isRunning} size={24} />
              </div>
              <p style={{ color: 'var(--text-secondary)', margin: '2px 0 0 0', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>Estado:</span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.1rem 0.4rem',
                  borderRadius: '5px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  backgroundColor: isRunning ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  color: isRunning ? '#4ade80' : '#f87171',
                  border: isRunning ? '1px solid rgba(34, 197, 94, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)'
                }}>
                  <span style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    backgroundColor: isRunning ? '#22c55e' : '#ef4444',
                    boxShadow: isRunning ? '0 0 6px #22c55e' : 'none'
                  }} />
                  {isRunning ? 'Ejecutando' : 'Detenido'}
                </span>
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowHelp(true)}
              title="Guía e Instrucciones"
              style={{ padding: '0.5rem 0.65rem' }}
            >
              <HelpCircle size={16} color="#60a5fa" />
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowConfig(p => !p)}
              style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
            >
              <Settings size={14} /> Config {showConfig ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
            </button>
            {!isRunning ? (
              <button
                className="btn btn-primary"
                onClick={() => onStart('manual')}
                style={{ padding: '0.5rem 0.85rem', fontSize: '0.825rem' }}
              >
                <Play size={14} fill="currentColor" /> Ejecutar Bot
              </button>
            ) : (
              <button
                className="btn btn-danger"
                onClick={onStop}
                style={{ padding: '0.5rem 0.85rem', fontSize: '0.825rem' }}
              >
                <Square size={14} fill="currentColor" /> Detener Bot
              </button>
            )}
          </div>
        </div>

        {/* Fixed Timeline Panel */}
        <div className="glass-panel" style={{ padding: '1rem 1.25rem', flexShrink: 0 }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Fases de Ejecución</h3>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start', position: 'relative' }}>
            {FASES.map((f, i) => (
              <React.Fragment key={f.key}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, zIndex: 1 }}>
                  <div style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    backgroundColor: fases[f.key] === 'idle' ? '#181b22' : getPhaseColor(fases[f.key]),
                    border: `2px solid ${getPhaseColor(fases[f.key])}`,
                    boxShadow: getPhaseGlow(fases[f.key]),
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    color: '#fff',
                    fontWeight: 'bold'
                  }}>
                    {fases[f.key] === 'ok' ? '✓' : (fases[f.key] === 'activo' ? '●' : i + 1)}
                  </div>
                  <span style={{
                    marginTop: '0.4rem',
                    fontSize: '0.72rem',
                    fontWeight: fases[f.key] !== 'idle' ? 600 : 500,
                    color: fases[f.key] !== 'idle' ? '#f3f4f6' : '#6b7280',
                    textAlign: 'center'
                  }}>
                    <span style={{ display: 'block', fontSize: '0.8rem', marginBottom: '2px' }}>{f.icon}</span>
                    {f.label}
                  </span>
                </div>
                {i < FASES.length - 1 && (
                  <div style={{
                    flex: 1,
                    height: '2px',
                    backgroundColor: fases[f.key] === 'ok' ? '#22c55e' : 'rgba(255,255,255,0.08)',
                    marginTop: '14px',
                    transition: 'background-color 0.4s ease'
                  }} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Progreso general</span>
              <span style={{ color: '#60a5fa', fontFamily: 'monospace', fontWeight: 700 }}>{statusVals.progress || 0}%</span>
            </div>
            <div style={{ height: '7px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '999px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{
                height: '100%',
                width: `${statusVals.progress || 0}%`,
                background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
                borderRadius: '999px',
                transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 0 12px rgba(59,130,246,0.6)'
              }} />
            </div>
          </div>
        </div>

        {/* Scrollable Console Area */}
        <div className="glass-panel" style={{ padding: '1.25rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <h3 style={{ margin: '0 0 0.85rem 0', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            <Terminal size={15} color="#60a5fa" /> Consola de Ejecución
          </h3>
          <div className="terminal" style={{ flex: 1, borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', background: '#0a0c10', padding: '0.85rem', overflowY: 'auto' }}>
            {displayLogs.length === 0 ? (
              <div style={{ color: '#4b5563', fontStyle: 'italic', fontSize: '0.825rem' }}>Esperando ejecución del bot SENAMHI...</div>
            ) : (
              displayLogs.map((l, i) => {
                let logContent = l.message;
                let customStyle = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '0.8rem', lineHeight: '1.45' };
                
                const matchSedeLine = typeof l.message === 'string' && l.message.match(/(Sede:\s*)(.+?\(\d+\))(.*)/i);
                
                if (matchSedeLine) {
                  customStyle.fontSize = '0.9rem';
                  customStyle.padding = '0.15rem 0';
                  logContent = (
                    <>
                      <span style={{ color: '#93c5fd' }}>{l.message.substring(0, matchSedeLine.index)}</span>
                      <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>{matchSedeLine[1]}</span>
                      <span style={{ color: '#fcd34d', fontWeight: 900 }}>{matchSedeLine[2]}</span>
                      <span style={{ color: '#93c5fd' }}>{matchSedeLine[3]}</span>
                    </>
                  );
                }
                
                return (
                  <div key={i} className={`log-line log-${l.type}`} style={customStyle}>
                    {logContent}
                  </div>
                );
              })
            )}
            <div ref={consoleEndRef} />
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Full Height Map Area (Expands to top of container) */}
      <div className="glass-panel" style={{ flex: '1 1 48%', display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', borderRadius: '16px' }}>
        <SenamhiMapa socket={socket} isBotRunning={isRunning} logs={logs} config={config} />
      </div>

      {/* Config Modal Overlay */}
      {showConfig && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(3, 4, 6, 0.85)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div className="glass-panel" style={{
            width: '100%',
            maxWidth: '680px',
            backgroundColor: '#141822',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            borderRadius: '16px',
            padding: '1.75rem',
            position: 'relative',
            animation: 'scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.85rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Settings size={18} color="#60a5fa" /> Configuración de Parámetros
              </h3>
              <button
                onClick={() => setShowConfig(false)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.25rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#9ca3af', display: 'block', marginBottom: '6px', fontWeight: 500 }}>Fecha Inicio</label>
                <input type="date" className="input-field" value={config.f_ini} onChange={e => setConfig(p => ({ ...p, f_ini: e.target.value }))} style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.4)', color: '#fff' }} />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 500, margin: 0 }}>Fecha Fin</label>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const todayStr = now.toISOString().split('T')[0];
                      setConfig(p => ({ ...p, f_fin: todayStr }));
                    }}
                    style={{
                      background: 'rgba(59, 130, 246, 0.15)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      borderRadius: '6px',
                      color: '#60a5fa',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '0.2rem 0.55rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <Calendar size={12} /> Hoy ({new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                  </button>
                </div>
                <input type="date" className="input-field" value={config.f_fin} onChange={e => setConfig(p => ({ ...p, f_fin: e.target.value }))} style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.4)', color: '#fff' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#9ca3af', display: 'block', marginBottom: '6px', fontWeight: 500 }}>Radio de búsqueda (km)</label>
                <input type="number" className="input-field" min="1" max="100" value={config.radio_km} onChange={e => setConfig(p => ({ ...p, radio_km: parseFloat(e.target.value) }))} style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.4)', color: '#fff' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#9ca3af', display: 'block', marginBottom: '6px', fontWeight: 500 }}>Delay entre peticiones (seg)</label>
                <input type="number" step="0.1" className="input-field" min="0.5" max="10" value={config.delay_seg} onChange={e => setConfig(p => ({ ...p, delay_seg: parseFloat(e.target.value) }))} style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.4)', color: '#fff' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#9ca3af', display: 'block', marginBottom: '6px', fontWeight: 500 }}>Reintentos por error</label>
                <input type="number" className="input-field" min="1" max="5" value={config.reintentos} onChange={e => setConfig(p => ({ ...p, reintentos: parseInt(e.target.value) }))} style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.4)', color: '#fff' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#9ca3af', display: 'block', marginBottom: '6px', fontWeight: 500 }}>Ruta carpeta Google Drive</label>
                <input type="text" className="input-field" placeholder="G:\Mi unidad\..." value={config.carpeta_drive} onChange={e => setConfig(p => ({ ...p, carpeta_drive: e.target.value }))} style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.4)', color: '#fff' }} />
              </div>
            </div>

            <div style={{ marginTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem' }}>
              <label style={{ fontSize: '0.8rem', color: '#9ca3af', display: 'block', marginBottom: '8px', fontWeight: 500 }}>Tipos de estaciones a incluir</label>
              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                {['meteorologica', 'hidrologica'].map(t => (
                  <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#e5e7eb', fontSize: '0.85rem' }}>
                    <input type="checkbox" checked={(config.tipos_estacion || []).includes(t)} onChange={() => toggleTipo(t)} style={{ accentColor: '#3b82f6', width: '16px', height: '16px' }} />
                    {t === 'meteorologica' ? '🌡️ Meteorológica' : '🌊 Hidrológica'}
                  </label>
                ))}
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#e5e7eb', fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={config.exportar_excel} onChange={e => setConfig(p => ({ ...p, exportar_excel: e.target.checked }))} style={{ accentColor: '#3b82f6', width: '16px', height: '16px' }} />
                  📊 Exportar a Excel
                </label>
              </div>
            </div>

            <div style={{ marginTop: '1.75rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowConfig(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => { saveConfig(); setShowConfig(false); }}>Guardar Cambios</button>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal Instructions */}
      {showHelp && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(3, 4, 6, 0.85)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div className="glass-panel" style={{
            width: '100%',
            maxWidth: '620px',
            backgroundColor: '#141822',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
            borderRadius: '16px',
            padding: '1.75rem',
            animation: 'scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <HelpCircle size={20} color="#60a5fa" /> Guía e Instrucciones de Botones
              </h3>
              <button
                onClick={() => setShowHelp(false)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '60vh', overflowY: 'auto', paddingRight: '0.25rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ color: '#60a5fa', fontWeight: 700, fontSize: '0.9rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Play size={15} fill="currentColor" /> ▶️ Botón "Ejecutar Bot"
                </div>
                <p style={{ margin: 0, fontSize: '0.825rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                  Inicia la ejecución manual del bot SENAMHI. Recorre progresivamente las 8 fases (Sedes SPSA ➔ Catálogo Garúa/SENAMHI ➔ Emparejamiento por Radio ➔ Descarga de datos ➔ Cache Local ➔ Google Drive ➔ Supabase).
                </p>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ color: '#f87171', fontWeight: 700, fontSize: '0.9rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Square size={15} fill="currentColor" /> ⏹️ Botón "Detener Bot"
                </div>
                <p style={{ margin: 0, fontSize: '0.825rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                  Cancela de forma segura el proceso en curso. Los datos que ya hayan sido descargados hasta esa fase se conservarán en el sistema.
                </p>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ color: '#e5e7eb', fontWeight: 700, fontSize: '0.9rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Settings size={15} /> ⚙️ Botón "Config"
                </div>
                <p style={{ margin: 0, fontSize: '0.825rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                  Abre la ventana modal de parámetros donde puedes configurar el rango de fechas, el radio de cobertura en kilómetros, los tipos de estación (meteorológicas o hidrológicas), ruta de Google Drive y reintentos.
                </p>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ color: '#3b82f6', fontWeight: 700, fontSize: '0.9rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Calendar size={15} /> 📅 Botón "Hoy (HH:MM)"
                </div>
                <p style={{ margin: 0, fontSize: '0.825rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                  Ubicado dentro del cuadro de configuración en **Fecha Fin**. Al presionarlo asigna automáticamente la fecha del día actual con la hora exacta del sistema.
                </p>
              </div>
            </div>

            <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.85rem' }}>
              <button className="btn btn-primary" onClick={() => setShowHelp(false)}>Entendido</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BotSenamhiControl;
