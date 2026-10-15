import React from 'react';
import { Sliders, Save, RotateCcw, CheckCircle2, Info, Calendar } from 'lucide-react';
import { useVariablesFacturacion } from './useVariablesFacturacion';
import { formatearMesNombre } from './utils/periodoFacturacionUtils';
import SelectorMesFacturacion from './components/SelectorMesFacturacion';

import CardEnergiaActivaKallpa from './cards/CardEnergiaActivaKallpa';
import CardDemandaCoincidente from './cards/CardDemandaCoincidente';
import CardTipoCambio from './cards/CardTipoCambio';
import CardTarifasClienteLibre from './cards/CardTarifasClienteLibre';
import CardPotenciaContratada from './cards/CardPotenciaContratada';
import CardParametrosFactorK from './cards/CardParametrosFactorK';
import CardExcesoPotencia from './cards/CardExcesoPotencia';
import CardExcesoEnergia from './cards/CardExcesoEnergia';
import CardPeajesRegulados from './cards/CardPeajesRegulados';
import CardOtrosCargos from './cards/CardOtrosCargos';
import CardIntervaloHorasPunta from './cards/CardIntervaloHorasPunta';
import CardTablaDiasNoLaborables from './cards/CardTablaDiasNoLaborables';
import CardHistoricoPotencias from './cards/CardHistoricoPotencias';

const ModuloConfiguracionVariables = () => {
  const {
    variables,
    toastMensaje,
    ultimaActualizacion,
    setToastMensaje,
    mostrarNotificacion,
    updateEnergiaKallpa,
    updateDemandaCoincidente,
    updateTipoCambio,
    updateTarifas,
    updatePotenciaContratada,
    updateParametrosContrato,
    toggleDiaNoLaborable,
    toggleTodosDiasNoLaborables,
    agregarDiaNoLaborable,
    eliminarDiaNoLaborable,
    updatePeriodoFacturacion,
    updatePotenciaMes,
    inyectarPotenciasMesFacturacion,
    updateCircuitoHistorico,
    updatePeajesRegulados,
    updateOtrosCargos,
    updateHorarioPunta,
    updateExcesoPotencia,
    updateExcesoEnergia,
    restablecerPorDefecto,
  } = useVariablesFacturacion();

  const handleGuardarManual = () => {
    mostrarNotificacion('¡Variables de facturación guardadas exitosamente!');
  };

  const handleRestablecer = () => {
    if (window.confirm('¿Deseas restablecer todas las variables a los valores por defecto del sistema?')) {
      restablecerPorDefecto();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* Toast Notificación */}
      {toastMensaje && (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid #10b981',
            borderRadius: '7px',
            padding: '0.45rem 0.85rem',
            color: '#34d399',
            fontSize: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={16} />
            <span>{toastMensaje.texto}</span>
          </div>
          <button onClick={() => setToastMensaje(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Barra Superior Fija */}
      <div
        className="bot-panel"
        style={{
          flexShrink: 0,
          background: 'rgba(15, 23, 42, 0.95)',
          borderBottom: '1px solid #334155',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          padding: '0.65rem 1.15rem',
          margin: 0,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Sliders size={19} color="#38bdf8" /> Configuración de Variables
            </h2>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.73rem', color: '#94a3b8' }}>
              Parámetros contractuales, operativos y cargos regulados para el cálculo de <strong style={{ color: '#38bdf8' }}>Facturación Total de Energía</strong>
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            {/* Selector Centralizado de Mes a Facturar */}
            <SelectorMesFacturacion
              value={variables.periodoFacturacion}
              onChange={updatePeriodoFacturacion}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '6px', padding: '0.35rem 0.65rem', fontSize: '0.7rem', color: '#94a3b8' }}>
              <CheckCircle2 size={13} color="#22c55e" />
              <span>Persistido en memoria: <strong style={{ color: '#4ade80' }}>{ultimaActualizacion}</strong></span>
            </div>

            <button
              type="button"
              onClick={handleRestablecer}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '7px',
                padding: '0.42rem 0.8rem',
                color: '#94a3b8',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={13} />
              <span>Restablecer</span>
            </button>

            <button
              type="button"
              onClick={handleGuardarManual}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                border: 'none',
                borderRadius: '7px',
                padding: '0.42rem 0.95rem',
                color: '#fff',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(56, 189, 248, 0.25)',
              }}
            >
              <Save size={14} />
              <span>Guardar Variables</span>
            </button>
          </div>
        </div>
      </div>

      {/* Contenedor desplazable con todos los 9 cuadros */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '0.25rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingBottom: '1.5rem' }}>
          {/* Fila 1: Parámetros Operativos Rápidos (Grid 3 col) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
            <CardEnergiaActivaKallpa data={variables.energiaKallpa} onUpdate={updateEnergiaKallpa} />
            <CardDemandaCoincidente data={variables.demandaCoincidente} onUpdate={updateDemandaCoincidente} />
            <CardTipoCambio data={variables.tipoCambio} onUpdate={updateTipoCambio} />
          </div>

          {/* Fila 2: Parámetros Contractuales: Potencia Contratada, Tarifas y Eficiencia */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '0.75rem' }}>
            <CardPotenciaContratada data={variables.potenciaContratada} onUpdate={updatePotenciaContratada} />
            <CardTarifasClienteLibre data={variables.tarifas} onUpdate={updateTarifas} />
            <CardParametrosFactorK data={variables.parametrosContrato} onUpdate={updateParametrosContrato} />
          </div>

          {/* Fila 3: Costos y Penalidades por Exceso (Potencia y Energía) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '0.75rem' }}>
            <CardExcesoPotencia
              data={variables.excesoPotencia}
              onUpdate={updateExcesoPotencia}
              tarifaPotenciaBase={variables.tarifas?.tarifaPotencia}
            />
            <CardExcesoEnergia
              data={variables.excesoEnergia}
              onUpdate={updateExcesoEnergia}
              tarifaEnergiaBase={variables.tarifas?.tarifaEnergia}
            />
          </div>

          {/* Fila 4: Peajes y Cargos Regulados (Osinergmin) */}
          <CardPeajesRegulados data={variables.peajesRegulados} onUpdate={updatePeajesRegulados} />

          {/* Fila 5: Horario Punta / Fuera de Punta y Otros Cargos (Grid 2 col) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '0.75rem' }}>
            <CardIntervaloHorasPunta data={variables.horarioPunta} onUpdate={updateHorarioPunta} />
            <CardOtrosCargos data={variables.otrosCargos} onUpdate={updateOtrosCargos} />
          </div>

          {/* Fila 6: Tablas de Días No Laborables e Histórico de Potencias (Grid 2 col) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '0.75rem' }}>
            <CardTablaDiasNoLaborables
              dias={variables.diasNoLaborables}
              onToggle={toggleDiaNoLaborable}
              onToggleTodos={toggleTodosDiasNoLaborables}
              onAgregar={agregarDiaNoLaborable}
              onEliminar={eliminarDiaNoLaborable}
            />
            <CardHistoricoPotencias
              data={variables.historicoPotencias}
              onUpdatePotencia={updatePotenciaMes}
              periodoFacturacion={variables.periodoFacturacion}
              onUpdatePeriodo={updatePeriodoFacturacion}
              variablesConfig={variables}
              onInyectarPotencias={inyectarPotenciasMesFacturacion}
              onSelectCircuito={updateCircuitoHistorico}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModuloConfiguracionVariables;
