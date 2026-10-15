import React, { useState, useEffect } from 'react';
import { Cpu, Satellite, CloudSun, Table, BarChart2, HelpCircle, Code, Calendar } from 'lucide-react';
import BotMasterClimatico from '../components/bot_climatico/BotMasterClimatico';
import BotSenamhiControl from '../components/bot_senamhi/BotSenamhiControl';
import SenamhiTabla from '../components/bot_senamhi/SenamhiTabla';
import SenamhiMapa from '../components/bot_senamhi/SenamhiMapa';
import SenamhiEsquema from '../components/bot_senamhi/SenamhiEsquema';
import BotClimaSpsa from '../components/bot_climatico/bot_clima_spsa/BotClimaSpsa';
import ClimaTabla from '../components/bot_climatico/clima_1/ClimaTabla';
import Clima2 from '../components/bot_climatico/clima_2/Clima2';
import Clima3 from '../components/bot_climatico/clima_3/Clima3';
import Clima4 from '../components/bot_climatico/clima_4/Clima4';

const BotClimatico = ({ bots = [], logs = {}, onStart, onStop, socket, initialInnerTab = 'bot_master_climatico' }) => {
  const [activeInnerTab, setActiveInnerTab] = useState(initialInnerTab);

  useEffect(() => {
    if (initialInnerTab) {
      setActiveInnerTab(initialInnerTab);
    }
  }, [initialInnerTab]);

  const getBot = (id) => bots.find(b => b.id === id) || { id, status: 'offline' };
  const getLogs = (id) => logs[id] || [];

  const [stepOrder, setStepOrder] = useState(() => {
    const saved = localStorage.getItem('clima_step_order');
    return saved ? JSON.parse(saved) : ['bot_senamhi_spsa', 'bot_clima_spsa'];
  });

  const [tabsList, setTabsList] = useState(() => {
    const defaultTabs = [
      { id: 'bot_master_climatico', label: 'Bot Master Climático' },
      { id: 'bot_senamhi', label: 'Bot SENAMHI' },
      { id: 'bot_clima_spsa', label: 'BOT Clima METEO' },
      { id: 'clima_1', label: 'Tablas Clima' },
      { id: 'clima_2', label: 'Panorama por Sede' },
      { id: 'clima_3', label: 'Reporte CDD (En Desarrollo)' },
      { id: 'clima_4', label: 'Reporte CDD Diario' }
    ];
    let tabsOrder = defaultTabs;
    const saved = localStorage.getItem('clima_tabs_order');
    if (saved) {
      try {
        const savedIds = JSON.parse(saved);
        const ordered = [];
        savedIds.forEach(id => {
          const found = defaultTabs.find(t => t.id === id);
          if (found) ordered.push(found);
        });
        defaultTabs.forEach(t => {
          if (!ordered.some(ot => ot.id === t.id)) {
            ordered.push(t);
          }
        });
        tabsOrder = ordered;
      } catch (e) {}
    }

    // Sync relative tab order to match the stepOrder on mount
    const savedSteps = localStorage.getItem('clima_step_order');
    if (savedSteps) {
      try {
        const steps = JSON.parse(savedSteps);
        const senamhiTabIdx = tabsOrder.findIndex(t => t.id === 'bot_senamhi');
        const climaTabIdx = tabsOrder.findIndex(t => t.id === 'bot_clima_spsa');
        if (senamhiTabIdx !== -1 && climaTabIdx !== -1) {
          const isSenamhiFirstInStep = steps.indexOf('bot_senamhi_spsa') < steps.indexOf('bot_clima_spsa');
          const isSenamhiFirstInTabs = senamhiTabIdx < climaTabIdx;
          if (isSenamhiFirstInStep !== isSenamhiFirstInTabs) {
            const temp = tabsOrder[senamhiTabIdx];
            tabsOrder[senamhiTabIdx] = tabsOrder[climaTabIdx];
            tabsOrder[climaTabIdx] = temp;
          }
        }
      } catch (e) {}
    }

    return tabsOrder;
  });

  const [draggedTabId, setDraggedTabId] = useState(null);

  const handleTabDragStart = (e, id) => {
    e.dataTransfer.setData('text/plain', id);
    e.currentTarget.style.opacity = '0.4';
    setTimeout(() => {
      setDraggedTabId(id);
    }, 0);
  };

  const handleTabDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    setDraggedTabId(null);
  };

  const handleTabDragOver = (e) => {
    e.preventDefault();
  };

  const handleTabDragEnter = (e, targetId) => {
    e.preventDefault();
    if (!draggedTabId || draggedTabId === targetId) return;

    const newTabsList = [...tabsList];
    const draggedIdx = newTabsList.findIndex(t => t.id === draggedTabId);
    const targetIdx = newTabsList.findIndex(t => t.id === targetId);

    if (draggedIdx !== -1 && targetIdx !== -1) {
      const [removed] = newTabsList.splice(draggedIdx, 1);
      newTabsList.splice(targetIdx, 0, removed);
      setTabsList(newTabsList);
      localStorage.setItem('clima_tabs_order', JSON.stringify(newTabsList.map(t => t.id)));

      // Sync step order when tabs are reordered
      const senamhiTabIdx = newTabsList.findIndex(t => t.id === 'bot_senamhi');
      const climaTabIdx = newTabsList.findIndex(t => t.id === 'bot_clima_spsa');
      if (senamhiTabIdx !== -1 && climaTabIdx !== -1) {
        const newStepOrder = senamhiTabIdx < climaTabIdx
          ? ['bot_senamhi_spsa', 'bot_clima_spsa']
          : ['bot_clima_spsa', 'bot_senamhi_spsa'];
        setStepOrder(newStepOrder);
        localStorage.setItem('clima_step_order', JSON.stringify(newStepOrder));
      }
    }
  };

  const handleStepOrderChange = (newOrder) => {
    setStepOrder(newOrder);
    localStorage.setItem('clima_step_order', JSON.stringify(newOrder));

    // Sync tabs when card order is updated
    const senamhiTabIdx = tabsList.findIndex(t => t.id === 'bot_senamhi');
    const climaTabIdx = tabsList.findIndex(t => t.id === 'bot_clima_spsa');
    if (senamhiTabIdx !== -1 && climaTabIdx !== -1) {
      const isSenamhiFirstInStep = newOrder.indexOf('bot_senamhi_spsa') < newOrder.indexOf('bot_clima_spsa');
      const isSenamhiFirstInTabs = senamhiTabIdx < climaTabIdx;

      if (isSenamhiFirstInStep !== isSenamhiFirstInTabs) {
        const newTabsList = [...tabsList];
        const temp = newTabsList[senamhiTabIdx];
        newTabsList[senamhiTabIdx] = newTabsList[climaTabIdx];
        newTabsList[climaTabIdx] = temp;
        setTabsList(newTabsList);
        localStorage.setItem('clima_tabs_order', JSON.stringify(newTabsList.map(t => t.id)));
      }
    }
  };

  const handleTabDrop = (e) => {
    e.preventDefault();
    setDraggedTabId(null);
  };

  const activeTabObj = tabsList.find(t => t.id === activeInnerTab) || { label: 'Bot Climático', id: '' };

  const getTabIcon = (id) => {
    switch(id) {
      case 'bot_master_climatico':
        return <Cpu size={26} color="#60a5fa" />;
      case 'bot_senamhi':
        return <Satellite size={26} color="#60a5fa" />;
      case 'bot_clima_spsa':
        return <CloudSun size={26} color="#60a5fa" />;
      case 'clima_1':
        return <Table size={26} color="#60a5fa" />;
      case 'clima_2':
        return <BarChart2 size={26} color="#60a5fa" />;
      case 'clima_3':
        return <Code size={26} color="#60a5fa" />;
      case 'clima_4':
        return <Calendar size={26} color="#38bdf8" />;
      default:
        return <Cpu size={26} color="#60a5fa" />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 4rem)', overflow: 'hidden', padding: '20px' }}>
      {/* Fixed Header and Tabs wrapper */}
      <div style={{ 
        flexShrink: 0,
        backgroundColor: '#0f1115', 
        paddingBottom: '1rem',
        borderBottom: '1px solid var(--panel-border)',
        marginBottom: '1rem'
      }}>
        <header style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(37,99,235,0.05))',
            border: '1px solid rgba(59,130,246,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(59,130,246,0.15)',
            flexShrink: 0
          }}>
            {getTabIcon(activeInnerTab)}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#fff' }}>
              {activeTabObj.label}
            </h1>
            <p style={{ color: 'var(--text-secondary)', margin: '2px 0 0 0', fontSize: '0.85rem' }}>
              {activeInnerTab === 'bot_master_climatico' && 'Orquestador principal y sincronización de parámetros globales.'}
              {activeInnerTab === 'bot_senamhi' && 'Extracción y monitoreo de datos de la red de estaciones físicas de SENAMHI.'}
              {activeInnerTab === 'bot_clima_spsa' && 'Extracción y monitoreo de datos meteorológicos satelitales de Open-Meteo.'}
              {activeInnerTab === 'clima_1' && 'Visualización tabular de los datos históricos y registros climáticos.'}
              {activeInnerTab === 'clima_2' && 'Panorama detallado y analítica gráfica de parámetros climáticos por sede.'}
              {activeInnerTab === 'clima_3' && 'Módulo de análisis predictivo y simulaciones climáticas en desarrollo.'}
              {activeInnerTab === 'clima_4' && 'Cálculo diario de Grados Día (Base 18°C) por Sede con proyecciones y acumulados mensuales.'}
            </p>
          </div>
        </header>

        <div className="inner-tabs" style={{ marginBottom: 0, display: 'flex', gap: '8px' }}>
          {tabsList.map(tab => {
            const isDragging = tab.id === draggedTabId;
            return (
              <button 
                key={tab.id}
                draggable="true"
                onDragStart={(e) => handleTabDragStart(e, tab.id)}
                onDragEnd={handleTabDragEnd}
                onDragOver={handleTabDragOver}
                onDragEnter={(e) => handleTabDragEnter(e, tab.id)}
                onDrop={handleTabDrop}
                className={`inner-tab ${activeInnerTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveInnerTab(tab.id)}
                style={{
                  cursor: 'grab',
                  opacity: isDragging ? 0.3 : 1,
                  border: isDragging ? '1px dashed var(--accent)' : undefined,
                  backgroundColor: isDragging ? 'rgba(59, 130, 246, 0.1)' : undefined,
                  transition: 'opacity 0.2s ease, border 0.2s ease, background-color 0.2s ease',
                  userSelect: 'none'
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Contents */}
      <div className="tab-content" style={{ flex: 1, overflowY: 'auto', paddingRight: '0.25rem' }}>
        {activeInnerTab === 'bot_master_climatico' && (
          <BotMasterClimatico 
            bots={bots} 
            logs={logs} 
            onStart={onStart} 
            onStop={onStop} 
            socket={socket} 
            stepOrder={stepOrder}
            onStepOrderChange={handleStepOrderChange}
          />
        )}
        {activeInnerTab === 'bot_senamhi' && (
          <BotSenamhiControl
            bot={getBot('bot_senamhi_spsa')}
            logs={getLogs('bot_senamhi_spsa')}
            onStart={(runMode) => onStart('bot_senamhi_spsa', runMode)}
            onStop={() => onStop('bot_senamhi_spsa')}
            socket={socket}
          />
        )}
        {activeInnerTab === 'bot_clima_spsa' && (
          <BotClimaSpsa 
            bot={getBot('bot_clima_spsa')} 
            logs={getLogs('bot_clima_spsa')} 
            onStart={(runMode) => onStart('bot_clima_spsa', runMode)} 
            onStop={() => onStop('bot_clima_spsa')} 
            socket={socket} 
          />
        )}
        {activeInnerTab === 'clima_1' && <ClimaTabla />}
        {activeInnerTab === 'clima_2' && <Clima2 />}
        {activeInnerTab === 'clima_3' && <Clima3 />}
        {activeInnerTab === 'clima_4' && <Clima4 />}
      </div>
    </div>
  );
};

export default BotClimatico;
