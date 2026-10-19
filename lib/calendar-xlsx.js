// 解析人事行政總處「政府行政機關辦公日曆表.xlsx」
// 該檔是月曆版面（12 個月曆方塊），放假日以格子底色標示，所以用底色判斷。
import zlib from 'node:zlib';
import { daysInMonth, ymd, weekday } from '../public/shared/rules.js';

/** 讀取 zip 內所有檔案 → Map<檔名, Buffer> */
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    const dataStart = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
    const data = buf.subarray(dataStart, dataStart + compSize);
    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, zlib.inflateRawSync(data));
  }
  return files;
}

// 政府檔案有時混用「相容表意文字」（例如 2027 年檔案一月的「六」是 U+F9D1，外觀與 U+516D 相同），先正規化成標準字
const decodeXml = (s) => s.normalize('NFKC')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');

const textOf = (xml) => decodeXml([...xml.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((m) => m[1]).join(''));

const colNum = (letters) => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);

const HEADER = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * @returns {{ year: number, holidays: string[] }} holidays 為該年所有放假日（YYYY-MM-DD）
 * 格式無法辨識時丟出錯誤，訊息可直接顯示給使用者
 */
export function parseGovCalendar(buf) {
  let files;
  try { files = unzip(buf); } catch { throw new Error('檔案不是有效的 xlsx'); }
  const fail = (why) => new Error(`無法辨識辦公日曆表格式：${why}`);
  const read = (name) => files.get(name)?.toString('utf8') ?? '';

  const sheetXml = read('xl/worksheets/sheet1.xml');
  if (!sheetXml) throw fail('找不到工作表');

  const strings = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));

  const styles = read('xl/styles.xml');
  const fillsXml = styles.match(/<fills[^>]*>([\s\S]*?)<\/fills>/)?.[1] ?? '';
  const solidFill = [...fillsXml.matchAll(/<fill>([\s\S]*?)<\/fill>/g)].map((m) => /patternType="solid"/.test(m[1]));
  const xfsXml = styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? '';
  const xfFill = [...xfsXml.matchAll(/<xf\b([^>]*)/g)].map((m) => Number(m[1].match(/fillId="(\d+)"/)?.[1] ?? 0));

  // 儲存格 → { text, num, fillId }
  const cells = new Map();
  const key = (c, r) => `${c},${r}`;
  for (const m of sheetXml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, letters, row, attrs, inner = ''] = m;
    const type = attrs.match(/\st="(\w+)"/)?.[1];
    const fillId = xfFill[Number(attrs.match(/\ss="(\d+)"/)?.[1] ?? 0)] ?? 0;
    const v = inner.match(/<v>([^<]*)<\/v>/)?.[1];
    let text = null, num = null;
    if (type === 's' && v != null) text = strings[Number(v)] ?? '';
    else if (type === 'inlineStr') text = textOf(inner);
    else if (type === 'str' && v != null) text = decodeXml(v);
    else if (v != null && (type === undefined || type === 'n')) num = Number(v);
    cells.set(key(colNum(letters), Number(row)), { text, num, fillId });
  }

  const year = Number(strings.join('\n').match(/西元\s*(\d{4})\s*年/)?.[1]);
  if (!year) throw fail('標題找不到「西元 XXXX 年」');

  // 圖例「放假日」左邊有底色的格子就是放假日的底色；找不到時，任何實心底色都視為放假
  let holidayFill = null;
  for (const [k, cell] of cells) {
    if (cell.text?.trim() !== '放假日') continue;
    const [c, r] = k.split(',').map(Number);
    for (let cc = c - 1; cc >= Math.max(1, c - 4); cc--) {
      const sw = cells.get(key(cc, r));
      if (sw && solidFill[sw.fillId]) { holidayFill = sw.fillId; break; }
    }
  }
  const isHolidayCell = (cell) => (holidayFill != null ? cell.fillId === holidayFill : solidFill[cell.fillId]);

  // 找出 12 個月曆方塊：連續 7 格「日一二三四五六」為星期標題列
  const blocks = [];
  for (const [k, cell] of cells) {
    if (cell.text !== '日') continue;
    const [c, r] = k.split(',').map(Number);
    if (HEADER.every((h, i) => cells.get(key(c + i, r))?.text === h)) blocks.push({ c, r });
  }
  if (blocks.length !== 12) throw fail(`找到 ${blocks.length} 個月曆方塊，應為 12 個`);
  blocks.sort((a, b) => a.r - b.r || a.c - b.c);

  const holidays = [];
  blocks.forEach((b, i) => {
    const month = i + 1;
    const below = blocks.filter((o) => o.c === b.c && o.r > b.r).map((o) => o.r);
    const lastRow = below.length ? Math.min(...below) - 1 : b.r + 14;
    const seen = new Set();
    for (let r = b.r + 1; r <= lastRow; r++) {
      for (let wd = 0; wd < 7; wd++) {
        const cell = cells.get(key(b.c + wd, r));
        if (!cell || cell.num == null || !Number.isInteger(cell.num) || cell.num < 1 || cell.num > 31) continue;
        const date = ymd(year, month, cell.num);
        if (seen.has(date) || cell.num > daysInMonth(year, month) || weekday(date) !== wd) {
          throw fail(`${month} 月 ${cell.num} 日的位置與星期不符`);
        }
        seen.add(date);
        if (isHolidayCell(cell)) holidays.push(date);
      }
    }
    if (seen.size !== daysInMonth(year, month)) throw fail(`${month} 月只讀到 ${seen.size} 天`);
  });

  return { year, holidays: holidays.sort() };
}
