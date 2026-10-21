// 舊版（v1.2）data/db.json 一次匯入到 sf_erp.sqlite（規格第 16 節）
import { Db, UserError, localStamp } from './db';
import { daysInMonth, deduction, isDateStr, isTimeStr, recordMinutes, toMin, ymd } from '../rules/rules';
import { msg } from '../rules/msg';

interface LegacyDb {
  nextId: number;
  employees: { id: number; name: string; gender: 'M' | 'F'; salary: number; hireDate: string; leaveDate: string | null; email?: string; phone?: string }[];
  leaves: { id: number; empId: number; date: string; type: string; start: string; end: string; reason?: string; hours: number; amount: number }[];
  calendars: Record<string, { govHolidays: string[]; overrides: Record<string, boolean>; uploadedAt: string }>;
}

export interface LegacyImportResult {
  employees: number;
  leaves: number;
  years: number[];
  overrides: number;
}

function parse(text: string): LegacyDb {
  let d: LegacyDb;
  try { d = JSON.parse(text); } catch { throw new UserError(msg('檔案不是有效的 db.json')); }
  if (!d || !Array.isArray(d.employees) || !Array.isArray(d.leaves) || typeof d.calendars !== 'object') {
    throw new UserError(msg('檔案不是 SF ERP 舊版的 db.json'));
  }
  return d;
}

/** 只能匯入到沒有員工與紀錄的資料檔；全部成功才寫入，任何一筆有問題就整批取消 */
export function importLegacyJson(db: Db, text: string): LegacyImportResult {
  const d = parse(text);
  const st = db.state();
  if (st.employees.length || st.leaves.length) throw new UserError(msg('資料檔已有員工或紀錄，只能匯入到空的資料檔'));
  const types = new Map(st.leaveTypes.map((x) => [x.code, x]));
  const salaries = new Map<number, number>();
  const now = localStamp();
  return db.tx(() => {
    for (const e of d.employees) {
      const ok = Number.isInteger(e.id) && typeof e.name === 'string' && e.name.trim() !== '' && (e.gender === 'M' || e.gender === 'F')
        && Number.isInteger(e.salary) && e.salary > 0 && isDateStr(e.hireDate) && (!e.leaveDate || isDateStr(e.leaveDate));
      if (!ok) throw new UserError(msg('員工資料不完整（id {0}）', [String(e.id)]));
      salaries.set(e.id, e.salary);
      db.sql.run(`INSERT INTO employee (id, name, gender, salary, hire_date, annual_base_date, leave_date, email, phone, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [e.id, e.name, e.gender, e.salary, e.hireDate, e.hireDate, e.leaveDate || null, e.email ?? '', e.phone ?? '', now, now]);
    }
    // 每一筆都檢查格式，時數與扣款用目前的規則重新計算，不採用檔案裡的數字
    for (const l of d.leaves) {
      const type = types.get(l.type);
      if (!type) throw new UserError(msg('紀錄 {0} 的假別「{1}」無法辨識', [String(l.id), String(l.type)]));
      const salary = salaries.get(l.empId);
      if (!Number.isInteger(l.id) || salary == null) throw new UserError(msg('紀錄 {0} 找不到對應的員工', [String(l.id)]));
      if (!isDateStr(l.date) || !isTimeStr(l.start) || !isTimeStr(l.end) || toMin(l.start) >= toMin(l.end)) {
        throw new UserError(msg('紀錄 {0} 的日期或時間不正確', [l.id]));
      }
      const minutes = recordMinutes(l.type, l.start, l.end);
      if (minutes <= 0) throw new UserError(msg('紀錄 {0} 的日期或時間不正確', [l.id]));
      const reason = typeof l.reason === 'string' ? l.reason.trim().slice(0, 200) : '';
      db.sql.run(`INSERT INTO leave_record (id, employee_id, date, type_code, start_time, end_time, hours, deduction, salary, reason, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [l.id, l.empId, l.date, l.type, l.start, l.end, minutes / 60, deduction(minutes, salary, type.payRatio), salary, reason, now, now]);
    }
    let overrides = 0;
    const years = Object.keys(d.calendars).map(Number).sort();
    for (const year of years) {
      const cal = d.calendars[year];
      const gov = new Set(cal.govHolidays);
      db.sql.run('INSERT INTO calendar_year (year, source_file, uploaded_at) VALUES (?, ?, ?)', [year, '舊版 db.json', cal.uploadedAt?.slice(0, 19).replace('T', ' ') ?? now]);
      for (let m = 1; m <= 12; m++) {
        for (let day = 1; day <= daysInMonth(year, m); day++) {
          const date = ymd(year, m, day);
          const ov = date in cal.overrides ? +cal.overrides[date] : null;
          if (ov != null) overrides++;
          db.sql.run('INSERT INTO calendar_day (date, year, gov_holiday, override) VALUES (?, ?, ?, ?)', [date, year, gov.has(date) ? 1 : 0, ov]);
        }
      }
    }
    const after = db.state();
    if (after.employees.length !== d.employees.length || after.leaves.length !== d.leaves.length) {
      throw new UserError(msg('匯入後筆數不符，已取消匯入'));
    }
    return { employees: d.employees.length, leaves: d.leaves.length, years, overrides };
  });
}
