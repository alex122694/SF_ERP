// 全站共用：資料來源、目前狀態、提示訊息、確認視窗、路由
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { UserError, calendarsOf, localDate, type State } from '../data/db';
import type { DataSource, LiteSource } from '../data/source';
import type { Calendars } from '../rules/rules';

export interface Route {
  page: string;
  id?: string;
  q: URLSearchParams;
}

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const [page = 'home', id] = path.split('/').filter(Boolean);
  return { page, id, q: new URLSearchParams(query) };
}

export const go = (hash: string) => { location.hash = hash; };

function useRoute(): Route {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return useMemo(() => parseRoute(hash), [hash]);
}

interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  ok: string;
  danger?: boolean;
}

interface Ctx {
  src: DataSource;
  lite: LiteSource | null;
  st: State;
  cal: Calendars;
  today: string;
  route: Route;
  toast(msg: string, bad?: boolean): void;
  /** 執行寫入；使用者看得懂的錯誤以紅色提示顯示，回傳 undefined */
  run<T>(p: () => Promise<T>, okMsg?: string): Promise<T | undefined>;
  confirm(o: ConfirmOptions): Promise<boolean>;
}

const AppContext = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

export function AppProvider({ src, children }: { src: DataSource; children: ReactNode }) {
  const st = useSyncExternalStore(useCallback((fn) => src.subscribe(fn), [src]), () => src.state());
  const cal = useMemo(() => calendarsOf(st.days), [st.days]);
  const route = useRoute();
  const [toastMsg, setToast] = useState<{ msg: string; bad: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const toast = useCallback((msg: string, bad = false) => {
    setToast({ msg, bad });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), bad ? 6000 : 3000);
  }, []);
  const run = useCallback(async <T,>(p: () => Promise<T>, okMsg?: string) => {
    try {
      const r = await p();
      if (okMsg) toast(okMsg);
      return r;
    } catch (e) {
      if (e instanceof UserError) toast(e.message, true);
      else { console.error(e); toast(`發生錯誤：${(e as Error).message ?? e}`, true); }
      return undefined;
    }
  }, [toast]);

  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...o, resolve })), []);
  const close = (v: boolean) => { pending?.resolve(v); setPending(null); };

  const lite = src.edition === 'lite' ? (src as LiteSource) : null;
  const value: Ctx = { src, lite, st, cal, today: localDate(), route, toast, run, confirm };
  return (
    <AppContext.Provider value={value}>
      {children}
      {pending && (
        <Modal onClose={() => close(false)} label={pending.title}>
          <div className="dlg-body">
            <h2>{pending.title}</h2>
            {pending.body && <div className="muted">{pending.body}</div>}
            <div className="dlg-actions">
              <button type="button" className="btn" onClick={() => close(false)}>取消</button>
              <button type="button" className={pending.danger ? 'btn primary danger-fill' : 'btn primary'} onClick={() => close(true)}
                style={pending.danger ? { background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' } : undefined}>{pending.ok}</button>
            </div>
          </div>
        </Modal>
      )}
      {toastMsg && <div className={toastMsg.bad ? 'toast bad' : 'toast'} role="status">{toastMsg.msg}</div>}
    </AppContext.Provider>
  );
}

/** 原生 <dialog>：Esc 與背景點擊都會關閉 */
export function Modal({ children, onClose, label, wide }: { children: ReactNode; onClose: () => void; label: string; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    return () => { if (d.open) d.close(); };
  }, []);
  return (
    <dialog ref={ref} className={wide ? 'wide' : undefined} aria-label={label}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {children}
    </dialog>
  );
}
