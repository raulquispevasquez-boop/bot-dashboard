import React from 'react';
import { Plus, Wrench, SlidersHorizontal, CheckCircle2 } from 'lucide-react';
import FilaManual from './FilaManual';

const backendBaseUrl = window.location.origin.replace('5173', '3001');

// El estado de las filas vive en el padre (CrearSolicitudesFracttal) porque
// CargaMasiva también necesita poder agregar una fila (botón "Corregir
// arriba") — es estado compartido entre hermanos, no privado de esta tabla.
const TablaManual = ({ filas, actualizarFila, agregarFila, quitarFila, onAbrirConfig, defaults }) => {
  const tieneDefaults = Boolean(defaults?.solicitadoPor || defaults?.email || defaults?.referencia);

  const generar = (fila) => {
    if (!fila.descripcion.trim() || !fila.activoElegido) return;
    actualizarFila(fila.key, { estado: 'creando' });
    fetch(`${backendBaseUrl}/api/itlus-fractal/crear-solicitud`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        descripcion: fila.descripcion,
        id_item: fila.activoElegido.id_item,
        activo_descripcion: fila.activoElegido.description,
        fecha_incidente: fila.fechaIncidente ? new Date(fila.fechaIncidente).toISOString() : null,
        solicitado_por: fila.solicitadoPor,
        email: fila.email,
        referencia: fila.referencia,
        activo_maestro: fila.activoElegido?.description || '',
      }),
    })
      .then((r) => r.json())
      .then((d) => actualizarFila(fila.key, { estado: d.success ? d.data : { exito: false, causa: d.error || 'Error desconocido.' } }))
      .catch(() => actualizarFila(fila.key, { estado: { exito: false, causa: 'No se pudo conectar con el servidor.' } }));
  };

  return (
    <div id="itlus-tabla-manual" className="bot-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.8rem' }}>
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
            <Wrench size={16} color="#38bdf8" /> Crear solicitud (manual)
          </h3>
          <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem', marginBottom: 0 }}>
            El CECO se resuelve solo al elegir el Activo — primero busca la Localización, luego el Activo maestro (Equipo puntual) dentro de ella.
          </p>
        </div>

        <button
          type="button"
          onClick={onAbrirConfig}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            background: tieneDefaults ? 'rgba(56, 189, 248, 0.12)' : '#1e293b',
            border: `1px solid ${tieneDefaults ? '#38bdf888' : '#334155'}`,
            borderRadius: '7px',
            padding: '0.45rem 0.8rem',
            color: tieneDefaults ? '#38bdf8' : '#94a3b8',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          title="Configurar Solicitado por, Correo y Referencia para que se apliquen en todas las solicitudes"
        >
          <SlidersHorizontal size={14} />
          <span>Configurar plantilla fija (Solicitante / Correo / Ref)</span>
          {tieneDefaults && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.2rem',
                background: 'rgba(34, 197, 94, 0.2)',
                color: '#4ade80',
                fontSize: '0.68rem',
                padding: '0.1rem 0.35rem',
                borderRadius: '4px',
                marginLeft: '0.2rem',
              }}
            >
              <CheckCircle2 size={11} /> Activa
            </span>
          )}
        </button>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #334155', borderRadius: '10px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#0f172a' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.6rem', color: '#cbd5e1', fontWeight: 700, whiteSpace: 'nowrap' }}>Descripción</th>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.6rem', color: '#cbd5e1', fontWeight: 700, whiteSpace: 'nowrap' }}>SEDE CECO</th>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.6rem', color: '#cbd5e1', fontWeight: 700, whiteSpace: 'nowrap' }}>Activo maestro</th>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.6rem', color: '#cbd5e1', fontWeight: 700, whiteSpace: 'nowrap' }}>
                <div>Fecha del Incidente</div>
                <div style={{ fontSize: '0.65rem', color: '#38bdf8', fontWeight: 400 }}>
                  (vacío = ahora automático)
                </div>
              </th>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.6rem', color: '#cbd5e1', fontWeight: 700, whiteSpace: 'nowrap' }}>Solicitado por</th>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.6rem', color: '#cbd5e1', fontWeight: 700, whiteSpace: 'nowrap' }}>Correo</th>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.6rem', color: '#cbd5e1', fontWeight: 700, whiteSpace: 'nowrap' }}>Referencia</th>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.6rem', color: '#cbd5e1', fontWeight: 700, whiteSpace: 'nowrap' }}>Resultado</th>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.6rem', color: '#cbd5e1', fontWeight: 700, whiteSpace: 'nowrap' }}></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <FilaManual key={fila.key} fila={fila} actualizarFila={actualizarFila} quitarFila={quitarFila} generar={generar} />
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={() => agregarFila()}
        style={{
          marginTop: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
          background: 'none', border: '1px dashed #475569', borderRadius: '6px', padding: '0.4rem 0.7rem',
          color: '#93c5fd', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
        }}
      >
        <Plus size={13} /> Agregar fila
      </button>
    </div>
  );
};

export default TablaManual;
