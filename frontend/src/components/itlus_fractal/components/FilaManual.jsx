import React from 'react';
import { Trash2, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useActivoPicker } from '../hooks/useActivoPicker';
import PasoUbicacion from './PasoUbicacion';
import PasoEquipoMaestro from './PasoEquipoMaestro';

const inputStyle = {
  width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px',
  padding: '0.35rem 0.5rem', color: '#fff', fontSize: '0.75rem',
};

// Una fila de la tabla manual. Cada fila arma su PROPIA instancia de
// useActivoPicker() (una sola vez acá) y se la pasa a las 2 celdas del
// selector de activo (Localización / Equipo) para que compartan estado sin
// necesitar levantarlo hasta TablaManual — el resto de filas no lo tocan.
const FilaManual = ({ fila, actualizarFila, quitarFila, generar }) => {
  const picker = useActivoPicker(fila.sedeCecoInicial || '');
  const listo = fila.descripcion.trim() && fila.activoElegido;
  const creando = fila.estado === 'creando';

  return (
    <tr style={{ borderTop: '1px solid #334155' }}>
      <td style={{ padding: '0.5rem 0.6rem', minWidth: '180px' }}>
        <input style={inputStyle} value={fila.descripcion} placeholder="Descripción de la solicitud"
          onChange={(e) => actualizarFila(fila.key, { descripcion: e.target.value })} />
      </td>
      <td style={{ padding: '0.5rem 0.6rem' }}>
        <PasoUbicacion picker={picker} />
      </td>
      <td style={{ padding: '0.5rem 0.6rem' }}>
        <PasoEquipoMaestro picker={picker} onChange={(activo) => actualizarFila(fila.key, { activoElegido: activo })} />
      </td>
      <td style={{ padding: '0.5rem 0.6rem' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            type="datetime-local"
            style={inputStyle}
            value={fila.fechaIncidente}
            onChange={(e) => actualizarFila(fila.key, { fechaIncidente: e.target.value })}
          />
          {fila.fechaIncidente && (
            <button
              type="button"
              onClick={() => actualizarFila(fila.key, { fechaIncidente: '' })}
              title="Borrar para usar fecha y hora de creación automática (sistema)"
              style={{
                position: 'absolute',
                right: '6px',
                background: 'rgba(30, 41, 59, 0.85)',
                border: '1px solid #475569',
                color: '#cbd5e1',
                cursor: 'pointer',
                fontSize: '0.65rem',
                padding: '1px 5px',
                borderRadius: '4px',
              }}
            >
              ✕
            </button>
          )}
        </div>
        {!fila.fechaIncidente ? (
          <div style={{ fontSize: '0.65rem', color: '#38bdf8', marginTop: '3px', whiteSpace: 'nowrap' }}>
            ⚡ Por defecto: ahora (sistema)
          </div>
        ) : (
          <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '3px', whiteSpace: 'nowrap' }}>
            Manual personalizada
          </div>
        )}
      </td>
      <td style={{ padding: '0.5rem 0.6rem', minWidth: '130px' }}>
        <input style={inputStyle} value={fila.solicitadoPor} placeholder="Nombre"
          onChange={(e) => actualizarFila(fila.key, { solicitadoPor: e.target.value })} />
      </td>
      <td style={{ padding: '0.5rem 0.6rem', minWidth: '150px' }}>
        <input style={inputStyle} value={fila.email} placeholder="correo@spsa.pe"
          onChange={(e) => actualizarFila(fila.key, { email: e.target.value })} />
      </td>
      <td style={{ padding: '0.5rem 0.6rem', minWidth: '130px' }}>
        <input style={inputStyle} value={fila.referencia} placeholder="Opcional"
          onChange={(e) => actualizarFila(fila.key, { referencia: e.target.value })} />
      </td>
      <td style={{ padding: '0.5rem 0.6rem', minWidth: '160px' }}>
        {fila.estado && fila.estado !== 'creando' && (
          fila.estado.exito ? (
            <span style={{ color: '#4ade80', fontWeight: 700, fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <CheckCircle2 size={12} /> Folio #{fila.estado.folio}
            </span>
          ) : (
            <span style={{ color: '#f87171', fontSize: '0.7rem', display: 'flex', alignItems: 'flex-start', gap: '0.25rem' }} title={fila.estado.solucion}>
              <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: '0.1rem' }} /> {fila.estado.causa}
            </span>
          )
        )}
      </td>
      <td style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            onClick={() => generar(fila)}
            disabled={!listo || creando}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              background: listo && !creando ? 'rgba(74,222,128,0.12)' : 'transparent',
              border: `1px solid ${listo && !creando ? '#4ade8055' : '#334155'}`, borderRadius: '6px',
              padding: '0.3rem 0.55rem', color: listo && !creando ? '#4ade80' : '#475569',
              fontSize: '0.7rem', fontWeight: 700, cursor: listo && !creando ? 'pointer' : 'default',
            }}
          >
            {creando ? <Loader2 size={11} className="spin-anim" /> : <CheckCircle2 size={11} />}
            {creando ? 'Creando…' : 'Generar'}
          </button>
          <button onClick={() => quitarFila(fila.key)} title="Quitar fila"
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
};

export default FilaManual;
