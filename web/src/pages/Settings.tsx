// 制度與設定（規格第 12 節）
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../ui/app-context';
import { CalendarUpload } from '../ui/CalendarUpload';
import { Icon } from '../ui/icons';
import { downloadBlob, typeColor } from '../ui/format';
import { remindDays } from '../ui/derive';
import { LEAVE_TYPE_NOTES, payText, unitText } from '../rules/rules';
import type { FolderInfo } from '../data/storage';

export function SettingsPage() {
  const { st, src, lite, run, toast, today } = useApp();
  const [info, setInfo] = useState<FolderInfo | null>(null);
  const legacyInput = useRef<HTMLInputElement>(null);
  useEffect(() => { lite?.info().then(setInfo).catch(() => setInfo(null)); }, [lite, st]);

  const importLegacy = async (file: File | undefined) => {
    if (!file) return;
    const r = await run(() => src.importLegacy(file));
    if (r) toast(`已匯入舊版資料：員工 ${r.employees} 人、紀錄 ${r.leaves} 筆、行事曆 ${r.years.join('、') || '無'}（手動修改 ${r.overrides} 天）`);
    if (legacyInput.current) legacyInput.current.value = '';
  };
  const empty = st.employees.length === 0 && st.leaves.length === 0;

  return (
    <div className="page">
      <div className="title" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1>制度與設定</h1>
        <span className="muted">規則直接取自系統設定，這裡改了，登記與計算就會照新設定走。</span>
      </div>

      <section className="card table-box">
        <div style={{ padding: '22px 22px 6px' }}><h2>假別</h2></div>
        <table className="tbl">
          <thead><tr><th>假別</th><th>給薪比例</th><th>最小單位</th><th>限制</th><th>送出前雙重確認</th></tr></thead>
          <tbody>
            {st.leaveTypes.map((t) => (
              <tr key={t.code}>
                <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><span className="dot" style={{ background: typeColor(t), width: 10, height: 10 }} /><b>{t.name}</b></span></td>
                <td className="num">{Math.round(t.payRatio * 100)}%（{payText(t.payRatio)}）</td>
                <td>{unitText(t)}</td>
                <td className="muted" style={{ whiteSpace: 'normal' }}>{LEAVE_TYPE_NOTES[t.code] ?? '—'}</td>
                <td>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
                    <input type="checkbox" role="switch" className="sw" checked={t.confirmTwice} disabled={src.readOnly}
                      onChange={(e) => run(() => src.setConfirmTwice(t.code, e.target.checked), `${t.name}：雙重確認已${e.target.checked ? '開啟' : '關閉'}`)} />
                    <span style={{ fontWeight: 700 }}>{t.confirmTwice ? '開' : '關'}</span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small" style={{ margin: 0, padding: '4px 22px 20px' }}>開啟後，快速登記與月曆編輯在送出前會先顯示確認畫面，列出員工、日期、時數與扣款。</p>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 20 }}>
        <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ marginBottom: 6 }}>上班時間與扣款</h2>
          <div className="kvrow"><span className="muted">上班</span><b className="num">{st.settings.work_start}～{st.settings.work_end}</b></div>
          <div className="kvrow"><span className="muted">午休</span><b className="num">{st.settings.lunch_start}～{st.settings.lunch_end}</b></div>
          <div className="kvrow"><span className="muted">上午／下午／全天</span><b className="num">2.5 h／5 h／7.5 h</b></div>
          <div className="kvrow"><span className="muted">日數換算</span><b>1 日 = {st.settings.hours_per_day} h</b></div>
          <div className="kvrow"><span className="muted">時薪</span><b>本薪 ÷ 30 ÷ 8</b></div>
          <div style={{ marginTop: 8, padding: 14, borderRadius: 12, background: 'var(--raised)', fontSize: 13 }}>
            <b>扣除金額 = 時數 × 時薪 × (1 − 給薪比例)</b><br />
            <span className="muted num">例：本薪 36,000 → 時薪 150；病假 5 h → 5 × 150 × 0.5 = NT$ 375</span>
          </div>
        </section>

        <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ marginBottom: 6 }}>特休核給（勞基法 §38 週年制）</h2>
          {[['滿 6 個月', '3 日'], ['滿 1 年', '7 日'], ['滿 2 年', '10 日'], ['滿 3 年', '14 日'], ['滿 5 年', '15 日'], ['滿 10 年起', '每年加 1 日，最多 30 日']].map(([k, v]) => (
            <div key={k} className="kvrow"><span className="muted">{k}</span><b className="num">{v}</b></div>
          ))}
        </section>

        <section className="card pad stack">
          <h2>特休到期處理</h2>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span>到期前提醒</span>
            <select className="input" style={{ width: 'auto' }} value={remindDays(st)} disabled={src.readOnly}
              onChange={(e) => run(() => src.setSetting('annual_remind_days', e.target.value), '已更新提醒天數')}>
              {[14, 30, 60].map((n) => <option key={n} value={n}>{n} 天</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span>從這天起追蹤<br /><span className="muted small">在這之前到期的視為已在系統外處理</span></span>
            <input className="input" type="date" style={{ width: 'auto' }} value={st.settings.annual_track_from ?? ''} disabled={src.readOnly}
              onChange={(e) => e.target.value && run(() => src.setSetting('annual_track_from', e.target.value), '已更新追蹤起算日')} />
          </label>
          <div className="stack" style={{ gap: 8, fontSize: 13 }}>
            <div><b>換錢</b><span className="muted">：剩餘時數 × 處理當下的時薪，列入下一期薪資加項</span></div>
            <div><b>遞延</b><span className="muted">：延長一年；遞延額度到期時只能換錢。請特休時先扣遞延額度</span></div>
            <div><b>歸零</b><span className="muted">：需公司全體同意</span></div>
            <div><b>離職</b><span className="muted">：剩餘特休一律換錢</span></div>
          </div>
          <div className="alert warn" style={{ fontSize: 13 }}>選擇「歸零」時會再提示一次：可能違反勞基法 §38 第 4 項。</div>
        </section>

        <section className="card pad stack" style={{ gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h2 className="spacer">行事曆</h2>
            <CalendarUpload primary />
          </div>
          {st.calendarYears.length === 0 && <span className="muted">還沒有匯入任何年度。</span>}
          {st.calendarYears.map((c) => (
            <div key={c.year} className="kvrow">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><b className="num">{c.year}</b><span className="tag ok">已匯入</span></span>
              <span className="muted num" style={{ fontSize: 13 }}>{c.overrides ? `手動改過 ${c.overrides} 天 · ` : ''}{c.uploadedAt.slice(0, 10)} 匯入</span>
            </div>
          ))}
          <span className="muted small" style={{ marginTop: 8 }}>檔案：人事行政總處「政府行政機關辦公日曆表.xlsx」。重新上傳同一年度時，手動改過的日子不會被覆蓋。</span>
        </section>

        {lite && (
          <section className="card pad stack" style={{ gap: 4 }}>
            <h2 style={{ marginBottom: 8 }}>資料檔與備份</h2>
            <div className="kvrow"><span className="muted">資料夾</span><b style={{ wordBreak: 'break-all' }}>{lite.store.label}</b></div>
            <div className="kvrow"><span className="muted">資料檔</span><b className="num">sf_erp.sqlite · {info ? `${(info.size / 1024).toFixed(0)} KB` : '—'}</b></div>
            <div className="kvrow"><span className="muted">最近備份</span><b className="num">{info?.lastBackup ?? '尚未備份'}{info?.backups ? `（共 ${info.backups} 份）` : ''}</b></div>
            <div className="kvrow"><span className="muted">保留份數</span><b className="num">{st.settings.backup_keep} 份</b></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <button type="button" className="btn sm" disabled={src.readOnly} onClick={async () => {
                const n = await run(() => lite.backupNow());
                if (n) { toast(`已備份到 backup/${n}`); setInfo(await lite.info()); }
              }}>立即備份</button>
              <button type="button" className="btn sm" onClick={() => downloadBlob(`sf_erp_${today}.sqlite`, lite.exportBlob())}><Icon name="download" size={16} />匯出給標準版</button>
              <button type="button" className="btn sm" onClick={() => { location.hash = ''; location.reload(); }}>換資料夾</button>
            </div>
          </section>
        )}

        {empty && (
          <section className="card pad stack">
            <h2>匯入舊版資料</h2>
            <span className="muted">把舊版（v1.2）的 <b>data/db.json</b> 匯入這個資料檔：員工、出缺勤紀錄、行事曆（含手動修改）全部轉入。只能匯入到還沒有資料的資料檔。</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn sm primary" disabled={src.readOnly} onClick={() => legacyInput.current?.click()}><Icon name="upload" size={16} />選擇 db.json</button>
              {lite?.store.ephemeral && <button type="button" className="btn sm" onClick={() => run(() => lite.seedDemo(), '已載入範例資料')}>載入範例資料（測試用）</button>}
            </div>
            <input ref={legacyInput} type="file" accept=".json,application/json" hidden onChange={(e) => importLegacy(e.target.files?.[0])} />
          </section>
        )}
      </div>
    </div>
  );
}
