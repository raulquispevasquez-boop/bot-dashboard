import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Radio, Calendar } from 'lucide-react';

// Web Audio API Soft Chime Alert Generator (No external MP3 needed!)
const playSuccessAudioAlert = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.16);

      gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.16);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + idx * 0.16 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.16 + 0.65);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.16);
      osc.stop(ctx.currentTime + idx * 0.16 + 0.65);
    });
  } catch (e) {
    console.warn("Could not play audio alert:", e);
  }
};

// Custom Leaflet HTML DivIcon Generators for Format Badges & Radar Waves
const createDivIcon = (htmlContent, size = [30, 30], anchor = null) => {
  return L.divIcon({
    html: htmlContent,
    className: 'custom-map-div-icon',
    iconSize: size,
    iconAnchor: anchor || [size[0] / 2, size[1] / 2]
  });
};

const getBrandColors = (formatType, nombreSede) => {
  const text = (nombreSede + ' ' + (formatType || '')).toUpperCase();

  // 1. MAKRO (MK, Mk, mk, Makro) -> AZUL NEÓN
  if (text.includes('MK') || text.includes('MAKRO')) {
    return {
      brand: 'MAKRO',
      mainColor: '#00d2ff',
      borderColor: '#38bdf8',
      glowColor: 'rgba(0, 210, 255, 0.9)',
      bgTag: 'rgba(2, 132, 199, 0.95)',
      pulseAnim: 'absorbPulseBlue'
    };
  }

  // 2. VIVANDA (VV, Vv, vv, VIV, Viv, viv, Vivanda) -> VERDE NEÓN
  if (text.includes('VV') || text.includes('VIV') || text.includes('VIVANDA')) {
    return {
      brand: 'VIVANDA',
      mainColor: '#00ff66',
      borderColor: '#4ade80',
      glowColor: 'rgba(0, 255, 102, 0.9)',
      bgTag: 'rgba(22, 163, 74, 0.95)',
      pulseAnim: 'absorbPulseGreen'
    };
  }

  // 3. PLAZA VEA (PV, pv, PVO, Pvh, PVH, PVS, PVE, PV..., Plaza Vea) -> ROJO NEÓN
  if (text.includes('PV') || text.includes('PLAZA')) {
    return {
      brand: 'PLAZA_VEA',
      mainColor: '#ff0055',
      borderColor: '#f43f5e',
      glowColor: 'rgba(255, 0, 85, 0.9)',
      bgTag: 'rgba(225, 29, 72, 0.95)',
      pulseAnim: 'absorbPulseRed'
    };
  }

  // Default -> AZUL CELESTE
  return {
    brand: 'SPSA',
    mainColor: '#38bdf8',
    borderColor: '#7dd3fc',
    glowColor: 'rgba(56, 189, 248, 0.9)',
    bgTag: 'rgba(15, 23, 42, 0.95)',
    pulseAnim: 'absorbPulseBlue'
  };
};

const getFormatBadgeIcon = (formatType, nombreSede, isActive = false, isCompleted = false) => {
  const colors = getBrandColors(formatType, nombreSede);

  // 1. IDLE STATE (Default - Clean dark slate badge, NO NEON GLOW)
  let bgTagStyle = `background-color: rgba(15, 23, 42, 0.88); border: 1.5px solid ${colors.borderColor}; box-shadow: 0 3px 8px rgba(0,0,0,0.7);`;
  let pinFilterStyle = `filter: drop-shadow(0 3px 5px rgba(0,0,0,0.7));`;

  // 2. ACTIVE STATE (Ignite intense neon glow + absorbing pulse)
  if (isActive) {
    bgTagStyle = `background-color: ${colors.bgTag}; border: 2px solid #ffffff; animation: ${colors.pulseAnim} 1s infinite ease-in-out;`;
    pinFilterStyle = `filter: drop-shadow(0 0 12px ${colors.glowColor}) drop-shadow(0 4px 8px rgba(0,0,0,0.9));`;
  } else if (isCompleted) {
    // 3. COMPLETED STATE (Clean badge with green OK indicator)
    bgTagStyle = `background-color: rgba(15, 23, 42, 0.92); border: 1.5px solid ${colors.borderColor}; box-shadow: 0 3px 8px rgba(0,0,0,0.7);`;
  }

  const statusBadge = isActive
    ? `<span style="background: #f59e0b; color: #000; padding: 1px 5px; border-radius: 4px; font-size: 8px; font-weight: 900; margin-left: 4px; animation: blinkFast 0.6s infinite alternate;">⚡ ABSORBIENDO...</span>`
    : isCompleted
    ? `<span style="background: #22c55e; color: #fff; padding: 1px 5px; border-radius: 4px; font-size: 8px; font-weight: 900; margin-left: 4px; box-shadow: 0 0 6px #22c55e;">✓ OK</span>`
    : '';

  const html = `
    <div style="position: relative; width: 120px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; padding-bottom: 5px;">
      
      <!-- Label Name & Status Badge -->
      <div style="
        ${bgTagStyle}
        color: #ffffff;
        font-weight: 800;
        font-size: 9px;
        font-family: system-ui, sans-serif;
        border-radius: 6px;
        padding: 3px 7px;
        white-space: nowrap;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: 3px;
        backdrop-filter: blur(4px);
      ">
        <span>${nombreSede}</span>
        ${statusBadge}
      </div>

      <!-- Globito / Pin Marker with absorbing pulse -->
      <div style="position: relative; display: flex; align-items: center; justify-content: center;">
        ${isActive ? `
          <div style="
            position: absolute; width: 38px; height: 38px; border-radius: 50%;
            border: 2px solid ${colors.mainColor};
            background: ${colors.glowColor};
            animation: absorbWave 1.2s infinite ease-out;
          "></div>
        ` : ''}

        <svg viewBox="0 0 24 24" width="28" height="28" style="
          fill: ${colors.mainColor};
          ${pinFilterStyle}
          transform: translateY(2px);
          transition: transform 0.3s ease;
        ">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          <circle cx="12" cy="9" r="3.5" fill="#ffffff" opacity="0.95"/>
        </svg>
      </div>
      
    </div>
  `;
  return createDivIcon(html, [120, 48], [60, 48]);
};

const getRadarStationIcon = (nombreEstacion = '', isActive = false, isError = false) => {
  const color = isError ? '#ef4444' : isActive ? '#38bdf8' : '#22c55e';
  const pulseClass = isActive ? 'pulse-wave-active' : '';

  const html = `
    <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;">
      
      <!-- Station Name Tag - ONLY VISIBLE WHEN ACTIVE AND DELIVERING DATA -->
      ${isActive ? `
        <div style="
          background-color: rgba(15, 23, 42, 0.95);
          border: 1.5px solid ${color};
          color: #ffffff;
          font-weight: 800;
          font-size: 9.5px;
          font-family: system-ui, sans-serif;
          border-radius: 6px;
          padding: 3px 8px;
          white-space: nowrap;
          margin-bottom: 4px;
          box-shadow: 0 0 14px ${color}, 0 4px 10px rgba(0,0,0,0.9);
          display: flex;
          align-items: center;
          gap: 4px;
          animation: blinkFast 0.6s infinite alternate;
        ">
          <span style="color: ${color};">📡</span>
          <span>Estación ${nombreEstacion || 'SENAMHI'}</span>
        </div>
      ` : ''}

      <!-- Station Node Circle Icon -->
      <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
        ${isActive ? `<div class="${pulseClass}" style="position: absolute; inset: -10px; border-radius: 50%; border: 2px solid ${color}; background: rgba(56, 189, 248, 0.2);"></div>` : ''}
        <div style="
          width: 14px; height: 14px; border-radius: 50%;
          background-color: ${color};
          border: 2px solid #ffffff;
          box-shadow: 0 0 14px ${color};
        "></div>
      </div>

    </div>
  `;
  return createDivIcon(html, isActive ? [140, 50] : [28, 28], isActive ? [70, 40] : [14, 14]);
};

// Map FlyController to handle dynamic smooth pan & zoom transitions
const MapFlyController = ({ targetCoords, targetBounds, targetMaxZoom = 12, zoom = 11, forceFly = 0 }) => {
  const map = useMap();
  useEffect(() => {
    if (targetBounds) {
      map.flyToBounds(targetBounds, {
        duration: 0.8, // Faster sync with logs!
        padding: [60, 60],
        maxZoom: targetMaxZoom
      });
    } else if (targetCoords && targetCoords[0] && targetCoords[1]) {
      map.flyTo(targetCoords, zoom, {
        duration: 0.8,
        easeLinearity: 0.15
      });
    }
  }, [targetCoords, targetBounds, targetMaxZoom, zoom, forceFly, map]);
  return null;
};

const BASE = window.location.protocol + '//' + window.location.hostname + ':3001';

const SenamhiMapa = ({ socket, isBotRunning = false, logs = [], config = {} }) => {
  const [estaciones, setEstaciones] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dynamic extracted date range calculation
  const extractedDateRange = useMemo(() => {
    if (config?.f_ini) {
      const endStr = config?.f_fin ? config.f_fin.split(' ')[0] : new Date().toISOString().split('T')[0];
      return `${config.f_ini} ➔ ${endStr}`;
    }
    if (logs && logs.length > 0) {
      for (let i = logs.length - 1; i >= 0; i--) {
        const msg = typeof logs[i] === 'string' ? logs[i] : (logs[i]?.msg || logs[i]?.message || '');
        const match = msg.match(/(\d{4}-\d{2}-\d{2})\s*(?:a|hasta|->|➔)\s*(\d{4}-\d{2}-\d{2})/i);
        if (match) return `${match[1]} ➔ ${match[2]}`;
      }
    }
    const today = new Date().toISOString().split('T')[0];
    return `2026-01-01 ➔ ${today}`;
  }, [config, logs]);

  const [completedSedes, setCompletedSedes] = useState(new Set());
  const [activeDownloadSede, setActiveDownloadSede] = useState(null);
  const [activeStation, setActiveStation] = useState(null);
  const [activeBeam, setActiveBeam] = useState(null);
  const [activeStatus, setActiveStatus] = useState('Esperando inicio del bot...');
  const [isFallback, setIsFallback] = useState(false);
  const [flyTrigger, setFlyTrigger] = useState(0);
  const [targetMaxZoom, setTargetMaxZoom] = useState(12);

  const defaultCenter = [-9.19, -75.01]; // Peru Center
  const defaultZoom = 5;
  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const [mapBounds, setMapBounds] = useState(null);
  const [mapZoom, setMapZoom] = useState(defaultZoom);

  // Load Real SENAMHI Stations & Sedes Catalogue on Mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const resEst = await fetch(`${BASE}/api/senamhi/estaciones`);
        let estList = [];
        if (resEst.ok) {
          const jsonEst = await resEst.json();
          estList = jsonEst.estaciones || [];
        }

        const resSedes = await fetch(`${BASE}/api/senamhi/sedes`);
        let sedesList = [];
        if (resSedes.ok) {
          const jsonSedes = await resSedes.json();
          if (jsonSedes.data && Array.isArray(jsonSedes.data)) {
            sedesList = jsonSedes.data
              .filter(s => s.latitud !== null && s.longitud !== null)
              .map(s => {
                const tagStr = (s.tag || s.sede || '').toUpperCase();
                let format = 'SPSA';
                if (tagStr.includes('MK') || tagStr.includes('MAKRO')) format = 'Makro';
                else if (tagStr.includes('VIVANDA') || tagStr.includes('VV') || tagStr.includes('VIV')) format = 'Vivanda';
                else if (tagStr.includes('PV') || tagStr.includes('PLAZA VEA') || tagStr.includes('PVO') || tagStr.includes('PVH')) format = 'Plaza Vea';
                
                return {
                  ...s,
                  format: format,
                  lat: Number(s.latitud),
                  lng: Number(s.longitud)
                };
              });
          }
        }

        setEstaciones(estList);
        setSedes(sedesList);
      } catch (e) {
        console.error("Error loading map data:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Parse logs to trigger animations!
  useEffect(() => {
    if (!isBotRunning || logs.length === 0 || sedes.length === 0 || estaciones.length === 0) return;

    // Search backwards to find the current state!
    let foundSedeObj = null;
    let foundEstObj = null;
    let isFallbackWarning = false;

    for (let i = logs.length - 1; i >= 0; i--) {
      const log = logs[i];
      if (!log) continue;

      if (log.type === 'fase' && log.fase === 'fin' && log.estado === 'ok') {
        setActiveStatus('¡Descarga Completada con Éxito!');
        setActiveBeam(null);
        setMapBounds(null);
        setMapCenter(defaultCenter);
        setMapZoom(defaultZoom);
        setFlyTrigger(f => f + 1);
        playSuccessAudioAlert();
        return; // Bot finished, nothing else to do
      }

      if (log.type === 'info' || log.type === 'log') {
        const msg = log.message || '';
        
        // Find Fallback
        if (!foundEstObj && !foundSedeObj && msg.includes('Sin datos para')) {
          isFallbackWarning = true;
        }

        // Find Station
        if (!foundEstObj && !foundSedeObj) {
          const matchEst = msg.match(/estación más cercana:\s*(.+?)\s*\((\d+)\)/);
          if (matchEst) {
            foundEstObj = estaciones.find(e => String(e.codigo) === matchEst[2]);
          }
        }

        // Find Sede
        if (!foundSedeObj) {
          const matchSede = msg.match(/Sede:\s*(.+?)\s*\((.+?)\)/);
          if (matchSede) {
            foundSedeObj = sedes.find(s => String(s.ceco) === matchSede[2]);
          }
        }
      }

      if (foundSedeObj) break; // We found the most recent Sede context, stop searching backwards
    }

    if (foundSedeObj) {
      processStep(foundSedeObj, foundEstObj, isFallbackWarning);
    }
  }, [logs, isBotRunning, sedes, estaciones]);

  // Handle active status when bot is stopped manually
  useEffect(() => {
    if (!isBotRunning && activeDownloadSede) {
      setActiveStatus('Bot Detenido.');
      setActiveBeam(null);
      setMapCenter(defaultCenter);
      setMapZoom(defaultZoom);
      setFlyTrigger(f => f + 1);
    }
  }, [isBotRunning, activeDownloadSede]);

  // Helper to trigger animated radar download step
  const processStep = (sedeObj, stationObj = null, fallback = false) => {
    if (activeDownloadSede && activeDownloadSede.ceco !== sedeObj.ceco) {
      setCompletedSedes(prev => {
        const next = new Set(prev);
        next.add(activeDownloadSede.ceco);
        return next;
      });
    }

    setActiveDownloadSede(sedeObj);
    setIsFallback(fallback);

    // Find closest SENAMHI station if not provided
    let targetStation = stationObj;
    if (!targetStation && estaciones.length > 0) {
      let minDistance = Infinity;
      estaciones.forEach(est => {
        if (est.latitud === undefined || est.latitud === null || est.longitud === undefined || est.longitud === null) return;
        const d = Math.hypot(est.latitud - sedeObj.lat, est.longitud - sedeObj.lng);
        if (d < minDistance) {
          minDistance = d;
          targetStation = est;
        }
      });
    }

    setActiveStation(targetStation);

    if (targetStation && sedeObj) {
      setActiveBeam([
        [sedeObj.lat, sedeObj.lng],
        [targetStation.latitud, targetStation.longitud]
      ]);

      setActiveStatus(fallback ? `⚠️ Reintentando en Estación ${targetStation.nombre}...` : `📡 Absorbiendo datos: ${sedeObj.sede}...`);
      
      // Smart dynamic zoom calculation:
      // Lima, Callao, clustered cities (>=3 stores nearby), or close store-to-station distances get close-up zoom (14-15)
      const dpt = ((sedeObj.departamento || '') + ' ' + (sedeObj.provincia || '') + ' ' + (sedeObj.sede || '')).toUpperCase();
      const d = Math.hypot(sedeObj.lat - targetStation.latitud, sedeObj.lng - targetStation.longitud);
      
      const nearbySedesCount = sedes.filter(s =>
        Math.hypot(s.lat - sedeObj.lat, s.lng - sedeObj.lng) < 0.35
      ).length;

      let calcMaxZoom = 14;
      if (dpt.includes('LIMA') || dpt.includes('CALLAO') || nearbySedesCount >= 2 || d < 0.25) {
        calcMaxZoom = 16; // High precision zoom for Lima/Callao and multi-store clusters
      } else if (d < 0.5) {
        calcMaxZoom = 15;
      } else {
        calcMaxZoom = 14;
      }

      setTargetMaxZoom(calcMaxZoom);

      setMapBounds([
        [sedeObj.lat, sedeObj.lng],
        [targetStation.latitud, targetStation.longitud]
      ]);
      setFlyTrigger(f => f + 1);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '12px', overflow: 'hidden' }}>
      
      {/* SCANNER LINE ANIMATION (Norte a Sur) */}
      {isBotRunning && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: '3px',
          background: 'linear-gradient(90deg, transparent 0%, #38bdf8 50%, transparent 100%)',
          boxShadow: '0 0 15px rgba(56, 189, 248, 1), 0 5px 20px rgba(56, 189, 248, 0.5)',
          zIndex: 999, // Over map, under neon overlay
          animation: 'scanSweep 3s linear infinite'
        }} />
      )}

      {/* Dynamic CSS Animation Styles */}
      <style>{`
        @keyframes ripplePulse {
          0% { transform: scale(0.6); opacity: 1; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        .pulse-wave-active {
          animation: ripplePulse 1.6s infinite ease-out;
        }
        @keyframes scanSweep {
          0% { top: 0%; opacity: 0; }
          5% { opacity: 1; }
          95% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes absorbPulseBlue {
          0% { box-shadow: 0 0 8px rgba(0, 210, 255, 0.4); border-color: #38bdf8; }
          50% { box-shadow: 0 0 25px rgba(0, 210, 255, 1), 0 0 45px rgba(0, 210, 255, 0.9); border-color: #00d2ff; }
          100% { box-shadow: 0 0 8px rgba(0, 210, 255, 0.4); border-color: #38bdf8; }
        }
        @keyframes absorbPulseRed {
          0% { box-shadow: 0 0 8px rgba(255, 0, 85, 0.4); border-color: #f43f5e; }
          50% { box-shadow: 0 0 25px rgba(255, 0, 85, 1), 0 0 45px rgba(255, 0, 85, 0.9); border-color: #ff0055; }
          100% { box-shadow: 0 0 8px rgba(255, 0, 85, 0.4); border-color: #f43f5e; }
        }
        @keyframes absorbPulseGreen {
          0% { box-shadow: 0 0 8px rgba(0, 255, 102, 0.4); border-color: #4ade80; }
          50% { box-shadow: 0 0 25px rgba(0, 255, 102, 1), 0 0 45px rgba(0, 255, 102, 0.9); border-color: #00ff66; }
          100% { box-shadow: 0 0 8px rgba(0, 255, 102, 0.4); border-color: #4ade80; }
        }
        @keyframes absorbWave {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes blinkFast {
          0% { opacity: 1; }
          100% { opacity: 0.35; }
        }
        @keyframes flowBeam {
          0% { stroke-dashoffset: 32; }
          100% { stroke-dashoffset: 0; }
        }
        .animated-beam-line {
          animation: flowBeam 0.75s linear infinite;
        }
      `}</style>

      {/* MAIN MAP AREA */}
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: '100%', width: '100%', backgroundColor: '#020617', zIndex: 1 }}
      >
        {/* Smooth Camera Fly Controller with Dynamic Target Zoom */}
        <MapFlyController targetCoords={mapCenter} targetBounds={mapBounds} targetMaxZoom={targetMaxZoom} zoom={mapZoom} forceFly={flyTrigger} />

        {/* Dark Matter Map Tile Layer */}
        <TileLayer
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {/* RETAIL FORMAT STORE MARKERS */}
        {sedes.map((sede, idx) => {
          const isThisSedeActive = activeDownloadSede && activeDownloadSede.ceco === sede.ceco && isBotRunning;
          const isThisSedeCompleted = completedSedes.has(sede.ceco);
          return (
            <Marker
              key={`sede-${idx}-${sede.ceco}`}
              position={[sede.lat, sede.lng]}
              icon={getFormatBadgeIcon(sede.format, sede.sede, isThisSedeActive, isThisSedeCompleted)}
            >
              <Popup>
                <div style={{ color: '#000', fontFamily: 'system-ui', fontSize: '12px' }}>
                  <strong>{sede.sede}</strong><br />
                  <span>CECO: {sede.ceco}</span><br />
                  <span>Formato: <strong>{sede.format}</strong></span><br />
                  <span>Ubicación: {sede.departamento || 'Perú'}</span><br />
                  <span>Estado Sync: <strong>{isThisSedeCompleted ? '✅ OK' : isThisSedeActive ? '⚡ Absorbiendo' : 'Pendiente'}</strong></span>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* SENAMHI WEATHER STATIONS MARKERS */}
        {estaciones.map((est, idx) => {
          if (est.latitud === undefined || est.latitud === null || est.longitud === undefined || est.longitud === null) return null;
          const isThisStationActive = activeStation && activeStation.codigo === est.codigo && isBotRunning;
          return (
            <Marker
              key={`est-${idx}-${est.codigo}`}
              position={[est.latitud, est.longitud]}
              icon={getRadarStationIcon(est.nombre, isThisStationActive, isThisStationActive && isFallback)}
            >
              <Popup>
                <div style={{ color: '#000', fontFamily: 'system-ui', fontSize: '12px' }}>
                  <strong style={{ color: '#0284c7' }}>{est.nombre}</strong><br />
                  <span>Código: {est.codigo}</span><br />
                  <span>Tipo: {est.tipo || 'Meteorológica'}</span><br />
                  <span>Dpto: {est.departamento}</span>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* ACTIVE COVERAGE CIRCLE AROUND STATION */}
        {activeStation && isBotRunning && (
          <Circle
            center={[activeStation.latitud, activeStation.longitud]}
            radius={25000} // 25 km visual coverage radius
            pathOptions={{
              color: isFallback ? '#ef4444' : '#38bdf8',
              fillColor: isFallback ? '#ef4444' : '#38bdf8',
              fillOpacity: 0.15,
              dashArray: isFallback ? '6, 6' : undefined
            }}
          />
        )}

        {/* ANIMATED VECTOR RAY CONNECTING STORE TO STATION */}
        {activeBeam && isBotRunning && (
          <Polyline
            positions={activeBeam}
            pathOptions={{
              color: isFallback ? '#ef4444' : '#00d2ff',
              weight: 4,
              opacity: 0.95,
              dashArray: '10, 10',
              className: 'animated-beam-line'
            }}
          />
        )}
      </MapContainer>

      {/* OVERLAY RADAR LIVE TELEMETRY BAR - HORIZONTAL SINGLE LINE */}
      <div style={{
        position: 'absolute', top: '12px', right: '12px', zIndex: 1000,
        backgroundColor: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(56, 189, 248, 0.4)',
        borderRadius: '30px', padding: '0.45rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
        boxShadow: '0 10px 30px rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', whiteSpace: 'nowrap',
        maxWidth: 'calc(100% - 70px)', overflow: 'hidden'
      }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
          <Radio size={13} className={isBotRunning ? 'spin' : ''} /> RADAR SENAMHI
        </div>

        <span style={{
          fontSize: '0.65rem', fontWeight: 800, padding: '0.1rem 0.45rem', borderRadius: '4px',
          backgroundColor: isBotRunning ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
          color: isBotRunning ? '#4ade80' : '#f87171', flexShrink: 0
        }}>
          {isBotRunning ? 'ACTIVO' : 'INACTIVO'}
        </span>

        <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>

        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeDownloadSede && isBotRunning ? (
            <span>
              ⚡ <strong>Sede:</strong> {activeDownloadSede.sede} <span style={{ color: '#94a3b8', margin: '0 4px' }}>•</span> 📡 <strong>Estación:</strong> {activeStation?.nombre || 'Buscando...'}
            </span>
          ) : (
            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>{activeStatus}</span>
          )}
        </div>
      </div>

      {/* OVERLAY SEDE ACTUAL - BOTTOM LEFT (NEON GLOW & DATE RANGE) */}
      {isBotRunning && activeDownloadSede && (
        <div style={{
          position: 'absolute', bottom: '25px', left: '25px', zIndex: 1000,
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          border: '1px solid #38bdf8',
          borderRadius: '12px', padding: '0.75rem 1.2rem',
          backdropFilter: 'blur(8px)',
          animation: 'neonPulseMap 1.5s infinite alternate'
        }}>
          <div style={{ fontSize: '0.68rem', color: '#7dd3fc', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.2rem', letterSpacing: '0.05em' }}>
            📡 Extrayendo Clima SENAMHI
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff', textShadow: '0 0 10px rgba(255,255,255,0.5)' }}>
            {activeDownloadSede.sede}
          </div>
          <div style={{
            fontSize: '0.72rem', color: '#38bdf8', fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: '5px',
            marginTop: '5px', paddingTop: '5px',
            borderTop: '1px dashed rgba(255,255,255,0.15)'
          }}>
            <Calendar size={12} color="#38bdf8" /> <span>RANGO EXTRACCIÓN:</span> <span style={{ color: '#ffffff', fontWeight: 800 }}>{extractedDateRange}</span>
          </div>
        </div>
      )}

      {/* Custom Keyframes for neonPulseMap */}
      <style>{`
        @keyframes neonPulseMap {
          0% { box-shadow: 0 0 10px rgba(56, 189, 248, 0.3), inset 0 0 5px rgba(56, 189, 248, 0.1); border-color: rgba(56, 189, 248, 0.5); }
          100% { box-shadow: 0 0 25px rgba(56, 189, 248, 0.9), inset 0 0 15px rgba(56, 189, 248, 0.6); border-color: rgba(56, 189, 248, 1); }
        }
      `}</style>
    </div>
  );
};

export default SenamhiMapa;
