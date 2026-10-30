'use strict'
const OPENAI_IMAGES=['gpt-image-2.5-sunburst','gpt-image-2.5-flare']
const QUALITIES=['low','medium','high','xhigh','max','auto']
function imageOptions(value={}) {
 const model=value.model||'glm-image'
 if(model!=='glm-image'&&!OPENAI_IMAGES.includes(model))throw Error('不支持此图片模型。')
 const quality=value.quality||(model==='glm-image'?'hd':'medium')
 if(model==='glm-image'?quality!=='hd':!QUALITIES.includes(quality))throw Error('图片质量参数无效。')
 const background=value.background||'opaque'
 if(!['opaque','transparent','auto'].includes(background)||model==='glm-image'&&background!=='opaque')throw Error('该模型不支持此背景参数。')
 return {model,quality,background}
}
function checkImageSize(model,size){
 if(!OPENAI_IMAGES.includes(model))return
 const [w,h]=size.split('x').map(Number)
 if(w*h<655360||w*h>8294400||w/h>3||h/w>3||w>3840||h>3840||w%16||h%16)throw Error('GPT Image 尺寸须为16的倍数，比例介于1:3和3:1，总像素655360–8294400，单边不超过3840。')
}
module.exports={OPENAI_IMAGES,QUALITIES,imageOptions,checkImageSize}
