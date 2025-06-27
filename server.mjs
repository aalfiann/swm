import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

// Resolve __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Spawn http-server at root (.) to serve everything
const server = spawn('npx', ['http-server', '.', '-p', '8080'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
})

server.on('close', (code) => {
  console.log(`http-server exited with code ${code}`)
})
