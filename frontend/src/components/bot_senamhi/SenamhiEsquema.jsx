import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronRight, ChevronDown, Radio, Thermometer, MapPin, Sliders, Navigation, RefreshCw } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Circle, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const BASE = window.location.protocol + '//' + window.location.hostname + ':3001';

// Tesla style dark markers
const createPulsingIcon = (color) => {
  return new L.DivIcon({
    html: `<div style="
      position: relative;
      width: 14px;
      height: 14px;
      background-color: ${color};
      border: 2px solid #fff;
      border-radius: 50%;
      box-shadow: 0 0 10px ${color}, 0 0 20px ${color};
    ">
      <div style="
        position: absolute;
        top: -6px;
        left: -6px;
        width: 22px;
        height: 22px;
        border: 2px solid ${color};
        border-radius: 50%;
        animation: sonar 1.8s infinite ease-out;
        opacity: 0;
      "></div>
    </div>`,
    className: 'tesla-pulsing-marker',
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
};

const icons = {
  meteo: createPulsingIcon('#3b82f6'), // Electric Blue
  hidro: createPulsingIcon('#10b981'), // Neon Green
  sede_covered: createPulsingIcon('#f59e0b'), // Amber Gold
  sede_uncovered: createPulsingIcon('#ef4444') // Cyber Red
};

// Map fly-to helper
const MapController = ({ selectedCoords }) => {
  const map = useMap();
  useEffect(() => {
    if (selectedCoords) {
      map.setView(selectedCoords, 11, { animate: true, duration: 1.5 });
    }
  }, [selectedCoords, map]);
  return null;
};

// Tree node component
const TreeNode = ({ label, icon, children, defaultExpanded = false, subtitle = '', onClick, isActive }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = children && React.Children.count(children) > 0;

  return (
    <div style={{ marginLeft: '0.85rem', marginTop: '0.25rem' }}>
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          cursor: 'pointer', 
          padding: '8px 10px', 
          borderRadius: '8px',
          backgroundColor: isActive ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
          border: isActive ? '1px solid rgba(59, 130, 246, 0.25)' : '1px solid transparent',
          transition: 'all 0.2s ease'
        }}
        onClick={(e) => {
          if (onClick) onClick();
          if (hasChildren) setExpanded(!expanded);
        }}
        onMouseEnter={e => {
          if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)';
        }}
        onMouseLeave={e => {
          if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <span style={{ width: '18px', display: 'flex', alignItems: 'center', color: '#6b7280' }} onClick={(e) => {
          if (hasChildren) {
            e.stopPropagation();
            setExpanded(!expanded);
          }
        }}>
          {hasChildren ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : ''}
        </span>
        <span style={{ marginRight: '8px', display: 'flex', alignItems: 'center' }}>{icon}</span>
        <span style={{ fontSize: '0.825rem', color: isActive ? '#fff' : '#e5e7eb', fontWeight: isActive ? 600 : 500 }}>{label}</span>
        {subtitle && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: isActive ? '#93c5fd' : '#9ca3af', fontFamily: 'monospace' }}>{subtitle}</span>}
      </div>
      {expanded && hasChildren && (
        <div style={{ borderLeft: '1px dashed rgba(255,255,255,0.08)', marginLeft: '8px', paddingLeft: '4px' }}>
          {children}
        </div>
      )}
    </div>
  );
};

const SenamhiEsquema = () => {
  const [estaciones, setEstaciones] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [relaciones, setRelaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Dynamic Slider Radio
  const [radioKm, setRadioKm] = useState(10);
  
  // Selected state for highlight
  const [activeEstacion, setActiveEstacion] = useState(null);
  
  // Load data
  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch catalog stations
      const estRes = await fetch(`${BASE}/api/senamhi/estaciones`);
      const estJson = await estRes.json();
      const loadedEst = estJson.estaciones || [];
      
      // 2. Fetch sedes GPS
      const sedesRes = await fetch(`${BASE}/api/senamhi/sedes`);
      const sedesJson = await sedesRes.json();
      const loadedSedes = sedesJson.data || [];
      
      setEstaciones(loadedEst);
      setSedes(loadedSedes);
    } catch (err) {
      console.error("Error fetching schema data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Recalculate relations in frontend dynamically based on the slider radioKm
  // This uses Haversine formula
  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Build tree based on active slider radioKm
  const computedRelations = [];
  const stationsMap = {};
  
  estaciones.forEach(est => {
    stationsMap[est.codigo] = {
      ...est,
      sedes: []
    };
  });

  const coveredSedesCecos = new Set();

  sedes.forEach(sede => {
    if (!sede.latitud || !sede.longitud) return;
    
    // Find closest stations within current slider radioKm
    estaciones.forEach(est => {
      if (!est.latitud || !est.longitud) return;
      const dist = getDistance(sede.latitud, sede.longitud, est.latitud, est.longitud);
      if (dist <= radioKm) {
        stationsMap[est.codigo].sedes.push({
          ceco: sede.ceco,
          sede: sede.sede,
          distancia: dist,
          latitud: sede.latitud,
          longitud: sede.longitud
        });
        coveredSedesCecos.add(sede.ceco);
      }
    });
  });

  // Filter stations that have at least 1 SPSA store inside the radius
  const activeStationsList = Object.values(stationsMap)
    .filter(est => est.sedes.length > 0)
    .sort((a, b) => b.sedes.length - a.sedes.length);

  // Group active stations by type for Tree
  const treeMeteo = activeStationsList.filter(e => e.tipo === 'meteorologica');
  const treeHidro = activeStationsList.filter(e => e.tipo === 'hidrologica');

  // Search filter
  const filterStations = (list) => {
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(est => 
      est.nombre.toLowerCase().includes(q) || 
      est.codigo.includes(q) ||
      est.sedes.some(s => s.sede.toLowerCase().includes(q))
    );
  };

  const filteredMeteo = filterStations(treeMeteo);
  const filteredHidro = filterStations(treeHidro);

  const totalSedesConCobertura = coveredSedesCecos.size;
  const totalSedesSinCobertura = sedes.length - totalSedesConCobertura;

  // Selected station coordinate for Map fly-to
  const activeEstCoords = activeEstacion ? [activeEstacion.latitud, activeEstacion.longitud] : null;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 12rem)', gap: '1.25rem', overflow: 'hidden' }}>
      
      {/* Styles inject for Sonar animation */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes sonar {
          0% { transform: scale(0.6); opacity: 1; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        .tesla-dark-map .leaflet-container {
          background: #090c10 !important;
        }
        .inner-tab.active {
          box-shadow: 0 0 12px rgba(59, 130, 246, 0.4);
        }
      `}} />

      {/* Left panel: tree & filters */}
      <div className="glass-panel" style={{
        width: '38%',
        backgroundColor: '#121620',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header & Controls */}
        <div style={{ padding: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff', fontWeight: 700 }}>Esquema de Cobertura</h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>Asociaciones Estación ➔ Sedes SPSA</p>
            </div>
            <button 
              onClick={fetchData} 
              style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: '4px' }}
              title="Actualizar Datos"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {/* Slider Radio in real-time */}
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Sliders size={14} color="#60a5fa" /> AJUSTAR RADIO DE COBERTURA
              </span>
              <span style={{ fontSize: '0.8rem', color: '#60a5fa', fontWeight: 700, fontFamily: 'monospace' }}>{radioKm} km</span>
            </div>
            <input 
              type="range" 
              min="1" 
              max="50" 
              value={radioKm} 
              onChange={(e) => setRadioKm(parseFloat(e.target.value))} 
              style={{ width: '100%', accentColor: '#3b82f6', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#6b7280', marginTop: '4px' }}>
              <span>1 km</span>
              <span>25 km</span>
              <span>50 km</span>
            </div>
          </div>

          {/* Search bar */}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
            <input 
              className="input-field"
              placeholder="Buscar estación o sede..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.65rem 0.65rem 2.25rem',
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                color: '#fff',
                fontSize: '0.8rem'
              }}
            />
          </div>
        </div>

        {/* Tree Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '3rem', fontSize: '0.85rem' }}>
              Cargando catálogo y sedes...
            </div>
          ) : (
            <TreeNode 
              label="ESTACIONES ACTIVAS" 
              icon={<Radio size={15} color="#3b82f6" />} 
              defaultExpanded={true}
              subtitle={`(${activeStationsList.length})`}
            >
              {/* Meteorological branch */}
              <TreeNode 
                label="Estaciones Meteorológicas" 
                icon={<Thermometer size={14} color="#3b82f6" />} 
                defaultExpanded={true}
                subtitle={`(${filteredMeteo.length})`}
              >
                {filteredMeteo.map(est => (
                  <TreeNode
                    key={est.codigo}
                    label={est.nombre}
                    subtitle={`[${est.codigo}] — ${est.sedes.length} locales`}
                    icon={<MapPin size={13} color="#60a5fa" />}
                    isActive={activeEstacion?.codigo === est.codigo}
                    onClick={() => setActiveEstacion(est)}
                  >
                    {est.sedes.map(s => (
                      <TreeNode
                        key={`${est.codigo}-${s.ceco}`}
                        label={s.sede}
                        subtitle={`${s.distancia.toFixed(1)} km`}
                        icon={<Navigation size={11} color="#f59e0b" />}
                      />
                    ))}
                  </TreeNode>
                ))}
              </TreeNode>

              {/* Hydrological branch */}
              <TreeNode 
                label="Estaciones Hidrológicas" 
                icon={<Radio size={14} color="#10b981" />} 
                defaultExpanded={false}
                subtitle={`(${filteredHidro.length})`}
              >
                {filteredHidro.map(est => (
                  <TreeNode
                    key={est.codigo}
                    label={est.nombre}
                    subtitle={`[${est.codigo}] — ${est.sedes.length} locales`}
                    icon={<MapPin size={13} color="#10b981" />}
                    isActive={activeEstacion?.codigo === est.codigo}
                    onClick={() => setActiveEstacion(est)}
                  >
                    {est.sedes.map(s => (
                      <TreeNode
                        key={`${est.codigo}-${s.ceco}`}
                        label={s.sede}
                        subtitle={`${s.distancia.toFixed(1)} km`}
                        icon={<Navigation size={11} color="#f59e0b" />}
                      />
                    ))}
                  </TreeNode>
                ))}
              </TreeNode>
            </TreeNode>
          )}
        </div>

        {/* Tree Footer metrics */}
        <div style={{ padding: '0.85rem 1.25rem', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
          <span style={{ color: '#10b981', fontWeight: 600 }}>Cubiertas: {totalSedesConCobertura}</span>
          <span style={{ color: '#ef4444', fontWeight: 600 }}>Sin Cobertura: {totalSedesSinCobertura}</span>
        </div>
      </div>

      {/* Right panel: Tesla dark map */}
      <div className="tesla-dark-map" style={{
        flex: 1,
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        position: 'relative'
      }}>
        <MapContainer 
          center={[-12.046374, -77.042793]} // Lima focus default
          zoom={10} 
          style={{ height: '100%', width: '100%' }}
        >
          {/* CartoDB Dark Matter tile layer */}
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />

          <MapController selectedCoords={activeEstCoords} />

          {/* Plot ALL active stations */}
          {activeStationsList.map(est => {
            const isSelected = activeEstacion?.codigo === est.codigo;
            return (
              <React.Fragment key={`map-est-${est.codigo}`}>
                <Marker 
                  position={[est.latitud, est.longitud]}
                  icon={est.tipo === 'hidrologica' ? icons.hidro : icons.meteo}
                  eventHandlers={{
                    click: () => setActiveEstacion(est)
                  }}
                >
                  <Popup>
                    <div style={{ color: '#000', fontSize: '0.8rem', padding: '2px' }}>
                      <strong style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>{est.nombre}</strong>
                      <strong>Código:</strong> {est.codigo}<br/>
                      <strong>Tipo:</strong> {est.tipo}<br/>
                      <strong>Locales cubiertos:</strong> {est.sedes.length}
                    </div>
                  </Popup>
                </Marker>

                {/* Radius Circle */}
                {isSelected && (
                  <Circle 
                    center={[est.latitud, est.longitud]}
                    radius={radioKm * 1000}
                    pathOptions={{
                      color: est.tipo === 'hidrologica' ? '#10b981' : '#3b82f6',
                      fillColor: est.tipo === 'hidrologica' ? '#10b981' : '#3b82f6',
                      fillOpacity: 0.08,
                      weight: 1.5,
                      dashArray: '5, 5'
                    }}
                  />
                )}

                {/* Laser lines connecting selected station to its stores */}
                {isSelected && est.sedes.map(s => (
                  <Polyline 
                    key={`line-${est.codigo}-${s.ceco}`}
                    positions={[
                      [est.latitud, est.longitud],
                      [s.latitud, s.longitud]
                    ]}
                    pathOptions={{
                      color: '#f59e0b',
                      weight: 2.2,
                      opacity: 0.8,
                      dashArray: '3, 6'
                    }}
                  />
                ))}
              </React.Fragment>
            );
          })}

          {/* Plot SPSA stores within radius or highlighted */}
          {sedes.map(s => {
            if (!s.latitud || !s.longitud) return null;
            const isCovered = coveredSedesCecos.has(s.ceco);
            const isLinkedToActive = activeEstacion?.sedes.some(store => store.ceco === s.ceco);
            
            // Draw SPSA store marker
            return (
              <Marker
                key={`map-sede-${s.ceco}`}
                position={[s.latitud, s.longitud]}
                icon={isCovered ? icons.sede_covered : icons.sede_uncovered}
              >
                <Popup>
                  <div style={{ color: '#000', fontSize: '0.8rem' }}>
                    <strong style={{ display: 'block', fontSize: '0.9rem', marginBottom: '2px' }}>{s.sede}</strong>
                    <strong>CECO:</strong> {s.ceco}<br/>
                    <strong>Estado:</strong> {isCovered ? '✅ Cobertura SENAMHI' : '❌ Fuera de radio (usar Open-Meteo)'}<br/>
                    <strong>Ubicación:</strong> {s.distrito}, {s.provincia}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Floating Tesla Legend */}
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          zIndex: 1000,
          backgroundColor: 'rgba(15, 17, 21, 0.9)',
          backdropFilter: 'blur(8px)',
          padding: '12px 14px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
        }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af', fontWeight: 700 }}>Leyenda Cobertura</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#e5e7eb' }}>
              <div style={{ width: '10px', height: '10px', backgroundColor: '#3b82f6', borderRadius: '50%', boxShadow: '0 0 8px #3b82f6' }}></div> Estación Climatológica
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#e5e7eb' }}>
              <div style={{ width: '10px', height: '10px', backgroundColor: '#10b981', borderRadius: '50%', boxShadow: '0 0 8px #10b981' }}></div> Estación Hidrológica
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#e5e7eb' }}>
              <div style={{ width: '10px', height: '10px', backgroundColor: '#f59e0b', borderRadius: '50%', boxShadow: '0 0 8px #f59e0b' }}></div> SPSA Local Cubierto
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#e5e7eb' }}>
              <div style={{ width: '10px', height: '10px', backgroundColor: '#ef4444', borderRadius: '50%', boxShadow: '0 0 8px #ef4444' }}></div> SPSA Local sin cobertura
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SenamhiEsquema;
