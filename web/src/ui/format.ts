import { toDays, weekday, type LeaveRecord, type LeaveType } from '../rules/rules';
import { LANGS, getLang, t, type Lang } from '../i18n';

export const money = (n: number) => n.toLocaleString('en-US');
export const ntd = (n: number) => `NT$ ${money(n)}`;

export type AnnualUnitName = 'day' | 'hour';

/** 特休的純文字（用在 title、確認視窗等不能放按鈕的地方）；畫面上可點的版本見 annual-unit.tsx */
export const annualText = (h: number, unit: AnnualUnitName = 'day') => (unit === 'day' ? t('{0} 天', [toDays(h)]) : t('{0} 小時', [fmtHours(h)]));

/** 遲到以分鐘顯示，特休以天（或小時），其他以小時 */
export function amountText(rec: Pick<LeaveRecord, 'type' | 'hours'>, unit: AnnualUnitName = 'day'): string {
  if (rec.type === 'late') return t('{0} 分', [Math.round(rec.hours * 60)]);
  if (rec.type === 'annual') return annualText(rec.hours, unit);
  return `${fmtHours(rec.hours)} h`;
}

export const fmtHours = (h: number) => String(Math.round(h * 100) / 100);

/** 星期的簡稱（日～六） */
const WEEKDAYS: Record<Lang, string[]> = {
  zh: ['日', '一', '二', '三', '四', '五', '六'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ja: ['日', '月', '火', '水', '木', '金', '土'],
  ko: ['일', '월', '화', '수', '목', '금', '토'],
};
export const weekdayName = (i: number) => WEEKDAYS[getLang()][i];

export const mdText = (date: string) => {
  const [, m, d] = date.split('-').map(Number);
  const w = weekdayName(weekday(date));
  return getLang() === 'en' || getLang() === 'ko' ? `${m}/${d} (${w})` : `${m}/${d}（${w}）`;
};

export const longDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  if (getLang() === 'zh') return `${y} 年 ${m} 月 ${d} 日 · 星期${weekdayName(weekday(date))}`;
  const html = LANGS.find((l) => l.code === getLang())!.html;
  return new Intl.DateTimeFormat(html, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
};

/** 年月標題，例如「2026 年 10 月」 */
export const ymText = (y: number, m: number) => t('{0} 年 {1} 月', [y, m]);

/** 假別名稱（資料表存中文，畫面依語言顯示） */
export const typeName = (tp: Pick<LeaveType, 'name'> | undefined) => (tp ? t(tp.name) : '');

export const typeColor = (t: Pick<LeaveType, 'color'> | undefined) => `var(--${t?.color ?? 'late'})`;
export const typeTint = (t: Pick<LeaveType, 'color'> | undefined) => `color-mix(in srgb, var(--${t?.color ?? 'late'}) 20%, transparent)`;
export const typeShort = (tp: Pick<LeaveType, 'name'> | undefined) => typeName(tp).slice(0, 1);

/** CSV 下載（UTF-8 BOM，Excel 開啟不會變亂碼） */
/**
 * CSV 內容（UTF-8 BOM）。文字以 = + - @ Tab 或換行開頭時前面加 '，
 * 避免 Excel 把姓名、信箱等欄位當成公式執行（CSV 公式注入）；數字不受影響
 */
export function csvText(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = typeof v === 'string' && /^[=+\-@\t\r\n]/.test(v) ? `'${v}` : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  downloadBlob(filename, new Blob([csvText(rows)], { type: 'text/csv;charset=utf-8' }));
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
