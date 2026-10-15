import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Satellite, CheckCircle, Wifi, Radio, Calendar } from 'lucide-react';

const BASE = window.location.protocol + '//' + window.location.hostname + ':3001';

// Mismo mapa satelital animado que usa el panel individual de Open-Meteo
// (MeteoMapa.jsx), pero parametrizado por `tipoFuente` para poder mostrar
// también el efecto cuando el bot activo es SENAMHI -el Bot Master alterna
// entre los dos segun cual este corriendo en la cascada.
const getFuenteVisual = (tipoFuente) => {
  if (tipoFuente === 'senamhi') {
    return { label: 'ESTACIÓN SENAMHI', emoji: '📡', color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.6)' };
  }
  return { label: 'SATELLITE OPEN-METEO', emoji: '🛰️', color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.6)' };
};

// Custom Leaflet HTML DivIcon Generator
const createDivIcon = (htmlContent, size = [120, 48], anchor = [60, 48]) => {
  return L.divIcon({
    html: htmlContent,
    className: 'custom-map-div-icon',
    iconSize: size,
    iconAnchor: anchor
  });
};

// Brand Colors matching SENAMHI exact specifications:
// 1. MAKRO (MK, Mk, mk, Makro) -> Neon Blue
// 2. VIVANDA (VV, Vv, vv, VIV, Viv, viv, Vivanda) -> Neon Green
// 3. PLAZA VEA (PV, pv, PVO, Pvh, PVH, PVS, PVE, PV..., Plaza Vea) -> Neon Red
const getBrandColors = (formatType, nombreSede) => {
  const text = (nombreSede + ' ' + (formatType || '')).toUpperCase();

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

  return {
    brand: 'SPSA',
    mainColor: '#38bdf8',
    borderColor: '#7dd3fc',
    glowColor: 'rgba(56, 189, 248, 0.9)',
    bgTag: 'rgba(15, 23, 42, 0.95)',
    pulseAnim: 'absorbPulseBlue'
  };
};

// Sede Pin "Globito" Badge Generator (Identical Parity to SENAMHI Mapa)
const getFormatBadgeIcon = (formatType, nombreSede, isActive = false, isCompleted = false) => {
  const colors = getBrandColors(formatType, nombreSede);

  // 1. IDLE STATE (Clean dark slate badge, NO NEON GLOW)
  let bgTagStyle = `background-color: rgba(15, 23, 42, 0.88); border: 1.5px solid ${colors.borderColor}; box-shadow: 0 3px 8px rgba(0,0,0,0.7);`;
  let pinFilterStyle = `filter: drop-shadow(0 3px 5px rgba(0,0,0,0.7));`;

  // 2. ACTIVE STATE (Ignite intense neon glow + absorbing pulse)
  if (isActive) {
    bgTagStyle = `background-color: ${colors.bgTag}; border: 2px solid #ffffff; animation: ${colors.pulseAnim} 0.8s infinite ease-in-out;`;
    pinFilterStyle = `filter: drop-shadow(0 0 14px ${colors.glowColor}) drop-shadow(0 4px 8px rgba(0,0,0,0.9));`;
  } else if (isCompleted) {
    // 3. COMPLETED STATE (Clean badge with green OK indicator)
    bgTagStyle = `background-color: rgba(15, 23, 42, 0.92); border: 1.5px solid ${colors.borderColor}; box-shadow: 0 3px 8px rgba(0,0,0,0.7);`;
  }

  const statusBadge = isActive
    ? `<span style="background: #f59e0b; color: #000; padding: 1px 5px; border-radius: 4px; font-size: 8px; font-weight: 900; margin-left: 4px; animation: blinkFast 0.5s infinite alternate;">📡 RECIBIENDO ONDAS...</span>`
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

      <!-- Globito / Pin Marker with absorbing wifi pulse -->
      <div style="position: relative; display: flex; align-items: center; justify-content: center;">
        ${isActive ? `
          <div style="
            position: absolute; width: 52px; height: 52px; border-radius: 50%;
            border: 2.5px dashed ${colors.mainColor};
            background: ${colors.glowColor};
            animation: absorbWave 1s infinite ease-out;
          "></div>
          <div style="
            position: absolute; width: 80px; height: 80px; border-radius: 50%;
            border: 1.5px solid ${colors.mainColor}; opacity: 0.7;
            animation: absorbWave 1.6s infinite ease-out;
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

// Animated Orbital Marker Generator with Concentric Wifi Radio Waves —
// texto/color/emoji cambian segun cual bot (SENAMHI o Open-Meteo) este activo.
const createFuenteIcon = (tipoFuente) => {
  const fv = getFuenteVisual(tipoFuente);
  const html = `
    <div style="position: relative; width: 64px; height: 64px; display: flex; align-items: center; justify-content: center;">

      <!-- Concentric Radiating Wifi/Radio Wave Rings -->
      <div style="
        position: absolute; width: 90px; height: 90px; border-radius: 50%;
        border: 2px dashed ${fv.color}; animation: orbitRotate 6s linear infinite; opacity: 0.8;
      "></div>

      <div style="
        position: absolute; width: 75px; height: 75px; border-radius: 50%;
        border: 2px solid ${fv.color}; opacity: 0.9;
        animation: wifiRadioPulse 1.1s infinite ease-out;
      "></div>

      <!-- Source Body -->
      <div style="
        width: 48px; height: 48px; border-radius: 50%;
        background: radial-gradient(circle, ${fv.glow} 0%, rgba(15,23,42,0.98) 100%);
        border: 2px solid ${fv.color};
        box-shadow: 0 0 35px ${fv.color}, 0 0 60px ${fv.glow};
        display: flex; align-items: center; justify-content: center;
        z-index: 2;
      ">
        <span style="font-size: 26px; filter: drop-shadow(0 0 10px ${fv.color});">${fv.emoji}</span>
      </div>

      <!-- Bottom Status Pill -->
      <div style="
        position: absolute; bottom: -24px; left: 50%; transform: translateX(-50%);
        background: ${fv.color}; color: #000; font-weight: 900; font-size: 9px;
        padding: 2px 8px; border-radius: 5px; white-space: nowrap;
        box-shadow: 0 0 14px ${fv.color}; letter-spacing: 0.05em; display: flex; align-items: center; gap: 4px;
        z-index: 3;
      ">
        <span>${fv.label}</span>
        <span style="animation: blinkFast 0.4s infinite alternate;">📡</span>
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'satellite-orbit-icon',
    iconSize: [64, 64],
    iconAnchor: [32, 32]
  });
};

// Fast Snappy Dynamic Camera FlyController (0.7s duration)
function MapFlyController({ center, targetZoom = 15 }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.flyTo(center, targetZoom, {
        duration: 0.7,
        easeLinearity: 0.4
      });
    }
  }, [center, targetZoom, map]);
  return null;
}

// Calculate Smart Close-Up Zoom Level based on Sede Density and Region
const getSmartZoomLevel = (sede, sedesList) => {
  if (!sede) return 14;
  const dep = (sede.departamento || '').toLowerCase();
  const prov = (sede.provincia || '').toLowerCase();
  const isLimaOrCallao = dep.includes('lima') || dep.includes('callao') || prov.includes('lima');

  // 1. Special High Close Zoom for Lima/Callao Metropolitan (Zoom 16.0)
  if (isLimaOrCallao) {
    return 16.0;
  }

  // 2. Count sedes in same province / department
  const countInRegion = sedesList.filter(s =>
    (s.provincia && s.provincia.toLowerCase() === prov) ||
    (s.departamento && s.departamento.toLowerCase() === dep)
  ).length;

  // 3. Deep Close Zoom for Provinces with > 2 stores (e.g. Trujillo, Arequipa, Piura, Chiclayo, Ica, Cusco - Zoom 15.0)
  if (countInRegion > 2) {
    return 15.0;
  }

  // 4. Default Close Zoom for isolated regional stores (Zoom 14.0)
  return 14.0;
};

// tipoFuente: 'senamhi' | 'meteo' | null -determina cual bot esta activo
// actualmente en la cascada. Cuando ninguno corre, el mapa queda en modo
// neutral (orbita central sobre Peru, sin efecto de transmision).
const MapaHibridoClimatico = ({ socket, isBotRunning = false, tipoFuente = 'meteo', logs = [], config = {} }) => {
  const mapRef = useRef(null);
  const [sedesList, setSedesList] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [completedCECOs, setCompletedCECOs] = useState(new Set());
  const [activeStatus, setActiveStatus] = useState('Sin actividad — esperando disparo del Bot Master');
  const [showProcessedList, setShowProcessedList] = useState(false);

  const fv = useMemo(() => getFuenteVisual(tipoFuente), [tipoFuente]);

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

  // 1. Fetch SPSA Sedes list from backend API
  useEffect(() => {
    const fetchSedes = async () => {
      try {
        const res = await fetch(`${BASE}/api/senamhi/sedes`);
        if (res.ok) {
          const json = await res.json();
          if (json.data && Array.isArray(json.data)) {
            const parsed = json.data
              .filter(s => s.latitud !== null && s.longitud !== null)
              .map(s => {
                const tagStr = (s.tag || s.sede || '').toUpperCase();
                let format = 'SPSA';
                if (tagStr.includes('MK') || tagStr.includes('MAKRO')) format = 'Makro';
                else if (tagStr.includes('VV') || tagStr.includes('VIV') || tagStr.includes('VIVANDA')) format = 'Vivanda';
                else if (tagStr.includes('PV') || tagStr.includes('PLAZA')) format = 'Plaza Vea';

                return {
                  id: s.id,
                  ceco: s.ceco || s.id,
                  nombre: s.tag || s.sede,
                  format: format,
                  lat: parseFloat(s.latitud),
                  lng: parseFloat(s.longitud),
                  departamento: s.departamento || 'LIMA',
                  provincia: s.provincia || 'LIMA'
                };
              });
            setSedesList(parsed);
          }
        }
      } catch (err) {
        console.warn("Could not fetch sedes for MapaHibridoClimatico:", err);
      }
    };
    fetchSedes();
  }, []);

  // 2. Sort sedes STRICTLY from NORTH to SOUTH (Latitud Descendente: Tumbes -> Piura -> Lima -> Tacna)
  const northToSouthSedes = useMemo(() => {
    return [...sedesList].sort((a, b) => b.lat - a.lat);
  }, [sedesList]);

  const [isCoolingApi, setIsCoolingApi] = useState(false);
  const [coolingMsg, setCoolingMsg] = useState('');

  // Reinicia el progreso visual cada vez que cambia la fuente activa (p.ej.
  // termina SENAMHI y arranca Open-Meteo dentro de la misma cascada), para
  // no arrastrar el indice/estado de la corrida anterior.
  useEffect(() => {
    setActiveIndex(0);
    setCompletedCECOs(new Set());
    setIsCoolingApi(false);
  }, [tipoFuente]);

  // 3. Socket log parsing & real-time log ingestion (ONLY MOVE WHEN REAL LOGS ARRIVE)
  useEffect(() => {
    if (!logs || logs.length === 0 || northToSouthSedes.length === 0) return;

    // Inspect recent logs
    const lastLogs = logs.slice(-20);
    let foundCooling = false;
    let coolingMessageText = '';

    for (let i = lastLogs.length - 1; i >= 0; i--) {
      const l = lastLogs[i];
      const msg = typeof l === 'string' ? l : (l?.msg || l?.message || '');
      if (!msg) continue;

      // Check for 429 Rate Limit / Cooling messages (aplica a ambas fuentes)
      if (msg.includes('429') || msg.toLowerCase().includes('límite api') || msg.toLowerCase().includes('enfriando')) {
        foundCooling = true;
        coolingMessageText = msg;
        break; // Most recent log is a cooling pause
      }

      // Check for explicit store match
      const foundIdx = northToSouthSedes.findIndex(s =>
        msg.toLowerCase().includes(s.nombre.toLowerCase()) ||
        (s.ceco && msg.includes(s.ceco))
      );
      if (foundIdx !== -1) {
        setActiveIndex(foundIdx);
        foundCooling = false;
        break;
      }

      // Match "Sedes procesadas: X/Y" or "Avance General: X/Y"
      const matchProgress = msg.match(/Sedes procesadas:\s*(\d+)\/(\d+)/i) || msg.match(/Avance General:\s*(\d+)\/(\d+)/i);
      if (matchProgress) {
        const currentCount = parseInt(matchProgress[1], 10);
        const totalCount = parseInt(matchProgress[2], 10);
        if (totalCount > 0) {
          const targetIdx = Math.min(
            Math.floor((currentCount / totalCount) * northToSouthSedes.length),
            northToSouthSedes.length - 1
          );
          setActiveIndex(targetIdx);
          foundCooling = false;
          break;
        }
      }
    }

    setIsCoolingApi(foundCooling);
    if (foundCooling) {
      setCoolingMsg(coolingMessageText);
    }
  }, [logs, northToSouthSedes]);

  // Current active target Sede (only present when bot is running)
  const currentTargetSede = useMemo(() => {
    if (!isBotRunning || northToSouthSedes.length === 0) return null;
    return northToSouthSedes[activeIndex] || northToSouthSedes[0];
  }, [isBotRunning, northToSouthSedes, activeIndex]);

  // Dynamic High Close-Up Zoom Level
  const calculatedZoom = useMemo(() => {
    if (!currentTargetSede) return 6;
    return getSmartZoomLevel(currentTargetSede, northToSouthSedes);
  }, [currentTargetSede, northToSouthSedes]);

  // Source position dynamically scaled to ALWAYS stay in top-left map view frame when active,
  // or neutral orbit over central Peru when stopped
  const fuentePos = useMemo(() => {
    if (!isBotRunning || !currentTargetSede) return [-9.19, -75.015];
    const zoomFactor = Math.pow(2, 16 - calculatedZoom);
    const latOffset = 0.003 * zoomFactor;
    const lngOffset = -0.003 * zoomFactor;
    return [currentTargetSede.lat + latOffset, currentTargetSede.lng + lngOffset];
  }, [isBotRunning, currentTargetSede, calculatedZoom]);

  // Instant In-Sync Wifi Radio Wave Beam Coordinates from Source to Sede Globito
  const wifiWaveBeamPos = useMemo(() => {
    if (!isBotRunning || !currentTargetSede) return null;
    return [fuentePos, [currentTargetSede.lat, currentTargetSede.lng]];
  }, [isBotRunning, currentTargetSede, fuentePos]);

  // Update completed sedes set as the source travels North to South
  useEffect(() => {
    if (currentTargetSede && isBotRunning) {
      setCompletedCECOs(prev => {
        const next = new Set(prev);
        for (let i = 0; i <= activeIndex; i++) {
          if (northToSouthSedes[i]) {
            next.add(northToSouthSedes[i].ceco);
          }
        }
        return next;
      });

      setActiveStatus(`${fv.emoji} Transmitiendo Ondas (${activeIndex + 1}/${northToSouthSedes.length}): ${currentTargetSede.nombre}`);
    } else if (!isBotRunning) {
      setActiveStatus('Sin actividad — esperando disparo del Bot Master (Mapa Completo Perú)');
    }
  }, [currentTargetSede, activeIndex, northToSouthSedes, isBotRunning, fv.emoji]);

  const activeColors = useMemo(() => {
    if (!currentTargetSede) return getBrandColors('SPSA', '');
    return getBrandColors(currentTargetSede.format, currentTargetSede.nombre);
  }, [currentTargetSede]);

  const completedList = useMemo(() => {
    return northToSouthSedes.filter(s => completedCECOs.has(s.ceco));
  }, [northToSouthSedes, completedCECOs]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '16px', overflow: 'hidden' }}>
      {/* Dynamic Keyframe Animations for High Visibility Discontinuous Wifi Waves */}
      <style>{`
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
        @keyframes mapScannerSweep {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes dashedLineFlow {
          0% { stroke-dashoffset: 44; }
          100% { stroke-dashoffset: 0; }
        }
        .animated-dashed-wifi-beam {
          animation: dashedLineFlow 0.6s linear infinite !important;
        }
        .animated-dashed-wifi-core {
          animation: dashedLineFlow 0.4s linear infinite !important;
        }
      `}</style>

      {/* MAP SCANNER RADAR LASER BEAM (TOP TO BOTTOM MAP SWEEP) — ONLY WHEN BOT IS RUNNING */}
      {isBotRunning && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
          background: `linear-gradient(90deg, transparent, ${fv.color}, ${fv.color}, ${fv.color}, transparent)`,
          boxShadow: `0 0 15px ${fv.color}, 0 0 30px ${fv.color}`,
          zIndex: 999,
          pointerEvents: 'none',
          animation: 'mapScannerSweep 4s linear infinite'
        }} />
      )}

      <MapContainer
        center={[-9.19, -75.015]}
        zoom={6}
        style={{ width: '100%', height: '100%', background: '#020617' }}
        ref={mapRef}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a> Bot Master Climático'
          maxZoom={19}
        />

        {/* Dynamic Camera FlyController: Flies to store when running, returns to full Peru map when stopped */}
        <MapFlyController
          center={isBotRunning && currentTargetSede ? [currentTargetSede.lat, currentTargetSede.lng] : [-9.19, -75.015]}
          targetZoom={isBotRunning && currentTargetSede ? calculatedZoom : 6}
        />

        {/* SEDES SPSA MARKERS WITH EXACT SENAMHI GLOBITO PINS */}
        {northToSouthSedes.map((sede, idx) => {
          const isActive = isBotRunning && currentTargetSede?.ceco === sede.ceco;
          const isDone = completedCECOs.has(sede.ceco);

          return (
            <Marker
              key={sede.id || sede.ceco || sede.nombre}
              position={[sede.lat, sede.lng]}
              icon={getFormatBadgeIcon(sede.format, sede.nombre, isActive, isDone)}
            >
              <Popup>
                <div style={{ color: '#000', fontFamily: 'system-ui', fontSize: '12px' }}>
                  <strong>{sede.nombre}</strong><br />
                  Orden Norte-Sur: #{idx + 1}<br />
                  Formato: <strong>{sede.format}</strong><br />
                  Ubicación: {sede.departamento} - {sede.provincia}<br />
                  Coordenadas: {sede.lat}, {sede.lng}<br />
                  Estado Sync: <strong>{isDone ? '✅ OK' : isActive ? '📡 Recibiendo Ondas' : 'Pendiente'}</strong>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* ORBITAL SOURCE MARKER - PERMANENTLY VISIBLE IN VIEWPORT FRAME */}
        <Marker position={fuentePos} icon={createFuenteIcon(tipoFuente)}>
          <Popup>
            <div style={{ color: '#000', fontSize: '12px' }}>
              <strong>{fv.emoji} {fv.label}</strong><br />
              Estado: {isBotRunning ? 'En transmisión' : 'Órbita neutral'}<br />
              Sede Objetivo: {isBotRunning ? (currentTargetSede?.nombre || 'En órbita') : 'Sin objetivo (Cascada detenida)'}
            </div>
          </Popup>
        </Marker>

        {/* HIGH-SPEED DISCONTINUOUS DASHED RADIO WAVE BEAM FROM SOURCE TO GLOBITO */}
        {isBotRunning && wifiWaveBeamPos && (
          <>
            <Polyline
              positions={wifiWaveBeamPos}
              pathOptions={{
                color: activeColors.mainColor,
                weight: 7,
                opacity: 0.95,
                dashArray: '8, 14',
                className: 'animated-dashed-wifi-beam'
              }}
            />
            <Polyline
              positions={wifiWaveBeamPos}
              pathOptions={{
                color: '#ffffff',
                weight: 3,
                opacity: 1,
                dashArray: '4, 8',
                className: 'animated-dashed-wifi-core'
              }}
            />
          </>
        )}
      </MapContainer>

      {/* OVERLAY TELEMETRY BAR - SINGLE HORIZONTAL LINE */}
      <div style={{
        position: 'absolute', top: '12px', right: '12px', zIndex: 1000,
        backgroundColor: 'rgba(15, 23, 42, 0.85)', border: `1px solid ${isCoolingApi ? 'rgba(245, 158, 11, 0.6)' : isBotRunning ? `${fv.color}66` : 'rgba(239, 68, 68, 0.4)'}`,
        borderRadius: '30px', padding: '0.45rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
        boxShadow: '0 10px 30px rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', whiteSpace: 'nowrap',
        maxWidth: 'calc(100% - 70px)', overflow: 'hidden'
      }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: isCoolingApi ? '#fbbf24' : fv.color, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
          {tipoFuente === 'senamhi'
            ? <Radio size={14} className={isBotRunning && !isCoolingApi ? "spin" : ""} color={isCoolingApi ? '#fbbf24' : fv.color} />
            : <Satellite size={14} className={isBotRunning && !isCoolingApi ? "spin" : ""} color={isCoolingApi ? '#fbbf24' : fv.color} />
          } {fv.label}
        </div>

        <span style={{
          fontSize: '0.65rem', fontWeight: 800, padding: '0.1rem 0.45rem', borderRadius: '4px',
          backgroundColor: isCoolingApi ? 'rgba(245, 158, 11, 0.2)' : isBotRunning ? `${fv.color}33` : 'rgba(239, 68, 68, 0.2)',
          color: isCoolingApi ? '#fbbf24' : isBotRunning ? fv.color : '#f87171', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px'
        }}>
          <Wifi size={11} /> {isCoolingApi ? '⚠️ LÍMITE API (429) — ENFRIANDO' : isBotRunning ? 'ONDAS EN TRANSMISIÓN' : 'CASCADA DETENIDA'}
        </span>

        <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>

        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {isCoolingApi ? (
            <span style={{ color: '#fbbf24', fontWeight: 700 }}>
              ⚠️ Pausa de Enfriamiento por Límite de Consultas API (429)
            </span>
          ) : isBotRunning && currentTargetSede ? (
            <span>
              ⚡ <strong>Sede ({activeIndex + 1}/{northToSouthSedes.length}):</strong> {currentTargetSede.nombre} <span style={{ color: '#94a3b8', margin: '0 4px' }}>•</span> 📡 <strong>Zoom:</strong> {calculatedZoom}x <span style={{ color: '#94a3b8', margin: '0 4px' }}>•</span> 📍 Lat/Lon: {currentTargetSede.lat}, {currentTargetSede.lng}
            </span>
          ) : (
            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>
              {activeStatus}
            </span>
          )}
        </div>
      </div>

      {/* BOTTOM LEFT FLOATING BADGE FOR ACTIVE SEDE & DATE RANGE */}
      {isBotRunning && currentTargetSede && (
        <div style={{
          position: 'absolute', bottom: '25px', left: '25px', zIndex: 1000,
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          border: `1px solid ${isCoolingApi ? '#f59e0b' : activeColors.mainColor}`,
          borderRadius: '12px', padding: '0.75rem 1.2rem',
          backdropFilter: 'blur(8px)',
          boxShadow: isCoolingApi ? '0 0 25px rgba(245, 158, 11, 0.4)' : `0 0 25px ${activeColors.glowColor}`
        }}>
          <div style={{ fontSize: '0.68rem', color: isCoolingApi ? '#fbbf24' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Radio size={12} color={isCoolingApi ? '#f59e0b' : activeColors.mainColor} className={isCoolingApi ? '' : 'spin'} />
            {isCoolingApi ? '⚠️ ENFRIANDO POR LÍMITE DE API' : `TRANSMITIENDO ONDAS (NORTE A SUR #${activeIndex + 1}) — ${fv.label}`}
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: isCoolingApi ? '#fef08a' : activeColors.mainColor, margin: '2px 0' }}>
            {currentTargetSede.nombre} <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>({currentTargetSede.provincia})</span>
          </div>
          {isCoolingApi && (
            <div style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 600, marginTop: '2px' }}>
              {coolingMsg || 'Pausa de enfriamiento activa...'}
            </div>
          )}
          <div style={{
            fontSize: '0.72rem', color: '#38bdf8', fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: '5px',
            marginTop: '5px', paddingTop: '5px',
            borderTop: '1px dashed rgba(255,255,255,0.15)'
          }}>
            <Calendar size={12} color="#06b6d4" /> <span>RANGO EXTRACCIÓN:</span> <span style={{ color: '#ffffff', fontWeight: 800 }}>{extractedDateRange}</span>
          </div>
        </div>
      )}

      {/* BOTTOM RIGHT PROCESSED SEDES LIVE TRACKER & EXPANDABLE DRAWER */}
      <div style={{
        position: 'absolute', bottom: '25px', right: '25px', zIndex: 1000,
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        border: '1px solid rgba(34, 197, 94, 0.4)',
        borderRadius: '12px', padding: '0.6rem 1rem',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
        display: 'flex', flexDirection: 'column', gap: '0.4rem',
        maxWidth: '320px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#22c55e', fontSize: '0.78rem', fontWeight: 800 }}>
            <CheckCircle size={14} /> SEDES PROCESADAS: {completedList.length} / {northToSouthSedes.length}
          </div>
          <button
            onClick={() => setShowProcessedList(!showProcessedList)}
            style={{
              background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)',
              color: '#4ade80', fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem',
              borderRadius: '4px', cursor: 'pointer'
            }}
          >
            {showProcessedList ? 'Ocultar' : 'Ver Lista'}
          </button>
        </div>

        {showProcessedList && (
          <div style={{
            maxHeight: '180px', overflowY: 'auto', borderTop: '1px solid rgba(255,255,255,0.1)',
            paddingTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.25rem'
          }}>
            {completedList.length === 0 ? (
              <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontStyle: 'italic' }}>Aún no se han procesado sedes</span>
            ) : (
              completedList.map((s, i) => (
                <div key={s.ceco || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#fff' }}>
                  <span>{i + 1}. {s.nombre}</span>
                  <span style={{ color: '#22c55e', fontWeight: 800, fontSize: '0.7rem' }}>✓ OK</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MapaHibridoClimatico;
