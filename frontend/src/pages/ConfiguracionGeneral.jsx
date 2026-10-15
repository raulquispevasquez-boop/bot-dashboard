import React, { useState } from 'react';
import { Settings, Construction } from 'lucide-react';
import EstadoActivaciones from '../components/configuracion_general/EstadoActivaciones';
import ControlTunelCloudflare from '../components/configuracion_general/ControlTunelCloudflare';

// Seccion aislada del codigo de los bots. Cada ventana se desarrolla por
// separado; por ahora solo existe el andamiaje (4 pestañas + placeholders).
const TABS = [
  { id: 'estado_activaciones', label: 'Estado de Activaciones' },
  { id: 'modulo_2', label: 'Módulo 2: Túnel en la Nube' },
  { id: 'modulo_3', label: 'Módulo 3' },
  { id: 'modulo_4', label: 'Módulo 4' },
];

const PlaceholderEnDesarrollo = ({ titulo }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '4rem 2rem', color: 'var(--text-secondary)', textAlign: 'center', gap: '0.75rem',
    border: '1px dashed var(--panel-border)', borderRadius: '8px'
  }}>
    <Construction size={40} style={{ opacity: 0.5 }} />
    <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>{titulo}</h3>
    <p style={{ margin: 0, maxWidth: '420px', fontSize: '0.9rem' }}>
      Esta ventana está en desarrollo. Se definirá su contenido más adelante.
    </p>
  </div>
);

const ConfiguracionGeneral = () => {
  const [activeInnerTab, setActiveInnerTab] = useState('estado_activaciones');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 4rem)', overflow: 'hidden' }}>
      <div style={{
        flexShrink: 0,
        backgroundColor: 'var(--bg-color)',
        paddingBottom: '1rem',
        borderBottom: '1px solid var(--panel-border)',
        marginBottom: '1rem'
      }}>
        <header style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Settings size={24} style={{ color: '#2b9eff' }} />
          <div>
            <h1 style={{ margin: 0 }}>Configuración General</h1>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
              Ajustes y paneles generales, independientes de cada bot.
            </p>
          </div>
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

      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.25rem' }}>
        {activeInnerTab === 'estado_activaciones' && <EstadoActivaciones />}
        {activeInnerTab === 'modulo_2' && <ControlTunelCloudflare />}
        {activeInnerTab === 'modulo_3' && <PlaceholderEnDesarrollo titulo="Módulo 3" />}
        {activeInnerTab === 'modulo_4' && <PlaceholderEnDesarrollo titulo="Módulo 4" />}
      </div>
    </div>
  );
};

export default ConfiguracionGeneral;
