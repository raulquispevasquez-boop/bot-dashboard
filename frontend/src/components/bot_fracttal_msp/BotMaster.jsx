import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Settings, RefreshCw, Layers, ShieldCheck, CheckCircle, Database, Clock, X } from 'lucide-react';
import Toast from '../common/Toast';
import InfoModal from '../common/InfoModal';
import RunningBot from '../common/RunningBot';
import CountdownRing from '../common/CountdownRing';

const BACKEND = window.location.protocol + '//' + window.location.hostname + ':3001';
const BOTS_FRACTTAL_MSP = ['bot_st_msp', 'bot_st_fracttal', 'bot_ot_fracttal', 'bot_invitaciones_msp'];

const BotMaster = ({ bot, bots = [], logs, allLogs, onStart, onStop, socket, onReorderBots, onFinalReorder }) => {
  const [viewedBotId, setViewedBotId] = useState('bot_master');
  const [isAutoSwitch, setIsAutoSwitch] = useState(true);

  const [masterStatus, setMasterStatus] = useState({
    running: false,
    currentBot: null,
    index: -1,
    total: 4,
    autopilotActive: false,
    countdown: ''
  });

  // Effect for Auto-switching the viewed console tab
  useEffect(() => {
    if (masterStatus.running && masterStatus.currentBot && isAutoSwitch) {
      setViewedBotId(masterStatus.currentBot);
    }
  }, [masterStatus.running, masterStatus.currentBot, isAutoSwitch]);

  const [syncFields, setSyncFields] = useState({
    url_supabase: 'https://zuouxnvcktjhqzlniion.supabase.co',
    key_supabase: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84',
    fec_ini: '2024-03-01',
    path_gdrive: 'G:\\Mi unidad\\1.GESTIÓN DE MANTENIMIENTO SPSA\\CONSOLIDADO ST-OT',
    user_spsa: 'raul.quispe@spsa.pe'
  });

  const [masterAutopilotConfig, setMasterAutopilotConfig] = useState({
    modo_auto: 'HORAS',
    hora1: '08:00',
    hora2: '13:00',
    hora3: '18:00',
    intervalo_val: '30',
    intervalo_uni: 'minutos'
  });

  const [lastRunStats, setLastRunStats] = useState({});
  // Última corrida real por bot, leída de la tabla de seguimiento
  // bot_activaciones (fuente confiable) en vez de parsear texto de logs —
  // lastRunStats (arriba) queda como respaldo mientras no haya datos aquí.
  const [ultimasActivaciones, setUltimasActivaciones] = useState({});

  const cargarUltimasActivaciones = async () => {
    for (const botId of BOTS_FRACTTAL_MSP) {
      try {
        const res = await fetch(`${BACKEND}/api/activaciones?bot_id=${botId}&limit=1`);
        const body = await res.json();
        const fila = body.success && Array.isArray(body.data) ? body.data[0] : null;
        setUltimasActivaciones(prev => ({ ...prev, [botId]: fila || null }));
      } catch {
        // Silencioso: no interrumpe la vista si el backend no responde
      }
    }
  };

  useEffect(() => {
    cargarUltimasActivaciones();
  }, []);

  const prevRunningRef = useRef({});
  useEffect(() => {
    const actuales = {};
    BOTS_FRACTTAL_MSP.forEach(id => {
      actuales[id] = bots.find(b => b.id === id)?.status === 'running';
    });
    const terminoAlguno = BOTS_FRACTTAL_MSP.some(id => prevRunningRef.current[id] && !actuales[id]);
    prevRunningRef.current = actuales;
    if (terminoAlguno) {
      setTimeout(cargarUltimasActivaciones, 1500);
    }
  }, [bots]);
  // Config (intervalo_val/intervalo_uni) de cada bot individual, para poder
  // dibujar su anillo de cuenta regresiva aunque este corriendo por su
  // cuenta (fuera de la cascada de Master).
  const [botsConfigs, setBotsConfigs] = useState({});
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  const [showConfig, setShowConfig] = useState(false);
  const [showAutopilotConfig, setShowAutopilotConfig] = useState(false);
  const consoleBodyRef = useRef(null);

  useEffect(() => {
    if (socket) {
      const handleMasterStatus = (status) => {
        setMasterStatus(status);
      };

      const handleSyncStatus = (status) => {
        if (status.success) {
          setModal({
            isOpen: true,
            title: 'Sincronización Exitosa',
            message: `Todos los parámetros compartidos (Supabase URL, Key, Drive y Fecha) se sincronizaron y guardaron correctamente en los ${status.successCount} bots de forma remota.`,
            type: 'success'
          });
        } else {
          setModal({
            isOpen: true,
            title: 'Error de Sincronización',
            message: `Ocurrió un error al sincronizar configuraciones:\n\n${status.errors.join('\n')}`,
            type: 'error'
          });
        }
      };

      const handleMasterConfig = (cfg) => {
        if (cfg) {
          setMasterAutopilotConfig(cfg);
        }
      };

      const handleAutopilotSaveStatus = (res) => {
        if (res.success) {
          setModal({
            isOpen: true,
            title: 'Configuración Guardada',
            message: 'Ajustes de Autopiloto Maestro (programador diario en cascada) aplicados y guardados con éxito en el servidor.',
            type: 'success'
          });
        }
      };

      const handleLastRunStats = (stats) => {
        if (stats) {
          setLastRunStats(stats);
        }
      };

      const handleSharedConfig = (cfg) => {
        if (cfg) {
          setSyncFields(cfg);
        }
      };

      const handleBotConfig = (data) => {
        if (data && data.id && data.config) {
          setBotsConfigs(prev => ({ ...prev, [data.id]: data.config }));
        }
      };

      socket.on('master_status', handleMasterStatus);
      socket.on('save_master_config_status', handleSyncStatus);
      socket.on('master_config', handleMasterConfig);
      socket.on('save_master_autopilot_config_status', handleAutopilotSaveStatus);
      socket.on('last_run_stats', handleLastRunStats);
      socket.on('shared_config', handleSharedConfig);
      socket.on('bot_config', handleBotConfig);

      // Trigger initial loading
      socket.emit('get_master_status');
      socket.emit('get_master_config');
      socket.emit('get_last_run_stats');
      socket.emit('get_shared_config');
      // Config individual de cada bot, para el anillo de cuenta regresiva
      // cuando corren fuera de la cascada de Master.
      ['bot_st_msp', 'bot_st_fracttal', 'bot_ot_fracttal', 'bot_invitaciones_msp'].forEach(id => {
        socket.emit('get_bot_config', id);
      });

      return () => {
        socket.off('master_status', handleMasterStatus);
        socket.off('save_master_config_status', handleSyncStatus);
        socket.off('master_config', handleMasterConfig);
        socket.off('save_master_autopilot_config_status', handleAutopilotSaveStatus);
        socket.off('last_run_stats', handleLastRunStats);
        socket.off('shared_config', handleSharedConfig);
        socket.off('bot_config', handleBotConfig);
      };
    }
  }, [socket]);

  useEffect(() => {
    // Mueve solo el scroll interno de la consola (nunca el de la pagina),
    // asignando scrollTop directamente en vez de usar scrollIntoView (que
    // puede arrastrar contenedores ancestros si la consola no esta
    // totalmente visible dentro de ellos).
    if (consoleBodyRef.current) {
      consoleBodyRef.current.scrollTop = consoleBodyRef.current.scrollHeight;
    }
  }, [logs, allLogs, viewedBotId]);

  const handleStartMaster = () => {
    if (socket) {
      socket.emit('start_master');
    }
  };

  const handleStopMaster = () => {
    if (socket) {
      socket.emit('stop_master');
    }
  };

  const handleStartMasterAutopilot = () => {
    if (socket) {
      socket.emit('start_master_autopilot');
    }
  };

  const handleStopMasterAutopilot = () => {
    if (socket) {
      socket.emit('stop_master_autopilot');
    }
  };

  const handleSaveMasterAutopilotConfig = () => {
    if (socket) {
      socket.emit('save_master_autopilot_config', masterAutopilotConfig);
    }
  };

  const handleSyncConfig = () => {
    if (socket) {
      socket.emit('save_master_config', syncFields);
    }
  };

  const handleInputChange = (field, value) => {
    setSyncFields(prev => ({ ...prev, [field]: value }));
  };

  const handleAutopilotConfigChange = (field, value) => {
    setMasterAutopilotConfig(prev => ({ ...prev, [field]: value }));
  };

  const getStepStatusColor = (stepIndex) => {
    if (!masterStatus.running) return '#333';
    if (masterStatus.index === stepIndex) return '#3b82f6'; // running current
    if (masterStatus.index > stepIndex) return '#22c55e'; // completed
    return '#222';
  };

  const getStepStatusGlow = (stepIndex) => {
    if (!masterStatus.running) return 'none';
    if (masterStatus.index === stepIndex) return '0 0 10px #3b82f6';
    if (masterStatus.index > stepIndex) return '0 0 10px #22c55e';
    return 'none';
  };

  const getProgressInfo = (stepId) => {
    const botLogs = allLogs ? allLogs[stepId] : null;
    if (!botLogs || botLogs.length === 0) return null;

    let telemetryVal = '';
    let progressPct = null;

    for (let i = botLogs.length - 1; i >= 0; i--) {
      const entry = botLogs[i];
      if (entry.type === 'status_val') {
        if (entry.key === 'telemetry' && !telemetryVal) {
          telemetryVal = entry.value;
          const pctMatch = entry.value.match(/(\d+)%/);
          if (pctMatch) {
            progressPct = parseInt(pctMatch[1]);
          }
        }
        if (entry.key === 'progress' && progressPct === null) {
          progressPct = parseInt(entry.value);
        }
      }
    }

    if (!telemetryVal) {
      for (let i = botLogs.length - 1; i >= 0; i--) {
        const entry = botLogs[i];
        if (entry.type === 'log' || entry.type === 'info') {
          const msg = entry.message || '';
          if (msg.includes('Petición #') || msg.includes('Ciclo') || msg.includes('Bloque')) {
            telemetryVal = msg.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');
            break;
          }
        }
      }
    }

    return { telemetry: telemetryVal, pct: progressPct };
  };

  // Cuenta regresiva ("proxima") del propio autopiloto de un bot individual,
  // leida de su stream de logs — visible aunque ese bot este corriendo por
  // su cuenta, fuera de la cascada de Master.
  const getProximaFor = (stepId) => {
    const botLogs = allLogs ? allLogs[stepId] : null;
    if (!botLogs || botLogs.length === 0) return { remaining: null, total: null, text: '' };

    let text = '';
    for (let i = botLogs.length - 1; i >= 0; i--) {
      const entry = botLogs[i];
      if (entry.type === 'status_val' && entry.key === 'proxima') {
        text = entry.value || '';
        break;
      }
    }
    if (!text) return { remaining: null, total: null, text: '' };

    const cfg = botsConfigs[stepId] || {};
    const mInt = text.match(/Próxima en (\d+)m (\d+)s/);
    if (mInt) {
      const remaining = parseInt(mInt[1], 10) * 60 + parseInt(mInt[2], 10);
      const totalVal = parseFloat(cfg.intervalo_val) || 30;
      const totalUni = cfg.intervalo_uni || 'minutos';
      const total = totalVal * (totalUni === 'horas' ? 3600 : 60);
      return { remaining, total, text };
    }
    const mHoras = text.match(/en (\d+)h (\d+)m/);
    if (mHoras) {
      const remaining = parseInt(mHoras[1], 10) * 3600 + parseInt(mHoras[2], 10) * 60;
      return { remaining, total: null, text };
    }
    return { remaining: null, total: null, text };
  };

  const getLogsForConsole = () => {
    let sourceLogs = [];
    if (viewedBotId === 'bot_master') {
      sourceLogs = logs || [];
    } else {
      sourceLogs = allLogs[viewedBotId] || [];
    }
    return sourceLogs.map((l, index) => ({
      id: index,
      msg: l.message,
      t: l.type
    }));
  };

  const displayLogs = getLogsForConsole();

  const [draggedId, setDraggedId] = useState(null);

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

    const currentOrder = steps.map(s => s.id);
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
    const finalOrder = steps.map(s => s.id);
    if (onFinalReorder) {
      onFinalReorder(finalOrder);
    }
    setDraggedId(null);
  };

  const stepsBase = [
    { id: 'bot_st_msp', name: 'Bot ST MSP', desc: 'Solicitudes MSP' },
    { id: 'bot_st_fracttal', name: 'Bot ST Fracttal', desc: 'Solicitudes Fracttal' },
    { id: 'bot_ot_fracttal', name: 'Bot OT Fracttal', desc: 'Órdenes de Trabajo' },
    { id: 'bot_invitaciones_msp', name: 'Bot Invitaciones MSP', desc: 'Invitaciones MSP' }
  ];

  const steps = [...stepsBase].sort((a, b) => {
    const indexA = bots.findIndex(x => x.id === a.id);
    const indexB = bots.findIndex(x => x.id === b.id);
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  }).map((step, idx) => ({
    ...step,
    name: `${idx + 1}. ${step.name}`
  }));

  const isAutopilotActive = masterStatus.autopilotActive;

  // Deriva segundos restantes/totales del texto de countdown del backend, para
  // poder dibujar el anillo de progreso (solo es posible en modo INTERVALO,
  // donde existe un ciclo total fijo y conocido).
  const parseMasterCountdown = () => {
    if (masterAutopilotConfig.modo_auto !== 'INTERVALO' || !masterStatus.countdown) {
      return { remaining: null, total: null };
    }
    const totalVal = parseFloat(masterAutopilotConfig.intervalo_val) || 30;
    const totalUni = masterAutopilotConfig.intervalo_uni || 'minutos';
    const total = totalVal * (totalUni === 'horas' ? 3600 : 60);

    if (masterStatus.countdown.includes('inminente')) {
      return { remaining: 0, total };
    }
    const m = masterStatus.countdown.match(/(\d+)m\s+(\d+)s/);
    if (!m) return { remaining: null, total };
    return { remaining: parseInt(m[1], 10) * 60 + parseInt(m[2], 10), total };
  };
  const { remaining: masterCountdownRemaining, total: masterCountdownTotal } = parseMasterCountdown();

  return (
    <div className="bot-panel">
      {/* Cabecera pegajosa (Sticky Header) */}
      <div style={{ 
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: '#0f1115',
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
        willChange: 'transform',
        paddingTop: '0.5rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem' 
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers className="icon-glow" style={{ color: '#2b9eff' }} size={24} />
            <h2>Bot Master (Orquestador General)</h2>
            {masterStatus.running && (
              masterStatus.triggerMode === 'autopilot' ? (
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.75rem',
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  color: '#60a5fa',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '20px',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  fontWeight: 'bold',
                  boxShadow: '0 0 10px rgba(59, 130, 246, 0.15)'
                }}>
                  <RefreshCw size={12} className="spin-anim" />
                  Ejecutando Modo Autopiloto
                </span>
              ) : (
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.75rem',
                  backgroundColor: 'rgba(234, 179, 8, 0.15)',
                  color: '#facc15',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '20px',
                  border: '1px solid rgba(234, 179, 8, 0.4)',
                  fontWeight: 'bold',
                  boxShadow: '0 0 10px rgba(234, 179, 8, 0.15)'
                }}>
                  <Play size={12} style={{ animation: 'pulseBar 1.5s infinite' }} />
                  Ejecutando Modo Manual
                </span>
              )
            )}
            {masterStatus.countdown && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CountdownRing
                  remainingSeconds={masterCountdownRemaining}
                  totalSeconds={masterCountdownTotal}
                  color="#22c55e"
                  size={56}
                  label={masterStatus.countdown}
                  active={isAutopilotActive}
                />
                <span style={{ fontSize: '0.7rem', color: '#22c55e', maxWidth: '150px', lineHeight: 1.2 }}>
                  {masterStatus.countdown}
                </span>
              </div>
            )}
          </div>
          <p style={{ color: 'var(--text-secondary)' }}>
            Supervisa, coordina y sincroniza la ejecución secuencial de los 4 bots.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button 
            onClick={() => setShowConfig(!showConfig)}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #333',
              backgroundColor: '#111', color: '#fff', cursor: 'pointer',
            }}>
            <Settings size={16} /> Sincronizar Bots
          </button>

          <button 
            onClick={() => setShowAutopilotConfig(!showAutopilotConfig)}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #333',
              backgroundColor: '#111', color: '#fff', cursor: 'pointer',
            }}>
            <Clock size={16} /> Programador Maestro
          </button>
          
          <button 
            onClick={handleStartMaster} 
            disabled={masterStatus.running || isAutopilotActive}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 1rem', borderRadius: '6px', border: 'none',
              backgroundColor: (masterStatus.running || isAutopilotActive) ? '#333' : '#22c55e', color: '#fff', 
              cursor: (masterStatus.running || isAutopilotActive) ? 'not-allowed' : 'pointer', fontWeight: 'bold'
            }}>
            <Play size={16} /> Manual
          </button>

          <button 
            onClick={handleStartMasterAutopilot} 
            disabled={masterStatus.running || isAutopilotActive}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 1rem', borderRadius: '6px', border: 'none',
              backgroundColor: (masterStatus.running || isAutopilotActive) ? '#333' : '#3b82f6', color: '#fff', 
              cursor: (masterStatus.running || isAutopilotActive) ? 'not-allowed' : 'pointer', fontWeight: 'bold'
            }}>
            <RefreshCw size={16} /> Activar Autopiloto
          </button>

          <button 
            onClick={isAutopilotActive ? handleStopMasterAutopilot : handleStopMaster} 
            disabled={!masterStatus.running && !isAutopilotActive}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 1rem', borderRadius: '6px', border: 'none',
              backgroundColor: (!masterStatus.running && !isAutopilotActive) ? '#333' : '#ef4444', color: '#fff', 
              cursor: (!masterStatus.running && !isAutopilotActive) ? 'not-allowed' : 'pointer', fontWeight: 'bold'
            }}>
            <Square size={16} /> Detener
          </button>
        </div>
      </div>

      {/* Programador Maestro (Modal Popup) */}
      {showAutopilotConfig && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(2, 3, 5, 0.82)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 999999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem'
        }}>
          <div style={{
            backgroundColor: '#181b26',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 32px 70px rgba(0, 0, 0, 0.85), 0 0 45px rgba(59, 130, 246, 0.25)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '650px',
            padding: '2rem',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}>
            {/* Top Accent Strip */}
            <div style={{
              height: '4px',
              backgroundColor: '#3b82f6',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              borderTopLeftRadius: '16px',
              borderTopRightRadius: '16px'
            }} />

            {/* Botón de Cerrar */}
            <button
              onClick={() => setShowAutopilotConfig(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                transition: 'color 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#f3f4f6'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
            >
              <X size={18} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid #222', paddingBottom: '0.5rem', marginTop: '0.5rem' }}>
              <Clock size={18} style={{ color: '#3b82f6' }} />
              <h3 style={{ margin: 0, color: '#fff' }}>Ajustes del Programador de Cascada (Autopiloto Maestro)</h3>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.9fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Modo de Disparo</label>
                <select 
                  value={masterAutopilotConfig.modo_auto} 
                  onChange={(e) => handleAutopilotConfigChange('modo_auto', e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}
                >
                  <option value="HORAS">Horas Fijas Diarias</option>
                  <option value="INTERVALO">Intervalo Post-Cascada (Espera Fija)</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0.5rem 0.75rem', backgroundColor: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '8px', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#60a5fa', fontWeight: 'bold' }}>ℹ️ Funcionamiento del Intervalo:</span>
                <span style={{ fontSize: '0.75rem', color: '#aaa', lineHeight: '1.3' }}>
                  1. Al hacer clic en <strong>Activar Autopiloto</strong>, la secuencia de bots iniciará <strong>de inmediato</strong> por primera vez.
                  <br />
                  2. Al finalizar con éxito el último bot, se programará la espera de 60 minutos (o el tiempo configurado) para iniciar la siguiente ejecución automáticamente.
                </span>
              </div>
            </div>

            {masterAutopilotConfig.modo_auto === 'HORAS' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Hora Disparo 1</label>
                  <input 
                    type="text" 
                    value={masterAutopilotConfig.hora1} 
                    placeholder="08:00"
                    onChange={(e) => handleAutopilotConfigChange('hora1', e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Hora Disparo 2</label>
                  <input 
                    type="text" 
                    value={masterAutopilotConfig.hora2} 
                    placeholder="13:00"
                    onChange={(e) => handleAutopilotConfigChange('hora2', e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Hora Disparo 3</label>
                  <input 
                    type="text" 
                    value={masterAutopilotConfig.hora3} 
                    placeholder="18:00"
                    onChange={(e) => handleAutopilotConfigChange('hora3', e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Espera de Retardo (Intervalo)</label>
                  <input 
                    type="number" 
                    value={masterAutopilotConfig.intervalo_val} 
                    onChange={(e) => handleAutopilotConfigChange('intervalo_val', e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Unidad de Tiempo</label>
                  <select 
                    value={masterAutopilotConfig.intervalo_uni} 
                    onChange={(e) => handleAutopilotConfigChange('intervalo_uni', e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}
                  >
                    <option value="minutos">Minutos</option>
                    <option value="horas">Horas</option>
                  </select>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button 
                onClick={() => setShowAutopilotConfig(false)}
                style={{ 
                  padding: '0.5rem 1.5rem', borderRadius: '6px', border: '1px solid #333',
                  backgroundColor: '#111', color: '#fff', cursor: 'pointer', fontWeight: 'bold'
                }}>
                Cancelar
              </button>
              <button 
                onClick={() => {
                  handleSaveMasterAutopilotConfig();
                  setShowAutopilotConfig(false);
                }}
                style={{ 
                  padding: '0.5rem 1.5rem', borderRadius: '6px', border: 'none',
                  backgroundColor: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 'bold'
                }}>
                Guardar Ajustes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sincronización Global de Configs (Modal Popup) */}
      {showConfig && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(2, 3, 5, 0.82)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 999999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem'
        }}>
          <div style={{
            backgroundColor: '#181b26',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 32px 70px rgba(0, 0, 0, 0.85), 0 0 45px rgba(59, 130, 246, 0.25)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '600px',
            padding: '2rem',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}>
            {/* Top Accent Strip */}
            <div style={{
              height: '4px',
              backgroundColor: '#2b9eff',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              borderTopLeftRadius: '16px',
              borderTopRightRadius: '16px'
            }} />

            {/* Botón de Cerrar */}
            <button
              onClick={() => setShowConfig(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                transition: 'color 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#f3f4f6'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
            >
              <X size={18} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid #222', paddingBottom: '0.5rem', marginTop: '0.5rem' }}>
              <Database size={18} style={{ color: '#2b9eff' }} />
              <h3 style={{ margin: 0, color: '#fff' }}>Configuración Compartida (Sincronizar a los 4 Bots)</h3>
            </div>
            
            <p style={{ fontSize: '0.85rem', color: '#888', margin: 0 }}>
              Los valores que introduzcas aquí se escribirán automáticamente en las configuraciones locales de los 4 bots.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Usuario Común SPSA (Correo)</label>
                <input 
                  type="text" 
                  value={syncFields.user_spsa || ''} 
                  onChange={(e) => handleInputChange('user_spsa', e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Fecha de Inicio Sincro</label>
                <input
                  type="date"
                  value={syncFields.fec_ini || ''}
                  onChange={(e) => handleInputChange('fec_ini', e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}
                />
                <p style={{ fontSize: '0.72rem', color: '#666', margin: '0.35rem 0 0', lineHeight: 1.4 }}>
                  ℹ️ La fecha de fin no se configura: siempre toma la fecha/hora exacta en que corre cada bot (manual o autopiloto), para nunca quedarse con datos de un día anterior.
                </p>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Ruta Base de Google Drive</label>
              <input 
                type="text" 
                value={syncFields.path_gdrive} 
                onChange={(e) => handleInputChange('path_gdrive', e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>URL de Supabase</label>
              <input 
                type="text" 
                value={syncFields.url_supabase} 
                onChange={(e) => handleInputChange('url_supabase', e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>API Key Supabase (anon key)</label>
              <textarea 
                rows={2}
                value={syncFields.key_supabase} 
                onChange={(e) => handleInputChange('key_supabase', e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#000', color: '#fff', fontFamily: 'monospace', fontSize: '0.75rem' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button 
                onClick={() => setShowConfig(false)}
                style={{ 
                  padding: '0.5rem 1.5rem', borderRadius: '6px', border: '1px solid #333',
                  backgroundColor: '#111', color: '#fff', cursor: 'pointer', fontWeight: 'bold'
                }}>
                Cancelar
              </button>
              <button 
                onClick={() => {
                  handleSyncConfig();
                  setShowConfig(false);
                }}
                style={{ 
                  padding: '0.5rem 1.5rem', borderRadius: '6px', border: 'none',
                  backgroundColor: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 'bold'
                }}>
                Sincronizar Parámetros
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pipeline de Ejecución de Bot Master */}
      <div style={{ 
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem',
        padding: '1.25rem', backgroundColor: '#111', borderRadius: '8px', marginBottom: '1.5rem',
        border: '1px solid #222'
      }}>
        {steps.map((step, idx) => {
          const color = getStepStatusColor(idx);
          const glow = getStepStatusGlow(idx);
          const activacion = ultimasActivaciones[step.id];
          const horaActivacion = activacion ? new Date(activacion.hora_fin || activacion.hora_inicio).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : null;
          const stats = activacion
            ? {
                dateRange: `${activacion.fecha_datos_desde || '?'} a ${activacion.fecha_datos_hasta || '?'} · ${horaActivacion}`,
                records: activacion.registros_procesados != null ? activacion.registros_procesados.toLocaleString() : '0',
                time: horaActivacion,
              }
            : lastRunStats[step.id];
          const isCurrent = masterStatus.running && masterStatus.index === idx;
          const prog = getProgressInfo(step.id);

          const targetBot = bots.find(b => b.id === step.id);
          const isBotRunning = targetBot ? targetBot.status === 'running' : false;

          if (step.id === draggedId) {
            return (
              <div 
                key={step.id} 
                onDragOver={handleDragOver}
                onDragEnter={(e) => handleDragEnter(e, step.id)}
                onDrop={(e) => handleDrop(e, step.id)}
                style={{ 
                  padding: '1rem', 
                  borderRadius: '6px', 
                  border: '2px dashed rgba(59, 130, 246, 0.4)',
                  backgroundColor: 'rgba(15, 17, 21, 0.4)',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  minHeight: '130px',
                  boxShadow: 'inset 0 0 16px rgba(59, 130, 246, 0.08)',
                  transition: 'all 0.2s ease',
                  opacity: 0.85
                }}
              >
                <div style={{ color: 'rgba(96, 165, 250, 0.5)', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                  Soltar aquí
                </div>
              </div>
            );
          }

          return (
            <div 
              key={step.id} 
              draggable="true"
              onDragStart={(e) => handleDragStart(e, step.id)}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDragEnter={(e) => handleDragEnter(e, step.id)}
              onDrop={(e) => handleDrop(e, step.id)}
              style={{ 
                padding: '1rem', 
                borderRadius: '6px', 
                border: `1px solid ${viewedBotId === step.id ? '#3b82f6' : (masterStatus.index === idx ? 'rgba(59, 130, 246, 0.4)' : '#222')}`,
                backgroundColor: viewedBotId === step.id ? 'rgba(59, 130, 246, 0.02)' : '#0a0a0a', 
                transition: 'transform 0.2s ease, opacity 0.2s ease, border-color 0.2s ease',
                display: 'flex', 
                flexDirection: 'column', 
                gap: '0.5rem',
                boxShadow: viewedBotId === step.id ? '0 0 12px rgba(59, 130, 246, 0.15)' : 'none',
                cursor: 'grab'
              }}
            >
              <div 
                onClick={() => {
                  setIsAutoSwitch(false);
                  setViewedBotId(step.id);
                }}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  cursor: 'pointer',
                  padding: '0.2rem 0.4rem',
                  borderRadius: '4px',
                  backgroundColor: viewedBotId === step.id ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                  border: `1px solid ${viewedBotId === step.id ? 'rgba(59, 130, 246, 0.2)' : 'transparent'}`,
                  transition: 'all 0.2s',
                  width: '100%'
                }}
                onMouseEnter={(e) => {
                  if (viewedBotId !== step.id) {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (viewedBotId !== step.id) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <div style={{ 
                  width: '10px', height: '10px', borderRadius: '50%', 
                  backgroundColor: color, 
                  boxShadow: glow, 
                  transition: 'all 0.3s' 
                }}></div>
                <span style={{ 
                  fontSize: '0.85rem', 
                  fontWeight: 'bold', 
                  color: viewedBotId === step.id ? '#60a5fa' : (masterStatus.index >= idx ? '#fff' : '#aaa') 
                }}>
                  {step.name}
                </span>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <RunningBot isRunning={isBotRunning} size={20} />
                  {isBotRunning && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onStop) onStop(step.id);
                      }}
                      title={`Detener ${step.name}`}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: '22px', height: '22px', padding: 0,
                        borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.4)',
                        backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444',
                        cursor: 'pointer'
                      }}
                    >
                      <Square size={11} />
                    </button>
                  )}
                </div>
              </div>

              {isCurrent ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: '#aaa', fontWeight: 500 }}>Progreso:</span>
                    <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>
                      {prog?.pct != null ? `${prog.pct}%` : 'Ejecutando...'}
                    </span>
                  </div>
                  
                  {/* Progress Track */}
                  <div style={{ 
                    height: '6px', backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                    borderRadius: '3px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.03)'
                  }}>
                    <div style={{ 
                      height: '100%', 
                      width: prog?.pct != null ? `${prog.pct}%` : '100%', 
                      backgroundColor: '#3b82f6',
                      boxShadow: '0 0 8px #3b82f6',
                      borderRadius: '3px',
                      transition: 'width 0.4s ease',
                      animation: prog?.pct == null ? 'pulseBar 1.5s infinite ease-in-out' : 'none'
                    }} />
                  </div>

                  <span style={{ 
                    fontSize: '0.68rem', color: '#888', fontStyle: 'italic',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    marginTop: '0.15rem', display: 'block'
                  }}>
                    {prog?.telemetry || 'Iniciando bot...'}
                  </span>
                </div>
              ) : isBotRunning ? (() => {
                const externa = getProximaFor(step.id);
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    padding: '0.4rem 0.5rem', backgroundColor: '#111', borderRadius: '4px',
                    border: '1px solid #222'
                  }}>
                    <CountdownRing
                      remainingSeconds={externa.remaining}
                      totalSeconds={externa.total}
                      color="#e4a02b"
                      size={40}
                      label={externa.text || 'Ejecutando'}
                      active={true}
                    />
                    <span style={{ fontSize: '0.68rem', color: '#e4a02b', lineHeight: 1.3 }}>
                      Corriendo por su cuenta<br />(autopiloto propio, fuera de esta cascada)
                    </span>
                  </div>
                );
              })() : stats ? (
                <div style={{
                  padding: '0.4rem 0.5rem', backgroundColor: '#111', borderRadius: '4px',
                  border: '1px solid #222', fontSize: '0.72rem', display: 'flex',
                  flexDirection: 'column', gap: '0.2rem', fontFamily: 'monospace'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
                    <span>Fechas:</span>
                    <span style={{ color: '#888' }}>{stats.dateRange}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
                    <span>Registros:</span>
                    <span style={{ color: '#22c55e', fontWeight: 'bold' }}>{stats.records}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
                    <span>Hora:</span>
                    <span style={{ color: '#ffffff', fontSize: '0.78rem', fontWeight: 600 }}>{stats.time}</span>
                  </div>
                </div>
              ) : (
                <span style={{ fontSize: '0.7rem', color: '#444', fontStyle: 'italic', paddingLeft: '1.1rem' }}>
                  Sin ejecuciones registradas
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Consola Consolidada */}
      <div style={{ 
        backgroundColor: '#050505', borderRadius: '8px', border: '1px solid #222',
        display: 'flex', flexDirection: 'column', height: '420px', overflow: 'hidden'
      }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #222', backgroundColor: '#111', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444' }}></div>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#eab308' }}></div>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#22c55e' }}></div>
          </div>
          <span style={{ marginLeft: '1rem', fontFamily: 'monospace', color: '#888', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>Terminal:</span>
            <span style={{ color: '#fff', fontWeight: 'bold' }}>
              {viewedBotId === 'bot_master' ? 'Consola Consolidada de Orquestación' : steps.find(s => s.id === viewedBotId)?.name}
            </span>
            {isAutoSwitch && (
              <span style={{ 
                fontSize: '0.65rem', backgroundColor: 'rgba(59, 130, 246, 0.1)', 
                color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)', 
                padding: '0.1rem 0.4rem', borderRadius: '10px', fontWeight: 'bold'
              }}>
                Auto-Seguimiento Activo
              </span>
            )}
          </span>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
            {!isAutoSwitch && (
              <button 
                onClick={() => {
                  setIsAutoSwitch(true);
                  if (masterStatus.running && masterStatus.currentBot) {
                    setViewedBotId(masterStatus.currentBot);
                  }
                }}
                style={{
                  fontSize: '0.7rem',
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #333',
                  color: '#aaa',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#fff';
                  e.currentTarget.style.borderColor = '#444';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#aaa';
                  e.currentTarget.style.borderColor = '#333';
                }}
              >
                Activar Auto-Seguimiento
              </button>
            )}
            {viewedBotId !== 'bot_master' && (
              <button 
                onClick={() => {
                  setIsAutoSwitch(false);
                  setViewedBotId('bot_master');
                }}
                style={{
                  fontSize: '0.7rem',
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #333',
                  color: '#aaa',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#fff';
                  e.currentTarget.style.borderColor = '#444';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#aaa';
                  e.currentTarget.style.borderColor = '#333';
                }}
              >
                Ver Consola Consolidada
              </button>
            )}
          </div>
        </div>
        <div ref={consoleBodyRef} style={{ flex: 1, padding: '1rem', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.85rem' }}>
          {displayLogs.length === 0 ? (
            <div style={{ color: '#444' }}>Master inactivo. Presiona "Iniciar Secuencia" o "Activar Autopiloto" para correr la cascada de bots.</div>
          ) : (
            displayLogs.map(l => {
              const msgStr = l.msg || '';
              return (
                <div key={l.id} style={{
                  marginBottom: '0.25rem',
                  color: l.t === 'error' ? '#ef4444' : (msgStr.includes('✅') || msgStr.includes('🎉') ? '#22c55e' : (msgStr.includes('🚀') || msgStr.includes('🏁') ? '#3b82f6' : '#a1a1aa'))
                }}>
                  {msgStr}
                </div>
              );
            })
          )}
        </div>
      </div>

      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      <InfoModal 
        isOpen={modal.isOpen} 
        title={modal.title} 
        message={modal.message} 
        type={modal.type} 
        onClose={() => setModal({ ...modal, isOpen: false })} 
      />
    </div>
  );
};

export default BotMaster;
