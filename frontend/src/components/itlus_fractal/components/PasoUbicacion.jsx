import React, { useRef } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import ListaDesplegable from './ListaDesplegable';

const inputStyle = {
  width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px',
  padding: '0.35rem 0.5rem', color: '#fff', fontSize: '0.75rem',
};

// Columna "SEDE CECO": paso 1 del selector — buscar y elegir la
// Localización. El paso 2 (Equipo) vive en su propia celda/columna
// ("Activo maestro", ver PasoEquipoMaestro.jsx), ambos comparten el mismo
// estado (picker) porque lo arma un único useActivoPicker() en FilaManual.
const PasoUbicacion = ({ picker }) => {
  const { pasoUbicacion, buscarUbicacion, elegirUbicacion } = picker;
  const anchorRef = useRef(null);
  return (
    <div ref={anchorRef} style={{ position: 'relative', minWidth: '210px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        <MapPin size={12} color="#64748b" />
        <input
          value={pasoUbicacion.texto}
          onChange={(e) => buscarUbicacion(e.target.value)}
          placeholder="Buscar localización…"
          style={{ ...inputStyle, borderColor: pasoUbicacion.elegida ? '#4ade8055' : '#334155' }}
        />
        {pasoUbicacion.buscando && <Loader2 size={12} className="spin-anim" color="#64748b" />}
      </div>
      {pasoUbicacion.mostrarLista && !pasoUbicacion.buscando && (
        <ListaDesplegable
          anchorRef={anchorRef}
          items={pasoUbicacion.candidatos}
          onPick={elegirUbicacion}
          vacio="Sin resultados."
          render={(u) => <>{u.description} <span style={{ color: '#64748b' }}>({u.code})</span></>}
        />
      )}
    </div>
  );
};

export default PasoUbicacion;
