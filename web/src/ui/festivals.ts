// 月曆的節日：國曆節日、農曆節日（依 lunar.ts 的農曆日期）、母親節、除夕；名稱以 t() 依介面語言顯示
import { lunarOf } from './lunar';

/** 國曆節日（月-日） */
const SOLAR: Record<string, string> = {
  '01-01': '元旦', '02-14': '情人節', '02-28': '和平紀念日', '03-08': '婦女節', '03-12': '植樹節', '04-04': '兒童節',
  '05-01': '勞動節', '08-08': '父親節', '09-28': '教師節', '10-10': '國慶日', '10-25': '臺灣光復節', '12-25': '聖誕節',
};

/** 農曆節日（月-日，閏月不算） */
const LUNAR: Record<string, string> = {
  '1-1': '春節', '1-15': '元宵節', '5-5': '端午節', '7-7': '七夕', '7-15': '中元節', '8-15': '中秋節', '9-9': '重陽節',
};

const nextDay = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** 這一天的節日（中文原文）；同一天有多個時都列出 */
export function festivalsOf(date: string): string[] {
  const out: string[] = [];
  const solar = SOLAR[date.slice(5)];
  if (solar) out.push(solar);
  const [, m, d] = date.split('-').map(Number);
  if (m === 5 && d >= 8 && d <= 14 && new Date(`${date}T00:00:00Z`).getUTCDay() === 0) out.push('母親節'); // 5 月第二個星期日
  const l = lunarOf(date);
  const lunar = !l.leap && LUNAR[`${l.monthNo}-${l.day}`];
  if (lunar) out.push(lunar);
  const next = lunarOf(nextDay(date));
  if (next.monthNo === 1 && next.day === 1 && !next.leap) out.push('除夕');
  return out;
}
