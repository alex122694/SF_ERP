import { useRef } from 'react';
import { useApp } from './app-context';
import { Icon } from './icons';

/** 上傳「政府行政機關辦公日曆表.xlsx」 */
export function CalendarUpload({ label = '上傳 xlsx', primary }: { label?: string; primary?: boolean }) {
  const { src, run, toast } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const r = await run(() => src.importCalendar(file));
    if (r) toast(`已匯入 ${r.year} 年行事曆：放假日 ${r.holidays} 天${r.keptOverrides ? `，保留手動修改 ${r.keptOverrides} 天` : ''}`);
    if (input.current) input.current.value = '';
  };
  return (
    <>
      <button type="button" className={primary ? 'btn sm primary' : 'btn sm'} onClick={() => input.current?.click()} disabled={src.readOnly}>
        <Icon name="upload" size={16} />{label}
      </button>
      <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => onFile(e.target.files?.[0])} />
    </>
  );
}
