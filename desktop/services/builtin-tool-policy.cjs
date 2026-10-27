'use strict'
// All adapters and the execution boundary use the same side-effect policy.
function requiresApproval(name, args = {}) {
  return name === 'stable_image_generate' || name === 'stable_skill_install'
    || name === 'stable_excel' && ['create', 'update'].includes(args.action)
    || name === 'stable_browser' && ['open', 'click', 'fill', 'select', 'key', 'drag'].includes(args.action)
}
module.exports = { requiresApproval }
