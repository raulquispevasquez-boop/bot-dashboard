import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Settings, RefreshCw, Layers, ShieldCheck, CheckCircle, Database, Clock, X, CloudSun, Satellite, GripVertical, CheckCircle2, XCircle, Info } from 'lucide-react';
import Toast from '../common/Toast';
import InfoModal from '../common/InfoModal';
import CoberturaClimaModal from './CoberturaClimaModal';
import RunningBot from '../common/RunningBot';
import CountdownRing from '../common/CountdownRing';
import MapaHibridoClimatico from './MapaHibridoClimatico';

const BACKEND = window.location.protocol + '//' + window.location.hostname + ':3001';

const ESTADO_COLOR = { exito: '#22c55e', fallo: '#ef4444', en_curso: '#eab308', detenido_manual: '#6b7280' };
const ESTADO_LABEL = { exito: 'Éxito', fallo: 'Fallo', en_curso: 'En curso', detenido_manual: 'Detenido' };
const ESTADO_ICON = { exito: CheckCircle2, fallo: XCircle, en_curso: Clock, detenido_manual: XCircle };

const fmtUltimaActivacion = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Espejo de PARAMETROS_OPCIONALES_SENAMHI en bot_senamhi_v1.py. El núcleo
// (precipitación, temperatura, humedad) siempre se sube, no es seleccionable.
const PARAMETROS_NUCLEO_SENAMHI = ['Precipitación (mm)', 'Temperatura máxima', 'Temperatura mínima', 'Humedad relativa'];
const PARAMETROS_OPCIONALES_SENAMHI = [
  { clave: 'viento_kmh', etiqueta: 'Viento (km/h)' },
  { clave: 'nivel_rio_m', etiqueta: 'Nivel de río (m) — solo estaciones hidrológicas' },
  { clave: 'caudal_m3s', etiqueta: 'Caudal (m³/s) — solo estaciones hidrológicas' },
];

const BotMasterClimatico = ({ bots = [], logs = {}, onStart, onStop, socket, stepOrder: propStepOrder, onStepOrderChange }) => {
  const [viewedBotId, setViewedBotId] = useState('bot_master_climatico');
  const [isAutoSwitch, setIsAutoSwitch] = useState(true);

  // Lista de bots administrados por el Orquestador Maestro de Clima
  const initialSteps = [
    { id: 'bot_senamhi_spsa', name: 'Bot SENAMHI V1.0', desc: '1,010 Estaciones Hidrometeorológicas SENAMHI', icon: <Satellite size={16} color="#3b82f6" /> },
    { id: 'bot_clima_spsa', name: 'Bot Open-Meteo V1.0', desc: 'Respaldo Satelital Clima para Sedes Pendientes', icon: <CloudSun size={16} color="#06b6d4" /> }
  ];

  const [localStepOrder, setLocalStepOrder] = useState(() => {
    const saved = localStorage.getItem('clima_step_order');
    return saved ? JSON.parse(saved) : ['bot_senamhi_spsa', 'bot_clima_spsa'];
  });

  const stepOrder = propStepOrder || localStepOrder;
  const updateStepOrder = (newOrder) => {
    if (onStepOrderChange) {
      onStepOrderChange(newOrder);
    } else {
      setLocalStepOrder(newOrder);
      localStorage.setItem('clima_step_order', JSON.stringify(newOrder));
    }
    // El orden visual (Trello) es el mismo que usa la cascada real del servidor.
    if (socket) socket.emit('set_master_climatico_bots_order', newOrder);
  };

  const [draggedId, setDraggedId] = useState(null);

  const [masterStatus, setMasterStatus] = useState({
    running: false,
    currentBot: null,
    index: -1,
    total: 2,
    autopilotActive: false,
    countdown: ''
  });

  const [showConfig, setShowConfig] = useState(false);
  const [showAutopilotConfig, setShowAutopilotConfig] = useState(false);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [coberturaModal, setCoberturaModal] = useState({ isOpen: false, botId: null, botNombre: '' });

  // Campos de Configuración Sincronizada para Clima
  const [syncFields, setSyncFields] = useState({
    url_supabase: 'https://zuouxnvcktjhqzlniion.supabase.co',
    key_supabase: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3V4bnZja3RqaHF6bG5paW9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTE2MTEsImV4cCI6MjA4OTY2NzYxMX0.DxgJzjJjkg7zGdg6c4IFX8oJg0QVs1Fw391KIhqxz84',
    fec_ini: '2025-01-01',
    fec_fin: new Date().toISOString().split('T')[0],
    ventana_movil_dias: 3,
    parametros_activos_senamhi: ['viento_kmh', 'nivel_rio_m', 'caudal_m3s'],
    radio_km: 10,
    delay_seg: 1.5,
    exportar_excel: true
  });

  const toggleParametroSenamhi = (clave) => {
    setSyncFields(prev => {
      const activos = prev.parametros_activos_senamhi || [];
      return {
        ...prev,
        parametros_activos_senamhi: activos.includes(clave) ? activos.filter(c => c !== clave) : [...activos, clave],
      };
    });
  };

  const handleSyncClick = () => {
    if (socket) {
      socket.emit('save_clima_master_config', syncFields);
      setToast({ message: 'Sincronizando parámetros...', type: 'info' });
    }
    setShowConfig(false);
  };

  // Configuración de Autopiloto Maestro del Clima — TODO lo que solo aplica
  // en autopiloto vive aquí: cuándo se dispara la cascada Y qué rango de
  // fechas trae cada disparo, para no tenerlo repartido en dos modales.
  const [masterAutopilotConfig, setMasterAutopilotConfig] = useState({
    modo_auto: 'HORAS',
    hora1: '06:00',
    hora2: '12:00',
    hora3: '18:00',
    intervalo_val: '24',
    intervalo_uni: 'horas',
    ventana_movil_dias: 3,
    dias_prediccion: 3,
    timeout_inactividad_min: 10,
  });

  const consoleEndRef = useRef(null);

  // Escuchar estado dinámico de Socket.io
  useEffect(() => {
    if (socket) {
      const handleMasterStatus = (status) => {
        setMasterStatus(prev => ({ ...prev, ...status }));
      };

      socket.on('master_climatico_status', handleMasterStatus);
      
      // Load initial sync values from backend
      socket.emit('get_clima_master_config');
      
      const handleClimaMasterConfig = (configData) => {
        if (configData) {
          setSyncFields(prev => ({ ...prev, ...configData }));
          // ventana_movil_dias se muestra y edita en "Programador Maestro"
          // (junto con el resto de ajustes de autopiloto), no aquí.
          if (configData.ventana_movil_dias !== undefined) {
            setMasterAutopilotConfig(prev => ({ ...prev, ventana_movil_dias: configData.ventana_movil_dias }));
          }
          if (configData.dias_prediccion !== undefined) {
            setMasterAutopilotConfig(prev => ({ ...prev, dias_prediccion: configData.dias_prediccion }));
          }
        }
      };

      const handleSaveStatus = (status) => {
        if (status.success) {
          setToast({ message: `Parámetros sincronizados correctamente en todos los bots (${status.successCount || 2} bots).`, type: 'success' });
        } else {
          setToast({ message: 'Error al sincronizar parámetros: ' + status.errors.join(', '), type: 'error' });
        }
      };

      socket.on('clima_master_config', handleClimaMasterConfig);
      socket.on('save_clima_master_config_status', handleSaveStatus);

      // Programador Maestro (Horas/Intervalo de la cascada) — evento distinto
      // del de arriba, que es para sincronizar parámetros compartidos.
      socket.emit('get_master_climatico_config');
      const handleAutopilotConfig = (cfg) => {
        if (cfg) setMasterAutopilotConfig(prev => ({ ...prev, ...cfg }));
      };
      const handleAutopilotSaveStatus = (status) => {
        setToast({
          message: status.success ? 'Programador Maestro guardado correctamente.' : 'Error al guardar el Programador Maestro.',
          type: status.success ? 'success' : 'error'
        });
      };
      socket.on('master_climatico_config', handleAutopilotConfig);
      socket.on('save_master_climatico_autopilot_config_status', handleAutopilotSaveStatus);

      return () => {
        socket.off('master_climatico_status', handleMasterStatus);
        socket.off('clima_master_config', handleClimaMasterConfig);
        socket.off('save_clima_master_config_status', handleSaveStatus);
        socket.off('master_climatico_config', handleAutopilotConfig);
        socket.off('save_master_climatico_autopilot_config_status', handleAutopilotSaveStatus);
      };
    }
  }, [socket]);

  // Manejo de Auto-Switch de Consola
  useEffect(() => {
    if (masterStatus.running && masterStatus.currentBot && isAutoSwitch) {
      setViewedBotId(masterStatus.currentBot);
    }
  }, [masterStatus.running, masterStatus.currentBot, isAutoSwitch]);

  const getBot = (id) => bots.find(b => b.id === id) || { id, status: 'stopped' };
  const botSenamhi = getBot('bot_senamhi_spsa');
  const botOpenMeteo = getBot('bot_clima_spsa');

  const isAnyRunning = botSenamhi.status === 'running' || botOpenMeteo.status === 'running' || masterStatus.running;

  // Determina cual bot esta activo AHORA (para el mapa hibrido de abajo) —
  // prioriza SENAMHI si por algun motivo ambos figuraran corriendo a la vez.
  const activeMapBotId = botSenamhi.status === 'running'
    ? 'bot_senamhi_spsa'
    : (botOpenMeteo.status === 'running' ? 'bot_clima_spsa' : null);
  const activeMapTipoFuente = activeMapBotId === 'bot_senamhi_spsa' ? 'senamhi' : 'meteo';
  const activeMapLogs = activeMapBotId ? (logs[activeMapBotId] || []) : [];
  const activeMapConfig = { f_ini: syncFields.fec_ini, f_fin: syncFields.fec_fin };

  // Última activación (fecha + éxito/fallo) por bot, desde la tabla de seguimiento bot_activaciones
  const [ultimasActivaciones, setUltimasActivaciones] = useState({});

  const cargarUltimasActivaciones = async () => {
    for (const botId of ['bot_senamhi_spsa', 'bot_clima_spsa']) {
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

  // Refresca al terminar una corrida (transición running -> no-running)
  const prevRunningRef = useRef({ bot_senamhi_spsa: false, bot_clima_spsa: false });
  useEffect(() => {
    const actuales = { bot_senamhi_spsa: botSenamhi.status === 'running', bot_clima_spsa: botOpenMeteo.status === 'running' };
    const terminoAlguno = Object.keys(actuales).some(id => prevRunningRef.current[id] && !actuales[id]);
    prevRunningRef.current = actuales;
    if (terminoAlguno) {
      setTimeout(cargarUltimasActivaciones, 1500);
    }
  }, [botSenamhi.status, botOpenMeteo.status]);

  // Lógica Drag & Drop estilo Trello
  const handleDragStart = (e, id) => {
    e.dataTransfer.setData('text/plain', id);
    e.currentTarget.style.opacity = '0.4';
    e.currentTarget.style.transform = 'scale(0.97)';
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

    const newOrder = [...stepOrder];
    const draggedIdx = newOrder.indexOf(draggedId);
    const targetIdx = newOrder.indexOf(targetId);

    newOrder.splice(draggedIdx, 1);
    newOrder.splice(targetIdx, 0, draggedId);
    updateStepOrder(newOrder);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDraggedId(null);
  };

  // Obtener logs para la consola seleccionada
  const getLogsForConsole = () => {
    if (viewedBotId === 'bot_master_climatico') {
      const senLogs = logs['bot_senamhi_spsa'] || [];
      const omLogs = logs['bot_clima_spsa'] || [];
      return [...senLogs, ...omLogs];
    }
    return logs[viewedBotId] || [];
  };

  const consoleLogs = getLogsForConsole();

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs, viewedBotId]);

  // La cascada real la maneja el servidor (arranca SENAMHI y, al terminar,
  // encadena Open-Meteo solo) — el estado que se ve en pantalla llega por
  // el evento 'master_climatico_status', no se simula aquí en el cliente.
  const handleStartMasterClima = () => {
    if (socket) socket.emit('start_master_climatico');
  };

  const handleStartMasterClimaAutopilot = () => {
    if (socket) socket.emit('start_master_climatico_autopilot');
  };

  const handleStopMasterClima = () => {
    if (socket) {
      socket.emit('stop_master_climatico');
      socket.emit('stop_master_climatico_autopilot');
    }
  };

  // Lee el progreso (%) y último mensaje de telemetría del stream de logs de
  // un bot, para poder dibujar su barra de progreso mientras corre dentro de
  // la cascada — mismo patrón que el Master de Fracttal-Msp.
  const getProgressInfo = (stepId) => {
    const botLogs = logs ? logs[stepId] : null;
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
          if (msg.trim()) {
            telemetryVal = msg.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');
            break;
          }
        }
      }
    }

    return { telemetry: telemetryVal, pct: progressPct };
  };

  const steps = stepOrder.map((id, idx) => {
    const base = initialSteps.find(s => s.id === id) || { id, name: id, desc: '', icon: null };
    return { ...base, stepNum: idx + 1 };
  });

  // Deriva segundos restantes/totales del texto de countdown del backend para
  // dibujar el anillo de cuenta regresiva — solo es posible en modo INTERVALO,
  // donde existe un ciclo total fijo y conocido (mismo patrón que Fracttal-Msp).
  const parseMasterCountdown = () => {
    if (masterAutopilotConfig.modo_auto !== 'INTERVALO' || !masterStatus.countdown) {
      return { remaining: null, total: null };
    }
    const totalVal = parseFloat(masterAutopilotConfig.intervalo_val) || 24;
    const totalUni = masterAutopilotConfig.intervalo_uni || 'horas';
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
    <div className="bot-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Cabecera pegajosa (Sticky Header) con controles principales */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: '#0f1115',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        paddingTop: '0.5rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: '38px', height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 16px rgba(59,130,246,0.4)'
            }}>
              <CloudSun size={22} color="#fff" />
            </div>
            <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Bot Master Climático (Orquestador Clima)</h2>
            {masterStatus.running && (
              masterStatus.triggerMode === 'autopilot' ? (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  fontSize: '0.75rem', backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  color: '#60a5fa', padding: '0.25rem 0.6rem', borderRadius: '20px',
                  border: '1px solid rgba(59, 130, 246, 0.4)', fontWeight: 'bold',
                  boxShadow: '0 0 10px rgba(59, 130, 246, 0.15)'
                }}>
                  <RefreshCw size={12} className="spin-anim" /> Ejecutando Modo Autopiloto
                </span>
              ) : (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  fontSize: '0.75rem', backgroundColor: 'rgba(234, 179, 8, 0.15)',
                  color: '#facc15', padding: '0.25rem 0.6rem', borderRadius: '20px',
                  border: '1px solid rgba(234, 179, 8, 0.4)', fontWeight: 'bold',
                  boxShadow: '0 0 10px rgba(234, 179, 8, 0.15)'
                }}>
                  <Play size={12} style={{ animation: 'pulseBar 1.5s infinite' }} /> Ejecutando Modo Manual
                </span>
              )
            )}
            {masterStatus.countdown && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CountdownRing
                  remainingSeconds={masterCountdownRemaining}
                  totalSeconds={masterCountdownTotal}
                  color="#22c55e"
                  size={48}
                  label={masterStatus.countdown}
                  active={masterStatus.autopilotActive}
                />
                <span style={{ fontSize: '0.68rem', color: '#22c55e', maxWidth: '150px', lineHeight: 1.2 }}>
                  {masterStatus.countdown}
                </span>
              </div>
            )}
          </div>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0 0', fontSize: '0.85rem' }}>
            Supervisa, coordina y sincroniza la ejecución en cascada de SENAMHI Perú y Open-Meteo.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button
            onClick={() => setShowConfig(!showConfig)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.5rem 0.9rem', borderRadius: '8px', border: '1px solid #333',
              backgroundColor: '#111', color: '#fff', cursor: 'pointer', fontSize: '0.85rem'
            }}
          >
            <Settings size={15} /> Sincronizar Bots
          </button>

          <button
            onClick={() => setShowAutopilotConfig(!showAutopilotConfig)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.5rem 0.9rem', borderRadius: '8px', border: '1px solid #333',
              backgroundColor: '#111', color: '#fff', cursor: 'pointer', fontSize: '0.85rem'
            }}
          >
            <Clock size={15} /> Programador Maestro
          </button>

          <button
            onClick={handleStartMasterClima}
            disabled={isAnyRunning}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.5rem 1.1rem', borderRadius: '8px', border: 'none',
              backgroundColor: isAnyRunning ? '#333' : '#22c55e', color: '#fff',
              cursor: isAnyRunning ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem',
              boxShadow: isAnyRunning ? 'none' : '0 0 12px rgba(34, 197, 94, 0.3)'
            }}
          >
            <Play size={15} /> Manual
          </button>

          <button
            onClick={handleStartMasterClimaAutopilot}
            disabled={isAnyRunning || masterStatus.autopilotActive}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.5rem 1.1rem', borderRadius: '8px', border: 'none',
              backgroundColor: (isAnyRunning || masterStatus.autopilotActive) ? '#333' : '#3b82f6', color: '#fff',
              cursor: (isAnyRunning || masterStatus.autopilotActive) ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem'
            }}
          >
            <RefreshCw size={15} className={masterStatus.autopilotActive ? 'spin-anim' : ''} />
            {masterStatus.autopilotActive ? 'Autopiloto Activo' : 'Activar Autopiloto'}
          </button>

          <button
            onClick={handleStopMasterClima}
            disabled={!isAnyRunning}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.5rem 1.1rem', borderRadius: '8px', border: 'none',
              backgroundColor: !isAnyRunning ? '#333' : '#ef4444', color: '#fff',
              cursor: !isAnyRunning ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem'
            }}
          >
            <Square size={15} /> Detener
          </button>
        </div>
      </div>

      {/* Programador Maestro Modal Popup */}
      {showAutopilotConfig && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(2, 3, 5, 0.82)', backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)', zIndex: 999999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
        }}>
          <div style={{
            backgroundColor: '#181b26', border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 32px 70px rgba(0, 0, 0, 0.85), 0 0 45px rgba(59, 130, 246, 0.25)',
            borderRadius: '16px', width: '100%', maxWidth: '620px', padding: '2rem',
            position: 'relative', display: 'flex', flexDirection: 'column', gap: '1.25rem'
          }}>
            <div style={{ height: '4px', backgroundColor: '#3b82f6', position: 'absolute', top: 0, left: 0, right: 0, borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }} />
            <button onClick={() => setShowAutopilotConfig(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}><X size={18} /></button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid #222', paddingBottom: '0.5rem' }}>
              <Clock size={18} style={{ color: '#3b82f6' }} />
              <h3 style={{ margin: 0, color: '#fff' }}>Programador Maestro del Clima</h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#666' }}>
              Todo lo de acá SOLO aplica en autopiloto — una corrida manual usa las fechas fijas de "Sincronizar Bots".
            </p>

            {/* ① Cuándo se dispara */}
            <div style={{ border: '1px solid #222', borderRadius: '8px', padding: '1rem' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#60a5fa', fontSize: '0.85rem' }}>① ¿Cuándo se dispara la cascada?</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: masterAutopilotConfig.modo_auto ? '1rem' : 0 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Modo de Disparo</label>
                  <select
                    value={masterAutopilotConfig.modo_auto}
                    onChange={(e) => setMasterAutopilotConfig({ ...masterAutopilotConfig, modo_auto: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}
                  >
                    <option value="HORAS">Horas Fijas Diarias</option>
                    <option value="INTERVALO">Intervalo Fijo (Horas/Minutos)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0.5rem 0.75rem', backgroundColor: 'rgba(59, 130, 246, 0.08)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#60a5fa', fontWeight: 'bold' }}>ℹ️ Funcionamiento:</span>
                  <span style={{ fontSize: '0.75rem', color: '#aaa' }}>Ejecuta primero SENAMHI y luego Open-Meteo de forma automática.</span>
                </div>
              </div>

              {masterAutopilotConfig.modo_auto === 'HORAS' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Disparo 1</label>
                    <input type="text" value={masterAutopilotConfig.hora1} onChange={(e) => setMasterAutopilotConfig({ ...masterAutopilotConfig, hora1: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Disparo 2</label>
                    <input type="text" value={masterAutopilotConfig.hora2} onChange={(e) => setMasterAutopilotConfig({ ...masterAutopilotConfig, hora2: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Disparo 3</label>
                    <input type="text" value={masterAutopilotConfig.hora3} onChange={(e) => setMasterAutopilotConfig({ ...masterAutopilotConfig, hora3: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }} />
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Intervalo</label>
                    <input type="number" value={masterAutopilotConfig.intervalo_val} onChange={(e) => setMasterAutopilotConfig({ ...masterAutopilotConfig, intervalo_val: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Unidad</label>
                    <select value={masterAutopilotConfig.intervalo_uni} onChange={(e) => setMasterAutopilotConfig({ ...masterAutopilotConfig, intervalo_uni: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}>
                      <option value="horas">Horas</option>
                      <option value="minutos">Minutos</option>
                    </select>
                  </div>
                </div>
              )}
              <p style={{ margin: '0.6rem 0 0 0', fontSize: '0.68rem', color: '#666', lineHeight: 1.3 }}>
                Ej: "Intervalo: 24 horas" = se dispara una vez al día, sin importar la hora exacta. No tiene relación con los "días" de la sección de abajo.
              </p>
            </div>

            {/* ② Qué rango de fechas trae cada disparo */}
            <div style={{ border: '1px solid #222', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h4 style={{ margin: 0, color: '#60a5fa', fontSize: '0.85rem' }}>② ¿Qué rango de fechas trae cada disparo?</h4>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Ventana móvil (hacia atrás)</label>
                <select
                  value={masterAutopilotConfig.ventana_movil_dias ?? 3}
                  onChange={(e) => setMasterAutopilotConfig({ ...masterAutopilotConfig, ventana_movil_dias: Number(e.target.value) })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#000', color: '#fff', fontSize: '0.85rem' }}
                >
                  <option value={0}>Fija (usa la Fecha de Inicio de "Sincronizar Bots")</option>
                  <option value={3}>Últimos 3 días</option>
                  <option value={7}>Últimos 7 días</option>
                  <option value={15}>Últimos 15 días</option>
                </select>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.68rem', color: '#666', lineHeight: 1.4 }}>
                  Ej: "Últimos 3 días" trae desde hoy-3 hasta hoy, sin importar cuánto lleve corriendo el bot — nunca se queda con una fecha de inicio vieja que sigue creciendo. <strong style={{ color: '#4ade80' }}>El fin SIEMPRE es el momento exacto del disparo</strong>, esto solo controla cuántos días hacia atrás se piden. Aplica a SENAMHI y Open-Meteo por igual.
                </p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Pronóstico (hacia adelante) — solo Open-Meteo</label>
                <select
                  value={masterAutopilotConfig.dias_prediccion ?? 3}
                  onChange={(e) => setMasterAutopilotConfig({ ...masterAutopilotConfig, dias_prediccion: Number(e.target.value) })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#000', color: '#fff', fontSize: '0.85rem' }}
                >
                  <option value={0}>Sin pronóstico</option>
                  <option value={1}>+1 día</option>
                  <option value={2}>+2 días</option>
                  <option value={3}>+3 días</option>
                  <option value={5}>+5 días</option>
                  <option value={7}>+7 días</option>
                  <option value={10}>+10 días</option>
                  <option value={15}>+15 días</option>
                </select>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.68rem', color: '#666', lineHeight: 1.4 }}>
                  Extiende el fin del rango hacia el futuro usando el pronóstico real de Open-Meteo (máximo 16 días soportados por su API; a más días, menos precisión). <strong style={{ color: '#f59e0b' }}>SENAMHI no tiene esta capacidad</strong> — solo afecta al bot Open-Meteo dentro de la cascada, SENAMHI sigue trayendo hasta el momento exacto del disparo.
                </p>
              </div>
            </div>

            {/* ③ Qué hacer si un bot se cuelga */}
            <div style={{ border: '1px solid #222', borderRadius: '8px', padding: '1rem' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#60a5fa', fontSize: '0.85rem' }}>③ ¿Cuánto esperar sin actividad antes de dar por fallado un bot?</h4>
              <select
                value={masterAutopilotConfig.timeout_inactividad_min ?? 10}
                onChange={(e) => setMasterAutopilotConfig({ ...masterAutopilotConfig, timeout_inactividad_min: Number(e.target.value) })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#000', color: '#fff', fontSize: '0.85rem' }}
              >
                <option value={5}>5 minutos</option>
                <option value={10}>10 minutos</option>
                <option value={15}>15 minutos</option>
                <option value={20}>20 minutos</option>
                <option value={30}>30 minutos</option>
              </select>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.68rem', color: '#666', lineHeight: 1.4 }}>
                No es un tiempo total de corrida — es tiempo <strong style={{ color: '#4ade80' }}>sin ninguna señal de vida</strong> (logs, progreso, lotes subidos). Mientras el bot siga mostrando actividad puede tardar el tiempo que necesite; si se queda en silencio total más de este umbral, se considera colgado, se cierra a la fuerza y la cascada avanza sola al siguiente bot, dejando un aviso visible en la consola.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button onClick={() => setShowAutopilotConfig(false)} style={{ padding: '0.5rem 1.2rem', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#111', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button
                onClick={() => {
                  if (socket) {
                    socket.emit('save_master_climatico_autopilot_config', masterAutopilotConfig);
                    // ventana_movil_dias vive en el config de cada bot (lo que
                    // Python realmente lee), no en el archivo del programador —
                    // evento aparte y acotado, para no arrastrar de vuelta los
                    // demás campos de "Sincronizar Bots" (URL, radio, etc.).
                    socket.emit('save_clima_ventana_movil', {
                      ventana_movil_dias: masterAutopilotConfig.ventana_movil_dias,
                      dias_prediccion: masterAutopilotConfig.dias_prediccion,
                    });
                  }
                  setShowAutopilotConfig(false);
                }}
                style={{ padding: '0.5rem 1.2rem', borderRadius: '6px', border: 'none', backgroundColor: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
              >
                Guardar Ajustes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sincronización Global de Configs Modal */}
      {showConfig && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(2, 3, 5, 0.82)', backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)', zIndex: 999999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
        }}>
          <div style={{
            backgroundColor: '#181b26', border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 32px 70px rgba(0, 0, 0, 0.85), 0 0 45px rgba(59, 130, 246, 0.25)',
            borderRadius: '16px', width: '100%', maxWidth: '600px', padding: '2rem',
            position: 'relative', display: 'flex', flexDirection: 'column', gap: '1.25rem'
          }}>
            <div style={{ height: '4px', backgroundColor: '#06b6d4', position: 'absolute', top: 0, left: 0, right: 0, borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }} />
            <button onClick={() => setShowConfig(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}><X size={18} /></button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid #222', paddingBottom: '0.5rem' }}>
              <Database size={18} style={{ color: '#06b6d4' }} />
              <h3 style={{ margin: 0, color: '#fff' }}>Configuración Sincronizada del Clima</h3>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>URL de Supabase</label>
              <input type="text" value={syncFields.url_supabase} onChange={(e) => setSyncFields({ ...syncFields, url_supabase: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Fecha Inicio</label>
                <input type="date" value={syncFields.fec_ini} onChange={(e) => setSyncFields({ ...syncFields, fec_ini: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#000', color: '#fff', fontSize: '0.8rem' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Fecha Fin</label>
                <input type="date" value={syncFields.fec_fin || ''} onChange={(e) => setSyncFields({ ...syncFields, fec_fin: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#000', color: '#fff', fontSize: '0.8rem' }} />
                <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.65rem', color: '#666', lineHeight: 1.3 }}>
                  Solo aplica a una corrida manual individual — en autopiloto o en la cascada del Bot Master siempre se usa el momento exacto de la corrida.
                </p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Radio (km)</label>
                <input type="number" value={syncFields.radio_km} onChange={(e) => setSyncFields({ ...syncFields, radio_km: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#000', color: '#fff', fontSize: '0.8rem' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Pausa API (Anti-429)</label>
                <select
                  value={syncFields.delay_seg ?? 1.5}
                  onChange={(e) => setSyncFields({ ...syncFields, delay_seg: parseFloat(e.target.value) })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#000', color: '#2b9eff', fontWeight: 'bold', fontSize: '0.8rem' }}
                >
                  <option value="0.2">⚡ 0.2s (1-2 años)</option>
                  <option value="0.8">⏱️ 0.8s (3-10 años)</option>
                  <option value="1.5">🛡️ 1.5s (10-30 años)</option>
                  <option value="2.5">🐢 2.5s (Máxima seg.)</option>
                </select>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: '0.68rem', color: '#666', lineHeight: 1.3 }}>
              ℹ️ Fecha Inicio/Fin de aquí son para una corrida manual. Todo lo de autopiloto (cada cuánto se dispara y qué rango de fechas trae) está en el botón "Programador Maestro".
            </p>

            {/* Parámetros de SENAMHI (Open-Meteo tiene su propio selector en su panel individual) */}
            <div style={{ border: '1px solid #222', borderRadius: '8px', padding: '1rem' }}>
              <h4 style={{ margin: '0 0 0.6rem 0', color: '#60a5fa', fontSize: '0.85rem' }}>Parámetros a extraer — SENAMHI</h4>
              <div style={{ marginBottom: '0.6rem' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', color: '#8b949e', marginBottom: '0.35rem' }}>
                  Núcleo — siempre incluidos
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {PARAMETROS_NUCLEO_SENAMHI.map((v) => (
                    <span key={v} style={{
                      fontSize: '0.7rem', padding: '0.2rem 0.55rem', borderRadius: '20px',
                      backgroundColor: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)',
                    }}>
                      ✓ {v}
                    </span>
                  ))}
                </div>
              </div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: '#8b949e', marginBottom: '0.35rem' }}>
                Opcionales — selecciona cuáles extraer
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                {PARAMETROS_OPCIONALES_SENAMHI.map((v) => (
                  <label key={v.clave} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: '#ccc', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={(syncFields.parametros_activos_senamhi || []).includes(v.clave)}
                      onChange={() => toggleParametroSenamhi(v.clave)}
                    />
                    {v.etiqueta}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button onClick={() => setShowConfig(false)} style={{ padding: '0.5rem 1.2rem', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#111', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button onClick={handleSyncClick} style={{ padding: '0.5rem 1.2rem', borderRadius: '6px', border: 'none', backgroundColor: '#06b6d4', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Sincronizar Parámetros</button>
            </div>
          </div>
        </div>
      )}

      {/* Fila principal: columna izquierda (tarjetas + consola) y columna
          derecha (mapa satelital híbrido), estirada a la misma altura. */}
      <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'stretch' }}>
      <div style={{ flex: '1 1 56%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Grid de Tarjetas Estilo Trello Reordenables con Drag & Drop */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '1rem',
        padding: '1.25rem',
        backgroundColor: '#111',
        borderRadius: '12px',
        border: '1px solid #222'
      }}>
        {steps.map((step, idx) => {
          const targetBot = getBot(step.id);
          const isBotRunning = targetBot.status === 'running';
          const isSelected = viewedBotId === step.id;
          const isDragging = step.id === draggedId;
          const prog = isBotRunning ? getProgressInfo(step.id) : null;

          return (
            <div
              key={step.id}
              draggable="true"
              onDragStart={(e) => handleDragStart(e, step.id)}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDragEnter={(e) => handleDragEnter(e, step.id)}
              onDrop={handleDrop}
              style={{
                padding: '1.2rem',
                borderRadius: '10px',
                border: isDragging ? '2px dashed rgba(59, 130, 246, 0.5)' : (isSelected ? '1px solid #3b82f6' : (isBotRunning ? '1px solid #22c55e' : '1px solid #222')),
                backgroundColor: isDragging ? 'rgba(15, 17, 21, 0.4)' : (isSelected ? 'rgba(59, 130, 246, 0.05)' : '#0a0d14'),
                opacity: isDragging ? 0.3 : 1,
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
                boxShadow: isSelected && !isDragging ? '0 0 16px rgba(59, 130, 246, 0.2)' : 'none',
                cursor: 'grab',
                position: 'relative',
                userSelect: 'none'
              }}
            >
              {/* Header de Tarjeta Trello con Agarre */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <GripVertical size={16} color="#666" style={{ cursor: 'grab' }} />
                  {step.icon}
                  <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#fff' }}>
                    {step.stepNum}. {step.name}
                  </h4>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '12px',
                    fontWeight: 600,
                    backgroundColor: isBotRunning ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    color: isBotRunning ? '#4ade80' : '#888',
                    border: isBotRunning ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid #333'
                  }}>
                    {isBotRunning ? '🟢 En Ejecución' : '⚪ Listo'}
                  </span>
                  <RunningBot isRunning={isBotRunning} size={20} />
                </div>
              </div>

              <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0, lineHeight: 1.3 }}>
                {step.desc}
              </p>

              {isBotRunning ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                    <span style={{ color: '#aaa', fontWeight: 500 }}>Progreso:</span>
                    <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>
                      {prog?.pct != null ? `${prog.pct}%` : 'Ejecutando...'}
                    </span>
                  </div>
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
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block'
                  }}>
                    {prog?.telemetry || 'Iniciando bot...'}
                  </span>
                </div>
              ) : (() => {
                const ultima = ultimasActivaciones[step.id];
                if (ultima === undefined) return null; // aún cargando
                const estado = ultima?.estado;
                const EstadoIcon = ESTADO_ICON[estado] || Clock;
                return (
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: '0.2rem',
                    fontSize: '0.72rem', color: '#94a3b8',
                    padding: '0.35rem 0.55rem', borderRadius: '6px',
                    backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid #1f2430'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Clock size={12} color="#6b7280" />
                      <span>Última: {ultima ? fmtUltimaActivacion(ultima.hora_inicio) : 'Sin registros aún'}</span>
                      {ultima && estado && (
                        <span style={{
                          display: 'flex', alignItems: 'center', gap: '0.25rem',
                          marginLeft: 'auto', color: ESTADO_COLOR[estado] || '#888', fontWeight: 600
                        }}>
                          <EstadoIcon size={12} />
                          {ESTADO_LABEL[estado] || estado}
                        </span>
                      )}
                    </div>
                    {ultima && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '1.1rem' }}>
                        <span>Terminó: {ultima.hora_fin ? fmtUltimaActivacion(ultima.hora_fin) : '—'}</span>
                        <span style={{ color: '#22c55e', fontWeight: 'bold' }}>
                          {ultima.registros_procesados != null ? `${ultima.registros_procesados.toLocaleString()} registros` : '—'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Botón interactivo para ver logs o ejecutar */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                <button
                  onClick={() => setViewedBotId(step.id)}
                  style={{
                    flex: 1,
                    padding: '0.4rem',
                    borderRadius: '6px',
                    border: '1px solid #333',
                    backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.2)' : '#12151e',
                    color: isSelected ? '#60a5fa' : '#ccc',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: 600
                  }}
                >
                  {isSelected ? '👁️ Viendo Consola' : 'Ver Logs'}
                </button>

                <button
                  onClick={() => setCoberturaModal({ isOpen: true, botId: step.id, botNombre: step.name })}
                  title="Ver cobertura de datos (años, parámetros, meses/días del año actual)"
                  style={{
                    padding: '0.4rem 0.6rem',
                    borderRadius: '6px',
                    border: '1px solid #333',
                    backgroundColor: '#12151e',
                    color: '#93c5fd',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <Info size={14} />
                </button>

                <button
                  onClick={() => onStart && onStart(step.id, 'manual')}
                  disabled={isAnyRunning}
                  style={{
                    padding: '0.4rem 0.8rem',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: isAnyRunning ? '#222' : '#22c55e',
                    color: '#fff',
                    cursor: isAnyRunning ? 'not-allowed' : 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: 600
                  }}
                >
                  Ejecutar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Terminal Consola de logs con Selector de Pestañas de Consola */}
      <div style={{
        backgroundColor: '#0a0c10',
        borderRadius: '12px',
        border: '1px solid var(--panel-border)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '380px'
      }}>
        {/* Terminal Header Tabs */}
        <div style={{
          display: 'flex',
          backgroundColor: '#12151e',
          borderBottom: '1px solid #222',
          padding: '0.4rem 0.8rem',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <span style={{ fontSize: '0.8rem', color: '#888', marginRight: '0.5rem', fontWeight: 600 }}>Terminal de Monitoreo:</span>
          <button
            onClick={() => setViewedBotId('bot_master_climatico')}
            style={{
              padding: '0.25rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.78rem',
              border: 'none',
              backgroundColor: viewedBotId === 'bot_master_climatico' ? '#3b82f6' : 'transparent',
              color: viewedBotId === 'bot_master_climatico' ? '#fff' : '#888',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Orquestador General
          </button>
          {steps.map(step => (
            <button
              key={step.id}
              onClick={() => setViewedBotId(step.id)}
              style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.78rem',
                border: 'none',
                backgroundColor: viewedBotId === step.id ? '#3b82f6' : 'transparent',
                color: viewedBotId === step.id ? '#fff' : '#888',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              {step.name}
            </button>
          ))}
        </div>

        {/* Console Output */}
        <div style={{
          flex: 1,
          padding: '1rem',
          fontFamily: 'monospace',
          fontSize: '0.82rem',
          overflowY: 'auto',
          color: '#d1d5db',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.3rem'
        }}>
          {consoleLogs.length === 0 ? (
            <span style={{ color: '#555' }}>Esperando ejecución del Bot Master Climático...</span>
          ) : (
            consoleLogs.map((log, index) => (
              <div key={index} style={{
                color: log.type === 'error' ? '#f87171' : log.type === 'info' ? '#60a5fa' : '#34d399',
                wordBreak: 'break-word',
                lineHeight: 1.4
              }}>
                {log.message || JSON.stringify(log)}
              </div>
            ))
          )}
          <div ref={consoleEndRef} />
        </div>
      </div>

      </div>
      {/* Columna derecha: mapa satelital híbrido — alterna entre SENAMHI y
          Open-Meteo según cuál esté activo en la cascada, o queda en modo
          neutral (mapa completo de Perú) cuando ninguno corre. */}
      <div className="glass-panel" style={{ flex: '1 1 44%', minWidth: 0, minHeight: '600px', borderRadius: '16px', overflow: 'hidden' }}>
        <MapaHibridoClimatico
          socket={socket}
          isBotRunning={!!activeMapBotId}
          tipoFuente={activeMapTipoFuente}
          logs={activeMapLogs}
          config={activeMapConfig}
        />
      </div>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <CoberturaClimaModal
        isOpen={coberturaModal.isOpen}
        botId={coberturaModal.botId}
        botNombre={coberturaModal.botNombre}
        onClose={() => setCoberturaModal({ isOpen: false, botId: null, botNombre: '' })}
      />
    </div>
  );
};

export default BotMasterClimatico;
