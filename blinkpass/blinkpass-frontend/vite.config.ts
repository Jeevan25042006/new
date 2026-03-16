import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:8005',
      '/user': 'http://localhost:8005',
      '/identity': 'http://localhost:8005',
      '/credentials': 'http://localhost:8005',
      '/developer': 'http://localhost:8005',
      '/oauth2': 'http://localhost:8005',
    },
  },
})
