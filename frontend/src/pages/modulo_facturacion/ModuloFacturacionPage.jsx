import React, { useState } from 'react';
import { ReceiptText, Zap, Building2, BatteryCharging } from 'lucide-react';
import ClienteLibreTab from './cliente_libre/ClienteLibreTab';
import MediaTensionTab from './media_tension/MediaTensionTab';
import BajaTensionTab from './baja_tension/BajaTensionTab';
import ErrorBoundary from '../../components/common/ErrorBoundary';

const ModuloFacturacionPage = () => {
  const [tabActiva, setTabActiva] = useState('cliente_libre');

  const tabs = [
    {
      id: 'cliente_libre',
      label: 'Facturación en Cliente Libre',
      icon: <Building2 size={16} />,
      descripcion: 'Gestión y análisis de facturación para clientes en mercado libre de energía.',
    },
    {
      id: 'media_tension',
      label: 'Facturación Media Tensión',
      icon: <Zap size={16} />,
      descripcion: 'Control tarifario y liquidaciones de suministros en media tensión (MT).',
    },
    {
      id: 'baja_tension',
      label: 'Facturación en Baja Tensión',
      icon: <BatteryCharging size={16} />,
      descripcion: 'Monitoreo y cálculo de facturación para suministros en baja tensión (BT).',
    },
  ];

  const tabActual = tabs.find((t) => t.id === tabActiva) || tabs[0];

  return (
    <div
      className="page-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header del Módulo con icono y descripción */}
      <div className="bot-panel" style={{ padding: '0.85rem 1.25rem', marginBottom: 0, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.75rem' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(37, 99, 235, 0.1))',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
              flexShrink: 0,
            }}
          >
            <ReceiptText size={20} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
              Módulo Facturación
            </h1>
            <p style={{ margin: '1px 0 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
              {tabActual.descripcion}
            </p>
          </div>
        </div>

        {/* 3 Pestañas Superiores */}
        <div className="inner-tabs" style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #1e293b', paddingBottom: '0.4rem' }}>
          {tabs.map((tab) => {
            const activo = tabActiva === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={`inner-tab ${activo ? 'active' : ''}`}
                onClick={() => setTabActiva(tab.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.45rem 1rem',
                  fontSize: '0.8rem',
                  fontWeight: activo ? 700 : 500,
                  cursor: 'pointer',
                  borderRadius: '6px',
                  transition: 'all 0.2s ease',
                  border: activo ? '1px solid #38bdf8' : '1px solid transparent',
                  background: activo ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                  color: activo ? '#38bdf8' : '#94a3b8',
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Contenido según la pestaña superior activa protegido por ErrorBoundary */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <ErrorBoundary>
          {tabActiva === 'cliente_libre' && <ClienteLibreTab />}
          {tabActiva === 'media_tension' && <MediaTensionTab />}
          {tabActiva === 'baja_tension' && <BajaTensionTab />}
        </ErrorBoundary>
      </div>
    </div>
  );
};

export default ModuloFacturacionPage;
