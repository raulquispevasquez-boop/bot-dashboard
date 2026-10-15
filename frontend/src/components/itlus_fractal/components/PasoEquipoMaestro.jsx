import React, { useRef } from 'react';
import { Loader2, Package, RotateCcw } from 'lucide-react';
import ListaDesplegable from './ListaDesplegable';

const inputStyle = {
  width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px',
  padding: '0.35rem 0.5rem', color: '#fff', fontSize: '0.75rem',
};

// Columna "Activo maestro": paso 2 del selector — elegir el Equipo puntual
// dentro de la Localización ya elegida en PasoUbicacion.jsx (misma
// instancia de picker, compartida vía FilaManual.jsx). Una vez elegido el
// equipo, esta celda colapsa a la confirmación compacta.
const PasoEquipoMaestro = ({ picker, onChange }) => {
  const { pasoUbicacion, pasoEquipo, equiposFiltrados, filtrarEquipo, elegirEquipo, activoFinal, reiniciar } = picker;
  const anchorRef = useRef(null);

  const handleElegirEquipo = (equipo) => {
    elegirEquipo(equipo);
    onChange?.(equipo);
  };

  const handleReiniciar = () => {
    reiniciar();
    onChange?.(null);
  };

  if (activoFinal) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: '180px' }}>
        <span style={{ fontSize: '0.72rem', color: '#4ade80' }}>
          ✓ {activoFinal.description} <span style={{ color: '#64748b' }}>({activoFinal.code})</span>
        </span>
        <button onClick={handleReiniciar} title="Elegir otro activo" style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', flexShrink: 0 }}>
          <RotateCcw size={12} />
        </button>
      </div>
    );
  }

  if (!pasoUbicacion.elegida) {
    return <span style={{ fontSize: '0.7rem', color: '#475569' }}>Elige primero la localización</span>;
  }

  return (
    <div ref={anchorRef} style={{ position: 'relative', minWidth: '180px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        <Package size={12} color="#64748b" />
        <input
          value={pasoEquipo.filtroTexto}
          onChange={(e) => filtrarEquipo(e.target.value)}
          placeholder={pasoEquipo.cargando ? 'Cargando equipos…' : `Filtrar entre ${pasoEquipo.todos.length} equipos…`}
          disabled={pasoEquipo.cargando}
          style={inputStyle}
        />
        {pasoEquipo.cargando && <Loader2 size={12} className="spin-anim" color="#64748b" />}
      </div>
      {!pasoEquipo.cargando && (
        <ListaDesplegable
          anchorRef={anchorRef}
          items={equiposFiltrados.slice(0, 50)}
          onPick={handleElegirEquipo}
          vacio="Sin equipos que coincidan."
          render={(eq) => <>{eq.description} <span style={{ color: '#64748b' }}>({eq.code})</span></>}
        />
      )}
    </div>
  );
};

export default PasoEquipoMaestro;
