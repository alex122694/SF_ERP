// 出缺勤月曆（規格第 7 節）
import { useState } from 'react';
import { go, Modal, useApp } from '../ui/app-context';
import { LeaveForm } from '../ui/LeaveForm';
import { Icon } from '../ui/icons';
import { LeaveAmount, useAnnualUnit } from '../ui/annual-unit';
import { amountText, mdText, ntd, typeColor, typeName, typeShort, typeTint, weekdayName, ymText } from '../ui/format';
import { empOf, typeOf } from '../ui/derive';
import { daysInMonth, isDateStr, weekday, ymd, type LeaveRecord } from '../rules/rules';
import { t } from '../i18n';
import { DayReasonDialog } from '../ui/DayReasonDialog';

export function AttendancePage() {
  const { st, cal, today, route, src, run, confirm } = useApp();
  const unit = useAnnualUnit();
  const ymParam = route.q.get('ym');
  const ym = ymParam && /^\d{4}-\d{2}$/.test(ymParam) ? ymParam : today.slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  const selParam = route.q.get('sel');
  const sel = selParam && isDateStr(selParam) && selParam.startsWith(ym) ? selParam : (today.startsWith(ym) ? today : `${ym}-01`);
  const view = route.q.get('view') === 'mx' ? 'mx' : 'cal';
  const empFilter = Number(route.q.get('emp')) || 0;
  const [editing, setEditing] = useState<LeaveRecord | null>(null);

  const nav = (patch: Record<string, string | number | null>) => {
    const q = new URLSearchParams({ ym, sel, view });
    if (empFilter) q.set('emp', String(empFilter));
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === '' || v === 0) q.delete(k); else q.set(k, String(v)); }
    go(`#/attendance?${q}`);
  };
  const shift = (n: number) => {
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    const nym = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
    nav({ ym: nym, sel: today.startsWith(nym) ? today : `${nym}-01` });
  };

  const yearLoaded = cal.isHoliday(`${ym}-01`) !== undefined;
  const leaves = st.leaves.filter((l) => l.date.startsWith(ym) && (!empFilter || l.employeeId === empFilter));
  const byDate = new Map<string, LeaveRecord[]>();
  for (const l of leaves) byDate.set(l.date, [...(byDate.get(l.date) ?? []), l]);
  const dim = daysInMonth(y, m);
  const lead = (weekday(`${ym}-01`) + 6) % 7;
  const cells = Array.from({ length: Math.ceil((lead + dim) / 7) * 7 }, (_, i) => i - lead + 1);
  const shown = st.employees.filter((e) => (!empFilter || e.id === empFilter) && e.hireDate <= `${ym}-${dim}` && (!e.leaveDate || e.leaveDate >= `${ym}-01`));

  const selList = byDate.get(sel) ?? [];
  const selHoliday = cal.isHoliday(sel);
  const selDay = st.days.get(sel);
  const selOverride = selDay?.override != null;

  const del = async (l: LeaveRecord) => {
    const e = empOf(st, l.employeeId);
    const ok = await confirm({ title: t('刪除這筆紀錄？'), body: `${e?.name} · ${typeName(typeOf(st, l.type))} · ${l.date} ${l.start}–${l.end}`, ok: t('刪除'), danger: true });
    if (ok) await run(() => src.deleteLeave(l.id), t('已刪除'));
  };
  // 改成跟政府日曆不同時要填原因（跳出視窗）；改回跟政府日曆相同等於還原，直接處理
  const [dayTarget, setDayTarget] = useState<boolean | null>(null);
  const setDay = async (holiday: boolean) => {
    if (holiday !== selDay?.gov) { setDayTarget(holiday); return; }
    await run(() => src.setDay(sel, holiday), t('已還原為政府日曆'));
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1 style={{ flex: '1 1 240px' }}>{t('出缺勤月曆')}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" className="btn sm" aria-label={t('上個月')} onClick={() => shift(-1)}><Icon name="left" size={16} stroke={2} /></button>
          <b className="num" style={{ fontSize: 16, padding: '0 8px' }}>{ymText(y, m)}</b>
          <button type="button" className="btn sm" aria-label={t('下個月')} onClick={() => shift(1)}><Icon name="right" size={16} stroke={2} /></button>
          <button type="button" className="btn sm" onClick={() => nav({ ym: today.slice(0, 7), sel: today })}>{t('本月')}</button>
        </div>
        <div role="group" aria-label={t('檢視方式')} className="seg">
          <button type="button" className={view === 'cal' ? 'btn sm on' : 'btn sm'} aria-pressed={view === 'cal'} onClick={() => nav({ view: 'cal' })}>{t('月曆')}</button>
          <button type="button" className={view === 'mx' ? 'btn sm on' : 'btn sm'} aria-pressed={view === 'mx'} onClick={() => nav({ view: 'mx' })}>{t('人員矩陣')}</button>
        </div>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>{t('只看')}
          <select className="input" style={{ width: 'auto' }} value={empFilter} onChange={(e) => nav({ emp: Number(e.target.value) })}>
            <option value={0}>{t('全部員工')}</option>
            {st.employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.leaveDate && e.leaveDate < today ? t('（離職）') : ''}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
        {st.leaveTypes.map((tp) => <span key={tp.code} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ background: typeColor(tp) }} />{typeName(tp)}</span>)}
        <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: 'var(--holiday)', border: '1px solid var(--line)' }} />{t('放假日')}</span>
      </div>

      {!yearLoaded && (
        <div className="alert warn" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="spacer">{t('{0} 年行事曆尚未匯入，匯入前不能登記。', [y])}</span>
          <a className="btn sm" href="#/settings">{t('到制度與設定匯入')}</a>
        </div>
      )}

      <div className="row-wrap">
        <div style={{ flex: '3 1 600px', minWidth: 0 }}>
          {view === 'cal' ? (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="cal-head">{[1, 2, 3, 4, 5, 6, 0].map((d) => <div key={d}>{weekdayName(d)}</div>)}</div>
              <div className="cal">
                {cells.map((d, i) => {
                  if (d < 1 || d > dim) return <div key={i} className="cell blank" />;
                  const date = ymd(y, m, d);
                  const list = byDate.get(date) ?? [];
                  const hol = cal.isHoliday(date);
                  const info = st.days.get(date);
                  const manual = info?.override != null;
                  const people = new Set(list.map((l) => l.employeeId)).size;
                  return (
                    <button key={i} type="button" className={`cell${hol ? ' hol' : ''}${sel === date ? ' sel' : ''}`}
                      aria-label={t('{0} 月 {1} 日，{2}', [m, d, hol ? t('放假日') : t('{0} 筆紀錄', [list.length])])} aria-pressed={sel === date} title={manual && info?.reason ? t('手動：{0}', [info.reason]) : undefined}
                      onClick={() => nav({ sel: date })}>
                      <span className="cell-top">
                        <span className={date === today ? 'day-num today num' : 'day-num num'} style={hol && date !== today ? { color: 'var(--muted)' } : undefined}>{d}</span>
                        <span className="spacer" />
                        {manual && <span className="muted" style={{ fontSize: 11 }}>{t('手動')}</span>}
                        {people > 0 && <span className="tag num" style={{ padding: '0 8px' }}>{t('{0} 人', [people])}</span>}
                        {hol && !manual && <span className="muted" style={{ fontSize: 11 }}>{t('放假')}</span>}
                      </span>
                      {list.slice(0, 3).map((l) => {
                        const tp = typeOf(st, l.type);
                        return <span key={l.id} className="chip" style={{ background: typeTint(tp) }}><span className="dot" style={{ background: typeColor(tp) }} />{empOf(st, l.employeeId)?.name} {typeName(tp)} {amountText(l, unit)}</span>;
                      })}
                      {list.length > 3 && <span className="muted" style={{ fontSize: 12, fontWeight: 700, paddingLeft: 6 }}>{t('還有 {0} 筆', [list.length - 3])}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="card table-box" style={{ padding: 16 }}>
              {shown.length === 0 ? <div className="empty">{t('這個月沒有在職員工。')}</div> : (
                <table className="mx">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>{t('員工')}</th>
                      {Array.from({ length: dim }, (_, i) => {
                        const date = ymd(y, m, i + 1);
                        return <th key={i} style={date === today ? { color: 'var(--accent)' } : undefined}><span className="num">{i + 1}</span><br />{weekdayName(weekday(date))}</th>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((e) => (
                      <tr key={e.id}>
                        <td className="name"><a href={`#/employees/${e.id}`} style={{ color: 'var(--text)', fontWeight: 700, textDecoration: 'none' }}>{e.name}</a></td>
                        {Array.from({ length: dim }, (_, i) => {
                          const date = ymd(y, m, i + 1);
                          const recs = (byDate.get(date) ?? []).filter((l) => l.employeeId === e.id);
                          const tp = recs[0] && typeOf(st, recs[0].type);
                          const title = recs.map((l) => `${typeName(typeOf(st, l.type))} ${amountText(l, unit)}`).join(t('、'));
                          return (
                            <td key={i} className={recs.length ? 'has' : cal.isHoliday(date) ? 'hol' : undefined} title={recs.length ? `${m}/${i + 1} ${title}` : undefined}
                              style={tp ? { background: typeTint(tp), color: typeColor(tp), outline: sel === date ? '2px solid var(--accent)' : undefined } : sel === date ? { outline: '2px solid var(--accent)' } : undefined}
                              onClick={() => nav({ sel: date })}>
                              {tp ? typeShort(tp) + (recs.length > 1 ? '+' : '') : ''}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        <aside className="card pad stack" aria-label={t('當日明細')} style={{ flex: '1 1 300px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 className="spacer">{mdText(sel)}</h2>
            {selOverride && <span className="tag">{t('手動')}</span>}
            {selHoliday ? <span className="tag">{t('放假日')}</span> : <span className="tag num">{t('{0} 筆', [selList.length])}</span>}
          </div>
          {selOverride && <span className="muted small">{t('手動修改原因：{0}', [selDay?.reason || t('（未填）')])}</span>}
          {selHoliday === undefined && <span className="muted">{t('這一年的行事曆尚未匯入。')}</span>}
          {selHoliday && selList.length === 0 && <span className="muted">{t('放假日不能登記。若公司這天要上班，可以改為上班日（會標示「手動」）。')}</span>}
          {selHoliday === false && selList.length === 0 && <span className="muted">{t('這天沒有請假紀錄。')}</span>}
          {selList.map((l) => {
            const e = empOf(st, l.employeeId);
            const tp = typeOf(st, l.type);
            return (
              <div key={l.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, borderRadius: 12, background: 'var(--raised)' }}>
                <div className="av sm">{e?.name[0]}</div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.4 }}>
                  <b>{e?.name} <span style={{ fontWeight: 600, color: typeColor(tp) }}>· {typeName(tp)}</span></b>
                  <span className="muted num" style={{ fontSize: 12 }}>{l.start}–{l.end} · <LeaveAmount rec={l} /> · {t('扣 {0}', [ntd(l.deduction)])}</span>
                  {l.reason && <span className="muted" style={{ fontSize: 12 }}>{l.reason}</span>}
                </div>
                <button type="button" className="btn sm" onClick={() => setEditing(l)} disabled={src.readOnly}>{t('編輯')}</button>
                <button type="button" className="btn sm danger" aria-label={t('刪除 {0} 的紀錄', [e?.name ?? ''])} onClick={() => del(l)} disabled={src.readOnly}>{t('刪除')}</button>
              </div>
            );
          })}
          {selHoliday !== undefined && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 6, borderTop: '1px solid var(--line)' }}>
              {!selHoliday && <a className="btn sm primary" href={`#/quick?date=${sel}`}>{t('＋ 在這天登記')}</a>}
              {selHoliday
                ? <button type="button" className="btn sm" onClick={() => setDay(false)} disabled={src.readOnly}>{t('改為上班日')}</button>
                : <button type="button" className="btn sm" onClick={() => setDay(true)} disabled={src.readOnly}>{t('改為放假日')}</button>}
              {selOverride && <button type="button" className="btn sm" onClick={() => run(() => src.resetDay(sel), t('已還原為政府日曆'))} disabled={src.readOnly}>{t('還原為政府日曆')}</button>}
            </div>
          )}
        </aside>
      </div>

      {dayTarget !== null && <DayReasonDialog date={sel} holiday={dayTarget} onClose={() => setDayTarget(null)} />}
      {editing && (
        <Modal label={t('編輯紀錄')} wide onClose={() => setEditing(null)}>
          <div className="dlg-body">
            <h2>{t('編輯紀錄')}</h2>
            <LeaveForm variant="dialog" existing={editing} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />
          </div>
        </Modal>
      )}
    </div>
  );
}
