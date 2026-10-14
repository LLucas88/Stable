'use strict'

// API release dates, checked 2026-10-13. Keep model IDs and saved defaults intact.
// https://docs.bigmodel.cn/cn/update/new-releases
// https://api-docs.deepseek.com/updates/
// FlashX: provider docs confirm the SKU; the public API catalog records its
// availability on 2026-09-18 (https://openrouter.ai/api/v1/models, created=1789744020).
const RELEASE_DATES = Object.freeze({
  'glm-5.3-flashx': '2026-09-18',
  'deepseek-flash': '2026-09-10',
  'glm-5.3-flash': '2026-08-26',
  'deepseek-v4-flash-vision-exp': '2026-08-21',
  'glm-5.3': '2026-08-19',
  'deepseek-v4-pro': '2026-08-13',
  'deepseek-v4-flash': '2026-07-31',
  'glm-5.2': '2026-06-16',
  'glm-5.1': '2026-04-07',
  'glm-5v-turbo': '2026-04-02',
  'glm-5-turbo': '2026-03-15',
  'glm-5': '2026-02-12',
  'glm-4.7-flash': '2026-01-19',
  'glm-4.7': '2025-12-22',
  'glm-4.6': '2025-09-30',
  'glm-4.5': '2025-07-28',
  'glm-4.5-air': '2025-07-28',
})

function sortModelsByRelease(items) {
  // Stable ties, with unverified dates last. Never infer a date from a version.
  const date = item => RELEASE_DATES[String(item.model || item.id).toLowerCase()] || ''
  return [...items].sort((a, b) => date(b).localeCompare(date(a)))
}

module.exports = { sortModelsByRelease }
