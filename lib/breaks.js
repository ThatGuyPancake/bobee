'use strict';
function createBreaks() {
  let elapsed = 0, due = false, snoozed = false;
  return {
    tick(ms, active, minutes) {
      if (!minutes) { elapsed = 0; due = false; snoozed = false; return false; }
      if (!active || due) return false;
      elapsed += Math.max(0, ms);
      if (elapsed < (snoozed ? 10 : minutes) * 60000) return false;
      due = true; return true;
    },
    pending: () => due,
    snooze() { elapsed = 0; due = false; snoozed = true; },
    skip() { elapsed = 0; due = false; snoozed = false; },
  };
}
module.exports = { createBreaks };
