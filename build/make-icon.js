// Generates icon.png and icon.ico for packaging
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const root = path.resolve(__dirname, '..')
const srcLogo = path.join(root, 'store', 'assets', 'logo.png')
const outPng = path.join(__dirname, 'icon.png')
const outIco = path.join(__dirname, 'icon.ico')

fs.copyFileSync(srcLogo, outPng)
execSync(`python3 -c "from PIL import Image; img = Image.open('${outPng}'); img.save('${outIco}', format='ICO', sizes=[(16,16), (32,32), (48,48), (64,64), (128,128), (256,256)])"`, { stdio: 'inherit' })
console.log('Generated build/icon.png and build/icon.ico successfully.')
