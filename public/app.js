import {
  LEAVE_TYPES, leaveType, SEGMENTS, isSegment, TIME_SLOTS, toMin, leaveHours, deduction,
  daysInMonth, ymd, weekday, WEEKDAY_NAMES, seniorityText, annualStatus, asOfDate, isEmployedOn, isHoliday,
  LATE_START, LATE_MAX_MIN, isValidLateEnd, lateMinutes, WORK_PERIODS, HOURS_PER_DAY, annualDaysForYears,
} from './shared/rules.js';

let S = null; // 伺服器狀態：{ today, employees, leaves, calendars }
const ui = {
  page: 'employees',
  ym: '',              // 出缺勤登記的年月 'YYYY-MM'
  openDate: null,      // 出缺勤登記：開著的當日視窗
  editingId: null,     // 正在編輯的請假紀錄
  ovYear: 0,
  ovMonth: 'all',
  expanded: new Set(), // 請假總覽展開明細的員工
};

const $app = document.getElementById('app');

// ---------- 工具 ----------

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => n.toLocaleString('zh-TW');
const hrs = (n) => String(Math.round(n * 100) / 100);
const fmtDate = (s) => s.replaceAll('-', '/');
/** 時數顯示：遲到用分鐘，其他用小時 */
const qty = (type, hours) => (type === 'late' ? `${lateMinutes(hours)} 分` : hrs(hours));
const qtyUnit = (type) => (type === 'late' ? '分' : 'h');
const empById = (id) => S.employees.find((e) => e.id === id);
const prevDay = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};
const shiftMonth = (ym, delta) => {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + delta;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const sortedEmployees = () => [...S.employees].sort((a, b) => a.hireDate.localeCompare(b.hireDate) || a.id - b.id);

async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body instanceof ArrayBuffer) {
    opts.body = body;
    opts.headers['Content-Type'] = 'application/octet-stream';
  } else if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
  }
  let res;
  try { res = await fetch(url, opts); } catch { throw new Error('無法連線到系統，請確認 start.bat 的視窗仍開著'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function reload() {
  S = await api('GET', '/api/state');
  render();
}

let toastTimer;
function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = isError ? 'error' : '';
  // 用 popover 顯示，才能蓋在對話框上面；先關再開讓它排到最上層
  if (el.matches(':popover-open')) el.hidePopover();
  el.showPopover();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.hidePopover(), isError ? 5000 : 2500);
}

/** 執行寫入動作 → 重新載入 → 提示；失敗時顯示錯誤訊息 */
async function act(fn, okMsg) {
  try {
    const r = await fn();
    await reload();
    if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
    return true;
  } catch (err) {
    toast(err.message, true);
    return false;
  }
}

// ---------- 畫面 ----------

function render() {
  document.querySelectorAll('.topbar a').forEach((a) => a.classList.toggle('active', a.dataset.page === ui.page));
  const pages = { employees: renderEmployees, attendance: renderAttendance, overview: renderOverview, rules: renderRules };
  $app.innerHTML = pages[ui.page]();
  renderDayDialog();
}

// ---------- 頁面一：員工主檔 ----------

function renderEmployees() {
  const rows = sortedEmployees().map((e) => {
    const asOf = asOfDate(e, S.today);
    const left = e.leaveDate && e.leaveDate < S.today;
    const st = annualStatus(e, S.leaves, asOf);
    const period = st.period ? `${fmtDate(st.period.start)}～${fmtDate(prevDay(st.period.end))}` : '未滿 6 個月';
    return `<tr class="${left ? 'inactive' : ''}">
      <td>${esc(e.name)} ${left ? '<span class="tag">已離職</span>' : ''}</td>
      <td>${e.gender === 'F' ? '女' : '男'}</td>
      <td class="num">${money(e.salary)}</td>
      <td>${fmtDate(e.hireDate)}</td>
      <td>${e.leaveDate ? fmtDate(e.leaveDate) : ''}</td>
      <td>${e.hireDate > S.today ? '<span class="tag">未到職</span>' : seniorityText(e.hireDate, asOf)}</td>
      <td class="num">${st.period ? `${st.period.days} 天` : '—'}</td>
      <td class="num">${st.period ? hrs(st.used) : '—'}</td>
      <td class="num">${st.period ? hrs(st.remaining) : '—'}</td>
      <td class="muted">${period}</td>
      <td>${esc(e.email)}</td>
      <td>${esc(e.phone)}</td>
      <td>
        <button class="btn small" data-action="edit-emp" data-id="${e.id}">編輯</button>
        <button class="btn small danger" data-action="delete-emp" data-id="${e.id}">刪除</button>
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="toolbar">
      <h1>員工主檔</h1>
      <span class="muted">共 ${S.employees.length} 人</span>
      <span class="spacer"></span>
      <button class="btn primary" data-action="new-emp">＋ 新增員工</button>
    </div>
    <div class="card">
      ${S.employees.length ? `<table>
        <thead><tr>
          <th>姓名</th><th>性別</th><th class="num">薪資</th><th>到職日</th><th>離職日</th><th>年資</th>
          <th class="num">特休天數</th><th class="num">已休(h)</th><th class="num">剩餘(h)</th><th>特休期間</th>
          <th>信箱</th><th>電話</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>` : '<div class="empty">尚未建立員工，請按「新增員工」。</div>'}
    </div>`;
}

const empDialog = document.getElementById('empDialog');
const empForm = document.getElementById('empForm');

function openEmpDialog(emp) {
  empForm.reset();
  empForm.dataset.id = emp ? emp.id : '';
  document.getElementById('empDialogTitle').textContent = emp ? `編輯員工：${emp.name}` : '新增員工';
  document.getElementById('empError').textContent = '';
  if (emp) {
    for (const k of ['name', 'gender', 'salary', 'hireDate', 'leaveDate', 'email', 'phone']) {
      empForm.elements[k].value = emp[k] ?? '';
    }
  }
  empDialog.showModal();
}

empForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const body = Object.fromEntries(new FormData(empForm));
  body.salary = Number(body.salary);
  const id = empForm.dataset.id;
  try {
    await api(id ? 'PUT' : 'POST', id ? `/api/employees/${id}` : '/api/employees', body);
    empDialog.close();
    await reload();
    toast(id ? '已更新員工資料' : `已新增員工「${body.name}」`);
  } catch (err) {
    document.getElementById('empError').textContent = err.message;
  }
});
document.getElementById('empCancel').addEventListener('click', () => empDialog.close());

// ---------- 頁面二：出缺勤登記 ----------

const CAL_WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']; // 週一開始
const CHIP_MAX = 3;

const dayLeaves = (date) => S.leaves.filter((l) => l.date === date)
  .sort((a, b) => toMin(a.start) - toMin(b.start) || a.id - b.id);

function renderAttendance() {
  const [y, m] = ui.ym.split('-').map(Number);
  const cal = S.calendars[y];
  const toolbar = `
    <div class="toolbar">
      <h1>出缺勤登記</h1>
      <button class="btn" data-action="month" data-delta="-1" title="上個月">◀</button>
      <input type="month" id="ymInput" value="${ui.ym}">
      <button class="btn" data-action="month" data-delta="1" title="下個月">▶</button>
      <button class="btn" data-action="this-month">本月</button>
      <span class="spacer"></span>
      ${cal ? `<span class="muted">${y} 年行事曆已匯入</span>` : ''}
      <button class="btn" data-action="upload-cal">${cal ? '重新上傳行事曆' : '上傳行事曆'}</button>
    </div>`;

  if (!cal) {
    return `${toolbar}
      <div class="notice">
        <p>尚未上傳 <b>${y} 年</b>行事曆，無法登記。請上傳人事行政總處的「政府行政機關辦公日曆表.xlsx」。</p>
        <button class="btn primary" data-action="upload-cal">上傳 ${y} 年行事曆</button>
      </div>`;
  }

  let workdays = 0, count = 0;
  const cells = [];
  const lead = (weekday(ymd(y, m, 1)) + 6) % 7; // 週一 = 0
  for (let i = 0; i < lead; i++) cells.push('<div class="cal-cell blank"></div>');
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const date = ymd(y, m, d);
    const hol = isHoliday(S.calendars, date);
    const recs = dayLeaves(date);
    if (!hol) workdays++;
    count += recs.length;
    const chips = recs.slice(0, CHIP_MAX).map((r) => {
      const label = `${empById(r.empId)?.name ?? ''} ${leaveType(r.type).name}${qty(r.type, r.hours).replace(' ', '')}`;
      return `<div class="chip lt-${r.type}" title="${esc(`${label} ${r.start}～${r.end} ${r.reason}`)}">${esc(label)}</div>`;
    }).join('');
    const more = recs.length > CHIP_MAX ? `<div class="chip-more">+${recs.length - CHIP_MAX} 筆</div>` : '';
    cells.push(`<div class="cal-cell${hol ? ' holiday' : ''}${date === S.today ? ' today' : ''}" data-action="open-day" data-date="${date}">
      <div class="cal-date"><span class="d">${d}</span>${date in cal.overrides ? '<span class="tag warn">手動</span>' : ''}</div>
      ${chips}${more}
    </div>`);
  }
  while (cells.length % 7) cells.push('<div class="cal-cell blank"></div>');

  return `${toolbar}
    <p class="muted">${y} 年 ${m} 月：上班日 ${workdays} 天，請假紀錄 ${count} 筆　點一下日期即可登記
      ${S.employees.length ? '' : '　<span class="tag warn">尚未建立員工，請先到「員工主檔」新增</span>'}</p>
    <div class="cal">
      ${CAL_WEEKDAYS.map((w) => `<div class="cal-wd">${w}</div>`).join('')}
      ${cells.join('')}
    </div>
    <div class="legend">${LEAVE_TYPES.map((t) => `<span class="chip lt-${t.code}">${t.name}</span>`).join('')}</div>`;
}

const dayDialog = document.getElementById('dayDialog');
const dayBody = document.getElementById('dayBody');
dayDialog.addEventListener('click', (ev) => { if (ev.target === dayDialog) dayDialog.close(); }); // 點背景關閉
dayDialog.addEventListener('close', () => {
  ui.openDate = null;
  ui.editingId = null;
});

/** 依 ui.openDate 重畫當日視窗；每次 render() 都會呼叫，讓存檔後的內容同步更新 */
function renderDayDialog() {
  const date = ui.page === 'attendance' ? ui.openDate : null;
  if (!date || !S.calendars[date.slice(0, 4)]) {
    if (dayDialog.open) dayDialog.close();
    return;
  }
  const [, m, d] = date.split('-').map(Number);
  const hol = isHoliday(S.calendars, date);
  const manual = date in S.calendars[date.slice(0, 4)].overrides;
  const recs = dayLeaves(date);
  const rows = recs.map((r) => (ui.editingId === r.id ? formRow(date, r) : recordRow(r))).join('');
  dayBody.innerHTML = `
    <div class="day-head">
      <h2>${m}/${d}（${WEEKDAY_NAMES[weekday(date)]}）</h2>
      ${hol ? '<span class="tag">放假日</span>' : ''}
      ${manual ? '<span class="tag warn">手動</span>' : ''}
      <span class="spacer"></span>
      ${manual ? `<button class="btn small link" data-action="restore-day" data-date="${date}">還原為政府日曆</button>` : ''}
      <button class="btn small" data-action="set-day" data-date="${date}" data-holiday="${hol ? 0 : 1}">${hol ? '改為上班日' : '改為放假日'}</button>
      <button class="btn small" data-action="close-day" title="關閉">✕</button>
    </div>
    <div class="day-body">
      ${recs.length || !hol ? `<table>
        <thead><tr>
          <th class="col-emp">員工</th><th class="col-type">假別</th><th class="col-time">起</th><th class="col-time">訖</th>
          <th class="col-hours num">時數</th><th class="col-amount num">扣除金額</th><th>理由</th><th class="col-actions"></th>
        </tr></thead>
        <tbody>${rows}${hol ? '' : formRow(date, null)}</tbody>
      </table>` : ''}
      ${hol ? '<p class="day-note">放假日不能新增紀錄；如需登記，請先「改為上班日」。</p>' : ''}
    </div>`;
  dayBody.querySelectorAll('tr.form-row').forEach(updateFormRow);
  if (!dayDialog.open) {
    dayDialog.showModal();
    // 預設停在新增列的員工選單，避免焦點落在「改為放假日」被 Enter 誤按
    (dayBody.querySelector('tr.form-row:not(.editing) [name=empId]') ?? dayBody.querySelector('[data-action=close-day]')).focus();
  }
}

function recordRow(r) {
  const e = empById(r.empId);
  return `<tr>
    <td>${esc(e?.name)}</td>
    <td>${leaveType(r.type).name}</td>
    <td>${r.start}</td><td>${r.end}</td>
    <td class="num">${qty(r.type, r.hours)}</td>
    <td class="num">${money(r.amount)}</td>
    <td>${esc(r.reason)}</td>
    <td>
      <button class="btn small" data-action="edit-leave" data-id="${r.id}">編輯</button>
      <button class="btn small danger" data-action="delete-leave" data-id="${r.id}">刪除</button>
    </td>
  </tr>`;
}

const options = (items, selected) => items.map(([v, label]) =>
  `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`).join('');

/** 新增列（rec = null）或編輯列 */
function formRow(date, rec) {
  const emps = sortedEmployees().filter((e) => isEmployedOn(e, date) || e.id === rec?.empId);
  const start = rec?.start ?? '09:30', end = rec?.end ?? '18:30';
  return `<tr class="form-row ${rec ? 'editing' : ''}" data-date="${date}" data-id="${rec?.id ?? ''}">
    <td><select name="empId">${options([['', '員工…'], ...emps.map((e) => [e.id, e.name])], rec?.empId ?? '')}</select></td>
    <td><select name="type">${options([['', '假別…'], ...LEAVE_TYPES.map((t) => [t.code, t.name])], rec?.type ?? '')}</select></td>
    <td><select name="start">${options(TIME_SLOTS.slice(0, -1).map((t) => [t, t]), start)}</select></td>
    <td>
      <select name="end">${options(TIME_SLOTS.slice(1).map((t) => [t, t]), rec?.type === 'late' ? '18:30' : end)}</select>
      <input type="time" name="lateEnd" step="60" min="${lateMin()}" max="${lateMax()}" value="${rec?.type === 'late' ? rec.end : ''}" title="到班時間" hidden>
    </td>
    <td class="num" data-f="hours">—</td>
    <td class="num" data-f="amount">—</td>
    <td><input name="reason" value="${esc(rec?.reason)}" placeholder="理由"><div class="hint" data-f="hint"></div></td>
    <td>
      <span class="quick">${SEGMENTS.map((s, i) => `<button class="btn small" data-action="segment" data-seg="${i}">${s.name}</button>`).join('')}</span>
      ${rec
        ? `<button class="btn small primary" data-action="save-leave">儲存</button> <button class="btn small" data-action="cancel-edit">取消</button>`
        : `<button class="btn small primary" data-action="save-leave">新增</button>`}
    </td>
  </tr>`;
}

const field = (tr, name) => tr.querySelector(`[name=${name}]`);
const addMin = (t, n) => { const m = toMin(t) + n; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const lateMin = () => addMin(LATE_START, 1);
const lateMax = () => addMin(LATE_START, LATE_MAX_MIN);

/** 表單目前的起訖；遲到的起固定 09:30、訖取到班時間 */
const formTimes = (tr) => (field(tr, 'type').value === 'late'
  ? { start: LATE_START, end: field(tr, 'lateEnd').value }
  : { start: field(tr, 'start').value, end: field(tr, 'end').value });

/** 依目前輸入即時計算時數、扣除金額與特休剩餘 */
function updateFormRow(tr) {
  const emp = empById(Number(field(tr, 'empId').value));
  const typeSel = field(tr, 'type'), startSel = field(tr, 'start'), endSel = field(tr, 'end');

  const female = emp?.gender === 'F';
  for (const o of typeSel.options) if (leaveType(o.value)?.femaleOnly) o.disabled = !female;
  if (leaveType(typeSel.value)?.femaleOnly && emp && !female) typeSel.value = '';

  const annual = typeSel.value === 'annual';
  const late = typeSel.value === 'late';
  if (annual && !isSegment(startSel.value, endSel.value)) { startSel.value = '09:30'; endSel.value = '18:30'; }
  if (late) startSel.value = LATE_START;
  startSel.disabled = endSel.disabled = annual || late; // 特休只能用全天／上午／下午快速鍵
  endSel.hidden = late;
  field(tr, 'lateEnd').hidden = !late;
  tr.querySelectorAll('[data-action=segment]').forEach((b) => { b.disabled = late; });

  const { start, end } = formTimes(tr);
  const valid = late ? isValidLateEnd(end) : toMin(start) < toMin(end);
  const hours = valid ? leaveHours(start, end) : 0;
  tr.querySelector('[data-f=hours]').textContent = hours ? qty(typeSel.value, hours) : '—';
  tr.querySelector('[data-f=amount]').textContent = emp && typeSel.value && hours
    ? money(deduction(hours, emp.salary, typeSel.value)) : '—';

  const hint = tr.querySelector('[data-f=hint]');
  let text = '', badHint = false;
  if (late && !valid) { text = `請填到班時間（${lateMin()}～${lateMax()}），超過 ${LATE_MAX_MIN} 分鐘請登記事假`; badHint = Boolean(end); }
  else if (!valid) { text = '訖時間須晚於起時間'; badHint = true; }
  else if (annual && emp) {
    const st = annualStatus(emp, S.leaves, tr.dataset.date, Number(tr.dataset.id) || undefined);
    if (!st.period) { text = '年資未滿 6 個月，沒有特休'; badHint = true; }
    else { text = `特休剩餘 ${hrs(st.remaining)}h`; badHint = hours > st.remaining; }
  }
  hint.textContent = text;
  hint.className = `hint${badHint ? ' bad' : ''}`;
}

function saveLeave(tr) {
  const id = tr.dataset.id;
  const body = {
    date: tr.dataset.date,
    empId: Number(field(tr, 'empId').value),
    type: field(tr, 'type').value,
    ...formTimes(tr),
    reason: field(tr, 'reason').value,
  };
  if (!body.empId) return toast('請選擇員工', true);
  if (!body.type) return toast('請選擇假別', true);
  return act(async () => {
    await api(id ? 'PUT' : 'POST', id ? `/api/leaves/${id}` : '/api/leaves', body);
    ui.editingId = null;
  }, id ? '已更新' : '已登記');
}

const calendarFile = document.getElementById('calendarFile');
calendarFile.addEventListener('change', async () => {
  const file = calendarFile.files[0];
  calendarFile.value = '';
  if (!file) return;
  const buf = await file.arrayBuffer();
  act(() => api('POST', '/api/calendar/upload', buf), (r) =>
    `已匯入 ${r.year} 年行事曆：上班日 ${r.workdayCount} 天、放假日 ${r.holidayCount} 天`
    + (r.manualCount ? `（保留手動修改 ${r.manualCount} 天）` : ''));
});

// ---------- 頁面三：請假總覽 ----------

function overviewData() {
  const y = ui.ovYear;
  const mm = ui.ovMonth === 'all' ? null : String(ui.ovMonth).padStart(2, '0');
  const prefix = mm ? `${y}-${mm}-` : `${y}-`;
  const rangeStart = mm ? `${y}-${mm}-01` : `${y}-01-01`;
  const rangeEnd = mm ? ymd(y, Number(mm), daysInMonth(y, Number(mm))) : `${y}-12-31`;
  const leaves = S.leaves.filter((l) => l.date.startsWith(prefix));

  const rows = sortedEmployees()
    .map((e) => {
      const recs = leaves.filter((l) => l.empId === e.id).sort((a, b) => a.date.localeCompare(b.date) || toMin(a.start) - toMin(b.start));
      const byType = Object.fromEntries(LEAVE_TYPES.map((t) => [t.code, 0]));
      for (const r of recs) byType[r.type] += r.hours;
      const st = annualStatus(e, S.leaves, asOfDate(e, S.today));
      return {
        emp: e, recs, byType,
        hours: recs.reduce((s, r) => s + r.hours, 0),
        amount: recs.reduce((s, r) => s + r.amount, 0),
        annualRemaining: st.period ? st.remaining : null,
        employed: e.hireDate <= rangeEnd && (!e.leaveDate || e.leaveDate >= rangeStart),
      };
    })
    .filter((r) => r.employed || r.recs.length);
  return { rows, label: mm ? `${y}-${mm}` : `${y}全年` };
}

function renderOverview() {
  const years = new Set([Number(S.today.slice(0, 4)), ...Object.keys(S.calendars).map(Number), ...S.leaves.map((l) => Number(l.date.slice(0, 4)))]);
  const { rows } = overviewData();
  const total = (f) => rows.reduce((s, r) => s + f(r), 0);

  const body = rows.map((r) => {
    const open = ui.expanded.has(r.emp.id);
    const detail = open ? `<tr class="detail"><td colspan="${LEAVE_TYPES.length + 5}">
      ${r.recs.length ? `<table>
        <thead><tr><th>日期</th><th>假別</th><th>起訖</th><th class="num">時數</th><th class="num">扣除金額</th><th>理由</th></tr></thead>
        <tbody>${r.recs.map((l) => `<tr>
          <td>${fmtDate(l.date)}（${WEEKDAY_NAMES[weekday(l.date)]}）</td><td>${leaveType(l.type).name}</td>
          <td>${l.start}～${l.end}</td><td class="num">${qty(l.type, l.hours)}</td><td class="num">${money(l.amount)}</td><td>${esc(l.reason)}</td>
        </tr>`).join('')}</tbody></table>` : '<span class="muted">此期間沒有請假紀錄</span>'}
    </td></tr>` : '';
    return `<tr class="clickable" data-action="toggle-emp" data-id="${r.emp.id}">
      <td><span class="caret">${open ? '▾' : '▸'}</span>${esc(r.emp.name)}</td>
      ${LEAVE_TYPES.map((t) => `<td class="num">${r.byType[t.code] ? qty(t.code, r.byType[t.code]).replace(' 分', '') : ''}</td>`).join('')}
      <td class="num">${r.hours ? hrs(r.hours) : ''}</td>
      <td class="num">${r.amount ? money(r.amount) : ''}</td>
      <td class="num">${r.annualRemaining == null ? '—' : hrs(r.annualRemaining)}</td>
    </tr>${detail}`;
  }).join('');

  return `
    <div class="toolbar">
      <h1>請假總覽</h1>
      <select id="ovYear">${options([...years].sort((a, b) => b - a).map((y) => [y, `${y} 年`]), ui.ovYear)}</select>
      <select id="ovMonth">${options([['all', '全年'], ...Array.from({ length: 12 }, (_, i) => [i + 1, `${i + 1} 月`])], ui.ovMonth)}</select>
      <span class="spacer"></span>
      <button class="btn" data-action="export-csv" ${rows.length ? '' : 'disabled'}>匯出 CSV</button>
    </div>
    <div class="card">
      ${rows.length ? `<table>
        <thead><tr>
          <th>姓名</th>${LEAVE_TYPES.map((t) => `<th class="num">${t.name}(${qtyUnit(t.code)})</th>`).join('')}
          <th class="num">合計(h)</th><th class="num">扣除金額</th><th class="num">特休剩餘(h)</th>
        </tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr>
          <td>合計</td>${LEAVE_TYPES.map((t) => `<td class="num">${qty(t.code, total((r) => r.byType[t.code])).replace(' 分', '')}</td>`).join('')}
          <td class="num">${hrs(total((r) => r.hours))}</td><td class="num">${money(total((r) => r.amount))}</td><td></td>
        </tr></tfoot>
      </table>` : '<div class="empty">此期間沒有在職員工。</div>'}
    </div>
    <p class="muted">特休剩餘為今天（已離職者為離職日）所屬週年期間的剩餘時數；點一下員工可展開明細。</p>`;
}

function exportCsv() {
  const { rows, label } = overviewData();
  const header = ['姓名', ...LEAVE_TYPES.map((t) => `${t.name}(${qtyUnit(t.code)})`), '合計(h)', '扣除金額', '特休剩餘(h)'];
  const lines = [header, ...rows.map((r) => [
    r.emp.name, ...LEAVE_TYPES.map((t) => (t.code === 'late' ? lateMinutes(r.byType[t.code]) : hrs(r.byType[t.code]))),
    hrs(r.hours), r.amount, r.annualRemaining == null ? '' : hrs(r.annualRemaining),
  ])];
  const cell = (v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));
  const csv = '﻿' + lines.map((l) => l.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `請假總覽_${label}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- 頁面四：請假制度（唯讀，內容取自 shared/rules.js） ----------

function renderRules() {
  const [[amS, amE], [pmS, pmE]] = WORK_PERIODS;
  const amH = leaveHours(amS, amE), pmH = leaveHours(pmS, pmE);
  const ratio = (r) => (r === 1 ? '全薪' : r === 0 ? '不支薪' : r === 0.5 ? '半薪' : `${r * 100}%`);
  const exSalary = 45000, exHourly = exSalary / 30 / HOURS_PER_DAY, exLateMin = 17;

  // 滿 1～9 年依日數合併成區間，滿 10 年起用一句話說明
  const groups = [];
  for (let n = 1; n < 10; n++) {
    const days = annualDaysForYears(n);
    if (groups.at(-1)?.days === days) groups.at(-1).to = n;
    else groups.push({ from: n, to: n, days });
  }
  const annualRows = [['滿 6 個月', 3],
    ...groups.map((g) => [g.from === g.to ? `滿 ${g.from} 年` : `滿 ${g.from}～${g.to} 年`, g.days])];
  annualRows.push(['滿 10 年起', '每年加 1 日，最多 30 日']);

  return `
    <div class="toolbar"><h1>請假制度</h1><span class="muted">本頁內容直接取自系統計算規則，僅供檢視</span></div>
    <div class="rules">
      <section class="card rule">
        <h2>上班時間</h2>
        <ul>
          <li>${amS}～${pmE}，午休 ${amE}～${pmS}</li>
          <li>上午 ${hrs(amH)}h、下午 ${hrs(pmH)}h、全天 ${hrs(amH + pmH)}h；日數換算 1 日 = ${HOURS_PER_DAY}h</li>
          <li>上班日依匯入的政府行政機關辦公日曆表，可手動調整</li>
        </ul>
      </section>

      <section class="card rule">
        <h2>扣款計算</h2>
        <ul>
          <li>時薪 = 薪資 ÷ 30 ÷ ${HOURS_PER_DAY}</li>
          <li>扣除金額 = 時數 × 時薪 × (1 − 給薪比例)，每筆四捨五入到整數元</li>
          <li>例：薪資 ${money(exSalary)}，時薪 ${hrs(exHourly)} 元
            <ul>
              <li>事假上午 ${hrs(amH)}h → ${hrs(amH)} × ${hrs(exHourly)} = <b>${money(deduction(amH, exSalary, 'personal'))} 元</b></li>
              <li>病假上午 ${hrs(amH)}h → ${hrs(amH)} × ${hrs(exHourly)} × 0.5 = <b>${money(deduction(amH, exSalary, 'sick'))} 元</b></li>
              <li>遲到 ${exLateMin} 分 → ${exLateMin} ÷ 60 × ${hrs(exHourly)} = <b>${money(deduction(exLateMin / 60, exSalary, 'late'))} 元</b></li>
            </ul>
          </li>
          <li>調薪不回溯：已登記的扣除金額維持登記當時的計算結果</li>
        </ul>
      </section>

      <section class="card rule">
        <h2>假別一覽</h2>
        <table>
          <thead><tr><th>假別</th><th>給薪比例</th><th>最小單位</th><th>限制</th></tr></thead>
          <tbody>${LEAVE_TYPES.map((t) => `<tr>
            <td><span class="chip lt-${t.code}">${t.name}</span></td><td>${ratio(t.payRatio)}</td><td>${t.unit}</td><td>${t.limit}</td>
          </tr>`).join('')}</tbody>
        </table>
        <p class="muted">遲到依實際分鐘數扣款（勞基法 §22、§26：不得超過實際未工作時間的比例）。</p>
      </section>

      <section class="card rule">
        <h2>特休核給（勞基法 §38，週年制）</h2>
        <table>
          <thead><tr><th>年資</th><th>日數</th></tr></thead>
          <tbody>${annualRows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody>
        </table>
        <ul>
          <li>年資從到職日起算；每個週年期間的額度 = 日數 × ${HOURS_PER_DAY}h</li>
          <li>特休只能請上午（${hrs(amH)}h）、下午（${hrs(pmH)}h）或全天（${hrs(amH + pmH)}h）</li>
        </ul>
      </section>

      <section class="card rule">
        <h2>登記規則</h2>
        <ul>
          <li>只能登記在上班日，且員工當天須在職（到職日～離職日）</li>
          <li>時段以 30 分鐘為單位（${TIME_SLOTS[0]}～${TIME_SLOTS.at(-1)}），時數自動扣除午休</li>
          <li>同一員工同一天的時段不能重疊</li>
          <li>沒有請假的缺勤，以事假登記；遲到超過 ${LATE_MAX_MIN} 分鐘，以事假登記</li>
        </ul>
      </section>
    </div>`;
}

// ---------- 事件 ----------

function onClick(ev) {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const id = Number(el.dataset.id);
  const tr = el.closest('tr.form-row');

  switch (el.dataset.action) {
    case 'new-emp': return openEmpDialog(null);
    case 'edit-emp': return openEmpDialog(empById(id));
    case 'delete-emp': {
      const e = empById(id);
      const n = S.leaves.filter((l) => l.empId === id).length;
      if (!confirm(`確定刪除「${e.name}」？${n ? `\n將一併刪除 ${n} 筆請假紀錄，無法復原。` : ''}`)) return;
      return act(() => api('DELETE', `/api/employees/${id}`), `已刪除「${e.name}」`);
    }

    case 'month': ui.ym = shiftMonth(ui.ym, Number(el.dataset.delta)); return render();
    case 'this-month': ui.ym = S.today.slice(0, 7); return render();
    case 'open-day': ui.openDate = el.dataset.date; ui.editingId = null; return render();
    case 'close-day': return dayDialog.close();
    case 'upload-cal': return calendarFile.click();
    case 'set-day':
      return act(() => api('PUT', `/api/calendar/day/${el.dataset.date}`, { holiday: el.dataset.holiday === '1' }));
    case 'restore-day':
      return act(() => api('DELETE', `/api/calendar/day/${el.dataset.date}`), '已還原為政府日曆');
    case 'segment': {
      const s = SEGMENTS[Number(el.dataset.seg)];
      field(tr, 'start').value = s.start;
      field(tr, 'end').value = s.end;
      return updateFormRow(tr);
    }
    case 'save-leave': return saveLeave(tr);
    case 'edit-leave': ui.editingId = id; return render();
    case 'cancel-edit': ui.editingId = null; return render();
    case 'delete-leave': {
      const l = S.leaves.find((x) => x.id === id);
      if (!confirm(`確定刪除 ${empById(l.empId)?.name} ${fmtDate(l.date)} ${leaveType(l.type).name} ${l.start}～${l.end}？`)) return;
      return act(() => api('DELETE', `/api/leaves/${id}`), '已刪除');
    }

    case 'toggle-emp':
      if (ui.expanded.has(id)) ui.expanded.delete(id); else ui.expanded.add(id);
      return render();
    case 'export-csv': return exportCsv();
  }
}

function onChange(ev) {
  const t = ev.target;
  if (t.id === 'ymInput' && t.value) { ui.ym = t.value; return render(); }
  if (t.id === 'ovYear') { ui.ovYear = Number(t.value); return render(); }
  if (t.id === 'ovMonth') { ui.ovMonth = t.value === 'all' ? 'all' : Number(t.value); return render(); }
  const tr = t.closest('tr.form-row');
  if (tr) updateFormRow(tr);
}

function onKeydown(ev) {
  if (ev.key === 'Enter' && ev.target.name === 'reason') saveLeave(ev.target.closest('tr.form-row'));
}

// 頁面與當日視窗共用同一組事件處理
for (const root of [$app, dayDialog]) {
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('keydown', onKeydown);
}

function applyHash() {
  const page = location.hash.slice(1);
  ui.page = ['employees', 'attendance', 'overview', 'rules'].includes(page) ? page : 'employees';
  if (S) render();
}
window.addEventListener('hashchange', applyHash);

(async function init() {
  applyHash();
  try {
    S = await api('GET', '/api/state');
  } catch (err) {
    $app.innerHTML = `<div class="notice"><p>${esc(err.message)}</p></div>`;
    return;
  }
  ui.ym = S.today.slice(0, 7);
  ui.ovYear = Number(S.today.slice(0, 4));
  render();
})();
