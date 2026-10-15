import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Lista flotante compartida por los 2 pasos del selector de activo
// (Localización y Equipo) — ver PasoUbicacion.jsx / PasoEquipoMaestro.jsx.
// Se renderiza en un portal directo a <body> (posición fija calculada por
// getBoundingClientRect del input ancla) porque la tabla que la contiene
// tiene overflowX:auto — eso, por una regla del propio CSS, convierte el
// overflowY en "auto" también aunque nunca se pida, y eso recortaba la
// lista (con 100+ resultados) a un cuadrito minúsculo y de paso obligaba a
// la tabla a scrollear internamente, tapando sus propios encabezados.
const ListaDesplegable = ({ anchorRef, items, onPick, render, vacio }) => {
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const actualizarPosicion = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) });
    };
    actualizarPosicion();
    window.addEventListener('scroll', actualizarPosicion, true);
    window.addEventListener('resize', actualizarPosicion);
    return () => {
      window.removeEventListener('scroll', actualizarPosicion, true);
      window.removeEventListener('resize', actualizarPosicion);
    };
  }, [anchorRef]);

  if (!pos) return null;

  return createPortal(
    <div style={{
      position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 1000,
      background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', maxHeight: '340px',
      overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    }}>
      {items.length === 0 ? (
        <div style={{ padding: '0.5rem 0.6rem', color: '#64748b', fontSize: '0.72rem' }}>{vacio}</div>
      ) : items.map((item) => (
        <button
          key={item.id_item}
          onClick={() => onPick(item)}
          style={{
            display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
            borderBottom: '1px solid #334155', padding: '0.4rem 0.6rem', color: '#cbd5e1',
            fontSize: '0.72rem', cursor: 'pointer',
          }}
        >
          {render(item)}
        </button>
      ))}
    </div>,
    document.body
  );
};

export default ListaDesplegable;
