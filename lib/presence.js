'use strict';

const IDLE_THRESHOLD_S = 300;

function presenceFrom(idleSeconds) {
  return idleSeconds >= IDLE_THRESHOLD_S ? 'idle' : 'active';
}

module.exports = { presenceFrom };
