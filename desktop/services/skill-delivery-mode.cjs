'use strict'
function cloudDeliveryEnabled() {
  return process.env.STABLE_SKILL_DELIVERY === 'cloud' || require('../../package.json').stableSkillDelivery === 'cloud'
}
module.exports = { cloudDeliveryEnabled }
