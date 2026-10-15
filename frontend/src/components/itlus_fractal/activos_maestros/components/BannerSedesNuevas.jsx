import React from 'react';
import { PlusCircle, Loader2 } from 'lucide-react';

// Banner que aparece cuando "Revisar actualizaciones" detecta sedes que
// existen en Fracttal pero todavía no están en la copia local — cada una
// se agrega individualmente, sin tocar las demás.
const BannerSedesNuevas = ({ sedesNuevas, cargandoIds, onAgregar }) => {
  if (sedesNuevas.length === 0) return null;
  return (
    <div style={{
      background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.35)',
      borderRadius: '6px', padding: '0.5rem 0.7rem', fontSize: '0.75rem', color: '#86efac',
      display: 'flex', flexDirection: 'column', gap: '0.35rem',
    }}>
      <span>{sedesNuevas.length} sede{sedesNuevas.length > 1 ? 's' : ''} nueva{sedesNuevas.length > 1 ? 's' : ''} detectada{sedesNuevas.length > 1 ? 's' : ''} en Fracttal:</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {sedesNuevas.map((s) => (
          <button
            key={s.id_location}
            onClick={() => onAgregar(s.id_location)}
            disabled={cargandoIds.includes(s.id_location)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              background: 'none', border: '1px solid rgba(34,197,94,0.4)', borderRadius: '6px',
              padding: '0.25rem 0.5rem', color: '#86efac', fontSize: '0.7rem', cursor: 'pointer',
            }}
          >
            {cargandoIds.includes(s.id_location) ? <Loader2 size={11} className="spin-anim" /> : <PlusCircle size={11} />}
            {s.description}
          </button>
        ))}
      </div>
    </div>
  );
};

export default BannerSedesNuevas;
