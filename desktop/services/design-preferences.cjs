'use strict'
const { validateDesignRequest } = require('./design-request.cjs')
function saveDesignPreferences(store, id, value, expectedRevision = 0) {
  if (!store.conversation(id)?.design) throw Error('此对话不是 Design 会话。')
  const design = validateDesignRequest(value)
  if (!design || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw Error('请选择有效的生图参数。')
  store.db.exec('BEGIN IMMEDIATE')
  try {
    const revision = store.getSetting(`design-revision:${id}`) || 0
    const result = revision !== expectedRevision
      ? { design: store.getSetting(`design:${id}`), revision, conflict: true }
      : { design, revision: revision + 1, conflict: false }
    if (!result.conflict) {
      store.setSetting(`design:${id}`, design)
      store.setSetting(`design-revision:${id}`, result.revision)
    }
    store.db.exec('COMMIT')
    return result
  } catch (error) { store.db.exec('ROLLBACK'); throw error }
}
module.exports = { saveDesignPreferences }
