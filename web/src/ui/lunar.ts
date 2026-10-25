// 月曆的農民曆：農曆日期用瀏覽器內建的中國曆（Intl），節氣以太陽黃經計算（台灣時間），都不需要外部資料
// 農曆與節氣是傳統寫法，各種介面語言都照中文顯示（tests/i18n.test.ts 略過這個檔案）；節日名稱在 festivals.ts 有翻譯
import { ymd } from '../rules/rules';

const nameFmt = new Intl.DateTimeFormat('zh-TW-u-ca-chinese', { month: 'long', timeZone: 'UTC' });
const numFmt = new Intl.DateTimeFormat('en-u-ca-chinese', { month: 'numeric', day: 'numeric', timeZone: 'UTC' });
const cache = new Map<string, Lunar>();

export interface Lunar {
  /** 月份名稱，例如「九月」「閏六月」「臘月」 */
  month: string;
  /** 月份 1～12（閏月與前一個月同數字） */
  monthNo: number;
  day: number;
  leap: boolean;
}

export function lunarOf(date: string): Lunar {
  const hit = cache.get(date);
  if (hit) return hit;
  const d = new Date(`${date}T00:00:00Z`);
  const parts = numFmt.formatToParts(d);
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const l = { month: nameFmt.format(d), monthNo: parseInt(m, 10), day: Number(parts.find((p) => p.type === 'day')?.value), leap: m.endsWith('bis') };
  cache.set(date, l);
  return l;
}

const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** 農曆日的寫法：初一～初十、十一～十九、二十、廿一～廿九、三十 */
export function lunarDayText(d: number): string {
  if (d <= 10) return `初${DIGITS[d]}`;
  if (d < 20) return `十${DIGITS[d - 10]}`;
  if (d === 20) return '二十';
  if (d < 30) return `廿${DIGITS[d - 20]}`;
  return '三十';
}

/** 月曆格內的農曆文字：初一顯示月份（例如「九月」），其他日子顯示日（例如「十六」） */
export const lunarText = (date: string) => {
  const l = lunarOf(date);
  return l.day === 1 ? l.month : lunarDayText(l.day);
};

// ---------- 節氣 ----------

/** 從小寒（黃經 285°）起，每 15° 一個節氣 */
const TERMS = ['小寒', '大寒', '立春', '雨水', '驚蟄', '春分', '清明', '穀雨', '立夏', '小滿', '芒種', '夏至',
  '小暑', '大暑', '立秋', '處暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'];

const rad = Math.PI / 180;

/** 太陽視黃經（度）；jd 為儒略日（TT），精度約 0.01°（Meeus 低精度公式） */
function sunLongitude(jd: number): number {
  const T = (jd - 2451545) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * rad;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
  const omega = (125.04 - 1934.136 * T) * rad;
  const lon = L0 + C - 0.00569 - 0.00478 * Math.sin(omega);
  return ((lon % 360) + 360) % 360;
}

const termCache = new Map<number, Map<string, string>>();

/** 某一年 24 節氣的日期（台灣時間）→ 節氣名稱 */
export function solarTerms(year: number): Map<string, string> {
  const hit = termCache.get(year);
  if (hit) return hit;
  const out = new Map<string, string>();
  const jan1 = Date.UTC(year, 0, 1) / 86400000 + 2440587.5;
  TERMS.forEach((name, i) => {
    const target = (285 + i * 15) % 360;
    let jd = jan1 + 5 + i * 15.22; // 初估，再以牛頓法逼近
    for (let k = 0; k < 6; k++) {
      const diff = ((target - sunLongitude(jd) + 540) % 360) - 180;
      jd += diff / 0.9856;
    }
    const ut = jd - 69 / 86400; // TT → UT（ΔT 約 69 秒）
    const tw = new Date((ut - 2440587.5) * 86400000 + 8 * 3600000);
    out.set(ymd(tw.getUTCFullYear(), tw.getUTCMonth() + 1, tw.getUTCDate()), name);
  });
  termCache.set(year, out);
  return out;
}

export const solarTermOf = (date: string) => solarTerms(Number(date.slice(0, 4))).get(date);
