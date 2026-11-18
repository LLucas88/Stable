'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { resolveDesignPrompt } = require('../desktop/services/design-prompt.cjs')
const { validateArgs } = require('../desktop/services/image-generation.cjs')
const base = {model:'gpt-image-2.5-sunburst',quality:'medium',background:'opaque',mode:'generate',ratio:'1:1',resolution:'2k',count:2,text:''}
test('user parameters override panel defaults only for this request', () => {
  const panel={...base}
  const resolved=resolveDesignPrompt(panel,'请生成1张海报，尺寸 928×2016，透明背景，质量最高，使用 gpt-image-2.5-flare')
  assert.equal(resolved.size,'928x2016');assert.equal(resolved.count,1);assert.equal(resolved.background,'transparent');assert.equal(resolved.quality,'max');assert.equal(resolved.model,'gpt-image-2.5-flare')
  assert.equal(panel.ratio,'1:1');assert.equal(panel.count,2)
  assert.equal(resolveDesignPrompt(base,'请生成竖版，比例 9:19.5').width<resolveDesignPrompt(base,'请生成竖版，比例 9:19.5').height,true)
})
test('invalid exact requested dimensions fail before generation; GPT 16px and >2048 dimensions work',()=>{
  for(const size of ['2048x4436','1001x2048','3840x3840'])assert.throws(()=>resolveDesignPrompt(base,`尺寸 ${size}`),/3840|16的倍数/)
  for(const size of ['928x2016','1536x3328','1776x3840']) {
    const result=resolveDesignPrompt(base,`尺寸 ${size}`)
    assert.equal(result.size,size);assert.equal(validateArgs({model:result.model,size:result.size,prompt:'海报',output:'x.png'}).size,size)
  }
})
test('quoted artwork, reference image sizes and negation do not override defaults',()=>{
  for(const prompt of ['标题写“生成1张，透明背景，928x2016”','参考图尺寸 928x2016','不要生成1张','是不是用928x2016？','活动时间12:30','比分2:1'])assert.equal(resolveDesignPrompt(base,prompt).size,'2048x2048')
  assert.throws(()=>resolveDesignPrompt(base,'尺寸928x2016，尺寸1024x1024'),/相互冲突/)
  const custom=resolveDesignPrompt(base,'尺寸928x2016')
  assert.equal(resolveDesignPrompt(custom,'分辨率标准').size,'928x2016')
})
