'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm')
const { spawnSync } = require('node:child_process')
const repo = path.resolve(__dirname, '..')
const bundle = process.env.STABLE_TENCENTHUB_TEST_BUNDLE && path.resolve(process.env.STABLE_TENCENTHUB_TEST_BUNDLE)
const python = path.join(repo, 'vendor/wending-cli/python/python.exe')
const run = args => {
  const result = spawnSync(python, ['-I', '-B', '-X', 'utf8', ...args], { encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr || String(result.error || ''))
  return result.stdout
}
test('the real prepared bundle matches the reviewed files and valid frontmatter', { skip: !bundle }, () => {
  const { inspectBundle } = require('../desktop/services/tencenthub-skill-bundle.cjs')
  const yaml = require('yaml'), result = inspectBundle(bundle)
  assert.equal(result.skills.length, 18)
  for (const skill of result.skills) {
    const meta = yaml.parse(skill.content.match(/^---\n([\s\S]*?)\n---/)[1])
    assert.match(meta.name, /^[a-z0-9-]{1,64}$/)
    assert(!meta.name.startsWith('-') && !meta.name.endsWith('-') && !meta.name.includes('--'))
    assert.deepEqual(Object.keys(meta).sort(), ['description', 'name'])
    assert.equal(typeof meta.description, 'string')
    assert(meta.description.length > 0 && meta.description.length <= 1024)
    assert(!/[<>]/.test(meta.description) && !meta.description.startsWith('[TODO:'))
  }
})
test('UI search and design generation work with the bundled isolated Python', { skip: !bundle || !fs.existsSync(python) }, () => {
  const script = path.join(bundle, 'skills/ui-ux-pro-max/scripts/stable_ui.py')
  const found = JSON.parse(run([script, 'search', 'SaaS dashboard', '--domain', 'color', '--json']))
  assert(found.results.length > 0)
  assert(run([script, 'design-system', 'SaaS dashboard', '--format', 'markdown']).includes('#'))
})
test('memory preserves facts and merged entity attributes across reopen without third-party packages', { skip: !bundle || !fs.existsSync(python) }, () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-memory-check-'))
  run(['-c', `import importlib.util, sys, pathlib
module_path = pathlib.Path(sys.argv[1]) / 'skills/agent-memory/src/memory.py'
spec = importlib.util.spec_from_file_location('stable_agent_memory', module_path)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
db = pathlib.Path(sys.argv[2]) / 'memory.db'
mem = module.AgentMemory(db_path=str(db))
fact = mem.remember('Stable uses SQLite for local records', tags=['verified'], source='test')
assert mem.recall('SQLite')[0].id == fact
mem.track_entity('Stable', 'project', {'database':'SQLite'})
mem.update_entity('Stable', 'project', {'platform':'Windows'})
mem.learn('query', 'local database', 'success', 'Use explicit workspace paths')
reopened = module.AgentMemory(db_path=str(db))
assert reopened.get_fact(fact).content.startswith('Stable')
assert reopened.get_entity('Stable', 'project').attributes == {'database':'SQLite','platform':'Windows'}
assert len(reopened.get_lessons()) == 1
assert db.is_file()
`, bundle, workspace])
})
test('offline slide navigation clamps boundaries and ignores keys in editable controls', () => {
  const html = fs.readFileSync(path.join(repo, 'scripts/tencenthub-overrides/ppt-template.html'), 'utf8')
  assert(!/https?:\/\//.test(html))
  const element = () => ({ attributes: {}, events: {}, classList: { toggle(_name, active) { this.active = active } }, setAttribute(name, value) { this.attributes[name] = value }, addEventListener(name, fn) { this.events[name] = fn } })
  const slides = Array.from({ length: 3 }, element), nodes = { prev: element(), next: element(), page: element() }, events = {}
  const document = { querySelectorAll: () => slides, getElementById: id => nodes[id], addEventListener: (name, fn) => { events[name] = fn } }
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], { document })
  assert.equal(nodes.page.textContent, '1 / 3')
  assert(nodes.prev.disabled)
  for (let n = 0; n < 5; n++) nodes.next.events.click()
  assert.equal(nodes.page.textContent, '3 / 3')
  assert(nodes.next.disabled)
  assert.equal(slides[0].attributes['aria-hidden'], 'true')
  events.keydown({ key: 'ArrowLeft', target: { tagName: 'INPUT' } })
  assert.equal(nodes.page.textContent, '3 / 3')
  events.keydown({ key: 'ArrowLeft', target: {}, preventDefault() {} })
  assert.equal(nodes.page.textContent, '2 / 3')
})
