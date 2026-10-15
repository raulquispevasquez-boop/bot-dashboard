import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Settings, RefreshCw } from 'lucide-react';
import Toast from '../common/Toast';
import InfoModal from '../common/InfoModal';
import RunningBot from '../common/RunningBot';
import CountdownRing from '../common/CountdownRing';

const BotInvitacionesMsp = ({ bot, logs, onStart, onStop, socket }) => {
  const [fases, setFases] = useState({
    login: 'idle',
    descarga: 'idle',
    proceso: 'idle',
    drive: 'idle',
    truncate: 'idle',
    insertar: 'idle',
    fin: 'idle'
  });

  const [statusVals, setStatusVals] = useState({
    telemetry: 'Inactivo',
    status_txt: 'Detenido',
    proxima: '',
  });

  const [config, setConfig] = useState({
    user_msp: '',
    pass_msp: '',
    url_supabase: '',
    key_supabase: '',
    tabla_supabase: 'invitaciones_msp',
    path_gdrive: '',
    fec_ini: '2024-01-01',
    fec_fin: '',
    hora1: '08:00',
    hora2: '13:00',
    hora3: '18:00',
    modo_auto: 'HORAS',
    intervalo_val: '30',
    intervalo_uni: 'minutos'
  });

  const [showConfig, setShowConfig] = useState(false);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const consoleBodyRef = useRef(null);

  // Cargar configuración en el montaje
  useEffect(() => {
    if (socket) {
      socket.emit('get_bot_config', 'bot_invitaciones_msp');
      
      const handleConfig = (data) => {
        if (data.id === 'bot_invitaciones_msp' && data.config) {
          setConfig(data.config);
        }
      };

      const handleSharedConfig = (shared) => {
        if (shared) {
          setConfig(prev => ({
            ...prev,
            ...(shared.fec_ini ? { fec_ini: shared.fec_ini } : {}),
            ...(shared.fec_fin ? { fec_fin: shared.fec_fin } : {}),
            ...(shared.url_supabase ? { url_supabase: shared.url_supabase } : {}),
            ...(shared.key_supabase ? { key_supabase: shared.key_supabase } : {}),
            ...(shared.user_spsa ? { user_msp: shared.user_spsa } : {})
          }));
        }
      };

      const handleSaveStatus = (data) => {
        if (data.id === 'bot_invitaciones_msp') {
          if (data.success) {
            // Guardado exitoso
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
      socket.on('shared_config', handleSharedConfig);
      socket.on('save_config_status', handleSaveStatus);
      
      return () => {
        socket.off('bot_config', handleConfig);
        socket.off('shared_config', handleSharedConfig);
        socket.off('save_config_status', handleSaveStatus);
      };
    }
  }, [socket]);
  
  // Procesar logs y actualizar fases
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
    
    // Auto-scroll de la consola
    if (consoleBodyRef.current) {
      consoleBodyRef.current.scrollTop = consoleBodyRef.current.scrollHeight;
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
    if (state === 'error') return '#ef4444';
    return '#333';
  };
  
  const getPhaseGlow = (state) => {
    if (state === 'activo') return '0 0 10px #3b82f6';
    if (state === 'ok') return '0 0 10px #22c55e';
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
        <span style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: estado !== 'idle' ? '#fff' : '#666' }}>
          {label}
        </span>
      </div>
    );
  };

  const saveConfig = () => {
    if (socket) {
      socket.emit('save_bot_config', { botId: 'bot_invitaciones_msp', config });
      setModal({
        isOpen: true,
        title: 'Configuración Guardada',
        message: 'Ajustes de parámetros del Bot Invitaciones MSP guardados correctamente. Se aplicarán de forma automática al iniciar la próxima corrida.',
        type: 'success'
      });
    }
  };

  const handleInputChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const isRunning = bot && bot.status === 'running';

  // Deriva segundos restantes/totales del texto "proxima" para el anillo de
  // progreso. En modo INTERVALO hay un ciclo total fijo (config.intervalo_*);
  // en modo HORAS FIJAS no, asi que el anillo queda en modo indeterminado.
  const parseProxima = () => {
    const text = statusVals.proxima || '';
    const mInt = text.match(/Próxima en (\d+)m (\d+)s/);
    if (mInt) {
      const remaining = parseInt(mInt[1], 10) * 60 + parseInt(mInt[2], 10);
      const totalVal = parseFloat(config.intervalo_val) || 30;
      const totalUni = config.intervalo_uni || 'minutos';
      const total = totalVal * (totalUni === 'horas' ? 3600 : 60);
      return { remaining, total };
    }
    const mHoras = text.match(/en (\d+)h (\d+)m/);
    if (mHoras) {
      const remaining = parseInt(mHoras[1], 10) * 3600 + parseInt(mHoras[2], 10) * 60;
      return { remaining, total: null };
    }
    return { remaining: null, total: null };
  };
  const { remaining: proximaRemaining, total: proximaTotal } = parseProxima();

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
            <h2>Bot Invitaciones MSP (Orquestado)</h2>
            <RunningBot isRunning={isRunning} />
            {statusVals.proxima && (
              <CountdownRing
                remainingSeconds={proximaRemaining}
                totalSeconds={proximaTotal}
                color="#e4a02b"
                size={52}
                label={statusVals.proxima}
                active={isRunning}
              />
            )}
          </div>
          <p style={{ color: 'var(--text-secondary)' }}>
            Estado: <span style={{ color: isRunning ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>
              {isRunning 
                ? (bot.runMode === 'autopilot' ? 'Ejecutando en Autopiloto' : 'Ejecutando Manual') 
                : 'Detenido'}
            </span>
          </p>
        </div>
        
        {/* Acciones */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button 
            onClick={() => setShowConfig(!showConfig)}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #333',
              backgroundColor: '#111', color: '#fff', cursor: 'pointer',
            }}>
            <Settings size={16} /> Configuración
          </button>
          
          <button 
            onClick={() => onStart('manual')} 
            disabled={isRunning}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 1rem', borderRadius: '6px', border: 'none',
              backgroundColor: isRunning ? '#333' : '#22c55e', color: '#fff', 
              cursor: isRunning ? 'not-allowed' : 'pointer', fontWeight: 'bold'
            }}>
            <Play size={16} /> Iniciar Manual
          </button>

          <button 
            onClick={() => onStart('autopilot')} 
            disabled={isRunning}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 1rem', borderRadius: '6px', border: 'none',
              backgroundColor: isRunning ? '#333' : '#3b82f6', color: '#fff', 
              cursor: isRunning ? 'not-allowed' : 'pointer', fontWeight: 'bold'
            }}>
            <RefreshCw size={16} /> Iniciar Autopiloto
          </button>
          
          <button 
            onClick={onStop} 
            disabled={!isRunning}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 1rem', borderRadius: '6px', border: 'none',
              backgroundColor: !isRunning ? '#333' : '#ef4444', color: '#fff', 
              cursor: !isRunning ? 'not-allowed' : 'pointer', fontWeight: 'bold'
            }}>
            <Square size={16} /> Detener
          </button>
        </div>
      </div>

      {/* Formulario de Configuración (Desplegable) */}
      {showConfig && (
        <div style={{ 
          backgroundColor: '#111', border: '1px solid #222', borderRadius: '8px', 
          padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem'
        }}>
          <h3 style={{ borderBottom: '1px solid #222', paddingBottom: '0.5rem' }}>Ajustes del Bot</h3>
          
          {/* Seccion 1: Fechas y Autopiloto */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Fecha de Inicio</label>
              <input
                type="date"
                value={config.fec_ini || ''}
                onChange={(e) => handleInputChange('fec_ini', e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}
              />
              <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.7rem', color: '#666' }}>
                La fecha de fin no se configura: siempre es el día y hora exactos en que se ejecuta el bot.
              </p>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Modo de Autopiloto</label>
              <select 
                value={config.modo_auto || 'HORAS'} 
                onChange={(e) => handleInputChange('modo_auto', e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}
              >
                <option value="HORAS">Horas Fijas</option>
                <option value="INTERVALO">Intervalo de Tiempo</option>
              </select>
            </div>
          </div>

          {config.modo_auto === 'HORAS' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Hora Disparo 1</label>
                <input 
                  type="text" 
                  value={config.hora1 || ''} 
                  placeholder="08:00"
                  onChange={(e) => handleInputChange('hora1', e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Hora Disparo 2</label>
                <input 
                  type="text" 
                  value={config.hora2 || ''} 
                  placeholder="13:00"
                  onChange={(e) => handleInputChange('hora2', e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Hora Disparo 3</label>
                <input 
                  type="text" 
                  value={config.hora3 || ''} 
                  placeholder="18:00"
                  onChange={(e) => handleInputChange('hora3', e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}
                />
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Ejecutar cada</label>
                <input 
                  type="number" 
                  value={config.intervalo_val || '30'} 
                  onChange={(e) => handleInputChange('intervalo_val', e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Unidad de Tiempo</label>
                <select 
                  value={config.intervalo_uni || 'minutos'} 
                  onChange={(e) => handleInputChange('intervalo_uni', e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}
                >
                  <option value="minutos">Minutos</option>
                  <option value="horas">Horas</option>
                </select>
              </div>
            </div>
          )}

          {/* Sección 2: Credenciales de MSP */}
          <h4 style={{ color: '#2b9eff', marginTop: '0.5rem', borderBottom: '1px solid #222', paddingBottom: '0.25rem' }}>Credenciales del Servidor MSP</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Usuario MSP</label>
              <input 
                type="text" 
                value={config.user_msp || ''} 
                onChange={(e) => handleInputChange('user_msp', e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '0.25rem' }}>Contraseña MSP</label>
              <input 
                type="password" 
                value={config.pass_msp || ''} 
                onChange={(e) => handleInputChange('pass_msp', e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#000', color: '#fff' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button 
              onClick={saveConfig}
              style={{ 
                padding: '0.5rem 1.5rem', borderRadius: '6px', border: 'none',
                backgroundColor: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 'bold'
              }}>
              Guardar Ajustes
            </button>
          </div>
        </div>
      )}

      {/* Timeline Visual */}
      <div style={{ 
        display: 'flex', justifyContent: 'space-between', padding: '1.5rem', 
        backgroundColor: '#111', borderRadius: '8px', marginBottom: '1.5rem',
        border: '1px solid #333'
      }}>
        {renderFase('login', 'Login')}
        {renderFase('descarga', 'Descarga')}
        {renderFase('proceso', 'Proceso')}
        {renderFase('drive', 'Drive')}
        {renderFase('truncate', 'Limpieza')}
        {renderFase('insertar', 'Insertar')}
        {renderFase('fin', 'Completado')}
      </div>

      {/* Consola Bonita */}
      <div style={{ 
        backgroundColor: '#050505', borderRadius: '8px', border: '1px solid #222',
        display: 'flex', flexDirection: 'column', height: '400px', overflow: 'hidden'
      }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #222', backgroundColor: '#111', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444' }}></div>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#eab308' }}></div>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#22c55e' }}></div>
          </div>
          <span style={{ marginLeft: '1rem', fontFamily: 'monospace', color: '#888', fontSize: '0.85rem' }}>Terminal MSP-INVITACIONES</span>
        </div>
        <div ref={consoleBodyRef} style={{ flex: 1, padding: '1rem', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.85rem' }}>
          {displayLogs.length === 0 ? (
            <div style={{ color: '#555' }}>Esperando instrucciones...</div>
          ) : (
            displayLogs.map(l => (
              <div key={l.id} style={{
                marginBottom: '0.25rem',
                color: l.t === 'error' ? '#ef4444' : (l.msg.includes('✅') ? '#22c55e' : (l.msg.includes('🔥') || l.msg.includes('⚠️') ? '#eab308' : '#a1a1aa'))
              }}>
                {l.msg}
              </div>
            ))
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

export default BotInvitacionesMsp;
