import React from 'react';

// Interruptor on/off reutilizable — usado por sede individual, por grupo
// (cabecera de marca) y por el maestro del árbol completo. "parcial"
// pinta un estado intermedio (algunas prendidas, no todas).
const InterruptorMini = ({ activo, parcial, onClick, titulo }) => (
  <button
    onClick={onClick}
    title={titulo}
    style={{
      width: '30px', height: '16px', borderRadius: '999px', border: 'none', cursor: 'pointer', flexShrink: 0,
      background: activo ? '#22c55e' : parcial ? '#4b5563' : '#334155', position: 'relative', transition: 'background 0.15s',
    }}
  >
    <span style={{
      position: 'absolute', top: '2px', left: activo ? '16px' : parcial ? '9px' : '2px', width: '12px', height: '12px',
      borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
    }} />
  </button>
);

export default InterruptorMini;
