import React, { useState, useEffect } from 'react';
import { Activity, Play, Square, Settings, Cpu, Eye, EyeOff, X, Key, User, Globe, Clock, Calendar } from 'lucide-react';
import Toast from '../common/Toast';
import InfoModal from '../common/InfoModal';

const BotPmeControl = ({ bot, onStart, onStop, socket, logs = [] }) => {
  const botId = 'bot_pme_spsa';

  // Config State con preajustes de periodo y horas
  const [config, setConfig] = useState({
    url: 'https://10.30.4.124/Web/Auth?ReturnUrl=%2fWeb%2f#Trends/',
    username: 'Supervisor',
    password: '',
    f_ini: '2026-07-23',
    f_fin: new Date().toISOString().split('T')[0],
    hora_ini: '00:00',
    hora_fin: '23:59',
    rango_predefinido: '7_DIAS', // 'ULTIMA_HORA', '3_DIAS', '7_DIAS', '10_DIAS', '15_DIAS', '20_DIAS', '30_DIAS', 'PERSONALIZADO'
    servicios_seleccionados: ['HVAC', 'Alumbrado', 'Frio', 'Total'],
    sedes_seleccionadas: [],
    timeout_seg: 30,
    modo_auto: 'INTERVALO'
  });

  const [showConfig, setShowConfig] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [autopilot, setAutopilot] = useState(false);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  const isRunning = bot?.status === 'running';

  // Escuchar y guardar configuración persistente vía Sockets
  useEffect(() => {
    if (!socket) return;

    socket.emit('get_bot_config', botId);

    const handleConfig = (d) => {
      if (d.id === botId && d.config) {
        setConfig(prev => ({
          ...prev,
          ...d.config
        }));
      }
    };

    const handleSaveStatus = (d) => {
      if (d.id === botId) {
        if (d.success) setToast({ message: 'Configuración guardada correctamente', type: 'success' });
        else setModal({ isOpen: true, title: 'Error al Guardar', message: d.error, type: 'error' });
      }
    };

    socket.on('bot_config', handleConfig);
    socket.on('save_config_status', handleSaveStatus);

    return () => {
      socket.off('bot_config', handleConfig);
      socket.off('save_config_status', handleSaveStatus);
    };
  }, [socket]);

  // Aplicar accesos rápidos de rangos de días u horas
  const aplicarPreajusteRango = (tipo) => {
    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];

    let fIniCalculada = hoyStr;

    if (tipo === '3_DIAS') {
      const d = new Date(); d.setDate(d.getDate() - 3); fIniCalculada = d.toISOString().split('T')[0];
    } else if (tipo === '7_DIAS') {
      const d = new Date(); d.setDate(d.getDate() - 7); fIniCalculada = d.toISOString().split('T')[0];
    } else if (tipo === '10_DIAS') {
      const d = new Date(); d.setDate(d.getDate() - 10); fIniCalculada = d.toISOString().split('T')[0];
    } else if (tipo === '15_DIAS') {
      const d = new Date(); d.setDate(d.getDate() - 15); fIniCalculada = d.toISOString().split('T')[0];
    } else if (tipo === '20_DIAS') {
      const d = new Date(); d.setDate(d.getDate() - 20); fIniCalculada = d.toISOString().split('T')[0];
    } else if (tipo === '30_DIAS') {
      const d = new Date(); d.setDate(d.getDate() - 30); fIniCalculada = d.toISOString().split('T')[0];
    }

    setConfig(p => ({
      ...p,
      rango_predefinido: tipo,
      f_ini: fIniCalculada,
      f_fin: hoyStr
    }));
  };

  const saveConfig = () => {
    if (socket) {
      socket.emit('save_bot_config', { botId, config });
      setToast({ message: 'Guardando configuración PME...', type: 'info' });
    }
  };

  const handleToggleRun = () => {
    if (isRunning) {
      onStop(botId);
    } else {
      onStart(botId, autopilot ? 'autopilot' : 'manual');
    }
  };

  return (
    <div style={{ padding: '1.5rem', color: '#fff' }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <InfoModal isOpen={modal.isOpen} title={modal.title} message={modal.message} type={modal.type} onClose={() => setModal(p => ({ ...p, isOpen: false }))} />

      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', background: '#1e293b', padding: '1.25rem', borderRadius: '12px', border: '1px solid #334155' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '10px', color: '#22c55e' }}>
            <Activity size={28} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Bot Power Monitoring Expert (PME)</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: '#94a3b8' }}>
              Extracción automatizada Schneider EcoStruxure (Power Monitoring Expert)
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => setShowConfig(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              border: '1px solid #475569',
              background: '#334155',
              color: '#fff',
              fontWeight: 500,
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            <Settings size={16} /> Configuración & Credenciales
          </button>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#cbd5e1', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={autopilot} 
              onChange={(e) => setAutopilot(e.target.checked)} 
              disabled={isRunning}
              style={{ width: '16px', height: '16px', accentColor: '#22c55e' }}
            />
            Autopiloto
          </label>

          <button
            onClick={handleToggleRun}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 1.2rem',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 600,
              cursor: 'pointer',
              background: isRunning ? '#ef4444' : '#22c55e',
              color: '#fff',
              transition: 'all 0.2s'
            }}
          >
            {isRunning ? <Square size={16} /> : <Play size={16} />}
            {isRunning ? 'Detener Bot' : 'Iniciar Extracción'}
          </button>
        </div>
      </div>

      {/* Tarjetas de estado e integración */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '10px', border: '1px solid #334155' }}>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Periodo de Extracción</div>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: '#38bdf8' }}>
            {config.f_ini} ➔ {config.f_fin}
          </div>
        </div>

        <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '10px', border: '1px solid #334155' }}>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Rango Horario</div>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: '#fbbf24' }}>
            {config.hora_ini || '00:00'} a {config.hora_fin || '23:59'} hrs
          </div>
        </div>

        <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '10px', border: '1px solid #334155' }}>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Servicios Activos</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#4ade80' }}>
            {(config.servicios_seleccionados || []).length} Seleccionados
          </div>
        </div>

        <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '10px', border: '1px solid #334155' }}>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Estado del Servicio</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 600, color: isRunning ? '#22c55e' : '#f59e0b' }}>
            {isRunning ? 'EN EJECUCIÓN...' : 'STANDBY (Inactivo)'}
          </div>
        </div>
      </div>

      {/* Terminal de Consola de Logs */}
      <div style={{ background: '#0f172a', borderRadius: '12px', border: '1px solid #334155', padding: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#94a3b8', fontSize: '0.875rem' }}>
          <Cpu size={16} />
          <span>Consola de Ejecución en Vivo - Bot Power Monitoring Expert</span>
        </div>
        <div style={{ background: '#020617', padding: '1rem', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.85rem', height: '260px', overflowY: 'auto', color: '#38bdf8' }}>
          {logs.length === 0 ? (
            <span style={{ color: '#64748b' }}>Esperando inicio de tareas para Power Monitoring Expert...</span>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} style={{ marginBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>[{log.timestamp || new Date().toLocaleTimeString()}]</span> {log.message}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal de Configuración & Credenciales */}
      {showConfig && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(3, 4, 6, 0.85)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '600px',
            maxHeight: '90vh',
            overflowY: 'auto',
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '16px',
            padding: '1.75rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #334155', paddingBottom: '0.85rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Key size={18} color="#22c55e" /> Credenciales y Servidor PME
              </h3>
              <button
                onClick={() => setShowConfig(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* URL */}
              <div>
                <label style={{ fontSize: '0.85rem', color: '#cbd5e1', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
                  <Globe size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> URL Plataforma Power Monitoring Expert
                </label>
                <input
                  type="text"
                  value={config.url}
                  onChange={e => setConfig(p => ({ ...p, url: e.target.value }))}
                  placeholder="https://10.30.4.124/..."
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #475569',
                    background: '#0f172a',
                    color: '#fff',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Usuario y Contraseña */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#cbd5e1', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
                    <User size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Usuario / Login
                  </label>
                  <input
                    type="text"
                    value={config.username}
                    onChange={e => setConfig(p => ({ ...p, username: e.target.value }))}
                    placeholder="Ej: Supervisor"
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '8px',
                      border: '1px solid #475569',
                      background: '#0f172a',
                      color: '#fff',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#cbd5e1', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
                    <Key size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Contraseña
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={config.password}
                      onChange={e => setConfig(p => ({ ...p, password: e.target.value }))}
                      placeholder="Contraseña PME"
                      style={{
                        width: '100%',
                        padding: '0.65rem 2.5rem 0.65rem 0.85rem',
                        borderRadius: '8px',
                        border: '1px solid #475569',
                        background: '#0f172a',
                        color: '#fff',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '4px'
                      }}
                      title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showPassword ? <EyeOff size={18} color="#22c55e" /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Botones de Selección Rápida de Periodo (3, 7, 10, 15, 20, 30 Días) */}
              <div>
                <label style={{ fontSize: '0.85rem', color: '#cbd5e1', display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                  ⚡ Selección Rápida de Periodo de Extracción
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {[
                    { id: '3_DIAS', label: 'Últimos 3 Días' },
                    { id: '7_DIAS', label: 'Últimos 7 Días' },
                    { id: '10_DIAS', label: 'Últimos 10 Días' },
                    { id: '15_DIAS', label: 'Últimos 15 Días' },
                    { id: '20_DIAS', label: 'Últimos 20 Días' },
                    { id: '30_DIAS', label: 'Últimos 30 Días' },
                    { id: 'PERSONALIZADO', label: '📅 Elegir Cualquier Día' }
                  ].map(item => {
                    const isSel = config.rango_predefinido === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => aplicarPreajusteRango(item.id)}
                        style={{
                          padding: '0.45rem 0.75rem',
                          borderRadius: '6px',
                          border: isSel ? '1px solid #22c55e' : '1px solid #475569',
                          background: isSel ? 'rgba(34, 197, 94, 0.2)' : '#0f172a',
                          color: isSel ? '#4ade80' : '#cbd5e1',
                          fontSize: '0.8rem',
                          fontWeight: isSel ? 600 : 400,
                          cursor: 'pointer'
                        }}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Rango de Fechas Específicas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: '#0f172a', padding: '0.85rem', borderRadius: '8px', border: '1px solid #334155' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 500 }}>
                    📅 Fecha Inicio
                  </label>
                  <input
                    type="date"
                    value={config.f_ini || ''}
                    onChange={e => setConfig(p => ({ ...p, f_ini: e.target.value, rango_predefinido: 'PERSONALIZADO' }))}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid #475569',
                      background: '#1e293b',
                      color: '#fff',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 500 }}>
                    📅 Fecha Fin
                  </label>
                  <input
                    type="date"
                    value={config.f_fin || ''}
                    onChange={e => setConfig(p => ({ ...p, f_fin: e.target.value, rango_predefinido: 'PERSONALIZADO' }))}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid #475569',
                      background: '#1e293b',
                      color: '#fff',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Filtro por Horas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: '#0f172a', padding: '0.85rem', borderRadius: '8px', border: '1px solid #334155' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 500 }}>
                    ⏰ Hora Inicio
                  </label>
                  <input
                    type="time"
                    value={config.hora_ini || '00:00'}
                    onChange={e => setConfig(p => ({ ...p, hora_ini: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid #475569',
                      background: '#1e293b',
                      color: '#fff',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 500 }}>
                    ⏰ Hora Fin
                  </label>
                  <input
                    type="time"
                    value={config.hora_fin || '23:59'}
                    onChange={e => setConfig(p => ({ ...p, hora_fin: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid #475569',
                      background: '#1e293b',
                      color: '#fff',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Selección Múltiple de Servicios / Categorías */}
              <div>
                <label style={{ fontSize: '0.85rem', color: '#cbd5e1', display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                  ⚡ Servicios / Categorías a Extraer (Selección Múltiple)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: '#0f172a', padding: '0.75rem', borderRadius: '8px', border: '1px solid #475569' }}>
                  {[
                    { id: 'HVAC', label: '❄️ Climatización / HVAC' },
                    { id: 'Alumbrado', label: '💡 Iluminación / Alumbrado' },
                    { id: 'Frio', label: '🧊 Potencia Frío / Refrigeración' },
                    { id: 'Total', label: '📊 Linea Base Total' }
                  ].map(serv => {
                    const active = (config.servicios_seleccionados || []).includes(serv.id);
                    return (
                      <label key={serv.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#fff', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => {
                            setConfig(p => {
                              const curr = p.servicios_seleccionados || [];
                              const next = curr.includes(serv.id) ? curr.filter(x => x !== serv.id) : [...curr, serv.id];
                              return { ...p, servicios_seleccionados: next };
                            });
                          }}
                          style={{ accentColor: '#22c55e', width: '16px', height: '16px' }}
                        />
                        {serv.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1.75rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #334155', paddingTop: '1rem' }}>
              <button
                onClick={() => setShowConfig(false)}
                style={{
                  padding: '0.6rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid #475569',
                  background: '#334155',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  saveConfig();
                  setShowConfig(false);
                }}
                style={{
                  padding: '0.6rem 1.2rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#22c55e',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Guardar Configuración
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BotPmeControl;
