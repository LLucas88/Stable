'use strict'

const { TOOL_SPECS } = require('./builtin-tool-bridge.cjs')

// Convert the shared Harness descriptors to app-server's JSON Schema format.
function schemaFor(descriptor) {
  const { required: _required, ...schema } = descriptor
  if (schema.type === 'json') delete schema.type
  if (schema.properties) {
    const properties = schema.properties
    schema.properties = Object.fromEntries(Object.entries(properties).map(([name, value]) => [name, schemaFor(value)]))
    schema.required = Object.keys(properties).filter((name) => properties[name].required === true)
  }
  if (schema.items) schema.items = schemaFor(schema.items)
  return schema
}

const CODEX_BUILTIN_TOOLS = TOOL_SPECS.map(({ name, description, parameters }) => ({
  type: 'function', name, description,
  inputSchema: schemaFor({ type: 'object', properties: parameters, additionalProperties: false }),
}))

module.exports = { CODEX_BUILTIN_TOOLS }
