import React, { useState, useMemo } from 'react';
import { Layers, HelpCircle, ChevronDown, CheckCircle2, ShieldCheck, Flame, Sliders, ArrowRight } from 'lucide-react';
import { getTrelloCardStyle } from '../../components_configuracion_variables/utils/trelloCardStyles';
import { adaptarNombreAPotencia } from '../../medidores_virtuales/useMedidoresVirtuales';
import { calcularLiquidacionExcesoEnergia } from '../utils/calculoExcesoEnergiaService';
import ModalExplicacionExcesoEnergia from '../modals/ModalExplicacionExcesoEnergia';

const ACCENT = '#d946ef';

const formatearNumero = (valor, decimales = 2) => {
  if (valor === null || valor === undefined || isNaN(valor)) return '0.00';
  return Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
};

const CardCalculoExcesoEnergia = ({ resultadoEnergias, variables }) => {
  const [hovered, setHovered] = useState(false);
  const [circuitoSeleccionado, setCircuitoSeleccionado] = useState('virtual_default');
  const [modalidadSeleccionada, setModalidadSeleccionada] = useState(
    variables?.excesoEnergia?.aplicaSobre || 'factor_carga'
  );
  const [modalAbierto, setModalAbierto] = useState(false);

  // Cálculo reactivo según el circuito, la modalidad elegida y las variables
  const calculo = useMemo(() => {
    return calcularLiquidacionExcesoEnergia(
      resultadoEnergias,
      variables,
      circuitoSeleccionado,
      modalidadSeleccionada
    );
  }, [resultadoEnergias, variables, circuitoSeleccionado, modalidadSeleccionada]);

  if (!resultadoEnergias || !resultadoEnergias.consolidado || !calculo) {
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
          Esperando registros de energía activa para liquidar exceso de energía...
        </div>
      </div>
    );
  }

  const { circuitos = [] } = resultadoEnergias;
  const esModA = modalidadSeleccionada === 'bloque_fijo';
  const dataMod = esModA ? calculo.modalidadA : calculo.modalidadB;
  const hayExceso = dataMod.hayExceso;

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          ...getTrelloCardStyle(hayExceso ? '#ef4444' : ACCENT, hovered),
          width: '450px',
          maxWidth: '490px',
          minWidth: '370px',
          flex: '0 0 auto',
        }}
      >
        {/* 1. Cabecera con Título y Botón Modal Educativo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <div
              style={{
                padding: '0.45rem',
                borderRadius: '8px',
                background: hayExceso ? 'rgba(239, 68, 68, 0.15)' : 'rgba(217, 70, 239, 0.15)',
                color: hayExceso ? '#ef4444' : ACCENT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {hayExceso ? <Flame size={18} /> : <Layers size={18} />}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                Exceso de Energía
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                Liquidación Comercial HP y HFP (MWh)
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <button
              type="button"
              onClick={() => setModalAbierto(true)}
              title="Ver fórmulas, comparativa de modalidades y ejemplos numéricos"
              style={{
                background: 'rgba(217, 70, 239, 0.12)',
                border: '1px solid rgba(217, 70, 239, 0.35)',
                color: '#f0abfc',
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
                e.currentTarget.style.background = 'rgba(217, 70, 239, 0.25)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(217, 70, 239, 0.12)';
                e.currentTarget.style.color = '#f0abfc';
              }}
            >
              <HelpCircle size={13} />
              <span>¿Cómo se calcula?</span>
            </button>
          </div>
        </div>

        {/* 2. Pestañas Selectoras de Modalidad (A vs B) */}
        <div style={{ marginTop: '0.1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
              Modalidad Contractual
            </span>
            <span style={{ fontSize: '0.66rem', color: '#f0abfc', fontWeight: 600 }}>
              {esModA ? 'Base: Bloque MWh' : 'Base: Factor de Carga %'}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              background: '#090d16',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid #1e293b',
              gap: '4px',
            }}
          >
            <button
              type="button"
              onClick={() => setModalidadSeleccionada('factor_carga')}
              style={{
                background: !esModA ? 'linear-gradient(135deg, rgba(217, 70, 239, 0.25) 0%, rgba(168, 85, 247, 0.25) 100%)' : 'transparent',
                border: !esModA ? '1px solid rgba(217, 70, 239, 0.45)' : '1px solid transparent',
                color: !esModA ? '#fdf4ff' : '#94a3b8',
                borderRadius: '6px',
                padding: '0.35rem 0.5rem',
                fontSize: '0.72rem',
                fontWeight: !esModA ? 700 : 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.3rem',
                transition: 'all 0.15s ease',
              }}
            >
              <Sliders size={12} color={!esModA ? ACCENT : '#64748b'} />
              <span>Mod. B: Factor Carga</span>
            </button>

            <button
              type="button"
              onClick={() => setModalidadSeleccionada('bloque_fijo')}
              style={{
                background: esModA ? 'linear-gradient(135deg, rgba(217, 70, 239, 0.25) 0%, rgba(168, 85, 247, 0.25) 100%)' : 'transparent',
                border: esModA ? '1px solid rgba(217, 70, 239, 0.45)' : '1px solid transparent',
                color: esModA ? '#fdf4ff' : '#94a3b8',
                borderRadius: '6px',
                padding: '0.35rem 0.5rem',
                fontSize: '0.72rem',
                fontWeight: esModA ? 700 : 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.3rem',
                transition: 'all 0.15s ease',
              }}
            >
              <Layers size={12} color={esModA ? ACCENT : '#64748b'} />
              <span>Mod. A: Bloque Fijo</span>
            </button>
          </div>
        </div>

        {/* 3. Selector de Suministro / Circuito */}
        <div>
          <div style={{ position: 'relative' }}>
            <select
              value={circuitoSeleccionado}
              onChange={(e) => setCircuitoSeleccionado(e.target.value)}
              style={{
                width: '100%',
                padding: '0.42rem 2rem 0.42rem 0.65rem',
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

        {/* 4. Banner de Estado Global de Exceso de Energía */}
        <div
          style={{
            background: hayExceso
              ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(153, 27, 27, 0.2) 100%)'
              : 'linear-gradient(135deg, rgba(217, 70, 239, 0.12) 0%, rgba(112, 26, 117, 0.15) 100%)',
            border: `1px solid ${hayExceso ? 'rgba(239, 68, 68, 0.35)' : 'rgba(217, 70, 239, 0.3)'}`,
            borderRadius: '8px',
            padding: '0.6rem 0.8rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '0.68rem', color: hayExceso ? '#fca5a5' : '#f0abfc', fontWeight: 700, textTransform: 'uppercase' }}>
              {hayExceso ? '⚠ Penalidad Exceso de Energía' : '✓ Consumo Dentro de Modulación'}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: hayExceso ? '#fef2f2' : '#fdf4ff', lineHeight: 1.1 }}>
              {hayExceso ? `${formatearNumero(dataMod.excesoTotal_MWh, 3)} MWh` : '0.000 MWh'}
            </div>
            <span style={{ fontSize: '0.67rem', color: hayExceso ? '#ef4444' : '#d946ef', fontWeight: 600 }}>
              {hayExceso
                ? `Equivale a ${formatearNumero(dataMod.excesoTotal_MWh * 1000, 1)} kWh excedidos`
                : esModA
                  ? `Consumo total ${formatearNumero(calculo.regTotal_MWh, 2)} MWh < Bloque ${formatearNumero(dataMod.bloqueTotalMWh, 0)} MWh`
                  : `Dentro de modulación FC ${dataMod.factorCargaObjetivoPct}%`}
            </span>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.67rem', color: '#94a3b8', display: 'block' }}>Costo a Liquidar</span>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: hayExceso ? '#f87171' : '#e879f9' }}>
              ${formatearNumero(dataMod.costoTotal_USD, 2)}
            </div>
            <span style={{ fontSize: '0.69rem', color: '#94a3b8' }}>
              S/ {formatearNumero(dataMod.costoTotal_PEN, 2)}
            </span>
          </div>
        </div>

        {/* 5. Bloques comparativos HP y HFP */}
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
                {calculo.horasHP} hrs
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8' }}>
              <span>Base {esModA ? 'Bloque' : 'FC'}:</span>
              <span style={{ color: '#f8fafc', fontWeight: 700 }}>
                {esModA ? `${formatearNumero(dataMod.bloqueAsignadoHP_MWh, 2)} MWh` : `${formatearNumero(dataMod.topeEnergiaHP_MWh, 2)} MWh`}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8' }}>
              <span>Registrada:</span>
              <span style={{ color: '#fbbf24', fontWeight: 800 }}>{formatearNumero(calculo.regHP_MWh, 2)} MWh</span>
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
              <span style={{ fontSize: '0.66rem', color: dataMod.excesoHP_MWh > 0 ? '#ef4444' : '#10b981', fontWeight: 700 }}>
                {dataMod.excesoHP_MWh > 0 ? `+${formatearNumero(dataMod.excesoHP_MWh, 3)} MWh exceso` : 'Sin exceso'}
              </span>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, color: dataMod.excesoHP_MWh > 0 ? '#f87171' : '#10b981' }}>
                ${formatearNumero(dataMod.costoHP_USD, 2)}
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
                {calculo.horasHFP} hrs
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8' }}>
              <span>Base {esModA ? 'Bloque' : 'FC'}:</span>
              <span style={{ color: '#f8fafc', fontWeight: 700 }}>
                {esModA ? `${formatearNumero(dataMod.bloqueAsignadoHFP_MWh, 2)} MWh` : `${formatearNumero(dataMod.topeEnergiaHFP_MWh, 2)} MWh`}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8' }}>
              <span>Registrada:</span>
              <span style={{ color: '#38bdf8', fontWeight: 800 }}>{formatearNumero(calculo.regHFP_MWh, 2)} MWh</span>
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
              <span style={{ fontSize: '0.66rem', color: dataMod.excesoHFP_MWh > 0 ? '#ef4444' : '#10b981', fontWeight: 700 }}>
                {dataMod.excesoHFP_MWh > 0 ? `+${formatearNumero(dataMod.excesoHFP_MWh, 3)} MWh exceso` : 'Sin exceso'}
              </span>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, color: dataMod.excesoHFP_MWh > 0 ? '#f87171' : '#10b981' }}>
                ${formatearNumero(dataMod.costoHFP_USD, 2)}
              </span>
            </div>
          </div>
        </div>

        {/* 6. Pie de Trazabilidad Comercial */}
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
              Tarifa unitaria: <strong>${formatearNumero(calculo.precioHP_MWh, 2)}/MWh</strong> (TC: {formatearNumero(calculo.tipoCambio, 3)})
            </span>
            <span style={{ color: '#d946ef', fontWeight: 600 }}>
              {esModA ? 'Bloque Fijo Asignado' : `FC Objetivo ${dataMod.factorCargaObjetivoPct}%`}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#f0abfc', fontWeight: 600 }}>
              {calculo.nombreFuente}
            </span>
            <span style={{ color: '#64748b' }}>
              Base: Contrato PPA / Suministro
            </span>
          </div>
        </div>
      </div>

      {/* Modal Educativo e Interactivo de Explicación y Ejemplo */}
      <ModalExplicacionExcesoEnergia
        isOpen={modalAbierto}
        onClose={() => setModalAbierto(false)}
        dataCalculo={calculo}
        modalidadSeleccionada={modalidadSeleccionada}
        onCambiarModalidad={(m) => setModalidadSeleccionada(m)}
      />
    </>
  );
};

export default CardCalculoExcesoEnergia;
