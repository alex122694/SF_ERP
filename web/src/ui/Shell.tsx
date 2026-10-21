// 側邊選單＋內容區
import type { ReactNode } from 'react';
import { useApp } from './app-context';
import { Backdrop, Icon, type IconName } from './icons';
import { LangSwitch } from './LangSwitch';
import { t } from '../i18n';

const NAV: { page: string; label: string; icon: IconName }[] = [
  { page: 'home', label: '首頁', icon: 'home' },
  { page: 'quick', label: '快速登記', icon: 'quick' },
  { page: 'attendance', label: '出缺勤月曆', icon: 'calendar' },
  { page: 'employees', label: '員工', icon: 'users' },
  { page: 'overview', label: '請假總覽', icon: 'chart' },
  { page: 'memo', label: '備忘錄', icon: 'memo' },
  { page: 'settings', label: '制度與設定', icon: 'settings' },
];

const pad = (n: number) => String(n).padStart(2, '0');

export function Shell({ children, theme, onTheme }: { children: ReactNode; theme: 'dark' | 'light'; onTheme: () => void }) {
  const { route, lite } = useApp();
  const status = lite?.status;
  const saved = status?.savedAt;
  return (
    <div className="app">
      <Backdrop />
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">SF</div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
            <b style={{ fontSize: 15 }}>SF ERP</b>
            <span className="muted small">{lite ? 'lite' : t('標準版')}</span>
          </div>
        </div>
        <nav aria-label={t('主選單')} className="nav-list">
          {NAV.map((n) => {
            const on = route.page === n.page;
            return (
              <a key={n.page} className={on ? 'nav on' : 'nav'} href={`#/${n.page}`} aria-current={on ? 'page' : undefined}>
                <Icon name={n.icon} />{t(n.label)}
              </a>
            );
          })}
        </nav>
        <div className="side-foot">
          {lite && (
            <div className="file-chip" title={t(lite.store.label)}>
              <Icon name="db" style={{ color: status?.error ? 'var(--danger)' : 'var(--accent)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35, minWidth: 0 }}>
                <b style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(lite.store.label)}</b>
                <span className="muted small">
                  {lite.readOnly ? t('唯讀（另一個分頁開著）')
                    : status?.error ? t('上次存檔失敗')
                    : status?.saving ? t('儲存中…')
                    : saved ? t('已自動儲存 · {0}', [`${pad(saved.getHours())}:${pad(saved.getMinutes())}`]) : 'sf_erp.sqlite'}
                </span>
              </div>
            </div>
          )}
          <button type="button" className="btn sm" style={{ justifyContent: 'flex-start' }} onClick={onTheme}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />{theme === 'dark' ? t('切換淺色') : t('切換深色')}
          </button>
          <LangSwitch />
        </div>
      </aside>
      <main className="main">
        {lite?.readOnly && (
          <div className="alert warn" style={{ maxWidth: 1180, margin: '0 auto 20px' }}>
            {t('這個分頁是唯讀的：同一個瀏覽器已有另一個分頁開著 SF ERP。請回到那個分頁操作，或關閉它之後重新整理。')}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
