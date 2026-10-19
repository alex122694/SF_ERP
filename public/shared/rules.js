// 工時、請假、特休規則（前後端共用），對應 docs/規格.md 第 3、5、7 節

export const WORK_PERIODS = [['09:30', '12:00'], ['13:30', '18:30']];
export const HOURS_PER_DAY = 8; // 日數與時數換算基準（實際工時 7.5h）

// unit、limit 為請假制度頁的說明文字
export const LEAVE_TYPES = [
  { code: 'annual', name: '特休', payRatio: 1, unit: '上午／下午／全天', limit: '剩餘額度不足不能登記' },
  { code: 'personal', name: '事假', payRatio: 0, unit: '30 分鐘', limit: '' },
  { code: 'sick', name: '病假', payRatio: 0.5, unit: '30 分鐘', limit: '' },
  { code: 'menstrual', name: '生理假', payRatio: 0.5, unit: '30 分鐘', limit: '限女性', femaleOnly: true },
  { code: 'official', name: '公假', payRatio: 1, unit: '30 分鐘', limit: '' },
  { code: 'late', name: '遲到', payRatio: 0, unit: '1 分鐘', limit: '從 09:30 起算，最多 30 分鐘（到 10:00）；超過以事假登記' },
];
export const leaveType = (code) => LEAVE_TYPES.find((t) => t.code === code);

export const SEGMENTS = [
  { name: '全天', start: '09:30', end: '18:30' },
  { name: '上午', start: '09:30', end: '12:00' },
  { name: '下午', start: '13:30', end: '18:30' },
];
export const isSegment = (start, end) => SEGMENTS.some((s) => s.start === start && s.end === end);

// 遲到：只算早上，從 09:30 起算，訖為到班時間（精確到分鐘），最多 30 分鐘
export const LATE_START = '09:30';
export const LATE_MAX_MIN = 30;
export const isTimeStr = (t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
export const isValidLateEnd = (end) => isTimeStr(end)
  && toMin(end) > toMin(LATE_START) && toMin(end) <= toMin(LATE_START) + LATE_MAX_MIN;
export const lateMinutes = (hours) => Math.round(hours * 60);

export const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const fromMin = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

// 09:30～18:30，每 30 分鐘一格
export const TIME_SLOTS = [];
for (let n = toMin('09:30'); n <= toMin('18:30'); n += 30) TIME_SLOTS.push(fromMin(n));

/** 請假時段與工作時段（扣午休）重疊的時數 */
export function leaveHours(start, end) {
  const s = toMin(start), e = toMin(end);
  let min = 0;
  for (const [ps, pe] of WORK_PERIODS) {
    min += Math.max(0, Math.min(e, toMin(pe)) - Math.max(s, toMin(ps)));
  }
  return min / 60;
}

/** 扣除金額 = 時數 × (薪資 ÷ 30 ÷ 8) × (1 − 給薪比例)，四捨五入到整數元 */
export function deduction(hours, salary, typeCode) {
  const t = leaveType(typeCode);
  return Math.round(hours * (salary / 30 / HOURS_PER_DAY) * (1 - t.payRatio));
}

// ---------- 日期（一律用 'YYYY-MM-DD' 字串，避免時區問題） ----------

export const isDateStr = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
};
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export const weekday = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
export const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

/** 加 n 個月；月底日期超出時取該月最後一天（例：8/31 + 6 個月 = 2/28） */
export function addMonths(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  return ymd(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

/** hire 到 asOf 滿幾個月 */
export function fullMonths(hire, asOf) {
  if (asOf < hire) return 0;
  const [y1, m1] = hire.split('-').map(Number);
  const [y2, m2] = asOf.split('-').map(Number);
  let k = (y2 - y1) * 12 + (m2 - m1);
  while (k > 0 && addMonths(hire, k) > asOf) k--;
  return k;
}

export function seniorityText(hire, asOf) {
  const k = fullMonths(hire, asOf);
  return `${Math.floor(k / 12)} 年 ${k % 12} 個月`;
}

/** 勞基法 §38：滿 n 年（n ≥ 1）後該週年的特休日數 */
export function annualDaysForYears(n) {
  if (n < 1) return 0;
  if (n < 2) return 7;
  if (n < 3) return 10;
  if (n < 5) return 14;
  if (n < 10) return 15;
  return Math.min(30, 15 + (n - 9));
}

/** date 所屬的特休週年期間 { start, end(不含), days }；未滿 6 個月回傳 null */
export function annualPeriod(hire, date) {
  const k = fullMonths(hire, date);
  if (k < 6) return null;
  if (k < 12) return { start: addMonths(hire, 6), end: addMonths(hire, 12), days: 3 };
  const n = Math.floor(k / 12);
  return { start: addMonths(hire, n * 12), end: addMonths(hire, (n + 1) * 12), days: annualDaysForYears(n) };
}

/** 員工在 date 當下的特休狀況；excludeId 用於編輯時排除該筆本身 */
export function annualStatus(emp, leaves, date, excludeId) {
  const period = annualPeriod(emp.hireDate, date);
  if (!period) return { period: null, entitled: 0, used: 0, remaining: 0 };
  const used = leaves
    .filter((l) => l.empId === emp.id && l.type === 'annual' && l.id !== excludeId
      && l.date >= period.start && l.date < period.end)
    .reduce((sum, l) => sum + l.hours, 0);
  const entitled = period.days * HOURS_PER_DAY;
  return { period, entitled, used, remaining: entitled - used };
}

/** 年資與特休的計算基準日：今天；已離職則為離職日 */
export const asOfDate = (emp, today) => (emp.leaveDate && emp.leaveDate < today ? emp.leaveDate : today);

export const isEmployedOn = (emp, date) => emp.hireDate <= date && (!emp.leaveDate || date <= emp.leaveDate);

// ---------- 行事曆 ----------

/** 回傳 true = 放假日；該年度未匯入回傳 undefined */
export function isHoliday(calendars, date) {
  const cal = calendars[date.slice(0, 4)];
  if (!cal) return undefined;
  if (date in cal.overrides) return cal.overrides[date];
  return cal.govHolidays.includes(date);
}
