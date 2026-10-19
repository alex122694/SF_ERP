// 請假總覽（規格第 11 節）
import { Fragment } from 'react';
import { go, useApp } from '../ui/app-context';
import { Icon } from '../ui/icons';
import { amountText, downloadCsv, fmtHours, mdText, money, ntd, typeColor } from '../ui/format';
import { annualNow, typeOf } from '../ui/derive';
import { daysInMonth } from '../rules/rules';

export function OverviewPage() {
  const { st, today, route } = useApp();
  const years = [...new Set([Number(today.slice(0, 4)), ...st.calendarYears.map((c) => c.year), ...st.leaves.map((l) => Number(l.date.slice(0, 4)))])].sort((a, b) => b - a);
  const year = Number(route.q.get('y')) || Number(today.slice(0, 4));
  const monthQ = route.q.get('m');
  const month = monthQ === 'all' ? 0 : Number(monthQ) || Number(today.slice(5, 7));
  const open = Number(route.q.get('open')) || 0;
  const nav = (patch: Record<string, string | number>) => {
    const q = new URLSearchParams({ y: String(year), m: month ? String(month) : 'all' });
    if (open) q.set('open', String(open));
    for (const [k, v] of Object.entries(patch)) q.set(k, String(v));
    if (q.get('open') === '0') q.delete('open');
    go(`#/overview?${q}`);
  };

  const prefix = month ? `${year}-${String(month).padStart(2, '0')}` : String(year);
  const from = month ? `${prefix}-01` : `${year}-01-01`;
  const to = month ? `${prefix}-${daysInMonth(year, month)}` : `${year}-12-31`;
  const recs = st.leaves.filter((l) => l.date.startsWith(prefix));
  const types = st.leaveTypes;
  const sumOf = (list: typeof recs, code: string) => list.filter((l) => l.type === code).reduce((s, l) => s + l.hours, 0);
  const show = (code: string, h: number) => (code === 'late' ? String(Math.round(h * 60)) : fmtHours(h));

  const rows = st.employees
    .filter((e) => recs.some((l) => l.employeeId === e.id) || (e.hireDate <= to && (!e.leaveDate || e.leaveDate >= from)))
    .map((e) => {
      const mine = recs.filter((l) => l.employeeId === e.id);
      return { e, mine, by: types.map((t) => sumOf(mine, t.code)), ded: mine.reduce((s, l) => s + l.deduction, 0), left: annualNow(st, e, today).remaining };
    });
  const totals = types.map((t) => sumOf(recs, t.code));
  const dedTotal = rows.reduce((s, r) => s + r.ded, 0);
  const maxH = Math.max(1, ...rows.map((r) => r.by.reduce((s, h, i) => s + (types[i].code === 'late' ? 0 : h), 0)));

  const exportCsv = () => downloadCsv(`請假總覽_${month ? prefix : `${year}全年`}.csv`, [
    ['員工', ...types.map((t) => (t.code === 'late' ? '遲到(分)' : `${t.name}(h)`)), '扣除合計', '特休剩餘(h)'],
    ...rows.map((r) => [r.e.name, ...r.by.map((h, i) => show(types[i].code, h)), r.ded, fmtHours(r.left)]),
    ['合計', ...totals.map((h, i) => show(types[i].code, h)), dedTotal, ''],
  ]);

  return (
    <div className="page">
      <div className="page-head">
        <h1 style={{ flex: '1 1 240px' }}>請假總覽</h1>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>年度
          <select className="input" style={{ width: 'auto' }} value={year} onChange={(e) => nav({ y: e.target.value })}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>月份
          <select className="input" style={{ width: 'auto' }} value={month || 'all'} onChange={(e) => nav({ m: e.target.value })}>
            <option value="all">全年</option>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1} 月</option>)}
          </select>
        </label>
        <button type="button" className="btn primary" onClick={exportCsv}><Icon name="download" size={18} stroke={1.8} />匯出 CSV</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12 }}>
        {types.map((t, i) => (
          <div key={t.code} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}><span className="dot" style={{ background: typeColor(t) }} />{t.name}</span>
            <b className="num" style={{ fontSize: 24 }}>{show(t.code, totals[i])} {t.code === 'late' ? '分' : 'h'}</b>
          </div>
        ))}
      </div>

      <div className="card table-box">
        {rows.length === 0 ? <div className="empty">這段期間沒有員工資料。</div> : (
          <table className="tbl">
            <thead>
              <tr>
                <th>員工</th><th style={{ minWidth: 180 }}>分布</th>
                {types.map((t) => <th key={t.code} className="r">{t.code === 'late' ? '遲到(分)' : `${t.name} h`}</th>)}
                <th className="r">扣除合計</th><th className="r">特休剩餘 h</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = open === r.e.id;
                return (
                  <Fragment key={r.e.id}>
                    <tr className={isOpen ? 'click open' : 'click'} onClick={() => nav({ open: isOpen ? 0 : r.e.id })} aria-expanded={isOpen}>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Icon name="right" size={14} stroke={2} style={{ transform: isOpen ? 'rotate(90deg)' : undefined, color: isOpen ? 'var(--accent)' : 'var(--muted)' }} />
                          <span className="av sm">{r.e.name[0]}</span><b>{r.e.name}</b>
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', background: 'var(--raised)', width: 160 }}>
                          {r.by.map((h, i) => (types[i].code === 'late' || !h ? null : <span key={i} style={{ width: (h / maxH) * 160, background: typeColor(types[i]) }} />))}
                        </div>
                      </td>
                      {r.by.map((h, i) => <td key={i} className={h ? 'r' : 'r zero'}>{h ? show(types[i].code, h) : '—'}</td>)}
                      <td className="r"><b>{ntd(r.ded)}</b></td>
                      <td className="r">{fmtHours(r.left)}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={types.length + 4} style={{ padding: '4px 16px 16px 60px', background: 'var(--accent-soft)', whiteSpace: 'normal' }}>
                          {r.mine.length === 0 ? <span className="muted">這段期間沒有紀錄。</span> : (
                            <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                              <thead><tr>{['日期', '假別', '時間', '時數', '扣除', '理由'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '6px 16px 6px 0', color: 'var(--muted)' }}>{h}</th>)}</tr></thead>
                              <tbody>
                                {r.mine.map((l) => {
                                  const t = typeOf(st, l.type);
                                  return (
                                    <tr key={l.id}>
                                      <td style={{ padding: '4px 16px 4px 0' }} className="num">{mdText(l.date)}</td>
                                      <td style={{ padding: '4px 16px 4px 0' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ background: typeColor(t) }} />{t?.name}</span></td>
                                      <td style={{ padding: '4px 16px 4px 0' }} className="muted num">{l.start}–{l.end}</td>
                                      <td style={{ padding: '4px 16px 4px 0' }} className="num">{amountText(l)}</td>
                                      <td style={{ padding: '4px 16px 4px 0' }} className="num">{money(l.deduction)}</td>
                                      <td style={{ padding: '4px 0' }} className="muted">{l.reason || '—'}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>合計 {rows.length} 人</td><td />
                {totals.map((h, i) => <td key={i} className="r">{show(types[i].code, h)}</td>)}
                <td className="r">{ntd(dedTotal)}</td><td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      <p className="muted small" style={{ margin: 0 }}>點一下員工列可展開明細。CSV 以 UTF-8 BOM 輸出，Excel 直接開啟不會亂碼；遲到欄名為「遲到(分)」。</p>
    </div>
  );
}
