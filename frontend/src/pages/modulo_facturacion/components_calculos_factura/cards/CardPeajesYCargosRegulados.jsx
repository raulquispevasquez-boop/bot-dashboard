import React, { useState, useMemo } from 'react';
import { Layers, Info, CheckCircle2, Sliders, AlertCircle, FileSpreadsheet, ChevronDown } from 'lucide-react';
import { getTrelloCardStyle } from '../../components_configuracion_variables/utils/trelloCardStyles';
import { buscarPotenciaCoincidente } from '../../components_registro_potencia/utils/buscarPotenciaCoincidente';

const ACCENT = '#a855f7'; // Púrpura eléctrico acorde al encabezado de la imagen

const formatearNumero = (valor, decimales = 2) => {
  if (valor === null || valor === undefined || valor === '' || isNaN(Number(valor))) return '—';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
};

import {
  CONCEPTOS_PEAJES_DEFAULT,
  obtenerPrecioDesdeVariables,
} from '../utils/peajesReguladosService';
import { calcularVAD } from '../utils/calculoVADService';

const CardPeajesYCargosRegulados = ({ resultadoEnergias, variables }) => {
  const [hovered, setHovered] = useState(false);
  const [circuitoSeleccionado, setCircuitoSeleccionado] = useState('virtual_default');
  const peajesConfig = variables?.peajesRegulados || {};

  // 1. Obtener la Demanda Coincidente (kW) registrada en la fecha y hora seleccionada en Botón 3
  const demanda = variables?.demandaCoincidente || {};
  const fechaCoincidente = demanda.fecha || '2026-08-26';
  const horaCoincidente = demanda.hora || '19:00';

  const resultadoCoincidente = useMemo(() => {
    return buscarPotenciaCoincidente(fechaCoincidente, horaCoincidente);
  }, [fechaCoincidente, horaCoincidente]);

  const circuitosCoincidentes = resultadoCoincidente?.circuitos || [];
  const circuitoActivoKey = circuitoSeleccionado === 'virtual_default'
    ? (resultadoCoincidente?.medidorVirtualKey || 'total')
    : circuitoSeleccionado;

  // Demanda Coincidente para el circuito seleccionado
  let potenciaCoincidenteKW = 0;
  if (circuitoActivoKey === 'total') {
    potenciaCoincidenteKW = resultadoCoincidente?.totalFisicoKW ?? 0;
  } else if (resultadoCoincidente?.medidorVirtualKey && circuitoActivoKey === resultadoCoincidente.medidorVirtualKey) {
    potenciaCoincidenteKW = resultadoCoincidente.potenciaKW;
  } else {
    const circ = circuitosCoincidentes.find((c) => c.key === circuitoActivoKey);
    potenciaCoincidenteKW = circ ? circ.potenciaKW : (resultadoCoincidente?.potenciaKW ?? 0);
  }

  // 2. Obtener la Energía Total Sin Pérdidas (kWh) para el circuito seleccionado
  const circuitosEnergia = resultadoEnergias?.circuitos || [];
  const consolidadoEnergia = resultadoEnergias?.consolidado;
  let energiaTotalSinPerdidaKWh = 0;
  if (circuitoActivoKey === 'total') {
    energiaTotalSinPerdidaKWh = consolidadoEnergia?.total_kWh || 0;
  } else {
    const circE = circuitosEnergia.find((c) => c.key === circuitoActivoKey);
    if (circE) {
      energiaTotalSinPerdidaKWh = circE.total_kWh || 0;
    } else if (circuitosEnergia.some((c) => c.esVirtual)) {
      const virt = circuitosEnergia.find((c) => c.esVirtual);
      energiaTotalSinPerdidaKWh = virt?.total_kWh || consolidadoEnergia?.total_kWh || 0;
    } else {
      energiaTotalSinPerdidaKWh = consolidadoEnergia?.total_kWh || 0;
    }
  }

  // 3. Obtener el cálculo de VAD en HP y HFP
  const vadData = useMemo(() => {
    return calcularVAD({
      periodoFacturacion: variables?.periodoFacturacion || '2026-08',
      historicoPotencias: variables?.historicoPotencias || {},
      circuitoKey: circuitoActivoKey,
      peajesConfig,
    });
  }, [variables?.periodoFacturacion, variables?.historicoPotencias, peajesConfig, circuitoActivoKey]);

  // Mapear cada concepto con sus cantidades adecuadas solicitadas por el usuario
  const filasCalculadas = useMemo(() => {
    return CONCEPTOS_PEAJES_DEFAULT.map((item) => {
      let cantNum = null;
      let precioNum = null;

      // Obtener precio unitario configurado
      const precioDesdeConfig = obtenerPrecioDesdeVariables(item.id, peajesConfig);

      switch (item.id) {
        case 'peaje_principal':
          // Peaje principal = Demanda coincidente en kW
          cantNum = potenciaCoincidenteKW > 0 ? potenciaCoincidenteKW : null;
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : 35.533;
          break;

        case 'peaje_secundario_ad15':
          // Peaje Secundario AD15-MT = Energía total sin pérdidas en kWh
          cantNum = energiaTotalSinPerdidaKWh > 0 ? energiaTotalSinPerdidaKWh : null;
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : 0.188;
          break;

        case 'peaje_secundario_ad7':
          // Peaje Secundario AD7-MT = Energía total sin pérdidas en kWh
          cantNum = energiaTotalSinPerdidaKWh > 0 ? energiaTotalSinPerdidaKWh : null;
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : 4.574;
          break;

        case 'peaje_secundario_cpsee':
          // Solicitado por el usuario: Dejar por el momento sin valores en cantidad
          cantNum = null;
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : 0.000;
          break;

        case 'cargo_fijo':
          // Solicitado por el usuario: Ponle 1
          cantNum = 1;
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : 6.380;
          break;

        case 'mantenimiento_reposicion':
          // Solicitado por el usuario: Ponle 1
          cantNum = 1;
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : 36.990;
          break;

        case 'alumbrado_publico':
          // Solicitado por el usuario: Ponle 1,668.000
          cantNum = 1;
          precioNum = precioDesdeConfig !== null && Number(precioDesdeConfig) !== 2520 ? Number(precioDesdeConfig) : 1668.000;
          break;

        case 'vad_hp':
          // VAD Horas Punta: promedio de las 2 mayores demandas en HP de los últimos 6 meses
          cantNum = vadData.potenciaVAD_HP > 0 ? vadData.potenciaVAD_HP : null;
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : 13.438;
          break;

        case 'vad_hfp':
          // VAD Horas Fuera de Punta: exceso de la demanda HFP sobre la HP
          cantNum = vadData.potenciaVAD_HFP > 0 ? vadData.potenciaVAD_HFP : (vadData.potenciaVAD_HP > 0 ? 0 : null);
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : 14.460;
          break;

        case 'reactiva_inductiva':
          cantNum = null;
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : 4.750;
          break;

        case 'reactiva_capacitiva':
          cantNum = null;
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : 9.500;
          break;

        case 'otros':
        default:
          cantNum = null;
          precioNum = precioDesdeConfig !== null && precioDesdeConfig !== undefined ? Number(precioDesdeConfig) : null;
          break;
      }

      let facturadoSoles = null;
      let formulaTextoEnVivo = item.formulaDesc;

      if (cantNum !== null && precioNum !== null) {
        if (item.esCentimos) {
          facturadoSoles = Math.round(((cantNum * precioNum) / 100) * 100) / 100;
          formulaTextoEnVivo = `${formatearNumero(cantNum, 2)} ${item.unidadCantidad} × ${precioNum} ${item.unidadPrecio} ÷ 100`;
        } else {
          facturadoSoles = Math.round((cantNum * precioNum) * 100) / 100;
          formulaTextoEnVivo = `${formatearNumero(cantNum, 2)} ${item.unidadCantidad} × ${precioNum} ${item.unidadPrecio}`;
        }
      } else if (precioNum !== null) {
        formulaTextoEnVivo = item.esCentimos
          ? `[Cantidad] × ${precioNum} ${item.unidadPrecio} ÷ 100`
          : `[Cantidad] × ${precioNum} ${item.unidadPrecio}`;
      }

      return {
        ...item,
        cantNum,
        precioNum,
        facturadoSoles,
        formulaTextoEnVivo,
      };
    });
  }, [potenciaCoincidenteKW, energiaTotalSinPerdidaKWh, peajesConfig, vadData]);

  // Cálculo del Subtotal de Peajes S/.
  const subTotalPeajesSoles = filasCalculadas.reduce((acc, curr) => {
    return acc + (curr.facturadoSoles !== null ? curr.facturadoSoles : 0);
  }, 0);

  const hayDatosCargados = filasCalculadas.some((f) => f.facturadoSoles !== null);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...getTrelloCardStyle(ACCENT, hovered),
        width: '100%',
        maxWidth: '100%',
        minWidth: '370px',
        flex: '1 1 100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* 1. Barra de Encabezado Superior Púrpura tal cual la imagen */}
      <div
        style={{
          background: 'linear-gradient(135deg, #2e1065 0%, #3b0764 50%, #1e112a 100%)',
          borderRadius: '7px 7px 0 0',
          padding: '0.65rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '2px solid #581c87',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <div
            style={{
              padding: '0.35rem',
              borderRadius: '6px',
              background: 'rgba(216, 180, 254, 0.2)',
              color: '#f3e8ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Layers size={17} />
          </div>
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '0.96rem',
                fontWeight: 800,
                color: '#ffffff',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              PEAJES Y CARGOS REGULADOS
            </h3>
            <span style={{ fontSize: '0.7rem', color: '#e9d5ff' }}>
              Pliego Tarifario y Liquidación de Transmisión / Distribución (S/.)
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Selector de Circuito / Medidor */}
          <div style={{ position: 'relative' }}>
            <select
              value={circuitoActivoKey}
              onChange={(e) => setCircuitoSeleccionado(e.target.value)}
              style={{
                background: '#150a24',
                border: '1px solid #7e22ce',
                borderRadius: '6px',
                padding: '0.22rem 1.6rem 0.22rem 0.55rem',
                color: '#f3e8ff',
                fontSize: '0.72rem',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
              }}
            >
              {resultadoCoincidente?.medidorVirtualKey && (
                <option value={resultadoCoincidente.medidorVirtualKey}>
                  🟣 {resultadoCoincidente.nombreFuente || 'Medidor Virtual'}
                </option>
              )}
              <option value="total">⚡ Toda la Planta (Total Consolidado)</option>
              {circuitosCoincidentes
                .filter((c) => !c.esVirtual)
                .map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.alias} {c.codigo ? `(${c.codigo})` : ''}
                  </option>
                ))}
            </select>
            <ChevronDown
              size={13}
              color="#d8b4fe"
              style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            />
          </div>

          <span
            style={{
              fontSize: '0.67rem',
              background: 'rgba(216, 180, 254, 0.15)',
              border: '1px solid rgba(216, 180, 254, 0.3)',
              color: '#f3e8ff',
              padding: '0.2rem 0.55rem',
              borderRadius: '12px',
              fontWeight: 700,
            }}
          >
            Esquema Osinergmin
          </span>
        </div>
      </div>

      {/* 2. Banner de Información y Verificación de Unidades */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(88, 28, 135, 0.25) 0%, rgba(30, 27, 75, 0.35) 100%)',
          border: '1px solid rgba(168, 85, 247, 0.3)',
          borderRadius: '8px',
          padding: '0.6rem 0.85rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.55rem',
          margin: '0.4rem 0.2rem 0.6rem 0.2rem',
        }}
      >
        <Info size={17} color="#c084fc" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '0.74rem', color: '#e2e8f0', lineHeight: 1.45 }}>
          <strong style={{ color: '#d8b4fe' }}>Verificación y Transformación Automática de Unidades:</strong>{' '}
          Las cantidades se vincularán a las variables del sistema en sus unidades correspondientes (<strong>kW</strong>, <strong>kWh</strong>, <strong>kVArh</strong>, <strong>mes</strong>).{' '}
          Los precios unitarios expresados en céntimos (<strong>ctm. S/./kWh</strong> y <strong>ctm. S/./kVArh</strong>) se transforman automáticamente dividiendo entre 100 para facturar de manera exacta en <strong>Soles (S/.)</strong>.{' '}
          <span style={{ color: '#a855f7', fontWeight: 600 }}>
            * Cantidades y Precios Unitarios se encuentran listos y a la espera de la asignación de variables.
          </span>
        </div>
      </div>

      {/* 3. Tabla Completa con las 8 Columnas */}
      <div
        style={{
          overflowX: 'auto',
          borderRadius: '8px',
          border: '1px solid #1e293b',
          background: '#090d16',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.74rem',
            textAlign: 'left',
          }}
        >
          <thead>
            <tr
              style={{
                background: '#1a102f',
                color: '#f1f5f9',
                borderBottom: '1px solid #334155',
              }}
            >
              <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, minWidth: '170px' }}>
                Concepto
              </th>
              <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, minWidth: '220px', color: '#d8b4fe' }}>
                Variable de cantidad
              </th>
              <th style={{ padding: '0.65rem 0.6rem', fontWeight: 700, textAlign: 'right', minWidth: '95px' }}>
                Cantidad
              </th>
              <th style={{ padding: '0.65rem 0.5rem', fontWeight: 700, textAlign: 'center', minWidth: '65px' }}>
                Unidad
              </th>
              <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, minWidth: '200px', color: '#c084fc' }}>
                Fórmula
              </th>
              <th style={{ padding: '0.65rem 0.6rem', fontWeight: 700, textAlign: 'right', minWidth: '100px' }}>
                Precio Unitario
              </th>
              <th style={{ padding: '0.65rem 0.5rem', fontWeight: 700, textAlign: 'center', minWidth: '90px' }}>
                Unidad
              </th>
              <th
                style={{
                  padding: '0.65rem 0.75rem',
                  fontWeight: 800,
                  textAlign: 'right',
                  color: '#f8fafc',
                  background: '#24143d',
                  minWidth: '110px',
                }}
              >
                Facturado S/.
              </th>
            </tr>
          </thead>
          <tbody>
            {filasCalculadas.map((fila, index) => {
              const bgFila = index % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)';

              return (
                <tr
                  key={fila.id}
                  style={{
                    background: bgFila,
                    borderBottom: '1px solid #161f30',
                    transition: 'background 0.12s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168, 85, 247, 0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = bgFila; }}
                >
                  {/* 1. Concepto */}
                  <td style={{ padding: '0.55rem 0.75rem', fontWeight: 600, color: '#f8fafc' }}>
                    {fila.concepto}
                  </td>

                  {/* 2. Variable de Cantidad */}
                  <td style={{ padding: '0.55rem 0.75rem', color: '#cbd5e1' }}>
                    {fila.variableCantidad}
                  </td>

                  {/* 3. Cantidad */}
                  <td style={{ padding: '0.55rem 0.6rem', textAlign: 'right', fontFamily: 'monospace', color: '#f8fafc', fontWeight: 700 }}>
                    {formatearNumero(fila.cantNum, 2)}
                  </td>

                  {/* 4. Unidad Cantidad */}
                  <td style={{ padding: '0.55rem 0.5rem', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>
                    {fila.unidadCantidad}
                  </td>

                  {/* 5. Fórmula */}
                  <td style={{ padding: '0.55rem 0.75rem', color: '#a78bfa', fontSize: '0.71rem', fontFamily: 'monospace' }}>
                    {fila.formulaTextoEnVivo}
                  </td>

                  {/* 6. Precio Unitario */}
                  <td style={{ padding: '0.55rem 0.6rem', textAlign: 'right', fontFamily: 'monospace', color: '#e2e8f0', fontWeight: 600 }}>
                    {formatearNumero(fila.precioNum, 3)}
                  </td>

                  {/* 7. Unidad Precio */}
                  <td style={{ padding: '0.55rem 0.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.71rem' }}>
                    {fila.unidadPrecio}
                  </td>

                  {/* 8. Facturado S/. */}
                  <td
                    style={{
                      padding: '0.55rem 0.75rem',
                      textAlign: 'right',
                      fontFamily: 'monospace',
                      fontWeight: 800,
                      color: fila.facturadoSoles !== null ? '#f8fafc' : '#64748b',
                      background: 'rgba(36, 20, 61, 0.4)',
                    }}
                  >
                    {formatearNumero(fila.facturadoSoles, 2)}
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Fila Final de Sub Total */}
          <tfoot>
            <tr
              style={{
                background: 'linear-gradient(135deg, #160c29 0%, #24143d 100%)',
                borderTop: '2px solid #581c87',
                color: '#ffffff',
              }}
            >
              <td
                colSpan={7}
                style={{
                  padding: '0.75rem 1rem',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  letterSpacing: '0.02em',
                }}
              >
                Sub Total Peajes S/.
              </td>
              <td
                style={{
                  padding: '0.75rem 0.75rem',
                  textAlign: 'right',
                  fontFamily: 'monospace',
                  fontSize: '0.95rem',
                  fontWeight: 800,
                  color: hayDatosCargados ? '#a855f7' : '#94a3b8',
                  background: '#2b124c',
                }}
              >
                {hayDatosCargados ? formatearNumero(subTotalPeajesSoles, 2) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 4. Pie de Control y Estado */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: '0.5rem',
          marginTop: '0.2rem',
          fontSize: '0.7rem',
          color: '#64748b',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <CheckCircle2 size={13} color="#10b981" />
          <span>Estructura automatizable preparada para enlace de variables y hojas de cálculo</span>
        </span>
        <span style={{ color: '#c084fc', fontWeight: 600 }}>
          {filasCalculadas.length} conceptos regulados
        </span>
      </div>
    </div>
  );
};

export default CardPeajesYCargosRegulados;
