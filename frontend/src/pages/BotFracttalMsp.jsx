import React, { useState } from 'react';
import BotStMsp from '../components/bot_fracttal_msp/BotStMsp';
import BotStFracttal from '../components/bot_fracttal_msp/BotStFracttal';
import BotOtFracttal from '../components/bot_fracttal_msp/BotOtFracttal';
import BotInvitacionesMsp from '../components/bot_fracttal_msp/BotInvitacionesMsp';
import BotMaster from '../components/bot_fracttal_msp/BotMaster';
import Bot6 from '../components/bot_fracttal_msp/Bot6';

// Únicos bots que pertenecen a esta sección. Se usa como lista blanca para
// no arrastrar aquí bots de otras familias (Clima, SENAMHI, PME, etc.)
// que se registren más adelante en backend/bots.json.
const FRACTTAL_BOT_IDS = ['bot_st_msp', 'bot_st_fracttal', 'bot_ot_fracttal', 'bot_invitaciones_msp'];

const BotFracttalMsp = ({ bots, logs, onStart, onStop, socket, onReorderBots, onFinalReorder }) => {
  const [activeInnerTab, setActiveInnerTab] = useState(() => {
    const runningBot = bots.find(b => FRACTTAL_BOT_IDS.includes(b.id) && b.status === 'running');
    return runningBot ? runningBot.id : 'bot_st_msp';
  });

  // Funciones seguras para obtener los props, en caso de que bots venga vacío.
  const getBot = (id) => bots.find(b => b.id === id) || { id, status: 'offline' };
  const getLogs = (id) => logs[id] || [];

  // Generate tab list order dynamically from the sorted bots list, followed by orchestrators/extra tabs
  const tabOrder = [
    ...bots.map(b => b.id).filter(id => FRACTTAL_BOT_IDS.includes(id)),
    'bot_master',
    'bot_6'
  ];

  const getTabLabel = (id) => {
    if (id === 'bot_master') return 'Bot Master';
    if (id === 'bot_6') return 'Bot 6';
    const b = bots.find(x => x.id === id);
    return b ? b.name : id;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 4rem)', overflow: 'hidden' }}>
      {/* Fixed Header and Tabs wrapper (Locked in place) */}
      <div style={{ 
        flexShrink: 0,
        backgroundColor: '#0f1115', 
        paddingBottom: '1rem',
        borderBottom: '1px solid var(--panel-border)',
        marginBottom: '1rem'
      }}>
        <header style={{ marginBottom: '1.25rem' }}>
          <h1>Bot Fracttal-Msp</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Navega entre los 6 bots especializados.</p>
        </header>

        <div className="inner-tabs" style={{ marginBottom: 0 }}>
          {tabOrder.map(tabId => (
            <button 
              key={tabId}
              className={`inner-tab ${activeInnerTab === tabId ? 'active' : ''}`}
              onClick={() => setActiveInnerTab(tabId)}
            >
              {getTabLabel(tabId)}
            </button>
          ))}
        </div>
      </div>

      <div className="tab-content" style={{ flex: 1, overflowY: 'auto', paddingRight: '0.25rem' }}>
        {activeInnerTab === 'bot_st_msp' && (
          <BotStMsp 
            bot={getBot('bot_st_msp')} 
            logs={getLogs('bot_st_msp')} 
            onStart={(runMode) => onStart('bot_st_msp', runMode)} 
            onStop={() => onStop('bot_st_msp')} 
            socket={socket} 
          />
        )}
        {activeInnerTab === 'bot_st_fracttal' && (
          <BotStFracttal 
            bot={getBot('bot_st_fracttal')} 
            logs={getLogs('bot_st_fracttal')} 
            onStart={(runMode) => onStart('bot_st_fracttal', runMode)} 
            onStop={() => onStop('bot_st_fracttal')} 
            socket={socket} 
          />
        )}
        {activeInnerTab === 'bot_ot_fracttal' && (
          <BotOtFracttal 
            bot={getBot('bot_ot_fracttal')} 
            logs={getLogs('bot_ot_fracttal')} 
            onStart={(runMode) => onStart('bot_ot_fracttal', runMode)} 
            onStop={() => onStop('bot_ot_fracttal')} 
            socket={socket} 
          />
        )}
        {activeInnerTab === 'bot_invitaciones_msp' && (
          <BotInvitacionesMsp 
            bot={getBot('bot_invitaciones_msp')} 
            logs={getLogs('bot_invitaciones_msp')} 
            onStart={(runMode) => onStart('bot_invitaciones_msp', runMode)} 
            onStop={() => onStop('bot_invitaciones_msp')} 
            socket={socket} 
          />
        )}
        {activeInnerTab === 'bot_master' && (
          <BotMaster 
            bot={getBot('bot_master')} 
            bots={bots}
            logs={getLogs('bot_master')} 
            allLogs={logs}
            onStart={() => onStart('bot_master')}
            onStop={(botId) => onStop(botId || 'bot_master')}
            socket={socket} 
            onReorderBots={onReorderBots}
            onFinalReorder={onFinalReorder}
          />
        )}
        {activeInnerTab === 'bot_6' && (
          <Bot6 bot={getBot('bot_6')} logs={getLogs('bot_6')} onStart={() => onStart('bot_6')} onStop={() => onStop('bot_6')} />
        )}
      </div>
    </div>
  );
};

export default BotFracttalMsp;
