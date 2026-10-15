import React, { useState, useEffect } from 'react';
import { Search, ChevronRight, ChevronDown, Radio, Thermometer, MapPin } from 'lucide-react';

const BASE = window.location.protocol + '//' + window.location.hostname + ':3001';

const TreeNode = ({ label, icon, children, defaultExpanded = false, subtitle = '' }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = children && React.Children.count(children) > 0;

  return (
    <div style={{ marginLeft: '1rem', marginTop: '0.2rem' }}>
      <div 
        style={{ display: 'flex', alignItems: 'center', cursor: hasChildren ? 'pointer' : 'default', padding: '4px', borderRadius: '4px' }}
        onClick={() => hasChildren && setExpanded(!expanded)}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <span style={{ width: '16px', display: 'flex', alignItems: 'center', color: '#888' }}>
          {hasChildren ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : ''}
        </span>
        <span style={{ marginRight: '6px', display: 'flex', alignItems: 'center' }}>{icon}</span>
        <span style={{ fontSize: '0.85rem', color: '#ddd' }}>{label}</span>
        {subtitle && <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: '#666' }}>{subtitle}</span>}
      </div>
      {expanded && hasChildren && <div style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', marginLeft: '8px', paddingLeft: '4px' }}>{children}</div>}
    </div>
  );
};

const SenamhiExplorador = () => {
  const [data, setData] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchTree = async () => {
      try {
        const res = await fetch(`${BASE}/api/senamhi?limit=5000`);
        const json = await res.json();
        
        // Group by type -> station -> sedes
        const tree = { meteorologica: {}, hidrologica: {} };
        
        (json.data || []).forEach(r => {
          const type = (r.tipo_estacion || '').toLowerCase().includes('hidro') ? 'hidrologica' : 'meteorologica';
          const sta = r.codigo_senamhi;
          if (!tree[type][sta]) {
            tree[type][sta] = { 
                nombre: r.nombre_estacion, 
                codigo: r.codigo_senamhi, 
                sedes: [] 
            };
          }
          // Add sede if not already added for this station
          if (!tree[type][sta].sedes.find(s => s.ceco === r.ceco)) {
              tree[type][sta].sedes.push({
                  sede: r.sede_spsa,
                  ceco: r.ceco,
                  distancia: r.distancia_km
              });
          }
        });

        setData(tree);
      } catch (err) {
        console.error('Error fetching data for tree:', err);
      }
    };
    fetchTree();
  }, []);

  const renderStationNodes = (stationsObj) => {
    return Object.values(stationsObj)
      .filter(sta => sta.nombre.toLowerCase().includes(search.toLowerCase()) || sta.codigo.includes(search))
      .map(sta => (
        <TreeNode 
          key={sta.codigo} 
          label={`[${sta.codigo}] ${sta.nombre}`} 
          icon={<MapPin size={14} color="#3b82f6" />}
          subtitle={`(${sta.sedes.length} sedes)`}
        >
          {sta.sedes.map(sede => (
            <TreeNode 
              key={`${sta.codigo}-${sede.ceco}`}
              label={sede.sede}
              icon={<Radio size={14} color="#22c55e" />}
              subtitle={`${Number(sede.distancia).toFixed(1)} km`}
            />
          ))}
        </TreeNode>
    ));
  };

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--panel-border)' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Explorador Jerárquico</h3>
        <p style={{ margin: '4px 0 1rem 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Vista de árbol: Estaciones SENAMHI y las Sedes SPSA que abastecen.
        </p>
        
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#555' }} />
          <input 
            className="input-field" 
            placeholder="Buscar estación..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            style={{ paddingLeft: '32px', width: '100%', maxWidth: '400px' }} 
          />
        </div>
      </div>

      <div style={{ padding: '1rem', flex: 1, overflowY: 'auto' }}>
        <TreeNode label="ESTACIONES SENAMHI" icon={<Radio size={16} color="#8b5cf6"/>} defaultExpanded={true}>
          
          <TreeNode 
            label="Meteorológicas" 
            icon={<Thermometer size={14} color="#e4a02b"/>} 
            subtitle={data.meteorologica ? `(${Object.keys(data.meteorologica).length})` : ''}
          >
            {data.meteorologica && renderStationNodes(data.meteorologica)}
          </TreeNode>

          <TreeNode 
            label="Hidrológicas" 
            icon={<Radio size={14} color="#06b6d4"/>}
            subtitle={data.hidrologica ? `(${Object.keys(data.hidrologica).length})` : ''}
          >
            {data.hidrologica && renderStationNodes(data.hidrologica)}
          </TreeNode>
          
        </TreeNode>
      </div>
    </div>
  );
};

export default SenamhiExplorador;
