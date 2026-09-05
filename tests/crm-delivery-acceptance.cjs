'use strict'
// Read-only reconciliation of a real Stable workbook against fresh CLI responses.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const XLSX = require('xlsx')
const [prefix, workbookPath] = process.argv.slice(2)
if (!prefix || !workbookPath) throw Error('Usage: node tests/crm-delivery-acceptance.cjs <source-prefix> <workbook.xlsx>')
function source(suffix) {
  const payload = JSON.parse(fs.readFileSync(`${prefix}-${suffix}.json`, 'utf8'))
  assert.ok(Array.isArray(payload.result), 'Source response must contain rows')
  assert.equal(payload.result.length, payload.totalCount, 'All pages must be collected')
  assert.ok(payload.result.every(row => row['活动状态'] === '进行中'), 'Source status must match')
  return payload.result
}
const activities = source('activity'), products = source('activity-product')
const metrics = ['净GMV', '活动商品订单数', '活动商品购买份数', '活动商品优惠金额', '活动商品ROI']
const sum = (rows, key) => rows.reduce((value, row) => value + row[key], 0)
const mean = rows => sum(rows, '活动商品ROI') / rows.length
const text = value => String(value ?? '').trim()
const equalNumber = (actual, expected, label) => {
  assert.equal(typeof actual, 'number', `${label}: expected a numeric Excel value`)
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 0.0051, `${label}: ${actual} != ${expected}`)
}
const workbook = XLSX.readFile(path.resolve(workbookPath))
const sheets = workbook.SheetNames.map(name => ({name, rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {header:1, defval:null})}))
function table(firstHeader, width) {
  for (const sheet of sheets) {
    const index = sheet.rows.findIndex(row => text(row[0]) === firstHeader && row.some(value => text(value) === '净GMV'))
    if (index < 0) continue
    const end = sheet.rows.findIndex((row, i) => i > index && text(row[0]) === '合计')
    assert.ok(end > index, `Missing total for ${firstHeader}`)
    return {sheet:sheet.name, header:sheet.rows[index].slice(0,width), rows:sheet.rows.slice(index+1,end).filter(row=>row.some(value=>value!==null)), total:sheet.rows[end]}
  }
  throw Error(`Missing ${firstHeader} table`)
}
const activity = table('活动名称',7), product = table('商品名称',8)
assert.deepEqual(activity.header.map(text), ['活动名称','类型','净GMV','订单数','购买份数','优惠金额','活动商品ROI'])
assert.deepEqual(product.header.map(text), ['商品名称','核销价/原价（元）','归属活动','净GMV','订单数','购买份数','优惠金额','商品ROI'])
function compare(table, originals, offset, matches) {
  assert.equal(table.rows.length, originals.length, `${table.sheet}: detail row count`)
  const remaining = [...originals]
  let previous = Infinity
  for (const row of table.rows) {
    const index = remaining.findIndex(source => matches(row, source) && metrics.every((key,i)=>typeof row[offset+i]==='number' && Math.abs(row[offset+i]-source[key])<=0.0051))
    assert.ok(index >= 0, `${table.sheet}: unmatched detail ${text(row[0])}`)
    remaining.splice(index,1)
    assert.ok(row[offset] <= previous + 0.0051, `${table.sheet}: descending GMV required`)
    previous = row[offset]
  }
  for (let i=0;i<4;i++) equalNumber(table.total[offset+i],sum(originals,metrics[i]),`${table.sheet} total ${metrics[i]}`)
  equalNumber(table.total[offset+4],mean(originals),`${table.sheet} arithmetic ROI mean`)
}
compare(activity, activities, 2, (r,s)=>text(r[0])===s['CRM活动名称']&&text(r[1])===s['CRM活动类型名称'])
compare(product, products, 3, (r,s)=>{
  const prices=text(r[1]).replace(/元|\s/g,'').split(/[\/／]/).map(Number)
  return text(r[0])===s['商品名称']&&text(r[2])===s['CRM活动名称']&&prices.length===2&&Math.abs(prices[0]-s['商品核销价格'])<=0.0051&&Math.abs(prices[1]-s['商品原价'])<=0.0051
})
assert.ok(sheets.some(s=>s.rows.some(row=>row.some(v=>text(v).includes('简要观察')))), 'Missing observations')
for(const sheet of sheets) for(const row of sheet.rows) for(const value of row) assert.ok(!/^#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!)/.test(text(value)), 'Excel formula error')
console.log(JSON.stringify({status:'passed',workbook:path.resolve(workbookPath),activityRows:activities.length,productRows:products.length,gmv:sum(activities,'净GMV'),activityOrders:sum(activities,'活动商品订单数'),productOrders:sum(products,'活动商品订单数')},null,2))
