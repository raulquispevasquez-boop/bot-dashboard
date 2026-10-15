// Servicio de búsqueda automática de Potencia Coincidente en los Registros de Potencia (kW)
// Cumple con la normativa COES / Osinergmin y la regla modular de < 600 líneas
import { parsearCSVPotencia } from './analisisPotenciaUtils.js';
import { CSV_EJEMPLO_POTENCIA } from './csvEjemploPotencia.js';
import { aplicarMedidoresVirtuales, adaptarNombreAPotencia } from '../../medidores_virtuales/useMedidoresVirtuales.js';

// Caché en memoria para evitar re-parsear miles de registros en cada render
let cachedRawText = null;
let cachedFactor = null;
let cachedParsedData = null;

export const limpiarCachePotencia = () => {
  cachedRawText = null;
  cachedFactor = null;
  cachedParsedData = null;
};

/**
 * Obtiene el dataset de potencias activo:
 * Prioridad 1: Guardado en localStorage por el usuario en Botón 2 (Registros de Potencia)
 * Prioridad 2: Dataset completo por defecto de Agosto 2026 (2,497 registros en Watts -> kW)
 */
export const obtenerDatosPotenciaActivos = () => {
  let texto = CSV_EJEMPLO_POTENCIA;
  let factorConversion = 0.001; // Watts a Kilowatts por defecto
  let origen = 'Datos de ejemplo (Agosto 2026)';

  try {
    const guardado = localStorage.getItem('facturacion_cliente_libre_potencia_csv');
    const factorGuardado = localStorage.getItem('facturacion_cliente_libre_potencia_factor');
    if (guardado && guardado.trim().length > 50) {
      texto = guardado;
      origen = 'Archivo cargado en Botón 2';
      if (factorGuardado !== null && !isNaN(parseFloat(factorGuardado))) {
        factorConversion = parseFloat(factorGuardado);
      }
    }
  } catch (e) {
    console.warn('Error leyendo localStorage de potencia:', e);
  }

  // Retorno rápido desde memoria si no ha cambiado el CSV
  if (cachedParsedData && cachedRawText === texto && cachedFactor === factorConversion) {
    return { ...cachedParsedData, origen };
  }

  const { registros: registrosBase, columnas: columnasBase } = parsearCSVPotencia(texto, factorConversion);

  // Inyectar medidores virtuales si existen
  let listaMV = [];
  try {
    const guardadoMV = localStorage.getItem('facturacion_cliente_libre_medidores_virtuales_v1');
    if (guardadoMV) listaMV = JSON.parse(guardadoMV);
  } catch (e) {}

  const { registros, columnas: columnasConVirtuales } = aplicarMedidoresVirtuales(registrosBase, columnasBase, listaMV);
  const columnas = columnasConVirtuales.map((c) => ({
    ...c,
    alias: c.esVirtual ? adaptarNombreAPotencia(c.alias) : c.alias,
  }));

  cachedRawText = texto;
  cachedFactor = factorConversion;
  cachedParsedData = { registros, columnas };

  return { registros, columnas, origen };
};

/**
 * Busca en los registros de potencia el valor exacto para una fecha y hora dadas.
 * Normaliza fechas tipo '2026-08-26' o '26/08/2026' y horas '19:00' o '19:00:00'.
 *
 * @param {string} fechaBuscada - Fecha en formato 'YYYY-MM-DD' o 'DD/MM/YYYY'
 * @param {string} horaBuscada - Hora en formato 'HH:mm' o 'HH:mm:ss'
 * @returns {object} {
 *   encontrado: boolean,
 *   potenciaKW: number,
 *   potenciaMW: number,
 *   desglose: Array<{ colKey, alias, codigo, valorKW }>,
 *   fechaDisplay: string,
 *   horaDisplay: string,
 *   mensaje: string
 * }
 */
export const buscarPotenciaCoincidente = (fechaBuscada, horaBuscada) => {
  if (!fechaBuscada || !horaBuscada) {
    return { encontrado: false, potenciaKW: 0, mensaje: 'Fecha y hora requeridas' };
  }

  const { registros, columnas } = obtenerDatosPotenciaActivos();
  if (!registros || registros.length === 0) {
    return { encontrado: false, potenciaKW: 0, mensaje: 'No hay registros de potencia cargados' };
  }

  // Normalizar fecha buscada
  let yBuscado, mBuscado, dBuscado;
  const fechaLimpia = String(fechaBuscada).trim();

  const matchIso = fechaLimpia.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  const matchLatam = fechaLimpia.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);

  if (matchIso) {
    yBuscado = parseInt(matchIso[1], 10);
    mBuscado = parseInt(matchIso[2], 10);
    dBuscado = parseInt(matchIso[3], 10);
  } else if (matchLatam) {
    dBuscado = parseInt(matchLatam[1], 10);
    mBuscado = parseInt(matchLatam[2], 10);
    yBuscado = parseInt(matchLatam[3], 10);
  } else {
    return { encontrado: false, potenciaKW: 0, mensaje: 'Formato de fecha no reconocido' };
  }

  // Normalizar hora buscada
  const horaPartes = String(horaBuscada).trim().split(':');
  const hBuscado = parseInt(horaPartes[0], 10);
  const minBuscado = parseInt(horaPartes[1] || '0', 10);

  if (isNaN(hBuscado) || isNaN(minBuscado)) {
    return { encontrado: false, potenciaKW: 0, mensaje: 'Hora no válida' };
  }

  // Solo sumar las columnas físicas de la acometida/planta (para no duplicar canales virtuales)
  const columnasFisicas = columnas.filter((c) => !c.esVirtual);
  const columnasSuma = columnasFisicas.length > 0 ? columnasFisicas : columnas;

  // Buscar el registro coincidente por año, mes, día, hora y minuto
  const registroEncontrado = registros.find((reg) => {
    if (!reg.fecha || isNaN(reg.fecha.getTime())) return false;
    const rf = reg.fecha;
    return (
      rf.getFullYear() === yBuscado &&
      rf.getMonth() + 1 === mBuscado &&
      rf.getDate() === dBuscado &&
      rf.getHours() === hBuscado &&
      rf.getMinutes() === minBuscado
    );
  });

  const pad = (n) => String(n).padStart(2, '0');
  const fechaDisplay = `${pad(dBuscado)}/${pad(mBuscado)}/${yBuscado}`;
  const horaDisplay = `${pad(hBuscado)}:${pad(minBuscado)}`;

  if (!registroEncontrado) {
    return {
      encontrado: false,
      potenciaKW: 0,
      potenciaMW: 0,
      totalFisicoKW: 0,
      totalFisicoMW: 0,
      medidorVirtualKey: null,
      circuitos: [],
      desglose: [],
      fechaDisplay,
      horaDisplay,
      mensaje: `No se encontró registro para el ${fechaDisplay} a las ${horaDisplay} hrs`,
    };
  }

  // Buscar si existe un medidor virtual activo
  const columnasVirtuales = columnas.filter((c) => c.esVirtual);
  const medidorVirtualActivo = columnasVirtuales.find((c) => c.operaciones && c.operaciones.length > 0) || columnasVirtuales[0];

  let sumaKW = 0;
  let desglose = [];
  let esVirtual = false;
  let nombreFuente = 'Consolidado Físico Planta';
  let formulaTexto = '';

  if (medidorVirtualActivo) {
    esVirtual = true;
    nombreFuente = adaptarNombreAPotencia(medidorVirtualActivo.alias);
    formulaTexto = medidorVirtualActivo.formulaTexto || '';
    const valVirtual = registroEncontrado[medidorVirtualActivo.key];
    sumaKW = typeof valVirtual === 'number' && !isNaN(valVirtual) ? valVirtual : 0;

    // Desglose de cada circuito con su signo algebraico correspondiente
    (medidorVirtualActivo.operaciones || []).forEach((op) => {
      const colCoincidente = columnas.find((c) => !c.esVirtual && (
        (op.columnaAlias && c.alias && c.alias.trim().toLowerCase().includes(op.columnaAlias.trim().toLowerCase())) ||
        (op.headerOriginal && c.headerOriginal && c.headerOriginal.trim() === op.headerOriginal.trim()) ||
        (op.columnaKey && c.key === op.columnaKey)
      ));
      const val = colCoincidente ? registroEncontrado[colCoincidente.key] : null;
      const num = typeof val === 'number' && !isNaN(val) ? val : 0;
      desglose.push({
        colKey: colCoincidente?.key || op.columnaKey,
        alias: adaptarNombreAPotencia(colCoincidente?.alias || op.columnaAlias),
        codigo: colCoincidente?.codigo || '',
        signo: op.signo || '+',
        valorKW: Math.round(num * 100) / 100,
        aporteKW: Math.round((op.signo === '-' ? -num : num) * 100) / 100,
      });
    });
  } else {
    // Si aún no se ha creado medidor virtual en este navegador, aplicar la regla de la instalación:
    // Los transformadores son positivos (+) y subclientes como OECHSLE se restan (-)
    columnasSuma.forEach((col) => {
      const val = registroEncontrado[col.key];
      const num = typeof val === 'number' && !isNaN(val) ? val : 0;
      const esOechsle = (col.alias || '').toLowerCase().includes('oechsle');
      const signo = esOechsle ? '-' : '+';
      const aporte = esOechsle ? -num : num;

      sumaKW += aporte;
      desglose.push({
        colKey: col.key,
        alias: col.alias,
        codigo: col.codigo,
        signo,
        valorKW: Math.round(num * 100) / 100,
        aporteKW: Math.round(aporte * 100) / 100,
      });
    });

    formulaTexto = desglose.map((d, idx) => `${idx === 0 && d.signo === '+' ? '' : d.signo} [${d.alias}]`).join(' ');
    nombreFuente = 'Total Neto (Trafo 1000 + Trafo 1250 - Oechsle)';
  }

  // Total Consolidado Físico (Suma de celdas físicas de acometida)
  let sumaFisica = 0;
  columnasSuma.forEach((col) => {
    const val = registroEncontrado[col.key];
    const num = typeof val === 'number' && !isNaN(val) ? val : 0;
    sumaFisica += num;
  });
  const totalFisicoKW = Math.round(sumaFisica * 100) / 100;
  const totalFisicoMW = Math.round((totalFisicoKW / 1000) * 1000) / 1000;

  // Lista de circuitos y medidores para selectores
  const circuitos = columnas.map((col) => {
    const val = registroEncontrado[col.key];
    const num = typeof val === 'number' && !isNaN(val) ? val : 0;
    const pKW = Math.round(num * 100) / 100;
    return {
      key: col.key,
      alias: col.esVirtual ? adaptarNombreAPotencia(col.alias) : col.alias,
      codigo: col.codigo || '',
      esVirtual: !!col.esVirtual,
      potenciaKW: pKW,
      potenciaMW: Math.round((pKW / 1000) * 1000) / 1000,
    };
  });

  // Redondear a 2 decimales para kW y 3 decimales para MW
  const potenciaKW = Math.round(sumaKW * 100) / 100;
  const potenciaMW = Math.round((potenciaKW / 1000) * 1000) / 1000;

  return {
    encontrado: true,
    potenciaKW,
    potenciaMW,
    totalFisicoKW,
    totalFisicoMW,
    medidorVirtualKey: medidorVirtualActivo ? medidorVirtualActivo.key : null,
    circuitos,
    desglose,
    fechaDisplay,
    horaDisplay,
    registroId: registroEncontrado.id,
    esVirtual,
    nombreFuente,
    formulaTexto,
    mensaje: `Encontrado: ${potenciaKW.toLocaleString('es-PE', { minimumFractionDigits: 2 })} kW (${fechaDisplay} ${horaDisplay})`,
  };
};
