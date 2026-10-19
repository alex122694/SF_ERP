import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { Db, UserError, calendarsOf } from '../src/data/db';
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
    db.setDay('2026-10-09', false);
    const r = db.importCalendar(2026, ['2026-10-09'], 'again.xlsx');
    expect(r.keptOverrides).toBe(1);
    expect(calendarsOf(db.state().days).isHoliday('2026-10-09')).toBe(false);
    db.resetDay('2026-10-09');
    expect(calendarsOf(db.state().days).isHoliday('2026-10-09')).toBe(true);
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
  it('有紀錄的日子不能改為放假日；刪除員工一併刪除紀錄', async () => {
    const { db, id } = await seeded();
    db.saveLeave({ employeeId: id, date: '2026-10-19', type: 'annual', start: '09:30', end: '18:30', reason: '' });
    expect(() => db.setDay('2026-10-19', true)).toThrow('這天已有 1 筆紀錄');
    expect(db.deleteEmployee(id)).toBe(1);
    expect(db.state().leaves).toHaveLength(0);
  });
  it('特休換錢後不能再登記該期特休', async () => {
    const { db, id } = await seeded();
    const s = db.settle(id, '2026-03-01', 'cash', '2027-02-10');
    expect(s).toMatchObject({ action: 'cash', remainingHours: 120, amount: 18000 });
    expect(() => db.saveLeave({ employeeId: id, date: '2026-10-19', type: 'annual', start: '09:30', end: '12:00', reason: '' })).toThrow('已結清');
    expect(() => db.settle(id, '2026-03-01', 'cash', '2027-02-10')).toThrow(UserError);
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
      throw new UserError('boom');
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
    expect(st.days.get('2026-10-24')).toEqual({ gov: false, override: false });
  });
  it('已有資料時拒絕匯入', () => {
    const db = Db.open(SQL);
    db.saveEmployee(empInput);
    expect(() => importLegacyJson(db, JSON.stringify(legacy))).toThrow('只能匯入到空的資料檔');
  });
});
