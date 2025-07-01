// renderer/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  // this config file is in renderer/, so "." == renderer/
  root: '.',
  plugins: [react()],
  define: {
    __IS_DEV__: JSON.stringify(process.env.NODE_ENV === 'development'),
  },
  base: './', // make asset paths relative for file:// loads
  build: {
    outDir: '../dist/renderer', // emit to project/dist/renderer
    emptyOutDir: true
  },

  // development server settings
  server: {
    port: 5173,
    strictPort: true
  }
})