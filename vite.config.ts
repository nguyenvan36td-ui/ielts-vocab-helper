import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 允许局域网 IP 和临时公网隧道域名访问（如 loca.lt），仅开发环境生效
    allowedHosts: true,
  },
})
