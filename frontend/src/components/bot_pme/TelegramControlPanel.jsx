import React, { useState, useEffect } from 'react';
import { Send, ChevronDown, ChevronUp, Radio } from 'lucide-react';

// Panel de control para disparar los bots PME desde Telegram (sin entrar al
// dashboard). El backend hace "long polling" a la API de Telegram y, si
// detecta un comando reconocido viniendo del chat autorizado, inicia el
// bot correspondiente igual que el boton "Ejecutar".
const COMANDOS = [
  { comando: '/ejecutar_hvac', desc: 'Inicia el Bot Consolidado HVAC' },
  { comando: '/ejecutar_iluminacion', desc: 'Inicia el Bot Consolidado Iluminación' },
  { comando: '/ejecutar_frio', desc: 'Inicia el Bot Consolidado Frío Alimentario' },
  { comando: '/ejecutar_general', desc: 'Inicia el Bot Consolidado General' },
  { comando: '/estado', desc: 'Consulta el estado de todos los bots PME' },
];

const TelegramControlPanel = ({ socket }) => {
  const [activo, setActivo] = useState(false);
  const [mostrarComandos, setMostrarComandos] = useState(false);
  const [historial, setHistorial] = useState([]);

  useEffect(() => {
    if (!socket) return;
    socket.emit('get_telegram_comandos_status');

    const handleStatus = (d) => setActivo(!!d.activo);
    const handleComando = (d) => {
      setHistorial(prev => [d, ...prev].slice(0, 8));
    };

    socket.on('telegram_comandos_status', handleStatus);
    socket.on('telegram_comando_recibido', handleComando);
    return () => {
      socket.off('telegram_comandos_status', handleStatus);
      socket.off('telegram_comando_recibido', handleComando);
    };
  }, [socket]);

  const toggleActivo = () => {
    const nuevo = !activo;
    setActivo(nuevo);
    if (socket) socket.emit('toggle_telegram_comandos', { activo: nuevo });
  };

  return (
    <div style={{
      background: '#1e293b', border: '1px solid #334155', borderRadius: '12px',
      padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{
            padding: '0.5rem', borderRadius: '8px',
            background: activo ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255,255,255,0.05)',
            color: activo ? '#4ade80' : '#94a3b8', display: 'flex'
          }}>
            <Send size={18} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              Comandos por Telegram
              {activo && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: '#4ade80' }}>
                  <Radio size={11} className="spin-anim" /> escuchando
                </span>
              )}
            </h4>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
              Permite iniciar los bots mandando un comando al bot de Telegram, sin abrir el dashboard.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => setMostrarComandos(p => !p)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: '1px solid #475569',
              borderRadius: '8px', padding: '0.4rem 0.75rem', color: '#cbd5e1', cursor: 'pointer', fontSize: '0.78rem'
            }}
          >
            Ver comandos {mostrarComandos ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <span style={{ fontSize: '0.78rem', color: activo ? '#4ade80' : '#94a3b8', fontWeight: 600 }}>
              {activo ? 'Activo' : 'Inactivo'}
            </span>
            <div
              onClick={toggleActivo}
              style={{
                width: '42px', height: '22px', borderRadius: '999px', position: 'relative', cursor: 'pointer',
                background: activo ? '#22c55e' : '#475569', transition: 'background 0.2s'
              }}
            >
              <div style={{
                width: '16px', height: '16px', borderRadius: '50%', background: '#fff', position: 'absolute',
                top: '3px', left: activo ? '23px' : '3px', transition: 'left 0.2s'
              }} />
            </div>
          </label>
        </div>
      </div>

      {mostrarComandos && (
        <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '0.85rem' }}>
          {COMANDOS.map(c => (
            <div key={c.comando} style={{ display: 'flex', gap: '0.6rem', fontSize: '0.8rem', padding: '0.3rem 0' }}>
              <code style={{ color: '#60a5fa', flexShrink: 0 }}>{c.comando}</code>
              <span style={{ color: '#94a3b8' }}>{c.desc}</span>
            </div>
          ))}
          <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.6rem', marginBottom: 0 }}>
            Solo responde a mensajes del chat de Telegram configurado en Credenciales.
          </p>
        </div>
      )}

      {activo && historial.length > 0 && (
        <div style={{ borderTop: '1px solid #334155', paddingTop: '0.6rem' }}>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Últimos comandos recibidos
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {historial.map((h, i) => (
              <div key={i} style={{ fontSize: '0.78rem', color: '#cbd5e1', display: 'flex', gap: '0.5rem' }}>
                <span style={{ color: '#64748b' }}>{new Date(h.timestamp).toLocaleTimeString()}</span>
                <code style={{ color: '#60a5fa' }}>{h.comando}</code>
                <span>→ {h.botName}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TelegramControlPanel;
