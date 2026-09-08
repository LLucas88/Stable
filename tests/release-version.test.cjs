'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),semver=require('semver')
const {GitHubProvider}=require('electron-updater/out/providers/GitHubProvider')
const pkg=require('../package.json')
test('public release tag and filenames may retain leading zero while updater compares canonical semver',async()=>{
  const requests=[]
  const tag='v'+pkg.releaseVersion, filename=`Stable-Update-${pkg.releaseVersion}-x64.exe`
  const provider=new GitHubProvider(pkg.build.publish[0],{allowPrerelease:false,currentVersion:new semver.SemVer('0.91.7'),fullChangelog:false},{platform:'win32',executor:{request:async options=>{
    const url=options.path;requests.push(url)
    if(url.endsWith('.atom'))return `<feed><entry><title>Stable ${tag}</title><link href="https://github.com/LLucas88/Stable/releases/tag/${tag}"/><content>Release notes</content></entry></feed>`
    if(url.endsWith('/latest'))return JSON.stringify({tag_name:tag})
    if(url.endsWith('/latest.yml'))return `version: ${pkg.version}\nfiles:\n  - url: ${filename}\n    sha512: fixture\n    size: 1\npath: ${filename}\nsha512: fixture\n`
    throw Error('Unexpected URL '+url)
  }}})
  const info=await provider.getLatestVersion()
  assert.equal(info.tag,tag);assert(semver.gt(info.version,'0.91.7'))
  assert.equal(provider.resolveFiles(info)[0].url.pathname,`/LLucas88/Stable/releases/download/${tag}/${filename}`)
  assert(requests.some(url=>url.includes(`/download/${tag}/latest.yml`)))
})
