import { describe, expect, it } from 'vitest';
import cases from '../../shared/rules-cases.json';
import {
  DEFAULT_LEAVE_TYPES, annualDaysForYears, annualMinutes, annualPeriod, annualStatus, buildSettlement, cashOut, checkLeave,
  checkEmployee, deduction, leaveMinutes, seniorityText, settlementMonthOf, settlementRange, settlementsDue,
  type Employee, type LeaveCheck, type LeaveContext, type LeaveRecord, type Settlement,
} from '../src/rules/rules';

describe('shared/rules-cases.json', () => {
  it.each(cases.leaveMinutes)('leaveMinutes $start-$end', (c) => expect(leaveMinutes(c.start, c.end)).toBe(c.minutes));
  it.each(cases.deduction)('deduction $minutes min $salary $payRatio', (c) =>
    expect(deduction(c.minutes, c.salary, c.payRatio)).toBe(c.amount));
  it.each(cases.cashOut)('cashOut $hours h $salary', (c) => expect(cashOut(c.hours, c.salary)).toBe(c.amount));
  it.each(cases.annualDaysForYears)('annualDays $years', (c) => expect(annualDaysForYears(c.years)).toBe(c.days));
  it.each(cases.annualPeriod)('annualPeriod $base @ $date', (c) => {
    const p = annualPeriod(c.base, c.date);
    expect(p && { start: p.start, end: p.end, days: p.days }).toEqual(c.period);
  });
  it.each(cases.seniority)('seniority $from', (c) => expect(String(seniorityText(c.from, c.asOf))).toBe(c.text));
});

const emp = (over: Partial<Employee> = {}): Employee => ({
  id: 1, name: '陳怡君', gender: 'F', salary: 36000, hireDate: '2021-03-01', annualBaseDate: '2021-03-01',
  leaveDate: null, email: '', phone: '', ...over,
});
let nextId = 100;
const rec = (date: string, type: string, start: string, end: string, employeeId = 1): LeaveRecord => ({
  id: nextId++, employeeId, date, type, start, end, hours: (type === 'annual' ? annualMinutes(start, end) : leaveMinutes(start, end)) / 60, deduction: 0, salary: 36000, reason: '',
});
const ctx = (over: Partial<LeaveContext> = {}): LeaveContext => ({
  employees: [emp(), emp({ id: 2, name: '林志明', gender: 'M', salary: 42000 })],
  leaves: [], settlements: [], leaveTypes: DEFAULT_LEAVE_TYPES,
  calendars: { isHoliday: (d) => (d.startsWith('2026') ? ['2026-10-09', '2026-10-17', '2026-10-18'].includes(d) : undefined) },
  ...over,
});
const input = (over: Partial<Parameters<typeof checkLeave>[0]> = {}) => ({
  employeeId: 1, date: '2026-10-19', type: 'sick', start: '13:30', end: '18:30', reason: '', ...over,
});

/** 錯誤訊息的中文全文 */
const errOf = (r: LeaveCheck) => (r.ok ? null : String(r.error));

describe('月結區間（上月 23 日 ~ 本月 22 日）', () => {
  it('N 月 = 上月 23 日 ~ N 月 22 日，1 月跨年，全年 = 前一年 12/23 ~ 當年 12/22', () => {
    expect(settlementRange(2026, 10)).toEqual({ from: '2026-09-23', to: '2026-10-22' });
    expect(settlementRange(2026, 1)).toEqual({ from: '2025-12-23', to: '2026-01-22' });
    expect(settlementRange(2026, 3)).toEqual({ from: '2026-02-23', to: '2026-03-22' });
    expect(settlementRange(2026, 0)).toEqual({ from: '2025-12-23', to: '2026-12-22' });
  });
  it('22 日算本月、23 日起算下個月', () => {
    expect(settlementMonthOf('2026-10-22')).toEqual({ year: 2026, month: 10 });
    expect(settlementMonthOf('2026-10-23')).toEqual({ year: 2026, month: 11 });
    expect(settlementMonthOf('2026-12-23')).toEqual({ year: 2027, month: 1 });
    expect(settlementMonthOf('2026-01-01')).toEqual({ year: 2026, month: 1 });
  });
});

describe('checkLeave', () => {
  it('算出時數與扣款', () => {
    const r = checkLeave(input(), ctx());
    expect(r).toMatchObject({ ok: true, hours: 5, deduction: 375 });
  });
  it('遲到依分鐘扣款，最多 30 分鐘', () => {
    expect(checkLeave(input({ type: 'late', start: '09:30', end: '09:42', employeeId: 1 }), ctx())).toMatchObject({ ok: true, minutes: 12, deduction: 30 });
    expect(checkLeave(input({ type: 'late', start: '09:30', end: '10:01' }), ctx()).ok).toBe(false);
  });
  it('放假日、未匯入年度不能登記', () => {
    expect(errOf(checkLeave(input({ date: '2026-10-09' }), ctx()))).toContain('放假日');
    expect(errOf(checkLeave(input({ date: '2027-01-04' }), ctx()))).toBe('請先匯入 2027 年行事曆');
  });
  it('生理假限女性、特休只能選時段', () => {
    expect(checkLeave(input({ employeeId: 2, type: 'menstrual' }), ctx()).ok).toBe(false);
    expect(checkLeave(input({ type: 'annual', start: '09:30', end: '10:30' }), ctx()).ok).toBe(false);
  });
  it('同一天時段不能重疊', () => {
    const c = ctx({ leaves: [rec('2026-10-19', 'personal', '09:30', '14:00')] });
    expect(errOf(checkLeave(input(), c))).toContain('重疊');
    expect(checkLeave(input({ start: '14:00' }), c).ok).toBe(true);
  });
  it('特休以半天為單位：上午、下午各 4h，全天 8h，扣款 0', () => {
    expect(checkLeave(input({ type: 'annual', start: '09:30', end: '12:00' }), ctx())).toMatchObject({ ok: true, hours: 4, deduction: 0 });
    expect(checkLeave(input({ type: 'annual', start: '13:30', end: '18:30' }), ctx())).toMatchObject({ ok: true, hours: 4, deduction: 0 });
    expect(checkLeave(input({ type: 'annual', start: '09:30', end: '18:30' }), ctx())).toMatchObject({ ok: true, hours: 8, deduction: 0 });
  });
  it('特休額度不足不能登記', () => {
    // 2026-03-01 起 15 日 = 120h，已休 14 天 + 半天 = 116h，剩半天
    const used = Array.from({ length: 14 }, (_, i) => rec(`2026-04-${String(i + 1).padStart(2, '0')}`, 'annual', '09:30', '18:30'));
    used.push(rec('2026-05-04', 'annual', '13:30', '18:30'));
    const r = checkLeave(input({ type: 'annual', start: '09:30', end: '18:30' }), ctx({ leaves: used }));
    expect(errOf(r)).toBe('特休剩餘 0.5 天，不夠扣 1 天。');
    // 規則層只回傳訊息代碼與參數，由畫面層翻譯
    expect(r.ok ? null : { key: r.error.key, args: r.error.args }).toEqual({ key: '特休剩餘 {0} 天，不夠扣 {1} 天。', args: [0.5, 1] });
    expect(checkLeave(input({ type: 'annual', start: '09:30', end: '12:00' }), ctx({ leaves: used })).ok).toBe(true);
  });
});

describe('特休遞延', () => {
  const defer: Settlement = {
    id: 1, employeeId: 1, periodStart: '2025-03-01', periodEnd: '2026-02-28', remainingHours: 10, action: 'defer',
    amount: 0, deferredHours: 10, deferredUntil: '2027-02-28', decidedAt: '2026-02-20',
  };
  it('先扣遞延額度，再扣本期', () => {
    const leaves = [rec('2026-03-10', 'annual', '09:30', '18:30'), rec('2026-03-11', 'annual', '09:30', '18:30')];
    const st = annualStatus(emp(), leaves, [defer], '2026-10-19');
    expect(st).toMatchObject({ entitled: 120, deferred: 10, used: 16, deferredUsed: 10, currentUsed: 6, deferredRemaining: 0, currentRemaining: 114, remaining: 114 });
  });
  it('到期提醒：遞延額度只能換錢、本期可遞延', () => {
    const leaves = [rec('2026-03-10', 'annual', '09:30', '12:00')];
    const due = settlementsDue([emp()], leaves, [defer], '2027-02-10', 30);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ reason: 'expiring', daysLeft: 18, actions: ['cash', 'defer', 'zero'] });
    const s = buildSettlement(due[0], 'defer', '2027-02-10');
    // 遞延 10h 用掉半天（4h），剩 6h 換錢（6 × 150），本期剩 120h 遞延
    expect(s).toMatchObject({ remainingHours: 126, amount: 900, deferredHours: 120, deferredUntil: '2028-02-29', periodEnd: '2027-02-28' });
  });
  it('離職只能換錢；已處理的不再提醒', () => {
    const e = emp({ leaveDate: '2026-09-30' });
    const due = settlementsDue([e], [], [], '2026-10-19', 30);
    // 上一期（2025-03-01～2026-02-28）也沒處理，同樣只能換錢
    expect(due.map((d) => [d.reason, d.actions, d.cashAll])).toEqual([['expired', ['cash'], 16800], ['resigned', ['cash'], 18000]]);
    const s = { ...buildSettlement(due[1], 'cash', '2026-10-19'), id: 9 };
    expect(settlementsDue([e], [], [s], '2026-10-19', 30).filter((d) => d.reason === 'resigned')).toHaveLength(0);
  });
  it('追蹤起算日之前到期的期間不提醒', () => {
    const due = settlementsDue([emp({ leaveDate: '2026-09-30' })], [], [], '2026-10-19', 30, '2026-10-01');
    expect(due.map((d) => d.reason)).toEqual(['resigned']);
  });
});

describe('checkEmployee', () => {
  const base = { name: '王小明', gender: 'M', salary: '30000', hireDate: '2026-01-05', annualBaseDate: '', leaveDate: '', email: '', phone: '' };
  it('特休年資起算日預設等於到職日', () => {
    expect(checkEmployee(base, [])).toMatchObject({ ok: true, value: { annualBaseDate: '2026-01-05', salary: 30000, leaveDate: null } });
  });
  it('離職日須晚於到職日、信箱格式', () => {
    expect(checkEmployee({ ...base, leaveDate: '2026-01-05' }, []).ok).toBe(false);
    expect(checkEmployee({ ...base, email: 'abc' }, []).ok).toBe(false);
  });
});
