// 員工主檔（規格第 9 節）
import { useMemo, useState } from 'react';
import { Modal, go, useApp } from '../ui/app-context';
import { Icon } from '../ui/icons';
import { downloadCsv, fmtHours, money } from '../ui/format';
import { SETTLE_LABEL, annualNow, settlementFor } from '../ui/derive';
import { asOfDate, checkEmployee, daysBetween, isEmployedOn, seniorityText, type Employee, type EmployeeInput } from '../rules/rules';

type Filter = 'active' | 'left' | 'all';
type Sort = 'expiry' | 'hire' | 'name';

export function EmployeesPage() {
  const { st, today, src } = useApp();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('active');
  const [sort, setSort] = useState<Sort>('expiry');
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return st.employees
      .map((e) => {
        const active = isEmployedOn(e, today) || e.hireDate > today;
        const a = annualNow(st, e, today);
        const settled = a.period ? settlementFor(st, e.id, a.period.start) : undefined;
        return { e, active, a, settled, exp: a.period?.last ?? '' };
      })
      .filter((r) => (filter === 'all' || (filter === 'active') === r.active))
      .filter((r) => !kw || [r.e.name, r.e.email, r.e.phone].some((s) => s.toLowerCase().includes(kw)))
      .sort((a, b) => sort === 'name' ? a.e.name.localeCompare(b.e.name, 'zh-Hant')
        : sort === 'hire' ? a.e.hireDate.localeCompare(b.e.hireDate)
        : (a.exp || '9999').localeCompare(b.exp || '9999'));
  }, [st, today, q, filter, sort]);

  const activeCount = st.employees.filter((e) => isEmployedOn(e, today)).length;
  const soon = rows.filter((r) => r.active && r.exp && !r.settled && daysBetween(today, r.exp) <= 30 && r.a.remaining > 0).length;

  const exportCsv = () => downloadCsv(`員工主檔_${today}.csv`, [
    ['姓名', '性別', '月本薪', '到職日', '特休年資起算日', '離職日', '信箱', '電話', '年資', '特休額度(h)', '特休已休(h)', '特休剩餘(h)', '週年到期'],
    ...rows.map(({ e, a }) => [e.name, e.gender === 'F' ? '女' : '男', e.salary, e.hireDate, e.annualBaseDate, e.leaveDate ?? '', e.email, e.phone,
      seniorityText(e.annualBaseDate, asOfDate(e, today)), a.entitled + a.deferred, a.used, a.remaining, a.period?.last ?? '']),
  ]);

  return (
    <div className="page">
      <div className="page-head">
        <div className="title">
          <h1>員工主檔</h1>
          <span className="muted">在職 {activeCount} 人 · 離職 {st.employees.length - activeCount} 人{soon ? ` · 特休 ${soon} 人即將到期` : ''}</span>
        </div>
        <button type="button" className="btn" onClick={exportCsv}><Icon name="download" size={18} />匯出 CSV</button>
        <button type="button" className="btn primary" onClick={() => setEditing('new')} disabled={src.readOnly}><Icon name="plus" size={18} stroke={2} />新增員工</button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ flex: '1 1 260px', position: 'relative', display: 'flex' }}>
          <span className="sr-only">搜尋員工</span>
          <input className="input" placeholder="搜尋姓名、信箱或電話" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 40 }} />
          <Icon name="search" size={18} stroke={1.8} style={{ position: 'absolute', left: 13, top: 13, color: 'var(--muted)' }} />
        </label>
        <div role="group" aria-label="狀態" className="seg">
          {(['active', 'left', 'all'] as Filter[]).map((f) => (
            <button key={f} type="button" className={filter === f ? 'btn sm on' : 'btn sm'} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {{ active: '在職', left: '離職', all: '全部' }[f]}
            </button>
          ))}
        </div>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>排序
          <select className="input" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="expiry">特休到期日</option><option value="hire">到職日</option><option value="name">姓名</option>
          </select>
        </label>
      </div>

      <div className="card table-box">
        {rows.length === 0 ? <div className="empty">{st.employees.length ? '沒有符合的員工。' : '還沒有員工，按「新增員工」開始。'}</div> : (
          <table className="tbl">
            <thead><tr><th>員工</th><th>到職日</th><th>年資</th><th className="r">月本薪</th><th style={{ minWidth: 220 }}>特休（本週年）</th><th>週年到期</th></tr></thead>
            <tbody>
              {rows.map(({ e, active, a, settled }) => {
                const total = a.entitled + a.deferred;
                const left = a.period ? daysBetween(today, a.period.last) : null;
                return (
                  <tr key={e.id} className={active ? 'click' : 'click off'} onClick={() => go(`#/employees/${e.id}`)}>
                    <td>
                      <a href={`#/employees/${e.id}`} onClick={(ev) => ev.stopPropagation()} style={{ display: 'flex', gap: 12, alignItems: 'center', color: 'inherit', textDecoration: 'none' }}>
                        <span className="av">{e.name[0]}</span>
                        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
                          <b>{e.name} <span className="muted" style={{ fontWeight: 600, fontSize: 12 }}>{e.gender === 'F' ? '女' : '男'}</span></b>
                          <span className="muted small">{e.email || e.phone || '—'}</span>
                        </span>
                      </a>
                    </td>
                    <td className="num">{e.hireDate}</td>
                    <td className="num">{e.leaveDate && e.leaveDate < today ? `已離職 ${e.leaveDate}` : seniorityText(e.annualBaseDate, today)}</td>
                    <td className="r">{money(e.salary)}</td>
                    <td>
                      {a.period ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                            <span className="muted num">已休 {fmtHours(a.used)} / {fmtHours(total)} h</span><b className="num">剩 {fmtHours(a.remaining)} h</b>
                          </div>
                          <div className="bar"><span style={{ width: `${total ? (a.used / total) * 100 : 0}%` }} /></div>
                        </div>
                      ) : <span className="muted small">未滿 6 個月</span>}
                    </td>
                    <td>{!a.period ? '—'
                      : settled ? <span className="tag">{a.period.last} {SETTLE_LABEL[settled.action]}</span>
                      : active && left != null && left <= 30 && a.remaining > 0 ? <span className="tag warn">{a.period.last} 即將到期</span>
                      : <span className="num">{a.period.last}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted small" style={{ margin: 0 }}>年資與特休依勞基法 §38 週年制自動計算，從特休年資起算日算起；特休額度＝日數 × 8 h（含上期遞延）。</p>
      {editing && <EmployeeDialog emp={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function EmployeeDialog({ emp, onClose }: { emp: Employee | null; onClose: () => void }) {
  const { st, src, run } = useApp();
  const [f, setF] = useState<EmployeeInput>(() => ({
    name: emp?.name ?? '', gender: emp?.gender ?? '', salary: emp?.salary ?? '', hireDate: emp?.hireDate ?? '',
    annualBaseDate: emp && emp.annualBaseDate !== emp.hireDate ? emp.annualBaseDate : '', leaveDate: emp?.leaveDate ?? '',
    email: emp?.email ?? '', phone: emp?.phone ?? '',
  }));
  const [error, setError] = useState('');
  const set = (k: keyof EmployeeInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((o) => ({ ...o, [k]: e.target.value }));
  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const c = checkEmployee(f, st.leaves, emp?.id);
    if (!c.ok) { setError(c.error); return; }
    const id = await run(() => src.saveEmployee(f, emp?.id), emp ? '已儲存員工資料' : '已新增員工');
    if (id != null) onClose();
  };
  return (
    <Modal label={emp ? '編輯員工' : '新增員工'} onClose={onClose}>
      <form className="dlg-body" onSubmit={save}>
        <h2>{emp ? `編輯員工 · ${emp.name}` : '新增員工'}</h2>
        <div className="form-grid">
          <label className="field">姓名 *<input className="input" value={f.name} onChange={set('name')} required autoFocus /></label>
          <label className="field">性別 *
            <select className="input" value={f.gender} onChange={set('gender')} required>
              <option value="">請選擇</option><option value="M">男</option><option value="F">女</option>
            </select>
          </label>
          <label className="field">月本薪 *<input className="input" type="number" min={1} step={1} value={f.salary} onChange={set('salary')} required /></label>
          <label className="field">到職日 *<input className="input" type="date" value={f.hireDate} onChange={set('hireDate')} required /></label>
          <label className="field">特休年資起算日<input className="input" type="date" value={f.annualBaseDate} onChange={set('annualBaseDate')} />
            <span className="small" style={{ fontWeight: 500 }}>空白＝與到職日相同</span></label>
          <label className="field">離職日<input className="input" type="date" value={f.leaveDate} onChange={set('leaveDate')} /></label>
          <label className="field">信箱<input className="input" type="email" value={f.email} onChange={set('email')} /></label>
          <label className="field">電話<input className="input" value={f.phone} onChange={set('phone')} /></label>
        </div>
        {error && <div role="alert" className="alert bad">{error}</div>}
        <div className="dlg-actions">
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button type="submit" className="btn primary">儲存</button>
        </div>
      </form>
    </Modal>
  );
}
