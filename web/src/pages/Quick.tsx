// 快速登記（規格第 6 節）
import { useState } from 'react';
import { go, useApp } from '../ui/app-context';
import { Icon } from '../ui/icons';
import { LeaveForm } from '../ui/LeaveForm';
import { isDateStr } from '../rules/rules';
import { t } from '../i18n';

const JUMP_KEY = 'sf_erp.quick_jump';
const readJump = () => { try { return localStorage.getItem(JUMP_KEY) === '1'; } catch { return false; } };

export function QuickPage() {
  const { route, toast } = useApp();
  const [count, setCount] = useState(0);
  // 送出後跳到出缺勤月曆，或留在這頁繼續登記；只記在瀏覽器
  const [jump, setJump] = useState(readJump);
  const toggleJump = (on: boolean) => {
    setJump(on);
    try { localStorage.setItem(JUMP_KEY, on ? '1' : '0'); } catch { /* 存不了就只在這次有效 */ }
  };
  const date = route.q.get('date');
  const emp = Number(route.q.get('emp')) || null;
  const jumpSwitch = (
    <label className="act-switch" data-tip={t('送出後跳到出缺勤月曆')}>
      <input type="checkbox" role="switch" className="sw" aria-label={t('送出後跳到出缺勤月曆')} checked={jump} onChange={(e) => toggleJump(e.target.checked)} />
    </label>
  );
  return (
    <div className="page" style={{ maxWidth: 1040, gap: 24 }}>
      <div className="page-head" style={{ alignItems: 'flex-end' }}>
        <div className="title" style={{ flex: '1 1 360px', gap: 6 }}>
          <h1 style={{ fontSize: 34 }}>{t('快速登記')}</h1>
          <span className="muted" style={{ fontSize: 15 }}>{t('一張假單登記一天。選好員工與假別，時數和扣款會自動算好。')}</span>
        </div>
        <span className="tag ok num">{t('這次已登記 {0} 筆', [count])}</span>
        <button type="button" className="btn" onClick={() => go('#/attendance')}><Icon name="calendar" size={18} />{t('出缺勤月曆')}</button>
      </div>
      <section className="card quick-card" aria-label={t('假單')} style={{ padding: 32 }}>
        <LeaveForm key={`${date}-${emp}`} variant="page" initial={{ date: date && isDateStr(date) ? date : undefined, employeeId: emp }}
          showDone={!jump} footerEnd={jumpSwitch}
          onSaved={(_, f) => {
            setCount((n) => n + 1);
            if (jump) { toast(t('已登記')); go(`#/attendance?ym=${f.date.slice(0, 7)}&sel=${f.date}`); }
          }} />
      </section>
    </div>
  );
}
