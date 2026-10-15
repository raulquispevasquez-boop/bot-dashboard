import React, { useState, useEffect } from 'react';
import { X, Download, Gauge, Snowflake, Lightbulb, Refrigerator, Layers, ChevronDown, RotateCw } from 'lucide-react';

// Modal "hub" de medidores en mal estado: un cuadrito por especialidad PME
// (mismo dato que ya vive en cada card individual, pero centralizado para
// no tener que entrar bot por bot) + un cuadrito "Consolidado General" que
// unifica las 4 especialidades por sede (ver pme_common.agrupar_medidores_
// por_sede). Cada cuadrito, incluido el consolidado, tiene su propio icono
// de descarga; al hacer clic en el número se despliega debajo una tabla
// con el detalle Sede/Medidor/Plan de Acción (mismo texto que trae el
// Excel, vía /api/pme/plan-accion-medidores).
const SERVICIOS = [
  { id: 'HVAC', nombre: 'HVAC', icon: Snowflake, color: '#38bdf8' },
  { id: 'Iluminación', nombre: 'Iluminación', icon: Lightbulb, color: '#fbbf24' },
  { id: 'Frío Alimentario', nombre: 'Frío Alimentario', icon: Refrigerator, color: '#22d3ee' },
  { id: 'General', nombre: 'General', icon: Gauge, color: '#a78bfa' },
];

const PmeMedidoresModal = ({ isOpen, onClose }) => {
  const [estados, setEstados] = useState({}); // { servicioId: { nunca, dejaron, total } | 'loading' | 'error' }
  const [detalleId, setDetalleId] = useState(null); // servicio (o 'consolidado') actualmente desplegado
  const [detalleData, setDetalleData] = useState({}); // cache por id: array de filas | 'loading' | 'error'
  const [reintentando, setReintentando] = useState(null); // sede que se esta reintentando ahora mismo, o null
  const backendBaseUrl = window.location.origin.replace('5173', '3001');

  useEffect(() => {
    if (!isOpen) return;
    SERVICIOS.forEach(s => {
      setEstados(prev => ({ ...prev, [s.id]: 'loading' }));
      fetch(`${backendBaseUrl}/api/pme/estado-medidores?servicio=${encodeURIComponent(s.id)}`)
        .then(r => r.json())
        .then(d => {
          const data = d.success ? d.data : [];
          const nunca = data.filter(m => !m.ultima_fecha_con_datos).length;
          const dejaron = data.filter(m => m.ultima_fecha_con_datos).length;
          setEstados(prev => ({ ...prev, [s.id]: { nunca, dejaron, total: data.length } }));
        })
        .catch(() => setEstados(prev => ({ ...prev, [s.id]: 'error' })));
    });
  }, [isOpen]);

  // Reinicia el detalle desplegado cada vez que se abre el modal de nuevo.
  useEffect(() => {
    if (isOpen) { setDetalleId(null); setDetalleData({}); }
  }, [isOpen]);

  if (!isOpen) return null;

  const totalConsolidado = SERVICIOS.reduce((acc, s) => {
    const e = estados[s.id];
    return acc + (e && typeof e === 'object' ? e.total : 0);
  }, 0);
  const algunoCargando = SERVICIOS.some(s => estados[s.id] === 'loading' || estados[s.id] === undefined);

  const cargarDetalle = (id) => {
    setDetalleData(prev => ({ ...prev, [id]: 'loading' }));
    const param = id === 'consolidado' ? 'consolidado' : id;
    fetch(`${backendBaseUrl}/api/pme/plan-accion-medidores?servicio=${encodeURIComponent(param)}`)
      .then(r => r.json())
      .then(d => setDetalleData(prev => ({ ...prev, [id]: d.success ? d.data : 'error' })))
      .catch(() => setDetalleData(prev => ({ ...prev, [id]: 'error' })));
  };

  const toggleDetalle = (id) => {
    if (detalleId === id) {
      setDetalleId(null);
      return;
    }
    setDetalleId(id);
    if (detalleData[id]) return; // ya cacheado
    cargarDetalle(id);
  };

  // Dispara YA MISMO un nuevo intento de creacion en Fracttal para una
  // sede (boton "Reintentar"), sin esperar al proximo cambio de estado.
  // Al terminar, refresca la tabla de detalle actualmente abierta para
  // que se vea el resultado nuevo (exito con folio, o fallo con causa).
  const reintentarSolicitud = (sede) => {
    setReintentando(sede);
    fetch(`${backendBaseUrl}/api/pme/reintentar-solicitud-fracttal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sede }),
    })
      .then(r => r.json())
      .then(() => { if (detalleId) cargarDetalle(detalleId); })
      .catch(() => {})
      .finally(() => setReintentando(null));
  };

  const renderTile = ({ id, nombre, icon: Icon, color, esConsolidado }) => {
    const estado = estados[id];
    const excelUrl = esConsolidado
      ? `${backendBaseUrl}/api/pme/excel-medidores-consolidado`
      : `${backendBaseUrl}/api/pme/excel-medidores?servicio=${encodeURIComponent(id)}`;
    const filename = esConsolidado ? 'medidores_desconectados_consolidado.xlsx' : `medidores_desconectados_${id}.xlsx`;
    const isOpenDetail = detalleId === id;
    const totalTile = esConsolidado ? totalConsolidado : (estado && typeof estado === 'object' ? estado.total : null);
    const clickeable = esConsolidado ? !algunoCargando : (estado && typeof estado === 'object');

    let cuerpo;
    if (esConsolidado) {
      cuerpo = algunoCargando ? (
        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Calculando…</span>
      ) : (
        <>
          <button
            data-testid="detalle-btn-consolidado"
            onClick={() => toggleDetalle('consolidado')}
            disabled={!clickeable}
            title="Ver detalle por sede"
            style={{
              background: 'none', border: 'none', padding: 0, cursor: clickeable ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', gap: '0.35rem'
            }}
          >
            <span style={{ fontSize: '2rem', fontWeight: 800, color: totalConsolidado > 0 ? '#fca5a5' : '#4ade80', textDecoration: totalConsolidado > 0 ? 'underline dotted' : 'none' }}>
              {totalConsolidado}
            </span>
            {totalConsolidado > 0 && <ChevronDown size={18} color="#94a3b8" style={{ transform: isOpenDetail ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />}
          </button>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>medidores sin datos — 4 especialidades</div>
        </>
      );
    } else if (estado === 'loading' || estado === undefined) {
      cuerpo = <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Cargando…</span>;
    } else if (estado === 'error') {
      cuerpo = <span style={{ color: '#f87171', fontSize: '0.8rem' }}>No se pudo consultar</span>;
    } else {
      cuerpo = (
        <>
          <button
            data-testid={`detalle-btn-${id}`}
            onClick={() => toggleDetalle(id)}
            disabled={!clickeable}
            title="Ver detalle por sede"
            style={{
              background: 'none', border: 'none', padding: 0, cursor: clickeable ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', gap: '0.35rem'
            }}
          >
            <span style={{ fontSize: '2rem', fontWeight: 800, color: estado.total > 0 ? '#fca5a5' : '#4ade80', textDecoration: estado.total > 0 ? 'underline dotted' : 'none' }}>
              {estado.total}
            </span>
            {estado.total > 0 && <ChevronDown size={18} color="#94a3b8" style={{ transform: isOpenDetail ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />}
          </button>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            {estado.nunca} nunca reportaron · {estado.dejaron} dejaron de reportar
          </div>
        </>
      );
    }

    return (
      <div
        key={id}
        style={{
          border: `1px solid ${isOpenDetail ? color : (esConsolidado ? color : '#334155')}`,
          borderRadius: '12px', padding: '1.1rem', backgroundColor: esConsolidado ? 'rgba(167, 139, 250, 0.06)' : '#0f172a',
          display: 'flex', flexDirection: 'column', gap: '0.6rem', position: 'relative',
          boxShadow: isOpenDetail ? `0 0 0 2px ${color}55` : 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Icon size={18} color={color} />
          <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#fff' }}>{nombre}</h4>
        </div>

        {cuerpo}

        <a
          href={excelUrl}
          download={filename}
          title={`Descargar Excel — ${nombre}`}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            marginTop: 'auto', padding: '0.5rem', borderRadius: '8px',
            border: `1px solid ${color}55`, background: `${color}18`,
            color, fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none'
          }}
        >
          <Download size={14} /> Descargar Excel
        </a>
      </div>
    );
  };

  const renderTablaDetalle = () => {
    if (!detalleId) return null;
    const filas = detalleData[detalleId];
    const infoTile = detalleId === 'consolidado'
      ? { nombre: 'Consolidado General', color: '#a78bfa' }
      : SERVICIOS.find(s => s.id === detalleId) || {};

    return (
      <div style={{ marginTop: '1.25rem', border: `1px solid ${infoTile.color || '#334155'}`, borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{
          padding: '0.6rem 0.9rem', backgroundColor: `${infoTile.color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: infoTile.color || '#fff' }}>
            Detalle — {infoTile.nombre}
          </span>
          <button onClick={() => setDetalleId(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        {filas === 'loading' || filas === undefined ? (
          <div style={{ padding: '1.2rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>Cargando detalle…</div>
        ) : filas === 'error' ? (
          <div style={{ padding: '1.2rem', textAlign: 'center', color: '#f87171', fontSize: '0.85rem' }}>No se pudo cargar el detalle.</div>
        ) : filas.length === 0 ? (
          <div style={{ padding: '1.2rem', textAlign: 'center', color: '#4ade80', fontSize: '0.85rem' }}>Sin medidores en mal estado 🎉</div>
        ) : (
          <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr style={{ backgroundColor: '#0f172a' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.7rem', color: '#cbd5e1', fontWeight: 700, width: '13%' }}>Sede</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.7rem', color: '#cbd5e1', fontWeight: 700, width: '15%' }}>{detalleId === 'consolidado' ? 'Servicios Afectados' : 'Medidor'}</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.7rem', color: '#cbd5e1', fontWeight: 700, width: '12%' }}>Última fecha</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.7rem', color: '#cbd5e1', fontWeight: 700, width: '30%' }}>Plan de Acción</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.7rem', color: '#cbd5e1', fontWeight: 700, width: '30%' }}>Solicitudes Fracttal</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #334155', backgroundColor: i % 2 === 0 ? '#1e293b' : '#182234' }}>
                    <td style={{ padding: '0.5rem 0.7rem', color: '#fff', fontWeight: 600 }}>{f.sede}</td>
                    <td style={{ padding: '0.5rem 0.7rem', color: '#cbd5e1' }}>{f.medidor_nombre}</td>
                    <td style={{ padding: '0.5rem 0.7rem', color: '#94a3b8' }}>{f.ultima_fecha_con_datos || 'nunca reportó'}</td>
                    <td style={{ padding: '0.5rem 0.7rem', color: '#94a3b8', lineHeight: 1.4 }}>{f.plan_accion}</td>
                    <td style={{ padding: '0.5rem 0.7rem' }}>{renderSolicitudesFracttal(f.sede, f.solicitudes_fracttal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderSolicitudesFracttal = (sede, solicitudes) => {
    const formatearFecha = (iso) => {
      if (!iso) return '';
      try {
        return new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      } catch { return iso; }
    };
    const enCurso = reintentando === sede;
    const botonReintentar = (
      <button
        onClick={() => reintentarSolicitud(sede)}
        disabled={enCurso}
        title="Volver a intentar la creación en Fracttal ahora mismo"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
          background: 'none', border: '1px solid #475569', borderRadius: '6px',
          padding: '0.2rem 0.5rem', color: enCurso ? '#64748b' : '#93c5fd',
          fontSize: '0.7rem', fontWeight: 600, cursor: enCurso ? 'default' : 'pointer',
          marginTop: '0.15rem', alignSelf: 'flex-start'
        }}
      >
        <RotateCw size={11} style={enCurso ? { animation: 'spin 1s linear infinite' } : undefined} />
        {enCurso ? 'Reintentando…' : 'Reintentar ahora'}
      </button>
    );

    if (!solicitudes || solicitudes.length === 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span style={{ color: '#475569', fontSize: '0.75rem' }}>— Sin intentos aún</span>
          {botonReintentar}
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {solicitudes.map((s, idx) => (
          s.exito ? (
            <div key={idx} style={{ fontSize: '0.75rem', color: '#4ade80' }}>
              ✅ Solicitud #{s.folio} creada
              {s.servicios && s.servicios.length > 0 && <span style={{ color: '#86efac' }}> ({s.servicios.join('-')})</span>}
              <div style={{ color: '#64748b', fontSize: '0.7rem' }}>{formatearFecha(s.creado_el)}</div>
            </div>
          ) : (
            <div key={idx} style={{ fontSize: '0.75rem', color: '#fca5a5' }}>
              ⚠️ Falló la creación
              {s.servicios && s.servicios.length > 0 && <span style={{ color: '#fca5a5' }}> ({s.servicios.join('-')})</span>}
              <div style={{ color: '#f87171', lineHeight: 1.35 }}>Causa: {s.causa || 'desconocida'}</div>
              {s.solucion && <div style={{ color: '#fbbf24', lineHeight: 1.35 }}>→ {s.solucion}</div>}
              <div style={{ color: '#64748b', fontSize: '0.7rem' }}>{formatearFecha(s.creado_el)}</div>
            </div>
          )
        ))}
        {botonReintentar}
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(3, 4, 6, 0.85)', backdropFilter: 'blur(6px)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
    }}>
      <div style={{ width: '100%', maxWidth: '1000px', maxHeight: '88vh', overflowY: 'auto', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers size={20} color="#a78bfa" /> Medidores en Mal Estado
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>
        <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 0, marginBottom: '1.25rem' }}>
          Estado y plan de acción por especialidad, más el consolidado de todas juntas agrupado por sede.
          Clic en el número para ver el detalle sede por sede; el ícono descarga el Excel completo.
          La última columna muestra las Solicitudes de Servicio creadas automáticamente en Fracttal por sede,
          y si alguna falló, la causa y la solución sugerida.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem' }}>
          {SERVICIOS.map(s => renderTile(s))}
          {renderTile({ id: 'consolidado', nombre: 'Consolidado General', icon: Layers, color: '#a78bfa', esConsolidado: true })}
        </div>

        {renderTablaDetalle()}
      </div>
    </div>
  );
};

export default PmeMedidoresModal;
