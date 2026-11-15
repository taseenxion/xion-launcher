#!/usr/bin/env node
/**
 * Cross-platform release script for Xion Launcher.
 * 
 * Automates:
 * 1. Verification of all build artifacts in dist/ (Windows .exe, Linux .deb, AppImage, tar.gz, latest.yml)
 * 2. GitHub Release creation (v<version>) with all binaries and release notes attached
 *    -> This immediately triggers the auto-updater for all preinstalled launchers (v1.17.0 etc.) on other laptops.
 * 3. Website deployment to Vercel (target: xionx.vercel.app)
 * 
 * Usage:
 *   node scripts/release.js [--dry-run] [--token=<GITHUB_TOKEN>] [--skip-vercel]
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const { execSync, spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const ver = pkg.version
const tag = `v${ver}`
const REPO = (pkg.build && pkg.build.publish && pkg.build.publish[0] && `${pkg.build.publish[0].owner}/${pkg.build.publish[0].repo}`) || 'taseenxion/xion-launcher'

// Parse CLI flags
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const skipVercel = args.includes('--skip-vercel')
const tokenArg = (args.find(a => a.startsWith('--token=')) || '').replace('--token=', '')
const GITHUB_TOKEN = tokenArg || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''

console.log('\x1b[36m%s\x1b[0m', `== Releasing Xion Launcher ${ver} (${tag}) ==`)
console.log(`Repository: ${REPO}`)

// 1. Release notes
const notesPaths = [
  path.join(ROOT, 'release-notes', `notes-${ver}.md`),
  path.join(ROOT, '.tools', `notes-${ver}.md`)
]
let releaseNotes = `Xion Launcher ${ver} Release`
for (const p of notesPaths) {
  if (fs.existsSync(p)) {
    releaseNotes = fs.readFileSync(p, 'utf8')
    console.log(`Found release notes at: ${path.relative(ROOT, p)}`)
    break
  }
}

// 2. Expected assets in dist/
const expectedAssets = [
  `Xion-Launcher-Setup-${ver}.exe`,
  `Xion-Launcher-Setup-${ver}.exe.blockmap`,
  `latest.yml`,
  `XionLauncher-Portable-${ver}.exe`,
  `Xion-Launcher-${ver}-linux-x86_64.AppImage`,
  `Xion-Launcher-${ver}-linux-amd64.deb`,
  `Xion-Launcher-${ver}-linux-x64.tar.gz`,
  `latest-linux.yml`
]

const distDir = path.join(ROOT, 'dist')
if (!fs.existsSync(distDir)) {
  console.error('\x1b[31mError: dist/ directory not found. Please build the launcher first:\x1b[0m')
  console.error('  npm run dist && npm run dist:linux')
  process.exit(1)
}

const foundAssets = []
for (const name of expectedAssets) {
  const file = path.join(distDir, name)
  if (fs.existsSync(file)) {
    const sizeMb = (fs.statSync(file).size / (1024 * 1024)).toFixed(1)
    console.log(`  ✓ ${name} (${sizeMb} MB)`)
    foundAssets.push(file)
  } else {
    console.warn(`  ⚠ Missing: ${name}`)
  }
}

if (!foundAssets.some(f => f.endsWith('.exe')) || !foundAssets.some(f => f.endsWith('.deb'))) {
  console.error('\x1b[31mError: Required build binaries (.exe and .deb) are missing from dist/.\x1b[0m')
  process.exit(1)
}

// Check latest.yml and latest-linux.yml version consistency
for (const yml of ['latest.yml', 'latest-linux.yml']) {
  const ymlPath = path.join(distDir, yml)
  if (fs.existsSync(ymlPath)) {
    const content = fs.readFileSync(ymlPath, 'utf8')
    if (!content.includes(`version: ${ver}`)) {
      console.error(`\x1b[31mError: ${yml} does not contain "version: ${ver}". Auto-updater would be inconsistent!\x1b[0m`)
      process.exit(1)
    }
  }
}

// GitHub API helper functions
function githubRequest (method, endpoint, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`)
    const opts = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'User-Agent': 'Xion-Release-Tool',
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        ...headers
      }
    }
    const req = https.request(opts, res => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {}
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json)
          } else {
            reject(new Error(`GitHub API ${res.statusCode}: ${json.message || body}`))
          }
        } catch {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(body)
          else reject(new Error(`GitHub API ${res.statusCode}: ${body}`))
        }
      })
    })
    req.on('error', reject)
    if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data))
    req.end()
  })
}

function uploadAsset (uploadUrlTemplate, filePath) {
  return new Promise((resolve, reject) => {
    const filename = path.basename(filePath)
    const stat = fs.statSync(filePath)
    const uploadUrl = uploadUrlTemplate.replace('{?name,label}', `?name=${encodeURIComponent(filename)}`)
    const url = new URL(uploadUrl)
    console.log(`    Uploading ${filename} (${(stat.size / (1024 * 1024)).toFixed(1)} MB)…`)

    const opts = {
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'User-Agent': 'Xion-Release-Tool',
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size
      }
    }

    const req = https.request(opts, res => {
      let body = ''
      res.on('data', d => { body += d })
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`    ✓ Uploaded ${filename}`)
          resolve(true)
        } else {
          reject(new Error(`Failed to upload ${filename}: ${res.statusCode} - ${body}`))
        }
      })
    })
    req.on('error', reject)
    const stream = fs.createReadStream(filePath)
    stream.pipe(req)
  })
}

async function publishGithubRelease () {
  console.log('\n\x1b[33m-- Step 1: Publishing GitHub Release (Enables client auto-update) --\x1b[0m')
  if (isDryRun) {
    console.log('[DRY-RUN] Would create GitHub release ' + tag + ' with ' + foundAssets.length + ' assets.')
    return
  }

  // Check if gh CLI is available and authed
  const hasGh = spawnSync('which', ['gh']).status === 0
  const ghAuthed = hasGh && spawnSync('gh', ['auth', 'status']).status === 0

  if (ghAuthed) {
    console.log('Using authenticated GitHub CLI (gh)...')
    const assetArgs = foundAssets.map(f => `"${f}"`).join(' ')
    const notesFile = path.join(ROOT, 'release-notes', `notes-${ver}.md`)
    const notesCmd = fs.existsSync(notesFile) ? `--notes-file "${notesFile}"` : `--notes "${releaseNotes.replace(/"/g, '\\"')}"`
    const cmd = `gh release create "${tag}" ${assetArgs} --repo "${REPO}" --title "${tag}" ${notesCmd} --latest`
    console.log('Running: ' + cmd)
    execSync(cmd, { stdio: 'inherit' })
    console.log(`\x1b[32m✓ GitHub Release ${tag} published via gh CLI.\x1b[0m`)
    return
  }

  // Otherwise, use direct GitHub API with token
  if (!GITHUB_TOKEN) {
    console.warn('\x1b[33mGitHub Token not detected.\x1b[0m')
    console.log('To publish the release automatically, either:')
    console.log('  1. Sign in with GitHub CLI: gh auth login')
    console.log('  2. Or run with your personal access token: node scripts/release.js --token=YOUR_GITHUB_TOKEN')
    console.log('  3. Or export GITHUB_TOKEN=YOUR_GITHUB_TOKEN in your environment.')
    return false
  }

  console.log('Using GitHub REST API with GITHUB_TOKEN...')
  // Check if release already exists
  let release
  try {
    release = await githubRequest('GET', `/repos/${REPO}/releases/tags/${tag}`)
    console.log(`Release ${tag} already exists (id: ${release.id}). Uploading missing assets...`)
  } catch {
    console.log(`Creating release ${tag}...`)
    release = await githubRequest('POST', `/repos/${REPO}/releases`, {
      tag_name: tag,
      target_commitish: 'main',
      name: tag,
      body: releaseNotes,
      draft: false,
      prerelease: false,
      make_latest: 'true'
    })
    console.log(`Created release ${tag} (id: ${release.id})`)
  }

  // List existing assets to avoid duplicate error
  const existingAssets = release.assets || []
  const existingNames = new Set(existingAssets.map(a => a.name))

  for (const assetPath of foundAssets) {
    const filename = path.basename(assetPath)
    if (existingNames.has(filename)) {
      console.log(`    Asset ${filename} already exists on release, skipping.`)
      continue
    }
    await uploadAsset(release.upload_url, assetPath)
  }

  console.log(`\x1b[32m✓ Release ${tag} is live on GitHub with all update assets.\x1b[0m`)
  return true
}

async function deployWebsite () {
  if (skipVercel) {
    console.log('\nSkipping Vercel deployment (--skip-vercel).')
    return
  }
  console.log('\n\x1b[33m-- Step 2: Deploying Website to Vercel (xionx.vercel.app) --\x1b[0m')
  const websiteDir = path.join(ROOT, 'website')
  if (!fs.existsSync(websiteDir)) {
    console.warn('website/ directory not found.')
    return
  }

  if (isDryRun) {
    console.log('[DRY-RUN] Would deploy website/ to Vercel.')
    return
  }

  try {
    console.log('Deploying website directory via Vercel CLI...')
    execSync('npx --yes vercel --prod --yes', { cwd: websiteDir, stdio: 'inherit' })
    console.log('\x1b[32m✓ Website successfully deployed to Vercel.\x1b[0m')
  } catch (err) {
    console.warn('\x1b[33mVercel deployment error:\x1b[0m', err.message)
    console.log('To login to Vercel on this computer, run: npx vercel login')
  }
}

async function main () {
  try {
    const githubSuccess = await publishGithubRelease()
    await deployWebsite()
    console.log('\n\x1b[32m====================================================\x1b[0m')
    console.log('\x1b[32m== Xion Launcher 1.18.0 Release Process Complete! ==\x1b[0m')
    console.log('\x1b[32m====================================================\x1b[0m')
    console.log('All installed launchers (v1.10 - v1.17) will automatically detect')
    console.log('v1.18.0 and update on their next launch or 3-hour check.')
  } catch (err) {
    console.error('\x1b[31mRelease failed:\x1b[0m', err.message)
    process.exit(1)
  }
}

main()
