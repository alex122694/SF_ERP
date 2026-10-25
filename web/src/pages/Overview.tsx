// 請假總覽（規格第 11 節）：每位員工一組，假別、時數、扣款逐列；姓名、本薪、總扣款金額跨列合併
// 區間有兩種：月結區間（上月 23 日 ~ 本月 22 日）與指定區間；畫面與匯出 Excel 用同一個區間
import { useState } from 'react';
import { Modal, go, useApp } from '../ui/app-context';
import { Icon } from '../ui/icons';
import { Annual, LeaveAmount } from '../ui/annual-unit';
import { amountText, downloadBlob, fmtHours, mdText, money, ntd, typeColor, typeName } from '../ui/format';
import { typeOf } from '../ui/derive';
import { isDateStr, settlementMonthOf, settlementRange, sumDeduction, totalDeduction, type Employee, type LeaveRecord, type LeaveType } from '../rules/rules';
import { buildXlsx, XLSX_TYPE } from '../data/xlsxWrite';
import { t } from '../i18n';

export function OverviewPage() {
  const { st, today, route } = useApp();
  const cur = settlementMonthOf(today);
  const years = [...new Set([cur.year, ...st.calendarYears.map((c) => c.year), ...st.leaves.map((l) => settlementMonthOf(l.date).year)])].sort((a, b) => b - a);
  const mode = route.q.get('mode') === 'custom' ? 'custom' : 'period';
  const year = Number(route.q.get('y')) || cur.year;
  const monthQ = route.q.get('m');
  const month = monthQ === 'all' ? 0 : Number(monthQ) || cur.month;
  const open = Number(route.q.get('open')) || 0;
  const periodRange = settlementRange(year, month);
  const fromQ = route.q.get('from'), toQ = route.q.get('to');
  const { from, to } = mode === 'custom'
    ? { from: fromQ && isDateStr(fromQ) ? fromQ : settlementRange(cur.year, cur.month).from, to: toQ && isDateStr(toQ) ? toQ : settlementRange(cur.year, cur.month).to }
    : periodRange;
  const rangeOk = from <= to;
  const nav = (patch: Record<string, string | number>) => {
    const q = new URLSearchParams({ mode, y: String(year), m: month ? String(month) : 'all', from, to });
    if (open) q.set('open', String(open));
    for (const [k, v] of Object.entries(patch)) q.set(k, String(v));
    if (q.get('open') === '0') q.delete('open');
    go(`#/overview?${q}`);
  };
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

  const recs = rangeOk ? st.leaves.filter((l) => l.date >= from && l.date <= to) : [];
  const types = st.leaveTypes;
  const sumOf = (list: typeof recs, code: string) => list.filter((l) => l.type === code).reduce((s, l) => s + l.hours, 0);
  const show = (code: string, h: number) => (code === 'late' ? String(Math.round(h * 60)) : fmtHours(h));

  const rows = (rangeOk ? st.employees : [])
    .filter((e) => recs.some((l) => l.employeeId === e.id) || (e.hireDate <= to && (!e.leaveDate || e.leaveDate >= from)))
    .map((e) => {
      const mine = recs.filter((l) => l.employeeId === e.id);
      // 這段期間有請的假別，依假別排序
      const parts = types
        .map((tp) => ({ tp, list: mine.filter((l) => l.type === tp.code) }))
        .filter((x) => x.list.length)
        .map(({ tp, list }) => ({ tp, hours: list.reduce((s, l) => s + l.hours, 0), ded: sumDeduction(list.map((l) => l.deduction)) }));
      return { e, mine, parts, ded: totalDeduction(mine) };
    });
  const totals = types.map((tp) => sumOf(recs, tp.code));
  const dedTotal = totalDeduction(rows.flatMap((r) => r.mine));
  const genderText = (g: string) => (g === 'F' ? t('女') : t('男'));
  const partHours = (tp: LeaveType, hours: number) => amountText({ type: tp.code, hours });

  // 匯出 Excel：一位員工一列，假別、時數、扣款金額在同一格內分行對齊；全部置中，列高依行數最多的一格
  // 只有一行時保留數字，Excel 才能加總
  const lines = (r: (typeof rows)[number], f: (p: (typeof r.parts)[number]) => string | number) =>
    (r.parts.length === 1 ? f(r.parts[0]) : r.parts.map(f).join('\n'));
  const exportXlsx = (sel: typeof rows) => {
    const sheet = t('請假總覽');
    const selDed = totalDeduction(sel.flatMap((r) => r.mine));
    const rowsOut = [
      [t('姓名'), t('性別'), t('本薪'), t('假別'), t('時數'), t('扣款金額'), t('總扣款金額'), t('實領')],
      ...sel.map((r) => [
        r.e.name, genderText(r.e.gender), r.e.salary,
        lines(r, (p) => typeName(p.tp)), lines(r, (p) => partHours(p.tp, p.hours)), lines(r, (p) => p.ded), r.ded, r.e.salary - r.ded,
      ]),
      [t('合計 {0} 人', [sel.length]), '', '', '', '', selDed, selDed, sel.reduce((n, x) => n + x.e.salary - x.ded, 0)],
    ];
    const bytes = buildXlsx(sheet, { rows: rowsOut, widths: [14, 8, 12, 14, 12, 12, 14, 12], boldRows: [0, rowsOut.length - 1] });
    downloadBlob(`${sheet}_${from}~${to}.xlsx`, new Blob([bytes], { type: XLSX_TYPE }));
  };
  // 請假明細總覽：一筆紀錄一列（姓名、部門、日期、假別、時間、時數），依員工、日期排序；同一人有多列時姓名、部門合併儲存格
  const exportDetail = (sel: typeof rows) => {
    const sheet = t('請假明細總覽');
    const deptOf = (id: number | null) => st.departments.find((d) => d.id === id)?.name ?? '';
    const list = sel.flatMap((r) => r.mine.map((l) => ({ r, l })));
    const merges: { row: number; col: number; rows: number }[] = [];
    let at = 1;
    for (const r of sel) {
      if (r.mine.length > 1) merges.push({ row: at, col: 0, rows: r.mine.length }, { row: at, col: 1, rows: r.mine.length });
      at += r.mine.length;
    }
    const rowsOut = [
      [t('姓名'), t('部門'), t('日期'), t('假別'), t('時間'), t('時數')],
      ...list.map(({ r, l }) => [r.e.name, deptOf(r.e.departmentId), l.date, typeName(typeOf(st, l.type)), `${l.start}–${l.end}`, amountText(l)]),
      [t('合計 {0} 筆', [list.length]), '', '', '', '', ''],
    ];
    const bytes = buildXlsx(sheet, { rows: rowsOut, widths: [14, 14, 14, 12, 14, 12], boldRows: [0, rowsOut.length - 1], merges });
    downloadBlob(`${sheet}_${from}~${to}.xlsx`, new Blob([bytes], { type: XLSX_TYPE }));
  };
  const [exporting, setExporting] = useState(false);

  return (
    <div className="page">
      <div className="page-head">
        <h1 style={{ flex: '1 1 240px' }}>{t('請假總覽')}</h1>
        <div role="group" aria-label={t('區間方式')} className="seg">
          <button type="button" className={mode === 'period' ? 'btn sm on' : 'btn sm'} aria-pressed={mode === 'period'} onClick={() => nav({ mode: 'period' })}>{t('月結區間')}</button>
          <button type="button" className={mode === 'custom' ? 'btn sm on' : 'btn sm'} aria-pressed={mode === 'custom'} onClick={() => nav({ mode: 'custom', from: periodRange.from, to: periodRange.to })}>{t('指定區間')}</button>
        </div>
        {mode === 'period' ? <>
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>{t('年度')}
            <select className="input" style={{ width: 'auto' }} value={year} onChange={(e) => nav({ y: e.target.value })}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>{t('月份')}
            <select className="input" style={{ width: 'auto' }} value={month || 'all'} onChange={(e) => nav({ m: e.target.value })}>
              <option value="all">{t('全年')}</option>
              {Array.from({ length: 12 }, (_, i) => {
                const r = settlementRange(year, i + 1);
                return <option key={i} value={i + 1}>{t('{0} 月（{1}～{2}）', [i + 1, md(r.from), md(r.to)])}</option>;
              })}
            </select>
          </label>
        </> : <>
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>{t('起日')}
            <input className="input" type="date" style={{ width: 'auto' }} value={from} onChange={(e) => nav({ from: e.target.value })} />
          </label>
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>{t('迄日')}
            <input className="input" type="date" style={{ width: 'auto' }} value={to} onChange={(e) => nav({ to: e.target.value })} />
          </label>
        </>}
        <button type="button" className="btn primary" onClick={() => setExporting(true)} disabled={!rangeOk}><Icon name="download" size={18} stroke={1.8} />{t('匯出 Excel')}</button>
      </div>

      {rangeOk
        ? <span className="muted num" style={{ fontSize: 13, fontWeight: 700 }}>{t('區間：{0} ～ {1}', [from, to])}</span>
        : <div className="alert warn">{t('起日不能晚於迄日。')}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: 12 }}>
        {types.map((tp, i) => (
          <div key={tp.code} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}><span className="dot" style={{ background: typeColor(tp) }} />{typeName(tp)}</span>
            <b className="num" style={{ fontSize: 24 }}>{tp.code === 'annual' ? <Annual h={totals[i]} /> : `${show(tp.code, totals[i])} ${tp.code === 'late' ? t('分') : 'h'}`}</b>
          </div>
        ))}
      </div>

      <div className="card table-box">
        {rows.length === 0 ? <div className="empty">{t('這段期間沒有員工資料。')}</div> : (
          <table className="tbl ov">
            <thead>
              <tr>
                <th>{t('姓名')}</th><th className="r">{t('本薪')}</th><th>{t('假別')}</th>
                <th className="r">{t('時數')}</th><th className="r">{t('扣款金額')}</th><th className="r">{t('總扣款金額')}</th>
              </tr>
            </thead>
            {rows.map((r) => {
              const isOpen = open === r.e.id;
              const span = Math.max(1, r.parts.length);
              const toggle = () => nav({ open: isOpen ? 0 : r.e.id });
              const lines = r.parts.length ? r.parts : [null];
              return (
                <tbody key={r.e.id} className={`grp ${r.e.gender === 'F' ? 'f' : 'm'}${isOpen ? ' open' : ''}`}>
                  {lines.map((p, i) => (
                    <tr key={p?.tp.code ?? 'none'} className="click" onClick={toggle} aria-expanded={i === 0 ? isOpen : undefined}>
                      {i === 0 && <>
                        <td rowSpan={span} className="merged">
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Icon name="right" size={14} stroke={2} style={{ transform: isOpen ? 'rotate(90deg)' : undefined, color: isOpen ? 'var(--accent)' : 'var(--muted)' }} />
                            <span className="av sm">{r.e.name[0]}</span>
                            <b>{r.e.name}</b>
                            <span className="sr-only">{genderText(r.e.gender)}</span>
                          </span>
                        </td>
                        <td rowSpan={span} className="r merged">{money(r.e.salary)}</td>
                      </>}
                      {p ? <>
                        <td className="sub"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ background: typeColor(p.tp) }} />{typeName(p.tp)}</span></td>
                        <td className="r sub">{p.tp.code === 'annual' ? <Annual h={p.hours} /> : partHours(p.tp, p.hours)}</td>
                        <td className={p.ded ? 'r sub' : 'r sub zero'}>{money(p.ded)}</td>
                      </> : <td colSpan={3} className="sub zero">{t('這段期間沒有紀錄。')}</td>}
                      {i === 0 && <td rowSpan={span} className="r merged"><b>{ntd(r.ded)}</b></td>}
                    </tr>
                  ))}
                  {isOpen && r.mine.length > 0 && (
                    <tr className="detail">
                      <td colSpan={6} style={{ padding: '4px 16px 16px 60px', background: 'var(--accent-soft)', whiteSpace: 'normal' }}>
                        <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead><tr>{[t('日期'), t('假別'), t('時間'), t('時數'), t('扣除'), t('理由')].map((h) => <th key={h} style={{ textAlign: 'left', padding: '6px 16px 6px 0', color: 'var(--muted)' }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {r.mine.map((l) => {
                              const tp = typeOf(st, l.type);
                              return (
                                <tr key={l.id}>
                                  <td style={{ padding: '4px 16px 4px 0' }} className="num">{mdText(l.date)}</td>
                                  <td style={{ padding: '4px 16px 4px 0' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ background: typeColor(tp) }} />{typeName(tp)}</span></td>
                                  <td style={{ padding: '4px 16px 4px 0' }} className="muted num">{l.start}–{l.end}</td>
                                  <td style={{ padding: '4px 16px 4px 0' }} className="num"><LeaveAmount rec={l} /></td>
                                  <td style={{ padding: '4px 16px 4px 0' }} className="num">{money(l.deduction)}</td>
                                  <td style={{ padding: '4px 0' }} className="muted">{l.reason || '—'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })}
            <tfoot>
              <tr>
                <td colSpan={5}>{t('合計 {0} 人', [rows.length])}</td>
                <td className="r">{ntd(dedTotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      {exporting && (
        <ExportDialog rows={rows} onClose={() => setExporting(false)}
          onExport={(kind, sel) => { (kind === 'amount' ? exportXlsx : exportDetail)(sel); setExporting(false); }} />
      )}
    </div>
  );
}

type Row = { e: Employee; mine: LeaveRecord[] };

/** 匯出 Excel：選匯出內容（金額試算總覽／請假明細總覽）與對象（全部、勾選部門、勾選人員） */
function ExportDialog<R extends Row>({ rows, onClose, onExport }: { rows: R[]; onClose: () => void; onExport: (kind: 'amount' | 'detail', sel: R[]) => void }) {
  const { st } = useApp();
  const [kind, setKind] = useState<'amount' | 'detail'>('amount');
  const [scope, setScope] = useState<'all' | 'dept' | 'person'>('all');
  const [depts, setDepts] = useState<Set<number>>(new Set()); // 0＝未設定部門
  const [people, setPeople] = useState<Set<number>>(new Set());
  const toggle = <T,>(set: Set<T>, v: T, fn: (s: Set<T>) => void) => { const n = new Set(set); if (!n.delete(v)) n.add(v); fn(n); };

  const deptOf = (r: R) => r.e.departmentId ?? 0;
  const sel = scope === 'all' ? rows : scope === 'dept' ? rows.filter((r) => depts.has(deptOf(r))) : rows.filter((r) => people.has(r.e.id));
  const deptList = [...st.departments.map((d) => ({ id: d.id, name: d.name })), ...(rows.some((r) => deptOf(r) === 0) ? [{ id: 0, name: t('未設定部門') }] : [])]
    .map((d) => ({ ...d, n: rows.filter((r) => deptOf(r) === d.id).length }))
    .filter((d) => d.n > 0);
  const records = sel.reduce((s, r) => s + r.mine.length, 0);
  const radio = <V extends string>(name: string, value: V, cur: V, set: (v: V) => void, label: string, hint?: string) => (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
      <input type="radio" name={name} checked={cur === value} onChange={() => set(value)} style={{ marginTop: 4 }} />
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.4 }}><b>{label}</b>{hint && <span className="muted small">{hint}</span>}</span>
    </label>
  );
  const checks = (items: { id: number; label: string }[], set: Set<number>, fn: (s: Set<number>) => void) => (
    <div className="stack" style={{ gap: 6 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn sm" onClick={() => fn(new Set(items.map((i) => i.id)))}>{t('全選')}</button>
        <button type="button" className="btn sm" onClick={() => fn(new Set())}>{t('清除')}</button>
      </div>
      <div style={{ display: 'flex', gap: '6px 16px', flexWrap: 'wrap', maxHeight: 180, overflow: 'auto' }}>
        {items.map((i) => (
          <label key={i.id} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={set.has(i.id)} onChange={() => toggle(set, i.id, fn)} />{i.label}
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <Modal label={t('匯出 Excel')} onClose={onClose}>
      <div className="dlg-body">
        <h2>{t('匯出 Excel')}</h2>
        <div className="stack" style={{ gap: 10 }}>
          <b>{t('匯出內容')}</b>
          {radio('kind', 'amount', kind, setKind, t('金額試算總覽'), t('每位員工一列：假別、時數、扣款金額與總扣款金額'))}
          {radio('kind', 'detail', kind, setKind, t('請假明細總覽'), t('一筆紀錄一列：姓名、部門、日期、假別、時間、時數'))}
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <b>{t('匯出對象')}</b>
          {radio('scope', 'all', scope, setScope, t('全部員工'))}
          {radio('scope', 'dept', scope, setScope, t('勾選部門'))}
          {scope === 'dept' && (deptList.length ? checks(deptList.map((d) => ({ id: d.id, label: t('{0}（{1} 人）', [d.name, d.n]) })), depts, setDepts) : <span className="muted small">{t('還沒有部門。')}</span>)}
          {radio('scope', 'person', scope, setScope, t('勾選人員'))}
          {scope === 'person' && checks(rows.map((r) => ({ id: r.e.id, label: r.e.name })), people, setPeople)}
        </div>
        <span className="muted small">{t('將匯出 {0} 位員工', [sel.length])}{kind === 'detail' ? t('、{0} 筆紀錄', [records]) : ''}</span>
        <div className="dlg-actions">
          <button type="button" className="btn" onClick={onClose}>{t('取消')}</button>
          <button type="button" className="btn primary" disabled={sel.length === 0} onClick={() => onExport(kind, sel)}><Icon name="download" size={18} stroke={1.8} />{t('匯出')}</button>
        </div>
      </div>
    </Modal>
  );
}
