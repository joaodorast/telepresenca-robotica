import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Modo "lan" (npm run lan): HTTPS com certificado autoassinado — câmera e microfone só
// funcionam em HTTPS fora do localhost — e o próprio Vite repassa /api e /ws ao servidor
// de sinalização local, então os notebooks da rede só precisam alcançar uma porta.
const SIGNALING_TARGET = process.env.SIGNALING_TARGET || 'http://localhost:8787';

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'lan' ? [basicSsl({ name: 'telepresenca-lan' })] : [])],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: SIGNALING_TARGET },
      '/ws': { target: SIGNALING_TARGET, ws: true },
    },
  },
  build: {
    target: 'es2021',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
}));
