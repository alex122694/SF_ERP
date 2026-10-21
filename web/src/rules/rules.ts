// 工時、請假、特休、防呆規則（對應 docs/規格.md 第 3、7、8、9、13 節）
// 標準版的 Java 規則要跑同一份 shared/rules-cases.json，兩邊結果必須一致
import { UserError, msg, type Msg } from './msg';

export type Gender = 'M' | 'F';

export interface Employee {
  id: number;
  name: string;
  gender: Gender;
  salary: number;
  hireDate: string;
  annualBaseDate: string; // 特休年資起算日，預設等於到職日
  leaveDate: string | null;
  email: string;
  phone: string;
}

export interface LeaveRecord {
  id: number;
  employeeId: number;
  date: string;
  type: string;
  start: string;
  end: string;
  hours: number;
  deduction: number;
  salary: number; // 登記當時的月本薪；扣款以此計算，之後調薪不影響這筆
  reason: string;
}

export interface LeaveType {
  code: string;
  name: string;
  payRatio: number;
  unitMinutes: number;
  segmentOnly: boolean;
  femaleOnly: boolean;
  maxMinutes: number | null;
  confirmTwice: boolean;
  color: string;
  sortOrder: number;
}

export type SettlementAction = 'cash' | 'defer' | 'zero';

export interface Settlement {
  id: number;
  employeeId: number;
  periodStart: string;
  periodEnd: string; // 週年期間最後一天（含）
  remainingHours: number;
  action: SettlementAction;
  amount: number; // 換錢金額
  deferredHours: number; // 遞延到下一期的時數
  deferredUntil: string | null; // 遞延額度最後一天（含）
  decidedAt: string;
}

// ---------- 工時 ----------

export const WORK_PERIODS: [string, string][] = [['09:30', '12:00'], ['13:30', '18:30']];
export const HOURS_PER_DAY = 8; // 日數與時數換算基準（實際工時 7.5h）
export const DAYS_PER_MONTH = 30;

export const SEGMENTS = [
  { name: '全天', start: '09:30', end: '18:30' },
  { name: '上午', start: '09:30', end: '12:00' },
  { name: '下午', start: '13:30', end: '18:30' },
] as const;
export const isSegment = (start: string, end: string) => SEGMENTS.some((s) => s.start === start && s.end === end);

/** 特休以半天為單位：上午、下午各算半天（4h），全天算 1 天（8h） */
/** 時數換算成天數（1 天 = 8h），顯示到小數 2 位 */
export const toDays = (hours: number) => Math.round((hours / HOURS_PER_DAY) * 100) / 100;
export const HALF_DAY_MINUTES = (HOURS_PER_DAY / 2) * 60;
export const annualMinutes = (start: string, end: string) =>
  (start === SEGMENTS[0].start && end === SEGMENTS[0].end ? 2 : 1) * HALF_DAY_MINUTES;

export const LATE_START = '09:30';
export const LATE_MAX_MIN = 30;

export const isTimeStr = (t: unknown): t is string => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const fromMin = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

/** 09:30～18:30，每 30 分鐘一格 */
export const TIME_SLOTS: string[] = [];
for (let n = toMin('09:30'); n <= toMin('18:30'); n += 30) TIME_SLOTS.push(fromMin(n));

/** 請假時段與工作時段（扣午休）重疊的分鐘數 */
export function leaveMinutes(start: string, end: string): number {
  const s = toMin(start), e = toMin(end);
  let min = 0;
  for (const [ps, pe] of WORK_PERIODS) min += Math.max(0, Math.min(e, toMin(pe)) - Math.max(s, toMin(ps)));
  return min;
}

const pct = (ratio: number) => Math.round(ratio * 100);

/** 扣除金額 = 時數 × (薪資 ÷ 30 ÷ 8) × (1 − 給薪比例)，四捨五入到整數元；以整數分鐘計算避免浮點誤差 */
export function deduction(minutes: number, salary: number, payRatio: number): number {
  return Math.round((minutes * salary * (100 - pct(payRatio))) / (60 * DAYS_PER_MONTH * HOURS_PER_DAY * 100));
}

/** 時數換錢 = 時數 × 時薪，四捨五入到整數元 */
export const cashOut = (hours: number, salary: number) =>
  Math.round((Math.round(hours * 60) * salary) / (60 * DAYS_PER_MONTH * HOURS_PER_DAY));

export const hourlyRate = (salary: number) => salary / DAYS_PER_MONTH / HOURS_PER_DAY;

// ---------- 假別 ----------

export const DEFAULT_LEAVE_TYPES: LeaveType[] = [
  { code: 'annual', name: '特休', payRatio: 1, unitMinutes: 240, segmentOnly: true, femaleOnly: false, maxMinutes: null, confirmTwice: true, color: 'annual', sortOrder: 1 },
  { code: 'personal', name: '事假', payRatio: 0, unitMinutes: 30, segmentOnly: false, femaleOnly: false, maxMinutes: null, confirmTwice: true, color: 'personal', sortOrder: 2 },
  { code: 'sick', name: '病假', payRatio: 0.5, unitMinutes: 30, segmentOnly: false, femaleOnly: false, maxMinutes: null, confirmTwice: false, color: 'sick', sortOrder: 3 },
  { code: 'menstrual', name: '生理假', payRatio: 0.5, unitMinutes: 30, segmentOnly: false, femaleOnly: true, maxMinutes: null, confirmTwice: false, color: 'menstrual', sortOrder: 4 },
  { code: 'official', name: '公假', payRatio: 1, unitMinutes: 30, segmentOnly: false, femaleOnly: false, maxMinutes: null, confirmTwice: false, color: 'official', sortOrder: 5 },
  { code: 'late', name: '遲到', payRatio: 0, unitMinutes: 1, segmentOnly: false, femaleOnly: false, maxMinutes: LATE_MAX_MIN, confirmTwice: false, color: 'late', sortOrder: 6 },
];

export const LEAVE_TYPE_NOTES: Record<string, string> = {
  annual: '以半天為單位：上午、下午各算半天（4 h），全天算 1 天（8 h）；剩餘額度不足不能登記',
  personal: '沒有請假的缺勤，以事假登記',
  menstrual: '限女性',
  late: '09:30 起算，最多 30 分鐘；超過以事假登記',
};

export function unitText(t: LeaveType): Msg {
  if (t.code === 'annual') return msg('半天（上午／下午）');
  if (t.segmentOnly) return msg('上午／下午／全天');
  return msg('{0} 分鐘', [t.unitMinutes]);
}

export function payText(ratio: number): Msg {
  if (ratio === 1) return msg('全薪');
  if (ratio === 0) return msg('不支薪');
  return msg('{0}% 給薪', [pct(ratio)]);
}

// ---------- 日期（一律用 'YYYY-MM-DD' 字串，避免時區問題） ----------

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export const isDateStr = (s: unknown): s is string => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
};
export const weekday = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
/** 「還沒選」的提示（畫面用來和真正的錯誤區分） */
export const LEAVE_HINT = { emp: msg('請選擇員工'), type: msg('請選擇假別') };

export function addDays(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** 加 n 個月；月底日期超出時取該月最後一天（例：8/31 + 6 個月 = 2/28） */
export function addMonths(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  return ymd(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

/** from 到 asOf 滿幾個月 */
export function fullMonths(from: string, asOf: string): number {
  if (asOf < from) return 0;
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = asOf.split('-').map(Number);
  let k = (y2 - y1) * 12 + (m2 - m1);
  while (k > 0 && addMonths(from, k) > asOf) k--;
  return k;
}

export function seniorityText(from: string, asOf: string): Msg {
  const k = fullMonths(from, asOf);
  return msg('{0} 年 {1} 個月', [Math.floor(k / 12), k % 12]);
}

export const isEmployedOn = (emp: Pick<Employee, 'hireDate' | 'leaveDate'>, date: string) =>
  emp.hireDate <= date && (!emp.leaveDate || date <= emp.leaveDate);

/** 年資與特休的計算基準日：今天；已離職則為離職日 */
export const asOfDate = (emp: Pick<Employee, 'leaveDate'>, today: string) =>
  (emp.leaveDate && emp.leaveDate < today ? emp.leaveDate : today);

// ---------- 特休（勞基法 §38 週年制） ----------

/** 滿 n 年（n ≥ 1）後該週年的特休日數 */
export function annualDaysForYears(n: number): number {
  if (n < 1) return 0;
  if (n < 2) return 7;
  if (n < 3) return 10;
  if (n < 5) return 14;
  if (n < 10) return 15;
  return Math.min(30, 15 + (n - 9));
}

export interface AnnualPeriod {
  start: string;
  end: string; // 不含
  last: string; // 最後一天（含）
  days: number;
}

/** date 所屬的特休週年期間；未滿 6 個月回傳 null */
export function annualPeriod(base: string, date: string): AnnualPeriod | null {
  const k = fullMonths(base, date);
  if (k < 6) return null;
  let start: string, end: string, days: number;
  if (k < 12) { start = addMonths(base, 6); end = addMonths(base, 12); days = 3; } else {
    const n = Math.floor(k / 12);
    start = addMonths(base, n * 12); end = addMonths(base, (n + 1) * 12); days = annualDaysForYears(n);
  }
  return { start, end, last: addDays(end, -1), days };
}

export interface AnnualStatus {
  period: AnnualPeriod | null;
  entitled: number; // 本期額度時數
  deferred: number; // 上期遞延過來的時數
  used: number;
  deferredUsed: number;
  currentUsed: number;
  deferredRemaining: number;
  currentRemaining: number;
  remaining: number;
}

/**
 * 員工在 date 所屬週年期間的特休狀況；excludeId 用於編輯時排除該筆本身
 * 請特休時先扣上期遞延過來的額度，用完再扣本期額度（遞延額度與本期同時到期）
 */
export function annualStatus(
  emp: Employee, leaves: LeaveRecord[], settlements: Settlement[], date: string, excludeId?: number,
): AnnualStatus {
  const period = annualPeriod(emp.annualBaseDate, date);
  if (!period) {
    return { period: null, entitled: 0, deferred: 0, used: 0, deferredUsed: 0, currentUsed: 0, deferredRemaining: 0, currentRemaining: 0, remaining: 0 };
  }
  const prevLast = addDays(period.start, -1);
  const deferred = settlements
    .filter((s) => s.employeeId === emp.id && s.action === 'defer' && s.periodEnd === prevLast)
    .reduce((sum, s) => sum + s.deferredHours, 0);
  const used = leaves
    .filter((l) => l.employeeId === emp.id && l.type === 'annual' && l.id !== excludeId && l.date >= period.start && l.date < period.end)
    .reduce((sum, l) => sum + l.hours, 0);
  const entitled = period.days * HOURS_PER_DAY;
  const deferredUsed = Math.min(used, deferred);
  const currentUsed = used - deferredUsed;
  return {
    period, entitled, deferred, used, deferredUsed, currentUsed,
    deferredRemaining: deferred - deferredUsed,
    currentRemaining: entitled - currentUsed,
    remaining: deferred + entitled - used,
  };
}

// ---------- 防呆 ----------

export interface Calendars {
  /** 該年度已匯入時回傳 true（放假）／false（上班）；未匯入回傳 undefined */
  isHoliday(date: string): boolean | undefined;
}

/** 一筆紀錄算出的分鐘數：遲到從 09:30 起算、特休以半天為單位、其他依上班時段重疊；起訖須為 HH:MM */
export function recordMinutes(type: string, start: string, end: string): number {
  if (type === 'late') return Math.max(0, toMin(end) - toMin(LATE_START));
  if (type === 'annual' && isSegment(start, end)) return annualMinutes(start, end);
  return leaveMinutes(start, end);
}

export interface LeaveInput {
  employeeId: number | null;
  date: string;
  type: string;
  start: string;
  end: string;
  reason: string;
}

export interface LeaveContext {
  employees: Employee[];
  leaves: LeaveRecord[];
  settlements: Settlement[];
  leaveTypes: LeaveType[];
  calendars: Calendars;
}

export type LeaveCheck =
  | { ok: true; minutes: number; hours: number; deduction: number; salary: number; annual: AnnualStatus | null }
  | { ok: false; error: Msg; minutes: number; hours: number; deduction: number; salary: number; annual: AnnualStatus | null };

/**
 * 存檔前檢查；同一函式也給畫面即時試算用。existing 為編輯中的那一筆（原本的 id、日期、員工與當時薪資）。
 * 編輯時沿用該筆登記當時的薪資計算扣款；改成別的員工才用該員工目前的薪資。
 */
export function checkLeave(
  input: LeaveInput, ctx: LeaveContext, existing?: { id: number; date: string; employeeId?: number; salary?: number },
): LeaveCheck {
  const existingId = existing?.id;
  const emp = ctx.employees.find((e) => e.id === input.employeeId);
  const t = ctx.leaveTypes.find((x) => x.code === input.type);
  const timesOk = isTimeStr(input.start) && isTimeStr(input.end);
  const minutes = !timesOk || !t ? 0 : recordMinutes(t.code, input.start, input.end);
  const hours = minutes / 60;
  const salary = !emp ? 0 : existing?.salary && existing.employeeId === emp.id ? existing.salary : emp.salary;
  const ded = emp && t ? deduction(minutes, salary, t.payRatio) : 0;
  const annual = emp && t?.code === 'annual' && isDateStr(input.date) ? annualStatus(emp, ctx.leaves, ctx.settlements, input.date, existingId) : null;
  const fail = (error: Msg): LeaveCheck => ({ ok: false, error, minutes, hours, deduction: ded, salary, annual });

  if (!isDateStr(input.date)) return fail(msg('日期不正確'));
  const holiday = ctx.calendars.isHoliday(input.date);
  if (holiday === undefined) return fail(msg('請先匯入 {0} 年行事曆', [input.date.slice(0, 4)]));
  if (holiday && existing?.date !== input.date) return fail(msg('這天是放假日，不能登記。要改成上班日請到出缺勤月曆。'));
  if (!emp) return fail(LEAVE_HINT.emp);
  if (!isEmployedOn(emp, input.date)) return fail(msg('{0} 在 {1} 不在職', [emp.name, input.date]));
  if (!t) return fail(LEAVE_HINT.type);
  if (t.femaleOnly && emp.gender !== 'F') return fail(msg('{0}只有女性可以選', [msg(t.name)]));
  if (!timesOk) return fail(msg('請選擇起訖時間'));
  if (t.code === 'late') {
    if (input.start !== LATE_START) return fail(msg('遲到從 {0} 起算', [LATE_START]));
    if (minutes < 1 || minutes > LATE_MAX_MIN) return fail(msg('遲到只能 1～30 分鐘；超過 30 分鐘請改用事假登記。'));
  } else {
    if (!TIME_SLOTS.includes(input.start) || !TIME_SLOTS.includes(input.end)) return fail(msg('起訖時間須對齊 30 分鐘'));
    if (toMin(input.start) >= toMin(input.end)) return fail(msg('訖時間須晚於起時間'));
    if (t.segmentOnly && !isSegment(input.start, input.end)) return fail(msg('{0}只能選全天、上午或下午', [msg(t.name)]));
  }
  if (minutes <= 0) return fail(msg('時數為 0，請調整起訖時間。'));

  const clash = ctx.leaves.find((o) => o.employeeId === emp.id && o.date === input.date && o.id !== existingId
    && toMin(input.start) < toMin(o.end) && toMin(o.start) < toMin(input.end));
  if (clash) {
    const ct = ctx.leaveTypes.find((x) => x.code === clash.type);
    return fail(msg('{0} 當天 {1}～{2} 已有{3}，時段重疊', [emp.name, clash.start, clash.end, ct ? msg(ct.name) : msg('紀錄')]));
  }
  if (annual) {
    if (!annual.period) return fail(msg('{0} 在 {1} 年資未滿 6 個月，沒有特休', [emp.name, input.date]));
    const p = annual.period;
    if (ctx.settlements.some((s) => s.employeeId === emp.id && s.periodStart === p.start)) {
      return fail(msg('{0} {1}～{2} 的特休已結清，不能再登記', [emp.name, p.start, p.last]));
    }
    if (hours > annual.remaining) return fail(msg('特休剩餘 {0} 天，不夠扣 {1} 天。', [toDays(annual.remaining), toDays(hours)]));
  }
  return { ok: true, minutes, hours, deduction: ded, salary, annual };
}

export interface EmployeeInput {
  name: string;
  gender: string;
  salary: number | string;
  hireDate: string;
  annualBaseDate: string;
  leaveDate: string;
  email: string;
  phone: string;
}

/** 回傳整理過的員工資料，或錯誤訊息 */
export function checkEmployee(
  input: EmployeeInput, leaves: LeaveRecord[], existingId?: number,
): { ok: true; value: Omit<Employee, 'id'> } | { ok: false; error: Msg } {
  const e = {
    name: String(input.name ?? '').trim(),
    gender: input.gender as Gender,
    salary: Number(input.salary),
    hireDate: input.hireDate,
    annualBaseDate: input.annualBaseDate || input.hireDate,
    leaveDate: input.leaveDate || null,
    email: String(input.email ?? '').trim(),
    phone: String(input.phone ?? '').trim(),
  };
  const bad = (error: Msg) => ({ ok: false as const, error });
  if (!e.name) return bad(msg('請填寫姓名'));
  if (e.gender !== 'M' && e.gender !== 'F') return bad(msg('請選擇性別'));
  if (!Number.isInteger(e.salary) || e.salary <= 0) return bad(msg('薪資須為正整數'));
  if (!isDateStr(e.hireDate)) return bad(msg('請填寫正確的到職日'));
  if (!isDateStr(e.annualBaseDate)) return bad(msg('特休年資起算日格式不正確'));
  if (e.leaveDate && !isDateStr(e.leaveDate)) return bad(msg('離職日格式不正確'));
  if (e.leaveDate && e.leaveDate <= e.hireDate) return bad(msg('離職日須晚於到職日'));
  if (e.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email)) return bad(msg('信箱格式不正確'));
  if (existingId != null) {
    const mine = leaves.filter((l) => l.employeeId === existingId);
    const outside = mine.filter((l) => !isEmployedOn(e, l.date)).sort((a, b) => a.date.localeCompare(b.date));
    if (outside.length) return bad(msg('有 {0} 筆紀錄不在到職～離職期間內（最早 {1}），請先調整紀錄', [outside.length, outside[0].date]));
    if (e.gender === 'M' && mine.some((l) => l.type === 'menstrual')) return bad(msg('此員工已有生理假紀錄，不能改為男性'));
  }
  return { ok: true, value: e };
}

// ---------- 特休到期提醒與處理（第 5、13 節） ----------

export interface SettlementDue {
  employee: Employee;
  period: AnnualPeriod;
  status: AnnualStatus;
  reason: 'expiring' | 'expired' | 'resigned';
  daysLeft: number; // 距離最後一天的天數；已到期為負數
  /** 可選的處理方式；遞延額度與離職只能換錢 */
  actions: SettlementAction[];
  cashAll: number; // 全部換錢的金額
}

/**
 * 需要人資處理的特休：本期到期前 remindDays 天內、上期已到期未處理、離職未結清。
 * 剩餘為 0 的不列出；最後一天早於 trackFrom 的期間視為已在系統外處理。
 */
export function settlementsDue(
  employees: Employee[], leaves: LeaveRecord[], settlements: Settlement[], today: string, remindDays: number, trackFrom = '',
): SettlementDue[] {
  const out: SettlementDue[] = [];
  const settled = (empId: number, p: AnnualPeriod) => settlements.some((s) => s.employeeId === empId && s.periodStart === p.start);
  for (const emp of employees) {
    const resigned = !!emp.leaveDate && emp.leaveDate < today;
    const asOf = asOfDate(emp, today);
    const cur = annualPeriod(emp.annualBaseDate, asOf);
    const candidates: { p: AnnualPeriod; reason: SettlementDue['reason'] }[] = [];
    if (cur) {
      if (resigned) candidates.push({ p: cur, reason: 'resigned' });
      else if (daysBetween(today, cur.last) <= remindDays) candidates.push({ p: cur, reason: 'expiring' });
      const prev = annualPeriod(emp.annualBaseDate, addDays(cur.start, -1));
      if (prev) candidates.push({ p: prev, reason: 'expired' });
    }
    for (const { p, reason } of candidates) {
      if (p.last < trackFrom || settled(emp.id, p)) continue;
      const status = annualStatus(emp, leaves, settlements, p.start);
      if (status.remaining <= 0) continue;
      const cashOnly = resigned || status.currentRemaining <= 0;
      out.push({
        employee: emp, period: p, status, reason,
        daysLeft: daysBetween(today, p.last),
        actions: cashOnly ? ['cash'] : ['cash', 'defer', 'zero'],
        cashAll: cashOut(status.remaining, emp.salary),
      });
    }
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

/** 依處理方式算出要存的紀錄：遞延額度一律換錢，只有本期剩餘可以遞延或歸零 */
export function buildSettlement(due: SettlementDue, action: SettlementAction, decidedAt: string): Omit<Settlement, 'id'> {
  if (!due.actions.includes(action)) throw new UserError(msg('這筆特休只能換錢'));
  const { status, employee, period } = due;
  const cashHours = action === 'cash' ? status.remaining : status.deferredRemaining;
  const deferredHours = action === 'defer' ? status.currentRemaining : 0;
  const next = annualPeriod(employee.annualBaseDate, period.end);
  return {
    employeeId: employee.id,
    periodStart: period.start,
    periodEnd: period.last,
    remainingHours: status.remaining,
    action,
    amount: cashOut(cashHours, employee.salary),
    deferredHours,
    deferredUntil: action === 'defer' ? (next?.last ?? addDays(addMonths(period.end, 12), -1)) : null,
    decidedAt,
  };
}
