'use strict'
const http = require('node:http'), fs = require('node:fs'), path = require('node:path')
const { randomUUID } = require('node:crypto')
const { fileURLToPath } = require('node:url')
const { resolveWorkspaceEntry } = require('./preview.cjs')
const types = { '.html':'text/html', '.htm':'text/html', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.webp':'image/webp', '.gif':'image/gif', '.woff':'font/woff', '.woff2':'font/woff2' }
class LocalHtmlPreview {
  constructor(roots) { this.roots=roots; this.entries=new Map() }
  async open(value) {
    const file=resolveWorkspaceEntry(value.startsWith('file:') ? fileURLToPath(value) : value, this.roots, {fileOnly:true})
    const filename = typeof file === 'string' ? file : file.path
    if (!/\.html?$/i.test(filename)) throw Error('本地浏览器预览仅支持工作区 HTML 文件。')
    if (!this.server) {
      this.server=http.createServer((req,res)=>{
        try {
          if(!['GET','HEAD'].includes(req.method)) {res.writeHead(405).end();return}
          const parts=new URL(req.url,'http://localhost').pathname.split('/').filter(Boolean)
          const root=this.entries.get(parts.shift())
          if(!root) throw Error('Unknown preview')
          const relative=decodeURIComponent(parts.join('/'))
          const target=path.resolve(root,relative),within=path.relative(root,target)
          if(!within || within.startsWith('..') || path.isAbsolute(within))throw Error('Outside preview')
          resolveWorkspaceEntry(target,[root],{fileOnly:true})
          const type=types[path.extname(target).toLowerCase()]
          if(!type || fs.statSync(target).size>50*1024*1024)throw Error('Unsupported resource')
          res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"})
          if(req.method==='HEAD')res.end();else {const stream=fs.createReadStream(target);stream.on('error',()=>res.destroy());stream.pipe(res)}
        }catch{res.writeHead(404).end('Preview resource unavailable')}
      })
      await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(0,'127.0.0.1',resolve)})
      this.server.unref()
    }
    const token=randomUUID();this.entries.set(token,path.dirname(filename))
    return `http://127.0.0.1:${this.server.address().port}/${token}/${encodeURIComponent(path.basename(filename))}`
  }
  dispose(){this.server?.close();this.server?.closeAllConnections();this.entries.clear();this.server=undefined}
}
module.exports={LocalHtmlPreview}
