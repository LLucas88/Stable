'use strict'
// Compatibility entry point; persisted import identifiers remain unchanged.
const { DataImportService, initializeDataImports } = require('./data-import/service.cjs')
module.exports = { WorkBuddyImportService: DataImportService, initializeWorkBuddyImports: initializeDataImports }
