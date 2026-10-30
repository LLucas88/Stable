// Run only after explicit approval of public prices. Does not modify accounts or quotas.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const [dbPath,reportPath,confirmedFx]=process.argv.slice(2);
if(!dbPath||!reportPath||confirmedFx!=='7.20')throw Error('Explicit approved FX argument 7.20 required');
const db=new DatabaseSync(dbPath);db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
const hash=()=>createHash('sha256').update(JSON.stringify(db.prepare('SELECT * FROM accounts ORDER BY id').all())).update(JSON.stringify(db.prepare('SELECT * FROM quota_buckets ORDER BY id').all())).digest('hex');
const before=hash(),now=Date.now();
const models=[['gpt-6.1-sol','GPT-6.1 Sol',2,.1,10],['gpt-6.1-terra','GPT-6.1 Terra',1,.05,5],['gpt-image-2.5-sunburst','GPT Image 2.5 Sunburst',5,5,30],['gpt-image-2.5-flare','GPT Image 2.5 Flare',5,5,30]];
const rate=n=>Math.round(n*7.2*1000000);
db.exec('BEGIN IMMEDIATE');
try{
 for(const [id,label,input,cached,output]of models){
 if(db.prepare('SELECT id FROM models WHERE id=?').get(id))throw Error('Model already exists; inspect before changing price');
 const image=id.startsWith('gpt-image-');
 const tier={label:'standard',inputMicrosPerMillion:rate(input),cachedInputMicrosPerMillion:rate(cached),outputMicrosPerMillion:rate(output)};
 const policy={version:1,kind:image?'cache':'openai-cache',source:'https://developers.openai.com/api/docs/models/'+id,verifiedAt:'2026-10-29',tiers:image?[tier]:[{...tier,promptLessThan:272001},{label:'long-context',inputMicrosPerMillion:rate(input*2),cachedInputMicrosPerMillion:rate(cached*2),outputMicrosPerMillion:rate(output*1.5)}]};
 db.prepare("INSERT INTO models(id,display_name,provider,upstream_model,upstream_base_url,secret_name,context_window,max_output_tokens,status,created_at,updated_at) VALUES(?,?,'openai',?,'https://api.openai.com/v1','OPENAI_API_KEY',?,?,'active',?,?)").run(id,label,id,image?131072:1050000,image?65536:128000,now,now);
 db.prepare("INSERT INTO model_prices(id,model_id,currency,input_micros_per_million,output_micros_per_million,pricing_policy_json,effective_at,created_at) VALUES(?,?,'CNY',?,?,?,?,?)").run(id+'-20261029-fx720',id,rate(input),rate(output),JSON.stringify(policy),now,now);
 }
 if(hash()!==before)throw Error('Account or quota integrity mismatch');
 db.exec('COMMIT');
 const report={activated:models.map(m=>m[0]),fx:7.2,originalAccountsAndQuotasUnchanged:true,integrityHash:before,at:new Date().toISOString()};writeFileSync(reportPath,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));
}catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e}finally{db.close()}
