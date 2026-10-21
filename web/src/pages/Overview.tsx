// 請假總覽（規格第 11 節）：每位員工一組，假別、時數、扣款逐列；姓名、本薪、總扣款金額跨列合併
// 區間有兩種：月結區間（上月 23 日 ~ 本月 22 日）與指定區間；畫面與匯出 Excel 用同一個區間
import { go, useApp } from '../ui/app-context';
import { Icon } from '../ui/icons';
import { Annual, LeaveAmount } from '../ui/annual-unit';
import { amountText, downloadBlob, fmtHours, mdText, money, ntd, typeColor, typeName } from '../ui/format';
import { typeOf } from '../ui/derive';
import { isDateStr, settlementMonthOf, settlementRange, type LeaveType } from '../rules/rules';
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
        .map(({ tp, list }) => ({ tp, hours: list.reduce((s, l) => s + l.hours, 0), ded: list.reduce((s, l) => s + l.deduction, 0) }));
      return { e, mine, parts, ded: mine.reduce((s, l) => s + l.deduction, 0) };
    });
  const totals = types.map((tp) => sumOf(recs, tp.code));
  const dedTotal = rows.reduce((s, r) => s + r.ded, 0);
  const genderText = (g: string) => (g === 'F' ? t('女') : t('男'));
  const partHours = (tp: LeaveType, hours: number) => amountText({ type: tp.code, hours });

  // 匯出 Excel：一位員工一列，假別、時數、扣款金額在同一格內分行對齊；全部置中，列高依行數最多的一格
  // 只有一行時保留數字，Excel 才能加總
  const lines = (r: (typeof rows)[number], f: (p: (typeof r.parts)[number]) => string | number) =>
    (r.parts.length === 1 ? f(r.parts[0]) : r.parts.map(f).join('\n'));
  const exportXlsx = () => {
    const sheet = t('請假總覽');
    const rowsOut = [
      [t('姓名'), t('性別'), t('本薪'), t('假別'), t('時數'), t('扣款金額'), t('總扣款金額')],
      ...rows.map((r) => [
        r.e.name, genderText(r.e.gender), r.e.salary,
        lines(r, (p) => typeName(p.tp)), lines(r, (p) => partHours(p.tp, p.hours)), lines(r, (p) => p.ded), r.ded,
      ]),
      [t('合計 {0} 人', [rows.length]), '', '', '', '', dedTotal, dedTotal],
    ];
    const bytes = buildXlsx(sheet, { rows: rowsOut, widths: [14, 8, 12, 14, 12, 12, 14], boldRows: [0, rowsOut.length - 1] });
    downloadBlob(`${sheet}_${from}~${to}.xlsx`, new Blob([bytes], { type: XLSX_TYPE }));
  };

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
        <button type="button" className="btn primary" onClick={exportXlsx} disabled={!rangeOk}><Icon name="download" size={18} stroke={1.8} />{t('匯出 Excel')}</button>
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
    </div>
  );
}
