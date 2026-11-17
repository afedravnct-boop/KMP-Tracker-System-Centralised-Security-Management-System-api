import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000', // Local FastAPI backend proxy for development
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    // Increased to 3000 to clear the 2.1MB warning from your build logs
    chunkSizeWarningLimit: 3000, 
    
    // Splits heavy third-party libraries into smaller, faster-loading files
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('xlsx')) return 'vendor-excel';
            if (id.includes('react-quill') || id.includes('quill')) return 'vendor-quill';
            if (id.includes('recharts')) return 'vendor-charts';
            if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
            return 'vendor-core';
          }
        }
      }
    }
  }
})