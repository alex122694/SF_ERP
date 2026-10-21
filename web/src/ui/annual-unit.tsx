// 特休一律以「天」顯示（最小單位半天），不再提供小時切換
import { amountText, type AnnualUnitName } from './format';
import { toDays, type LeaveRecord } from '../rules/rules';
import { getLang, t } from '../i18n';

export const useAnnualUnit = (): AnnualUnitName => 'day';

/** 顯示的數字（不含單位） */
export function AnnualNum({ h }: { h: number }) {
  return <>{toDays(h)}</>;
}

/** 單位文字；n 為前面顯示的數字：英文在 1 時用單數（1 day） */
export function AnnualUnit({ n }: { n?: number }) {
  const label = t('天');
  return <span className="unit">{getLang() === 'en' && n != null && toDays(n) === 1 ? label.replace(/s$/, '') : label}</span>;
}

/** 數字＋單位，例如「3.5 天」 */
export function Annual({ h }: { h: number }) {
  return <><AnnualNum h={h} /><AnnualUnit n={h} /></>;
}

/** 一筆紀錄的數量：特休顯示天數，其他照舊 */
export function LeaveAmount({ rec }: { rec: Pick<LeaveRecord, 'type' | 'hours'> }) {
  return rec.type === 'annual' ? <Annual h={rec.hours} /> : <>{amountText(rec)}</>;
}
