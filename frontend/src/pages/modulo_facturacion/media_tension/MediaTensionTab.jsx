import React, { useState } from 'react';
import MediaTensionBoton1 from './views/MediaTensionBoton1';
import MediaTensionBoton2 from './views/MediaTensionBoton2';
import MediaTensionBoton3 from './views/MediaTensionBoton3';
import MediaTensionBoton4 from './views/MediaTensionBoton4';

const MediaTensionTab = () => {
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
              title={`Botón ${num} - Facturación Media Tensión`}
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
        {botonActivo === 1 && <MediaTensionBoton1 />}
        {botonActivo === 2 && <MediaTensionBoton2 />}
        {botonActivo === 3 && <MediaTensionBoton3 />}
        {botonActivo === 4 && <MediaTensionBoton4 />}
      </div>
    </div>
  );
};

export default MediaTensionTab;
