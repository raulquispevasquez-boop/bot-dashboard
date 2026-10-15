import React, { useState, useRef, useEffect } from 'react';
import { Activity, Play, Square, Settings, Cpu, Info, Clock, RefreshCw, X, Download, Wrench } from 'lucide-react';
import PmeCredencialesModal from './PmeCredencialesModal';
import TelegramControlPanel from './TelegramControlPanel';
import SystemAlertsBell from './SystemAlertsBell';
import CapacidadesInfoModal from './CapacidadesInfoModal';
import CountdownRing from '../common/CountdownRing';
import PmeMedidoresModal from './PmeMedidoresModal';
import PmeSolicitudesFracttalModal from './PmeSolicitudesFracttalModal';
import BotPmeHvacCard from './cards/BotPmeHvacCard';
import BotPmeIluminacionCard from './cards/BotPmeIluminacionCard';
import BotPmeFrioCard from './cards/BotPmeFrioCard';
import BotPmeGeneralCard from './cards/BotPmeGeneralCard';

// Bot Master PME: orquestador de toda la familia de bots PME (Schneider EcoStruxure).
// Cada bot de servicio (HVAC, Iluminacion, Frio, General...) vive en su propio archivo
// de tarjeta dentro de components/bot_pme/cards/, y se agrega aqui a CARD_ORDER.
const CARD_ORDER = ['bot_pme_hvac', 'bot_pme_iluminacion', 'bot_pme_frio_alimentario', 'bot_pme_general'];

// Cascada real (servidor): HVAC -> Iluminación -> Frío Alimentario -> General.
const CASCADE_ORDER = ['bot_pme_hvac', 'bot_pme_iluminacion', 'bot_pme_frio_alimentario', 'bot_pme_general'];

const CARD_NAMES = {
  bot_pme_hvac: 'Bot Consolidado HVAC',
  bot_pme_iluminacion: 'Bot Consolidado Iluminación',
  bot_pme_frio_alimentario: 'Bot Consolidado Frío Alimentario',
  bot_pme_general: 'Bot Consolidado General'
};

const CARD_COMPONENTS = {
  bot_pme_hvac: BotPmeHvacCard,
  bot_pme_iluminacion: BotPmeIluminacionCard,
  bot_pme_frio_alimentario: BotPmeFrioCard,
  bot_pme_general: BotPmeGeneralCard
};

const BotMasterPme = ({ bots = [], logs = {}, onStart, onStop, socket }) => {
  const [viewedBotId, setViewedBotId] = useState('bot_master_pme');
  const [showCredenciales, setShowCredenciales] = useState(false);
  const [showCapacidades, setShowCapacidades] = useState(false);
  const [showAutopilotConfig, setShowAutopilotConfig] = useState(false);
  const [showMedidoresModal, setShowMedidoresModal] = useState(false);
  const [showSolicitudesFracttal, setShowSolicitudesFracttal] = useState(false);
  const consoleEndRef = useRef(null);

  const getBot = (id) => bots.find(b => b.id === id) || { id, status: 'stopped' };
  const isAnyRunning = CARD_ORDER.some(id => getBot(id).status === 'running');

  // Estado de la cascada real (HVAC -> Iluminación -> Frío), llega del
  // servidor por 'master_pme_status' -mismo mecanismo que Bot Master
  // Climático, motor independiente.
  const [masterStatus, setMasterStatus] = useState({
    running: false, currentBot: null, index: -1, total: CASCADE_ORDER.length,
    autopilotActive: false, countdown: '', triggerMode: null
  });

  // Ocupado para fines del header (botones Manual/Autopiloto/Detener): solo
  // mira los 3 bots de la cascada real, no "General" (que corre aparte).
  const isCascadeBusy = masterStatus.running || CASCADE_ORDER.some(id => getBot(id).status === 'running');

  // Todo lo que solo aplica en autopiloto vive aquí: cuándo se dispara la
  // cascada y cuánto esperar sin actividad antes de dar por fallado un bot.
  const [masterAutopilotConfig, setMasterAutopilotConfig] = useState({
    modo_auto: 'INTERVALO',
    hora1: '06:00',
    hora2: '12:00',
    hora3: '18:00',
    intervalo_val: '1',
    intervalo_uni: 'horas',
    timeout_inactividad_min: 10,
  });

  useEffect(() => {
    if (!socket) return;
    const handleStatus = (status) => setMasterStatus(prev => ({ ...prev, ...status }));
    socket.on('master_pme_status', handleStatus);
    socket.emit('get_master_pme_config');
    const handleConfig = (cfg) => { if (cfg) setMasterAutopilotConfig(prev => ({ ...prev, ...cfg })); };
    socket.on('master_pme_config', handleConfig);
    return () => {
      socket.off('master_pme_status', handleStatus);
      socket.off('master_pme_config', handleConfig);
    };
  }, [socket]);

  const handleStartManual = () => {
    if (socket) socket.emit('start_master_pme');
  };

  const handleStartAutopilot = () => {
    if (socket) socket.emit('start_master_pme_autopilot');
  };

  const handleStop = () => {
    if (socket) {
      socket.emit('stop_master_pme');
      socket.emit('stop_master_pme_autopilot');
    }
  };

  const getLogsForConsole = () => {
    if (viewedBotId === 'bot_master_pme') {
      return CARD_ORDER.flatMap(id => logs[id] || []);
    }
    return logs[viewedBotId] || [];
  };

  const consoleLogs = getLogsForConsole();

  useEffect(() => {
    // Solo mueve el scroll interno de la consola, nunca el de la pagina.
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollTop = consoleEndRef.current.scrollHeight;
    }
  }, [consoleLogs, viewedBotId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 4rem)', overflow: 'hidden' }}>
      {/* Cabecera fija: nunca se mueve con el scroll */}
      <div style={{
        flexShrink: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: '#1e293b', padding: '1.25rem', borderRadius: '12px', border: '1px solid #334155',
        marginBottom: '1.25rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '10px', color: '#22c55e' }}>
            <Activity size={28} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#fff' }}>Bot Master PME (Orquestador)</h2>
              {masterStatus.running && (
                masterStatus.triggerMode === 'autopilot' ? (
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                    fontSize: '0.75rem', backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    color: '#4ade80', padding: '0.25rem 0.6rem', borderRadius: '20px',
                    border: '1px solid rgba(34, 197, 94, 0.4)', fontWeight: 'bold'
                  }}>
                    <RefreshCw size={12} className="spin-anim" /> Ejecutando Modo Autopiloto
                  </span>
                ) : (
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                    fontSize: '0.75rem', backgroundColor: 'rgba(234, 179, 8, 0.15)',
                    color: '#facc15', padding: '0.25rem 0.6rem', borderRadius: '20px',
                    border: '1px solid rgba(234, 179, 8, 0.4)', fontWeight: 'bold'
                  }}>
                    <Play size={12} style={{ animation: 'pulseBar 1.5s infinite' }} /> Ejecutando Modo Manual
                  </span>
                )
              )}
              {masterStatus.countdown && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CountdownRing
                    remainingSeconds={(() => {
                      if (masterAutopilotConfig.modo_auto !== 'INTERVALO' || !masterStatus.countdown) return null;
                      if (masterStatus.countdown.includes('inminente')) return 0;
                      const m = masterStatus.countdown.match(/(\d+)m\s+(\d+)s/);
                      return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
                    })()}
                    totalSeconds={masterAutopilotConfig.modo_auto === 'INTERVALO'
                      ? (parseFloat(masterAutopilotConfig.intervalo_val) || 1) * (masterAutopilotConfig.intervalo_uni === 'horas' ? 3600 : 60)
                      : null}
                    color="#22c55e"
                    size={44}
                    label={masterStatus.countdown}
                    active={masterStatus.autopilotActive}
                  />
                  <span style={{ fontSize: '0.65rem', color: '#22c55e', maxWidth: '150px', lineHeight: 1.2 }}>
                    {masterStatus.countdown}
                  </span>
                </div>
              )}
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: '#94a3b8' }}>
              Coordina todos los bots de Schneider EcoStruxure Power Monitoring Expert.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <SystemAlertsBell socket={socket} />

          <button
            onClick={() => setShowCapacidades(true)}
            title="Ver qué mide cada bot y qué queda listo para el futuro"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '40px', height: '40px', borderRadius: '10px', cursor: 'pointer',
              border: '1px solid #475569', background: '#334155', color: '#94a3b8'
            }}
          >
            <Info size={18} />
          </button>

          <button
            onClick={() => setShowMedidoresModal(true)}
            title="Ver estado y descargar el plan de acción de medidores por especialidad y consolidado"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem',
              borderRadius: '8px', border: '1px solid #475569', background: '#334155',
              color: '#fff', fontWeight: 500, cursor: 'pointer', fontSize: '0.875rem'
            }}
          >
            <Download size={16} /> Medidores Consolidado
          </button>

          <button
            onClick={() => setShowSolicitudesFracttal(true)}
            title="Ver todas las solicitudes creadas en Fracttal y las que fallaron, con causa y solución"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem',
              borderRadius: '8px', border: '1px solid #475569', background: '#334155',
              color: '#fff', fontWeight: 500, cursor: 'pointer', fontSize: '0.875rem'
            }}
          >
            <Wrench size={16} /> Solicitudes Fracttal
          </button>

          <button
            onClick={() => setShowCredenciales(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem',
              borderRadius: '8px', border: '1px solid #475569', background: '#334155',
              color: '#fff', fontWeight: 500, cursor: 'pointer', fontSize: '0.875rem'
            }}
          >
            <Settings size={16} /> Configuración & Credenciales
          </button>

          <button
            onClick={() => setShowAutopilotConfig(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem',
              borderRadius: '8px', border: '1px solid #475569', background: '#334155',
              color: '#fff', fontWeight: 500, cursor: 'pointer', fontSize: '0.875rem'
            }}
          >
            <Clock size={16} /> Programador Maestro
          </button>

          <button
            onClick={handleStartManual}
            disabled={isCascadeBusy}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem',
              borderRadius: '8px', border: 'none', fontWeight: 600,
              cursor: isCascadeBusy ? 'not-allowed' : 'pointer',
              background: isCascadeBusy ? '#333' : '#22c55e', color: '#fff'
            }}
          >
            <Play size={16} /> Manual
          </button>

          <button
            onClick={handleStartAutopilot}
            disabled={isCascadeBusy || masterStatus.autopilotActive}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem',
              borderRadius: '8px', border: 'none', fontWeight: 600,
              cursor: (isCascadeBusy || masterStatus.autopilotActive) ? 'not-allowed' : 'pointer',
              background: (isCascadeBusy || masterStatus.autopilotActive) ? '#333' : '#3b82f6', color: '#fff'
            }}
          >
            <RefreshCw size={16} className={masterStatus.autopilotActive ? 'spin-anim' : ''} /> {masterStatus.autopilotActive ? 'Autopiloto Activo' : 'Activar Autopiloto'}
          </button>

          <button
            onClick={handleStop}
            disabled={!isCascadeBusy && !masterStatus.autopilotActive}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem',
              borderRadius: '8px', border: 'none', fontWeight: 600,
              cursor: (!isCascadeBusy && !masterStatus.autopilotActive) ? 'not-allowed' : 'pointer',
              background: (!isCascadeBusy && !masterStatus.autopilotActive) ? '#333' : '#ef4444', color: '#fff'
            }}
          >
            <Square size={16} /> Detener
          </button>
        </div>
      </div>

      {/* Region scrolleable: Telegram + tarjetas + consola */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingRight: '0.25rem' }}>

      <TelegramControlPanel socket={socket} />

      {/* Grid de tarjetas (cuadritos), uno por cada bot de servicio PME */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem',
        padding: '1.25rem', backgroundColor: '#111', borderRadius: '12px', border: '1px solid #222'
      }}>
        {CARD_ORDER.map(id => {
          const CardComponent = CARD_COMPONENTS[id];
          if (!CardComponent) return null;
          return (
            <CardComponent
              key={id}
              bot={getBot(id)}
              logs={logs[id] || []}
              isSelected={viewedBotId === id}
              onSelectView={() => setViewedBotId(id)}
              onStart={onStart}
              onStop={onStop}
              socket={socket}
            />
          );
        })}
      </div>

      {/* Consola con pestañas */}
      <div style={{
        backgroundColor: '#0a0c10', borderRadius: '12px', border: '1px solid #334155',
        overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '360px'
      }}>
        <div style={{
          display: 'flex', backgroundColor: '#12151e', borderBottom: '1px solid #222',
          padding: '0.4rem 0.8rem', alignItems: 'center', gap: '0.5rem'
        }}>
          <Cpu size={14} color="#888" />
          <span style={{ fontSize: '0.8rem', color: '#888', marginRight: '0.5rem', fontWeight: 600 }}>Terminal de Monitoreo:</span>
          <button
            onClick={() => setViewedBotId('bot_master_pme')}
            style={{
              padding: '0.25rem 0.75rem', borderRadius: '6px', fontSize: '0.78rem', border: 'none',
              backgroundColor: viewedBotId === 'bot_master_pme' ? '#22c55e' : 'transparent',
              color: viewedBotId === 'bot_master_pme' ? '#fff' : '#888', cursor: 'pointer', fontWeight: 600
            }}
          >
            Orquestador General
          </button>
          {CARD_ORDER.map(id => (
            <button
              key={id}
              onClick={() => setViewedBotId(id)}
              style={{
                padding: '0.25rem 0.75rem', borderRadius: '6px', fontSize: '0.78rem', border: 'none',
                backgroundColor: viewedBotId === id ? '#22c55e' : 'transparent',
                color: viewedBotId === id ? '#fff' : '#888', cursor: 'pointer', fontWeight: 600
              }}
            >
              {CARD_NAMES[id] || id}
            </button>
          ))}
        </div>

        <div ref={consoleEndRef} style={{
          flex: 1, padding: '1rem', fontFamily: 'monospace', fontSize: '0.82rem',
          overflowY: 'auto', color: '#d1d5db', display: 'flex', flexDirection: 'column', gap: '0.3rem'
        }}>
          {consoleLogs.length === 0 ? (
            <span style={{ color: '#555' }}>Esperando ejecución del Bot Master PME...</span>
          ) : (
            consoleLogs.map((log, index) => (
              <div key={index} style={{
                color: log.type === 'error' ? '#f87171' : log.type === 'info' ? '#60a5fa' : '#34d399',
                wordBreak: 'break-word', lineHeight: 1.4
              }}>
                {log.message || JSON.stringify(log)}
              </div>
            ))
          )}
        </div>
      </div>

      </div>

      <PmeCredencialesModal isOpen={showCredenciales} onClose={() => setShowCredenciales(false)} socket={socket} />
      <CapacidadesInfoModal isOpen={showCapacidades} onClose={() => setShowCapacidades(false)} />
      <PmeMedidoresModal isOpen={showMedidoresModal} onClose={() => setShowMedidoresModal(false)} />
      <PmeSolicitudesFracttalModal isOpen={showSolicitudesFracttal} onClose={() => setShowSolicitudesFracttal(false)} />

      {/* Programador Maestro Modal Popup */}
      {showAutopilotConfig && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(2, 3, 5, 0.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div style={{ backgroundColor: '#181b26', border: '1px solid rgba(255, 255, 255, 0.15)', boxShadow: '0 32px 70px rgba(0, 0, 0, 0.85), 0 0 45px rgba(34, 197, 94, 0.25)', borderRadius: '16px', width: '100%', maxWidth: '620px', padding: '2rem', position: 'relative', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ height: '4px', backgroundColor: '#22c55e', position: 'absolute', top: 0, left: 0, right: 0, borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }} />
            <button onClick={() => setShowAutopilotConfig(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}><X size={18} /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid #222', paddingBottom: '0.5rem' }}>
              <Clock size={18} style={{ color: '#22c55e' }} />
              <h3 style={{ margin: 0, color: '#fff' }}>Programador Maestro PME</h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#666' }}>
              Solo aplica a la cascada de HVAC → Iluminación → Frío Alimentario → General. El "Intervalo de tiempo" de cada bot (últimos 3/7/15 días) se sigue configurando en su propia tarjeta.
            </p>

            {/* ① Cuándo se dispara */}
            <div style={{ border: '1px solid #222', borderRadius: '8px', padding: '1rem' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#4ade80', fontSize: '0.85rem' }}>① ¿Cuándo se dispara la cascada?</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
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
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0.5rem 0.75rem', backgroundColor: 'rgba(34, 197, 94, 0.08)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#4ade80', fontWeight: 'bold' }}>ℹ️ Funcionamiento:</span>
                  <span style={{ fontSize: '0.75rem', color: '#aaa' }}>Ejecuta HVAC → Iluminación → Frío Alimentario → General en orden, de forma automática.</span>
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
                Por defecto cada 1 hora: como cada bot ya trae "los últimos N días" en cada corrida (no una fecha fija que crece), correr seguido no repite trabajo — solo mantiene la base de datos al día.
              </p>
            </div>

            {/* ② Qué hacer si un bot se cuelga */}
            <div style={{ border: '1px solid #222', borderRadius: '8px', padding: '1rem' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#4ade80', fontSize: '0.85rem' }}>② ¿Cuánto esperar sin actividad antes de dar por fallado un bot?</h4>
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
                No es un tiempo total de corrida — es tiempo <strong style={{ color: '#4ade80' }}>sin ninguna señal de vida</strong> (logs, progreso, sedes procesadas). Mientras el bot siga mostrando actividad puede tardar el tiempo que necesite; si se queda en silencio total más de este umbral, se considera colgado, se cierra a la fuerza y la cascada avanza sola al siguiente bot, dejando un aviso visible en la consola.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button onClick={() => setShowAutopilotConfig(false)} style={{ padding: '0.5rem 1.2rem', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#111', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button
                onClick={() => {
                  if (socket) socket.emit('save_master_pme_autopilot_config', masterAutopilotConfig);
                  setShowAutopilotConfig(false);
                }}
                style={{ padding: '0.5rem 1.2rem', borderRadius: '6px', border: 'none', backgroundColor: '#22c55e', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
              >
                Guardar Ajustes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BotMasterPme;
