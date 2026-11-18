'use strict'

// Only explicit source identities can supersede fragments. Equal or overlapping
// text is not evidence: repeated rows and separate answers may be intentional.
function coveredAnswerIds(items) {
  const ids = new Set()
  for (const item of items) {
    if (item.type !== 'agentMessage' || item.phase !== 'final_answer' || !item.text?.trim() || !Array.isArray(item.sourceIds)) continue
    for (const id of item.sourceIds) if (typeof id === 'string' && id && id !== item.id) ids.add(id)
  }
  return ids
}

function selectAnswerItems(items) {
  const covered = coveredAnswerIds(items)
  return items.filter(item => item.type === 'agentMessage' && item.text?.trim() && !covered.has(item.id))
}

module.exports = { coveredAnswerIds, selectAnswerItems }
