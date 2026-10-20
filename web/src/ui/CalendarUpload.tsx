import { useRef } from 'react';
import { useApp } from './app-context';
import { Icon } from './icons';
import { t } from '../i18n';

/** 上傳「政府行政機關辦公日曆表.xlsx」 */
export function CalendarUpload({ label, primary }: { label?: string; primary?: boolean }) {
  const { src, run, toast } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const r = await run(() => src.importCalendar(file));
    if (r) toast(t('已匯入 {0} 年行事曆：放假日 {1} 天', [r.year, r.holidays]) + (r.keptOverrides ? t('，保留手動修改 {0} 天', [r.keptOverrides]) : ''));
    if (input.current) input.current.value = '';
  };
  return (
    <>
      <button type="button" className={primary ? 'btn sm primary' : 'btn sm'} onClick={() => input.current?.click()} disabled={src.readOnly}>
        <Icon name="upload" size={16} />{label ?? t('上傳 xlsx')}
      </button>
      <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => onFile(e.target.files?.[0])} />
    </>
  );
}
