import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Settings, RefreshCw, Terminal, CloudSun, Plus, Trash, X, Calendar, Globe, HardDrive } from 'lucide-react';
import Toast from '../../common/Toast';
import InfoModal from '../../common/InfoModal';
import RunningBot from '../../common/RunningBot';
import MeteoMapa from './MeteoMapa';

// Espejo de VARIABLES_CATALOGO / CATEGORIAS_VARIABLES en bot_clima_spsa_v1_LIBRE.py.
// Núcleo = siempre incluido, no seleccionable (temperatura, humedad, precipitación —
// las variables clave para seguimiento de fenómenos climáticos). El resto son
// opcionales, controladas por config.variables_activas (ya soportado en el bot,
// solo faltaba esta interfaz para seleccionarlas).
const VARIABLES_NUCLEO = [
  'Temperatura máxima', 'Temperatura mínima', 'Temperatura promedio',
  'Humedad relativa promedio', 'Precipitación acumulada',
];
const CATEGORIAS_VARIABLES = [
  { cat: 'viento', label: '🌬 Viento' },
  { cat: 'solar', label: '☀️ Radiación solar' },
  { cat: 'condicion', label: '🌤 Condición general' },
  { cat: 'sensacion', label: '🌡 Sensación térmica' },
  { cat: 'precip_detalle', label: '🌧 Precipitación detallada' },
  { cat: 'sol_uv', label: '🌅 Sol / UV (solo Forecast)' },
];
const VARIABLES_OPCIONALES = [
  { clave: 'wind_speed_10m_max', etiqueta: 'Viento - velocidad máxima', cat: 'viento' },
  { clave: 'wind_gusts_10m_max', etiqueta: 'Viento - ráfaga máxima', cat: 'viento' },
  { clave: 'wind_direction_10m_dominant', etiqueta: 'Viento - dirección dominante', cat: 'viento' },
  { clave: 'shortwave_radiation_sum', etiqueta: 'Radiación solar (onda corta)', cat: 'solar' },
  { clave: 'et0_fao_evapotranspiration', etiqueta: 'Evapotranspiración de referencia', cat: 'solar' },
  { clave: 'weather_code', etiqueta: 'Condición del clima (código WMO)', cat: 'condicion' },
  { clave: 'apparent_temperature_max', etiqueta: 'Sensación térmica máxima', cat: 'sensacion' },
  { clave: 'apparent_temperature_min', etiqueta: 'Sensación térmica mínima', cat: 'sensacion' },
  { clave: 'precipitation_hours', etiqueta: 'Horas con precipitación', cat: 'precip_detalle' },
  { clave: 'rain_sum', etiqueta: 'Lluvia acumulada', cat: 'precip_detalle' },
  { clave: 'showers_sum', etiqueta: 'Chubascos acumulados', cat: 'precip_detalle' },
  { clave: 'snowfall_sum', etiqueta: 'Nieve acumulada', cat: 'precip_detalle' },
  { clave: 'uv_index_max', etiqueta: 'Índice UV máximo (solo forecast)', cat: 'sol_uv' },
  { clave: 'sunrise', etiqueta: 'Hora de amanecer', cat: 'sol_uv' },
  { clave: 'sunset', etiqueta: 'Hora de atardecer', cat: 'sol_uv' },
  { clave: 'daylight_duration', etiqueta: 'Duración de luz de día (seg)', cat: 'sol_uv' },
  { clave: 'sunshine_duration', etiqueta: 'Duración de sol directo (seg)', cat: 'sol_uv' },
];

const BotClimaSpsa = ({ bot, logs, onStart, onStop, socket }) => {
  const botId = 'bot_clima_spsa';

  const [fases, setFases] = useState({
    sedes: 'idle',
    meteo: 'idle',
    proceso: 'idle',
    drive: 'idle',
    insertar: 'idle',
    fin: 'idle'
  });

  const [statusVals, setStatusVals] = useState({
    progress: 0,
    status_txt: 'Detenido',
    telemetry: '',
    reloj: ''
  });

  const [config, setConfig] = useState({
    f_ini: '2024-01-01',
    f_fin: '',
    ventana_movil_dias: 3,
    dias_prediccion: 3,
    modo_auto: 'INTERVALO',
    intervalo_val: '24',
    intervalo_uni: 'horas',
    hora1: '06:00',
    hora2: '12:00',
    hora3: '18:00',
    carpeta_drive: '',
    exportar_excel: true,
    pais: 'Peru',
    variables_activas: ['wind_speed_10m_max', 'wind_gusts_10m_max', 'wind_direction_10m_dominant', 'shortwave_radiation_sum', 'weather_code']
  });

  const [showConfig, setShowConfig] = useState(false);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const consoleEndRef = useRef(null);

  // Set default end date if empty
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setConfig(prev => ({
      ...prev,
      f_fin: prev.f_fin || today
    }));
  }, []);

  // Fetch configuration on mount
  useEffect(() => {
    if (socket) {
      socket.emit('get_bot_config', botId);
      
      const handleConfig = (data) => {
        if (data.id === botId && data.config) {
          setConfig(prev => {
            const today = new Date().toISOString().split('T')[0];
            return {
              ...prev,
              ...data.config,
              f_fin: data.config.f_fin || prev.f_fin || today
            };
          });
        }
      };

      const handleSaveStatus = (data) => {
        if (data.id === botId) {
          if (data.success) {
            setToast({ message: 'Configuración guardada con éxito', type: 'success' });
          } else {
            setModal({
              isOpen: true,
              title: 'Error de Configuración',
              message: 'No se pudo guardar la configuración: ' + data.error,
              type: 'error'
            });
          }
        }
      };
      
      socket.on('bot_config', handleConfig);
      socket.on('save_config_status', handleSaveStatus);
      
      return () => {
        socket.off('bot_config', handleConfig);
        socket.off('save_config_status', handleSaveStatus);
      };
    }
  }, [socket]);
  
  // Track logs and progress
  useEffect(() => {
    let newFases = { ...fases };
    let changed = false;
    let newStatus = { ...statusVals };
    let statusChanged = false;
    
    logs.forEach(l => {
      if (l.type === 'fase') {
        newFases[l.fase] = l.estado;
        changed = true;
      }
      if (l.type === 'status_val') {
        newStatus[l.key] = l.value;
        statusChanged = true;
      }
    });
    
    if (changed) setFases(newFases);
    if (statusChanged) setStatusVals(newStatus);
    
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const displayLogs = [];
  logs.forEach((l, index) => {
    if (l.type === 'log') displayLogs.push({ id: index, msg: l.message, t: 'log' });
    else if (l.type === 'info') displayLogs.push({ id: index, msg: l.message, t: 'info' });
    else if (l.type === 'error') displayLogs.push({ id: index, msg: l.message, t: 'error' });
  });

  const getPhaseColor = (state) => {
    if (state === 'activo') return '#3b82f6';
    if (state === 'ok') return '#22c55e';
    if (state === 'skip') return '#e4a02b';
    if (state === 'error') return '#ef4444';
    return '#333';
  };
  
  const getPhaseGlow = (state) => {
    if (state === 'activo') return '0 0 10px #3b82f6';
    if (state === 'ok') return '0 0 10px #22c55e';
    if (state === 'skip') return '0 0 10px #e4a02b';
    if (state === 'error') return '0 0 10px #ef4444';
    return 'none';
  };

  const renderFase = (key, label) => {
    const estado = fases[key] || 'idle';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
        <div style={{
          width: '20px', height: '20px', borderRadius: '50%',
          backgroundColor: getPhaseColor(estado),
          boxShadow: getPhaseGlow(estado),
          transition: 'all 0.3s ease'
        }}></div>
        <span style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: estado !== 'idle' ? '#fff' : '#666', textAlign: 'center' }}>
          {label}
        </span>
      </div>
    );
  };

  const saveConfig = () => {
    if (socket) {
      socket.emit('save_bot_config', { botId, config });
      setModal({
        isOpen: true,
        title: 'Configuración Guardada',
        message: 'Ajustes del Bot Climático guardados correctamente.',
        type: 'success'
      });
    }
  };

  const handleInputChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleCheckboxChange = (clave) => {
    setConfig(prev => {
      const active = prev.variables_activas || [];
      const updated = active.includes(clave) 
        ? active.filter(c => c !== clave) 
        : [...active, clave];
      return { ...prev, variables_activas: updated };
    });
  };

  const handleAddAccess = () => {
    setConfig(prev => ({
      ...prev,
      otros_accesos: [...(prev.otros_accesos || []), { sitio: '', usuario: '', clave: '' }]
    }));
  };

  const handleRemoveAccess = (index) => {
    setConfig(prev => ({
      ...prev,
      otros_accesos: (prev.otros_accesos || []).filter((_, i) => i !== index)
    }));
  };

  const handleAccessChange = (index, field, value) => {
    setConfig(prev => {
      const updated = [...(prev.otros_accesos || [])];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, otros_accesos: updated };
    });
  };

  const isRunning = bot && bot.status === 'running';

  const variablesCatalogo = [
    { key: 'wind_speed_10m_max', label: 'Viento - velocidad máxima' },
    { key: 'wind_gusts_10m_max', label: 'Viento - ráfaga máxima' },
    { key: 'wind_direction_10m_dominant', label: 'Viento - dirección dominante' },
    { key: 'shortwave_radiation_sum', label: 'Radiación solar' },
    { key: 'weather_code', label: 'Condición del clima (código WMO)' },
    { key: 'apparent_temperature_max', label: 'Sensación térmica máxima' },
    { key: 'apparent_temperature_min', label: 'Sensación térmica mínima' },
    { key: 'rain_sum', label: 'Lluvia acumulada' },
    { key: 'uv_index_max', label: 'Índice UV máximo' }
  ];

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
              background: 'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(6,182,212,0.05))',
              border: '1px solid rgba(6,182,212,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(6,182,212,0.15)'
            }}>
              <CloudSun size={22} color="#06b6d4" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{ margin: 0, color: '#fff', fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                  BOT Clima METEO
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
                    width: '5px', height: '5px', borderRadius: '50%',
                    backgroundColor: isRunning ? '#22c55e' : '#ef4444',
                    boxShadow: isRunning ? '0 0 6px #22c55e' : 'none'
                  }} />
                  {isRunning ? (bot.runMode === 'autopilot' ? 'Autopiloto' : 'Ejecutando') : 'Detenido'}
                </span>
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowConfig(!showConfig)}
              style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
            >
              <Settings size={14} /> Config
            </button>
            <button
              className="btn btn-primary"
              onClick={() => onStart(botId, 'manual')}
              disabled={isRunning}
              style={{ padding: '0.5rem 0.85rem', fontSize: '0.825rem' }}
            >
              <Play size={14} fill="currentColor" /> Manual
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => onStart(botId, 'autopilot')}
              disabled={isRunning}
              style={{ padding: '0.5rem 0.85rem', fontSize: '0.825rem', color: '#e4a02b' }}
            >
              <RefreshCw size={14} /> Autopiloto
            </button>
            {isRunning && (
              <button
                className="btn btn-danger"
                onClick={() => onStop(botId)}
                style={{ padding: '0.5rem 0.85rem', fontSize: '0.825rem' }}
              >
                <Square size={14} fill="currentColor" /> Detener
              </button>
            )}
          </div>
        </div>

        {/* Progress Timeline Panel */}
        <div className="glass-panel" style={{ padding: '1rem 1.25rem', flexShrink: 0 }}>
          <h3 style={{ margin: '0 0 0.85rem 0', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Fases de Ejecución</h3>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
            {renderFase('sedes', 'Sedes')}
            {renderFase('meteo', 'Open-Meteo')}
            {renderFase('proceso', 'Procesado')}
            {renderFase('drive', 'Drive')}
            {renderFase('insertar', 'Supabase')}
            {renderFase('fin', 'Completado')}
          </div>
        </div>

        {/* Scrollable Console Terminal */}
        <div className="glass-panel" style={{ padding: '1.25rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <h3 style={{ margin: '0 0 0.85rem 0', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            <Terminal size={15} color="#06b6d4" /> Consola de Ejecución Satelital
          </h3>
          <div className="terminal" style={{ flex: 1, borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', background: '#0a0c10', padding: '0.85rem', overflowY: 'auto' }}>
            {displayLogs.length === 0 ? (
              <div style={{ color: '#4b5563', fontStyle: 'italic', fontSize: '0.825rem' }}>Esperando inicio del bot satelital Open-Meteo...</div>
            ) : (
              displayLogs.map(l => (
                <div key={l.id} style={{ 
                  marginBottom: '0.25rem',
                  fontFamily: 'monospace', fontSize: '0.8rem',
                  color: l.t === 'error' ? '#ef4444' : (l.msg.includes('✅') || l.msg.includes('OK') || l.msg.includes('COMPLETADO') ? '#22c55e' : (l.msg.includes('⚠️') ? '#eab308' : '#a1a1aa'))
                }}>
                  {l.msg}
                </div>
              ))
            )}
            <div ref={consoleEndRef} />
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Full-Height Satellite Map */}
      <div className="glass-panel" style={{ flex: '1 1 48%', display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', borderRadius: '16px' }}>
        <MeteoMapa socket={socket} isBotRunning={isRunning} logs={logs} config={config} />
      </div>

      {/* Config Modal Overlay */}
      {showConfig && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            backgroundColor: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: '12px',
            width: '620px',
            maxHeight: '90vh',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            fontFamily: 'Consolas, monospace'
          }}>
            {/* Modal Header */}
            <div style={{ 
              padding: '1.5rem 1.5rem 0.5rem 1.5rem', 
              borderBottom: '1px solid #21262d',
              position: 'relative'
            }}>
              <h2 style={{ 
                textAlign: 'center', 
                color: '#2b9eff', 
                fontSize: '22px', 
                fontWeight: 'bold',
                margin: 0,
                textTransform: 'uppercase'
              }}>Configuracion BOT Clima METEO</h2>
              <button 
                onClick={() => setShowConfig(false)}
                style={{
                  position: 'absolute', right: '1.5rem', top: '1.5rem',
                  background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ 
              flex: 1, 
              padding: '1.5rem', 
              overflowY: 'auto',
              color: '#c9d1d9'
            }}>
              {/* Google Drive Local Path */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', color: '#8b949e', marginBottom: '0.5rem' }}>
                  Carpeta local sincronizada con Google Drive:
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    type="text" 
                    placeholder={"Ej. G:\\Mi unidad\\1.GESTION DE MANTENIMIENTO SPSA\\CONSOLIDADO ST-OT\\ST MSP"}
                    value={config.carpeta_drive || ''} 
                    onChange={(e) => handleInputChange('carpeta_drive', e.target.value)}
                    style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #30363d', backgroundColor: '#0d1117', color: '#fff', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              {/* Format and Timezone */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', color: '#8b949e', marginBottom: '0.5rem' }}>
                    Formato de backup:
                  </label>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
                    <label style={{ color: '#c9d1d9', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                      <input type="radio" checked={config.exportar_excel === true} onChange={() => handleInputChange('exportar_excel', true)} style={{ accentColor: '#2b9eff' }} /> Excel (.xlsx)
                    </label>
                    <label style={{ color: '#c9d1d9', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                      <input type="radio" checked={config.exportar_excel === false} onChange={() => handleInputChange('exportar_excel', false)} style={{ accentColor: '#2b9eff' }} /> CSV (.csv)
                    </label>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', color: '#8b949e', marginBottom: '0.5rem' }}>
                    Pais (define timezone):
                  </label>
                  <select 
                    value={config.pais || 'Peru'} 
                    onChange={(e) => handleInputChange('pais', e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #30363d', backgroundColor: '#0d1117', color: '#fff', fontSize: '0.85rem' }}
                  >
                    <option value="Peru">Peru (America/Lima)</option>
                    <option value="Chile">Chile</option>
                    <option value="Colombia">Colombia</option>
                    <option value="Ecuador">Ecuador</option>
                  </select>
                </div>
              </div>

              {/* Date selection & Autopilot */}
              <div style={{ border: '1px solid #21262d', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', backgroundColor: '#161b22' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', color: '#58a6ff', fontSize: '0.9rem' }}>Frecuencia y Rango de Fechas</h4>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#8b949e', marginBottom: '0.25rem' }}>Fecha de Inicio</label>
                    <input 
                      type="date" 
                      value={config.f_ini || ''} 
                      onChange={(e) => handleInputChange('f_ini', e.target.value)}
                      onClick={(e) => { try { e.target.showPicker(); } catch(err){} }}
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #30363d', backgroundColor: '#0d1117', color: '#fff', fontSize: '0.85rem', cursor: 'pointer' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#8b949e', marginBottom: '0.25rem' }}>Fecha de Fin</label>
                    <input
                      type="date"
                      value={config.f_fin || ''}
                      onChange={(e) => handleInputChange('f_fin', e.target.value)}
                      onClick={(e) => { try { e.target.showPicker(); } catch(err){} }}
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #30363d', backgroundColor: '#0d1117', color: '#fff', fontSize: '0.85rem', cursor: 'pointer' }}
                    />
                    <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.65rem', color: '#666', lineHeight: 1.3 }}>
                      Estas dos fechas solo aplican a una corrida manual individual — en autopiloto o en la cascada del Bot Master, las reemplazan la ventana móvil y el pronóstico de abajo.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#8b949e', marginBottom: '0.25rem' }}>Ventana móvil (autopiloto)</label>
                    <select
                      value={config.ventana_movil_dias || 0}
                      onChange={(e) => handleInputChange('ventana_movil_dias', Number(e.target.value))}
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #30363d', backgroundColor: '#0d1117', color: '#fff', fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                      <option value={0}>Fija (usa Fecha de Inicio de arriba)</option>
                      <option value={3}>Últimos 3 días</option>
                      <option value={7}>Últimos 7 días</option>
                      <option value={15}>Últimos 15 días</option>
                    </select>
                    <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.65rem', color: '#666', lineHeight: 1.3 }}>
                      En autopiloto, recalcula el inicio en cada corrida en vez de usar una fecha fija que crece sin límite — los datos climáticos son estables, no hace falta repedir meses ya cargados.
                    </p>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#8b949e', marginBottom: '0.25rem' }}>Pronóstico (autopiloto)</label>
                    <select
                      value={config.dias_prediccion || 0}
                      onChange={(e) => handleInputChange('dias_prediccion', Number(e.target.value))}
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #30363d', backgroundColor: '#0d1117', color: '#fff', fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                      <option value={0}>Sin pronóstico (solo hasta hoy)</option>
                      <option value={1}>+1 día</option>
                      <option value={2}>+2 días</option>
                      <option value={3}>+3 días</option>
                      <option value={5}>+5 días</option>
                      <option value={7}>+7 días</option>
                      <option value={10}>+10 días</option>
                      <option value={15}>+15 días</option>
                    </select>
                    <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.65rem', color: '#666', lineHeight: 1.3 }}>
                      Extiende la fecha de fin al futuro usando el pronóstico real de Open-Meteo (máximo 16 días soportados por su API). A más días, menos precisión — lo típico es confiar en los primeros 5-7.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#8b949e', marginBottom: '0.25rem' }}>Modo Autopiloto</label>
                    <select 
                      value={config.modo_auto || 'INTERVALO'} 
                      onChange={(e) => handleInputChange('modo_auto', e.target.value)}
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #30363d', backgroundColor: '#0d1117', color: '#fff', fontSize: '0.85rem' }}
                    >
                      <option value="HORAS">Horas Fijas</option>
                      <option value="INTERVALO">Intervalo de Tiempo</option>
                    </select>
                  </div>

                  <div>
                    {config.modo_auto === 'HORAS' ? (
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b949e', marginBottom: '0.25rem' }}>T1</label>
                          <input type="text" value={config.hora1 || '06:00'} onChange={(e) => handleInputChange('hora1', e.target.value)} style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #30363d', backgroundColor: '#0d1117', color: '#fff', fontSize: '0.8rem', textAlign: 'center' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b949e', marginBottom: '0.25rem' }}>T2</label>
                          <input type="text" value={config.hora2 || '12:00'} onChange={(e) => handleInputChange('hora2', e.target.value)} style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #30363d', backgroundColor: '#0d1117', color: '#fff', fontSize: '0.8rem', textAlign: 'center' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b949e', marginBottom: '0.25rem' }}>T3</label>
                          <input type="text" value={config.hora3 || '18:00'} onChange={(e) => handleInputChange('hora3', e.target.value)} style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #30363d', backgroundColor: '#0d1117', color: '#fff', fontSize: '0.8rem', textAlign: 'center' }} />
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b949e', marginBottom: '0.25rem' }}>Cada</label>
                          <input type="number" value={config.intervalo_val || '24'} onChange={(e) => handleInputChange('intervalo_val', e.target.value)} style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #30363d', backgroundColor: '#0d1117', color: '#fff', fontSize: '0.85rem', textAlign: 'center' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b949e', marginBottom: '0.25rem' }}>Unidad</label>
                          <select value={config.intervalo_uni || 'horas'} onChange={(e) => handleInputChange('intervalo_uni', e.target.value)} style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #30363d', backgroundColor: '#0d1117', color: '#fff', fontSize: '0.85rem' }}>
                            <option value="horas">Horas</option>
                            <option value="minutos">Minutos</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pausa entre solicitudes (Rate Limiting) */}
                <div style={{ marginTop: '1rem', borderTop: '1px solid #21262d', paddingTop: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#8b949e', marginBottom: '0.25rem' }}>
                    Pausa entre peticiones API (Anti Error 429):
                  </label>
                  <select 
                    value={config.delay_seg ?? '1.5'} 
                    onChange={(e) => handleInputChange('delay_seg', parseFloat(e.target.value))}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: '4px', border: '1px solid #30363d', backgroundColor: '#0d1117', color: '#2b9eff', fontWeight: 'bold', fontSize: '0.85rem' }}
                  >
                    <option value="0.2">⚡ 0.2 seg (Ideal para 1 a 2 años - Rápido)</option>
                    <option value="0.8">⏱️ 0.8 seg (Ideal para 3 a 10 años)</option>
                    <option value="1.5">🛡️ 1.5 seg (Recomendado para 10 a 30 años - Carga Masiva)</option>
                    <option value="2.5">🐢 2.5 seg (Máxima seguridad anti-bloqueo 429)</option>
                  </select>
                </div>
              </div>

              {/* Parámetros a extraer */}
              <div style={{ border: '1px solid #21262d', borderRadius: '8px', padding: '1rem', marginTop: '1rem', backgroundColor: '#161b22' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', color: '#58a6ff', fontSize: '0.9rem' }}>Parámetros a extraer</h4>

                <div style={{ marginBottom: '0.85rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b949e', marginBottom: '0.4rem' }}>
                    Núcleo — siempre incluidos (clave para seguimiento de fenómenos climáticos)
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {VARIABLES_NUCLEO.map((v) => (
                      <span key={v} style={{
                        fontSize: '0.72rem', padding: '0.25rem 0.6rem', borderRadius: '20px',
                        backgroundColor: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)',
                      }}>
                        ✓ {v}
                      </span>
                    ))}
                  </div>
                </div>

                <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b949e', marginBottom: '0.4rem' }}>
                  Opcionales — selecciona cuáles extraer
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  {CATEGORIAS_VARIABLES.map(({ cat, label }) => (
                    <div key={cat}>
                      <div style={{ fontSize: '0.72rem', color: '#aaa', fontWeight: 600, marginBottom: '0.3rem' }}>{label}</div>
                      {VARIABLES_OPCIONALES.filter((v) => v.cat === cat).map((v) => (
                        <label key={v.clave} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: '#ccc', padding: '0.15rem 0', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={(config.variables_activas || []).includes(v.clave)}
                            onChange={() => handleCheckboxChange(v.clave)}
                          />
                          {v.etiqueta}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ 
              padding: '1rem', 
              borderTop: '1px solid #21262d',
              display: 'flex',
              justifyContent: 'center'
            }}>
              <button 
                onClick={() => {
                  saveConfig();
                  setShowConfig(false);
                }}
                style={{ 
                  padding: '0.75rem 2rem', 
                  borderRadius: '6px', 
                  border: 'none',
                  backgroundColor: '#2188ff', 
                  color: '#fff', 
                  cursor: 'pointer', 
                  fontWeight: 'bold',
                  fontSize: '15px',
                  width: '85%',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}
              >
                Guardar y Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BotClimaSpsa;
