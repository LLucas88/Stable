'use strict'
// Compatibility entry point; persisted import identifiers remain unchanged.
const { registerDataImportIpc } = require('./data-import/ipc.cjs')
module.exports = { registerWorkBuddyIpc: registerDataImportIpc }
