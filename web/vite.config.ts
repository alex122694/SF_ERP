/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 打包後的 lite 不載入任何外部資源：禁止對外連線與外部腳本，只允許內嵌的程式、樣式與 WASM。
// 只在打包時加入，開發伺服器（需要載入模組與即時更新）不受影響
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const csp = (): Plugin => ({
  name: 'sf-erp-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="${CSP}">`),
});

// lite 以 file:// 開啟，瀏覽器不准另外載入 JS 模組與 .wasm，所以全部內嵌成單一 index.html
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile(), csp()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 10_000,
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
