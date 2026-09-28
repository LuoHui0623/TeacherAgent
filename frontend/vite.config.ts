import { createReadStream, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

const pyodideFiles = [
  'pyodide.mjs',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'pyodide-lock.json',
  'python_stdlib.zip',
]
const frontendDirectory = fileURLToPath(new URL('.', import.meta.url))
const pyodideDirectory = resolve(frontendDirectory, 'node_modules/pyodide')

function pyodideAssets(): Plugin {
  let isBuild = false

  return {
    name: 'pyodide-assets',
    configResolved(config) {
      isBuild = config.command === 'build'
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split('?')[0] ?? ''
        if (!pathname.startsWith('/pyodide/')) {
          next()
          return
        }

        const fileName = pathname.slice('/pyodide/'.length)
        if (!pyodideFiles.includes(fileName)) {
          next()
          return
        }

        const filePath = resolve(pyodideDirectory, fileName)
        const contentTypes: Record<string, string> = {
          '.json': 'application/json',
          '.mjs': 'text/javascript',
          '.wasm': 'application/wasm',
          '.zip': 'application/zip',
        }
        const extension = fileName.slice(fileName.lastIndexOf('.'))
        response.setHeader('Content-Type', contentTypes[extension])
        response.setHeader('Content-Length', statSync(filePath).size)
        createReadStream(filePath).pipe(response)
      })
    },
    buildStart() {
      if (!isBuild) return

      for (const fileName of pyodideFiles) {
        this.emitFile({
          type: 'asset',
          fileName: `pyodide/${fileName}`,
          source: readFileSync(resolve(pyodideDirectory, fileName)),
        })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), pyodideAssets()],
})
