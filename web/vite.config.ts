import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 輕量版以 file:// 開啟，瀏覽器不准另外載入 JS 模組與 .wasm，所以全部內嵌成單一 index.html
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 10_000,
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
