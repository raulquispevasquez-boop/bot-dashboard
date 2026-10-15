import React, { useState, useEffect, useMemo } from 'react';
import { X, CalendarDays, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

const BACKEND = window.location.protocol + '//' + window.location.hostname + ':3001';

const PARAMETROS_POR_BOT = {
  bot_senamhi_spsa: {
    tabla: 'energia."DATA SENAMHI PERU"',
    parametros: [
      'Precipitación (mm)', 'Temp. máxima (°C)', 'Temp. mínima (°C)',
      'Humedad (%)', 'Viento (km/h)', 'Nivel de río (m)', 'Caudal (m³/s)',
    ],
  },
  bot_clima_spsa: {
    tabla: 'energia."DATA METEO CLIMA"',
    parametros: [
      'Precipitación (mm)', 'Temp. máxima (°C)', 'Temp. mínima (°C)', 'Temp. promedio (°C)',
      'Humedad (%)', 'Viento (km/h)', 'Bulbo húmedo máx/mín/promedio (°C)',
    ],
  },
};

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const diasEnMes = (anio, mes) => new Date(anio, mes, 0).getDate();
const esBisiesto = (anio) => (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;

const CoberturaClimaModal = ({ isOpen, onClose, botId, botNombre }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!isOpen || !botId) return;
    setLoading(true);
    setError(null);
    fetch(`${BACKEND}/api/clima/cobertura?bot_id=${botId}`)
      .then(async (res) => {
        const body = await res.json();
        if (!body.success) throw new Error(body.error || 'Error desconocido');
        setRows(Array.isArray(body.data) ? body.data : []);
      })
      .catch((e) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  }, [isOpen, botId]);

  const anioActual = new Date().getFullYear();

  const porAnio = useMemo(() => {
    const acc = {};
    for (const r of rows) {
      if (!acc[r.anio]) acc[r.anio] = { anio: r.anio, dias: 0, desde: r.primera_fecha, hasta: r.ultima_fecha };
      acc[r.anio].dias += r.dias_con_datos;
      if (r.primera_fecha && r.primera_fecha < acc[r.anio].desde) acc[r.anio].desde = r.primera_fecha;
      if (r.ultima_fecha && r.ultima_fecha > acc[r.anio].hasta) acc[r.anio].hasta = r.ultima_fecha;
    }
    return Object.values(acc).sort((a, b) => b.anio - a.anio);
  }, [rows]);

  const mesesAnioActual = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1;
      const fila = rows.find((r) => r.anio === anioActual && r.mes === mes);
      return { mes, dias: fila ? fila.dias_con_datos : 0, totalMes: diasEnMes(anioActual, mes) };
    });
  }, [rows, anioActual]);

  if (!isOpen) return null;

  const info = PARAMETROS_POR_BOT[botId] || { tabla: '', parametros: [] };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(3,4,6,0.85)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#181b26', border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 32px 70px rgba(0,0,0,0.85), 0 0 45px rgba(59,130,246,0.2)',
          borderRadius: '16px', width: '100%', maxWidth: '640px', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ height: '4px', backgroundColor: '#3b82f6', width: '100%', flexShrink: 0 }} />

        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <CalendarDays size={20} color="#60a5fa" />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#fff' }}>Cobertura de datos — {botNombre}</h3>
              {info.tabla && <p style={{ margin: '2px 0 0 0', fontSize: '0.72rem', color: '#6b7280' }}>Tabla: {info.tabla}</p>}
              <p style={{ margin: '4px 0 0 0', fontSize: '0.72rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={12} /> Escritura: Incremental — nunca sobrescribe ni borra información histórica
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Parámetros */}
          <div>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.78rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Parámetros que registra este bot
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {info.parametros.map((p) => (
                <span key={p} style={{
                  fontSize: '0.75rem', padding: '0.3rem 0.6rem', borderRadius: '20px',
                  backgroundColor: 'rgba(59,130,246,0.1)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.25)',
                }}>{p}</span>
              ))}
            </div>
          </div>

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#9ca3af', fontSize: '0.85rem', padding: '1rem 0' }}>
              <Loader2 size={16} className="spin-anim" /> Cargando cobertura de datos...
            </div>
          )}

          {error && (
            <div style={{
              display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.8rem', color: '#fca5a5',
              backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '0.75rem',
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>No se pudo cargar la cobertura: {error}</span>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Cobertura por año */}
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.78rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Cobertura por año
                </h4>
                {porAnio.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>Aún no hay datos registrados.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {porAnio.map((a) => {
                      const totalAnio = esBisiesto(a.anio) ? 366 : 365;
                      const completo = a.dias >= totalAnio - 3;
                      return (
                        <div key={a.anio} style={{
                          display: 'grid', gridTemplateColumns: '70px 1fr 90px 140px', alignItems: 'center', gap: '0.6rem',
                          fontSize: '0.78rem', padding: '0.4rem 0.6rem', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.03)',
                        }}>
                          <span style={{ fontWeight: 700, color: '#fff' }}>{a.anio}</span>
                          <div style={{ height: '8px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', width: `${Math.min(100, (a.dias / totalAnio) * 100)}%`,
                              backgroundColor: completo ? '#22c55e' : '#eab308',
                            }} />
                          </div>
                          <span style={{ color: '#9ca3af', textAlign: 'right' }}>{a.dias}/{totalAnio} días</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: completo ? '#4ade80' : '#facc15', fontWeight: 600, justifySelf: 'end' }}>
                            {completo ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                            {completo ? 'Completo' : 'Parcial'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Año actual por mes */}
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.78rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {anioActual} — detalle por mes
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem' }}>
                  {mesesAnioActual.map((m) => {
                    const pct = m.totalMes > 0 ? Math.min(100, (m.dias / m.totalMes) * 100) : 0;
                    const color = m.dias === 0 ? '#374151' : (m.dias >= m.totalMes ? '#22c55e' : '#eab308');
                    return (
                      <div key={m.mes} style={{
                        display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0.5rem',
                        borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid #1f2430',
                      }}>
                        <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600 }}>{MESES[m.mes - 1]}</span>
                        <div style={{ height: '6px', borderRadius: '3px', backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color }} />
                        </div>
                        <span style={{ fontSize: '0.68rem', color: '#6b7280' }}>{m.dias}/{m.totalMes} días</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CoberturaClimaModal;
