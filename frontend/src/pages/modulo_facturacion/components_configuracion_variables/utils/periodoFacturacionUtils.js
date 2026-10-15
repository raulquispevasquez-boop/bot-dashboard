export const MESES_DEL_ANIO_ESP = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

/**
 * Convierte '2026-08' a 'Agosto 2026'
 */
export const formatearMesNombre = (periodoYYYYMM) => {
  if (!periodoYYYYMM || typeof periodoYYYYMM !== 'string' || !periodoYYYYMM.includes('-')) {
    return periodoYYYYMM || '';
  }
  const [yStr, mStr] = periodoYYYYMM.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const nombreMes = MESES_DEL_ANIO_ESP[m - 1] || mStr;
  return `${nombreMes} ${y}`;
};

/**
 * Calcula el número de horas totales de un mes (ej. 744 h para 31 días, 720 h para 30 días, etc.)
 */
export const obtenerHorasDelMes = (periodoYYYYMM) => {
  if (!periodoYYYYMM || typeof periodoYYYYMM !== 'string' || !periodoYYYYMM.includes('-')) {
    return 744;
  }
  const [yStr, mStr] = periodoYYYYMM.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const diasEnMes = new Date(y, m, 0).getDate();
  return diasEnMes * 24;
};

/**
 * Genera la ventana de 12 meses móviles (rolling 12 months) hacia atrás a partir del mes de facturación seleccionado.
 * Preserva las potencias existentes y envía los meses fuera de la ventana a 'anteriores'.
 * 
 * @param {string} periodoFinYYYYMM - ej: '2026-08' o '2026-09'
 * @param {object} historicoExistente - { ultimos12Meses: [], anteriores: [] }
 */
const generarVentanaLista = (periodoFinYYYYMM, historicoSeccion = {}) => {
  if (!periodoFinYYYYMM || !periodoFinYYYYMM.includes('-')) {
    return historicoSeccion;
  }

  const [yStr, mStr] = periodoFinYYYYMM.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);

  // Mapear potencias existentes registradas para no perder ningún valor
  const mapaValores = new Map();
  const todosExistentes = [
    ...(historicoSeccion.ultimos12Meses || []),
    ...(historicoSeccion.anteriores || []),
  ];

  todosExistentes.forEach((item) => {
    if (item && item.periodo) {
      mapaValores.set(item.periodo, {
        id: item.id,
        mesNombre: item.mesNombre,
        potenciaKW: item.potenciaKW ?? 0,
        potenciaHP_KW: item.potenciaHP_KW ?? item.potenciaKW ?? 0,
        potenciaHFP_KW: item.potenciaHFP_KW ?? item.potenciaKW ?? 0,
        fechaHP: item.fechaHP || '',
        horaHP: item.horaHP || '',
        fechaHFP: item.fechaHFP || '',
        horaHFP: item.horaHFP || '',
      });
    }
  });

  // Generar los 12 periodos en orden cronológico (los 11 anteriores + el mes seleccionado al final)
  const ultimos12Meses = [];
  const setPeriodos12 = new Set();

  for (let i = 11; i >= 0; i--) {
    let mesIdx = m - i;
    let anioIdx = y;
    while (mesIdx <= 0) {
      mesIdx += 12;
      anioIdx -= 1;
    }
    const pStr = `${anioIdx}-${String(mesIdx).padStart(2, '0')}`;
    setPeriodos12.add(pStr);
    const reg = mapaValores.get(pStr);
    const hp = reg ? reg.potenciaHP_KW : 0;
    const hfp = reg ? reg.potenciaHFP_KW : 0;
    const pot = reg ? reg.potenciaKW : Math.max(hp, hfp);

    ultimos12Meses.push({
      id: `m-${pStr}`,
      periodo: pStr,
      mesNombre: formatearMesNombre(pStr),
      potenciaHP_KW: hp,
      potenciaHFP_KW: hfp,
      potenciaKW: pot,
      fechaHP: reg?.fechaHP || '',
      horaHP: reg?.horaHP || '',
      fechaHFP: reg?.fechaHFP || '',
      horaHFP: reg?.horaHFP || '',
    });
  }

  // Filtrar anteriores: cualquier periodo histórico que sea anterior a la ventana de 12 meses
  const primerPeriodo = ultimos12Meses[0].periodo;
  const anterioresMap = new Map();

  todosExistentes.forEach((item) => {
    if (item && item.periodo && item.periodo < primerPeriodo && !setPeriodos12.has(item.periodo)) {
      anterioresMap.set(item.periodo, {
        id: item.id || `m-old-${item.periodo}`,
        periodo: item.periodo,
        mesNombre: item.mesNombre || formatearMesNombre(item.periodo),
        potenciaHP_KW: item.potenciaHP_KW ?? item.potenciaKW ?? 0,
        potenciaHFP_KW: item.potenciaHFP_KW ?? item.potenciaKW ?? 0,
        potenciaKW: item.potenciaKW ?? 0,
        fechaHP: item.fechaHP || '',
        horaHP: item.horaHP || '',
        fechaHFP: item.fechaHFP || '',
        horaHFP: item.horaHFP || '',
      });
    }
  });

  // Orden descendente (el más reciente de los viejos primero)
  const anteriores = Array.from(anterioresMap.values()).sort((a, b) => b.periodo.localeCompare(a.periodo));

  return {
    ultimos12Meses,
    anteriores,
  };
};

/**
 * Genera la ventana de 12 meses móviles preservando todos los circuitos y selecciones
 */
export const generarVentana12Meses = (periodoFinYYYYMM, historicoExistente = {}) => {
  if (!periodoFinYYYYMM || !periodoFinYYYYMM.includes('-')) {
    return historicoExistente;
  }

  const base = generarVentanaLista(periodoFinYYYYMM, historicoExistente);
  const porCircuito = {};

  if (historicoExistente.porCircuito && typeof historicoExistente.porCircuito === 'object') {
    Object.keys(historicoExistente.porCircuito).forEach((key) => {
      porCircuito[key] = generarVentanaLista(periodoFinYYYYMM, historicoExistente.porCircuito[key]);
    });
  }

  return {
    ...base,
    circuitoSeleccionado: historicoExistente.circuitoSeleccionado || 'total',
    porCircuito,
  };
};

/**
 * Desplaza un período YYYY-MM en un delta de meses (+1, -1, etc.)
 */
export const desplazarPeriodo = (periodoYYYYMM, deltaMeses = 1, limiteMaximo = null) => {
  if (!periodoYYYYMM || typeof periodoYYYYMM !== 'string' || !periodoYYYYMM.includes('-')) {
    return periodoYYYYMM || '2026-08';
  }
  const [yStr, mStr] = periodoYYYYMM.split('-');
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10) + deltaMeses;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  const res = `${y}-${String(m).padStart(2, '0')}`;
  if (limiteMaximo && res > limiteMaximo) {
    return limiteMaximo;
  }
  return res;
};

/**
 * Genera la lista de opciones para el selector de meses agrupados por año.
 * Capped estrictamente al año en curso (nunca muestra el año entrante).
 */
export const generarOpcionesMesesAgrupados = (periodoActual = '2026-08', aniosAtras = 2) => {
  const anioReferencia = parseInt((periodoActual && periodoActual.split('-')[0]) || '2026', 10);
  const anioSistema = new Date().getFullYear();
  // El año en curso es el máximo entre el año del periodo seleccionado y el año del sistema
  const anioActual = Math.max(anioReferencia, anioSistema);

  const anioFin = anioActual; // MAXIMO AÑO EN CURSO (nunca años futuros como 2027)
  const anioInicio = anioActual - aniosAtras;

  const grupos = [];
  for (let anio = anioFin; anio >= anioInicio; anio--) {
    const meses = [];
    for (let mes = 12; mes >= 1; mes--) {
      const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
      meses.push({
        valor: periodo,
        label: `${MESES_DEL_ANIO_ESP[mes - 1]} ${anio}`,
        nombreMes: MESES_DEL_ANIO_ESP[mes - 1],
        mesNum: mes,
        anio,
      });
    }
    grupos.push({
      anio,
      esAnioEnCurso: anio === anioActual,
      meses,
    });
  }
  return grupos;
};
