// 解析人事行政總處「政府行政機關辦公日曆表.xlsx」（在瀏覽器內執行，不用外部套件）
// 該檔是月曆版面（12 個月曆方塊），放假日以格子底色標示，所以用底色判斷。
import { daysInMonth, weekday, ymd } from '../rules/rules';
import { UserError, msg, type Msg } from '../rules/msg';

/** 解壓縮後的總大小上限；正常的辦公日曆表解開不到 1 MB */
const MAX_UNZIPPED = 50 * 1024 * 1024;
const tooLarge = () => new UserError(msg('檔案解壓縮後超過 {0} MB，不是正常的辦公日曆表', [MAX_UNZIPPED / 1024 / 1024]));

/** 邊解壓邊計算大小，超過 limit 立刻停止（不相信 zip 標頭寫的大小） */
async function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
  const reader = (new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')) as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw tooLarge(); }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

/** 讀取 zip 內所有檔案 → Map<檔名, 內容> */
export async function unzip(buf: Uint8Array, maxTotal = MAX_UNZIPPED): Promise<Map<string, Uint8Array>> {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const files = new Map<string, Uint8Array>();
  let budget = maxTotal;
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('bad central directory');
    const method = v.getUint16(p + 10, true);
    const compSize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const localOff = v.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    const dataStart = localOff + 30 + v.getUint16(localOff + 26, true) + v.getUint16(localOff + 28, true);
    const data = buf.subarray(dataStart, dataStart + compSize);
    const out = method === 0 ? data : method === 8 ? await inflateRaw(data, budget) : null;
    if (!out) continue;
    budget -= out.length;
    if (budget < 0) throw tooLarge();
    files.set(name, out);
  }
  return files;
}

// 政府檔案有時混用「相容表意文字」（例如 2027 年檔案一月的「六」是 U+F9D1，外觀與 U+516D 相同），先正規化成標準字
const decodeXml = (s: string) => s.normalize('NFKC')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');

const textOf = (xml: string) => decodeXml([...xml.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((m) => m[1]).join(''));
const colNum = (letters: string) => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
const HEADER = ['日', '一', '二', '三', '四', '五', '六'];

interface Cell { text: string | null; num: number | null; fillId: number }

/** 回傳該年度所有放假日（YYYY-MM-DD）；格式無法辨識時丟出錯誤，訊息可直接顯示給使用者 */
export async function parseGovCalendar(buf: Uint8Array): Promise<{ year: number; holidays: string[] }> {
  let files: Map<string, Uint8Array>;
  try { files = await unzip(buf); } catch (e) { throw e instanceof UserError ? e : new UserError(msg('檔案不是有效的 xlsx')); }
  const fail = (why: Msg) => new UserError(msg('無法辨識辦公日曆表格式：{0}', [why]));
  const dec = new TextDecoder();
  const read = (name: string) => { const f = files.get(name); return f ? dec.decode(f) : ''; };

  const sheetXml = read('xl/worksheets/sheet1.xml');
  if (!sheetXml) throw fail(msg('找不到工作表'));

  const strings = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));

  const styles = read('xl/styles.xml');
  const fillsXml = styles.match(/<fills[^>]*>([\s\S]*?)<\/fills>/)?.[1] ?? '';
  const solidFill = [...fillsXml.matchAll(/<fill>([\s\S]*?)<\/fill>/g)].map((m) => /patternType="solid"/.test(m[1]));
  const xfsXml = styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? '';
  const xfFill = [...xfsXml.matchAll(/<xf\b([^>]*)/g)].map((m) => Number(m[1].match(/fillId="(\d+)"/)?.[1] ?? 0));

  const cells = new Map<string, Cell>();
  const key = (c: number, r: number) => `${c},${r}`;
  for (const m of sheetXml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, letters, row, attrs, inner = ''] = m;
    const type = attrs.match(/\st="(\w+)"/)?.[1];
    const fillId = xfFill[Number(attrs.match(/\ss="(\d+)"/)?.[1] ?? 0)] ?? 0;
    const v = inner.match(/<v>([^<]*)<\/v>/)?.[1];
    let text: string | null = null, num: number | null = null;
    if (type === 's' && v != null) text = strings[Number(v)] ?? '';
    else if (type === 'inlineStr') text = textOf(inner);
    else if (type === 'str' && v != null) text = decodeXml(v);
    else if (v != null && (type === undefined || type === 'n')) num = Number(v);
    cells.set(key(colNum(letters), Number(row)), { text, num, fillId });
  }

  const year = Number(strings.join('\n').match(/西元\s*(\d{4})\s*年/)?.[1]);
  if (!year) throw fail(msg('標題找不到「西元 XXXX 年」'));

  // 圖例「放假日」左邊有底色的格子就是放假日的底色；找不到時，任何實心底色都視為放假
  let holidayFill: number | null = null;
  for (const [k, cell] of cells) {
    if (cell.text?.trim() !== '放假日') continue;
    const [c, r] = k.split(',').map(Number);
    for (let cc = c - 1; cc >= Math.max(1, c - 4); cc--) {
      const sw = cells.get(key(cc, r));
      if (sw && solidFill[sw.fillId]) { holidayFill = sw.fillId; break; }
    }
  }
  const isHolidayCell = (cell: Cell) => (holidayFill != null ? cell.fillId === holidayFill : solidFill[cell.fillId]);

  // 12 個月曆方塊：連續 7 格「日一二三四五六」為星期標題列
  const blocks: { c: number; r: number }[] = [];
  for (const [k, cell] of cells) {
    if (cell.text !== '日') continue;
    const [c, r] = k.split(',').map(Number);
    if (HEADER.every((h, i) => cells.get(key(c + i, r))?.text === h)) blocks.push({ c, r });
  }
  if (blocks.length !== 12) throw fail(msg('找到 {0} 個月曆方塊，應為 12 個', [blocks.length]));
  blocks.sort((a, b) => a.r - b.r || a.c - b.c);

  const holidays: string[] = [];
  blocks.forEach((b, i) => {
    const month = i + 1;
    const below = blocks.filter((o) => o.c === b.c && o.r > b.r).map((o) => o.r);
    const lastRow = below.length ? Math.min(...below) - 1 : b.r + 14;
    const seen = new Set<string>();
    for (let r = b.r + 1; r <= lastRow; r++) {
      for (let wd = 0; wd < 7; wd++) {
        const cell = cells.get(key(b.c + wd, r));
        if (!cell || cell.num == null || !Number.isInteger(cell.num) || cell.num < 1 || cell.num > 31) continue;
        const date = ymd(year, month, cell.num);
        if (seen.has(date) || cell.num > daysInMonth(year, month) || weekday(date) !== wd) {
          throw fail(msg('{0} 月 {1} 日的位置與星期不符', [month, cell.num]));
        }
        seen.add(date);
        if (isHolidayCell(cell)) holidays.push(date);
      }
    }
    if (seen.size !== daysInMonth(year, month)) throw fail(msg('{0} 月只讀到 {1} 天', [month, seen.size]));
  });

  return { year, holidays: holidays.sort() };
}
