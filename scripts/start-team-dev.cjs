'use strict'

const { spawn } = require('node:child_process')
const { mkdirSync } = require('node:fs')
const path = require('node:path')

const projectRoot = path.join(__dirname, '..')
const electronPath = require('electron')
const profileRoot = path.join(projectRoot, '.team-dev')
const profiles = [path.join(profileRoot, 'device-a'), path.join(profileRoot, 'device-b')]

mkdirSync(profileRoot, { recursive: true })

function launch(profile, delay) {
  setTimeout(() => {
    const child = spawn(electronPath, ['.', `--stable-user-data=${profile}`], {
      cwd: projectRoot,
      env: { ...process.env, STABLE_QA_PAGE: 'team' },
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })
    child.unref()
  }, delay)
}

launch(profiles[0], 0)
launch(profiles[1], 850)

console.log('Stable Team 本地双设备已启动：')
console.log(`  设备 A：${profiles[0]}`)
console.log(`  设备 B：${profiles[1]}`)
console.log('在设备 A 创建 Team，再把邀请码粘贴到设备 B 即可。')
