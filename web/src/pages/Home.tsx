// 首頁與提醒（規格第 5 節）
import { useApp } from '../ui/app-context';
import { CalendarUpload } from '../ui/CalendarUpload';
import { Icon } from '../ui/icons';
import { amountText, fmtHours, longDate, ntd, typeColor } from '../ui/format';
import { activeEmployees, dueList, empOf, missingCalendarYears, typeOf } from '../ui/derive';
import { WEEKDAY_NAMES, addDays, cashOut, daysBetween, weekday, type SettlementAction } from '../rules/rules';
import type { SettlementDue } from '../rules/rules';

export function HomePage() {
  const { st, cal, today } = useApp();
  const holiday = cal.isHoliday(today);
  const month = today.slice(0, 7);
  const monthLeaves = st.leaves.filter((l) => l.date.startsWith(month));
  const todays = st.leaves.filter((l) => l.date === today);
  const dues = dueList(st, today);
  const missing = missingCalendarYears(st, today);
  const pending = dues.length + missing.length;
  const monday = addDays(today, -((weekday(today) + 6) % 7));
  const week = Array.from({ length: 5 }, (_, i) => addDays(monday, i));
  const peopleOn = (d: string) => new Set(st.leaves.filter((l) => l.date === d).map((l) => l.employeeId)).size;
  const absentToday = new Set(todays.map((l) => l.employeeId)).size;

  return (
    <div className="page" style={{ gap: 24, maxWidth: 1120 }}>
      <div className="page-head" style={{ alignItems: 'flex-end' }}>
        <div className="title" style={{ flex: '1 1 360px', gap: 6 }}>
          <span className="muted" style={{ fontWeight: 700 }}>{longDate(today)} · {holiday === undefined ? '行事曆未匯入' : holiday ? '放假日' : '上班日'}</span>
          <h1 style={{ fontSize: 34 }}>{absentToday ? `今天有 ${absentToday} 人請假` : '今天沒有人請假'}</h1>
        </div>
        <a className="btn primary" href="#/quick"><Icon name="plus" size={18} stroke={2} />快速登記</a>
      </div>

      <div className="grid-cards">
        <div className="card stat"><span className="label">在職員工</span><b className="value">{activeEmployees(st, today).length}<span className="unit"> 人</span></b></div>
        <div className="card stat"><span className="label">本月請假時數</span><b className="value">{fmtHours(monthLeaves.filter((l) => l.type !== 'late').reduce((s, l) => s + l.hours, 0))}<span className="unit"> h</span></b></div>
        <div className="card stat"><span className="label">本月扣除金額</span><b className="value"><span className="unit">NT$ </span>{monthLeaves.reduce((s, l) => s + l.deduction, 0).toLocaleString('en-US')}</b></div>
        <div className="card stat" style={pending ? { borderColor: 'var(--warn)' } : undefined}>
          <span className="label" style={pending ? { color: 'var(--warn)' } : undefined}>待處理</span>
          <b className="value">{pending}<span className="unit"> 件</span></b>
        </div>
      </div>

      <div className="row-wrap" style={{ gap: 24 }}>
        <section className="card pad stack" style={{ flex: '3 1 520px', minWidth: 0, gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 className="spacer">待處理提醒</h2>
            {pending > 0 && <span className="tag warn">{pending} 件</span>}
          </div>
          {pending === 0 && <span className="muted">目前沒有需要處理的事。</span>}
          {dues.map((d) => <DueCard key={`${d.employee.id}-${d.period.start}`} due={d} />)}
          {missing.map((y) => (
            <div key={y} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: 18, borderRadius: 14, background: 'var(--raised)', border: '1px solid var(--line)' }}>
              <Icon name="calendar" size={22} style={{ color: 'var(--warn)' }} />
              <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', lineHeight: 1.4 }}>
                <b>{y} 年行事曆尚未匯入</b>
                <span className="muted" style={{ fontSize: 13 }}>匯入前不能登記 {y} 年的出缺勤。檔案：人事行政總處「政府行政機關辦公日曆表.xlsx」</span>
              </div>
              <CalendarUpload />
            </div>
          ))}
        </section>

        <section className="card pad stack" style={{ flex: '2 1 340px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 className="spacer">今天不在座位</h2>
            <a href={`#/attendance?ym=${month}&sel=${today}`} style={{ fontSize: 13, fontWeight: 700 }}>看月曆</a>
          </div>
          {todays.length === 0 && <span className="muted">今天沒有請假紀錄。</span>}
          {todays.map((l) => {
            const e = empOf(st, l.employeeId);
            const t = typeOf(st, l.type);
            return (
              <div key={l.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                <div className="av">{e?.name[0]}</div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.4 }}>
                  <b>{e?.name}</b>
                  <span className="muted num" style={{ fontSize: 13 }}>{l.start}–{l.end} · {amountText(l)}</span>
                </div>
                <span className="tag" style={{ color: 'var(--text)' }}><span className="dot" style={{ background: typeColor(t) }} />{t?.name}</span>
              </div>
            );
          })}
          <div className="stack" style={{ gap: 8, paddingTop: 6 }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>本週</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6, textAlign: 'center' }}>
              {week.map((d) => {
                const n = peopleOn(d);
                const isToday = d === today;
                return (
                  <a key={d} href={`#/attendance?ym=${d.slice(0, 7)}&sel=${d}`} style={{ padding: '10px 0', borderRadius: 10, textDecoration: 'none', color: 'var(--text)', background: isToday ? 'var(--accent-soft)' : 'var(--raised)', border: `1px solid ${isToday ? 'var(--accent)' : 'transparent'}` }}>
                    <b style={{ display: 'block', color: isToday ? 'var(--accent)' : 'var(--muted)' }}>{WEEKDAY_NAMES[weekday(d)]}</b>
                    <span className={n ? 'num' : 'num muted'} style={{ fontSize: 13 }}>{n ? `${n} 人` : '—'}</span>
                  </a>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

const ACTION_TEXT: Record<SettlementAction, string> = { cash: '換錢', defer: '遞延一年', zero: '歸零' };

function DueCard({ due }: { due: SettlementDue }) {
  const { src, run, confirm, today } = useApp();
  const { employee: e, period: p, status: s } = due;
  const left = daysBetween(today, p.last);
  const title = due.reason === 'resigned' ? `${e.name} · 已離職，特休需結清`
    : left < 0 ? `${e.name} · 特休已到期 ${-left} 天，尚未處理` : `${e.name} · 特休 ${left} 天後到期`;
  const deferCash = cashOut(s.deferredRemaining, e.salary);

  const act = async (action: SettlementAction) => {
    const body = action === 'cash' ? `剩餘 ${fmtHours(s.remaining)} h 換錢 ${ntd(due.cashAll)}，列入下一期薪資加項。`
      : action === 'defer' ? `本期剩餘 ${fmtHours(s.currentRemaining)} h 延長一年。${s.deferredRemaining > 0 ? `上期遞延的 ${fmtHours(s.deferredRemaining)} h 只能換錢：${ntd(deferCash)}。` : ''}`
      : `本期剩餘 ${fmtHours(s.currentRemaining)} h 歸零。注意：可能違反勞基法 §38 第 4 項，需公司全體同意。${s.deferredRemaining > 0 ? `上期遞延的 ${fmtHours(s.deferredRemaining)} h 仍會換錢：${ntd(deferCash)}。` : ''}`;
    const ok = await confirm({ title: `${e.name}：${ACTION_TEXT[action]}`, body, ok: `確認${ACTION_TEXT[action]}`, danger: action === 'zero' });
    if (ok) await run(() => src.settle(e.id, p.start, action, today), `已處理 ${e.name} 的特休：${ACTION_TEXT[action]}`);
  };

  return (
    <div className="stack" style={{ padding: 18, borderRadius: 14, background: 'var(--raised)', border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <a className="av" href={`#/employees/${e.id}`} style={{ textDecoration: 'none', color: 'var(--text)' }}>{e.name[0]}</a>
        <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', lineHeight: 1.4 }}>
          <b>{title}</b>
          <span className="muted" style={{ fontSize: 13 }}>
            週年期間 {p.start}～{p.last} · 剩 <b className="num" style={{ color: 'var(--text)' }}>{fmtHours(s.remaining)} h</b>
            {s.deferredRemaining > 0 && `（其中遞延 ${fmtHours(s.deferredRemaining)} h，只能換錢）`}
          </span>
        </div>
        <span className={left <= 14 ? 'tag warn' : 'tag'}>{p.last} {left < 0 ? '已到期' : '到期'}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {due.actions.map((a) => (
          <button key={a} type="button" className={a === 'cash' ? 'btn sm primary' : 'btn sm'} onClick={() => act(a)} disabled={src.readOnly}>
            {a === 'cash' ? `換錢 ${ntd(due.cashAll)}` : ACTION_TEXT[a]}
          </button>
        ))}
        <span className="muted small">換錢＝剩餘時數 × 處理當下本薪 ÷ 30 ÷ 8</span>
      </div>
    </div>
  );
}
