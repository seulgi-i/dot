'use strict';
const path = require('path');

function isInsideDevlog(root, full) {
  const r = path.resolve(root);
  const f = path.resolve(full);
  return f === r || f.startsWith(r + path.sep);
}

module.exports = { isInsideDevlog };
