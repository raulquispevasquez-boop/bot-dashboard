import React from 'react';
import BotMasterPme from '../components/bot_pme/BotMasterPme';

const BotPmePage = ({ bots = [], logs = {}, onStart, onStop, socket }) => {
  return (
    <div className="bot-pme-page">
      <BotMasterPme
        bots={bots}
        logs={logs}
        onStart={onStart}
        onStop={onStop}
        socket={socket}
      />
    </div>
  );
};

export default BotPmePage;
