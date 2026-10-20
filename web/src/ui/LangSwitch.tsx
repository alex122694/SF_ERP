// 語言切換：四個識別字分散對齊，發光的滑塊會移動到目前的語言
import type React from 'react';
import { LANGS, setLang, t, useLang } from '../i18n';

export function LangSwitch() {
  const lang = useLang();
  return (
    <div className="lang-switch" role="radiogroup" aria-label={t('介面語言')}
      style={{ '--i': LANGS.findIndex((l) => l.code === lang), '--n': LANGS.length } as React.CSSProperties}>
      <span className="lang-thumb" aria-hidden="true" />
      {LANGS.map((l) => (
        <button key={l.code} type="button" role="radio" aria-checked={lang === l.code} lang={l.html}
          className={lang === l.code ? 'lang on' : 'lang'} title={l.name} aria-label={l.name} onClick={() => setLang(l.code)}>
          {l.glyph}
        </button>
      ))}
    </div>
  );
}
