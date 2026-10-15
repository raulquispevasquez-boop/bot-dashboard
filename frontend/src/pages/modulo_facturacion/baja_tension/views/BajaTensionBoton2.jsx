import React from 'react';
import { Hammer } from 'lucide-react';

const BajaTensionBoton2 = () => {
  return (
    <div className="bot-panel" style={{ padding: '1.5rem', height: '100%', minHeight: '400px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
        <div style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8' }}>
          <Hammer size={20} />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc' }}>
            Facturación en Baja Tensión - Botón 2
          </h2>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
            Ventana en desarrollo
          </p>
        </div>
      </div>

      <div style={{
        border: '1px dashed #334155',
        borderRadius: '8px',
        padding: '2rem',
        textAlign: 'center',
        background: '#090d16',
        marginTop: '1rem',
      }}>
        <p style={{ fontSize: '0.9rem', color: '#cbd5e1', margin: 0 }}>
          🚧 Esta sección corresponde al <strong>Botón 2</strong> de Facturación en Baja Tensión.
        </p>
        <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginTop: '0.5rem' }}>
          Archivo independiente: BajaTensionBoton2.jsx
        </span>
      </div>
    </div>
  );
};

export default BajaTensionBoton2;
