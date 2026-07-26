import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  esbuild: {
    charset: 'utf8',
  },
  define: {
    'process.env': {}
  },
  build: {
    outDir: 'build',
    charset: 'utf8'
  }
})
