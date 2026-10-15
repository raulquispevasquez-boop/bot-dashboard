import React from 'react';
import { X, Snowflake, Lightbulb, Thermometer, Zap, CheckCircle2, Wrench, Clock } from 'lucide-react';

// Documentacion viva de que mide cada bot de la familia PME hoy, y que
// queda preparado para el futuro. Vive en el header del Bot Master PME
// (no dentro de una tarjeta especifica) porque la mayor parte de esto es
// infraestructura generica compartida por las 4 especialidades, no algo
// exclusivo de una sola.
const SERVICIOS_INFO = [
  {
    icon: Snowflake, color: '#38bdf8', nombre: 'HVAC', estado: 'En producción',
    estadoColor: '#22c55e',
    yaMide: [
      'Consumo horario de todas las sedes, con reintentos automáticos y corte de la corrida si la VPN se cae a mitad de camino.',
      'Medidores desconectados: distingue "nunca reportó" de "dejó de reportar" (con la fecha exacta del último dato).',
      'Consumo fuera de horario (rango configurable) por sede, con línea base y costo asociado.',
      '3 niveles de severidad (crítica / media / baja) según umbrales configurables.',
      'Impacto económico: fuga diaria, acumulado del período, proyección mensual y anual.',
      'Plan de Acción automático (solicitudes de servicio listas para copiar a la plataforma de mantenimiento) tanto por exceso de consumo como por medidores caídos.',
      'Historial de resultados corrida a corrida: % de mejora vs. la corrida anterior y vs. línea base, ahorro acumulado, y si las solicitudes de servicio realmente funcionaron.',
      'Cruce con CECO (tabla de mapeo de dispositivos) para enlazar a futuro con otros sistemas.',
      'Control remoto por Telegram: comandos y barra de progreso en vivo.'
    ],
    quedaListo: [
      'Afinar umbrales sede por sede (tabla de configuración por sede), en vez de un solo valor global.',
      'Comparar sedes por m² de sala de ventas o carga térmica de diseño, cuando esos datos se terminen de cargar.'
    ]
  },
  {
    icon: Lightbulb, color: '#fbbf24', nombre: 'Iluminación', estado: 'En producción',
    estadoColor: '#22c55e',
    yaMide: [
      'Exactamente las mismas capacidades que HVAC (comparten el mismo motor) — descarga, alertas, Plan de Acción, historial y control remoto — adaptado a los medidores de "Alumbrado".'
    ],
    quedaListo: [
      'Mismo camino de mejora que HVAC: configuración por sede y comparación por tamaño de tienda.'
    ]
  },
  {
    icon: Thermometer, color: '#a78bfa', nombre: 'Frío Alimentario', estado: 'En diseño — falta el DashboardId de PME',
    estadoColor: '#f59e0b',
    yaMide: [
      'Detección de medidor desconectado (misma lógica que HVAC/Iluminación) — funcionará apenas se conecte el dashboard real.'
    ],
    quedaListo: [
      'Máximo de consumo diario configurable (el total de las 24 horas no debería superar cierto valor).',
      'Máximo por hora, aplicado a las 24 horas del día (no depende de un horario fijo, porque el frío opera 24/7).',
      'Ventana opcional de "bajo consumo esperado", para vigilar el valle del ciclo de refrigeración.',
      'Línea base dinámica: compara el promedio de la semana actual contra la semana anterior usando el histórico ya guardado, en bloques de 7 días completos (no mezcla días de semana con fines de semana).',
      'Configuración por sede con m² de sala de ventas y carga térmica de diseño, para comparar sedes de tamaño distinto entre sí.',
      'Arquitectura pensada para, más adelante, cruzarse con la base de datos climática (temperatura / grados-día) del bot climático, sin tener que rediseñar nada.'
    ]
  },
  {
    icon: Zap, color: '#64748b', nombre: 'General', estado: 'Pendiente — falta el DashboardId de PME',
    estadoColor: '#64748b',
    yaMide: [],
    quedaListo: [
      'En cuanto se entregue el DashboardId de PME, hereda automáticamente toda la infraestructura ya construida (descarga, Supabase, alertas, historial, Telegram) — igual que pasó con Iluminación.'
    ]
  }
];

const CapacidadesInfoModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(3, 4, 6, 0.85)', backdropFilter: 'blur(6px)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
    }}>
      <div style={{
        width: '100%', maxWidth: '760px', maxHeight: '85vh', overflowY: 'auto',
        backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '1.75rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
          <div>
            <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>Capacidades del Bot Master PME</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
              Qué mide cada especialidad hoy, y qué queda preparado para más adelante.
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.25rem' }}>
          {SERVICIOS_INFO.map(s => {
            const Icon = s.icon;
            return (
              <div key={s.nombre} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '12px', padding: '1.1rem 1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                  <Icon size={18} color={s.color} />
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>{s.nombre}</span>
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.55rem', borderRadius: '999px',
                    color: s.estadoColor, background: `${s.estadoColor}22`, border: `1px solid ${s.estadoColor}55`
                  }}>
                    {s.estado}
                  </span>
                </div>

                {s.yaMide.length > 0 && (
                  <div style={{ marginBottom: s.quedaListo.length > 0 ? '0.9rem' : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: '#4ade80', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                      <CheckCircle2 size={13} /> Ya mide
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {s.yaMide.map((item, i) => (
                        <li key={i} style={{ fontSize: '0.8rem', color: '#e2e8f0', lineHeight: 1.4 }}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {s.quedaListo.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: '#facc15', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                      {s.yaMide.length > 0 ? <Wrench size={13} /> : <Clock size={13} />}
                      {s.yaMide.length > 0 ? 'Queda listo para' : 'A la espera de'}
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {s.quedaListo.map((item, i) => (
                        <li key={i} style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.4 }}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CapacidadesInfoModal;
