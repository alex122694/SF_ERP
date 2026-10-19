// 單一假單：快速登記頁與月曆的編輯視窗共用（規格第 6、7 節）
import { useMemo, useState } from 'react';
import { useApp } from './app-context';
import { Icon } from './icons';
import { fmtHours, mdText, money, ntd } from './format';
import {
  LATE_START, SEGMENTS, TIME_SLOTS, checkLeave, hourlyRate, isDateStr, isEmployedOn, payText,
  type LeaveInput, type LeaveRecord,
} from '../rules/rules';

interface Props {
  variant: 'page' | 'dialog';
  initial?: Partial<LeaveInput>;
  existing?: LeaveRecord;
  onSaved?: (id: number) => void;
  onCancel?: () => void;
}

export function LeaveForm({ variant, initial, existing, onSaved, onCancel }: Props) {
  const { st, cal, today, src, run } = useApp();
  const [f, setF] = useState<LeaveInput>(() => ({
    employeeId: existing?.employeeId ?? initial?.employeeId ?? null,
    date: existing?.date ?? initial?.date ?? today,
    type: existing?.type ?? initial?.type ?? '',
    start: existing?.start ?? initial?.start ?? '09:30',
    end: existing?.end ?? initial?.end ?? (initial?.type === 'late' ? '09:45' : '18:30'),
    reason: existing?.reason ?? initial?.reason ?? '',
  }));
  const [step, setStep] = useState<'form' | 'confirm' | 'done'>('form');
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<LeaveInput>) => setF((o) => ({ ...o, ...patch }));

  const emp = st.employees.find((e) => e.id === f.employeeId);
  const type = st.leaveTypes.find((t) => t.code === f.type);
  const isLate = f.type === 'late';
  const isSegOnly = !!type?.segmentOnly;

  const emps = useMemo(() => st.employees.filter((e) => e.id === existing?.employeeId || (isDateStr(f.date) && isEmployedOn(e, f.date))), [st.employees, f.date, existing]);
  const types = st.leaveTypes.filter((t) => !(t.femaleOnly && emp && emp.gender !== 'F'));

  const check = checkLeave(f, { ...st, calendars: cal }, existing);
  // 還沒選員工或假別只是提示；放假日、額度不足等才用紅色錯誤
  const hint = !check.ok && (check.error === '請選擇員工' || check.error === '請選擇假別') ? check.error : '';
  const problem = check.ok || hint ? '' : check.error;
  const segName = SEGMENTS.find((s) => s.start === f.start && s.end === f.end)?.name;
  const timeText = `${f.start}–${f.end}`;
  const amountText = isLate ? `${check.minutes} 分` : `${fmtHours(check.hours)} h`;
  const annualAfter = check.annual ? check.annual.remaining - check.hours : 0;

  const pickType = (code: string) => {
    if (code === 'late') set({ type: code, start: LATE_START, end: f.type === 'late' ? f.end : '09:45' });
    else if (f.type === 'late' || (st.leaveTypes.find((t) => t.code === code)?.segmentOnly && !segName)) set({ type: code, start: '09:30', end: '18:30' });
    else set({ type: code });
  };
  const pickEmp = (v: string) => {
    const id = v ? Number(v) : null;
    const n = st.employees.find((e) => e.id === id);
    set({ employeeId: id, type: n && n.gender !== 'F' && type?.femaleOnly ? '' : f.type });
  };

  const save = async () => {
    setBusy(true);
    const id = await run(() => src.saveLeave(f, existing?.id), variant === 'dialog' ? '已儲存' : undefined);
    setBusy(false);
    if (id == null) { setStep('form'); return; }
    if (variant === 'dialog') onSaved?.(id);
    else { setStep('done'); onSaved?.(id); }
  };
  const submit = () => (type?.confirmTwice ? setStep('confirm') : save());
  const again = () => {
    setF({ employeeId: null, date: f.date, type: '', start: '09:30', end: '18:30', reason: '' });
    setStep('form');
  };

  if (step === 'done') {
    return (
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', padding: '24px 0', gap: 20 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={36} stroke={2} />
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <h2 style={{ fontSize: 24 }}>送出成功</h2>
          <span className="muted num" style={{ fontSize: 15 }}>{emp?.name} · {type?.name} · {mdText(f.date)} {timeText} · {amountText}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <a className="btn" href={`#/attendance?ym=${f.date.slice(0, 7)}&sel=${f.date}`}>到月曆看這天</a>
          <button type="button" className="btn primary" onClick={again} autoFocus>再登記一筆</button>
        </div>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="stack" style={{ gap: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Icon name="warn" size={28} style={{ color: 'var(--warn)' }} />
          <h2 style={{ fontSize: 22 }}>請再確認一次</h2>
        </div>
        <div style={{ padding: '4px 20px', borderRadius: 14, background: 'var(--raised)', border: '1px solid var(--line)' }}>
          <div className="kvrow"><span className="muted">員工</span><b>{emp?.name}</b></div>
          <div className="kvrow"><span className="muted">日期</span><b className="num">{mdText(f.date)}</b></div>
          <div className="kvrow"><span className="muted">假別</span><b>{type?.name}</b></div>
          <div className="kvrow"><span className="muted">時間</span><b className="num">{timeText}</b></div>
          <div className="kvrow"><span className="muted">時數</span><b className="num">{amountText}</b></div>
          <div className="kvrow"><span className="muted">扣除金額</span><b className="num">{ntd(check.deduction)}</b></div>
          {check.annual && <div className="kvrow"><span className="muted">特休剩餘</span><b className="num">{fmtHours(check.annual.remaining)} h → {fmtHours(annualAfter)} h</b></div>}
          {f.reason.trim() && <div className="kvrow"><span className="muted">理由</span><b>{f.reason.trim()}</b></div>}
        </div>
        <div className="dlg-actions">
          <button type="button" className="btn" onClick={() => setStep('form')} disabled={busy}>返回修改</button>
          <button type="button" className="btn primary" onClick={save} disabled={busy} style={{ minWidth: 160 }} autoFocus>確認送出</button>
        </div>
      </div>
    );
  }

  return (
    <div className="row-wrap" style={{ gap: 24 }}>
      <form className="stack" style={{ flex: '3 1 420px', minWidth: 0, gap: 22 }} onSubmit={(e) => { e.preventDefault(); if (check.ok) submit(); }}>
        <div className="form-grid">
          <label className="field">日期
            <input className="input lg" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} required />
          </label>
          <label className="field">員工
            <select className="input lg" value={f.employeeId ?? ''} onChange={(e) => pickEmp(e.target.value)}>
              <option value="">請選擇員工</option>
              {emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
        </div>
        <label className="field">假別
          <select className="input lg" value={f.type} onChange={(e) => pickType(e.target.value)}>
            <option value="">請選擇假別</option>
            {types.map((t) => <option key={t.code} value={t.code}>{t.name}（{payText(t.payRatio)}）</option>)}
          </select>
        </label>

        {type && !isLate && (
          <div className="stack" style={{ gap: 12 }}>
            <div className="field">{isSegOnly ? `時段（${type.name}只能選上午、下午或全天）` : '時段'}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {SEGMENTS.map((s) => (
                  <button key={s.name} type="button" className={segName === s.name ? 'btn sm on' : 'btn sm'} aria-pressed={segName === s.name}
                    onClick={() => set({ start: s.start, end: s.end })}>{s.name}</button>
                ))}
              </div>
            </div>
            {!isSegOnly && (
              <div className="form-grid">
                <label className="field">起
                  <select className="input lg" value={f.start} onChange={(e) => set({ start: e.target.value })}>
                    {TIME_SLOTS.slice(0, -1).map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label className="field">訖
                  <select className="input lg" value={f.end} onChange={(e) => set({ end: e.target.value })}>
                    {TIME_SLOTS.slice(1).map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>
        )}
        {isLate && (
          <div className="form-grid">
            <label className="field">起（固定）<input className="input lg" value={LATE_START} readOnly /></label>
            <label className="field">實際到班時間（最晚 10:00）
              <input className="input lg" type="time" min="09:31" max="10:00" value={f.end} onChange={(e) => set({ end: e.target.value })} />
            </label>
          </div>
        )}

        <label className="field">理由（選填）
          <input className="input lg" placeholder="例如：家中有事、看診" value={f.reason} onChange={(e) => set({ reason: e.target.value })} maxLength={200} />
        </label>

        {problem && <div role="alert" className="alert bad">{problem}</div>}
        {hint && <div className="muted" style={{ fontSize: 13 }}>{hint}</div>}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--line)' }}>
          {type?.confirmTwice && <span className="tag warn">此假別送出前會再確認一次</span>}
          <span className="spacer" />
          {onCancel && <button type="button" className="btn" onClick={onCancel}>取消</button>}
          <button type="submit" className="btn primary" disabled={!check.ok || busy} style={{ minWidth: 160 }}>
            {type?.confirmTwice ? '下一步：確認' : existing ? '儲存' : '送出'}
          </button>
        </div>
      </form>

      <aside className="card" aria-label="即時試算" style={{ flex: '1 1 260px', minWidth: 0, padding: 22, display: 'flex', flexDirection: 'column', gap: 4, background: variant === 'dialog' ? 'var(--raised)' : undefined }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>即時試算</h2>
        <div className="kvrow"><span className="muted">時數</span><b className="num">{type ? amountText : '—'}</b></div>
        <div className="kvrow"><span className="muted">時薪（本薪 ÷ 30 ÷ 8）</span><b className="num">{emp ? `NT$ ${hourlyRate(emp.salary).toFixed(1)}` : '—'}</b></div>
        <div className="kvrow"><span className="muted">給薪比例</span><b className="num">{type ? `${Math.round(type.payRatio * 100)}%` : '—'}</b></div>
        <div className="kvrow"><span className="muted">扣除金額</span><b className="num" style={{ fontSize: 20, color: 'var(--accent)' }}>NT$ {money(check.deduction)}</b></div>
        {check.annual?.period && (
          <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: 'var(--solid)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>特休剩餘</span>
            <b className="num" style={{ fontSize: 18 }}>{fmtHours(check.annual.remaining)} h → {fmtHours(Math.max(0, annualAfter))} h</b>
            <div className="bar" style={{ height: 8 }}><span style={{ width: `${Math.max(0, Math.min(100, (annualAfter / (check.annual.entitled + check.annual.deferred)) * 100))}%` }} /></div>
            {check.annual.deferred > 0 && <span className="muted small">含上期遞延 {fmtHours(check.annual.deferredRemaining)} h（先扣）</span>}
          </div>
        )}
        <p className="muted small" style={{ margin: '12px 0 0' }}>扣除金額 = 時數 × 時薪 × (1 − 給薪比例)，四捨五入到整數元。</p>
      </aside>
    </div>
  );
}
