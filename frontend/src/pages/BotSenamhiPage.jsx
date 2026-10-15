import React, { useState } from 'react';
import { Satellite, Table2, Map, TreeDeciduous } from 'lucide-react';
import BotSenamhiControl from '../components/bot_senamhi/BotSenamhiControl';
import SenamhiTabla from '../components/bot_senamhi/SenamhiTabla';
import SenamhiMapa from '../components/bot_senamhi/SenamhiMapa';
import SenamhiEsquema from '../components/bot_senamhi/SenamhiEsquema';

const BotSenamhiPage = ({ bots, logs, onStart, onStop, socket }) => {
  const [activeTab, setActiveTab] = useState('bot');

  const getBot = (id) => bots.find(b => b.id === id) || { id, status: 'offline' };
  const getLogs = (id) => logs[id] || [];

  const tabs = [
    { id: 'bot',        label: 'Bot SENAMHI',  icon: <Satellite size={15} /> },
    { id: 'tabla',      label: 'Tabla',         icon: <Table2 size={15} /> },
    { id: 'cobertura',  label: 'Cobertura',     icon: <Map size={15} /> },
    { id: 'esquema',    label: 'Esquema',       icon: <TreeDeciduous size={15} /> },
  ];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 4rem)',
      overflow: 'hidden',
      padding: '20px'
    }}>
      {/* Fixed Header */}
      <div style={{
        flexShrink: 0,
        backgroundColor: '#0f1115',
        paddingBottom: '1rem',
        borderBottom: '1px solid var(--panel-border)',
        marginBottom: '1rem'
      }}>
        <header style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '40px', height: '40px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 16px rgba(59,130,246,0.4)'
          }}>
            <Satellite size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Bot SENAMHI</h1>
            <p style={{ color: 'var(--text-secondary)', margin: '2px 0 0 0', fontSize: '0.85rem' }}>
              Extracción de datos hidrometeorológicos oficiales del SENAMHI Perú
            </p>
          </div>
        </header>

        <div className="inner-tabs" style={{ marginBottom: 0, gap: '0.5rem', borderBottom: 'none' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                fontSize: '0.85rem',
                padding: '0.5rem 1.1rem',
                borderRadius: '10px',
                fontWeight: activeTab === tab.id ? 700 : 500
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="tab-content" style={{ flex: 1, overflowY: 'auto', paddingRight: '0.25rem' }}>
        {activeTab === 'bot' && (
          <BotSenamhiControl
            bot={getBot('bot_senamhi_spsa')}
            logs={getLogs('bot_senamhi_spsa')}
            onStart={(runMode) => onStart('bot_senamhi_spsa', runMode)}
            onStop={() => onStop('bot_senamhi_spsa')}
            socket={socket}
          />
        )}
        {activeTab === 'tabla'      && <SenamhiTabla />}
        {activeTab === 'cobertura'  && <SenamhiMapa />}
        {activeTab === 'esquema'    && <SenamhiEsquema />}
      </div>
    </div>
  );
};

export default BotSenamhiPage;
