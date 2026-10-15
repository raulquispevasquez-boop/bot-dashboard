import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

// Icono de aviso persistente en la parte superior del Bot Master PME. A
// diferencia del log de la consola (que hay que abrir y leer), este icono
// se ve de un vistazo y queda "prendido" mientras haya alertas de sistema
// sin descartar (ej. Supabase rechazando una escritura por RLS: el bot
// sigue corriendo pero esos datos se pierden en silencio si nadie se entera).
const SystemAlertsBell = ({ socket }) => {
  const [alertas, setAlertas] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!socket) return;
    socket.emit('get_alertas_sistema');

    const handleAlertas = (lista) => setAlertas(lista || []);
    socket.on('pme_alertas_sistema', handleAlertas);
    return () => socket.off('pme_alertas_sistema', handleAlertas);
  }, [socket]);

  useEffect(() => {
    const handleClickFuera = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, []);

  const descartar = (id) => {
    if (socket) socket.emit('descartar_alerta_sistema', id);
  };

  const descartarTodas = () => {
    if (socket) socket.emit('descartar_todas_alertas_sistema');
  };

  const hayAlertas = alertas.length > 0;

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setAbierto(p => !p)}
        title={hayAlertas ? `${alertas.length} alerta(s) de sistema sin revisar` : 'Sin alertas de sistema'}
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '40px', height: '40px', borderRadius: '10px', cursor: 'pointer',
          border: hayAlertas ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid #475569',
          background: hayAlertas ? 'rgba(239, 68, 68, 0.15)' : '#334155',
          color: hayAlertas ? '#f87171' : '#94a3b8',
          animation: hayAlertas ? 'pulseBar 1.6s infinite' : 'none'
        }}
      >
        <AlertTriangle size={18} />
        {hayAlertas && (
          <span style={{
            position: 'absolute', top: '-6px', right: '-6px', minWidth: '18px', height: '18px',
            padding: '0 4px', borderRadius: '999px', background: '#ef4444', color: '#fff',
            fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #1e293b'
          }}>
            {alertas.length}
          </span>
        )}
      </button>

      {abierto && (
        <div style={{
          position: 'absolute', top: '48px', right: 0, width: '360px', maxHeight: '420px', overflowY: 'auto',
          background: '#1e293b', border: '1px solid #334155', borderRadius: '12px',
          boxShadow: '0 12px 30px rgba(0,0,0,0.5)', zIndex: 1000
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '0.75rem 1rem', borderBottom: '1px solid #334155'
          }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>Alertas de sistema</span>
            {hayAlertas && (
              <button
                onClick={descartarTodas}
                style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Descartar todas
              </button>
            )}
          </div>

          {!hayAlertas ? (
            <div style={{ padding: '1.5rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '0.82rem' }}>
              Sin alertas de sistema. Todo en orden.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {alertas.slice().reverse().map(a => (
                <div key={a.id} style={{
                  padding: '0.75rem 1rem', borderBottom: '1px solid #283044',
                  display: 'flex', gap: '0.6rem', alignItems: 'flex-start'
                }}>
                  <AlertTriangle size={14} color="#f87171" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.78rem', color: '#e2e8f0', lineHeight: 1.4 }}>{a.mensaje}</div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '4px' }}>
                      {a.botId} · {new Date(a.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => descartar(a.id)}
                    title="Descartar"
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', flexShrink: 0, padding: '2px' }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SystemAlertsBell;
