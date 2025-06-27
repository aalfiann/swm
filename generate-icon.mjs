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

// Ensure directories
await fs.mkdir(OUTPUT_PWA, { recursive: true })

// Ask input
const { input, appName, generateFavicon } = await inquirer.prompt([
  {
    type: 'input',
    name: 'input',
    message: 'Enter path to source icon (e.g., src/icon-512x512.png):',
    default: 'src/icon-512x512.png'
  },
  {
    type: 'input',
    name: 'appName',
    message: 'What is your app name (for iOS title)?',
    default: 'My PWA'
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
  await fs.writeFile(INDEX_SRC, '<!DOCTYPE html><html><head></head><body></body></html>', 'utf-8')
}

// Copy manifest and index.html to output
await fs.copyFile(MANIFEST_SRC, MANIFEST_OUT)
await fs.copyFile(INDEX_SRC, INDEX_OUT)

// Run pwa-asset-generator
const args = [
  input,
  OUTPUT_PWA,
  `--manifest=${MANIFEST_OUT}`,
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

// Inject PWA tags to index.html
let html = await fs.readFile(INDEX_OUT, 'utf-8')

const headCloseTag = '</head>'
const linkTags = `
  <!-- PWA Assets -->
  <link rel="manifest" href="/pwa-assets/manifest.json">
  <link rel="apple-touch-icon" sizes="180x180" href="/pwa-assets/apple-icon-180.png">
  <link rel="icon" type="image/png" sizes="196x196" href="/pwa-assets/favicon-196.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/pwa-assets/manifest-icon-192.maskable.png">
  <link rel="icon" type="image/png" sizes="512x512" href="/pwa-assets/manifest-icon-512.maskable.png">
  <meta name="apple-mobile-web-app-title" content="${appName}">
  <meta name="apple-mobile-web-app-status-bar-style">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <!-- PWA Assets for iOS Splash Screen -->
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-2048-2732.jpg" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-2732-2048.jpg" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-1668-2388.jpg" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-2388-1668.jpg" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-1536-2048.jpg" media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-2048-1536.jpg" media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-1640-2360.jpg" media="(device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-2360-1640.jpg" media="(device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-1668-2224.jpg" media="(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-2224-1668.jpg" media="(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-1620-2160.jpg" media="(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-2160-1620.jpg" media="(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-1488-2266.jpg" media="(device-width: 744px) and (device-height: 1133px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-2266-1488.jpg" media="(device-width: 744px) and (device-height: 1133px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-1320-2868.jpg" media="(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-2868-1320.jpg" media="(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-1206-2622.jpg" media="(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-2622-1206.jpg" media="(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-1290-2796.jpg" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-2796-1290.jpg" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-1179-2556.jpg" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-2556-1179.jpg" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-1170-2532.jpg" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-2532-1170.jpg" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-1284-2778.jpg" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-2778-1284.jpg" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-1125-2436.jpg" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-2436-1125.jpg" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-1242-2688.jpg" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-2688-1242.jpg" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-828-1792.jpg" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-1792-828.jpg" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-1242-2208.jpg" media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-2208-1242.jpg" media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-750-1334.jpg" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-1334-750.jpg" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-640-1136.jpg" media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
  <link rel="apple-touch-startup-image" href="/pwa-assets/apple-splash-1136-640.jpg" media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)">
  <meta name="theme-color" content="#ffffff">
`.trim()

html = html.replace(/<!-- PWA Assets -->[\s\S]*?<meta name="theme-color".*?>/, '')
html = html.replace(headCloseTag, `  ${linkTags}\n${headCloseTag}`)

await fs.writeFile(INDEX_OUT, html, 'utf-8')
console.log(`✅ Updated ${INDEX_OUT} with PWA asset links`)

// Copy service worker files
if (existsSync(SW_SRC)) copyFileSync(SW_SRC, path.join(OUTPUT_DIR, 'sw.js'))
if (existsSync(SWM_SRC)) copyFileSync(SWM_SRC, path.join(OUTPUT_DIR, 'swm.js'))

console.log('\n✅ Done!\n')
