'use strict'

function isCloudEnabled({ isPackaged, env = process.env }) {
  if (env.STABLE_CLOUD_ENABLED !== undefined) return env.STABLE_CLOUD_ENABLED === '1'
  return Boolean(isPackaged)
}

module.exports = { isCloudEnabled }
