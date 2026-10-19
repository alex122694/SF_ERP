import { WEEKDAY_NAMES, weekday, type LeaveRecord, type LeaveType } from '../rules/rules';

export const money = (n: number) => n.toLocaleString('en-US');
export const ntd = (n: number) => `NT$ ${money(n)}`;

/** 遲到以分鐘顯示，其他以小時 */
export function amountText(rec: Pick<LeaveRecord, 'type' | 'hours'>): string {
  return rec.type === 'late' ? `${Math.round(rec.hours * 60)} 分` : `${fmtHours(rec.hours)} h`;
}

export const fmtHours = (h: number) => String(Math.round(h * 100) / 100);

export const mdText = (date: string) => {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}（${WEEKDAY_NAMES[weekday(date)]}）`;
};

export const longDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return `${y} 年 ${m} 月 ${d} 日 · 星期${WEEKDAY_NAMES[weekday(date)]}`;
};

export const typeColor = (t: Pick<LeaveType, 'color'> | undefined) => `var(--${t?.color ?? 'late'})`;
export const typeTint = (t: Pick<LeaveType, 'color'> | undefined) => `color-mix(in srgb, var(--${t?.color ?? 'late'}) 20%, transparent)`;
export const typeShort = (t: Pick<LeaveType, 'name'> | undefined) => t?.name.slice(0, 1) ?? '';

/** CSV 下載（UTF-8 BOM，Excel 開啟不會變亂碼） */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const text = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  downloadBlob(filename, new Blob([text], { type: 'text/csv;charset=utf-8' }));
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
