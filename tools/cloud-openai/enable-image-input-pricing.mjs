// Creates a new immutable price version only with --apply. Never changes quotas/accounts.
// Rates verified 2026-11-03: text $5/$1.25 cached; image input $8/$2 cached per 1M.
// Retain the existing currency conversion by deriving from its text-input rate.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
const filename=process.argv[2];
if(!filename||!existsSync(filename))throw Error('Provide an existing gateway SQLite file; default is preview only.');
const apply=process.argv.includes('--apply'),db=new DatabaseSync(filename,{readOnly:!apply}),now=Date.now();
const plans=[];
for(const model of ['gpt-image-2.5-sunburst','gpt-image-2.5-flare']){
  const row=db.prepare('SELECT * FROM model_prices WHERE model_id=? AND effective_at<=? ORDER BY effective_at DESC LIMIT 1').get(model,now);
  if(!row)throw Error('Missing existing price: '+model);
  const policy=JSON.parse(row.pricing_policy_json||'null');
  if(!policy||policy.tiers?.length!==1||policy.tiers[0].inputMicrosPerMillion!==row.input_micros_per_million)throw Error('Inspect nonstandard price before migration: '+model);
  const rate=row.input_micros_per_million;
  const next={...policy,verifiedAt:'2026-11-03',source:'https://developers.openai.com/api/docs/models/'+model,tiers:[{...policy.tiers[0],cachedInputMicrosPerMillion:Math.ceil(rate/4)}],imageInput:{inputMicrosPerMillion:Math.ceil(rate*8/5),cachedInputMicrosPerMillion:Math.ceil(rate*2/5)}};
  const unchanged=JSON.stringify(policy.imageInput)===JSON.stringify(next.imageInput)&&policy.tiers[0].cachedInputMicrosPerMillion===next.tiers[0].cachedInputMicrosPerMillion;
  plans.push({model,row,next,unchanged});
}
if(apply){
  db.exec('BEGIN IMMEDIATE');
  try{for(const {model,row,next,unchanged}of plans)if(!unchanged)db.prepare('INSERT INTO model_prices(id,model_id,currency,input_micros_per_million,output_micros_per_million,pricing_policy_json,effective_at,created_at) VALUES(?,?,?,?,?,?,?,?)').run(model+'-images-'+randomUUID(),model,row.currency,row.input_micros_per_million,row.output_micros_per_million,JSON.stringify(next),Math.max(now,Number(row.effective_at)+1),now);db.exec('COMMIT');}
  catch(error){db.exec('ROLLBACK');throw error;}
}
console.log(JSON.stringify({applied:apply,prices:plans.map(({model,next,unchanged})=>({model,unchanged,text:next.tiers[0],image:next.imageInput}))}));db.close();
