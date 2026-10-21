// 備忘錄：一個自由文字記事本，內容存在 app_setting 的 memo，隨資料檔一起備份；停止輸入 0.8 秒後自動儲存
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../ui/app-context';
import { t } from '../i18n';

const MAX_LEN = 20000;
const DELAY_MS = 800;

export function MemoPage() {
  const { st, src, run } = useApp();
  const saved = st.settings.memo ?? '';
  const [text, setText] = useState(saved);
  const [state, setState] = useState<'saved' | 'dirty' | 'saving'>('saved');
  // 最新的內容與已儲存的內容放在 ref，離開頁面時才能補存
  const latest = useRef(text);
  const lastSaved = useRef(saved);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const flush = async () => {
    clearTimeout(timer.current);
    if (latest.current === lastSaved.current || src.readOnly) return;
    const value = latest.current;
    setState('saving');
    const ok = await run(() => src.setSetting('memo', value).then(() => true));
    if (ok) lastSaved.current = value;
    setState(latest.current === lastSaved.current ? 'saved' : 'dirty');
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const change = (v: string) => {
    latest.current = v;
    setText(v);
    setState('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), DELAY_MS);
  };
  // 離開頁面或關閉分頁前把還沒存的內容存起來
  useEffect(() => {
    const onHide = () => { void flushRef.current(); };
    addEventListener('pagehide', onHide);
    return () => { removeEventListener('pagehide', onHide); void flushRef.current(); };
  }, []);

  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <div className="page-head">
        <h1 style={{ flex: '1 1 240px' }}>{t('備忘錄')}</h1>
        <span className="muted small" role="status">
          {src.readOnly ? t('唯讀') : state === 'saved' ? t('已自動儲存') : state === 'saving' ? t('儲存中…') : t('尚未儲存')}
        </span>
      </div>
      <textarea className="input" aria-label={t('備忘錄')} placeholder={t('在這裡記下要提醒自己的事，停止輸入後會自動儲存。')}
        value={text} maxLength={MAX_LEN} readOnly={src.readOnly} onChange={(e) => change(e.target.value)} onBlur={() => void flush()}
        style={{ minHeight: '60vh', padding: 16, lineHeight: 1.7, fontWeight: 500, resize: 'vertical', whiteSpace: 'pre-wrap' }} />
      <span className="muted small num">{text.length.toLocaleString('en-US')} / {MAX_LEN.toLocaleString('en-US')}</span>
    </div>
  );
}
