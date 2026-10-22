// SQLite 資料存取（sql.js）：讀出整份狀態給畫面，所有寫入都先經過規則檢查
import type { Database, SqlJsStatic, SqlValue } from 'sql.js';
import { MIGRATIONS } from './schema';
import { UserError, msg } from '../rules/msg';
import {
  buildSettlement, checkEmployee, checkLeave, settlementsDue, ymd, daysInMonth,
  type Calendars, type Department, type Employee, type EmployeeInput, type LeaveInput, type LeaveRecord, type LeaveType,
  type Settlement, type SettlementAction,
} from '../rules/rules';

export { UserError };

export interface CalendarYear {
  year: number;
  sourceFile: string;
  uploadedAt: string;
  overrides: number;
}

export interface DayInfo {
  gov: boolean;
  override: boolean | null;
  /** 手動修改的原因；沒有手動修改時為 null */
  reason: string | null;
}

export interface State {
  employees: Employee[];
  departments: Department[];
  leaves: LeaveRecord[];
  leaveTypes: LeaveType[];
  settlements: Settlement[];
  calendarYears: CalendarYear[];
  days: Map<string, DayInfo>;
  settings: Record<string, string>;
}

export function calendarsOf(days: Map<string, DayInfo>): Calendars {
  return {
    isHoliday(date) {
      const d = days.get(date);
      if (!d) return undefined;
      return d.override ?? d.gov;
    },
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function localStamp(d = new Date()): string {
  return `${localDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

type Row = Record<string, SqlValue>;

/** 可為 NULL 的文字欄位 */
const textOrNull = (v: SqlValue) => (v == null ? null : String(v));

export class Db {
  private constructor(readonly sql: Database) {
    sql.run('PRAGMA foreign_keys = ON');
    const version = Number(this.rows('PRAGMA user_version')[0].user_version);
    for (let v = version; v < MIGRATIONS.length; v++) {
      sql.exec('BEGIN');
      try {
        sql.exec(MIGRATIONS[v]);
        sql.exec(`PRAGMA user_version = ${v + 1}`);
        sql.exec('COMMIT');
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    }
  }

  /** bytes 為既有的 sf_erp.sqlite 內容；不給則建立空白資料庫 */
  static open(SQL: SqlJsStatic, bytes?: Uint8Array): Db {
    let sql: Database;
    try {
      sql = new SQL.Database(bytes);
      if (bytes) sql.exec('SELECT count(*) FROM sqlite_master');
    } catch {
      throw new UserError(msg('資料檔損毀或不是 SF ERP 的資料檔'));
    }
    return new Db(sql);
  }

  export(): Uint8Array {
    return this.sql.export();
  }

  /** 還原前給使用者確認用的摘要：員工數、紀錄數、紀錄的日期範圍 */
  summary(): { employees: number; leaves: number; from: string | null; to: string | null } {
    const r = this.rows('SELECT (SELECT count(*) FROM employee) AS e, count(*) AS n, min(date) AS a, max(date) AS b FROM leave_record')[0];
    return { employees: Number(this.rows('SELECT count(*) AS n FROM employee')[0].n), leaves: Number(r.n), from: textOrNull(r.a), to: textOrNull(r.b) };
  }

  private rows(q: string, params: SqlValue[] = []): Row[] {
    const st = this.sql.prepare(q);
    try {
      st.bind(params);
      const out: Row[] = [];
      while (st.step()) out.push(st.getAsObject());
      return out;
    } finally {
      st.free();
    }
  }

  private run(q: string, params: SqlValue[] = []) {
    this.sql.run(q, params);
  }

  private lastId(): number {
    return Number(this.rows('SELECT last_insert_rowid() AS id')[0].id);
  }

  private depth = 0;

  /** 多個寫入包成一個交易，出錯時全部還原；巢狀呼叫時併入外層交易 */
  tx<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    this.depth++;
    try {
      return this.txOuter(fn);
    } finally {
      this.depth--;
    }
  }

  private txOuter<T>(fn: () => T): T {
    this.sql.exec('BEGIN');
    try {
      const r = fn();
      this.sql.exec('COMMIT');
      return r;
    } catch (e) {
      this.sql.exec('ROLLBACK');
      throw e;
    }
  }

  // ---------- 讀取 ----------

  state(): State {
    const employees = this.rows('SELECT * FROM employee ORDER BY hire_date, id').map((r): Employee => ({
      id: Number(r.id), name: String(r.name), gender: r.gender as Employee['gender'], salary: Number(r.salary),
      hireDate: String(r.hire_date), annualBaseDate: String(r.annual_base_date), leaveDate: textOrNull(r.leave_date),
      email: String(r.email), phone: String(r.phone), departmentId: r.department_id == null ? null : Number(r.department_id),
    }));
    const departments = this.rows('SELECT id, name FROM department ORDER BY id').map((r): Department => ({ id: Number(r.id), name: String(r.name) }));
    const leaves = this.rows('SELECT * FROM leave_record ORDER BY date, start_time, id').map((r): LeaveRecord => ({
      id: Number(r.id), employeeId: Number(r.employee_id), date: String(r.date), type: String(r.type_code),
      start: String(r.start_time), end: String(r.end_time), hours: Number(r.hours), deduction: Number(r.deduction),
      salary: Number(r.salary), reason: String(r.reason),
    }));
    const leaveTypes = this.rows('SELECT * FROM leave_type ORDER BY sort_order').map((r): LeaveType => ({
      code: String(r.code), name: String(r.name), payRatio: Number(r.pay_ratio), unitMinutes: Number(r.unit_minutes),
      segmentOnly: !!r.segment_only, femaleOnly: !!r.female_only, maxMinutes: r.max_minutes == null ? null : Number(r.max_minutes),
      confirmTwice: !!r.confirm_twice, color: String(r.color), sortOrder: Number(r.sort_order),
    }));
    const settlements = this.rows('SELECT * FROM annual_settlement ORDER BY period_start, id').map((r): Settlement => ({
      id: Number(r.id), employeeId: Number(r.employee_id), periodStart: String(r.period_start), periodEnd: String(r.period_end),
      remainingHours: Number(r.remaining_hours), action: r.action as SettlementAction, amount: Number(r.amount),
      deferredHours: Number(r.deferred_hours), deferredUntil: textOrNull(r.deferred_until), decidedAt: String(r.decided_at),
    }));
    const calendarYears = this.rows(`SELECT y.*, (SELECT count(*) FROM calendar_day d WHERE d.year = y.year AND d.override IS NOT NULL) AS overrides
      FROM calendar_year y ORDER BY year DESC`).map((r): CalendarYear => ({
      year: Number(r.year), sourceFile: String(r.source_file), uploadedAt: String(r.uploaded_at), overrides: Number(r.overrides),
    }));
    const days = new Map<string, DayInfo>();
    for (const r of this.rows('SELECT date, gov_holiday, override, override_reason FROM calendar_day')) {
      days.set(String(r.date), { gov: !!r.gov_holiday, override: r.override == null ? null : !!r.override, reason: textOrNull(r.override_reason) });
    }
    const settings: Record<string, string> = {};
    for (const r of this.rows('SELECT key, value FROM app_setting')) settings[String(r.key)] = String(r.value);
    return { employees, departments, leaves, leaveTypes, settlements, calendarYears, days, settings };
  }

  // ---------- 員工 ----------

  saveEmployee(input: EmployeeInput, id?: number): number {
    const st = this.state();
    if (id != null && !st.employees.some((e) => e.id === id)) throw new UserError(msg('找不到員工'));
    const r = checkEmployee(input, st.leaves, id);
    if (!r.ok) throw new UserError(r.error);
    const e = r.value;
    if (e.departmentId != null && !st.departments.some((d) => d.id === e.departmentId)) throw new UserError(msg('找不到部門'));
    const now = localStamp();
    if (id == null) {
      this.run(`INSERT INTO employee (name, gender, salary, hire_date, annual_base_date, leave_date, email, phone, department_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [e.name, e.gender, e.salary, e.hireDate, e.annualBaseDate, e.leaveDate, e.email, e.phone, e.departmentId, now, now]);
      return this.lastId();
    }
    this.run(`UPDATE employee SET name = ?, gender = ?, salary = ?, hire_date = ?, annual_base_date = ?, leave_date = ?, email = ?, phone = ?, department_id = ?, updated_at = ?
      WHERE id = ?`, [e.name, e.gender, e.salary, e.hireDate, e.annualBaseDate, e.leaveDate, e.email, e.phone, e.departmentId, now, id]);
    return id;
  }

  // ---------- 部門 ----------

  saveDepartment(name: string, id?: number): number {
    const n = String(name ?? '').trim();
    if (!n) throw new UserError(msg('請填寫部門名稱'));
    if (n.length > 30) throw new UserError(msg('部門名稱最多 30 字'));
    const st = this.state();
    if (id != null && !st.departments.some((d) => d.id === id)) throw new UserError(msg('找不到部門'));
    if (st.departments.some((d) => d.name === n && d.id !== id)) throw new UserError(msg('已經有「{0}」這個部門', [n]));
    if (id == null) {
      this.run('INSERT INTO department (name) VALUES (?)', [n]);
      return this.lastId();
    }
    this.run('UPDATE department SET name = ? WHERE id = ?', [n, id]);
    return id;
  }

  /** 還有員工使用的部門不能刪除（先把員工改到別的部門或清空） */
  deleteDepartment(id: number) {
    const n = Number(this.rows('SELECT count(*) AS n FROM employee WHERE department_id = ?', [id])[0].n);
    if (n) throw new UserError(msg('還有 {0} 位員工在這個部門，不能刪除；請先調整他們的部門', [n]));
    this.run('DELETE FROM department WHERE id = ?', [id]);
  }

  /** 只能刪除沒有任何紀錄的員工（例如建錯的資料）；有出缺勤或特休處理紀錄的員工以離職日處理，保留歷史與金額 */
  deleteEmployee(id: number) {
    const n = Number(this.rows(`SELECT (SELECT count(*) FROM leave_record WHERE employee_id = ?)
      + (SELECT count(*) FROM annual_settlement WHERE employee_id = ?) AS n`, [id, id])[0].n);
    if (n) throw new UserError(msg('這位員工已有紀錄，不能刪除；請在「編輯資料」填寫離職日'));
    this.run('DELETE FROM employee WHERE id = ?', [id]);
  }

  // ---------- 出缺勤紀錄 ----------

  saveLeave(input: LeaveInput, id?: number): number {
    const st = this.state();
    const existing = id != null ? st.leaves.find((l) => l.id === id) : undefined;
    if (id != null && !existing) throw new UserError(msg('找不到紀錄'));
    const r = checkLeave(input, { ...st, calendars: calendarsOf(st.days) }, existing);
    if (!r.ok) throw new UserError(r.error);
    const reason = input.reason.trim();
    const now = localStamp();
    if (!existing) {
      this.run(`INSERT INTO leave_record (employee_id, date, type_code, start_time, end_time, hours, deduction, salary, reason, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [input.employeeId, input.date, input.type, input.start, input.end, r.hours, r.deduction, r.salary, reason, now, now]);
      return this.lastId();
    }
    this.run(`UPDATE leave_record SET employee_id = ?, date = ?, type_code = ?, start_time = ?, end_time = ?, hours = ?, deduction = ?, salary = ?, reason = ?, updated_at = ?
      WHERE id = ?`, [input.employeeId, input.date, input.type, input.start, input.end, r.hours, r.deduction, r.salary, reason, now, existing.id]);
    return existing.id;
  }

  /** 一次登記多天：全部通過才存檔，任何一天不行就整批退回並指出是哪一天 */
  saveLeaves(inputs: LeaveInput[]): number[] {
    return this.tx(() => inputs.map((input) => {
      try {
        return this.saveLeave(input);
      } catch (e) {
        throw e instanceof UserError ? new UserError(msg('{0}：{1}', [input.date, e.msg])) : e;
      }
    }));
  }

  deleteLeave(id: number) {
    this.run('DELETE FROM leave_record WHERE id = ?', [id]);
  }

  // ---------- 行事曆 ----------

  /** 匯入一年的政府日曆；手動改過的日子保留 */
  importCalendar(year: number, holidays: string[], sourceFile: string): { holidays: number; keptOverrides: number } {
    const set = new Set(holidays);
    return this.tx(() => {
      this.run(`INSERT INTO calendar_year (year, source_file, uploaded_at) VALUES (?, ?, ?)
        ON CONFLICT(year) DO UPDATE SET source_file = excluded.source_file, uploaded_at = excluded.uploaded_at`, [year, sourceFile, localStamp()]);
      for (let m = 1; m <= 12; m++) {
        for (let d = 1; d <= daysInMonth(year, m); d++) {
          const date = ymd(year, m, d);
          this.run(`INSERT INTO calendar_day (date, year, gov_holiday, override) VALUES (?, ?, ?, NULL)
            ON CONFLICT(date) DO UPDATE SET gov_holiday = excluded.gov_holiday`, [date, year, set.has(date) ? 1 : 0]);
        }
      }
      const kept = Number(this.rows('SELECT count(*) AS n FROM calendar_day WHERE year = ? AND override IS NOT NULL', [year])[0].n);
      return { holidays: set.size, keptOverrides: kept };
    });
  }

  /** 手動改為上班日（false）或放假日（true），必須填原因；與政府日曆相同時視為還原，不用原因 */
  setDay(date: string, holiday: boolean, reason = '') {
    const day = this.state().days.get(date);
    if (!day) throw new UserError(msg('請先匯入 {0} 年行事曆', [date.slice(0, 4)]));
    if (holiday) {
      const n = Number(this.rows('SELECT count(*) AS n FROM leave_record WHERE date = ?', [date])[0].n);
      if (n) throw new UserError(msg('這天已有 {0} 筆紀錄，請先刪除再改為放假日', [n]));
    }
    if (holiday === day.gov) return this.resetDay(date);
    const why = reason.trim();
    if (!why) throw new UserError(msg('請輸入手動修改的原因'));
    this.run('UPDATE calendar_day SET override = ?, override_reason = ? WHERE date = ?', [+holiday, why.slice(0, 100), date]);
  }

  resetDay(date: string) {
    this.run('UPDATE calendar_day SET override = NULL, override_reason = NULL WHERE date = ?', [date]);
  }

  // ---------- 設定 ----------

  setConfirmTwice(code: string, on: boolean) {
    this.run('UPDATE leave_type SET confirm_twice = ? WHERE code = ?', [+on, code]);
  }

  setSetting(key: string, value: string) {
    this.run('INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  }

  // ---------- 特休到期處理 ----------

  settle(employeeId: number, periodStart: string, action: SettlementAction, today: string): Settlement {
    const st = this.state();
    const due = settlementsDue(st.employees, st.leaves, st.settlements, today, 100000)
      .find((d) => d.employee.id === employeeId && d.period.start === periodStart);
    if (!due) throw new UserError(msg('這筆特休已處理或沒有剩餘時數'));
    if (!due.actions.includes(action)) throw new UserError(msg('這筆特休只能換錢'));
    const s = buildSettlement(due, action, localStamp());
    this.run(`INSERT INTO annual_settlement (employee_id, period_start, period_end, remaining_hours, action, amount, deferred_hours, deferred_until, decided_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [s.employeeId, s.periodStart, s.periodEnd, s.remainingHours, s.action, s.amount, s.deferredHours, s.deferredUntil, s.decidedAt]);
    return { ...s, id: this.lastId() };
  }
}
