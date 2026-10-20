// 翻譯完整性：原始碼裡每一段畫面上的中文，都要在 messages.ts 有英、日、韓三種翻譯
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { M } from '../src/i18n/messages';
import { getLang, msgText, setLang, t } from '../src/i18n';
import { msg } from '../src/rules/msg';

const SRC = path.join(__dirname, '..', 'src');
// 中文字與全形標點（、（）＝ 等），翻成其他語言時都要換掉
const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/;

/** 不是畫面文字的中文：測試用範例資料、資料表預設值、翻譯模組本身、政府日曆的解析關鍵字、各語言的星期表 */
const SKIP_FILES = ['data/devSeed.ts', 'data/schema.ts', 'i18n/index.ts', 'i18n/messages.ts'];
const SKIP_LINE = [/const HEADER = \[/, /cell\.text\?\.trim\(\) !== '放假日'/, /cell\.text !== '日'/, /^\s*(zh|ja): \[/, /if \(getLang\(\) === 'zh'\) return/, /getLang\(\) === 'en' \|\| getLang\(\) === 'ko' \?/];

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? files(p) : /\.tsx?$/.test(d.name) && !d.name.endsWith('.d.ts') ? [p] : [];
  });
}

/** 去掉註解（保留字串裡的 // 例如網址） */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n');
}

function scan() {
  const keys = new Set<string>();
  const raw: string[] = []; // 沒包 t() 的 JSX 文字或樣板字串
  for (const f of files(SRC)) {
    const rel = path.relative(SRC, f).replaceAll('\\', '/');
    if (SKIP_FILES.includes(rel)) continue;
    const code = stripComments(fs.readFileSync(f, 'utf8'))
      .split('\n').filter((l) => !SKIP_LINE.some((r) => r.test(l))).join('\n');
    for (const m of code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) {
      const s = (m[1] ?? m[2]).replace(/\\(.)/g, '$1');
      if (CJK.test(s)) keys.add(s);
    }
    // 樣板字串裡已經包在 t('…') 的中文不算
    for (const m of code.matchAll(/`((?:[^`\\]|\\.)*)`/g)) {
      if (CJK.test(m[1].replace(/\btr?\('(?:[^'\\]|\\.)*'/g, ''))) raw.push(`${rel}: \`${m[1]}\``);
    }
    for (const m of code.matchAll(/>([^<>{}()=;\n]*)</g)) if (CJK.test(m[1])) raw.push(`${rel}: >${m[1].trim()}<`);
  }
  return { keys: [...keys], raw };
}

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('i18n', () => {
  const { keys, raw } = scan();
  it('畫面上沒有漏包 t() 的中文', () => expect(raw).toEqual([]));
  it('每一段中文都有英、日、韓翻譯', () => expect(keys.filter((k) => !M[k])).toEqual([]));
  it('翻譯的 {變數} 與原文一致，且不是空字串', () => {
    const bad = Object.entries(M).filter(([k, v]) => v.some((x) => !x.trim() || vars(x) !== vars(k))).map(([k]) => k);
    expect(bad).toEqual([]);
  });
  it('翻譯表沒有用不到的項目', () => {
    const used = new Set(keys);
    expect(Object.keys(M).filter((k) => !used.has(k))).toEqual([]);
  });
});

describe('t()', () => {
  it('依語言查表並填入變數；查不到時顯示中文', () => {
    setLang('en');
    expect(t('{0} 人', [3])).toBe('3 people');
    expect(t('{0} 人', [1])).toBe('1 person');
    expect(t('沒有這段翻譯')).toBe('沒有這段翻譯');
    setLang('ko');
    expect(t('特休')).toBe('연차');
    setLang('zh');
    expect(getLang()).toBe('zh');
    expect(t('{0} 人', [3])).toBe('3 人');
  });
});

describe('msgText()', () => {
  it('訊息代碼依語言翻譯，參數裡的訊息也一起翻譯', () => {
    const m = msg('{0}只有女性可以選', [msg('生理假')]);
    expect(String(m)).toBe('生理假只有女性可以選');
    setLang('en');
    expect(msgText(m)).toBe('Menstrual leave is available to women only');
    // 只認翻譯表自己的鍵：內建屬性名稱照原文顯示
    expect(t('constructor')).toBe('constructor');
    expect(t('__proto__')).toBe('__proto__');
    setLang('zh');
  });
});
