import React, { useState, useEffect } from 'react';
import { Search, ArrowUpDown, Download, Link2, AlertTriangle, CheckCircle, RefreshCw, Database, Activity } from 'lucide-react';

const ClimaTabla = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isFallback, setIsFallback] = useState(false);
  
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedDept, setSelectedDept] = useState('Todos');
  const [selectedSource, setSelectedSource] = useState('Todos');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [firstLoadedPage, setFirstLoadedPage] = useState(1);
  const [inputPageVal, setInputPageVal] = useState('1');
  const [rowsPerPage, setRowsPerPage] = useState(100);
  
  // Sort State
  const [sortField, setSortField] = useState('fecha');
  const [sortOrder, setSortOrder] = useState('desc');

  // Server-computed metrics & metadata
  const [serverTotalRows, setServerTotalRows] = useState(0);
  const [serverFilteredRows, setServerFilteredRows] = useState(0);
  const [serverDepartments, setServerDepartments] = useState(['Todos']);
  const [serverMinDate, setServerMinDate] = useState('-');
  const [serverMaxDate, setServerMaxDate] = useState('-');
  const [serverUniqueSedesCount, setServerUniqueSedesCount] = useState(0);
  const [serverLastSync, setServerLastSync] = useState('-');
  
  // Copy Feedback state
  const [copiedLink, setCopiedLink] = useState('');
  
  // Help Modal state
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Supabase Info Modal state
  const [showSupabaseInfoModal, setShowSupabaseInfoModal] = useState(false);

  // Audit Modal state
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditData, setAuditData] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState(null);
  const [auditSelectedYear, setAuditSelectedYear] = useState(null);

  const fetchAudit = async () => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await fetch(`${backendBaseUrl}/api/clima/auditoria`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setAuditData(json);
      if (json.gapsByYear && json.gapsByYear.length > 0) {
        setAuditSelectedYear(json.gapsByYear[json.gapsByYear.length - 1].year);
      }
    } catch (err) {
      setAuditError(err.message);
    } finally {
      setAuditLoading(false);
    }
  };

  const openAuditModal = () => {
    setShowAuditModal(true);
    if (!auditData) fetchAudit();
  };

  // Fetch API URL
  const backendBaseUrl = window.location.origin.replace('5173', '3001'); // Resolve port dynamically
  const apiEndpoint = `${backendBaseUrl}/api/clima`;

  const fetchData = async (pageToFetch = 1, isAppend = false, isSync = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: pageToFetch,
        limit: rowsPerPage,
        search: searchTerm,
        dept: selectedDept,
        startDate,
        endDate,
        source: selectedSource,
        sortField,
        sortOrder
      });
      if (isSync) {
        params.append('sync', 'true');
      }

      const response = await fetch(`${apiEndpoint}?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Error en el servidor: ${response.status} ${response.statusText}`);
      }
      const isCache = response.headers.get('X-Cache-Fallback') === 'true';
      setIsFallback(isCache);

      const json = await response.json();
      const newRows = json.data || [];

      if (isAppend) {
        setData(prev => [...prev, ...newRows]);
      } else {
        setData(newRows);
        setFirstLoadedPage(pageToFetch);
      }

      setCurrentPage(pageToFetch);
      setServerTotalRows(json.totalRows || 0);
      setServerFilteredRows(json.filteredRows || 0);
      
      // Keep "Todos" and update list of departments from server
      if (json.departments && json.departments.length > 0) {
        setServerDepartments(json.departments);
      }
      
      setServerMinDate(json.minDate || '-');
      setServerMaxDate(json.maxDate || '-');
      setServerUniqueSedesCount(json.uniqueSedesCount || 0);
      setServerLastSync(json.lastSync || '-');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch initial page whenever filters or sorting changes (overwrite, page 1)
  useEffect(() => {
    fetchData(1, false);
  }, [searchTerm, startDate, endDate, selectedDept, selectedSource, rowsPerPage, sortField, sortOrder]);

  // Scroll event handler for infinite scrolling
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    // When scroll reaches within 100px of bottom, and we are not currently loading, and there are more rows to load
    if (scrollHeight - scrollTop - clientHeight < 100) {
      if (!loading && data.length < serverFilteredRows) {
        const nextPage = currentPage + 1;
        fetchData(nextPage, true);
      }
    }
  };

  // Download URL helper for export button and share links
  const getDownloadUrl = (format = 'csv') => {
    const params = new URLSearchParams({
      format,
      search: searchTerm,
      dept: selectedDept,
      startDate,
      endDate,
      source: selectedSource,
      sortField,
      sortOrder
    });
    // Add bypass for default limits if no filters are active
    if (!searchTerm && selectedDept === 'Todos' && !startDate && !endDate) {
      params.append('all', 'true');
    }
    return `${apiEndpoint}?${params.toString()}`;
  };

  // Local variable mappings to keep JSX untouched
  const minDate = serverMinDate;
  const maxDate = serverMaxDate;
  const uniqueSedesCount = serverUniqueSedesCount;
  const lastSync = serverLastSync;
  const totalRows = serverTotalRows;
  const departments = serverDepartments;

  // Sorting Handler
  const handleSort = (field) => {
    const order = (sortField === field && sortOrder === 'asc') ? 'desc' : 'asc';
    setSortField(field);
    setSortOrder(order);
  };

  // Pagination calculation
  const totalPages = Math.ceil(serverFilteredRows / rowsPerPage) || 1;
  const startIndex = (firstLoadedPage - 1) * rowsPerPage;
  const paginatedData = data;

  const currentMinDateInView = data.length > 0 
    ? data.map(r => r.fecha).reduce((min, d) => d < min ? d : min, data[0].fecha)
    : '-';
  const currentMaxDateInView = data.length > 0
    ? data.map(r => r.fecha).reduce((max, d) => d > max ? d : max, data[0].fecha)
    : '-';

  const handleCopyLink = (url, type) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(type);
    setTimeout(() => setCopiedLink(''), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.25rem', paddingBottom: '2rem' }}>
      
      {/* Unified Top Controls, Filters & Metrics Bar (Single Row) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        padding: '0.6rem 1rem',
        borderRadius: '8px',
        backgroundColor: isFallback ? 'rgba(217, 119, 6, 0.1)' : 'rgba(16, 185, 129, 0.08)',
        border: `1px solid ${isFallback ? 'rgba(217, 119, 6, 0.25)' : 'rgba(16, 185, 129, 0.2)'}`,
      }}>
        {/* 1. Status & Sync */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div 
            onClick={() => setShowSupabaseInfoModal(true)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
              backgroundColor: isFallback ? 'rgba(217, 119, 6, 0.08)' : 'rgba(16, 185, 129, 0.05)',
              border: `1px solid ${isFallback ? 'rgba(217, 119, 6, 0.15)' : 'rgba(16, 185, 129, 0.1)'}`,
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isFallback ? 'rgba(217, 119, 6, 0.15)' : 'rgba(16, 185, 129, 0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isFallback ? 'rgba(217, 119, 6, 0.08)' : 'rgba(16, 185, 129, 0.05)'}
            title="Ver información detallada de la base de datos"
          >
            <Database size={14} color={isFallback ? '#d97706' : '#10b981'} />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isFallback ? '#fbbf24' : '#34d399' }}>
              {isFallback ? 'Supabase Offline' : 'Supabase Live'}
            </span>
          </div>
          
          <div style={{ width: '1px', height: '14px', backgroundColor: '#30363d' }}></div>
          
          <button 
            onClick={() => fetchData(true)} 
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              opacity: loading ? 0.5 : 1,
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.color = '#fff'}
            onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
          >
            <RefreshCw size={12} className={loading ? 'spin' : ''} />
            Sincronizar
          </button>
        </div>

        {/* 2. Filters (Search, Dropdown, Dates) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1, minWidth: '320px' }}>
          {/* Global Search */}
          <div style={{ position: 'relative', width: '160px' }}>
            <Search size={12} color="#8b949e" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.3rem 0.3rem 0.3rem 1.8rem',
                fontSize: '0.75rem',
                borderRadius: '4px',
                border: '1px solid #30363d',
                backgroundColor: '#0d1117',
                color: '#fff'
              }}
            />
          </div>

          {/* Dept Dropdown */}
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            style={{
              padding: '0.3rem',
              fontSize: '0.75rem',
              borderRadius: '4px',
              border: '1px solid #30363d',
              backgroundColor: '#0d1117',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            {departments.map(d => <option key={d} value={d}>{d === 'Todos' ? 'Región: Todas' : d}</option>)}
          </select>
          
          {/* Source Toggle Group */}
          <div style={{
            display: 'flex',
            borderRadius: '4px',
            backgroundColor: '#0d1117',
            border: '1px solid #30363d',
            padding: '2px',
            gap: '2px'
          }}>
            {[
              { id: 'Todos', label: 'Todos' },
              { id: 'SENAMHI', label: 'SENAMHI' },
              { id: 'METEO', label: 'Meteo' }
            ].map(src => {
              const active = selectedSource === src.id;
              return (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => setSelectedSource(src.id)}
                  style={{
                    padding: '3px 8px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    borderRadius: '3px',
                    border: 'none',
                    backgroundColor: active ? '#21262d' : 'transparent',
                    color: active ? '#58a6ff' : '#8b949e',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.color = '#fff';
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.color = '#8b949e';
                  }}
                >
                  {src.label}
                </button>
              );
            })}
          </div>

          {/* Dates */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input 
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              onClick={(e) => { try { e.target.showPicker(); } catch(err){} }}
              style={{
                padding: '0.25rem 0.4rem',
                fontSize: '0.75rem',
                borderRadius: '4px',
                border: '1px solid #30363d',
                backgroundColor: '#0d1117',
                color: '#fff',
                cursor: 'pointer',
                width: '110px'
              }}
            />
            <span style={{ fontSize: '0.7rem', color: '#8b949e' }}>a</span>
            <input 
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              onClick={(e) => { try { e.target.showPicker(); } catch(err){} }}
              style={{
                padding: '0.25rem 0.4rem',
                fontSize: '0.75rem',
                borderRadius: '4px',
                border: '1px solid #30363d',
                backgroundColor: '#0d1117',
                color: '#fff',
                cursor: 'pointer',
                width: '110px'
              }}
            />
          </div>

          {/* Audit Button (Highlight Button in Toolbar) */}
          <button
            onClick={openAuditModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.28rem 0.65rem',
              fontSize: '0.75rem',
              fontWeight: 700,
              borderRadius: '4px',
              border: '1px solid rgba(99, 102, 241, 0.5)',
              backgroundColor: 'rgba(99, 102, 241, 0.18)',
              color: '#a5b4fc',
              cursor: 'pointer',
              boxShadow: '0 0 12px rgba(99, 102, 241, 0.25)',
              transition: 'all 0.2s ease-in-out'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.35)';
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.8)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.18)';
              e.currentTarget.style.color = '#a5b4fc';
              e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.5)';
            }}
            title="Ver auditoría de datos, años disponibles, fechas y parámetros faltantes"
          >
            <Activity size={13} color="#a5b4fc" />
            <span>Auditoría</span>
          </button>

          {/* Clean Filters */}
          {(searchTerm || selectedDept !== 'Todos' || startDate || endDate || selectedSource !== 'Todos') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedDept('Todos');
                setStartDate('');
                setEndDate('');
                setSelectedSource('Todos');
              }}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.7rem',
                borderRadius: '4px',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                backgroundColor: 'rgba(244, 63, 94, 0.1)',
                color: '#fb7185',
                cursor: 'pointer'
              }}
            >
              Limpiar
            </button>
          )}
        </div>

        {/* 3. Indicators (Dates, Sedes, Rows count, last sync) */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.75rem',
          fontSize: '0.75rem',
          color: '#8b949e',
          flexWrap: 'wrap',
          marginRight: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }} title="Rango de fechas de los datos">
            <span>📅</span>
            <span style={{ color: '#c9d1d9', fontWeight: 500 }}>{minDate} a {maxDate}</span>
            <button
              onClick={openAuditModal}
              title="Auditoría de datos: años con info, fechas faltantes y variables incompletas"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '18px', height: '18px', borderRadius: '50%',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                color: '#818cf8', cursor: 'pointer', fontSize: '10px',
                fontWeight: 900, lineHeight: 1, marginLeft: '2px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(99,102,241,0.3)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(99,102,241,0.15)'; e.currentTarget.style.color = '#818cf8'; }}
            >ℹ</button>
          </div>
          <div style={{ width: '1px', height: '10px', backgroundColor: '#21262d' }}></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }} title="Sedes registradas">
            <span>🏢</span>
            <span style={{ color: '#c9d1d9', fontWeight: 500 }}>{uniqueSedesCount} sedes</span>
          </div>
          <div style={{ width: '1px', height: '10px', backgroundColor: '#21262d' }}></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }} title="Filas totales en la tabla">
            <span>📊</span>
            <span style={{ color: '#c9d1d9', fontWeight: 500 }}>{totalRows.toLocaleString()} filas</span>
          </div>
          <div style={{ width: '1px', height: '10px', backgroundColor: '#21262d' }}></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }} title="Última fecha y hora de actualización completa">
            <span>🕒</span>
            <span style={{ color: '#c9d1d9', fontWeight: 500 }}>Act: {lastSync}</span>
          </div>
        </div>

        {/* 4. Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            onClick={() => setShowHelpModal(true)}
            title="Integración API y Guía de Uso"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '4px',
              backgroundColor: 'rgba(228, 160, 43, 0.1)',
              border: '1px solid rgba(228, 160, 43, 0.3)',
              color: '#e4a02b',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(228, 160, 43, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(228, 160, 43, 0.1)';
            }}
          >
            <Link2 size={14} />
          </button>

          <a 
            href={getDownloadUrl('excel')}
            download="clima_spsa.xlsx"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '0.3rem 0.6rem',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '4px',
              color: '#34d399',
              fontSize: '0.75rem',
              fontWeight: 600,
              textDecoration: 'none',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(16, 185, 129, 0.18)'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(16, 185, 129, 0.1)'}
          >
            <Download size={12} /> Exportar en Excel
          </a>
        </div>
      </div>

      {/* SQL Table Component */}
      <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
        
        {/* Table scroll container */}
        <div onScroll={handleScroll} style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left', minWidth: '1600px' }}>
            <thead style={{
              backgroundColor: '#161b22',
              position: 'sticky',
              top: 0,
              zIndex: 10,
              borderBottom: '2px solid #30363d'
            }}>
              <tr>
                <th style={{
                  padding: '0.75rem 1rem',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                  color: '#8b949e',
                  borderBottom: '1px solid #30363d',
                  width: '60px'
                }}>
                  N°
                </th>
                {[
                  { field: 'ceco', label: 'CECO' },
                  { field: 'sede', label: 'Sede' },
                  { field: 'tag', label: 'Tag' },
                  { field: 'fecha', label: 'Fecha' },
                  { field: 'departamento', label: 'Dpto.' },
                  { field: 'provincia', label: 'Provincia' },
                  { field: 'distrito', label: 'Distrito' },
                  { field: 'latitud', label: 'Latitud' },
                  { field: 'longitud', label: 'Longitud' },
                  { field: 'temp_max', label: 'T. Max (°C)' },
                  { field: 'temp_min', label: 'T. Min (°C)' },
                  { field: 'temp_promedio', label: 'T. Prom (°C)' },
                  { field: 'humedad_pct', label: 'Humedad (%)' },
                  { field: 'precipitacion', label: 'Precip. (mm)' },
                  { field: 'viento_max_kmh', label: 'Viento Max' },
                  { field: 'viento_rafaga_kmh', label: 'Ráfaga Viento' },
                  { field: 'viento_direccion_grados', label: 'Dir. Viento' },
                  { field: 'radiacion_solar_mj', label: 'Radiación (MJ)' },
                  { field: 'evapotranspiracion_mm', label: 'Evapo. (mm)' },
                  { field: 'condicion_codigo', label: 'Cód. WMO' },
                  { field: 'fuente_datos', label: 'Fuente' },
                  { field: 'fecha_sync', label: 'Sincronizado' }
                ].map(col => (
                  <th 
                    key={col.field}
                    onClick={() => handleSort(col.field)}
                    style={{
                      padding: '0.75rem 1rem',
                      cursor: 'pointer',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                      color: sortField === col.field ? '#3b82f6' : '#8b949e',
                      borderBottom: '1px solid #30363d',
                      transition: 'color 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {col.label}
                      <ArrowUpDown size={12} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="23" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                    <RefreshCw size={24} className="spin" style={{ marginBottom: '0.5rem' }} />
                    <div>Cargando datos climatológicos...</div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="23" style={{ textAlign: 'center', padding: '3rem', color: '#f87171' }}>
                    <AlertTriangle size={24} style={{ marginBottom: '0.5rem' }} />
                    <div>{error}</div>
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="23" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                    No se encontraron registros que coincidan con los filtros.
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, idx) => (
                  <tr 
                    key={idx}
                    style={{
                      borderBottom: '1px solid #21262d',
                      backgroundColor: idx % 2 === 0 ? 'rgba(255, 255, 255, 0.01)' : 'rgba(0, 0, 0, 0.1)',
                      transition: 'background-color 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? 'rgba(255, 255, 255, 0.01)' : 'rgba(0, 0, 0, 0.1)'}
                  >
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap', color: '#8b949e', fontWeight: 500 }}>{startIndex + idx + 1}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap', fontWeight: 600, color: '#e4a02b' }}>{row.ceco}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap', color: '#fff' }}>{row.sede}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap', color: '#8b949e' }}>{row.tag}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap', color: '#58a6ff', fontWeight: 500 }}>{row.fecha}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap' }}>{row.departamento}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap' }}>{row.provincia}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap' }}>{row.distrito}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap' }}>{row.latitud}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap' }}>{row.longitud}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap', color: '#f87171' }}>{row.temp_max != null ? `${row.temp_max}°` : '-'}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap', color: '#60a5fa' }}>{row.temp_min != null ? `${row.temp_min}°` : '-'}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap', color: '#34d399' }}>{row.temp_promedio != null ? `${row.temp_promedio}°` : '-'}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap' }}>{row.humedad_pct != null ? `${row.humedad_pct}%` : '-'}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap', color: '#38bdf8' }}>{row.precipitacion != null ? `${row.precipitacion} mm` : '-'}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap' }}>{row.viento_max_kmh != null ? `${row.viento_max_kmh} km/h` : '-'}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap' }}>{row.viento_rafaga_kmh != null ? `${row.viento_rafaga_kmh} km/h` : '-'}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap' }}>{row.viento_direccion_grados != null ? `${row.viento_direccion_grados}°` : '-'}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap', color: '#fbbf24' }}>{row.radiacion_solar_mj != null ? `${row.radiacion_solar_mj} MJ` : '-'}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap' }}>{row.evapotranspiracion_mm != null ? `${row.evapotranspiracion_mm} mm` : '-'}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap' }}>{row.condicion_codigo != null ? row.condicion_codigo : '-'}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap', color: '#8b949e' }}>{row.fuente_datos}</td>
                    <td style={{ padding: '0.6rem 1rem', whiteSpace: 'nowrap', color: '#8b949e' }}>
                      {row.fecha_sync ? new Date(row.fecha_sync).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer controls (Pagination & count) */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          borderTop: '1px solid #30363d',
          backgroundColor: '#161b22',
          fontSize: '0.75rem',
          color: '#8b949e',
          gap: '0.75rem'
        }}>
          {/* Left panel: stats & dates */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              Mostrando <strong>{data.length}</strong> de <strong>{serverFilteredRows}</strong> registros
              {searchTerm || selectedDept !== 'Todos' || startDate || endDate || selectedSource !== 'Todos' ? ' (filtrados)' : ''}
            </div>
            {data.length > 0 && (
              <>
                <div style={{ width: '1px', height: '12px', backgroundColor: '#30363d' }}></div>
                <div>
                  En vista: Filas <strong>{startIndex + 1}</strong> - <strong>{startIndex + data.length}</strong>
                </div>
                <div style={{ width: '1px', height: '12px', backgroundColor: '#30363d' }}></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <span>📅 Rango en vista:</span>
                  <strong style={{ color: '#c9d1d9' }}>{currentMinDateInView}</strong>
                  <span>a</span>
                  <strong style={{ color: '#c9d1d9' }}>{currentMaxDateInView}</strong>
                </div>
              </>
            )}
          </div>
          
          {/* Center panel: Loading state */}
          {loading && data.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#58a6ff' }}>
              <RefreshCw size={12} className="spin" />
              <span>Cargando más filas...</span>
            </div>
          )}
          
          {/* Right panel: Block control & pagination input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
            {/* Block Size Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Filas por bloque:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                }}
                style={{
                  padding: '2px 4px',
                  borderRadius: '4px',
                  border: '1px solid #30363d',
                  backgroundColor: '#0d1117',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                {[50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div style={{ width: '1px', height: '12px', backgroundColor: '#30363d' }}></div>

            {/* Block Number Input Navigation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Ir al bloque:</span>
              
              {/* Prev Button */}
              <button
                disabled={currentPage <= 1 || loading}
                onClick={() => fetchData(currentPage - 1, false)}
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  border: '1px solid #30363d',
                  backgroundColor: '#0d1117',
                  color: '#fff',
                  cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                  opacity: currentPage <= 1 ? 0.4 : 1,
                  fontSize: '0.7rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Bloque anterior"
              >
                ◀
              </button>

              {/* Block Input */}
              <input
                type="text"
                value={inputPageVal}
                onChange={(e) => setInputPageVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const p = parseInt(inputPageVal);
                    if (p >= 1 && p <= totalPages) {
                      fetchData(p, false);
                    } else {
                      setInputPageVal(String(currentPage));
                    }
                  }
                }}
                onBlur={() => {
                  const p = parseInt(inputPageVal);
                  if (p >= 1 && p <= totalPages) {
                    fetchData(p, false);
                  } else {
                    setInputPageVal(String(currentPage));
                  }
                }}
                style={{
                  width: '45px',
                  textAlign: 'center',
                  padding: '2px 4px',
                  borderRadius: '4px',
                  border: '1px solid #30363d',
                  backgroundColor: '#0d1117',
                  color: '#fff',
                  fontSize: '0.75rem',
                  fontWeight: 600
                }}
                title="Introduce un bloque de carga y presiona Enter"
              />

              <span style={{ color: '#8b949e' }}>de <strong>{totalPages}</strong></span>

              {/* Next Button */}
              <button
                disabled={currentPage >= totalPages || loading}
                onClick={() => fetchData(currentPage + 1, false)}
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  border: '1px solid #30363d',
                  backgroundColor: '#0d1117',
                  color: '#fff',
                  cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                  opacity: currentPage >= totalPages ? 0.4 : 1,
                  fontSize: '0.7rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Bloque siguiente"
              >
                ▶
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Help Modal Overlay */}
      {showHelpModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div className="glass-panel" style={{
            width: '90%',
            maxWidth: '650px',
            maxHeight: '85vh',
            overflowY: 'auto',
            padding: '2rem',
            border: '1px solid #30363d',
            backgroundColor: '#0d1117',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #30363d', paddingBottom: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🔗 Integración y Compartición Pública (API)
              </h2>
              <button 
                onClick={() => setShowHelpModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8b949e',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                ✕
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', fontSize: '0.85rem', color: '#c9d1d9' }}>
              
              {/* API Endpoints Section */}
              <div style={{
                backgroundColor: 'rgba(228, 160, 43, 0.05)',
                border: '1px solid rgba(228, 160, 43, 0.25)',
                borderRadius: '6px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}>
                <h4 style={{ margin: 0, color: '#e4a02b', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  ⚡ Enlaces de Conexión Filtrados (En Tiempo Real)
                </h4>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#8b949e', lineHeight: '1.4' }}>
                  Utiliza estos enlaces para consumir los datos de clima filtrados directamente. Cuentan con soporte automático de contingencia local en caso de caídas de Supabase.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.25rem' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: '#8b949e', width: '45px', fontWeight: 600 }}>JSON:</span>
                    <input 
                      type="text" 
                      readOnly 
                      value={getDownloadUrl('json')} 
                      style={{ flex: 1, padding: '6px 10px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #30363d', backgroundColor: '#0d1117', color: '#58a6ff' }}
                    />
                    <button 
                      onClick={() => handleCopyLink(getDownloadUrl('json'), 'json')} 
                      style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '4px', backgroundColor: '#21262d', border: '1px solid #30363d', color: '#c9d1d9', cursor: 'pointer', fontWeight: 600 }}
                    >
                      {copiedLink === 'json' ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: '#8b949e', width: '45px', fontWeight: 600 }}>CSV:</span>
                    <input 
                      type="text" 
                      readOnly 
                      value={getDownloadUrl('csv')} 
                      style={{ flex: 1, padding: '6px 10px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #30363d', backgroundColor: '#0d1117', color: '#58a6ff' }}
                    />
                    <button 
                      onClick={() => handleCopyLink(getDownloadUrl('csv'), 'csv')} 
                      style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '4px', backgroundColor: '#21262d', border: '1px solid #30363d', color: '#c9d1d9', cursor: 'pointer', fontWeight: 600 }}
                    >
                      {copiedLink === 'csv' ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Google Sheets */}
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#58a6ff', fontSize: '0.95rem' }}>🟢 Google Sheets (Automático)</h4>
                <ol style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: '1.5' }}>
                  <li>Abre una hoja de cálculo en Google Sheets.</li>
                  <li>En cualquier celda vacía, pega la siguiente fórmula:
                    <pre style={{ margin: '0.5rem 0', padding: '0.5rem', backgroundColor: '#161b22', borderRadius: '4px', border: '1px solid #30363d', overflowX: 'auto', fontSize: '0.75rem', color: '#e4a02b' }}>
                      {`=IMPORTDATA("${getDownloadUrl('csv')}")`}
                    </pre>
                  </li>
                  <li>Presiona <strong>Enter</strong>. Los datos climáticos se descargarán e importarán automáticamente.</li>
                </ol>
              </div>

              {/* Microsoft Excel */}
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#58a6ff', fontSize: '0.95rem' }}>🔵 Microsoft Excel (Power Query)</h4>
                <ol style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: '1.5' }}>
                  <li>En Excel, ve a la pestaña superior <strong>Datos</strong>.</li>
                  <li>Selecciona la opción <strong>Desde la Web</strong> (o <i>De otras fuentes &gt; Desde la Web</i>).</li>
                  <li>Pega la siguiente URL de formato CSV:
                    <pre style={{ margin: '0.5rem 0', padding: '0.5rem', backgroundColor: '#161b22', borderRadius: '4px', border: '1px solid #30363d', overflowX: 'auto', fontSize: '0.75rem', color: '#e4a02b' }}>
                      {getDownloadUrl('csv')}
                    </pre>
                  </li>
                  <li>Haz clic en <strong>Aceptar</strong> y luego en <strong>Cargar</strong>. La tabla se conectará de manera permanente. Puedes actualizarla haciendo clic derecho sobre la tabla en Excel y seleccionando "Actualizar".</li>
                </ol>
              </div>

              {/* Power BI */}
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#58a6ff', fontSize: '0.95rem' }}>💛 Power BI Desktop</h4>
                <ol style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: '1.5' }}>
                  <li>Abre tu proyecto de Power BI Desktop.</li>
                  <li>Haz clic en <strong>Obtener Datos</strong> &gt; <strong>Web</strong>.</li>
                  <li>Pega la URL del archivo CSV:
                    <pre style={{ margin: '0.5rem 0', padding: '0.5rem', backgroundColor: '#161b22', borderRadius: '4px', border: '1px solid #30363d', overflowX: 'auto', fontSize: '0.75rem', color: '#e4a02b' }}>
                      {getDownloadUrl('csv')}
                    </pre>
                  </li>
                  <li>Presiona <strong>Conectar</strong>. Power BI interpretará la estructura de columnas automáticamente para tus tableros.</li>
                </ol>
              </div>

              {/* Python pandas */}
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#58a6ff', fontSize: '0.95rem' }}>🐍 Script de Python (Pandas)</h4>
                <p style={{ margin: '0 0 0.5rem 0' }}>Puedes cargar la data directamente como DataFrame usando pandas:</p>
                <pre style={{ margin: 0, padding: '0.75rem', backgroundColor: '#161b22', borderRadius: '4px', border: '1px solid #30363d', overflowX: 'auto', fontSize: '0.75rem', color: '#79c0ff', fontFamily: 'monospace' }}>
{`import pandas as pd

url = "${getDownloadUrl('csv')}"
df = pd.read_csv(url)

# Mostrar las primeras filas
print(df.head())`}
                </pre>
              </div>

            </div>

            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #30363d', paddingTop: '1rem' }}>
              <button 
                onClick={() => setShowHelpModal(false)}
                style={{
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.8rem',
                  borderRadius: '4px',
                  backgroundColor: '#21262d',
                  border: '1px solid #30363d',
                  color: '#c9d1d9',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supabase Info Modal Overlay */}
      {showSupabaseInfoModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div className="glass-panel" style={{
            width: '90%',
            maxWidth: '550px',
            padding: '2rem',
            border: '1px solid #30363d',
            backgroundColor: '#0d1117',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
            borderRadius: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #30363d', paddingBottom: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={18} color={isFallback ? '#d97706' : '#10b981'} />
                Detalles del Servidor de Base de Datos
              </h2>
              <button 
                onClick={() => setShowSupabaseInfoModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8b949e',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                ✕
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem', color: '#c9d1d9', lineHeight: '1.5' }}>
              <p style={{ margin: 0 }}>
                Este indicador muestra el estado de conexión actual con la base de datos en la nube de <strong>Supabase</strong> (Proyecto de Energía, esquema <code>energia</code>, tabla <code>"DATA CLIMATICA OPENMETEO"</code>).
              </p>
              
              <div style={{ padding: '0.75rem', backgroundColor: '#161b22', borderRadius: '6px', border: '1px solid #30363d' }}>
                <h4 style={{ margin: '0 0 0.4rem 0', color: '#fff', fontSize: '0.85rem' }}>📌 ¿Para qué sirve?</h4>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#8b949e' }}>
                  Supabase actúa como el almacén persistente centralizado. Los bots de extracción climática en Python guardan allí toda la información meteorológica histórica y de forecast para las 140 sedes del país.
                </p>
              </div>

              <div style={{ padding: '0.75rem', backgroundColor: '#161b22', borderRadius: '6px', border: '1px solid #30363d' }}>
                <h4 style={{ margin: '0 0 0.4rem 0', color: '#fff', fontSize: '0.85rem' }}>⚙️ ¿Cómo funciona el respaldo?</h4>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#8b949e' }}>
                  Si la base de datos de Supabase experimenta caídas de red o mantenimientos, el sistema cambiará automáticamente a <strong>Supabase Offline</strong> y servirá los datos del archivo local de caché <code>clima_history.json</code>, garantizando que el panel y las integraciones externas sigan funcionando sin interrupciones.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem', color: '#8b949e', marginTop: '0.5rem', borderTop: '1px solid #21262d', paddingTop: '0.75rem' }}>
                <div><strong>Host Proyecto:</strong> https://wovedghvlvaocebendxe.supabase.co</div>
                <div><strong>Base de Datos:</strong> PostgreSQL (schema: energia)</div>
                <div><strong>Estrategia de Sync:</strong> Upsert incremental en conflicto (ceco, fecha)</div>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #30363d', paddingTop: '1rem' }}>
              <button 
                onClick={() => setShowSupabaseInfoModal(false)}
                style={{
                  padding: '0.4rem 1.25rem',
                  fontSize: '0.8rem',
                  borderRadius: '4px',
                  backgroundColor: '#21262d',
                  border: '1px solid #30363d',
                  color: '#c9d1d9',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          AUDIT MODAL — Brechas de Datos Climáticos
          ═══════════════════════════════════════ */}
      {showAuditModal && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.82)',
          backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 9999, padding: '1rem'
        }}>
          <div style={{
            width: '95%', maxWidth: '980px', maxHeight: '90vh',
            display: 'flex', flexDirection: 'column',
            backgroundColor: '#0d1117', borderRadius: '12px',
            border: '1px solid rgba(99,102,241,0.4)',
            boxShadow: '0 0 60px rgba(99,102,241,0.2), 0 20px 60px rgba(0,0,0,0.7)'
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '1.25rem 1.5rem', borderBottom: '1px solid #21262d', flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.15))',
                  border: '1px solid rgba(99,102,241,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Activity size={18} color="#818cf8" />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>Auditoría de Datos Climáticos</h2>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#8b949e' }}>Años con datos · Fechas faltantes · Variables incompletas</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button onClick={fetchAudit} disabled={auditLoading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px', padding: '0.3rem 0.75rem',
                    fontSize: '0.75rem', borderRadius: '6px', backgroundColor: 'rgba(99,102,241,0.1)',
                    border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', cursor: 'pointer',
                    opacity: auditLoading ? 0.5 : 1
                  }}
                ><RefreshCw size={12} className={auditLoading ? 'spin' : ''} /> Actualizar</button>
                <button onClick={() => setShowAuditModal(false)}
                  style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}
                >✕</button>
              </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
              {auditLoading && (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#8b949e' }}>
                  <RefreshCw size={28} className="spin" style={{ marginBottom: '0.75rem' }} />
                  <div>Analizando {(auditData?.totalSedes || '...')} sedes...</div>
                </div>
              )}
              {auditError && (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#f87171' }}>
                  <AlertTriangle size={24} style={{ marginBottom: '0.5rem' }} />
                  <div>{auditError}</div>
                </div>
              )}
              {!auditLoading && !auditError && auditData && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                  {/* Summary pills */}
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ padding: '0.6rem 1rem', borderRadius: '8px', backgroundColor: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', fontSize: '0.8rem' }}>
                      <span style={{ color: '#8b949e' }}>Años con datos: </span>
                      <strong style={{ color: '#818cf8' }}>{auditData.years.length}</strong>
                      <span style={{ color: '#555', marginLeft: '6px' }}>({auditData.years[0]} – {auditData.years[auditData.years.length - 1]})</span>
                    </div>
                    <div style={{ padding: '0.6rem 1rem', borderRadius: '8px', backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', fontSize: '0.8rem' }}>
                      <span style={{ color: '#8b949e' }}>Sedes totales: </span>
                      <strong style={{ color: '#4ade80' }}>{auditData.totalSedes}</strong>
                    </div>
                    {auditData.generatedAt && (
                      <div style={{ padding: '0.6rem 1rem', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid #21262d', fontSize: '0.8rem', color: '#555' }}>
                        🕒 {new Date(auditData.generatedAt).toLocaleString()}
                      </div>
                    )}
                  </div>

                  {/* Year Tabs */}
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#8b949e', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Selecciona un año para ver el detalle:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {auditData.gapsByYear.map(y => {
                        const isSelected = y.year === auditSelectedYear;
                        const color = y.completionPct >= 95 ? '#4ade80' : y.completionPct >= 60 ? '#fbbf24' : '#f87171';
                        return (
                          <button key={y.year} onClick={() => setAuditSelectedYear(y.year)}
                            style={{
                              padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600,
                              cursor: 'pointer', transition: 'all 0.15s',
                              backgroundColor: isSelected ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${isSelected ? 'rgba(99,102,241,0.6)' : '#21262d'}`,
                              color: isSelected ? '#c7d2fe' : color
                            }}
                          >
                            {y.year}
                            <span style={{ marginLeft: '4px', fontSize: '0.65rem', opacity: 0.8 }}>{y.completionPct}%</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Year Detail */}
                  {auditSelectedYear && (() => {
                    const yd = auditData.gapsByYear.find(y => y.year === auditSelectedYear);
                    if (!yd) return null;
                    const color = yd.completionPct >= 95 ? '#4ade80' : yd.completionPct >= 60 ? '#fbbf24' : '#f87171';
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Year stats */}
                        <div style={{
                          padding: '1rem 1.25rem', borderRadius: '10px',
                          backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid #21262d',
                          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem'
                        }}>
                          {[
                            { label: 'Año', val: `${yd.year}${yd.isLeap ? ' (bisiesto)' : ''}`, col: '#818cf8' },
                            { label: 'Sedes con datos', val: yd.sedesCount, col: '#38bdf8' },
                            { label: 'Días encontrados', val: yd.datesFound, col: '#4ade80' },
                            { label: 'Días esperados', val: yd.expectedDays, col: '#8b949e' },
                            { label: 'Días faltantes', val: yd.missingDatesCount, col: yd.missingDatesCount === 0 ? '#4ade80' : '#f87171' },
                            { label: 'Completitud', val: `${yd.completionPct}%`, col: color },
                          ].map(item => (
                            <div key={item.label} style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '0.68rem', color: '#555', marginBottom: '2px', textTransform: 'uppercase' }}>{item.label}</div>
                              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: item.col }}>{item.val}</div>
                            </div>
                          ))}
                        </div>

                        {/* Missing date ranges */}
                        {yd.missingDatesCount > 0 && (
                          <div style={{ backgroundColor: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '8px', padding: '1rem' }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fca5a5', marginBottom: '0.6rem' }}>
                              📅 Rangos de fechas faltantes para completar {yd.year} ({yd.missingRanges.length} bloque{yd.missingRanges.length !== 1 ? 's' : ''})
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                              {yd.missingRanges.map((r, i) => (
                                <span key={i} style={{
                                  padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600,
                                  backgroundColor: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#fca5a5'
                                }}>
                                  {r.from === r.to ? r.from : `${r.from} → ${r.to}`}
                                </span>
                              ))}
                              {yd.missingDatesCount > 50 && (
                                <span style={{ fontSize: '0.7rem', color: '#8b949e', alignSelf: 'center' }}>...y {yd.missingDatesCount - yd.missingRanges.length} días más</span>
                              )}
                            </div>
                          </div>
                        )}
                        {yd.missingDatesCount === 0 && (
                          <div style={{ backgroundColor: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <CheckCircle size={14} /> El año {yd.year} tiene datos completos (sin días faltantes)
                          </div>
                        )}

                        {/* Variable gaps table */}
                        <div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#c9d1d9', marginBottom: '0.6rem' }}>📊 Análisis por variable — {yd.year}</div>
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                              <thead>
                                <tr style={{ backgroundColor: '#161b22', borderBottom: '2px solid #21262d' }}>
                                  {['Variable', 'Tipo / Fuente', 'Registros', 'Nulos', '% Faltante', 'Período con nulos'].map(h => (
                                    <th key={h} style={{ padding: '0.55rem 0.75rem', textAlign: 'left', color: '#8b949e', whiteSpace: 'nowrap', fontWeight: 600 }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {yd.varGaps.map((v, i) => {
                                  const pct = v.missingPct;
                                  const pctColor = pct === 0 ? '#4ade80' : pct < 20 ? '#fbbf24' : '#f87171';
                                  return (
                                    <tr key={v.key} style={{ borderBottom: '1px solid #21262d', backgroundColor: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                                      <td style={{ padding: '0.5rem 0.75rem', fontWeight: 700, color: '#c9d1d9', whiteSpace: 'nowrap' }}>{v.label}</td>
                                      <td style={{ padding: '0.5rem 0.75rem', color: '#8b949e', fontSize: '0.7rem', maxWidth: '280px' }}>{v.tipo}</td>
                                      <td style={{ padding: '0.5rem 0.75rem', color: '#58a6ff', textAlign: 'right', fontWeight: 600 }}>{v.totalCount.toLocaleString()}</td>
                                      <td style={{ padding: '0.5rem 0.75rem', color: pct === 0 ? '#4ade80' : '#f87171', textAlign: 'right', fontWeight: 600 }}>{v.nullCount.toLocaleString()}</td>
                                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                                        <span style={{
                                          display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontWeight: 800, fontSize: '0.72rem',
                                          backgroundColor: pct === 0 ? 'rgba(34,197,94,0.1)' : pct < 20 ? 'rgba(251,191,36,0.1)' : 'rgba(248,113,113,0.1)',
                                          color: pctColor, border: `1px solid ${pctColor}40`
                                        }}>{pct}%</span>
                                      </td>
                                      <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.7rem', color: '#8b949e', whiteSpace: 'nowrap' }}>
                                        {v.firstNull && v.lastNull
                                          ? v.firstNull === v.lastNull
                                            ? <span style={{ color: '#fbbf24' }}>{v.firstNull}</span>
                                            : <span style={{ color: '#fbbf24' }}>{v.firstNull} <span style={{ color: '#555' }}>→</span> {v.lastNull}</span>
                                          : <span style={{ color: '#4ade80' }}>✓ Completo</span>
                                        }
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Bot action suggestion */}
                        {(yd.missingDatesCount > 0 || yd.varGaps.some(v => v.missingPct > 0)) && (
                          <div style={{
                            padding: '0.9rem 1.1rem', borderRadius: '8px',
                            backgroundColor: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.25)'
                          }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#38bdf8', marginBottom: '0.4rem' }}>🤖 Acción recomendada para el Bot</div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.6 }}>
                              {yd.missingDatesCount > 0 && (
                                <div>• Configurar <strong style={{ color: '#fff' }}>f_ini = {yd.missingRanges[0]?.from}</strong> y <strong style={{ color: '#fff' }}>f_fin = {yd.missingRanges[yd.missingRanges.length - 1]?.to}</strong> para cubrir los días faltantes del año {yd.year}.</div>
                              )}
                              {yd.varGaps.filter(v => v.missingPct > 0).map(v => (
                                <div key={v.key}>• <strong style={{ color: '#fbbf24' }}>{v.label}</strong>: falta del {v.firstNull} al {v.lastNull} ({v.nullCount} registros nulos).</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex', justifyContent: 'flex-end',
              padding: '0.9rem 1.5rem', borderTop: '1px solid #21262d', flexShrink: 0
            }}>
              <button onClick={() => setShowAuditModal(false)}
                style={{
                  padding: '0.45rem 1.25rem', fontSize: '0.8rem', borderRadius: '6px',
                  backgroundColor: '#21262d', border: '1px solid #30363d',
                  color: '#c9d1d9', cursor: 'pointer', fontWeight: 600
                }}
              >Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClimaTabla;
