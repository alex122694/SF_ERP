// 由狀態推導出各頁需要的數字
import type { State } from '../data/db';
import { TYPHOON, annualStatus, asOfDate, isEmployedOn, settlementsDue, typhoonLeaves, type Employee } from '../rules/rules';

/** 畫面用的狀態：加上颱風停班日自動算出的颱風假紀錄（依日期排序） */
export function withTyphoon(st: State): State {
  const tp = st.leaveTypes.find((x) => x.code === TYPHOON);
  if (!tp) return st;
  const extra = typhoonLeaves(st.employees, st.days, tp.payRatio);
  if (!extra.length) return st;
  const leaves = [...st.leaves, ...extra].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { ...st, leaves };
}

/** 自動產生的紀錄（颱風假）不能編輯、刪除 */
export const isAuto = (l: { id: number }) => l.id < 0;

export const typeOf = (st: State, code: string) => st.leaveTypes.find((t) => t.code === code);
export const empOf = (st: State, id: number) => st.employees.find((e) => e.id === id);

export const annualNow = (st: State, emp: Employee, today: string) =>
  annualStatus(emp, st.leaves, st.settlements, asOfDate(emp, today));

export const settlementFor = (st: State, empId: number, periodStart: string) =>
  st.settlements.find((s) => s.employeeId === empId && s.periodStart === periodStart);

export const SETTLE_LABEL = { cash: '已換錢', defer: '已遞延', zero: '已歸零' } as const;

export const remindDays = (st: State) => Number(st.settings.annual_remind_days) || 30;

/** 手動改放假日／上班日的原因快選清單（設定值為 JSON 陣列） */
export function dayReasons(st: State): string[] {
  try {
    const v = JSON.parse(st.settings.day_reasons ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
  } catch { return []; }
}

export const dueList = (st: State, today: string) =>
  settlementsDue(st.employees, st.leaves, st.settlements, today, remindDays(st), st.settings.annual_track_from ?? '');

export const activeEmployees = (st: State, date: string) => st.employees.filter((e) => isEmployedOn(e, date));

/** 需要提醒匯入的行事曆年度：今年未匯入，或 10 月起明年未匯入 */
export function missingCalendarYears(st: State, today: string): number[] {
  const y = Number(today.slice(0, 4));
  const have = new Set(st.calendarYears.map((c) => c.year));
  const out: number[] = [];
  if (!have.has(y)) out.push(y);
  if (Number(today.slice(5, 7)) >= 10 && !have.has(y + 1)) out.push(y + 1);
  return out;
}
