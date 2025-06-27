// generate-icons.mjs
import inquirer from 'inquirer'
import { execa } from 'execa'
import path from 'path'
import fs from 'fs/promises'
import { existsSync, rmSync, copyFileSync } from 'fs'

const OUTPUT_DIR = 'output'
const OUTPUT_PWA = path.join(OUTPUT_DIR, 'pwa-assets')
const SRC_DIR = 'src'

const MANIFEST_SRC = path.join(SRC_DIR, 'manifest.json')
const INDEX_SRC = path.join(SRC_DIR, 'index.html')
const SW_SRC = path.join(SRC_DIR, 'sw.js')
const SWM_SRC = path.join(SRC_DIR, 'swm.js')

const MANIFEST_OUT = path.join(OUTPUT_PWA, 'manifest.json')
const INDEX_OUT = path.join(OUTPUT_DIR, 'index.html')

// Clean output dir
if (existsSync(OUTPUT_DIR)) {
  console.log(`🧹 Removing existing ${OUTPUT_DIR}...`)
  rmSync(OUTPUT_DIR, { recursive: true, force: true })
}

// Removing src/index.html
if (existsSync(SRC_DIR+'/index.html')) {
  console.log(`🧹 Removing existing ${SRC_DIR}/index.html ...`)
  rmSync(SRC_DIR+'/index.html', { recursive: true, force: true })
}

// Ensure directories
await fs.mkdir(OUTPUT_PWA, { recursive: true })

// Ask input
const { appName, input, generateFavicon } = await inquirer.prompt([
  {
    type: 'input',
    name: 'appName',
    message: 'What is your app name (for iOS title)?',
    default: 'My PWA'
  },
  {
    type: 'input',
    name: 'input',
    message: 'Enter path to source icon (e.g., src/icon-512x512.png):',
    default: 'src/icon-512x512.png'
  },
  {
    type: 'confirm',
    name: 'generateFavicon',
    message: 'Generate favicons too?',
    default: true
  }
])

// Ensure manifest exists
if (!existsSync(MANIFEST_SRC)) {
  console.log(`📄 Creating missing ${MANIFEST_SRC}`)
  await fs.mkdir(SRC_DIR, { recursive: true })
  await fs.writeFile(MANIFEST_SRC, '{}', 'utf-8')
}

// Ensure index.html exists
if (!existsSync(INDEX_SRC)) {
  console.log(`📄 Creating missing ${INDEX_SRC}`)
  await fs.writeFile(INDEX_SRC, `<!DOCTYPE html>
  <html>
    <head>
      <link rel="manifest" href="pwa-assets/manifest.json">
      <meta name="apple-mobile-web-app-title" content="${appName}">
      <meta name="apple-mobile-web-app-status-bar-style">
    </head>
    <body>
      <h1>Hello PWA</h1>
      <script src="/swm.js"></script>
      <script>
        try {
          ServiceWorkerManager.register();

          // get sw config [optional]
          ServiceWorkerManager.getSWConfig().then(data => {
            console.log('SW Config:', data);
          });

          // get sw cleanup status [optional]
          ServiceWorkerManager.getSWCleanupStatus().then(data => {
            console.log('SW Cleanup Status:', data);
          });

          // service worker error listener
          window.addEventListener('serviceworker-error', function (e) {
            console.log(e.detail);
          });
        } catch (err) {
          console.log(err);
        }
      </script>
    </body>
  </html>`, 'utf-8')
}

// Copy manifest and index.html to output
await fs.copyFile(MANIFEST_SRC, MANIFEST_OUT)
await fs.copyFile(INDEX_SRC, INDEX_OUT)

// Run pwa-asset-generator
const args = [
  input,
  OUTPUT_PWA,
  `--manifest=${MANIFEST_OUT}`,
  `--index=${INDEX_OUT}`,
  generateFavicon ? '--favicon' : ''
].filter(Boolean)

console.log('\n🚀 Running: npx pwa-asset-generator', args.join(' '), '\n')
try {
  await execa('npx', ['pwa-asset-generator', ...args], { stdio: 'inherit' })
} catch (e) {
  console.error('❌ Failed to generate PWA assets:', e)
  process.exit(1)
}

// Fix manifest path issue
let manifestData = JSON.parse(await fs.readFile(MANIFEST_OUT, 'utf-8'))
manifestData.icons = manifestData.icons.map(icon => {
  icon.src = path.basename(icon.src)
  return icon
})
manifestData.scope = '/'
await fs.writeFile(MANIFEST_OUT, JSON.stringify(manifestData, null, 2), 'utf-8')

// Copy service worker files
if (existsSync(SW_SRC)) copyFileSync(SW_SRC, path.join(OUTPUT_DIR, 'sw.js'))
if (existsSync(SWM_SRC)) copyFileSync(SWM_SRC, path.join(OUTPUT_DIR, 'swm.js'))

console.log('\n✅ Done!\n')
