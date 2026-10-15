import React, { useState } from 'react';
import { Flame, Clock, RefreshCw, ChevronDown, CheckCircle2, TrendingUp, Info } from 'lucide-react';
import { getTrelloCardStyle } from '../../components_configuracion_variables/utils/trelloCardStyles';

const ACCENT = '#f97316'; // Color naranja fuego / barra Kallpa

const formatearNumero = (valor, decimales = 2) => {
  if (valor === null || valor === undefined || isNaN(valor)) return '0.00';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
};

/**
 * Cuadro de Cálculo: Energía con Pérdidas de Generación
 * Aplica el factor de pérdida en transmisión configurado en Botón 3 (B.G Kallpa La Curva vs Sede)
 * para calcular la energía total y facturación con pérdidas en barra de generación.
 */
const CardAnalisisEnergiasConPerdidas = ({ resultado, variables, origenDatos, onRecalcular }) => {
  const [hovered, setHovered] = useState(false);
  const [circuitoSeleccionado, setCircuitoSeleccionado] = useState('total');

  if (!resultado || !resultado.consolidado) {
    return (
      <div
        style={{
          ...getTrelloCardStyle(ACCENT, false),
          width: '450px',
          maxWidth: '490px',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
          No hay datos de registros de energía disponibles para calcular pérdidas.
        </div>
      </div>
    );
  }

  const { consolidado, circuitos, meta } = resultado;

  // Determinar los datos de energía activos según el circuito seleccionado
  const datosActivos = circuitoSeleccionado === 'total'
    ? consolidado
    : (circuitos.find((c) => c.key === circuitoSeleccionado) || consolidado);

  const nombreVista = circuitoSeleccionado === 'total'
    ? 'Total Consolidado (Toda la Planta)'
    : datosActivos.esVirtual
      ? `🟣 [VIRTUAL] ${datosActivos.alias}`
      : (datosActivos.alias || datosActivos.headerOriginal || 'Circuito');

  // 1. Obtener Factor de Pérdida calculado en Botón 3 (Configuración de Variables -> energiaKallpa)
  const valorBarra = parseFloat(variables?.energiaKallpa?.valor) || 0;
  const unidadBarra = variables?.energiaKallpa?.unidad || 'MWh';
  const valorSede = parseFloat(variables?.energiaKallpa?.valorSede) || 0;
  const unidadSede = variables?.energiaKallpa?.unidadSede || 'MWh';

  const valorBarraKWh = unidadBarra === 'MWh' ? valorBarra * 1000 : valorBarra;
  const valorSedeKWh = unidadSede === 'MWh' ? valorSede * 1000 : valorSede;

  // Factor de pérdida (Sede / Barra) y porcentaje de pérdida en transmisión:
  const factorPerdidaSede = valorBarraKWh > 0 ? (valorSedeKWh / valorBarraKWh) : 1;
  const porcentajePerdida = valorBarraKWh > 0 ? ((1 - factorPerdidaSede) * 100) : 0;
  const factorAdicionalMultiplicador = porcentajePerdida / 100;

  // 2. Parámetros comerciales y tarifas
  const tarifas = variables?.tarifas || {};
  const tipoCambio = parseFloat(variables?.tipoCambio?.valor) || 3.748;
  const fuenteTC = variables?.tipoCambio?.fuente || 'SBS';
  const unidadTarifa = tarifas.unidadEnergia || 'USD/MWh';

  const tarifaHP = parseFloat(
    tarifas.tarifaEnergiaHP !== undefined ? tarifas.tarifaEnergiaHP : (tarifas.tarifaEnergia ?? 58.50)
  ) || 0;

  const tarifaHFP = parseFloat(
    tarifas.tarifaEnergiaHFP !== undefined ? tarifas.tarifaEnergiaHFP : (tarifas.tarifaEnergia ?? 58.50)
  ) || 0;

  const esPorMWh = unidadTarifa.toUpperCase().includes('MWH');

  // 3. Cálculos de Energía con Pérdidas
  // Horas Punta (HP)
  const hpBaseKWh = datosActivos.hp_kWh || 0;
  const hpPerdidaKWh = hpBaseKWh * factorAdicionalMultiplicador;
  const hpConPerdidaKWh = hpBaseKWh + hpPerdidaKWh;
  const hpConPerdidaMWh = hpConPerdidaKWh / 1000;

  // Horas Fuera de Punta (HFP)
  const hfpBaseKWh = datosActivos.hfp_kWh || 0;
  const hfpPerdidaKWh = hfpBaseKWh * factorAdicionalMultiplicador;
  const hfpConPerdidaKWh = hfpBaseKWh + hfpPerdidaKWh;
  const hfpConPerdidaMWh = hfpConPerdidaKWh / 1000;

  // Total Activa
  const totalBaseKWh = datosActivos.total_kWh || 0;
  const totalPerdidaKWh = hpPerdidaKWh + hfpPerdidaKWh;
  const totalConPerdidaKWh = totalBaseKWh + totalPerdidaKWh;
  const totalConPerdidaMWh = totalConPerdidaKWh / 1000;

  // Porcentajes recalculados
  const pctHP = totalConPerdidaKWh > 0 ? (hpConPerdidaKWh / totalConPerdidaKWh) * 100 : 0;
  const pctHFP = totalConPerdidaKWh > 0 ? (hfpConPerdidaKWh / totalConPerdidaKWh) * 100 : 0;

  // 4. Cálculos de Costo Monetario con Pérdidas (SIN IGV)
  const baseCobroHP = esPorMWh ? hpConPerdidaMWh : hpConPerdidaKWh;
  const baseCobroHFP = esPorMWh ? hfpConPerdidaMWh : hfpConPerdidaKWh;

  const costoHP_USD = baseCobroHP * tarifaHP;
  const costoHP_PEN = costoHP_USD * tipoCambio;

  const costoHFP_USD = baseCobroHFP * tarifaHFP;
  const costoHFP_PEN = costoHFP_USD * tipoCambio;

  const costoTotal_USD = costoHP_USD + costoHFP_USD;
  const costoTotal_PEN = costoTotal_USD * tipoCambio;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...getTrelloCardStyle(ACCENT, hovered),
        width: '450px',
        maxWidth: '490px',
        minWidth: '370px',
        flex: '0 0 auto',
      }}
    >
      {/* 1. Cabecera estilo Trello */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <div
            style={{
              padding: '0.45rem',
              borderRadius: '8px',
              background: 'rgba(249, 115, 22, 0.2)',
              color: ACCENT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Flame size={18} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
              Energía con Pérdidas de Generación
            </h3>
            <span style={{ fontSize: '0.72rem', color: '#fed7aa', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Clock size={11} color={ACCENT} />
              Liquidación en Barra B.G con pérdidas de transmisión
            </span>
          </div>
        </div>

        {/* Badge del Factor de Pérdida en Transmisión */}
        <div
          title="Factor de pérdida adicional calculado en Configuración de Variables (B.G Kallpa La Curva)"
          style={{
            background: 'rgba(249, 115, 22, 0.18)',
            border: '1px solid #f97316',
            borderRadius: '6px',
            padding: '0.25rem 0.5rem',
            textAlign: 'right',
          }}
        >
          <div style={{ fontSize: '0.62rem', color: '#fdba74', fontWeight: 600 }}>Pérdida Transmisión</div>
          <div style={{ fontSize: '0.82rem', fontWeight: 900, color: '#f97316' }}>
            +{porcentajePerdida.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* 2. Selector de Circuito / Totalizador */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Visualización
          </span>
          <span style={{ fontSize: '0.68rem', color: '#fb923c', fontWeight: 600 }}>
            {circuitoSeleccionado === 'total'
              ? `${circuitos.filter((c) => !c.esVirtual).length} Celdas sumadas`
              : datosActivos.esVirtual
                ? 'Medidor Virtual Calculado'
                : 'Celda individual'}
          </span>
        </div>
        <div style={{ position: 'relative' }}>
          <select
            value={circuitoSeleccionado}
            onChange={(e) => setCircuitoSeleccionado(e.target.value)}
            style={{
              width: '100%',
              background: '#0a101f',
              border: '1px solid #334155',
              borderRadius: '7px',
              padding: '0.45rem 2rem 0.45rem 0.65rem',
              color: '#f8fafc',
              fontSize: '0.78rem',
              fontWeight: 700,
              outline: 'none',
              cursor: 'pointer',
              appearance: 'none',
              boxSizing: 'border-box',
            }}
          >
            <option value="total">⚡ Toda la Planta (Total Consolidado)</option>
            {circuitos.some((c) => c.esVirtual) && (
              <optgroup label="🟣 Medidores Virtualizados">
                {circuitos
                  .filter((c) => c.esVirtual)
                  .map((c) => (
                    <option key={c.key} value={c.key}>
                      🟣 {c.alias}
                    </option>
                  ))}
              </optgroup>
            )}
            <optgroup label="⚡ Circuitos Físicos">
              {circuitos
                .filter((c) => !c.esVirtual)
                .map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.alias} {c.codigo ? `(${c.codigo})` : ''}
                  </option>
                ))}
            </optgroup>
          </select>
          <ChevronDown
            size={14}
            color="#94a3b8"
            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
        </div>
      </div>

      {/* Barra de proporción HP vs HFP con pérdidas */}
      <div style={{ marginTop: '0.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontWeight: 700, marginBottom: '0.25rem' }}>
          <span style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#fbbf24', display: 'inline-block' }} />
            HP con pérdidas: {pctHP.toFixed(1)}%
          </span>
          <span style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            HFP con pérdidas: {pctHFP.toFixed(1)}%
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#38bdf8', display: 'inline-block' }} />
          </span>
        </div>
        <div style={{ width: '100%', height: '6px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${pctHP}%`, background: 'linear-gradient(90deg, #f59e0b, #fbbf24)', transition: 'width 0.3s ease' }} />
          <div style={{ width: `${pctHFP}%`, background: 'linear-gradient(90deg, #0284c7, #38bdf8)', transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {/* 3. Bloques de Comparación HP y HFP con Pérdidas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginTop: '0.1rem' }}>
        {/* BLOQUE HP CON PÉRDIDAS */}
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '8px',
            padding: '0.65rem 0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 800, textTransform: 'uppercase' }}>
              Horas Punta (HP)
            </span>
            <span style={{ fontSize: '0.64rem', color: '#fde68a', background: 'rgba(245, 158, 11, 0.2)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>
              {pctHP.toFixed(1)}%
            </span>
          </div>

          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fef3c7', lineHeight: 1.1 }}>
              {formatearNumero(hpConPerdidaKWh, 2)}
            </div>
            <span style={{ fontSize: '0.68rem', color: '#d97706', fontWeight: 700 }}>kWh facturable</span>
          </div>

          {/* Desglose base y pérdidas añadidas */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              borderRadius: '5px',
              padding: '0.3rem 0.45rem',
              fontSize: '0.63rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
              <span>Base en medidor:</span>
              <span>{formatearNumero(hpBaseKWh, 2)} kWh</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fbbf24', fontWeight: 700 }}>
              <span>+ Pérdida (+{porcentajePerdida.toFixed(2)}%):</span>
              <span>+{formatearNumero(hpPerdidaKWh, 2)} kWh</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem', color: '#d97706' }}>
            <span>Equivalente:</span>
            <strong style={{ color: '#fed7aa' }}>{formatearNumero(hpConPerdidaMWh, 3)} MWh</strong>
          </div>

          {/* Costos HP */}
          <div style={{ borderTop: '1px dashed rgba(245, 158, 11, 0.25)', paddingTop: '0.3rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem' }}>
              <span style={{ color: '#94a3b8' }}>Tarifa HP:</span>
              <span style={{ color: '#fbbf24', fontWeight: 700 }}>$ {formatearNumero(tarifaHP, 2)} /MWh</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '0.66rem', color: '#d97706', fontWeight: 600 }}>Costo USD:</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fef08a' }}>
                $ {formatearNumero(costoHP_USD, 2)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '0.66rem', color: '#d97706', fontWeight: 600 }}>Costo Soles:</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fed7aa' }}>
                S/. {formatearNumero(costoHP_PEN, 2)}
              </span>
            </div>
            <span style={{ fontSize: '0.58rem', color: '#a3a3a3', textAlign: 'right' }}>sin IGV</span>
          </div>
        </div>

        {/* BLOQUE HFP CON PÉRDIDAS */}
        <div
          style={{
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '8px',
            padding: '0.65rem 0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 800, textTransform: 'uppercase' }}>
              Fuera Punta (HFP)
            </span>
            <span style={{ fontSize: '0.64rem', color: '#bae6fd', background: 'rgba(56, 189, 248, 0.2)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>
              {pctHFP.toFixed(1)}%
            </span>
          </div>

          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#f0f9ff', lineHeight: 1.1 }}>
              {formatearNumero(hfpConPerdidaKWh, 2)}
            </div>
            <span style={{ fontSize: '0.68rem', color: '#0284c7', fontWeight: 700 }}>kWh facturable</span>
          </div>

          {/* Desglose base y pérdidas añadidas */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              borderRadius: '5px',
              padding: '0.3rem 0.45rem',
              fontSize: '0.63rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
              <span>Base en medidor:</span>
              <span>{formatearNumero(hfpBaseKWh, 2)} kWh</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38bdf8', fontWeight: 700 }}>
              <span>+ Pérdida (+{porcentajePerdida.toFixed(2)}%):</span>
              <span>+{formatearNumero(hfpPerdidaKWh, 2)} kWh</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem', color: '#0284c7' }}>
            <span>Equivalente:</span>
            <strong style={{ color: '#7dd3fc' }}>{formatearNumero(hfpConPerdidaMWh, 3)} MWh</strong>
          </div>

          {/* Costos HFP */}
          <div style={{ borderTop: '1px dashed rgba(56, 189, 248, 0.25)', paddingTop: '0.3rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem' }}>
              <span style={{ color: '#94a3b8' }}>Tarifa HFP:</span>
              <span style={{ color: '#38bdf8', fontWeight: 700 }}>$ {formatearNumero(tarifaHFP, 2)} /MWh</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '0.66rem', color: '#0284c7', fontWeight: 600 }}>Costo USD:</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#bae6fd' }}>
                $ {formatearNumero(costoHFP_USD, 2)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '0.66rem', color: '#0284c7', fontWeight: 600 }}>Costo Soles:</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#93c5fd' }}>
                S/. {formatearNumero(costoHFP_PEN, 2)}
              </span>
            </div>
            <span style={{ fontSize: '0.58rem', color: '#a3a3a3', textAlign: 'right' }}>sin IGV</span>
          </div>
        </div>
      </div>

      {/* 4. Fila de Total de Energía Facturable y Costo Consolidado con Pérdidas (Sin IGV) */}
      <div
        style={{
          background: 'rgba(249, 115, 22, 0.08)',
          border: '1px solid rgba(249, 115, 22, 0.35)',
          borderRadius: '8px',
          padding: '0.6rem 0.85rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.45rem',
          marginTop: '0.2rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: ACCENT }} />
            <div>
              <div style={{ fontSize: '0.74rem', color: '#fdba74', fontWeight: 800, textTransform: 'uppercase' }}>
                Energía Total Facturable (Con Pérdidas)
              </div>
              <div style={{ fontSize: '0.66rem', color: '#ea580c' }}>
                {nombreVista}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#fff7ed', lineHeight: 1.1 }}>
              {formatearNumero(totalConPerdidaKWh, 2)} <span style={{ fontSize: '0.68rem', color: '#fdba74', fontWeight: 700 }}>kWh</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#fed7aa', fontWeight: 700 }}>
              {formatearNumero(totalConPerdidaMWh, 3)} MWh
            </div>
          </div>
        </div>

        {/* Desglose de Pérdida Global */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(249, 115, 22, 0.25)',
            borderRadius: '5px',
            padding: '0.25rem 0.55rem',
            fontSize: '0.64rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ color: '#94a3b8' }}>
            Base sin pérdidas: <strong style={{ color: '#e2e8f0' }}>{formatearNumero(totalBaseKWh, 2)} kWh</strong>
          </span>
          <span style={{ color: '#f97316', fontWeight: 800 }}>
            + Pérdidas Totales (+{porcentajePerdida.toFixed(2)}%): +{formatearNumero(totalPerdidaKWh, 2)} kWh
          </span>
        </div>

        {/* Totales Monetarios con Pérdidas en Dólares y Soles */}
        <div
          style={{
            background: 'rgba(67, 20, 7, 0.35)',
            border: '1px solid rgba(249, 115, 22, 0.45)',
            borderRadius: '6px',
            padding: '0.45rem 0.7rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '0.65rem', color: '#fdba74', textTransform: 'uppercase', fontWeight: 800 }}>
              Costo Total Facturable con Pérdidas (Sin IGV):
            </div>
            <div style={{ fontSize: '0.63rem', color: '#fed7aa' }}>
              TC: S/. {formatearNumero(tipoCambio, 3)} ({fuenteTC})
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.02rem', fontWeight: 900, color: '#fb923c', lineHeight: 1.1 }}>
              $ {formatearNumero(costoTotal_USD, 2)} <span style={{ fontSize: '0.65rem', color: '#fed7aa' }}>USD</span>
            </div>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#fed7aa' }}>
              S/. {formatearNumero(costoTotal_PEN, 2)} <span style={{ fontSize: '0.63rem', color: '#fdba74' }}>PEN</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Pie de Tarjeta: Resumen Técnico del Factor de Pérdida */}
      <div style={{ borderTop: '1px solid #1e293b', paddingTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.67rem', color: '#cbd5e1' }}>
          <Flame size={12} color={ACCENT} />
          <span>
            Factor aplicado: <strong style={{ color: '#f97316' }}>+{porcentajePerdida.toFixed(2)}%</strong> (Transmisión B.G Kallpa La Curva vs Sede)
          </span>
        </div>
        <div style={{ fontSize: '0.63rem', color: '#94a3b8' }}>
          Barra B.G: <strong style={{ color: '#fed7aa' }}>{valorBarra} {unidadBarra}</strong> vs Sede: <strong style={{ color: '#7dd3fc' }}>{valorSede} {unidadSede}</strong> (Factor: {factorPerdidaSede.toFixed(4)})
        </div>
      </div>
    </div>
  );
};

export default CardAnalisisEnergiasConPerdidas;
