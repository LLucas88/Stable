const { app, nativeImage } = require('electron')
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { createImageGenerator } = require('../../desktop/services/image-generation.cjs')
const { finishDesignImage } = require('../../desktop/services/design-output.cjs')
const { validateDesignRequest, designInstruction } = require('../../desktop/services/design-request.cjs')
const presets = require('../../desktop/services/design-presets.json')
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-design-output-'))
app.setPath('userData', path.join(workspace, 'profile'))
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const code = require('esbuild').buildSync({ entryPoints: [path.join(__dirname,'../../src/shared/design-size.ts')], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text
  const compiled = { exports: {} }; new Function('module','exports',code)(compiled,compiled.exports)
  for (const model of ['glm-image','gpt-image-2.5-sunburst','gpt-image-2.5-flare']) for(const resolution of ['standard','2k']) for(const id of Object.keys(presets)) {
    const value = compiled.exports.businessDesign({ model, resolution, mode: 'generate', ratio: '1:1', count: 1, text: '' }, id)
    assert.equal(validateDesignRequest(value).outputPreset, id)
  }
  const pixels = Buffer.alloc(1024 * 512 * 4)
  for (let i = 0; i < pixels.length; i += 4) { pixels[i + 2] = 255; pixels[i + 3] = 255 }
  const original = nativeImage.createFromBitmap(pixels, { width: 1024, height: 512 }), input = original.toPNG()
  for (const [outputPreset, spec] of Object.entries(presets)) {
    const policy = validateDesignRequest({ model: 'glm-image', mode: 'generate', ratio: '1:1', resolution: 'standard', count: 1, text: '', outputPreset })
    assert.equal(policy.outputPreset, outputPreset)
    assert.match(designInstruction(policy), new RegExp(spec.name))
    let calls = 0
    const generate = createImageGenerator({ policy, nativeImage, resolveApiKey: () => 'test',
      fetchImpl: async (_url, options) => { calls++; assert.equal(JSON.parse(options.body).size, '1280x1280'); return Response.json({ data: [{ url: 'https://fixture.test/image.png' }] }) }, download: async () => input })
    const request = { workspace, args: { prompt: 'test', output: `${outputPreset}.png` } }
    const result = await generate(request), output = nativeImage.createFromPath(result.path)
    assert.deepEqual(output.getSize(), { width: spec.width, height: spec.height })
    assert(fs.statSync(result.path).size < spec.maxMB * 1_000_000)
    const bitmap = output.toBitmap(), centre = (Math.floor(spec.height / 2) * spec.width + Math.floor(spec.width / 2)) * 4
    assert.deepEqual([...bitmap.subarray(centre, centre + 4)], [0, 0, 255, 255])
    assert.deepEqual([...bitmap.subarray(0, 4)], [255, 255, 255, 255], 'Fit must pad instead of stretching or cropping')
    assert.equal((await generate(request)).reused, true); assert.equal(calls, 1)
    console.log(`${spec.name}: ${result.width}x${result.height}, ${result.bytes} bytes, one mocked provider call`)
  }
  const transparent = finishDesignImage(original, nativeImage, 'avatar', 'transparent')
  assert.equal(nativeImage.createFromBuffer(transparent.png).toBitmap()[3], 0)
  assert.throws(() => finishDesignImage(original, nativeImage, '__proto__'), /规格无效/)
  assert.deepEqual(original.getSize(), { width: 1024, height: 512 })
  console.log('DESIGN_OUTPUT_NATIVE_PASSED')
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
process.on('exit', () => fs.rmSync(workspace, { recursive: true, force: true }))
