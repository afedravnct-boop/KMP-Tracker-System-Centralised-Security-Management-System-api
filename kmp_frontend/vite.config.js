import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// vite.config.js
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000', // Just the raw URL!
        changeOrigin: true,
        secure: false,
        // WE DELETED THE REWRITE RULE! 
        // Now it sends the full '/api/v1/...' string directly to FastAPI
      }
    }
  }
})