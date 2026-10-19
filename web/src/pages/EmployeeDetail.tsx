// 員工個人頁（規格第 10 節）
import { useState } from 'react';
import { go, useApp } from '../ui/app-context';
import { Icon } from '../ui/icons';
import { amountText, fmtHours, mdText, money, ntd, typeColor } from '../ui/format';
import { SETTLE_LABEL as ACTION_LABEL, annualNow, settlementFor, typeOf } from '../ui/derive';
import { EmployeeDialog } from './Employees';
import {
  addMonths, annualPeriod, annualStatus, asOfDate, daysBetween, daysInMonth, isEmployedOn, seniorityText, ymd,
  type AnnualPeriod,
} from '../rules/rules';

export function EmployeeDetailPage() {
  const { st, today, route, src, run, confirm, cal } = useApp();
  const emp = st.employees.find((e) => e.id === Number(route.id));
  const year = Number(route.q.get('y')) || Number(today.slice(0, 4));
  const [editing, setEditing] = useState(false);

  if (!emp) {
    return <div className="page"><a href="#/employees">← 員工主檔</a><div className="card empty">找不到這位員工。</div></div>;
  }
  const active = isEmployedOn(emp, today) || emp.hireDate > today;
  const a = annualNow(st, emp, today);
  const total = a.entitled + a.deferred;
  const settledNow = a.period ? settlementFor(st, emp.id, a.period.start) : undefined;
  const mine = st.leaves.filter((l) => l.employeeId === emp.id);
  const yearRecs = mine.filter((l) => l.date.startsWith(String(year)));
  const sumBy = (code: string) => yearRecs.filter((l) => l.type === code).reduce((s, l) => s + l.hours, 0);
  const hoursTotal = yearRecs.filter((l) => l.type !== 'late').reduce((s, l) => s + l.hours, 0);
  const dedTotal = yearRecs.reduce((s, l) => s + l.deduction, 0);
  const lates = yearRecs.filter((l) => l.type === 'late');
  const dedParts = st.leaveTypes
    .map((t) => ({ t, v: yearRecs.filter((l) => l.type === t.code).reduce((s, l) => s + l.deduction, 0) }))
    .filter((x) => x.v > 0);

  // 特休週年紀錄：由第一個週年期間到目前
  const periods: AnnualPeriod[] = [];
  const asOf = asOfDate(emp, today);
  for (let p = annualPeriod(emp.annualBaseDate, addMonths(emp.annualBaseDate, 6)); p && p.start <= asOf; p = annualPeriod(emp.annualBaseDate, p.end)) {
    periods.push(p);
    if (periods.length > 60) break;
  }
  periods.reverse();

  const del = async () => {
    const n = mine.length;
    const ok = await confirm({ title: `刪除 ${emp.name}？`, body: `會一併刪除 ${n} 筆出缺勤紀錄與特休處理紀錄，無法復原。`, ok: '刪除員工', danger: true });
    if (ok && (await run(() => src.deleteEmployee(emp.id), `已刪除 ${emp.name}`)) != null) go('#/employees');
  };

  return (
    <div className="page">
      <a href="#/employees" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, fontWeight: 700, textDecoration: 'none' }}>
        <Icon name="left" size={16} stroke={2} />員工主檔
      </a>

      <section className="card" style={{ padding: 28, display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
        <div className="av" style={{ width: 72, height: 72, fontSize: 28, background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent)' }}>{emp.name[0]}</div>
        <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1>{emp.name}</h1>
            <span className={active ? 'tag ok' : 'tag'}>{active ? '在職' : '已離職'}</span>
            <span className="tag">{emp.gender === 'F' ? '女' : '男'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px 24px' }}>
            <KV k="到職日" v={emp.hireDate} />
            <KV k="年資" v={seniorityText(emp.annualBaseDate, asOf)} />
            <KV k="月本薪" v={ntd(emp.salary)} />
            <KV k="特休年資起算日" v={emp.annualBaseDate} />
            {emp.leaveDate && <KV k="離職日" v={emp.leaveDate} />}
            <KV k="信箱" v={emp.email || '—'} />
            <KV k="電話" v={emp.phone || '—'} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn danger" onClick={del} disabled={src.readOnly}>刪除</button>
          <button type="button" className="btn" onClick={() => setEditing(true)} disabled={src.readOnly}>編輯資料</button>
          {active && <a className="btn primary" href={`#/quick?emp=${emp.id}`}>登記請假</a>}
        </div>
      </section>

      <div className="grid-cards">
        <div className="card stat" style={{ gap: 10, borderColor: 'var(--annual)' }}>
          <span className="label">特休剩餘（本週年）</span>
          {a.period ? <>
            <b className="value" style={{ lineHeight: 1 }}>{fmtHours(a.remaining)}<span className="unit"> / {fmtHours(total)} h</span></b>
            <div className="bar" style={{ height: 8 }}><span style={{ width: `${total ? (a.remaining / total) * 100 : 0}%` }} /></div>
            <span className="muted num small">{a.period.start}～{a.period.last} · 還有 {Math.max(0, daysBetween(today, a.period.last))} 天{a.deferred ? ` · 含遞延 ${fmtHours(a.deferredRemaining)} h` : ''}</span>
            {settledNow && <span className="tag wrap" style={{ alignSelf: 'flex-start' }}>{ACTION_LABEL[settledNow.action]}{settledNow.action === 'defer' ? ` ${fmtHours(settledNow.deferredHours)} h 到 ${settledNow.deferredUntil}` : settledNow.amount ? ` ${ntd(settledNow.amount)}` : ''}，本期不能再請特休</span>}
          </> : <span className="muted">年資未滿 6 個月，尚無特休</span>}
        </div>
        <div className="card stat"><span className="label">{year} 請假合計</span><b className="value">{fmtHours(hoursTotal)}<span className="unit"> h</span></b><span className="muted small">其中特休 {fmtHours(sumBy('annual'))} h</span></div>
        <div className="card stat"><span className="label">{year} 扣除金額</span><b className="value"><span className="unit">NT$ </span>{money(dedTotal)}</b>
          <span className="muted small">{dedParts.length ? dedParts.map((x) => `${x.t.name} ${money(x.v)}`).join(' · ') : '沒有扣款'}</span></div>
        <div className="card stat"><span className="label">{year} 遲到</span><b className="value">{lates.length}<span className="unit"> 次</span></b><span className="muted small">合計 {Math.round(sumBy('late') * 60)} 分</span></div>
      </div>

      <section className="card pad stack">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 className="spacer">{year} 全年假勤</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <a className="btn sm" aria-label="前一年" href={`#/employees/${emp.id}?y=${year - 1}`}><Icon name="left" size={16} stroke={2} /></a>
            <a className="btn sm" aria-label="後一年" href={`#/employees/${emp.id}?y=${year + 1}`}><Icon name="right" size={16} stroke={2} /></a>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
            {st.leaveTypes.map((t) => <span key={t.code} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ background: typeColor(t) }} />{t.name}</span>)}
          </div>
        </div>
        <div className="table-box">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 640 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 36 }} />
              <div className="hm muted num" style={{ fontSize: 10, textAlign: 'center' }}>
                {Array.from({ length: 31 }, (_, i) => <span key={i} style={{ height: 'auto', background: 'none' }}>{i === 0 || (i + 1) % 5 === 0 ? i + 1 : ''}</span>)}
              </div>
            </div>
            {Array.from({ length: 12 }, (_, mi) => {
              const m = mi + 1;
              return (
                <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <b className="muted num" style={{ width: 36, fontSize: 12 }}>{m} 月</b>
                  <div className="hm">
                    {Array.from({ length: 31 }, (_, di) => {
                      const d = di + 1;
                      if (d > daysInMonth(year, m)) return <span key={d} style={{ background: 'transparent' }} />;
                      const date = ymd(year, m, d);
                      const recs = mine.filter((l) => l.date === date);
                      const t = recs[0] && typeOf(st, recs[0].type);
                      const cls = [cal.isHoliday(date) ? 'hol' : '', date === today ? 'today' : ''].join(' ').trim();
                      const title = recs.length ? `${m}/${d} ${recs.map((l) => `${typeOf(st, l.type)?.name} ${amountText(l)}`).join('、')}` : `${m}/${d}`;
                      return <span key={d} className={cls || undefined} title={title} style={t ? { background: typeColor(t) } : undefined} />;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <span className="muted small">空心格為放假日；白框為今天。滑過格子可看當天假別與時數。</span>
      </section>

      <div className="row-wrap">
        <section className="card table-box" style={{ flex: '3 1 520px', minWidth: 0 }}>
          <div style={{ padding: '20px 20px 4px' }}><h2>{year} 紀錄</h2></div>
          {yearRecs.length === 0 ? <div className="empty">這一年沒有紀錄。</div> : (
            <table className="tbl">
              <thead><tr><th>日期</th><th>假別</th><th>時間</th><th className="r">時數</th><th className="r">扣除</th><th>理由</th></tr></thead>
              <tbody>
                {[...yearRecs].reverse().map((l) => {
                  const t = typeOf(st, l.type);
                  return (
                    <tr key={l.id} className="click" onClick={() => go(`#/attendance?ym=${l.date.slice(0, 7)}&sel=${l.date}`)}>
                      <td className="num">{mdText(l.date)}</td>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ background: typeColor(t) }} />{t?.name}</span></td>
                      <td className="num muted">{l.start}–{l.end}</td>
                      <td className="r">{amountText(l)}</td>
                      <td className="r">{money(l.deduction)}</td>
                      <td className="muted" style={{ whiteSpace: 'normal' }}>{l.reason || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
        <section className="card pad stack" style={{ flex: '2 1 320px', minWidth: 0 }}>
          <h2>特休週年紀錄</h2>
          {periods.length === 0 && <span className="muted">年資未滿 6 個月，尚無特休。</span>}
          {periods.map((p) => {
            const s = annualStatus(emp, st.leaves, st.settlements, p.start);
            const settle = st.settlements.find((x) => x.employeeId === emp.id && x.periodStart === p.start);
            const current = p.start <= asOf && asOf < p.end && !settle;
            const tag = settle ? ACTION_LABEL[settle.action] : current ? '進行中' : s.remaining <= 0 ? '已休完' : '未處理';
            return (
              <div key={p.start} style={{ padding: 14, borderRadius: 12, background: 'var(--raised)', display: 'flex', flexDirection: 'column', gap: 4, border: current ? '1px solid var(--annual)' : '1px solid transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <b className="num">{p.start}～{p.last}</b>
                  <span className={current ? 'tag ok' : tag === '未處理' ? 'tag warn' : 'tag'}>{tag}</span>
                </div>
                <span className="muted num" style={{ fontSize: 13 }}>
                  {p.days} 日（{p.days * 8} h）{s.deferred ? `＋遞延 ${fmtHours(s.deferred)} h` : ''} · 已休 {fmtHours(s.used)} h · 剩 {fmtHours(s.remaining)} h
                  {settle && settle.amount > 0 && ` → 換錢 ${ntd(settle.amount)}`}
                  {settle?.action === 'defer' && ` → 遞延 ${fmtHours(settle.deferredHours)} h 到 ${settle.deferredUntil}`}
                </span>
              </div>
            );
          })}
        </section>
      </div>
      {editing && <EmployeeDialog emp={emp} onClose={() => setEditing(false)} />}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{k}</span>
      <b className="num" style={{ wordBreak: 'break-all' }}>{v}</b>
    </div>
  );
}
