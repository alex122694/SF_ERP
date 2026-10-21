// lite 入口：開啟資料夾 → 進入系統（規格 2.2）
import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './ui/app-context';
import { Backdrop, Icon } from './ui/icons';
import { Shell } from './ui/Shell';
import { LiteSource } from './data/source';
import { FolderStore, claimTab, getRecentFolder, grantFolder, pickFolder, supportsFolders, type LockInfo, type RecentFolder } from './data/storage';
import { HomePage } from './pages/Home';
import { QuickPage } from './pages/Quick';
import { AttendancePage } from './pages/Attendance';
import { EmployeesPage } from './pages/Employees';
import { EmployeeDetailPage } from './pages/EmployeeDetail';
import { OverviewPage } from './pages/Overview';
import { MemoPage } from './pages/Memo';
import { SettingsPage } from './pages/Settings';
import { LangSwitch } from './ui/LangSwitch';
import { errorText, t, tr, useLang } from './i18n';

type Theme = 'dark' | 'light';
const THEME_KEY = 'sf-erp-theme';

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* 記不住主題不影響使用 */ }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

/** 本機開發或預覽（http://localhost）時，多一個不碰任何資料夾的測試模式 */
const isLocalDev = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

export function App() {
  useLang(); // 換語言時整個畫面重新繪製
  const [theme, toggleTheme] = useTheme();
  const [src, setSrc] = useState<LiteSource | null>(null);
  useEffect(() => {
    if (!src) return;
    const release = () => { if (!src.readOnly) src.store.releaseLock(); };
    addEventListener('pagehide', release);
    return () => removeEventListener('pagehide', release);
  }, [src]);
  if (!src) return <OpenScreen onOpen={setSrc} />;
  return (
    <AppProvider src={src}>
      <Shell theme={theme} onTheme={toggleTheme}><Router /></Shell>
    </AppProvider>
  );
}

function Router() {
  const { route } = useApp();
  useEffect(() => { window.scrollTo(0, 0); }, [route.page, route.id]);
  switch (route.page) {
    case 'quick': return <QuickPage />;
    case 'attendance': return <AttendancePage />;
    case 'employees': return route.id ? <EmployeeDetailPage /> : <EmployeesPage />;
    case 'overview': return <OverviewPage />;
    case 'memo': return <MemoPage />;
    case 'settings': return <SettingsPage />;
    default: return <HomePage />;
  }
}

type Phase =
  | { k: 'loading' }
  | { k: 'unsupported' }
  | { k: 'first' }
  | { k: 'recent'; recent: RecentFolder }
  | { k: 'locked'; store: FolderStore; lock: LockInfo }
  | { k: 'opening' };

function OpenScreen({ onOpen }: { onOpen: (s: LiteSource) => void }) {
  const [phase, setPhase] = useState<Phase>({ k: 'loading' });
  const [error, setError] = useState('');
  const dev = isLocalDev();

  useEffect(() => {
    if (!supportsFolders() && !dev) { setPhase({ k: 'unsupported' }); return; }
    if (!supportsFolders()) { setPhase({ k: 'first' }); return; }
    getRecentFolder().then((r) => setPhase(r ? { k: 'recent', recent: r } : { k: 'first' }));
  }, [dev]);

  const finish = async (store: FolderStore, readOnly: boolean) => {
    setPhase({ k: 'opening' });
    try {
      onOpen(await LiteSource.open(store, readOnly));
    } catch (e) {
      setError(errorText(e));
      setPhase({ k: 'first' });
    }
  };

  /** 同一個瀏覽器已有分頁開著 → 唯讀；別台電腦的鎖還有效 → 先問 */
  const start = async (store: FolderStore) => {
    setError('');
    setPhase({ k: 'opening' });
    try {
      const otherTab = await claimTab(() => {});
      if (otherTab) return finish(store, true);
      const lock = await store.acquireLock();
      if (lock) { setPhase({ k: 'locked', store, lock }); return; }
      await finish(store, false);
    } catch (e) {
      setError(t('無法開啟資料夾：{0}', [errorText(e)]));
      setPhase({ k: 'first' });
    }
  };

  const openRecent = async (r: RecentFolder) => {
    try {
      if (!(await grantFolder(r.handle))) { setError(t('沒有取得資料夾的讀寫權限，請再按一次並選「允許」。')); return; }
      await start(await FolderStore.open(r.handle));
    } catch (e) {
      setError(t('上次的資料夾無法開啟（可能已被移動或刪除），請重新選擇：{0}', [errorText(e)]));
      setPhase({ k: 'first' });
    }
  };

  const choose = async () => {
    setError('');
    try {
      const dir = await pickFolder();
      if (dir) await start(await FolderStore.open(dir));
    } catch (e) {
      setError(t('無法開啟資料夾：{0}', [errorText(e)]));
    }
  };

  return (
    <div className="center-screen">
      <Backdrop full />
      <div className="center-box">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
          <div className="logo" style={{ width: 44, height: 44, borderRadius: 12 }}>SF</div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
            <b style={{ fontSize: 18 }}>SF ERP</b>
            <span className="muted" style={{ fontSize: 13 }}>{t('lite · 資料只存在你的電腦')}</span>
          </div>
        </div>

        <div className="card stack" style={{ padding: 36, gap: 20, borderRadius: 20 }}>
          {error && <div role="alert" className="alert bad">{error}</div>}

          {(phase.k === 'loading' || phase.k === 'opening') && <span className="muted">{phase.k === 'opening' ? t('正在開啟資料…') : t('載入中…')}</span>}

          {phase.k === 'unsupported' && <>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Icon name="warn" size={28} style={{ color: 'var(--warn)' }} />
              <h1 style={{ fontSize: 24 }}>{t('這個瀏覽器不能存取資料夾')}</h1>
            </div>
            <span className="muted">{t('lite 需要讀寫你電腦上的資料檔，目前只有 Chrome 和 Edge 支援。請改用其中一個開啟 index.html。')}</span>
            <div className="alert warn" style={{ fontSize: 13 }}>{t('在檔案總管對 index.html 按右鍵 →「開啟檔案」→ 選 Microsoft Edge 或 Google Chrome。')}</div>
          </>}

          {phase.k === 'recent' && <>
            <div className="stack" style={{ gap: 6 }}>
              <h1 style={{ fontSize: 26 }}>{t('歡迎回來')}</h1>
              <span className="muted">{t('瀏覽器需要你按一次「允許」，才能讀寫上次的資料夾。')}</span>
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 16, borderRadius: 14, background: 'var(--raised)', border: '1px solid var(--line)' }}>
              <Icon name="folder" size={26} stroke={1.5} style={{ color: 'var(--accent)' }} />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.4 }}>
                <b style={{ wordBreak: 'break-all' }}>{phase.recent.name}</b>
                <span className="muted" style={{ fontSize: 13 }}>sf_erp.sqlite · {t('上次開啟 {0}', [phase.recent.openedAt.slice(0, 16)])}</span>
              </div>
            </div>
            <button type="button" className="btn primary" style={{ width: '100%', minHeight: 48 }} onClick={() => openRecent(phase.recent)} autoFocus>{t('允許存取並開啟')}</button>
            <button type="button" className="btn" style={{ minHeight: 48 }} onClick={choose}>{t('選擇其他資料夾')}</button>
          </>}

          {phase.k === 'first' && <>
            <div className="stack" style={{ gap: 6 }}>
              <h1 style={{ fontSize: 26 }}>{t('選擇資料要存在哪裡')}</h1>
              <span className="muted">{t('選一個資料夾，系統會在裡面建立 sf_erp.sqlite 和 backup/。之後整個資料夾複製走就是完整備份。')}</span>
            </div>
            <div className="stack" style={{ gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}><span className="step">1</span><span>{tr('按下面的按鈕，選擇解壓縮後的 {0} 資料夾。', [<b>SF ERP\data</b>])}</span></div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}><span className="step">2</span><span>{t('瀏覽器詢問「要允許編輯檔案嗎？」時，選「允許」。')}</span></div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}><span className="step">3</span><span>{t('完成。之後每次開啟只要按一次「允許」。')}</span></div>
            </div>
            {supportsFolders() && <button type="button" className="btn primary" style={{ width: '100%', minHeight: 48 }} onClick={choose} autoFocus>{t('選擇資料夾')}</button>}
            <span className="muted small" style={{ textAlign: 'center' }}>{t('已有舊版 db.json？開啟後可在「制度與設定」匯入。')}</span>
          </>}

          {phase.k === 'locked' && <>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Icon name="warn" size={28} style={{ color: 'var(--warn)' }} />
              <h1 style={{ fontSize: 22 }}>{t('這個資料夾可能正在別處使用')}</h1>
            </div>
            <span className="muted">{t('{0} 分鐘內有另一個視窗或電腦開著同一份資料。兩邊同時修改，後存的會蓋掉先存的。', [Math.max(1, Math.round((Date.now() - phase.lock.at) / 60000))])}</span>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn" style={{ flex: '1 1 160px' }} onClick={() => finish(phase.store, true)}>{t('唯讀開啟')}</button>
              <button type="button" className="btn primary" style={{ flex: '1 1 160px' }} onClick={async () => { await phase.store.takeLock(); await finish(phase.store, false); }}>{t('我確定沒有人在用，開啟')}</button>
            </div>
          </>}

          {dev && (phase.k === 'first' || phase.k === 'recent') && (
            <div className="stack" style={{ gap: 8, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
              <span className="muted small">{t('本機開發模式')}</span>
              <button type="button" className="btn" onClick={async () => start(await FolderStore.browserInternal())}>{t('使用瀏覽器內部儲存（測試用）')}</button>
            </div>
          )}
        </div>
        <span className="muted small" style={{ textAlign: 'center' }}>{t('不需要網路、不會上傳任何資料 · 版本 {0}', ['2.0.0'])}</span>
        <div style={{ alignSelf: 'center', width: 200 }}><LangSwitch /></div>
      </div>
    </div>
  );
}
