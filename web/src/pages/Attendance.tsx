// 出缺勤月曆（規格第 7 節）
import { useState } from 'react';
import { go, Modal, useApp } from '../ui/app-context';
import { LeaveForm } from '../ui/LeaveForm';
import { Icon } from '../ui/icons';
import { amountText, ntd, typeColor, typeShort, typeTint } from '../ui/format';
import { empOf, typeOf } from '../ui/derive';
import { WEEKDAY_NAMES, daysInMonth, isDateStr, weekday, ymd, type LeaveRecord } from '../rules/rules';

export function AttendancePage() {
  const { st, cal, today, route, src, run, confirm } = useApp();
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
  const selOverride = st.days.get(sel)?.override != null;

  const del = async (l: LeaveRecord) => {
    const e = empOf(st, l.employeeId);
    const ok = await confirm({ title: '刪除這筆紀錄？', body: `${e?.name} · ${typeOf(st, l.type)?.name} · ${l.date} ${l.start}–${l.end}`, ok: '刪除', danger: true });
    if (ok) await run(() => src.deleteLeave(l.id), '已刪除');
  };
  const setDay = async (holiday: boolean) => {
    await run(() => src.setDay(sel, holiday), holiday ? '已改為放假日' : '已改為上班日');
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1 style={{ flex: '1 1 240px' }}>出缺勤月曆</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" className="btn sm" aria-label="上個月" onClick={() => shift(-1)}><Icon name="left" size={16} stroke={2} /></button>
          <b className="num" style={{ fontSize: 16, padding: '0 8px' }}>{y} 年 {m} 月</b>
          <button type="button" className="btn sm" aria-label="下個月" onClick={() => shift(1)}><Icon name="right" size={16} stroke={2} /></button>
          <button type="button" className="btn sm" onClick={() => nav({ ym: today.slice(0, 7), sel: today })}>本月</button>
        </div>
        <div role="group" aria-label="檢視方式" className="seg">
          <button type="button" className={view === 'cal' ? 'btn sm on' : 'btn sm'} aria-pressed={view === 'cal'} onClick={() => nav({ view: 'cal' })}>月曆</button>
          <button type="button" className={view === 'mx' ? 'btn sm on' : 'btn sm'} aria-pressed={view === 'mx'} onClick={() => nav({ view: 'mx' })}>人員矩陣</button>
        </div>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>只看
          <select className="input" style={{ width: 'auto' }} value={empFilter} onChange={(e) => nav({ emp: Number(e.target.value) })}>
            <option value={0}>全部員工</option>
            {st.employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.leaveDate && e.leaveDate < today ? '（離職）' : ''}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
        {st.leaveTypes.map((t) => <span key={t.code} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ background: typeColor(t) }} />{t.name}</span>)}
        <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: 'var(--holiday)', border: '1px solid var(--line)' }} />放假日</span>
      </div>

      {!yearLoaded && (
        <div className="alert warn" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="spacer">{y} 年行事曆尚未匯入，匯入前不能登記。</span>
          <a className="btn sm" href="#/settings">到制度與設定匯入</a>
        </div>
      )}

      <div className="row-wrap">
        <div style={{ flex: '3 1 600px', minWidth: 0 }}>
          {view === 'cal' ? (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="cal-head">{['一', '二', '三', '四', '五', '六', '日'].map((d) => <div key={d}>{d}</div>)}</div>
              <div className="cal">
                {cells.map((d, i) => {
                  if (d < 1 || d > dim) return <div key={i} className="cell blank" />;
                  const date = ymd(y, m, d);
                  const list = byDate.get(date) ?? [];
                  const hol = cal.isHoliday(date);
                  const manual = st.days.get(date)?.override != null;
                  const people = new Set(list.map((l) => l.employeeId)).size;
                  return (
                    <button key={i} type="button" className={`cell${hol ? ' hol' : ''}${sel === date ? ' sel' : ''}`}
                      aria-label={`${m} 月 ${d} 日，${hol ? '放假日' : `${list.length} 筆紀錄`}`} aria-pressed={sel === date}
                      onClick={() => nav({ sel: date })}>
                      <span className="cell-top">
                        <span className={date === today ? 'day-num today num' : 'day-num num'} style={hol && date !== today ? { color: 'var(--muted)' } : undefined}>{d}</span>
                        <span className="spacer" />
                        {manual && <span className="muted" style={{ fontSize: 11 }}>手動</span>}
                        {people > 0 && <span className="tag num" style={{ padding: '0 8px' }}>{people} 人</span>}
                        {hol && !manual && <span className="muted" style={{ fontSize: 11 }}>放假</span>}
                      </span>
                      {list.slice(0, 3).map((l) => {
                        const t = typeOf(st, l.type);
                        return <span key={l.id} className="chip" style={{ background: typeTint(t) }}><span className="dot" style={{ background: typeColor(t) }} />{empOf(st, l.employeeId)?.name} {t?.name} {amountText(l)}</span>;
                      })}
                      {list.length > 3 && <span className="muted" style={{ fontSize: 12, fontWeight: 700, paddingLeft: 6 }}>還有 {list.length - 3} 筆</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="card table-box" style={{ padding: 16 }}>
              {shown.length === 0 ? <div className="empty">這個月沒有在職員工。</div> : (
                <table className="mx">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>員工</th>
                      {Array.from({ length: dim }, (_, i) => {
                        const date = ymd(y, m, i + 1);
                        return <th key={i} style={date === today ? { color: 'var(--accent)' } : undefined}><span className="num">{i + 1}</span><br />{WEEKDAY_NAMES[weekday(date)]}</th>;
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
                          const t = recs[0] && typeOf(st, recs[0].type);
                          const title = recs.map((l) => `${typeOf(st, l.type)?.name} ${amountText(l)}`).join('、');
                          return (
                            <td key={i} className={recs.length ? 'has' : cal.isHoliday(date) ? 'hol' : undefined} title={recs.length ? `${m}/${i + 1} ${title}` : undefined}
                              style={t ? { background: typeTint(t), color: typeColor(t), outline: sel === date ? '2px solid var(--accent)' : undefined } : sel === date ? { outline: '2px solid var(--accent)' } : undefined}
                              onClick={() => nav({ sel: date })}>
                              {t ? typeShort(t) + (recs.length > 1 ? '+' : '') : ''}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="muted small" style={{ margin: '12px 4px 0' }}>格內文字：特＝特休、事＝事假、病＝病假、生＝生理假、公＝公假、遲＝遲到；「+」表示當天不只一筆。點一下格子，右側會列出那天的紀錄。</p>
            </div>
          )}
        </div>

        <aside className="card pad stack" aria-label="當日明細" style={{ flex: '1 1 300px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 className="spacer">{m} 月 {Number(sel.slice(8))} 日（{WEEKDAY_NAMES[weekday(sel)]}）</h2>
            {selOverride && <span className="tag">手動</span>}
            {selHoliday ? <span className="tag">放假日</span> : <span className="tag num">{selList.length} 筆</span>}
          </div>
          {selHoliday === undefined && <span className="muted">這一年的行事曆尚未匯入。</span>}
          {selHoliday && selList.length === 0 && <span className="muted">放假日不能登記。若公司這天要上班，可以改為上班日（會標示「手動」）。</span>}
          {selHoliday === false && selList.length === 0 && <span className="muted">這天沒有請假紀錄。</span>}
          {selList.map((l) => {
            const e = empOf(st, l.employeeId);
            const t = typeOf(st, l.type);
            return (
              <div key={l.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, borderRadius: 12, background: 'var(--raised)' }}>
                <div className="av sm">{e?.name[0]}</div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.4 }}>
                  <b>{e?.name} <span style={{ fontWeight: 600, color: typeColor(t) }}>· {t?.name}</span></b>
                  <span className="muted num" style={{ fontSize: 12 }}>{l.start}–{l.end} · {amountText(l)} · 扣 {ntd(l.deduction)}</span>
                  {l.reason && <span className="muted" style={{ fontSize: 12 }}>{l.reason}</span>}
                </div>
                <button type="button" className="btn sm" onClick={() => setEditing(l)} disabled={src.readOnly}>編輯</button>
                <button type="button" className="btn sm danger" aria-label={`刪除 ${e?.name} 的紀錄`} onClick={() => del(l)} disabled={src.readOnly}>刪除</button>
              </div>
            );
          })}
          {selHoliday !== undefined && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 6, borderTop: '1px solid var(--line)' }}>
              {!selHoliday && <a className="btn sm primary" href={`#/quick?date=${sel}`}>＋ 在這天登記</a>}
              {selHoliday
                ? <button type="button" className="btn sm" onClick={() => setDay(false)} disabled={src.readOnly}>改為上班日</button>
                : <button type="button" className="btn sm" onClick={() => setDay(true)} disabled={src.readOnly}>改為放假日</button>}
              {selOverride && <button type="button" className="btn sm" onClick={() => run(() => src.resetDay(sel), '已還原為政府日曆')} disabled={src.readOnly}>還原為政府日曆</button>}
            </div>
          )}
        </aside>
      </div>

      {editing && (
        <Modal label="編輯紀錄" wide onClose={() => setEditing(null)}>
          <div className="dlg-body">
            <h2>編輯紀錄</h2>
            <LeaveForm variant="dialog" existing={editing} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />
          </div>
        </Modal>
      )}
    </div>
  );
}
