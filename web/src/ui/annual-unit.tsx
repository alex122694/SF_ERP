// 特休顯示單位：預設「天」，點一下單位切換成「小時」；全站同步，只記在瀏覽器
import { useSyncExternalStore } from 'react';
import { amountText, fmtHours, type AnnualUnitName } from './format';
import { toDays, type LeaveRecord } from '../rules/rules';
import { getLang, t } from '../i18n';

type Unit = AnnualUnitName;
const KEY = 'sf_erp.annual_unit';

let unit: Unit = (() => {
  try { return localStorage.getItem(KEY) === 'hour' ? 'hour' : 'day'; } catch { return 'day'; }
})();
const subs = new Set<() => void>();

function toggle() {
  unit = unit === 'day' ? 'hour' : 'day';
  try { localStorage.setItem(KEY, unit); } catch { /* 無痕模式等存不了就算了 */ }
  subs.forEach((f) => f());
}

export const useAnnualUnit = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => unit);

/** 依目前單位顯示的數字（不含單位） */
export function AnnualNum({ h }: { h: number }) {
  return <>{useAnnualUnit() === 'day' ? toDays(h) : fmtHours(h)}</>;
}

/** 可點的單位；放在可點的列裡也不會觸發整列。n 為前面顯示的數字：英文在 1 時用單數（1 day） */
export function AnnualUnit({ n }: { n?: number }) {
  const u = useAnnualUnit();
  const shown = n == null ? undefined : u === 'day' ? toDays(n) : Math.round(n * 100) / 100;
  const label = u === 'day' ? t('天') : t('小時');
  return (
    <button type="button" className="unit-btn" title={t('點一下切換天／小時')}
      aria-label={u === 'day' ? t('天，點一下改用小時顯示') : t('小時，點一下改用天顯示')}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggle(); }}>{getLang() === 'en' && shown === 1 ? label.replace(/s$/, '') : label}</button>
  );
}

/** 數字＋單位，例如「3.5 天」 */
export function Annual({ h }: { h: number }) {
  return <><AnnualNum h={h} /><AnnualUnit n={h} /></>;
}

/** 一筆紀錄的數量：特休可點單位，其他照舊 */
export function LeaveAmount({ rec }: { rec: Pick<LeaveRecord, 'type' | 'hours'> }) {
  return rec.type === 'annual' ? <Annual h={rec.hours} /> : <>{amountText(rec)}</>;
}
