// 快速登記（規格第 6 節）
import { useState } from 'react';
import { useApp } from '../ui/app-context';
import { LeaveForm } from '../ui/LeaveForm';
import { isDateStr } from '../rules/rules';

export function QuickPage() {
  const { route } = useApp();
  const [count, setCount] = useState(0);
  const date = route.q.get('date');
  const emp = Number(route.q.get('emp')) || null;
  return (
    <div className="page" style={{ maxWidth: 1040, gap: 24 }}>
      <div className="page-head" style={{ alignItems: 'flex-end' }}>
        <div className="title" style={{ flex: '1 1 360px', gap: 6 }}>
          <h1 style={{ fontSize: 34 }}>快速登記</h1>
          <span className="muted" style={{ fontSize: 15 }}>一張假單登記一天。選好員工與假別，時數和扣款會自動算好。</span>
        </div>
        <span className="tag ok num">這次已登記 {count} 筆</span>
      </div>
      <section className="card" aria-label="假單" style={{ padding: 32 }}>
        <LeaveForm key={`${date}-${emp}`} variant="page" initial={{ date: date && isDateStr(date) ? date : undefined, employeeId: emp }}
          onSaved={() => setCount((n) => n + 1)} />
      </section>
    </div>
  );
}
