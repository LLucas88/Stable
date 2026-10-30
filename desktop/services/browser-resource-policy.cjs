'use strict'
const { lookup } = require('node:dns').promises
const { BlockList, isIP } = require('node:net')
const blocked = new BlockList()
const blockedV6 = new BlockList()
for (const [ip, bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]]) blocked.addSubnet(ip,bits,'ipv4')
for (const [ip,bits] of [['::',96],['::ffff:0:0',96],['64:ff9b::',96],['100::',64],['2001::',32],['2001:db8::',32],['2002::',16],['fc00::',7],['fe80::',10],['ff00::',8]]) blockedV6.addSubnet(ip,bits,'ipv6')
function publicAddress(ip) { const family = isIP(ip); return family === 4 ? !blocked.check(ip,'ipv4') : family === 6 && !blockedV6.check(ip,'ipv6') }
const STATIC = new Set(['image','font','stylesheet','script','media'])
// Only public, read-only subresources inherit permission to render an approved page.
// This does not grant their origins navigation, iframe, API, download or device access.
function createPublicResourcePolicy({ resolve = host => lookup(host,{all:true}), timeout = 2500, now = Date.now } = {}) {
  const cache = new Map()
  async function publicHost(host) {
    host = host.replace(/^\[|\]$/g,'').replace(/\.$/,'').toLowerCase()
    if (isIP(host)) return publicAddress(host)
    if (!host.includes('.') || /(^|\.)(localhost|local|internal|home|lan|test|invalid)$/.test(host)) return false
    const cached = cache.get(host)
    if (cached && cached.until > now()) return cached.result
    let timer
    const result = Promise.race([
      Promise.resolve().then(()=>resolve(host)).then(records=>Array.isArray(records)&&records.length>0&&records.every(r=>publicAddress(r.address))),
      new Promise(resolve=>{timer=setTimeout(()=>resolve(false),timeout)}),
    ]).catch(()=>false).finally(()=>clearTimeout(timer))
    if(cache.size>=256)cache.delete(cache.keys().next().value)
    cache.set(host,{result,until:now()+30_000})
    return result
  }
  return async details => {
    if (!STATIC.has(details.resourceType) || !['GET','HEAD'].includes(details.method || 'GET')) return false
    let url; try { url=new URL(details.url) } catch { return false }
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.port && !['80','443'].includes(url.port)) return false
    return publicHost(url.hostname)
  }
}
module.exports={createPublicResourcePolicy,publicAddress}
