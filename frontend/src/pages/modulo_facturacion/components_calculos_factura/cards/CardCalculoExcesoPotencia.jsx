import React, { useState, useMemo } from 'react';
import { AlertTriangle, HelpCircle, ChevronDown, CheckCircle2, ShieldCheck, Flame, DollarSign, ArrowRight } from 'lucide-react';
import { getTrelloCardStyle } from '../../components_configuracion_variables/utils/trelloCardStyles';
import { adaptarNombreAPotencia } from '../../medidores_virtuales/useMedidoresVirtuales';
import { calcularLiquidacionExcesoPotencia } from '../utils/calculoExcesoPotenciaService';
import ModalExplicacionExcesoPotencia from '../modals/ModalExplicacionExcesoPotencia';

const ACCENT = '#f43f5e';

const formatearNumero = (valor, decimales = 2) => {
  if (valor === null || valor === undefined || isNaN(valor)) return '0.00';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
};

const CardCalculoExcesoPotencia = ({ resultadoMaximasDemandas, variables }) => {
  const [hovered, setHovered] = useState(false);
  const [circuitoSeleccionado, setCircuitoSeleccionado] = useState('virtual_default');
  const [modalAbierto, setModalAbierto] = useState(false);

  // Cálculo reactivo según el circuito seleccionado y las variables de contrato
  const calculo = useMemo(() => {
    return calcularLiquidacionExcesoPotencia(resultadoMaximasDemandas, variables, circuitoSeleccionado);
  }, [resultadoMaximasDemandas, variables, circuitoSeleccionado]);

  if (!resultadoMaximasDemandas || !resultadoMaximasDemandas.consolidado || !calculo) {
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
          Esperando datos de demanda máxima para liquidar exceso de potencia...
        </div>
      </div>
    );
  }

  const { circuitos = [] } = resultadoMaximasDemandas;
  const hayExceso = calculo.hayExceso;

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          ...getTrelloCardStyle(hayExceso ? ACCENT : '#10b981', hovered),
          width: '450px',
          maxWidth: '490px',
          minWidth: '370px',
          flex: '0 0 auto',
        }}
      >
        {/* 1. Cabecera con Título, Estado y Botón de Modal Educativo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <div
              style={{
                padding: '0.45rem',
                borderRadius: '8px',
                background: hayExceso ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                color: hayExceso ? ACCENT : '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {hayExceso ? <Flame size={18} /> : <ShieldCheck size={18} />}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                Exceso de Potencia
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                Liquidación Comercial HP y HFP (kW)
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            {/* Botón de apertura del modal explicativo */}
            <button
              type="button"
              onClick={() => setModalAbierto(true)}
              title="Ver fórmula, base legal y desglose detallado de cálculo"
              style={{
                background: 'rgba(244, 63, 94, 0.12)',
                border: '1px solid rgba(244, 63, 94, 0.35)',
                color: '#fda4af',
                borderRadius: '6px',
                padding: '0.25rem 0.5rem',
                fontSize: '0.7rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(244, 63, 94, 0.25)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(244, 63, 94, 0.12)';
                e.currentTarget.style.color = '#fda4af';
              }}
            >
              <HelpCircle size={13} />
              <span>¿Cómo se calcula?</span>
            </button>
          </div>
        </div>

        {/* 2. Selector de Vista / Medidor */}
        <div style={{ marginTop: '0.1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
              Suministro / Circuito a Liquidar
            </span>
            <span style={{ fontSize: '0.66rem', color: '#fda4af', fontWeight: 600 }}>
              Tolerancia: {calculo.toleranciaPct}%
            </span>
          </div>

          <div style={{ position: 'relative' }}>
            <select
              value={circuitoSeleccionado}
              onChange={(e) => setCircuitoSeleccionado(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 2rem 0.45rem 0.65rem',
                background: '#090d16',
                border: '1px solid #334155',
                borderRadius: '7px',
                color: '#f8fafc',
                fontSize: '0.78rem',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                boxSizing: 'border-box',
              }}
            >
              {circuitos.some((c) => c.esVirtual) && (
                <optgroup label="🟣 Medidores Virtualizados (Facturable)">
                  {circuitos
                    .filter((c) => c.esVirtual)
                    .map((c) => (
                      <option key={c.key} value={c.key}>
                        🟣 {adaptarNombreAPotencia(c.alias)} (Recomendado)
                      </option>
                    ))}
                </optgroup>
              )}

              <option value="total">⚡ Toda la Planta (Total Consolidado Físico)</option>

              <optgroup label="⚡ Circuitos Físicos de Acometida">
                {circuitos
                  .filter((c) => !c.esVirtual)
                  .map((c) => (
                    <option key={c.key} value={c.key}>
                      {adaptarNombreAPotencia(c.alias)} {c.codigo ? `(${c.codigo})` : ''}
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

        {/* 3. Banner de Estado Global de Exceso */}
        <div
          style={{
            background: hayExceso
              ? 'linear-gradient(135deg, rgba(244, 63, 94, 0.15) 0%, rgba(136, 19, 55, 0.2) 100%)'
              : 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(6, 78, 59, 0.15) 100%)',
            border: `1px solid ${hayExceso ? 'rgba(244, 63, 94, 0.35)' : 'rgba(16, 185, 129, 0.3)'}`,
            borderRadius: '8px',
            padding: '0.6rem 0.8rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '0.68rem', color: hayExceso ? '#fda4af' : '#6ee7b7', fontWeight: 700, textTransform: 'uppercase' }}>
              {hayExceso ? '⚠ Penalidad por Exceso' : '✓ Operación Conforme'}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: hayExceso ? '#fff1f2' : '#ecfdf5', lineHeight: 1.1 }}>
              {hayExceso ? `${formatearNumero(calculo.excesoTotal_KW, 2)} kW` : '0.00 kW'}
            </div>
            <span style={{ fontSize: '0.67rem', color: hayExceso ? '#f43f5e' : '#10b981', fontWeight: 600 }}>
              {hayExceso ? `Exceso equivalente a ${formatearNumero(calculo.excesoTotal_MW, 3)} MW` : 'Dentro de la tolerancia contractual'}
            </span>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.67rem', color: '#94a3b8', display: 'block' }}>Costo a Liquidar</span>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: hayExceso ? '#fb7185' : '#34d399' }}>
              ${formatearNumero(calculo.costoTotal_USD, 2)}
            </div>
            <span style={{ fontSize: '0.69rem', color: '#94a3b8' }}>
              S/ {formatearNumero(calculo.costoTotal_PEN, 2)}
            </span>
          </div>
        </div>

        {/* 4. Bloques comparativos HP y HFP */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
          {/* Horas Punta */}
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.06)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '8px',
              padding: '0.55rem 0.65rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#fbbf24', fontWeight: 700 }}>Horas Punta (HP)</span>
              <span style={{ fontSize: '0.64rem', color: '#fde68a', background: 'rgba(245, 158, 11, 0.2)', padding: '0.08rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>
                18 - 23 hrs
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8' }}>
              <span>Límite (+{calculo.toleranciaPct}%):</span>
              <span style={{ color: '#f8fafc', fontWeight: 700 }}>{formatearNumero(calculo.limiteHP_KW, 2)} kW</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8' }}>
              <span>Máx. Registrada:</span>
              <span style={{ color: '#fbbf24', fontWeight: 800 }}>{formatearNumero(calculo.maxHP.potenciaKW, 2)} kW</span>
            </div>

            <div
              style={{
                borderTop: '1px dashed rgba(245, 158, 11, 0.25)',
                paddingTop: '0.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <span style={{ fontSize: '0.66rem', color: calculo.excesoHP_KW > 0 ? '#f43f5e' : '#10b981', fontWeight: 700 }}>
                {calculo.excesoHP_KW > 0 ? `+${formatearNumero(calculo.excesoHP_KW, 2)} kW exceso` : 'Sin exceso'}
              </span>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, color: calculo.excesoHP_KW > 0 ? '#fb7185' : '#10b981' }}>
                ${formatearNumero(calculo.costoHP_USD, 2)}
              </span>
            </div>
          </div>

          {/* Horas Fuera de Punta */}
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.06)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '8px',
              padding: '0.55rem 0.65rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#38bdf8', fontWeight: 700 }}>Fuera Punta (HFP)</span>
              <span style={{ fontSize: '0.64rem', color: '#bae6fd', background: 'rgba(56, 189, 248, 0.2)', padding: '0.08rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>
                Resto del día
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8' }}>
              <span>Límite (+{calculo.toleranciaPct}%):</span>
              <span style={{ color: '#f8fafc', fontWeight: 700 }}>{formatearNumero(calculo.limiteHFP_KW, 2)} kW</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8' }}>
              <span>Máx. Registrada:</span>
              <span style={{ color: '#38bdf8', fontWeight: 800 }}>{formatearNumero(calculo.maxHFP.potenciaKW, 2)} kW</span>
            </div>

            <div
              style={{
                borderTop: '1px dashed rgba(56, 189, 248, 0.25)',
                paddingTop: '0.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <span style={{ fontSize: '0.66rem', color: calculo.excesoHFP_KW > 0 ? '#f43f5e' : '#10b981', fontWeight: 700 }}>
                {calculo.excesoHFP_KW > 0 ? `+${formatearNumero(calculo.excesoHFP_KW, 2)} kW exceso` : 'Sin exceso'}
              </span>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, color: calculo.excesoHFP_KW > 0 ? '#fb7185' : '#10b981' }}>
                ${formatearNumero(calculo.costoHFP_USD, 2)}
              </span>
            </div>
          </div>
        </div>

        {/* 5. Pie de trazabilidad comercial */}
        <div
          style={{
            borderTop: '1px solid #1e293b',
            paddingTop: '0.45rem',
            marginTop: '0.1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            fontSize: '0.69rem',
            color: '#64748b',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              Tarifa unitaria: <strong>${formatearNumero(calculo.precioHP_KW, 2)}/kW</strong> (TC: {formatearNumero(calculo.tipoCambio, 3)})
            </span>
            <span style={{ color: '#94a3b8' }}>
              Criterio: {calculo.aplicaCriterio === 'solo_HP' ? 'Solo HP' : calculo.aplicaCriterio === 'maximo_mensual' ? 'Máx Mensual' : 'HP + HFP'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#fda4af', fontWeight: 600 }}>
              {calculo.nombreFuente}
            </span>
            <span style={{ color: '#64748b' }}>
              Base: Contrato P. Contratada
            </span>
          </div>
        </div>
      </div>

      {/* Modal Educativo e Interactivo de Explicación y Ejemplo */}
      <ModalExplicacionExcesoPotencia
        isOpen={modalAbierto}
        onClose={() => setModalAbierto(false)}
        dataCalculo={calculo}
      />
    </>
  );
};

export default CardCalculoExcesoPotencia;
