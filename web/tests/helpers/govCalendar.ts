// 測試用：產生與「政府行政機關辦公日曆表.xlsx」相同版面的檔案（12 個月曆方塊、放假日以底色標示）
import zlib from 'node:zlib';
import { daysInMonth, weekday, ymd } from '../../src/rules/rules';

function zip(files: Record<string, string>): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = zlib.deflateRawSync(Buffer.from(text, 'utf8'));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(Buffer.byteLength(text), 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(Buffer.byteLength(text), 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, eocd]));
}

const col = (n: number) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

/** 週末與 extraHolidays 為放假日 */
export function makeGovCalendar(year: number, extraHolidays: string[] = [], opts: { compatSat?: boolean } = {}): Uint8Array {
  // compatSat：一月的「六」改用相容表意文字 U+F9D1（2027 年政府檔案實際出現的情形）
  const strings = [`${year - 1911}年（西元 ${year} 年）政府行政機關辦公日曆表`, '日', '一', '二', '三', '四', '五', '六', '放假日', '六'];
  const rows = new Map<number, string[]>();
  const put = (r: number, xml: string) => { if (!rows.has(r)) rows.set(r, []); rows.get(r)!.push(xml); };
  const str = (c: number, r: number, idx: number, s = 0) => put(r, `<c r="${col(c)}${r}" s="${s}" t="s"><v>${idx}</v></c>`);
  const num = (c: number, r: number, n: number, s: number) => put(r, `<c r="${col(c)}${r}" s="${s}"><v>${n}</v></c>`);
  str(1, 1, 0);
  put(2, '<c r="A2" s="1"/>');
  str(2, 2, 8);
  const extra = new Set(extraHolidays);
  for (let m = 1; m <= 12; m++) {
    const c0 = 1 + ((m - 1) % 4) * 8, r0 = 4 + Math.floor((m - 1) / 4) * 9;
    for (let i = 0; i < 7; i++) str(c0 + i, r0, opts.compatSat && m === 1 && i === 6 ? 9 : i + 1);
    let r = r0 + 1;
    for (let d = 1; d <= daysInMonth(year, m); d++) {
      const date = ymd(year, m, d);
      const wd = weekday(date);
      if (d > 1 && wd === 0) r++;
      num(c0 + wd, r, d, wd === 0 || wd === 6 || extra.has(date) ? 1 : 0);
    }
  }
  const sheetRows = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([r, cs]) => `<row r="${r}">${cs.join('')}</row>`).join('');
  return zip({
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet><sheetData>${sheetRows}</sheetData></worksheet>`,
    'xl/sharedStrings.xml': `<?xml version="1.0"?><sst>${strings.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`,
    'xl/styles.xml': '<?xml version="1.0"?><styleSheet><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFC000"/></patternFill></fill></fills><cellXfs count="2"><xf fillId="0"/><xf fillId="2"/></cellXfs></styleSheet>',
  });
}
