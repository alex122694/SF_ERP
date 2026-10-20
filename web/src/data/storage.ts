// 輕量版的資料夾存取：sf_erp.sqlite、backup/、.lock（規格 2.2）
import { localDate, localStamp } from './db';

export const DB_FILE = 'sf_erp.sqlite';
const BACKUP_DIR = 'backup';
const LOCK_FILE = '.lock';
const LOCK_STALE_MS = 3 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;

export const supportsFolders = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

// ---------- 記住上次的資料夾（IndexedDB） ----------

const IDB_NAME = 'sf-erp';
const IDB_STORE = 'handles';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await idb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function idbSet(key: string, value: unknown) {
  try {
    const db = await idb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // 記不住只是下次要重新選資料夾，不影響使用
  }
}

export interface RecentFolder {
  handle: FileSystemDirectoryHandle;
  name: string;
  openedAt: string;
}

export const getRecentFolder = () => idbGet<RecentFolder>('folder');
const rememberFolder = (handle: FileSystemDirectoryHandle) =>
  idbSet('folder', { handle, name: handle.name, openedAt: localStamp() } satisfies RecentFolder);

/** 要求讀寫權限；必須在使用者點擊時呼叫 */
export async function grantFolder(handle: FileSystemDirectoryHandle): Promise<boolean> {
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await window.showDirectoryPicker!({ id: 'sf-erp', mode: 'readwrite' });
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return null;
    throw e;
  }
}

// ---------- 資料夾 ----------

async function readFile(dir: FileSystemDirectoryHandle, name: string): Promise<Uint8Array | null> {
  try {
    const fh = await dir.getFileHandle(name);
    return new Uint8Array(await (await fh.getFile()).arrayBuffer());
  } catch (e) {
    if ((e as DOMException).name === 'NotFoundError') return null;
    throw e;
  }
}

async function writeFile(dir: FileSystemDirectoryHandle, name: string, data: Uint8Array | string) {
  const fh = await dir.getFileHandle(name, { create: true });
  // createWritable 先寫到暫存檔，close 時才取代原檔，寫到一半失敗不會毀掉舊檔
  const w = await fh.createWritable();
  try {
    await w.write(data as FileSystemWriteChunkType);
    await w.close();
  } catch (e) {
    await w.abort().catch(() => {});
    throw e;
  }
}

export interface FolderInfo {
  folder: string;
  size: number;
  lastBackup: string | null;
  backups: number;
}

export interface LockInfo {
  at: number;
  tab: string;
  agent: string;
}

/** 一個已授權的資料夾；ephemeral 用於開發時的瀏覽器內部儲存 */
/** 這個瀏覽器的識別碼：同一台電腦、同一個瀏覽器重開時不算「別人」；同瀏覽器多分頁由 claimTab 處理 */
function browserId(): string {
  try {
    let id = localStorage.getItem('sf-erp-owner');
    if (!id) { id = Math.random().toString(36).slice(2); localStorage.setItem('sf-erp-owner', id); }
    return id;
  } catch {
    return 'unknown';
  }
}

export class FolderStore {
  private readonly tab = browserId();
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(readonly dir: FileSystemDirectoryHandle, readonly label: string, readonly ephemeral = false, private backupKeep = 30) {}

  static async open(dir: FileSystemDirectoryHandle): Promise<FolderStore> {
    await rememberFolder(dir);
    return new FolderStore(dir, dir.name);
  }

  /** 瀏覽器內部儲存（OPFS），只用於開發與測試，不會碰到使用者的資料夾 */
  static async browserInternal(): Promise<FolderStore> {
    const root = await navigator.storage.getDirectory();
    return new FolderStore(await root.getDirectoryHandle('sf-erp-test', { create: true }), '瀏覽器內部儲存（測試用）', true);
  }

  setBackupKeep(n: number) {
    this.backupKeep = n;
  }

  read() {
    return readFile(this.dir, DB_FILE);
  }

  /** 寫入資料檔；當天第一次存檔前先把舊檔備份起來 */
  async write(bytes: Uint8Array) {
    const old = await readFile(this.dir, DB_FILE);
    if (old) {
      const backups = await this.dir.getDirectoryHandle(BACKUP_DIR, { create: true });
      const name = `sf_erp-${localDate().replaceAll('-', '')}.sqlite`;
      if (!(await readFile(backups, name))) {
        await writeFile(backups, name, old);
        await this.prune(backups);
      }
    }
    await writeFile(this.dir, DB_FILE, bytes);
  }

  /** 立即備份目前的資料檔（同一天重複備份會覆蓋當天那份） */
  async backupNow(bytes: Uint8Array): Promise<string> {
    const backups = await this.dir.getDirectoryHandle(BACKUP_DIR, { create: true });
    const name = `sf_erp-${localDate().replaceAll('-', '')}.sqlite`;
    await writeFile(backups, name, bytes);
    await this.prune(backups);
    return name;
  }

  private async backupNames(backups: FileSystemDirectoryHandle): Promise<string[]> {
    const names: string[] = [];
    for await (const h of backups.values()) {
      if (h.kind === 'file' && /^sf_erp-\d{8}\.sqlite$/.test(h.name)) names.push(h.name);
    }
    return names.sort();
  }

  private async prune(backups: FileSystemDirectoryHandle) {
    const names = await this.backupNames(backups);
    for (const n of names.slice(0, -this.backupKeep)) await backups.removeEntry(n);
  }

  async info(): Promise<FolderInfo> {
    const data = await readFile(this.dir, DB_FILE);
    let names: string[] = [];
    try {
      names = await this.backupNames(await this.dir.getDirectoryHandle(BACKUP_DIR));
    } catch {
      names = [];
    }
    const last = names.at(-1)?.match(/(\d{4})(\d{2})(\d{2})/);
    return { folder: this.label, size: data?.length ?? 0, lastBackup: last ? `${last[1]}-${last[2]}-${last[3]}` : null, backups: names.length };
  }

  // ---------- 鎖定：提醒別台電腦正在用同一個資料夾 ----------

  /** 回傳別人仍有效的鎖；沒有則取得鎖並開始定時更新 */
  async acquireLock(): Promise<LockInfo | null> {
    const raw = await readFile(this.dir, LOCK_FILE);
    if (raw) {
      try {
        const lock = JSON.parse(new TextDecoder().decode(raw)) as LockInfo;
        if (lock.tab !== this.tab && Date.now() - lock.at < LOCK_STALE_MS) return lock;
      } catch {
        // 壞掉的鎖檔直接覆蓋
      }
    }
    await this.takeLock();
    return null;
  }

  async takeLock() {
    const write = () => writeFile(this.dir, LOCK_FILE, JSON.stringify({ at: Date.now(), tab: this.tab, agent: navigator.userAgent } satisfies LockInfo)).catch(() => {});
    await write();
    if (!this.heartbeat) this.heartbeat = setInterval(write, HEARTBEAT_MS);
  }

  async releaseLock() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    await this.dir.removeEntry(LOCK_FILE).catch(() => {});
  }
}

// ---------- 同一個瀏覽器只允許一個分頁寫入 ----------

/** 有別的分頁已經開著時回傳 true；之後開的分頁會收到 busy 回應 */
export function claimTab(onOtherTab: () => void): Promise<boolean> {
  if (typeof BroadcastChannel === 'undefined') return Promise.resolve(false);
  const ch = new BroadcastChannel('sf-erp');
  return new Promise((resolve) => {
    let busy = false;
    ch.onmessage = (ev) => {
      if (ev.data === 'busy') busy = true;
      if (ev.data === 'hello' && !busy) {
        ch.postMessage('busy');
        onOtherTab();
      }
    };
    ch.postMessage('hello');
    setTimeout(() => resolve(busy), 300);
  });
}
