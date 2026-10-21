import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { Db, UserError, calendarsOf } from '../src/data/db';
import { msg } from '../src/rules/msg';
import { checkLeaveDays, expandLeaveRange } from '../src/rules/rules';
import { MIGRATIONS } from '../src/data/schema';
import { parseGovCalendar } from '../src/data/calendarXlsx';
import { importLegacyJson } from '../src/data/legacyImport';
import { makeGovCalendar } from './helpers/govCalendar';

let SQL: SqlJsStatic;
beforeAll(async () => { SQL = await initSqlJs(); });

const empInput = { name: '陳怡君', gender: 'F', salary: 36000, hireDate: '2021-03-01', annualBaseDate: '', leaveDate: '', email: '', phone: '' };

async function seeded() {
  const db = Db.open(SQL);
  const { year, holidays } = await parseGovCalendar(makeGovCalendar(2026, ['2026-10-09']));
  db.importCalendar(year, holidays, 'test.xlsx');
  const id = db.saveEmployee(empInput);
  return { db, id };
}

describe('行事曆 xlsx', () => {
  it('依底色讀出放假日', async () => {
    const r = await parseGovCalendar(makeGovCalendar(2026, ['2026-10-09']));
    expect(r.year).toBe(2026);
    expect(r.holidays).toContain('2026-10-09');
    expect(r.holidays).toContain('2026-10-17');
    expect(r.holidays).not.toContain('2026-10-19');
    expect(r.holidays).toHaveLength(105);
  });
  it('星期標題用相容表意文字（U+F9D1「六」）也能辨識', async () => {
    const r = await parseGovCalendar(makeGovCalendar(2027, [], { compatSat: true }));
    expect(r.year).toBe(2027);
    expect(r.holidays).toContain('2027-01-02');
    expect(r.holidays).toHaveLength(104);
  });
  it('不是 xlsx 時給出可讀的錯誤', async () => {
    await expect(parseGovCalendar(new Uint8Array([1, 2, 3]))).rejects.toThrow('檔案不是有效的 xlsx');
  });
  it('重新匯入不覆蓋手動修改', async () => {
    const { db } = await seeded();
    db.setDay('2026-10-09', false, '補班');
    const r = db.importCalendar(2026, ['2026-10-09'], 'again.xlsx');
    expect(r.keptOverrides).toBe(1);
    expect(calendarsOf(db.state().days).isHoliday('2026-10-09')).toBe(false);
    db.resetDay('2026-10-09');
    expect(calendarsOf(db.state().days).isHoliday('2026-10-09')).toBe(true);
  });
});

describe('手動改放假日／上班日', () => {
  it('必須填原因；改回與政府日曆相同時清掉原因', async () => {
    const { db } = await seeded();
    expect(() => db.setDay('2026-10-20', true, '  ')).toThrow('請輸入手動修改的原因');
    db.setDay('2026-10-20', true, ' 颱風停班 ');
    expect(db.state().days.get('2026-10-20')).toEqual({ gov: false, override: true, reason: '颱風停班' });
    db.setDay('2026-10-20', false);
    expect(db.state().days.get('2026-10-20')).toEqual({ gov: false, override: null, reason: null });
    db.setDay('2026-10-17', false, '補班');
    db.resetDay('2026-10-17');
    expect(db.state().days.get('2026-10-17')).toMatchObject({ override: null, reason: null });
  });
  it('預設的原因快選', () => {
    expect(JSON.parse(Db.open(SQL).state().settings.day_reasons)).toEqual(['颱風停班', '公司自訂休假', '補班', '公司活動']);
  });
});

describe('Db', () => {
  it('建立後有預設假別與設定', () => {
    const st = Db.open(SQL).state();
    expect(st.leaveTypes.map((t) => t.code)).toEqual(['annual', 'personal', 'sick', 'menstrual', 'official', 'late']);
    expect(st.settings.annual_remind_days).toBe('30');
  });
  it('登記、編輯、刪除紀錄，扣款於存檔時算好', async () => {
    const { db, id } = await seeded();
    const lid = db.saveLeave({ employeeId: id, date: '2026-10-19', type: 'sick', start: '13:30', end: '18:30', reason: ' 看診 ' });
    expect(db.state().leaves[0]).toMatchObject({ id: lid, hours: 5, deduction: 375, reason: '看診' });
    db.saveLeave({ employeeId: id, date: '2026-10-19', type: 'personal', start: '13:30', end: '14:30', reason: '' }, lid);
    expect(db.state().leaves[0]).toMatchObject({ type: 'personal', hours: 1, deduction: 150 });
    expect(() => db.saveLeave({ employeeId: id, date: '2026-10-18', type: 'sick', start: '09:30', end: '12:00', reason: '' })).toThrow(UserError);
    db.deleteLeave(lid);
    expect(db.state().leaves).toHaveLength(0);
  });
  it('多日請假：略過放假日、首尾日用各自的時段、中間全天', async () => {
    const { db, id } = await seeded();
    const base = { employeeId: id, date: '2026-10-08', type: 'sick', start: '13:30', end: '18:30', reason: '感冒' };
    const exp = expandLeaveRange(base, '2026-10-13', { start: '09:30', end: '12:00' }, calendarsOf(db.state().days));
    expect(exp.skipped).toEqual(['2026-10-09', '2026-10-10', '2026-10-11']);
    expect(exp.days.map((d) => `${d.date} ${d.start}-${d.end}`)).toEqual(['2026-10-08 13:30-18:30', '2026-10-12 09:30-18:30', '2026-10-13 09:30-12:00']);
    expect(db.saveLeaves(exp.days)).toHaveLength(3);
    expect(db.state().leaves.map((l) => l.hours)).toEqual([5, 8, 2.5]);
  });
  it('多日請假有一天不行就整批退回，並指出是哪一天', async () => {
    const { db, id } = await seeded();
    db.saveLeave({ employeeId: id, date: '2026-10-13', type: 'sick', start: '09:30', end: '12:00', reason: '' });
    const days = expandLeaveRange({ employeeId: id, date: '2026-10-12', type: 'personal', start: '09:30', end: '18:30', reason: '' }, '2026-10-14', { start: '09:30', end: '18:30' }, calendarsOf(db.state().days)).days;
    expect(() => db.saveLeaves(days)).toThrow(/^2026-10-13：/);
    expect(db.state().leaves).toHaveLength(1);
  });
  it('多日特休額度逐日累計', async () => {
    const { db, id } = await seeded();
    db.saveLeave({ employeeId: id, date: '2026-10-08', type: 'annual', start: '09:30', end: '18:30', reason: '' });
    const ctx = { ...db.state(), calendars: calendarsOf(db.state().days) };
    const days = expandLeaveRange({ employeeId: id, date: '2026-10-12', type: 'annual', start: '09:30', end: '18:30', reason: '' }, '2026-10-16', { start: '09:30', end: '18:30' }, ctx.calendars).days;
    expect(checkLeaveDays(days, ctx).ok).toBe(true);
    const many = expandLeaveRange({ employeeId: id, date: '2026-10-12', type: 'annual', start: '09:30', end: '18:30', reason: '' }, '2027-01-31', { start: '09:30', end: '18:30' }, ctx.calendars);
    expect(many.error?.toString()).toBe('一次最多登記 92 天');
    expect(expandLeaveRange({ employeeId: id, date: '2026-10-12', type: 'annual', start: '09:30', end: '18:30', reason: '' }, '2026-10-11', { start: '09:30', end: '18:30' }, ctx.calendars).error?.toString()).toBe('結束日不能早於起始日');
  });
  it('有紀錄的日子不能改為放假日', async () => {
    const { db, id } = await seeded();
    db.saveLeave({ employeeId: id, date: '2026-10-19', type: 'annual', start: '09:30', end: '18:30', reason: '' });
    expect(() => db.setDay('2026-10-19', true)).toThrow('這天已有 1 筆紀錄');
  });
  it('有紀錄或特休處理紀錄的員工不能刪除，沒有紀錄的可以', async () => {
    const { db, id } = await seeded();
    db.saveLeave({ employeeId: id, date: '2026-10-19', type: 'sick', start: '09:30', end: '12:00', reason: '' });
    expect(() => db.deleteEmployee(id)).toThrow('不能刪除');
    expect(db.state().leaves).toHaveLength(1);
    const settledOnly = db.saveEmployee({ ...empInput, name: '只有結算' });
    db.settle(settledOnly, '2026-03-01', 'cash', '2027-02-10');
    expect(() => db.deleteEmployee(settledOnly)).toThrow('不能刪除');
    const blank = db.saveEmployee({ ...empInput, name: '建錯的' });
    db.deleteEmployee(blank);
    expect(db.state().employees.map((e) => e.id)).toEqual([id, settledOnly]);
  });
  it('編輯舊紀錄以登記當時的薪資計算扣款，不以調薪後的薪資', async () => {
    const { db, id } = await seeded();
    const lid = db.saveLeave({ employeeId: id, date: '2026-10-19', type: 'personal', start: '09:30', end: '10:30', reason: '' });
    expect(db.state().leaves[0]).toMatchObject({ salary: 36000, deduction: 150 });
    db.saveEmployee({ ...empInput, salary: 48000 }, id);
    db.saveLeave({ employeeId: id, date: '2026-10-19', type: 'personal', start: '09:30', end: '11:30', reason: '改時段' }, lid);
    expect(db.state().leaves[0]).toMatchObject({ salary: 36000, deduction: 300, reason: '改時段' });
    db.saveLeave({ employeeId: id, date: '2026-10-20', type: 'personal', start: '09:30', end: '10:30', reason: '' });
    expect(db.state().leaves[1]).toMatchObject({ salary: 48000, deduction: 200 });
  });
  it('升級時既有紀錄補上當時薪資欄位', async () => {
    const old = new SQL.Database();
    for (let v = 0; v < 4; v++) old.exec(MIGRATIONS[v]);
    old.exec('PRAGMA user_version = 4');
    old.exec(`INSERT INTO employee (name, gender, salary, hire_date, annual_base_date, created_at, updated_at) VALUES ('甲', 'F', 42000, '2021-03-01', '2021-03-01', '', '')`);
    old.exec(`INSERT INTO leave_record (employee_id, date, type_code, start_time, end_time, hours, deduction, created_at, updated_at) VALUES (1, '2026-10-19', 'sick', '09:30', '12:00', 2.5, 219, '', '')`);
    expect(Db.open(SQL, old.export()).state().leaves[0]).toMatchObject({ salary: 42000, deduction: 219 });
  });
  it('特休換錢後不能再登記該期特休', async () => {
    const { db, id } = await seeded();
    const s = db.settle(id, '2026-03-01', 'cash', '2027-02-10');
    expect(s).toMatchObject({ action: 'cash', remainingHours: 120, amount: 18000 });
    expect(() => db.saveLeave({ employeeId: id, date: '2026-10-19', type: 'annual', start: '09:30', end: '12:00', reason: '' })).toThrow('已結清');
    expect(() => db.settle(id, '2026-03-01', 'cash', '2027-02-10')).toThrow(UserError);
  });
  it('升級時舊特休紀錄換算成半天單位', async () => {
    const old = new SQL.Database();
    old.exec(MIGRATIONS[0]); old.exec(MIGRATIONS[1]); old.exec('PRAGMA user_version = 2');
    old.exec(`INSERT INTO employee (name, gender, salary, hire_date, annual_base_date, created_at, updated_at) VALUES ('甲', 'F', 36000, '2021-03-01', '2021-03-01', '', '')`);
    for (const [date, type, start, end, hours] of [['2026-10-19', 'annual', '09:30', '12:00', 2.5], ['2026-10-20', 'annual', '13:30', '18:30', 5],
      ['2026-10-21', 'annual', '09:30', '18:30', 7.5], ['2026-10-22', 'sick', '09:30', '12:00', 2.5]]) {
      old.run(`INSERT INTO leave_record (employee_id, date, type_code, start_time, end_time, hours, deduction, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, 0, '', '')`, [date, type, start, end, hours]);
    }
    const st = Db.open(SQL, old.export()).state();
    expect(st.leaves.map((l) => l.hours)).toEqual([4, 4, 8, 2.5]);
    expect(st.leaveTypes.find((t) => t.code === 'annual')?.unitMinutes).toBe(240);
  });
  it('匯出再開啟資料不變', async () => {
    const { db } = await seeded();
    const again = Db.open(SQL, db.export()).state();
    expect(again.employees).toHaveLength(1);
    expect(again.days.size).toBe(365);
  });
  it('巢狀交易：內層出錯時整批還原', async () => {
    const { db } = await seeded();
    expect(() => db.tx(() => {
      db.importCalendar(2027, [], 'x.xlsx');
      throw new UserError(msg('boom'));
    })).toThrow('boom');
    expect(db.state().calendarYears.map((c) => c.year)).toEqual([2026]);
  });
  it('壞掉的資料檔給出可讀錯誤', () => {
    expect(() => Db.open(SQL, new Uint8Array([1, 2, 3, 4]))).toThrow('資料檔損毀');
  });
});

describe('舊版 db.json 匯入', () => {
  const legacy = {
    nextId: 5,
    employees: [{ id: 1, name: '測試員工', gender: 'F', salary: 36000, hireDate: '2021-03-01', leaveDate: null, email: '', phone: '' }],
    leaves: [{ id: 2, empId: 1, date: '2026-10-19', type: 'sick', start: '13:30', end: '18:30', reason: '', hours: 5, amount: 375 }],
    calendars: { 2026: { govHolidays: ['2026-10-17', '2026-10-18'], overrides: { '2026-10-24': false }, uploadedAt: '2026-01-02T03:04:05.000Z' } },
  };
  it('轉入員工、紀錄、行事曆與手動修改', () => {
    const db = Db.open(SQL);
    const r = importLegacyJson(db, JSON.stringify(legacy));
    expect(r).toEqual({ employees: 1, leaves: 1, years: [2026], overrides: 1 });
    const st = db.state();
    expect(st.employees[0]).toMatchObject({ name: '測試員工', annualBaseDate: '2021-03-01' });
    expect(calendarsOf(st.days).isHoliday('2026-10-17')).toBe(true);
    expect(st.days.get('2026-10-24')).toEqual({ gov: false, override: false, reason: null });
  });
  it('時數與扣款用規則重新計算，不採用檔案裡的數字', () => {
    const db = Db.open(SQL);
    const bad = { ...legacy, leaves: [{ ...legacy.leaves[0], hours: 99, amount: 99999 }, { id: 3, empId: 1, date: '2026-10-20', type: 'annual', start: '09:30', end: '12:00', hours: 2.5, amount: 0 }] };
    importLegacyJson(db, JSON.stringify(bad));
    expect(db.state().leaves.map((l) => [l.hours, l.deduction])).toEqual([[5, 375], [4, 0]]);
  });
  it('格式錯誤的紀錄整批取消', () => {
    const cases = [
      { ...legacy.leaves[0], date: '2026-13-40' },
      { ...legacy.leaves[0], start: '18:30', end: '13:30' },
      { ...legacy.leaves[0], empId: 9 },
    ];
    for (const l of cases) {
      const db = Db.open(SQL);
      expect(() => importLegacyJson(db, JSON.stringify({ ...legacy, leaves: [l] }))).toThrow(UserError);
      expect(db.state().employees).toHaveLength(0);
    }
    expect(() => importLegacyJson(Db.open(SQL), JSON.stringify({ ...legacy, employees: [{ ...legacy.employees[0], gender: 'X' }] }))).toThrow('員工資料不完整');
  });
  it('已有資料時拒絕匯入', () => {
    const db = Db.open(SQL);
    db.saveEmployee(empInput);
    expect(() => importLegacyJson(db, JSON.stringify(legacy))).toThrow('只能匯入到空的資料檔');
  });
});
