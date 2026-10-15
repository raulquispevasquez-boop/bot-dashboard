import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Zap, Sliders, Calculator, Activity, PieChart } from 'lucide-react';
import ClienteLibreBoton1 from './views/ClienteLibreBoton1';
import ClienteLibreBoton2 from './views/ClienteLibreBoton2';
import ClienteLibreBoton3 from './views/ClienteLibreBoton3';
import ClienteLibreBoton4 from './views/ClienteLibreBoton4';
import ClienteLibreBoton5 from './views/ClienteLibreBoton5';
import ClienteLibreBoton6 from './views/ClienteLibreBoton6';

const ClienteLibreTab = () => {
  const [botonActivo, setBotonActivo] = useState(1);

  // Escuchar eventos de cambio de pestaña/botón desde submódulos
  useEffect(() => {
    const handleCambiarBoton = (e) => {
      if (e.detail?.botonId && typeof e.detail.botonId === 'number') {
        setBotonActivo(e.detail.botonId);
      }
    };
    window.addEventListener('cambiar_boton_cliente_libre', handleCambiarBoton);
    return () => window.removeEventListener('cambiar_boton_cliente_libre', handleCambiarBoton);
  }, []);

  const botones = [
    { id: 1, label: 'Registros de Energía', icon: <FileSpreadsheet size={15} style={{ flexShrink: 0 }} /> },
    { id: 2, label: 'Registros de Potencias', icon: <Zap size={15} style={{ flexShrink: 0 }} /> },
    { id: 3, label: 'Configuración de Variables', icon: <Sliders size={15} style={{ flexShrink: 0 }} /> },
    { id: 4, label: 'Cálculos Factura C.L', icon: <Calculator size={15} style={{ flexShrink: 0 }} /> },
    { id: 5, label: 'Auditoría y Tratamiento', icon: <Activity size={15} style={{ flexShrink: 0 }} /> },
    { id: 6, label: 'Indicadores y Gráficos', icon: <PieChart size={15} style={{ flexShrink: 0 }} /> },
  ];

  return (
    <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'stretch', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* Columna vertical izquierda con botones descriptivos */}
      <div
        style={{
          width: '185px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          background: '#0f172a',
          padding: '0.6rem 0.5rem',
          borderRadius: '8px',
          border: '1px solid #1e293b',
          flexShrink: 0,
        }}
      >
        {botones.map((b) => {
          const activo = botonActivo === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setBotonActivo(b.id)}
              title={b.label}
              style={{
                width: '100%',
                minHeight: '42px',
                padding: '0.45rem 0.65rem',
                borderRadius: '6px',
                border: activo ? '1px solid #38bdf8' : '1px solid #334155',
                background: activo ? 'rgba(56, 189, 248, 0.18)' : '#1e293b',
                color: activo ? '#38bdf8' : '#94a3b8',
                fontWeight: activo ? 700 : 500,
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                textAlign: 'left',
                transition: 'all 0.15s ease-in-out',
                boxShadow: activo ? '0 0 10px rgba(56, 189, 248, 0.2)' : 'none',
              }}
            >
              {b.icon || <span style={{ width: '15px', textAlign: 'center', fontWeight: 700 }}>{b.id}</span>}
              <span style={{ lineHeight: 1.2 }}>{b.label}</span>
            </button>
          );
        })}
      </div>

      {/* Ventana de contenido del botón activo */}
      <div style={{ flex: 1, minWidth: 0, height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {botonActivo === 1 && <ClienteLibreBoton1 />}
        {botonActivo === 2 && <ClienteLibreBoton2 />}
        {botonActivo === 3 && <ClienteLibreBoton3 />}
        {botonActivo === 4 && <ClienteLibreBoton4 />}
        {botonActivo === 5 && <ClienteLibreBoton5 />}
        {botonActivo === 6 && <ClienteLibreBoton6 />}
      </div>
    </div>
  );
};

export default ClienteLibreTab;
