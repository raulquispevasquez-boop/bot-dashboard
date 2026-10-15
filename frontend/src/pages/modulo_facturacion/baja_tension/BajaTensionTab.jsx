import React, { useState } from 'react';
import BajaTensionBoton1 from './views/BajaTensionBoton1';
import BajaTensionBoton2 from './views/BajaTensionBoton2';
import BajaTensionBoton3 from './views/BajaTensionBoton3';
import BajaTensionBoton4 from './views/BajaTensionBoton4';

const BajaTensionTab = () => {
  const [botonActivo, setBotonActivo] = useState(1);

  const botones = [1, 2, 3, 4];

  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', minHeight: '520px' }}>
      {/* Columna vertical izquierda con 4 botones pequeños */}
      <div
        style={{
          width: '54px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          background: '#0f172a',
          padding: '0.5rem 0.35rem',
          borderRadius: '8px',
          border: '1px solid #1e293b',
          flexShrink: 0,
        }}
      >
        {botones.map((num) => {
          const activo = botonActivo === num;
          return (
            <button
              key={num}
              type="button"
              onClick={() => setBotonActivo(num)}
              title={`Botón ${num} - Facturación en Baja Tensión`}
              style={{
                width: '100%',
                height: '42px',
                borderRadius: '6px',
                border: activo ? '1px solid #38bdf8' : '1px solid #334155',
                background: activo ? 'rgba(56, 189, 248, 0.18)' : '#1e293b',
                color: activo ? '#38bdf8' : '#94a3b8',
                fontWeight: activo ? 700 : 500,
                fontSize: '0.9rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease-in-out',
                boxShadow: activo ? '0 0 10px rgba(56, 189, 248, 0.2)' : 'none',
              }}
            >
              {num}
            </button>
          );
        })}
      </div>

      {/* Ventana de desarrollo del botón activo */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {botonActivo === 1 && <BajaTensionBoton1 />}
        {botonActivo === 2 && <BajaTensionBoton2 />}
        {botonActivo === 3 && <BajaTensionBoton3 />}
        {botonActivo === 4 && <BajaTensionBoton4 />}
      </div>
    </div>
  );
};

export default BajaTensionTab;
