// 介面語言：中文為原文，其他語言查 messages.ts；選擇只記在瀏覽器
import { Fragment, createElement, useSyncExternalStore, type ReactNode } from 'react';
import { M } from './messages';
import { Msg, UserError } from '../rules/msg';

export type Lang = 'zh' | 'en' | 'ja' | 'ko';

/** 切換鈕上的識別字：一眼就看得出是哪個語言 */
export const LANGS: { code: Lang; glyph: string; name: string; html: string }[] = [
  { code: 'zh', glyph: '中', name: '中文', html: 'zh-Hant-TW' },
  { code: 'en', glyph: 'A', name: 'English', html: 'en' },
  { code: 'ja', glyph: 'あ', name: '日本語', html: 'ja' },
  { code: 'ko', glyph: '한', name: '한국어', html: 'ko' },
];

const KEY = 'sf_erp.lang';
const COL: Record<Exclude<Lang, 'zh'>, number> = { en: 0, ja: 1, ko: 2 };

let lang: Lang = (() => {
  try {
    const v = localStorage.getItem(KEY);
    return LANGS.some((l) => l.code === v) ? (v as Lang) : 'zh';
  } catch { return 'zh'; }
})();
const subs = new Set<() => void>();

const applyHtmlLang = () => {
  if (typeof document !== 'undefined') document.documentElement.lang = LANGS.find((l) => l.code === lang)!.html;
};
applyHtmlLang();

export const getLang = () => lang;

export function setLang(l: Lang) {
  if (l === lang) return;
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* 存不了就只在這次有效 */ }
  applyHtmlLang();
  subs.forEach((f) => f());
}

export const useLang = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => lang);

type Vars<T> = Record<string, T> | T[];
// 只認翻譯表自己的鍵：資料夾名稱等外部字串也會丟進來，不能查到 constructor、__proto__ 之類的內建屬性
const lookup = (zh: string) => (lang === 'zh' || !Object.hasOwn(M, zh) ? zh : M[zh][COL[lang]]);

/**
 * 翻譯：zh 是中文原文（同時當作查表的鍵），{name} 或 {0} 會換成 vars 的值；
 * 英文單複數寫成 {0|day|days}：值為 1 時用前者。
 * 查不到翻譯時顯示中文，畫面不會空白。
 */
export function t(zh: string, vars?: Vars<string | number>): string {
  const s = lookup(zh);
  if (!vars) return s;
  const v = vars as Record<string, string | number>;
  return s
    .replace(/\{(\w+)\|([^|}]*)\|([^}]*)\}/g, (m, k: string, one: string, many: string) => (k in v ? (Number(v[k]) === 1 ? one : many) : m))
    .replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
}

/** 同 t，但 vars 可以放畫面元件（例如粗體、可點的單位） */
export function tr(zh: string, vars: Vars<ReactNode>): ReactNode {
  const v = vars as Record<string, ReactNode>;
  const parts = lookup(zh).split(/(\{\w+\})/).map((p) => {
    const m = /^\{(\w+)\}$/.exec(p);
    return m && m[1] in v ? v[m[1]] : p;
  });
  return createElement(Fragment, null, ...parts);
}

/** 規則層、資料層傳來的訊息（Msg）依目前語言翻譯；參數裡的 Msg 也一併翻譯 */
export function msgText(m: Msg | string): string {
  if (typeof m === 'string') return m;
  return t(m.key, m.args.map((a) => (a instanceof Msg ? msgText(a) : a)));
}

/** 錯誤要顯示給使用者的文字：UserError 依語言翻譯，其他錯誤顯示原始訊息 */
export const errorText = (e: unknown) => (e instanceof UserError ? msgText(e.msg) : e instanceof Error ? e.message : String(e));
