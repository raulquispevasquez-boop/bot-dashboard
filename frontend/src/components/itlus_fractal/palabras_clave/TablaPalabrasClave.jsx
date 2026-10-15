import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { usePalabrasClave } from './hooks/usePalabrasClave';

const inputStyle = {
  width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px',
  padding: '0.4rem 0.6rem', color: '#fff', fontSize: '0.78rem',
};
const CELDA_BASE = { padding: '0.55rem 0.7rem', borderBottom: '1px solid #334155' };

// Botón "Palabras Clave" de Itlus 2 — a diferencia de las otras 5 tablas
// (copias de solo lectura de otro Supabase), esta es chica y se edita acá
// mismo: cada celda se guarda sola con un pequeño debounce al escribir.
const TablaPalabrasClave = () => {
  const { filas, cargando, agregarFila, editarCampo, quitarFila } = usePalabrasClave();

  return (
    <div className="bot-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%', minHeight: 0 }}>
      <div style={{ flexShrink: 0 }}>
        <h3 style={{ margin: 0 }}>Palabras Clave</h3>
        <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>{filas.length} filas · se edita directo acá</p>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid #334155', borderRadius: '10px' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.78rem' }}>
          <thead>
            <tr>
              <th style={{ ...CELDA_BASE, textAlign: 'right', color: '#64748b', fontWeight: 700, position: 'sticky', top: 0, background: '#0f172a', zIndex: 2, width: '3rem' }}>#</th>
              <th style={{ ...CELDA_BASE, textAlign: 'left', color: '#cbd5e1', fontWeight: 700, position: 'sticky', top: 0, background: '#0f172a', zIndex: 2 }}>Palabra Clave</th>
              <th style={{ ...CELDA_BASE, textAlign: 'left', color: '#cbd5e1', fontWeight: 700, position: 'sticky', top: 0, background: '#0f172a', zIndex: 2 }}>Responsable</th>
              <th style={{ ...CELDA_BASE, position: 'sticky', top: 0, background: '#0f172a', zIndex: 2, width: '2.5rem' }} />
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, i) => (
              <tr key={fila.id}>
                <td style={{ ...CELDA_BASE, textAlign: 'right', color: '#64748b' }}>{i + 1}</td>
                <td style={CELDA_BASE}>
                  <input style={inputStyle} value={fila.palabra_clave || ''} placeholder="Palabra clave"
                    onChange={(e) => editarCampo(fila.id, 'palabra_clave', e.target.value)} />
                </td>
                <td style={CELDA_BASE}>
                  <input style={inputStyle} value={fila.responsable || ''} placeholder="Responsable"
                    onChange={(e) => editarCampo(fila.id, 'responsable', e.target.value)} />
                </td>
                <td style={{ ...CELDA_BASE, textAlign: 'center' }}>
                  <button onClick={() => quitarFila(fila.id)} title="Quitar fila"
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {!cargando && filas.length === 0 && (
              <tr><td colSpan={4} style={{ ...CELDA_BASE, textAlign: 'center', color: '#64748b' }}>Sin filas todavía.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        onClick={agregarFila}
        style={{
          alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
          background: 'none', border: '1px dashed #475569', borderRadius: '6px', padding: '0.4rem 0.7rem',
          color: '#93c5fd', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0,
        }}
      >
        <Plus size={13} /> Agregar fila
      </button>
    </div>
  );
};

export default TablaPalabrasClave;
