'use strict';
const { guideView } = require('./guide');

function guideFilterOn(config) {
  return !config || config.guideFilter !== false;
}

function buildLoadPayload({ config, board, commands, prompts, applyToday, loadedAt }) {
  return {
    board,
    prompts,
    wikiCommands: commands,
    guide: guideView(commands, board && board.rows),
    guideFilter: guideFilterOn(config),
    applyToday,
    loadedAt,
  };
}

module.exports = { buildLoadPayload, guideFilterOn };
