import React, { useState } from 'react';
import { LayoutDashboard, Bot, LogOut, ChevronDown, Wrench, Zap, Satellite, Mail, Settings, GitBranch, ReceiptText } from 'lucide-react';

const Sidebar = ({ activeTab, setActiveTab, isConnected, onLogout }) => {
  const [expandedGroups, setExpandedGroups] = useState({
    mantenimiento: true,
    energia: true,
    mensajeria: true
  });

  const toggleGroup = (group) => {
    setExpandedGroups(prev => ({
      ...prev,
      [group]: !prev[group]
    }));
  };

  return (
    <aside className="sidebar">
      <div style={{ padding: '1rem', borderBottom: '1px solid var(--panel-border)', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Bot Manager</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ 
            width: '8px', height: '8px', borderRadius: '50%', 
            backgroundColor: isConnected ? '#22c55e' : '#ef4444',
            boxShadow: isConnected ? '0 0 8px #22c55e' : '0 0 8px #ef4444',
            transition: 'all 0.3s ease'
          }}></span>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
            {isConnected ? 'Servidor Online' : 'Servidor Offline'}
          </p>
        </div>
      </div>

      <button
        className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
        onClick={() => setActiveTab('dashboard')}
      >
        <LayoutDashboard size={20} />
        Tablero Principal
      </button>

      <button
        className={`nav-item ${activeTab === 'configuracion_general' ? 'active' : ''}`}
        onClick={() => setActiveTab('configuracion_general')}
      >
        <Settings size={20} />
        Configuración General
      </button>

      {/* Grupo: Gestión Mantenimiento */}
      <div className="sidebar-group">
        <button 
          className="category-header" 
          onClick={() => toggleGroup('mantenimiento')}
        >
          <div className="category-title">
            <Wrench size={18} />
            <span>Gestión Mantenimiento</span>
          </div>
          <ChevronDown 
            size={16} 
            className={`category-chevron ${expandedGroups.mantenimiento ? 'expanded' : ''}`} 
          />
        </button>
        
        {expandedGroups.mantenimiento && (
          <div className="category-submenu">
            <button
              className={`submenu-item ${activeTab === 'bot_fracttal_msp' ? 'active' : ''}`}
              onClick={() => setActiveTab('bot_fracttal_msp')}
            >
              <Bot size={16} />
              Bot Fracttal-Msp
            </button>
            <button
              className={`submenu-item ${activeTab === 'itlus_fractal' ? 'active' : ''}`}
              onClick={() => setActiveTab('itlus_fractal')}
            >
              <GitBranch size={16} />
              Itlus Fractal
            </button>
          </div>
        )}
      </div>

      {/* Grupo: Gestión Energía */}
      <div className="sidebar-group">
        <button 
          className="category-header" 
          onClick={() => toggleGroup('energia')}
        >
          <div className="category-title">
            <Zap size={18} />
            <span>Gestión Energía</span>
          </div>
          <ChevronDown 
            size={16} 
            className={`category-chevron ${expandedGroups.energia ? 'expanded' : ''}`} 
          />
        </button>
        
        {expandedGroups.energia && (
          <div className="category-submenu">
            <button 
              className={`submenu-item ${activeTab === 'bot_climatico' ? 'active' : ''}`}
              onClick={() => setActiveTab('bot_climatico')}
            >
              <Bot size={16} />
              Bot Climático
            </button>
            <button 
              className={`submenu-item ${activeTab === 'bot_pme' ? 'active' : ''}`}
              onClick={() => setActiveTab('bot_pme')}
            >
              <Zap size={16} />
              Bot PME (Schneider)
            </button>
            <button 
              className={`submenu-item ${activeTab === 'bot_auditoria_en' ? 'active' : ''}`}
              onClick={() => setActiveTab('bot_auditoria_en')}
            >
              <Bot size={16} />
              Bot Auditoria En.
            </button>
            <button 
              className={`submenu-item ${activeTab === 'modulo_facturacion' ? 'active' : ''}`}
              onClick={() => setActiveTab('modulo_facturacion')}
            >
              <ReceiptText size={16} />
              Módulo Facturación
            </button>
          </div>
        )}
      </div>

      {/* Grupo: Gestión Mensajería */}
      <div className="sidebar-group">
        <button 
          className="category-header" 
          onClick={() => toggleGroup('mensajeria')}
        >
          <div className="category-title">
            <Mail size={18} />
            <span>Gestión Mensajería</span>
          </div>
          <ChevronDown 
            size={16} 
            className={`category-chevron ${expandedGroups.mensajeria ? 'expanded' : ''}`} 
          />
        </button>
        
        {expandedGroups.mensajeria && (
          <div className="category-submenu">
            <button 
              className={`submenu-item ${activeTab === 'agente_correo' ? 'active' : ''}`}
              onClick={() => setActiveTab('agente_correo')}
            >
              <Bot size={16} />
              Agente Correo
            </button>
          </div>
        )}
      </div>

      {onLogout && (
        <button 
          className="nav-item"
          onClick={onLogout}
          style={{ 
            marginTop: 'auto',
            color: '#ef4444',
            border: '1px solid rgba(239, 68, 68, 0.15)',
            backgroundColor: 'rgba(239, 68, 68, 0.05)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
            e.currentTarget.style.color = '#ff5f5f';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.05)';
            e.currentTarget.style.color = '#ef4444';
          }}
        >
          <LogOut size={20} />
          Cerrar Sesión
        </button>
      )}
    </aside>
  );
};

export default Sidebar;
