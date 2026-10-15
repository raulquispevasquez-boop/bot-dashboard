import React, { useState, useEffect } from 'react';
import { X, Wrench, RotateCw, CheckCircle2, AlertTriangle } from 'lucide-react';

// Modal dedicado "Solicitudes Fracttal": a diferencia de la columna del
// mismo nombre dentro del modal de medidores (que va por especialidad),
// esta es la vista consolidada de UNA fila por sede con el resultado del
// ÚLTIMO intento de creación de Solicitud de Servicio en Fracttal - tanto
// las que SÍ se crearon (folio vigente) como las que fallaron (causa +
// solución sugerida), con boton de reintento directo. Fuente:
// /api/pme/resumen-solicitudes-fracttal (pme_common.resumen_solicitudes_fracttal).
const FILTROS = [
  { id: 'todas', nombre: 'Todas' },
  { id: 'creadas', nombre: 'Creadas' },
  { id: 'pendientes', nombre: 'Pendientes' },
];

const PmeSolicitudesFracttalModal = ({ isOpen, onClose }) => {
  const [filas, setFilas] = useState('loading'); // 'loading' | 'error' | array
  const [filtro, setFiltro] = useState('todas');
  const [reintentando, setReintentando] = useState(null);
  const [reintentandoLote, setReintentandoLote] = useState(false);
  const backendBaseUrl = window.location.origin.replace('5173', '3001');

  const cargar = () => {
    setFilas('loading');
    fetch(`${backendBaseUrl}/api/pme/resumen-solicitudes-fracttal`)
      .then(r => r.json())
      .then(d => setFilas(d.success ? d.data : 'error'))
      .catch(() => setFilas('error'));
  };

  useEffect(() => {
    if (isOpen) cargar();
  }, [isOpen]);

  if (!isOpen) return null;

  const reintentarUna = (sede) => {
    return fetch(`${backendBaseUrl}/api/pme/reintentar-solicitud-fracttal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sede }),
    }).then(r => r.json()).catch(() => null);
  };

  const reintentar = (sede) => {
    setReintentando(sede);
    reintentarUna(sede)
      .then(() => cargar())
      .finally(() => setReintentando(null));
  };

  // Reintenta TODAS las sedes pendientes ya mismo, una tras otra (no en
  // paralelo, para no golpear a Fracttal con muchos logins seguidos).
  const reintentarTodasPendientes = async () => {
    const sedesPendientes = listaTotal.filter(f => !f.exito).map(f => f.sede);
    if (sedesPendientes.length === 0) return;
    setReintentandoLote(true);
    for (const sede of sedesPendientes) {
      setReintentando(sede);
      // eslint-disable-next-line no-await-in-loop
      await reintentarUna(sede);
    }
    setReintentando(null);
    setReintentandoLote(false);
    cargar();
  };

  const fijarUbicacion = (sede, idLocation, descripcion) => {
    if (!window.confirm(`¿Usar "${descripcion}" como la ubicación correcta de "${sede}"?\n\nEsto queda fijado para siempre para esta sede (no se vuelve a preguntar) y dispara la creación de la solicitud en Fracttal ya mismo.`)) {
      return;
    }
    setReintentando(sede);
    fetch(`${backendBaseUrl}/api/pme/fijar-ubicacion-fracttal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sede, id_location: idLocation }),
    })
      .then(r => r.json())
      .then(() => cargar())
      .catch(() => {})
      .finally(() => setReintentando(null));
  };

  const formatearFecha = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  const listaTotal = Array.isArray(filas) ? filas : [];
  const totalCreadas = listaTotal.filter(f => f.exito).length;
  const totalPendientes = listaTotal.filter(f => !f.exito).length;
  const listaFiltrada = listaTotal.filter(f => {
    if (filtro === 'creadas') return f.exito;
    if (filtro === 'pendientes') return !f.exito;
    return true;
  });

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(3, 4, 6, 0.85)', backdropFilter: 'blur(6px)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
    }}>
      <div style={{ width: '100%', maxWidth: '1200px', maxHeight: '88vh', overflowY: 'auto', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Wrench size={20} color="#38bdf8" /> Solicitudes Fracttal
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>
        <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 0, marginBottom: '0.4rem' }}>
          Una fila por sede con el resultado del último intento de crear una Solicitud de Servicio en Fracttal
          para sus medidores sin datos: creadas (con folio) y las que faltan crear (con la causa exacta y la
          solución sugerida). Botón "Reintentar" para forzar un nuevo intento ya mismo.
        </p>
        <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 0, marginBottom: '1rem', lineHeight: 1.4 }}>
          <b style={{ color: '#94a3b8' }}>"Intentos"</b> cuenta cuántas veces el sistema llamó a Fracttal para esa sede
          (incluye los que fallaron). <b style={{ color: '#94a3b8' }}>Nunca se crean duplicados</b>: una solicitud nueva
          solo se genera cuando aparece un medidor en alerta que todavía no tiene ticket abierto — reintentar algo que
          ya tiene folio vigente no abre uno nuevo, solo confirma o completa lo que falte.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ padding: '0.6rem 1rem', borderRadius: '10px', border: '1px solid #334155', background: '#0f172a' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>{listaTotal.length}</div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Sedes con intento</div>
          </div>
          <div style={{ padding: '0.6rem 1rem', borderRadius: '10px', border: '1px solid #16653455', background: 'rgba(34,197,94,0.08)' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#4ade80' }}>{totalCreadas}</div>
            <div style={{ fontSize: '0.72rem', color: '#86efac' }}>Creadas (con folio)</div>
          </div>
          <div style={{ padding: '0.6rem 1rem', borderRadius: '10px', border: '1px solid #7f1d1d55', background: 'rgba(239,68,68,0.08)' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fca5a5' }}>{totalPendientes}</div>
            <div style={{ fontSize: '0.72rem', color: '#fca5a5' }}>Pendientes de crear</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {FILTROS.map(f => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              style={{
                padding: '0.35rem 0.8rem', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 600,
                border: `1px solid ${filtro === f.id ? '#38bdf8' : '#475569'}`,
                background: filtro === f.id ? 'rgba(56,189,248,0.12)' : 'transparent',
                color: filtro === f.id ? '#38bdf8' : '#94a3b8', cursor: 'pointer'
              }}
            >
              {f.nombre}
            </button>
          ))}
          {totalPendientes > 0 && (
            <button
              onClick={reintentarTodasPendientes}
              disabled={reintentandoLote}
              title="Reintenta, una por una, las sedes pendientes"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto',
                padding: '0.35rem 0.8rem', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700,
                border: '1px solid #f9731655', background: 'rgba(249,115,22,0.1)',
                color: reintentandoLote ? '#78716c' : '#fb923c', cursor: reintentandoLote ? 'default' : 'pointer'
              }}
            >
              <RotateCw size={12} className={reintentandoLote ? 'spin-anim' : undefined} />
              {reintentandoLote ? `Reintentando (${reintentando || ''})…` : `Reintentar las ${totalPendientes} pendientes`}
            </button>
          )}
        </div>

        {filas === 'loading' ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>Cargando…</div>
        ) : filas === 'error' ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#f87171', fontSize: '0.85rem' }}>No se pudo cargar el resumen de solicitudes Fracttal.</div>
        ) : listaTotal.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#4ade80', fontSize: '0.85rem' }}>Todavía no hay ningún intento registrado 🎉</div>
        ) : listaFiltrada.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>No hay sedes en este filtro.</div>
        ) : (
          <div style={{ maxHeight: '50vh', overflowY: 'auto', border: '1px solid #334155', borderRadius: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr style={{ backgroundColor: '#0f172a' }}>
                  <th style={{ textAlign: 'center', padding: '0.55rem 0.5rem', color: '#64748b', fontWeight: 700, width: '2.2rem' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '0.55rem 0.7rem', color: '#cbd5e1', fontWeight: 700 }}>Estado</th>
                  <th style={{ textAlign: 'left', padding: '0.55rem 0.7rem', color: '#cbd5e1', fontWeight: 700 }}>Sede</th>
                  <th style={{ textAlign: 'left', padding: '0.55rem 0.7rem', color: '#cbd5e1', fontWeight: 700 }}>Servicios</th>
                  <th style={{ textAlign: 'left', padding: '0.55rem 0.7rem', color: '#cbd5e1', fontWeight: 700 }}>Folio</th>
                  <th style={{ textAlign: 'left', padding: '0.55rem 0.7rem', color: '#cbd5e1', fontWeight: 700 }}>Causa raíz</th>
                  <th style={{ textAlign: 'left', padding: '0.55rem 0.7rem', color: '#cbd5e1', fontWeight: 700 }}>Solución sugerida</th>
                  <th style={{ textAlign: 'center', padding: '0.55rem 0.7rem', color: '#cbd5e1', fontWeight: 700 }}>Intentos</th>
                  <th style={{ textAlign: 'left', padding: '0.55rem 0.7rem', color: '#cbd5e1', fontWeight: 700 }}>Último intento</th>
                  <th style={{ textAlign: 'center', padding: '0.55rem 0.7rem', color: '#cbd5e1', fontWeight: 700 }}></th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map((f, i) => {
                  const enCurso = reintentando === f.sede;
                  return (
                    <tr key={i} style={{ borderTop: '1px solid #334155', backgroundColor: f.exito ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)' }}>
                      <td style={{ padding: '0.55rem 0.5rem', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ padding: '0.55rem 0.7rem' }}>
                        {f.exito ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#4ade80', fontWeight: 700 }}>
                            <CheckCircle2 size={14} /> Creada
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#fca5a5', fontWeight: 700 }}>
                            <AlertTriangle size={14} /> Pendiente
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.55rem 0.7rem', color: '#fff', fontWeight: 600 }}>{f.sede}</td>
                      <td style={{ padding: '0.55rem 0.7rem', color: '#cbd5e1' }}>{(f.servicios || []).join('-') || '—'}</td>
                      <td style={{ padding: '0.55rem 0.7rem', color: f.folio_vigente ? '#4ade80' : '#64748b', fontWeight: f.folio_vigente ? 700 : 400 }}>
                        {f.folio_vigente ? `#${f.folio_vigente}` : '—'}
                      </td>
                      <td style={{ padding: '0.55rem 0.7rem', color: f.exito ? '#64748b' : '#f87171', lineHeight: 1.35 }}>
                        {f.exito ? '—' : (f.causa || 'desconocida')}
                        {!f.exito && Array.isArray(f.candidatos) && f.candidatos.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.4rem' }}>
                            {f.candidatos.map((c, idx) => (
                              <button
                                key={idx}
                                onClick={() => fijarUbicacion(f.sede, c.id_location, c.descripcion)}
                                disabled={enCurso}
                                title="Fijar esta ubicación como la correcta para esta sede y reintentar ya mismo"
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '0.3rem', textAlign: 'left',
                                  background: 'rgba(56,189,248,0.08)', border: '1px solid #38bdf855', borderRadius: '6px',
                                  padding: '0.25rem 0.5rem', color: enCurso ? '#475569' : '#7dd3fc',
                                  fontSize: '0.7rem', fontWeight: 600, cursor: enCurso ? 'default' : 'pointer'
                                }}
                              >
                                ✓ Usar: {c.descripcion}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.55rem 0.7rem', color: f.exito ? '#64748b' : '#fbbf24', lineHeight: 1.35 }}>{f.exito ? '—' : (f.solucion || '—')}</td>
                      <td style={{ padding: '0.55rem 0.7rem', color: '#94a3b8', textAlign: 'center' }}>{f.intentos}</td>
                      <td style={{ padding: '0.55rem 0.7rem', color: '#64748b', fontSize: '0.72rem' }}>{formatearFecha(f.creado_el)}</td>
                      <td style={{ padding: '0.55rem 0.7rem', textAlign: 'center' }}>
                        <button
                          onClick={() => reintentar(f.sede)}
                          disabled={enCurso}
                          title="Volver a intentar la creación en Fracttal ahora mismo"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                            background: 'none', border: '1px solid #475569', borderRadius: '6px',
                            padding: '0.25rem 0.55rem', color: enCurso ? '#475569' : '#93c5fd',
                            fontSize: '0.7rem', fontWeight: 600, cursor: enCurso ? 'default' : 'pointer'
                          }}
                        >
                          <RotateCw size={11} className={enCurso ? 'spin-anim' : undefined} />
                          {enCurso ? '…' : 'Reintentar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PmeSolicitudesFracttalModal;
