// 畫面只透過 DataSource 讀寫資料：輕量版接 LiteSource（sql.js＋本機資料夾），標準版之後接 ApiSource（REST）
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { Db, UserError, type State } from './db';
import { parseGovCalendar } from './calendarXlsx';
import { importLegacyJson, type LegacyImportResult } from './legacyImport';
import { seedDemo } from './devSeed';
import { FolderStore, type FolderInfo } from './storage';
import type { EmployeeInput, LeaveInput, Settlement, SettlementAction } from '../rules/rules';
import { msg } from '../rules/msg';

export interface DataSource {
  readonly edition: 'lite' | 'std';
  readonly readOnly: boolean;
  state(): State;
  saveEmployee(input: EmployeeInput, id?: number): Promise<number>;
  deleteEmployee(id: number): Promise<void>;
  saveDepartment(name: string, id?: number): Promise<number>;
  deleteDepartment(id: number): Promise<void>;
  saveLeave(input: LeaveInput, id?: number): Promise<number>;
  saveLeaves(inputs: LeaveInput[]): Promise<number[]>;
  deleteLeave(id: number): Promise<void>;
  importCalendar(file: File): Promise<{ year: number; holidays: number; keptOverrides: number }>;
  setDay(date: string, holiday: boolean, reason?: string): Promise<void>;
  resetDay(date: string): Promise<void>;
  setConfirmTwice(code: string, on: boolean): Promise<void>;
  setSetting(key: string, value: string): Promise<void>;
  settle(employeeId: number, periodStart: string, action: SettlementAction, today: string): Promise<Settlement>;
  importLegacy(file: File): Promise<LegacyImportResult>;
  subscribe(fn: () => void): () => void;
}

// 上傳檔案的大小上限：辦公日曆表約 30 KB、舊版 db.json 通常不到 1 MB，超過就不是正常的檔案
const MAX_XLSX_MB = 10;
const MAX_JSON_MB = 20;
function checkSize(file: File, maxMb: number) {
  if (file.size > maxMb * 1024 * 1024) throw new UserError(msg('檔案太大（{0} MB），上限是 {1} MB', [(file.size / 1024 / 1024).toFixed(1), maxMb]));
}

let sqlPromise: Promise<SqlJsStatic> | null = null;

/** WASM 在建置時已內嵌成 data: URL，直接解碼，不經過網路 */
export function loadSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      let wasmBinary: ArrayBuffer;
      if (wasmUrl.startsWith('data:')) {
        const b64 = wasmUrl.slice(wasmUrl.indexOf(',') + 1);
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        wasmBinary = bytes.buffer;
      } else {
        wasmBinary = await (await fetch(wasmUrl)).arrayBuffer();
      }
      return initSqlJs({ wasmBinary });
    })();
    // 失敗時不要記住失敗的結果，下次開啟可以重試
    sqlPromise.catch(() => { sqlPromise = null; });
  }
  return sqlPromise;
}

const MAX_SQLITE_MB = 200;

export interface BackupPreview {
  name: string;
  employees: number;
  leaves: number;
  from: string | null;
  to: string | null;
  bytes: Uint8Array;
}

export interface SaveStatus {
  savedAt: Date | null;
  saving: boolean;
  error: string | null;
}

export class LiteSource implements DataSource {
  readonly edition = 'lite' as const;
  private cached: State;
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private lastSaved: Uint8Array;
  status: SaveStatus = { savedAt: null, saving: false, error: null };

  private constructor(private SQL: SqlJsStatic, private db: Db, readonly store: FolderStore, readonly readOnly: boolean, readonly created: boolean) {
    this.lastSaved = db.export();
    this.cached = db.state();
    store.setBackupKeep(Number(this.cached.settings.backup_keep) || 30);
  }

  /** 開啟資料夾內的 sf_erp.sqlite；沒有就建立新的 */
  static async open(store: FolderStore, readOnly: boolean): Promise<LiteSource> {
    const SQL = await loadSql();
    const bytes = await store.read();
    const db = Db.open(SQL, bytes ?? undefined);
    const src = new LiteSource(SQL, db, store, readOnly, !bytes);
    if (!bytes && !readOnly) await store.write(db.export());
    return src;
  }

  state() {
    return this.cached;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  /** 改資料 → 寫回資料檔；寫入失敗時還原成上次存檔的內容，畫面不會顯示沒存進去的資料 */
  private mutate<T>(fn: (db: Db) => T): Promise<T> {
    const job = this.queue.then(async () => {
      if (this.readOnly) throw new UserError(msg('這個分頁是唯讀的：已有另一個分頁開著同一份資料'));
      const result = fn(this.db);
      const bytes = this.db.export();
      this.status = { ...this.status, saving: true };
      this.cached = this.db.state();
      this.emit();
      try {
        await this.store.write(bytes);
        this.lastSaved = bytes;
        this.status = { savedAt: new Date(), saving: false, error: null };
        this.cached = { ...this.cached }; // 換一個參照，讓畫面更新「已自動儲存」時間
      } catch (e) {
        this.db = Db.open(this.SQL, this.lastSaved);
        this.cached = this.db.state();
        this.status = { ...this.status, saving: false, error: String((e as Error).message ?? e) };
        this.emit();
        throw new UserError(msg('存檔失敗，這次修改沒有存進資料檔（{0}）', [(e as Error).message]));
      }
      this.emit();
      return result;
    });
    this.queue = job.catch(() => {});
    return job;
  }

  saveEmployee(input: EmployeeInput, id?: number) { return this.mutate((db) => db.saveEmployee(input, id)); }
  deleteEmployee(id: number) { return this.mutate((db) => db.deleteEmployee(id)); }
  saveDepartment(name: string, id?: number) { return this.mutate((db) => db.saveDepartment(name, id)); }
  deleteDepartment(id: number) { return this.mutate((db) => db.deleteDepartment(id)); }
  saveLeave(input: LeaveInput, id?: number) { return this.mutate((db) => db.saveLeave(input, id)); }
  saveLeaves(inputs: LeaveInput[]) { return this.mutate((db) => db.saveLeaves(inputs)); }
  deleteLeave(id: number) { return this.mutate((db) => db.deleteLeave(id)); }
  setDay(date: string, holiday: boolean, reason?: string) { return this.mutate((db) => db.setDay(date, holiday, reason)); }
  resetDay(date: string) { return this.mutate((db) => db.resetDay(date)); }
  setConfirmTwice(code: string, on: boolean) { return this.mutate((db) => db.setConfirmTwice(code, on)); }
  setSetting(key: string, value: string) {
    return this.mutate((db) => {
      db.setSetting(key, value);
      if (key === 'backup_keep') this.store.setBackupKeep(Number(value) || 30);
    });
  }
  settle(employeeId: number, periodStart: string, action: SettlementAction, today: string) {
    return this.mutate((db) => db.settle(employeeId, periodStart, action, today));
  }

  async importCalendar(file: File) {
    checkSize(file, MAX_XLSX_MB);
    let parsed: { year: number; holidays: string[] };
    try {
      parsed = await parseGovCalendar(new Uint8Array(await file.arrayBuffer()));
    } catch (e) {
      throw e instanceof UserError ? e : new UserError(msg('檔案不是有效的 xlsx'));
    }
    return this.mutate((db) => ({ year: parsed.year, ...db.importCalendar(parsed.year, parsed.holidays, file.name) }));
  }

  async importLegacy(file: File) {
    checkSize(file, MAX_JSON_MB);
    const text = await file.text();
    return this.mutate((db) => importLegacyJson(db, text));
  }

  // ---------- 輕量版專用 ----------

  /** 只在瀏覽器內部儲存（測試用）模式提供 */
  seedDemo() {
    if (!this.store.ephemeral) return Promise.reject(new UserError(msg('只有測試模式可以載入範例資料')));
    return this.mutate((db) => db.tx(() => seedDemo(db)));
  }

  info(): Promise<FolderInfo> {
    return this.store.info();
  }

  backupNow(): Promise<string> {
    return this.store.backupNow(this.lastSaved);
  }

  /** 讀取使用者選的備份檔（sf_erp-YYYYMMDD.sqlite 或 sf_erp.sqlite）；回傳摘要與已升級到最新版的內容，還沒有動到目前的資料 */
  async previewBackup(file: File): Promise<BackupPreview> {
    checkSize(file, MAX_SQLITE_MB);
    const db = Db.open(this.SQL, new Uint8Array(await file.arrayBuffer()));
    try {
      return { name: file.name, ...db.summary(), bytes: db.export() };
    } catch {
      throw new UserError(msg('這不是 SF ERP 的備份檔'));
    }
  }

  /** 用備份整份取代目前的資料；取代前先把目前的資料另存到 backup/，存檔失敗時還原成原本的資料 */
  async restoreBackup(preview: BackupPreview): Promise<string> {
    if (this.readOnly) throw new UserError(msg('這個分頁是唯讀的：已有另一個分頁開著同一份資料'));
    const snapshot = await this.store.saveBeforeRestore(this.lastSaved);
    await this.mutate(() => { this.db = Db.open(this.SQL, preview.bytes); });
    this.store.setBackupKeep(Number(this.cached.settings.backup_keep) || 30);
    return snapshot;
  }

  /** 匯出目前的資料檔，給標準版匯入或另存 */
  exportBlob(): Blob {
    return new Blob([this.lastSaved], { type: 'application/vnd.sqlite3' });
  }
}
