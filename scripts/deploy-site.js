#!/usr/bin/env node
// Deploy one linked web project from its folder, preserving its Git Root Directory setting.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const site = process.argv[2]
if (!['website', 'shop', 'store'].includes(site)) throw new Error('Usage: node scripts/deploy-site.js website|shop|store')
const dir = path.resolve(__dirname, '..', site)
const project = JSON.parse(fs.readFileSync(path.join(dir, '.vercel/project.json')))
let token = process.env.VERCEL_TOKEN || ''
for (const file of [path.join(os.homedir(), '.local/share/com.vercel.cli/auth.json'), path.join(os.homedir(), '.vercel/auth.json')]) {
  try { if (!token) token = JSON.parse(fs.readFileSync(file)).token || '' } catch {}
}
if (!token) throw new Error('Sign in with Vercel CLI first.')
const api = async (method, body) => {
  const response = await fetch(`https://api.vercel.com/v9/projects/${project.projectId}?teamId=${project.orgId}`, {
    method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || `Vercel ${response.status}`)
  return data
}
;(async () => {
  const current = await api('GET'), root = current.rootDirectory
  try {
    if (root) await api('PATCH', { rootDirectory: null })
    const result = spawnSync('npx', ['--yes', 'vercel', '--prod', '--yes'], { cwd: dir, stdio: 'inherit' })
    if (result.status !== 0) throw new Error('Vercel deployment failed')
  } finally {
    if (root) { await api('PATCH', { rootDirectory: root }); console.log('Restored Root Directory: ' + root) }
  }
})().catch(e => { console.error(e.message); process.exitCode = 1 })
