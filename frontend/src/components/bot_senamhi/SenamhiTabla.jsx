import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Download, RefreshCw, Search, Filter, X, Info } from 'lucide-react';

const BASE = window.location.protocol + '//' + window.location.hostname + ':3001';

const SenamhiTabla = () => {
  const [data, setData] = useState([]);
  const [metrics, setMetrics] = useState({ totalRows: 0, filteredRows: 0, minDate: '-', maxDate: '-', uniqueEstaciones: 0, uniqueSedesCount: 0, lastSync: '-', departments: ['Todos'] });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('Todos');
  const [tipo, setTipo] = useState('Todos');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const tableRef = useRef(null);
  const LIMIT = 50;

  const fetchData = useCallback(async (isAppend = false, overridePage = null) => {
    if (loading) return;
    setLoading(true);
    const p = overridePage !== null ? overridePage : (isAppend ? page : 1);
    const params = new URLSearchParams({ page: p, limit: LIMIT, sortField: 'fecha', sortOrder: 'desc' });
    if (search) params.set('search', search);
    if (dept && dept !== 'Todos') params.set('dept', dept);
    if (tipo && tipo !== 'Todos') params.set('tipo', tipo);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    try {
      const res = await fetch(`${BASE}/api/senamhi?${params.toString()}`);
      const json = await res.json();
      setMetrics({
        totalRows: json.totalRows || 0,
        filteredRows: json.filteredRows || 0,
        minDate: json.minDate || '-',
        maxDate: json.maxDate || '-',
        uniqueEstaciones: json.uniqueEstaciones || 0,
        uniqueSedesCount: json.uniqueSedesCount || 0,
        lastSync: json.lastSync || '-',
        departments: json.departments || ['Todos']
      });
      const newData = json.data || [];
      if (isAppend) {
        setData(prev => [...prev, ...newData]);
      } else {
        setData(newData);
        setPage(1);
      }
      setHasMore(newData.length === LIMIT);
      if (isAppend) setPage(p + 1);
    } catch (e) {
      console.error('Error fetching SENAMHI data:', e);
    } finally {
      setLoading(false);
    }
  }, [search, dept, tipo, startDate, endDate, page, loading]);

  useEffect(() => { fetchData(false, 1); }, [search, dept, tipo, startDate, endDate]);

  const handleScroll = useCallback(() => {
    if (!tableRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = tableRef.current;
    if (scrollHeight - scrollTop - clientHeight < 120 && hasMore && !loading) {
      fetchData(true);
    }
  }, [hasMore, loading, fetchData]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const syncFromSupabase = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/senamhi?sync=true&page=1&limit=${LIMIT}`);
      const json = await res.json();
      setMetrics({ totalRows: json.totalRows || 0, filteredRows: json.filteredRows || 0, minDate: json.minDate || '-', maxDate: json.maxDate || '-', uniqueEstaciones: json.uniqueEstaciones || 0, uniqueSedesCount: json.uniqueSedesCount || 0, lastSync: json.lastSync || '-', departments: json.departments || ['Todos'] });
      setData(json.data || []);
      setPage(2);
      setHasMore((json.data || []).length === LIMIT);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const exportExcel = () => {
    const params = new URLSearchParams({ format: 'excel' });
    if (search) params.set('search', search);
    if (dept && dept !== 'Todos') params.set('dept', dept);
    if (tipo && tipo !== 'Todos') params.set('tipo', tipo);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    window.open(`${BASE}/api/senamhi?${params.toString()}`, '_blank');
  };

  const COLS = [
    { key: '#', label: '#', width: 45, render: (_, i) => i + 1 },
    { key: 'fecha', label: 'Fecha', width: 95 },
    { key: 'codigo_senamhi', label: 'Cód. SENAMHI', width: 110 },
    { key: 'nombre_estacion', label: 'Estación', width: 180 },
    { key: 'tipo_estacion', label: 'Tipo', width: 100, render: v => v === 'Hidrologica' ? '🌊 Hidro' : '🌡️ Meteo' },
    { key: 'sede_spsa', label: 'Sede SPSA', width: 160 },
    { key: 'ceco', label: 'CECO', width: 80 },
    { key: 'distancia_km', label: 'Dist. (km)', width: 80, render: v => v != null ? Number(v).toFixed(1) : '-' },
    { key: 'departamento', label: 'Dpto.', width: 110 },
    { key: 'precipitacion_mm', label: 'Prec. (mm)', width: 90, render: v => v != null ? Number(v).toFixed(1) : '-' },
    { key: 'temp_max', label: 'T.Max (°C)', width: 90, render: v => v != null ? Number(v).toFixed(1) : '-' },
    { key: 'temp_min', label: 'T.Min (°C)', width: 90, render: v => v != null ? Number(v).toFixed(1) : '-' },
    { key: 'humedad_pct', label: 'Hum. (%)', width: 80, render: v => v != null ? Number(v).toFixed(1) : '-' },
    { key: 'viento_kmh', label: 'Viento (km/h)', width: 100, render: v => v != null ? Number(v).toFixed(1) : '-' },
    { key: 'nivel_rio_m', label: 'Nivel Río (m)', width: 100, render: v => v != null ? Number(v).toFixed(2) : '-' },
    { key: 'caudal_m3s', label: 'Caudal (m³/s)', width: 105, render: v => v != null ? Number(v).toFixed(3) : '-' },
    { key: 'calidad_dato', label: 'Calidad', width: 80, render: v => v === 'OK' ? <span style={{ color: '#22c55e' }}>✅ OK</span> : <span style={{ color: '#e4a02b' }}>⚠️ {v}</span> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem' }}>

      {/* Metrics Header */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', flexShrink: 0 }}>
        {[
          { label: 'Total Filas', value: metrics.totalRows.toLocaleString(), color: '#3b82f6' },
          { label: 'Estaciones únicas', value: metrics.uniqueEstaciones, color: '#8b5cf6' },
          { label: 'Sedes con cobertura', value: metrics.uniqueSedesCount, color: '#22c55e' },
          { label: 'Desde', value: metrics.minDate, color: '#aaa' },
          { label: 'Hasta', value: metrics.maxDate, color: '#aaa' },
          { label: 'Último Sync', value: metrics.lastSync, color: '#e4a02b' },
        ].map(m => (
          <div key={m.label} className="panel" style={{ padding: '0.6rem 1rem', minWidth: '120px' }}>
            <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '2px' }}>{m.label}</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: m.color, fontFamily: 'monospace' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '0.6rem', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#555' }} />
          <input className="input-field" placeholder="Buscar sede, CECO, estación..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '32px', width: '100%' }} />
        </div>
        <select className="input-field" value={dept} onChange={e => setDept(e.target.value)} style={{ minWidth: '130px' }}>
          {metrics.departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="input-field" value={tipo} onChange={e => setTipo(e.target.value)} style={{ minWidth: '130px' }}>
          {['Todos', 'meteorologica', 'hidrologica'].map(t => <option key={t} value={t}>{t === 'Todos' ? 'Todos' : t === 'meteorologica' ? '🌡️ Meteorológica' : '🌊 Hidrológica'}</option>)}
        </select>
        <input type="date" className="input-field" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ minWidth: '130px' }} />
        <input type="date" className="input-field" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ minWidth: '130px' }} />
        {(search || dept !== 'Todos' || tipo !== 'Todos' || startDate || endDate) && (
          <button className="btn-secondary" onClick={() => { setSearch(''); setDept('Todos'); setTipo('Todos'); setStartDate(''); setEndDate(''); }} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <X size={14} /> Limpiar
          </button>
        )}
        <button className="btn-secondary" onClick={syncFromSupabase} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <RefreshCw size={14} className={loading ? 'spinning' : ''} /> Sincronizar
        </button>
        <button className="btn-primary" onClick={exportExcel} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#16a34a' }}>
          <Download size={14} /> Exportar Excel
        </button>
      </div>

      <div style={{ fontSize: '0.8rem', color: '#666', flexShrink: 0 }}>
        Mostrando <strong style={{ color: '#ccc' }}>{data.length.toLocaleString()}</strong> de <strong style={{ color: '#ccc' }}>{metrics.filteredRows.toLocaleString()}</strong> registros filtrados
      </div>

      {/* Table */}
      <div ref={tableRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px' }}>
        <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#111' }}>
            <tr>
              {COLS.map(c => (
                <th key={c.key} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.08)', minWidth: c.width }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && !loading ? (
              <tr><td colSpan={COLS.length} style={{ textAlign: 'center', padding: '3rem', color: '#444' }}>
                Sin datos — ejecuta el bot SENAMHI primero o sincroniza desde Supabase.
              </td></tr>
            ) : (
              data.map((row, rowIdx) => (
                <tr key={rowIdx} style={{ backgroundColor: rowIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.07)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = rowIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'}
                >
                  {COLS.map(c => (
                    <td key={c.key} style={{ padding: '8px 12px', fontSize: '0.82rem', color: '#ccc', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap', minWidth: c.width }}>
                      {c.render ? c.render(row[c.key], rowIdx) : (row[c.key] ?? '-')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {loading && (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: '#3b82f6', fontSize: '0.85rem' }}>
            <RefreshCw size={16} className="spinning" style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            Cargando más datos...
          </div>
        )}
        {!hasMore && data.length > 0 && (
          <div style={{ textAlign: 'center', padding: '1rem', color: '#555', fontSize: '0.8rem' }}>
            ✅ Todos los registros cargados ({data.length.toLocaleString()})
          </div>
        )}
      </div>
    </div>
  );
};

export default SenamhiTabla;
