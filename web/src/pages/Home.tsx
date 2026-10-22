// 首頁與提醒（規格第 5 節）
import { useApp } from '../ui/app-context';
import { CalendarUpload } from '../ui/CalendarUpload';
import { Icon } from '../ui/icons';
import { Annual, LeaveAmount, useAnnualUnit } from '../ui/annual-unit';
import { annualText, fmtHours, longDate, ntd, typeColor, typeName, weekdayName } from '../ui/format';
import { activeEmployees, dueList, empOf, missingCalendarYears, typeOf } from '../ui/derive';
import { addDays, cashOut, daysBetween, totalDeduction, weekday, type SettlementAction } from '../rules/rules';
import type { SettlementDue } from '../rules/rules';
import { t, tr } from '../i18n';

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
          <span className="muted" style={{ fontWeight: 700 }}>{longDate(today)} · {holiday === undefined ? t('行事曆未匯入') : holiday ? t('放假日') : t('上班日')}</span>
          <h1 style={{ fontSize: 34 }}>{absentToday ? t('今天有 {0} 人請假', [absentToday]) : t('今天沒有人請假')}</h1>
        </div>
        <a className="btn primary" href="#/quick"><Icon name="plus" size={18} stroke={2} />{t('快速登記')}</a>
      </div>

      <div className="grid-cards">
        <div className="card stat"><span className="label">{t('在職員工')}</span><b className="value">{activeEmployees(st, today).length}<span className="unit"> {t('人')}</span></b></div>
        <div className="card stat"><span className="label">{t('本月請假時數')}</span><b className="value">{fmtHours(monthLeaves.filter((l) => l.type !== 'late').reduce((s, l) => s + l.hours, 0))}<span className="unit"> h</span></b></div>
        <div className="card stat"><span className="label">{t('本月扣除金額')}</span><b className="value"><span className="unit">NT$ </span>{totalDeduction(monthLeaves).toLocaleString('en-US')}</b></div>
        <div className="card stat" style={pending ? { borderColor: 'var(--warn)' } : undefined}>
          <span className="label" style={pending ? { color: 'var(--warn)' } : undefined}>{t('待處理')}</span>
          <b className="value">{pending}<span className="unit"> {t('件')}</span></b>
        </div>
      </div>

      <div className="row-wrap" style={{ gap: 24 }}>
        <section className="card pad stack" style={{ flex: '3 1 520px', minWidth: 0, gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 className="spacer">{t('待處理提醒')}</h2>
            {pending > 0 && <span className="tag warn">{t('{0} 件', [pending])}</span>}
          </div>
          {pending === 0 && <span className="muted">{t('目前沒有需要處理的事。')}</span>}
          {dues.map((d) => <DueCard key={`${d.employee.id}-${d.period.start}`} due={d} />)}
          {missing.map((y) => (
            <div key={y} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: 18, borderRadius: 14, background: 'var(--raised)', border: '1px solid var(--line)' }}>
              <Icon name="calendar" size={22} style={{ color: 'var(--warn)' }} />
              <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', lineHeight: 1.4 }}>
                <b>{t('{0} 年行事曆尚未匯入', [y])}</b>
                <span className="muted" style={{ fontSize: 13 }}>{t('匯入前不能登記 {0} 年的出缺勤。檔案：人事行政總處「政府行政機關辦公日曆表.xlsx」', [y])}</span>
              </div>
              <CalendarUpload />
            </div>
          ))}
        </section>

        <section className="card pad stack" style={{ flex: '2 1 340px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 className="spacer">{t('今天不在座位')}</h2>
            <a href={`#/attendance?ym=${month}&sel=${today}`} style={{ fontSize: 13, fontWeight: 700 }}>{t('看月曆')}</a>
          </div>
          {todays.length === 0 && <span className="muted">{t('今天沒有請假紀錄。')}</span>}
          {todays.map((l) => {
            const e = empOf(st, l.employeeId);
            const tp = typeOf(st, l.type);
            return (
              <div key={l.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                <div className="av">{e?.name[0]}</div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.4 }}>
                  <b>{e?.name}</b>
                  <span className="muted num" style={{ fontSize: 13 }}>{l.start}–{l.end} · <LeaveAmount rec={l} /></span>
                </div>
                <span className="tag" style={{ color: 'var(--text)' }}><span className="dot" style={{ background: typeColor(tp) }} />{typeName(tp)}</span>
              </div>
            );
          })}
          <div className="stack" style={{ gap: 8, paddingTop: 6 }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>{t('本週')}</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6, textAlign: 'center' }}>
              {week.map((d) => {
                const n = peopleOn(d);
                const isToday = d === today;
                return (
                  <a key={d} href={`#/attendance?ym=${d.slice(0, 7)}&sel=${d}`} style={{ padding: '10px 0', borderRadius: 10, textDecoration: 'none', color: 'var(--text)', background: isToday ? 'var(--accent-soft)' : 'var(--raised)', border: `1px solid ${isToday ? 'var(--accent)' : 'transparent'}` }}>
                    <b style={{ display: 'block', color: isToday ? 'var(--accent)' : 'var(--muted)' }}>{weekdayName(weekday(d))}</b>
                    <span className={n ? 'num' : 'num muted'} style={{ fontSize: 13 }}>{n ? t('{0} 人', [n]) : '—'}</span>
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
const actionText = (a: SettlementAction) => t(ACTION_TEXT[a]);

function DueCard({ due }: { due: SettlementDue }) {
  const { src, run, confirm, today } = useApp();
  const unit = useAnnualUnit();
  const at = (h: number) => annualText(h, unit);
  const { employee: e, period: p, status: s } = due;
  const left = daysBetween(today, p.last);
  const title = due.reason === 'resigned' ? t('{0} · 已離職，特休需結清', [e.name])
    : left < 0 ? t('{0} · 特休已到期 {1} 天，尚未處理', [e.name, -left]) : t('{0} · 特休 {1} 天後到期', [e.name, left]);
  const deferCash = cashOut(s.deferredRemaining, e.salary);

  const act = async (action: SettlementAction) => {
    const deferPart = s.deferredRemaining > 0
      ? t(action === 'defer' ? '上期遞延的 {0} 只能換錢：{1}。' : '上期遞延的 {0} 仍會換錢：{1}。', [at(s.deferredRemaining), ntd(deferCash)]) : '';
    const body = action === 'cash' ? t('剩餘 {0} 換錢 {1}，列入下一期薪資加項。', [at(s.remaining), ntd(due.cashAll)])
      : action === 'defer' ? t('本期剩餘 {0} 延長一年。', [at(s.currentRemaining)]) + deferPart
      : t('本期剩餘 {0} 歸零。注意：可能違反勞基法 §38 第 4 項，需公司全體同意。', [at(s.currentRemaining)]) + deferPart;
    const ok = await confirm({ title: t('{0}：{1}', [e.name, actionText(action)]), body, ok: t('確認{0}', [actionText(action)]), danger: action === 'zero' });
    if (ok) await run(() => src.settle(e.id, p.start, action, today), t('已處理 {0} 的特休：{1}', [e.name, actionText(action)]));
  };

  return (
    <div className="stack" style={{ padding: 18, borderRadius: 14, background: 'var(--raised)', border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <a className="av" href={`#/employees/${e.id}`} style={{ textDecoration: 'none', color: 'var(--text)' }}>{e.name[0]}</a>
        <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', lineHeight: 1.4 }}>
          <b>{title}</b>
          <span className="muted" style={{ fontSize: 13 }}>
            {tr('週年期間 {0}～{1} · 剩 {2}', [p.start, p.last, <b className="num" style={{ color: 'var(--text)' }}><Annual h={s.remaining} /></b>])}
            {s.deferredRemaining > 0 && tr('（其中遞延 {0}，只能換錢）', [<Annual h={s.deferredRemaining} />])}
          </span>
        </div>
        <span className={left <= 14 ? 'tag warn' : 'tag'}>{p.last} {left < 0 ? t('已到期') : t('到期')}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {due.actions.map((a) => (
          <button key={a} type="button" className={a === 'cash' ? 'btn sm primary' : 'btn sm'} onClick={() => act(a)} disabled={src.readOnly}>
            {a === 'cash' ? t('換錢 {0}', [ntd(due.cashAll)]) : actionText(a)}
          </button>
        ))}
        <span className="muted small">{t('換錢＝剩餘時數 × 處理當下本薪 ÷ 30 ÷ 8')}</span>
      </div>
    </div>
  );
}
