// lite 發佈：預設只更新解壓縮後的資料夾 release/SF ERP-lite/SF ERP/（index.html、data/、使用說明.txt）；
// 加 --zip 才另外打包成 release/SF ERP-lite.zip。資料夾裡的 data/ 只建立、不清空，不會動到裡面的資料檔
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const WEB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(WEB, '..', 'release');
const ROOT = 'SF ERP';

const README = `SF ERP（lite）使用說明
====================================

1. 把整個 SF ERP 資料夾放在固定位置（例如 D:\\SF ERP）。
2. 用 Microsoft Edge 或 Google Chrome 開啟 index.html
   （在檔案總管對 index.html 按右鍵 →「開啟檔案」→ 選 Edge 或 Chrome）。
3. 第一次開啟時按「選擇資料夾」，選 SF ERP\\data，瀏覽器問「要允許編輯檔案嗎？」時選「允許」。
   系統會在 data 裡建立 sf_erp.sqlite（資料檔）和 backup\\（每天自動備份，保留 30 份）。
4. 之後每次開啟，只要按「允許存取並開啟」。

舊版資料：開啟後到「制度與設定」→「匯入舊版資料」，選舊版的 data\\db.json。
備份：整個 data 資料夾複製走，就是完整備份。
注意：同一時間只讓一台電腦開啟同一個 data 資料夾。
`;

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const isDir = name.endsWith('/');
    const comp = isDir ? Buffer.alloc(0) : zlib.deflateRawSync(data, { level: 9 });
    const crc = isDir ? 0 : zlib.crc32(data);
    const method = isDir ? 0 : 8;
    const header = (sig, central) => {
      const b = Buffer.alloc(central ? 46 : 30);
      b.writeUInt32LE(sig, 0);
      let p = 4;
      if (central) { b.writeUInt16LE(20, p); p += 2; }
      b.writeUInt16LE(20, p); // version needed
      b.writeUInt16LE(0x0800, p + 2); // UTF-8 檔名
      b.writeUInt16LE(method, p + 4);
      b.writeUInt32LE(crc, p + 10);
      b.writeUInt32LE(comp.length, p + 14);
      b.writeUInt32LE(isDir ? 0 : data.length, p + 18);
      b.writeUInt16LE(nameBuf.length, p + 22);
      if (central) {
        b.writeUInt32LE(isDir ? 0x10 : 0, 38);
        b.writeUInt32LE(offset, 42);
      }
      return b;
    };
    locals.push(header(0x04034b50, false), nameBuf, comp);
    centrals.push(header(0x02014b50, true), nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const html = fs.readFileSync(path.join(WEB, 'dist', 'index.html'));
if (/<script[^>]+src=/.test(html.toString('utf8'))) throw new Error('index.html 仍引用外部 script，file:// 開啟會失敗');

const readme = Buffer.from('\uFEFF' + README.replaceAll('\n', '\r\n'), 'utf8');
const rel = (p) => path.relative(path.join(WEB, '..'), p);

const dir = path.join(OUT_DIR, 'SF ERP-lite', ROOT);
fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
fs.writeFileSync(path.join(dir, 'index.html'), html);
fs.writeFileSync(path.join(dir, '使用說明.txt'), readme);
console.log(`已更新 ${rel(dir)}${path.sep}（index.html ${(html.length / 1024).toFixed(0)} KB）`);

if (process.argv.includes('--zip')) {
  const out = path.join(OUT_DIR, 'SF ERP-lite.zip');
  fs.writeFileSync(out, zip([
    { name: `${ROOT}/`, data: Buffer.alloc(0) },
    { name: `${ROOT}/index.html`, data: html },
    { name: `${ROOT}/data/`, data: Buffer.alloc(0) },
    { name: `${ROOT}/使用說明.txt`, data: readme },
  ]));
  console.log(`已輸出 ${rel(out)}（${(fs.statSync(out).size / 1024).toFixed(0)} KB）`);
}
