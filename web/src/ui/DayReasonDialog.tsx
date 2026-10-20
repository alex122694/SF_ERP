// 手動改放假日／上班日：必須填原因，可點快選（快選清單在制度與設定修改）
import { useState } from 'react';
import { Modal, useApp } from './app-context';
import { dayReasons } from './derive';
import { mdText } from './format';
import { t } from '../i18n';

export function DayReasonDialog({ date, holiday, onClose }: { date: string; holiday: boolean; onClose: () => void }) {
  const { st, src, run } = useApp();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const title = holiday ? t('改為放假日') : t('改為上班日');
  const save = async () => {
    setBusy(true);
    const ok = await run(() => src.setDay(date, holiday, reason).then(() => true), holiday ? t('已改為放假日') : t('已改為上班日'));
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal label={title} onClose={onClose}>
      <form className="dlg-body" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) save(); }}>
        <h2>{title} · {mdText(date)}</h2>
        <label className="field">{t('原因（必填）')}
          <input className="input lg" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={100} autoFocus
            placeholder={t('點下方快選，或自己輸入')} />
        </label>
        {dayReasons(st).length > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            <span className="muted small" style={{ fontWeight: 700 }}>{t('快選')}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {dayReasons(st).map((r) => (
                <button key={r} type="button" className={reason === r ? 'btn sm on' : 'btn sm'} aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>
              ))}
            </div>
          </div>
        )}
        <div className="dlg-actions">
          <button type="button" className="btn" onClick={onClose}>{t('取消')}</button>
          <button type="submit" className="btn primary" disabled={!reason.trim() || busy || src.readOnly}>{title}</button>
        </div>
      </form>
    </Modal>
  );
}
