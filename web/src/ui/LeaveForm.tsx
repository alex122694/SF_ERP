// 單一假單：快速登記頁與月曆的編輯視窗共用（規格第 6、7 節）
import { useId, useMemo, useState, type ReactNode } from 'react';
import { useApp } from './app-context';
import { Icon } from './icons';
import { Annual, AnnualNum, AnnualUnit } from './annual-unit';
import { fmtHours, mdText, money, ntd, typeName } from './format';
import { msgText, t, tr } from '../i18n';
import {
  LATE_START, LEAVE_HINT, SEGMENTS, TIME_SLOTS, checkLeave, hourlyRate, isDateStr, isEmployedOn, payText,
  type LeaveInput, type LeaveRecord,
} from '../rules/rules';

interface Props {
  variant: 'page' | 'dialog';
  initial?: Partial<LeaveInput>;
  existing?: LeaveRecord;
  onSaved?: (id: number, input: LeaveInput) => void;
  onCancel?: () => void;
  /** 快速登記頁：送出後是否顯示「送出成功」畫面（false 時由 onSaved 自行跳頁） */
  showDone?: boolean;
  /** 快速登記頁：放在按鈕列右側的東西 */
  footerEnd?: ReactNode;
}

export function LeaveForm({ variant, initial, existing, onSaved, onCancel, showDone = true, footerEnd }: Props) {
  const formId = useId();
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
  const type = st.leaveTypes.find((x) => x.code === f.type);
  const isLate = f.type === 'late';
  const isSegOnly = !!type?.segmentOnly;

  const emps = useMemo(() => st.employees.filter((e) => e.id === existing?.employeeId || (isDateStr(f.date) && isEmployedOn(e, f.date))), [st.employees, f.date, existing]);
  const types = st.leaveTypes.filter((x) => !(x.femaleOnly && emp && emp.gender !== 'F'));

  const check = checkLeave(f, { ...st, calendars: cal }, existing);
  // 還沒選員工或假別只是提示；放假日、額度不足等才用紅色錯誤
  const hint = !check.ok && (check.error === LEAVE_HINT.emp || check.error === LEAVE_HINT.type) ? msgText(check.error) : '';
  const problem = check.ok || hint ? '' : msgText(check.error);
  const segName = SEGMENTS.find((s) => s.start === f.start && s.end === f.end)?.name;
  const timeText = `${f.start}–${f.end}`;
  const amountText = isLate ? t('{0} 分', [check.minutes]) : f.type === 'annual' ? <Annual h={check.hours} /> : `${fmtHours(check.hours)} h`;
  const annualAfter = check.annual ? check.annual.remaining - check.hours : 0;

  const pickType = (code: string) => {
    if (code === 'late') set({ type: code, start: LATE_START, end: f.type === 'late' ? f.end : '09:45' });
    else if (f.type === 'late' || (st.leaveTypes.find((x) => x.code === code)?.segmentOnly && !segName)) set({ type: code, start: '09:30', end: '18:30' });
    else set({ type: code });
  };
  const pickEmp = (v: string) => {
    const id = v ? Number(v) : null;
    const n = st.employees.find((e) => e.id === id);
    set({ employeeId: id, type: n && n.gender !== 'F' && type?.femaleOnly ? '' : f.type });
  };

  const save = async () => {
    setBusy(true);
    const id = await run(() => src.saveLeave(f, existing?.id), variant === 'dialog' ? t('已儲存') : undefined);
    setBusy(false);
    if (id == null) { setStep('form'); return; }
    if (variant === 'page' && showDone) setStep('done');
    onSaved?.(id, f);
  };
  const submit = () => (type?.confirmTwice ? setStep('confirm') : save());
  const again = () => {
    setF({ employeeId: null, date: f.date, type: '', start: '09:30', end: '18:30', reason: '' });
    setStep('form');
  };
  // 快速登記頁的按鈕列：按鈕置中於整張卡片，footerEnd 靠右
  const bar = (center: ReactNode) => (
    <div className="act-bar"><span /><div className="act-center">{center}</div><div className="act-end">{footerEnd}</div></div>
  );

  if (step === 'done') {
    return (
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', padding: '24px 0', gap: 20 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={36} stroke={2} />
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <h2 style={{ fontSize: 24 }}>{t('送出成功')}</h2>
          <span className="muted num" style={{ fontSize: 15 }}>{emp?.name} · {typeName(type)} · {mdText(f.date)} {timeText} · {amountText}</span>
        </div>
        {bar(<>
          <a className="btn" href={`#/attendance?ym=${f.date.slice(0, 7)}&sel=${f.date}`}>{t('到月曆看這天')}</a>
          <button type="button" className="btn primary" onClick={again} autoFocus>{t('再登記一筆')}</button>
        </>)}
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="stack" style={{ gap: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Icon name="warn" size={28} style={{ color: 'var(--warn)' }} />
          <h2 style={{ fontSize: 22 }}>{t('請再確認一次')}</h2>
        </div>
        <div style={{ padding: '4px 20px', borderRadius: 14, background: 'var(--raised)', border: '1px solid var(--line)' }}>
          <div className="kvrow"><span className="muted">{t('員工')}</span><b>{emp?.name}</b></div>
          <div className="kvrow"><span className="muted">{t('日期')}</span><b className="num">{mdText(f.date)}</b></div>
          <div className="kvrow"><span className="muted">{t('假別')}</span><b>{typeName(type)}</b></div>
          <div className="kvrow"><span className="muted">{t('時間')}</span><b className="num">{timeText}</b></div>
          <div className="kvrow"><span className="muted">{t('時數')}</span><b className="num">{amountText}</b></div>
          <div className="kvrow"><span className="muted">{t('扣除金額')}</span><b className="num">{ntd(check.deduction)}</b></div>
          {check.annual && <div className="kvrow"><span className="muted">{t('特休剩餘')}</span><b className="num"><AnnualNum h={check.annual.remaining} /> → <AnnualNum h={annualAfter} /><AnnualUnit n={annualAfter} /></b></div>}
          {f.reason.trim() && <div className="kvrow"><span className="muted">{t('理由')}</span><b>{f.reason.trim()}</b></div>}
        </div>
        {(() => {
          const btns = <>
            <button type="button" className="btn" onClick={() => setStep('form')} disabled={busy}>{t('返回修改')}</button>
            <button type="button" className="btn primary" onClick={save} disabled={busy} style={{ minWidth: 160 }} autoFocus>{t('確認送出')}</button>
          </>;
          return variant === 'page' ? bar(btns) : <div className="dlg-actions">{btns}</div>;
        })()}
      </div>
    );
  }

  const submitBtn = (
    <button type="submit" form={formId} className="btn primary" disabled={!check.ok || busy} style={{ minWidth: 160 }}>
      {type?.confirmTwice ? t('下一步：確認') : existing ? t('儲存') : t('送出')}
    </button>
  );
  const confirmTag = type?.confirmTwice && <span className="tag warn">{t('此假別送出前會再確認一次')}</span>;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="row-wrap" style={{ gap: 24 }}>
        <form id={formId} className="stack" style={{ flex: '3 1 420px', minWidth: 0, gap: 22 }} onSubmit={(e) => { e.preventDefault(); if (check.ok) submit(); }}>
          <div className="form-grid">
            <label className="field">{t('日期')}
              <input className="input lg" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} required />
            </label>
            <label className="field">{t('員工')}
              <select className="input lg" value={f.employeeId ?? ''} onChange={(e) => pickEmp(e.target.value)}>
                <option value="">{t('請選擇員工')}</option>
                {emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
          </div>
          <label className="field">{t('假別')}
            <select className="input lg" value={f.type} onChange={(e) => pickType(e.target.value)}>
              <option value="">{t('請選擇假別')}</option>
              {types.map((x) => <option key={x.code} value={x.code}>{t('{0}（{1}）', [typeName(x), msgText(payText(x.payRatio))])}</option>)}
            </select>
          </label>
  
          {type && !isLate && (
            <div className="stack" style={{ gap: 12 }}>
              <div className="field">{isSegOnly ? t('時段（{0}只能選上午、下午或全天）', [typeName(type)]) : t('時段')}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {SEGMENTS.map((s) => (
                    <button key={s.name} type="button" className={segName === s.name ? 'btn sm on' : 'btn sm'} aria-pressed={segName === s.name}
                      onClick={() => set({ start: s.start, end: s.end })}>{t(s.name)}</button>
                  ))}
                </div>
              </div>
              {!isSegOnly && (
                <div className="form-grid">
                  <label className="field">{t('起')}
                    <select className="input lg" value={f.start} onChange={(e) => set({ start: e.target.value })}>
                      {TIME_SLOTS.slice(0, -1).map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </label>
                  <label className="field">{t('訖')}
                    <select className="input lg" value={f.end} onChange={(e) => set({ end: e.target.value })}>
                      {TIME_SLOTS.slice(1).map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}
          {isLate && (
            <div className="form-grid">
              <label className="field">{t('起（固定）')}<input className="input lg" value={LATE_START} readOnly /></label>
              <label className="field">{t('實際到班時間（最晚 10:00）')}
                <input className="input lg" type="time" min="09:31" max="10:00" value={f.end} onChange={(e) => set({ end: e.target.value })} />
              </label>
            </div>
          )}
  
          <label className="field">{t('理由（選填）')}
            <input className="input lg" placeholder={t('例如：家中有事、看診')} value={f.reason} onChange={(e) => set({ reason: e.target.value })} maxLength={200} />
          </label>
  
          {problem && <div role="alert" className="alert bad">{problem}</div>}
          {hint && <div className="muted" style={{ fontSize: 13 }}>{hint}</div>}
  
          {variant === 'dialog' && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--line)' }}>
              {confirmTag}
              <span className="spacer" />
              {onCancel && <button type="button" className="btn" onClick={onCancel}>{t('取消')}</button>}
              {submitBtn}
            </div>
          )}
        </form>
  
        <aside className="card" aria-label={t('即時試算')} style={{ flex: '1 1 260px', minWidth: 0, padding: 22, display: 'flex', flexDirection: 'column', gap: 4, background: variant === 'dialog' ? 'var(--raised)' : undefined }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>{t('即時試算')}</h2>
          <div className="kvrow"><span className="muted">{t('時數')}</span><b className="num">{type ? amountText : '—'}</b></div>
          <div className="kvrow"><span className="muted">{t('時薪（本薪 ÷ 30 ÷ 8）')}</span><b className="num">{emp ? `NT$ ${hourlyRate(check.salary).toFixed(1)}` : '—'}</b></div>
          <div className="kvrow"><span className="muted">{t('給薪比例')}</span><b className="num">{type ? `${Math.round(type.payRatio * 100)}%` : '—'}</b></div>
          <div className="kvrow"><span className="muted">{t('扣除金額')}</span><b className="num" style={{ fontSize: 20, color: 'var(--accent)' }}>NT$ {money(check.deduction)}</b></div>
          {check.annual?.period && (
            <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: 'var(--solid)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>{t('特休剩餘')}</span>
              <b className="num" style={{ fontSize: 18 }}><AnnualNum h={check.annual.remaining} /> → <AnnualNum h={Math.max(0, annualAfter)} /><AnnualUnit n={Math.max(0, annualAfter)} /></b>
              <div className="bar" style={{ height: 8 }}><span style={{ width: `${Math.max(0, Math.min(100, (annualAfter / (check.annual.entitled + check.annual.deferred)) * 100))}%` }} /></div>
              {check.annual.deferred > 0 && <span className="muted small">{tr('含上期遞延 {0}（先扣）', [<Annual h={check.annual.deferredRemaining} />])}</span>}
            </div>
          )}
          <p className="muted small" style={{ margin: '12px 0 0' }}>{t('扣除金額 = 時數 × 時薪 × (1 − 給薪比例)，四捨五入到整數元。')}</p>
        </aside>
      </div>
      {variant === 'page' && bar(<div className="stack" style={{ alignItems: 'center', gap: 10 }}>{confirmTag}{submitBtn}</div>)}
    </div>
  );
}
