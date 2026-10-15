import React, { useState, Suspense, lazy } from 'react';

// Carga diferida: el código de Itlus 1 (tabla + Excel + selector de activo)
// solo se descarga cuando alguien realmente entra a esta pestaña, no en el
// paquete principal de la app.
const CrearSolicitudesFracttal = lazy(() => import('../components/itlus_fractal/CrearSolicitudesFracttal'));
const VisorTablasSistema = lazy(() => import('../components/itlus_fractal/sistema_mantenimiento/VisorTablasSistema'));

// Nombres de pestaña provisionales, a definir.
const TABS = [
  { id: 'itlus_1', label: 'Itlus 1' },
  { id: 'itlus_2', label: 'Itlus 2' },
  { id: 'itlus_3', label: 'Itlus 3' },
];

const EnDesarrollo = ({ label }) => (
  <div className="bot-panel">
    <div
      style={{
        minHeight: '300px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        color: 'var(--text-secondary)',
        border: '1px dashed var(--panel-border)',
        borderRadius: '8px',
      }}
    >
      <h3 style={{ margin: 0 }}>{label}</h3>
      <p style={{ margin: 0 }}>Ventana en desarrollo.</p>
    </div>
  </div>
);

const ItlusFractal = () => {
  const [activeInnerTab, setActiveInnerTab] = useState('itlus_1');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 4rem)', overflow: 'hidden' }}>
      <div style={{
        flexShrink: 0,
        backgroundColor: '#0f1115',
        paddingBottom: '1rem',
        borderBottom: '1px solid var(--panel-border)',
        marginBottom: '1rem'
      }}>
        <header style={{ marginBottom: '1.25rem' }}>
          <h1>Itlus Fractal</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Nombres de pestaña provisionales — se renombran después.</p>
        </header>

        <div className="inner-tabs" style={{ marginBottom: 0 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`inner-tab ${activeInnerTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveInnerTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tab-content" style={{ flex: 1, overflowY: 'auto', paddingRight: '0.25rem' }}>
        {activeInnerTab === 'itlus_1' && (
          <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Cargando…</div>}>
            <CrearSolicitudesFracttal />
          </Suspense>
        )}
        {activeInnerTab === 'itlus_2' && (
          <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Cargando…</div>}>
            <VisorTablasSistema />
          </Suspense>
        )}
        {TABS.filter(tab => tab.id !== 'itlus_1' && tab.id !== 'itlus_2').map(tab => activeInnerTab === tab.id && (
          <EnDesarrollo key={tab.id} label={tab.label} />
        ))}
      </div>
    </div>
  );
};

export default ItlusFractal;
