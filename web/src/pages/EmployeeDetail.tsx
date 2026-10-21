// 員工個人頁（規格第 10 節）
import { useState } from 'react';
import { go, useApp } from '../ui/app-context';
import { Icon } from '../ui/icons';
import { Annual, AnnualNum, AnnualUnit, LeaveAmount, useAnnualUnit } from '../ui/annual-unit';
import { amountText, fmtHours, mdText, money, ntd, typeColor, typeName } from '../ui/format';
import { SETTLE_LABEL as ACTION_LABEL, annualNow, settlementFor, typeOf } from '../ui/derive';
import { EmployeeDialog } from './Employees';
import { msgText, t, tr } from '../i18n';
import {
  addMonths, annualPeriod, annualStatus, asOfDate, daysBetween, daysInMonth, isEmployedOn, seniorityText, ymd,
  type AnnualPeriod,
} from '../rules/rules';

export function EmployeeDetailPage() {
  const { st, today, route, src, run, confirm, cal } = useApp();
  const unit = useAnnualUnit();
  const emp = st.employees.find((e) => e.id === Number(route.id));
  const year = Number(route.q.get('y')) || Number(today.slice(0, 4));
  const [editing, setEditing] = useState(false);

  if (!emp) {
    return <div className="page"><a href="#/employees">← {t('員工主檔')}</a><div className="card empty">{t('找不到這位員工。')}</div></div>;
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
    .map((tp) => ({ tp, v: yearRecs.filter((l) => l.type === tp.code).reduce((s, l) => s + l.deduction, 0) }))
    .filter((x) => x.v > 0);

  // 特休週年紀錄：由第一個週年期間到目前
  const periods: AnnualPeriod[] = [];
  const asOf = asOfDate(emp, today);
  for (let p = annualPeriod(emp.annualBaseDate, addMonths(emp.annualBaseDate, 6)); p && p.start <= asOf; p = annualPeriod(emp.annualBaseDate, p.end)) {
    periods.push(p);
    if (periods.length > 60) break;
  }
  periods.reverse();

  // 有紀錄的員工不刪除，改填離職日：離職後不會出現在登記名單，歷史紀錄與金額都保留
  const hasHistory = mine.length > 0 || st.settlements.some((s) => s.employeeId === emp.id);
  const del = async () => {
    if (hasHistory) {
      const ok = await confirm({
        title: t('{0} 已有紀錄，不能刪除', [emp.name]),
        body: t('有出缺勤或特休處理紀錄的員工請填寫離職日。離職後不會出現在登記名單，歷史紀錄與金額都會保留。'),
        ok: t('填寫離職日'),
      });
      if (ok) setEditing(true);
      return;
    }
    const ok = await confirm({ title: t('刪除 {0}？', [emp.name]), body: t('這位員工沒有任何紀錄，刪除後無法復原。'), ok: t('刪除員工'), danger: true });
    if (ok && (await run(() => src.deleteEmployee(emp.id).then(() => true), t('已刪除 {0}', [emp.name])))) go('#/employees');
  };

  return (
    <div className="page">
      <a href="#/employees" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, fontWeight: 700, textDecoration: 'none' }}>
        <Icon name="left" size={16} stroke={2} />{t('員工主檔')}
      </a>

      <section className="card" style={{ padding: 28, display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
        <div className="av" style={{ width: 72, height: 72, fontSize: 28, background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent)' }}>{emp.name[0]}</div>
        <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1>{emp.name}</h1>
            <span className={active ? 'tag ok' : 'tag'}>{active ? t('在職') : t('已離職')}</span>
            <span className="tag">{emp.gender === 'F' ? t('女') : t('男')}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px 24px' }}>
            <KV k={t('到職日')} v={emp.hireDate} />
            <KV k={t('年資')} v={msgText(seniorityText(emp.annualBaseDate, asOf))} />
            <KV k={t('月本薪')} v={ntd(emp.salary)} />
            <KV k={t('特休年資起算日')} v={emp.annualBaseDate} />
            {emp.leaveDate && <KV k={t('離職日')} v={emp.leaveDate} />}
            <KV k={t('信箱')} v={emp.email || '—'} />
            <KV k={t('電話')} v={emp.phone || '—'} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn danger" onClick={del} disabled={src.readOnly}>{t('刪除')}</button>
          <button type="button" className="btn" onClick={() => setEditing(true)} disabled={src.readOnly}>{t('編輯資料')}</button>
          {active && <a className="btn primary" href={`#/quick?emp=${emp.id}`}>{t('登記請假')}</a>}
        </div>
      </section>

      <div className="grid-cards">
        <div className="card stat" style={{ gap: 10, borderColor: 'var(--annual)' }}>
          <span className="label">{t('特休剩餘（本週年）')}</span>
          {a.period ? <>
            <b className="value" style={{ lineHeight: 1 }}><AnnualNum h={a.remaining} /><span className="unit"> / <AnnualNum h={total} /><AnnualUnit n={total} /></span></b>
            <div className="bar" style={{ height: 8 }}><span style={{ width: `${total ? (a.remaining / total) * 100 : 0}%` }} /></div>
            <span className="muted num small">{a.period.start}～{a.period.last} · {t('還有 {0} 天', [Math.max(0, daysBetween(today, a.period.last))])}{a.deferred ? tr(' · 含遞延 {0}', [<Annual h={a.deferredRemaining} />]) : ''}</span>
            {settledNow && <span className="tag wrap" style={{ alignSelf: 'flex-start' }}>{t(ACTION_LABEL[settledNow.action])}{settledNow.action === 'defer' ? tr(' {0} 到 {1}', [<Annual h={settledNow.deferredHours} />, settledNow.deferredUntil]) : settledNow.amount ? ` ${ntd(settledNow.amount)}` : ''}{t('，本期不能再請特休')}</span>}
          </> : <span className="muted">{t('年資未滿 6 個月，尚無特休')}</span>}
        </div>
        <div className="card stat"><span className="label">{t('{0} 請假合計', [year])}</span><b className="value">{fmtHours(hoursTotal)}<span className="unit"> h</span></b><span className="muted small">{tr('其中特休 {0}', [<Annual h={sumBy('annual')} />])}</span></div>
        <div className="card stat"><span className="label">{t('{0} 扣除金額', [year])}</span><b className="value"><span className="unit">NT$ </span>{money(dedTotal)}</b>
          <span className="muted small">{dedParts.length ? dedParts.map((x) => `${typeName(x.tp)} ${money(x.v)}`).join(' · ') : t('沒有扣款')}</span></div>
        <div className="card stat"><span className="label">{t('{0} 遲到', [year])}</span><b className="value">{lates.length}<span className="unit"> {t('次')}</span></b><span className="muted small">{t('合計 {0} 分', [Math.round(sumBy('late') * 60)])}</span></div>
      </div>

      <section className="card pad stack">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 className="spacer">{t('{0} 全年假勤', [year])}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <a className="btn sm" aria-label={t('前一年')} href={`#/employees/${emp.id}?y=${year - 1}`}><Icon name="left" size={16} stroke={2} /></a>
            <a className="btn sm" aria-label={t('後一年')} href={`#/employees/${emp.id}?y=${year + 1}`}><Icon name="right" size={16} stroke={2} /></a>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
            {st.leaveTypes.map((tp) => <span key={tp.code} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ background: typeColor(tp) }} />{typeName(tp)}</span>)}
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
                  <b className="muted num" style={{ width: 36, fontSize: 12 }}>{t('{0} 月', [m])}</b>
                  <div className="hm">
                    {Array.from({ length: 31 }, (_, di) => {
                      const d = di + 1;
                      if (d > daysInMonth(year, m)) return <span key={d} style={{ background: 'transparent' }} />;
                      const date = ymd(year, m, d);
                      const recs = mine.filter((l) => l.date === date);
                      const tp = recs[0] && typeOf(st, recs[0].type);
                      const cls = [cal.isHoliday(date) ? 'hol' : '', date === today ? 'today' : ''].join(' ').trim();
                      const title = recs.length ? `${m}/${d} ${recs.map((l) => `${typeName(typeOf(st, l.type))} ${amountText(l, unit)}`).join(t('、'))}` : `${m}/${d}`;
                      return <span key={d} className={cls || undefined} title={title} style={tp ? { background: typeColor(tp) } : undefined} />;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <span className="muted small">{t('空心格為放假日；白框為今天。滑過格子可看當天假別與時數。')}</span>
      </section>

      <div className="row-wrap">
        <section className="card table-box" style={{ flex: '3 1 520px', minWidth: 0 }}>
          <div style={{ padding: '20px 20px 4px' }}><h2>{t('{0} 紀錄', [year])}</h2></div>
          {yearRecs.length === 0 ? <div className="empty">{t('這一年沒有紀錄。')}</div> : (
            <table className="tbl">
              <thead><tr><th>{t('日期')}</th><th>{t('假別')}</th><th>{t('時間')}</th><th className="r">{t('時數')}</th><th className="r">{t('扣除')}</th><th>{t('理由')}</th></tr></thead>
              <tbody>
                {[...yearRecs].reverse().map((l) => {
                  const tp = typeOf(st, l.type);
                  return (
                    <tr key={l.id} className="click" onClick={() => go(`#/attendance?ym=${l.date.slice(0, 7)}&sel=${l.date}`)}>
                      <td className="num">{mdText(l.date)}</td>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ background: typeColor(tp) }} />{typeName(tp)}</span></td>
                      <td className="num muted">{l.start}–{l.end}</td>
                      <td className="r"><LeaveAmount rec={l} /></td>
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
          <h2>{t('特休週年紀錄')}</h2>
          {periods.length === 0 && <span className="muted">{t('年資未滿 6 個月，尚無特休。')}</span>}
          {periods.map((p) => {
            const s = annualStatus(emp, st.leaves, st.settlements, p.start);
            const settle = st.settlements.find((x) => x.employeeId === emp.id && x.periodStart === p.start);
            const current = p.start <= asOf && asOf < p.end && !settle;
            const tag = settle ? ACTION_LABEL[settle.action] : current ? '進行中' : s.remaining <= 0 ? '已休完' : '未處理';
            return (
              <div key={p.start} style={{ padding: 14, borderRadius: 12, background: 'var(--raised)', display: 'flex', flexDirection: 'column', gap: 4, border: current ? '1px solid var(--annual)' : '1px solid transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <b className="num">{p.start}～{p.last}</b>
                  <span className={current ? 'tag ok' : tag === '未處理' ? 'tag warn' : 'tag'}>{t(tag)}</span>
                </div>
                <span className="muted num" style={{ fontSize: 13 }}>
                  {tr('額度 {0}', [<Annual h={p.days * 8} />])}{s.deferred ? tr('＋遞延 {0}', [<Annual h={s.deferred} />]) : ''} · {tr('已休 {0}', [<Annual h={s.used} />])} · {tr('剩 {0}', [<Annual h={s.remaining} />])}
                  {settle && settle.amount > 0 && t(' → 換錢 {0}', [ntd(settle.amount)])}
                  {settle?.action === 'defer' && tr(' → 遞延 {0} 到 {1}', [<Annual h={settle.deferredHours} />, settle.deferredUntil])}
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
