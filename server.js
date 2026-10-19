// SF ERP：本機 HTTP 伺服器 + JSON 檔案資料庫（規格見 docs/規格.md）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseGovCalendar } from './lib/calendar-xlsx.js';
import {
  LEAVE_TYPES, leaveType, TIME_SLOTS, isSegment, toMin, leaveHours, deduction,
  isDateStr, annualStatus, isEmployedOn, isHoliday, LATE_START, LATE_MAX_MIN, isValidLateEnd,
} from './public/shared/rules.js';

const PORT = 3000;
const HOST = '127.0.0.1';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
// 可用 --data=<資料夾> 另指定資料位置（開發測試用，避免動到正式資料）
const dataArg = process.argv.find((a) => a.startsWith('--data='));
const DATA_DIR = dataArg ? path.resolve(ROOT, dataArg.slice(7)) : path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backup');
const BACKUP_KEEP = 30;

// ---------- 資料庫 ----------

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadDb() {
  if (!fs.existsSync(DB_FILE)) return { nextId: 1, employees: [], leaves: [], calendars: {} };
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

const db = loadDb();

/** 每天第一次存檔前，先把現有的 db.json 備份起來；寫檔用暫存檔再改名，避免寫到一半損毀 */
function saveDb() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backup = path.join(BACKUP_DIR, `db-${localDate().replaceAll('-', '')}.json`);
  if (fs.existsSync(DB_FILE) && !fs.existsSync(backup)) {
    fs.copyFileSync(DB_FILE, backup);
    const old = fs.readdirSync(BACKUP_DIR).filter((f) => /^db-\d{8}\.json$/.test(f)).sort().slice(0, -BACKUP_KEEP);
    for (const f of old) fs.unlinkSync(path.join(BACKUP_DIR, f));
  }
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

const newId = () => db.nextId++;

class BadRequest extends Error {}
const bad = (msg) => { throw new BadRequest(msg); };

// ---------- 員工 ----------

function cleanEmployee(body, existingId) {
  const e = {
    name: String(body.name ?? '').trim(),
    gender: body.gender,
    salary: Number(body.salary),
    hireDate: body.hireDate,
    leaveDate: body.leaveDate || null,
    email: String(body.email ?? '').trim(),
    phone: String(body.phone ?? '').trim(),
  };
  if (!e.name) bad('請填寫姓名');
  if (e.gender !== 'M' && e.gender !== 'F') bad('請選擇性別');
  if (!Number.isInteger(e.salary) || e.salary <= 0) bad('薪資須為正整數');
  if (!isDateStr(e.hireDate)) bad('請填寫正確的到職日');
  if (e.leaveDate && !isDateStr(e.leaveDate)) bad('離職日格式不正確');
  if (e.leaveDate && e.leaveDate <= e.hireDate) bad('離職日須晚於到職日');
  if (e.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email)) bad('信箱格式不正確');

  if (existingId != null) {
    const mine = db.leaves.filter((l) => l.empId === existingId);
    const outside = mine.filter((l) => !isEmployedOn(e, l.date));
    if (outside.length) bad(`有 ${outside.length} 筆請假紀錄不在到職～離職期間內（最早 ${outside[0].date}），請先調整紀錄`);
    if (e.gender === 'M' && mine.some((l) => l.type === 'menstrual')) bad('此員工已有生理假紀錄，不能改為男性');
  }
  return e;
}

// ---------- 請假 ----------

function cleanLeave(body, existing) {
  const date = existing ? existing.date : body.date;
  const l = {
    empId: Number(body.empId),
    date,
    type: body.type,
    start: body.start,
    end: body.end,
    reason: String(body.reason ?? '').trim(),
  };
  const emp = db.employees.find((e) => e.id === l.empId);
  if (!emp) bad('請選擇員工');
  if (!isDateStr(date)) bad('日期不正確');
  const holiday = isHoliday(db.calendars, date);
  if (holiday === undefined) bad(`請先上傳 ${date.slice(0, 4)} 年行事曆`);
  if (holiday && !existing) bad(`${date} 是放假日，不能登記`);
  if (!isEmployedOn(emp, date)) bad(`${emp.name} 在 ${date} 不在職`);
  const t = leaveType(l.type);
  if (!t) bad('請選擇假別');
  if (t.femaleOnly && emp.gender !== 'F') bad(`${t.name}只有女性可以選`);
  if (l.type === 'late') {
    if (l.start !== LATE_START) bad(`遲到只算早上，起必須是 ${LATE_START}`);
    if (!isValidLateEnd(l.end)) bad(`遲到最多 ${LATE_MAX_MIN} 分鐘，到班時間須在 09:31～10:00；超過請登記事假`);
  } else {
    if (!TIME_SLOTS.includes(l.start) || !TIME_SLOTS.includes(l.end)) bad('請選擇起訖時間');
    if (toMin(l.start) >= toMin(l.end)) bad('訖時間須晚於起時間');
  }
  if (l.type === 'annual' && !isSegment(l.start, l.end)) bad('特休只能選全天、上午或下午');

  l.hours = leaveHours(l.start, l.end);
  if (l.hours <= 0) bad('請假時數為 0，請調整起訖時間');

  const clash = db.leaves.find((o) => o.empId === l.empId && o.date === date && o.id !== existing?.id
    && toMin(l.start) < toMin(o.end) && toMin(o.start) < toMin(l.end));
  if (clash) bad(`${emp.name} 當天 ${clash.start}～${clash.end} 已有${leaveType(clash.type).name}，時段重疊`);

  if (l.type === 'annual') {
    const st = annualStatus(emp, db.leaves, date, existing?.id);
    if (!st.period) bad(`${emp.name} 在 ${date} 年資未滿 6 個月，沒有特休`);
    if (l.hours > st.remaining) bad(`${emp.name} 特休剩餘 ${st.remaining}h，不足 ${l.hours}h`);
  }

  l.amount = deduction(l.hours, emp.salary, l.type);
  return l;
}

// ---------- 路由 ----------

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

route('GET', /^\/api\/state$/, () => ({
  today: localDate(), leaveTypes: LEAVE_TYPES,
  employees: db.employees, leaves: db.leaves, calendars: db.calendars,
}));

route('POST', /^\/api\/employees$/, ({ body }) => {
  const data = cleanEmployee(body);
  const emp = { id: newId(), ...data };
  db.employees.push(emp);
  saveDb();
  return emp;
});

route('PUT', /^\/api\/employees\/(\d+)$/, ({ body, params }) => {
  const emp = db.employees.find((e) => e.id === Number(params[0])) ?? bad('找不到員工');
  Object.assign(emp, cleanEmployee(body, emp.id));
  // 薪資變動不回溯：已登記的扣除金額維持登記當時的計算結果
  saveDb();
  return emp;
});

route('DELETE', /^\/api\/employees\/(\d+)$/, ({ params }) => {
  const id = Number(params[0]);
  if (!db.employees.some((e) => e.id === id)) bad('找不到員工');
  const before = db.leaves.length;
  db.employees = db.employees.filter((e) => e.id !== id);
  db.leaves = db.leaves.filter((l) => l.empId !== id);
  saveDb();
  return { deletedLeaves: before - db.leaves.length };
});

route('POST', /^\/api\/leaves$/, ({ body }) => {
  const data = cleanLeave(body);
  const leave = { id: newId(), ...data };
  db.leaves.push(leave);
  saveDb();
  return leave;
});

route('PUT', /^\/api\/leaves\/(\d+)$/, ({ body, params }) => {
  const leave = db.leaves.find((l) => l.id === Number(params[0])) ?? bad('找不到紀錄');
  Object.assign(leave, cleanLeave(body, leave));
  saveDb();
  return leave;
});

route('DELETE', /^\/api\/leaves\/(\d+)$/, ({ params }) => {
  const id = Number(params[0]);
  if (!db.leaves.some((l) => l.id === id)) bad('找不到紀錄');
  db.leaves = db.leaves.filter((l) => l.id !== id);
  saveDb();
  return {};
});

route('POST', /^\/api\/calendar\/upload$/, ({ raw }) => {
  let parsed;
  try { parsed = parseGovCalendar(raw); } catch (err) { bad(err.message); }
  const { year, holidays } = parsed;
  const overrides = db.calendars[year]?.overrides ?? {}; // 保留手動修改
  db.calendars[year] = { govHolidays: holidays, overrides, uploadedAt: new Date().toISOString() };
  saveDb();
  const total = Object.keys(overrides).length;
  const days = new Date(Date.UTC(year, 1, 29)).getUTCDate() === 29 ? 366 : 365;
  const holidayCount = holidays.filter((d) => !(d in overrides)).length
    + Object.values(overrides).filter(Boolean).length;
  return { year, holidayCount, workdayCount: days - holidayCount, manualCount: total };
});

route('PUT', /^\/api\/calendar\/day\/(\d{4}-\d{2}-\d{2})$/, ({ body, params }) => {
  const date = params[0];
  const cal = db.calendars[date.slice(0, 4)] ?? bad(`請先上傳 ${date.slice(0, 4)} 年行事曆`);
  const holiday = Boolean(body.holiday);
  if (holiday === cal.govHolidays.includes(date)) delete cal.overrides[date]; // 改回和政府日曆一樣 = 還原
  else cal.overrides[date] = holiday;
  saveDb();
  return {};
});

route('DELETE', /^\/api\/calendar\/day\/(\d{4}-\d{2}-\d{2})$/, ({ params }) => {
  const date = params[0];
  const cal = db.calendars[date.slice(0, 4)] ?? bad('找不到行事曆');
  delete cal.overrides[date];
  saveDb();
  return {};
});

// ---------- HTTP ----------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function readBody(req, limit = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new BadRequest('檔案太大')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function serveStatic(pathname, res) {
  const file = path.normalize(path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] ?? 'application/octet-stream');
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (!pathname.startsWith('/api/')) return serveStatic(pathname, res);
    for (const r of routes) {
      const m = r.method === req.method && pathname.match(r.pattern);
      if (!m) continue;
      const raw = req.method === 'GET' ? Buffer.alloc(0) : await readBody(req);
      const isJson = (req.headers['content-type'] ?? '').includes('application/json');
      const body = isJson && raw.length ? JSON.parse(raw.toString('utf8')) : {};
      return send(res, 200, r.handler({ body, raw, params: m.slice(1) }));
    }
    send(res, 404, { error: '找不到 API' });
  } catch (err) {
    if (err instanceof BadRequest || err instanceof SyntaxError) return send(res, 400, { error: err.message });
    console.error(err);
    send(res, 500, { error: `系統錯誤：${err.message}` });
  }
});

const url = `http://localhost:${PORT}`;
const openBrowser = () => process.argv.includes('--open') && exec(`start "" ${url}`);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`系統已經在執行中，直接開啟 ${url}`);
    openBrowser();
    setTimeout(() => process.exit(0), 500);
  } else throw err;
});

server.listen(PORT, HOST, () => {
  console.log(`SF ERP 已啟動：${url}（關閉此視窗即停止系統）`);
  console.log(`資料檔：${DB_FILE}`);
  openBrowser();
});
