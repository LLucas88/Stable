const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process'),{DatabaseSync}=require('node:sqlite')
test('image-input pricing previews without changes and creates immutable versions idempotently',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'design-pricing-')),file=path.join(dir,'fixture.sqlite'),db=new DatabaseSync(file)
 t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true})})
 db.exec('CREATE TABLE model_prices(id TEXT PRIMARY KEY,model_id TEXT,currency TEXT,input_micros_per_million INTEGER,output_micros_per_million INTEGER,pricing_policy_json TEXT,effective_at INTEGER,created_at INTEGER)')
 const policy=JSON.stringify({kind:'openai-cache',tiers:[{label:'standard',inputMicrosPerMillion:1000000,outputMicrosPerMillion:6000000}]})
 for(const model of ['gpt-image-2.5-sunburst','gpt-image-2.5-flare'])db.prepare('INSERT INTO model_prices VALUES(?,?,?,?,?,?,?,?)').run(model,model,'CNY',1000000,6000000,policy,1,1)
 const run=(...args)=>{const result=spawnSync(process.execPath,[path.resolve(__dirname,'../tools/cloud-openai/enable-image-input-pricing.mjs'),file,...args],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout)}
 assert.equal(run().applied,false);assert.equal(db.prepare('SELECT count(*) AS n FROM model_prices').get().n,2)
 const applied=run('--apply');assert.equal(applied.prices[0].image.inputMicrosPerMillion,1600000);assert.equal(applied.prices[0].image.cachedInputMicrosPerMillion,400000)
 assert.equal(db.prepare('SELECT count(*) AS n FROM model_prices').get().n,4)
 assert.equal(db.prepare('SELECT pricing_policy_json AS policy FROM model_prices WHERE id=?').get('gpt-image-2.5-sunburst').policy,policy)
 assert(run('--apply').prices.every(p=>p.unchanged));assert.equal(db.prepare('SELECT count(*) AS n FROM model_prices').get().n,4)
})
