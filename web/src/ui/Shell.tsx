// 側邊選單＋內容區
import { useEffect, useState, type ReactNode } from 'react';
import { useApp } from './app-context';
import { Backdrop, Icon, type IconName } from './icons';
import { LangSwitch } from './LangSwitch';
import { longDate } from './format';
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

/** 目前日期、時間（HH:MM）與今天是上班日或放假日 */
function Clock() {
  const { cal } = useApp();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const holiday = cal.isHoliday(date);
  return (
    <div className="stack clock" style={{ gap: 2, padding: '0 12px 12px' }}>
      <b className="num" style={{ fontSize: 26, lineHeight: 1.2 }}>{pad(now.getHours())}:{pad(now.getMinutes())}</b>
      <span className="muted small">{longDate(date)}</span>
      <span className="muted small" style={{ fontWeight: 700 }}>{holiday === undefined ? t('行事曆未匯入') : holiday ? t('放假日') : t('上班日')}</span>
    </div>
  );
}

export function Shell({ children, theme, onTheme }: { children: ReactNode; theme: 'dark' | 'light'; onTheme: () => void }) {
  const { route, lite } = useApp();
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
        <Clock />
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
