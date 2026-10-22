// 制度與設定（規格第 12 節）
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../ui/app-context';
import { CalendarUpload } from '../ui/CalendarUpload';
import { Icon } from '../ui/icons';
import { downloadBlob, typeColor, typeName } from '../ui/format';
import { dayReasons, remindDays } from '../ui/derive';
import { LEAVE_TYPE_NOTES, payText, unitText } from '../rules/rules';
import type { FolderInfo } from '../data/storage';
import { msgText, t, tr } from '../i18n';

export function SettingsPage() {
  const { st, src, lite, run, toast, today } = useApp();
  const [info, setInfo] = useState<FolderInfo | null>(null);
  const legacyInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const { confirm } = useApp();
  // 選備份檔 → 顯示內容摘要確認 → 整份取代（取代前目前的資料先另存到 backup/）
  const restore = async (file: File | undefined) => {
    if (backupInput.current) backupInput.current.value = '';
    if (!file || !lite) return;
    const p = await run(() => lite.previewBackup(file));
    if (!p) return;
    const ok = await confirm({
      title: t('用這份備份取代目前的資料？'),
      body: <div className="stack" style={{ gap: 6 }}>
        <b style={{ wordBreak: 'break-all' }}>{p.name}</b>
        <span>{t('員工 {0} 人、請假紀錄 {1} 筆', [p.employees, p.leaves])}{p.from && p.to ? t('（{0} ～ {1}）', [p.from, p.to]) : ''}</span>
        <span className="muted">{t('目前的資料會整份被取代；取代前會先另存到 backup/ 資料夾（sf_erp-before-restore-…），之後還能再還原回來。')}</span>
      </div>,
      ok: t('取代並還原'), danger: true,
    });
    if (!ok) return;
    const snap = await run(() => lite.restoreBackup(p));
    if (snap) { toast(t('已還原；原本的資料另存為 backup/{0}', [snap])); setInfo(await lite.info()); }
  };
  useEffect(() => { lite?.info().then(setInfo).catch(() => setInfo(null)); }, [lite, st]);

  const importLegacy = async (file: File | undefined) => {
    if (!file) return;
    const r = await run(() => src.importLegacy(file));
    if (r) toast(t('已匯入舊版資料：員工 {0} 人、紀錄 {1} 筆、行事曆 {2}（手動修改 {3} 天）', [r.employees, r.leaves, r.years.join(t('、')) || t('無'), r.overrides]));
    if (legacyInput.current) legacyInput.current.value = '';
  };
  const empty = st.employees.length === 0 && st.leaves.length === 0;

  return (
    <div className="page">
      <div className="title" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1>{t('制度與設定')}</h1>
        <span className="muted">{t('規則直接取自系統設定，這裡改了，登記與計算就會照新設定走。')}</span>
      </div>

      <section className="card table-box">
        <div style={{ padding: '22px 22px 6px' }}><h2>{t('假別')}</h2></div>
        <table className="tbl">
          <thead><tr><th>{t('假別')}</th><th>{t('給薪比例')}</th><th>{t('最小單位')}</th><th>{t('限制')}</th><th>{t('送出前雙重確認')}</th></tr></thead>
          <tbody>
            {st.leaveTypes.map((tp) => (
              <tr key={tp.code}>
                <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><span className="dot" style={{ background: typeColor(tp), width: 10, height: 10 }} /><b>{typeName(tp)}</b></span></td>
                <td className="num">{t('{0}%（{1}）', [Math.round(tp.payRatio * 100), msgText(payText(tp.payRatio))])}</td>
                <td>{msgText(unitText(tp))}</td>
                <td className="muted" style={{ whiteSpace: 'normal' }}>{LEAVE_TYPE_NOTES[tp.code] ? t(LEAVE_TYPE_NOTES[tp.code]) : '—'}</td>
                <td>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
                    <input type="checkbox" role="switch" className="sw" checked={tp.confirmTwice} disabled={src.readOnly}
                      onChange={(e) => run(() => src.setConfirmTwice(tp.code, e.target.checked), t(e.target.checked ? '{0}：雙重確認已開啟' : '{0}：雙重確認已關閉', [typeName(tp)]))} />
                    <span style={{ fontWeight: 700 }}>{tp.confirmTwice ? t('開') : t('關')}</span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small" style={{ margin: 0, padding: '4px 22px 20px' }}>{t('開啟後，快速登記與月曆編輯在送出前會先顯示確認畫面，列出員工、日期、時數與扣款。')}</p>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 20 }}>
        <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ marginBottom: 6 }}>{t('上班時間與扣款')}</h2>
          <div className="kvrow"><span className="muted">{t('上班')}</span><b className="num">{st.settings.work_start}～{st.settings.work_end}</b></div>
          <div className="kvrow"><span className="muted">{t('午休')}</span><b className="num">{st.settings.lunch_start}～{st.settings.lunch_end}</b></div>
          <div className="kvrow"><span className="muted">{t('上午／下午／全天')}</span><b className="num">{t('2.5 h／5 h／8 h')}</b></div>
          <span className="muted small" style={{ margin: '-2px 0 4px' }}>{t('請整天（涵蓋整個工作時段）直接算 8 小時；上午、下午等其他時段依實際工時計。')}</span>
          <div className="kvrow"><span className="muted">{t('日數換算')}</span><b>{t('1 日 = {0} h', [st.settings.hours_per_day])}</b></div>
          <div className="kvrow"><span className="muted">{t('月結區間')}</span><b>{t('上月 23 日 ～ 本月 22 日')}</b></div>
          <div className="kvrow"><span className="muted">{t('時薪')}</span><b>{t('本薪 ÷ 30 ÷ 8')}</b></div>
          <div style={{ marginTop: 8, padding: 14, borderRadius: 12, background: 'var(--raised)', fontSize: 13 }}>
            <b>{t('扣除金額 = 時數 × 時薪 × (1 − 給薪比例)')}</b><br />
            <span className="muted num">{t('例：本薪 36,000 → 時薪 150；病假 5 h → 5 × 150 × 0.5 = NT$ 375')}</span>
          </div>
        </section>

        <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ marginBottom: 6 }}>{t('特休核給（勞基法 §38 週年制）')}</h2>
          {[['滿 6 個月', '3 日'], ['滿 1 年', '7 日'], ['滿 2 年', '10 日'], ['滿 3 年', '14 日'], ['滿 5 年', '15 日'], ['滿 10 年起', '每年加 1 日，最多 30 日']].map(([k, v]) => (
            <div key={k} className="kvrow"><span className="muted">{t(k)}</span><b className="num">{t(v)}</b></div>
          ))}
          <p className="muted small" style={{ margin: '8px 0 0' }}>{t('年資與特休依勞基法 §38 週年制自動計算，從特休年資起算日算起；特休額度＝日數 × 8 h（含上期遞延），以半天為單位請休；點特休數字後面的「天」可切換成小時。')}</p>
        </section>

        <section className="card pad stack">
          <h2>{t('特休到期處理')}</h2>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span>{t('到期前提醒')}</span>
            <select className="input" style={{ width: 'auto' }} value={remindDays(st)} disabled={src.readOnly}
              onChange={(e) => run(() => src.setSetting('annual_remind_days', e.target.value), t('已更新提醒天數'))}>
              {[14, 30, 60].map((n) => <option key={n} value={n}>{t('{0} 天', [n])}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span>{t('從這天起追蹤')}<br /><span className="muted small">{t('在這之前到期的視為已在系統外處理')}</span></span>
            <input className="input" type="date" style={{ width: 'auto' }} value={st.settings.annual_track_from ?? ''} disabled={src.readOnly}
              onChange={(e) => e.target.value && run(() => src.setSetting('annual_track_from', e.target.value), t('已更新追蹤起算日'))} />
          </label>
          <div className="stack" style={{ gap: 8, fontSize: 13 }}>
            <div><b>{t('換錢')}</b><span className="muted">{t('：剩餘時數 × 處理當下的時薪，列入下一期薪資加項')}</span></div>
            <div><b>{t('遞延')}</b><span className="muted">{t('：延長一年；遞延額度到期時只能換錢。請特休時先扣遞延額度')}</span></div>
            <div><b>{t('歸零')}</b><span className="muted">{t('：需公司全體同意')}</span></div>
            <div><b>{t('離職')}</b><span className="muted">{t('：剩餘特休一律換錢')}</span></div>
          </div>
          <div className="alert warn" style={{ fontSize: 13 }}>{t('選擇「歸零」時會再提示一次：可能違反勞基法 §38 第 4 項。')}</div>
        </section>

        <section className="card pad stack" style={{ gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h2 className="spacer">{t('行事曆')}</h2>
            <CalendarUpload primary />
          </div>
          {st.calendarYears.length === 0 && <span className="muted">{t('還沒有匯入任何年度。')}</span>}
          {st.calendarYears.map((c) => (
            <div key={c.year} className="kvrow">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><b className="num">{c.year}</b><span className="tag ok">{t('已匯入')}</span></span>
              <span className="muted num" style={{ fontSize: 13 }}>{c.overrides ? t('手動改過 {0} 天 · ', [c.overrides]) : ''}{t('{0} 匯入', [c.uploadedAt.slice(0, 10)])}</span>
            </div>
          ))}
          <span className="muted small" style={{ marginTop: 8 }}>{t('檔案：人事行政總處「政府行政機關辦公日曆表.xlsx」。重新上傳同一年度時，手動改過的日子不會被覆蓋。')}</span>
          <DayReasonsEditor />
        </section>

        <DepartmentsEditor />

        {lite && (
          <section className="card pad stack" style={{ gap: 4 }}>
            <h2 style={{ marginBottom: 8 }}>{t('資料檔與備份')}</h2>
            <div className="kvrow"><span className="muted">{t('資料夾')}</span><b style={{ wordBreak: 'break-all' }}>{t(lite.store.label)}</b></div>
            <div className="kvrow"><span className="muted">{t('儲存狀態')}</span><b className="num" style={{ color: lite.status?.error ? 'var(--danger)' : undefined }}>{
              lite.readOnly ? t('唯讀（另一個分頁開著）')
                : lite.status?.error ? t('上次存檔失敗')
                : lite.status?.saving ? t('儲存中…')
                : lite.status?.savedAt ? t('已自動儲存 · {0}', [`${String(lite.status.savedAt.getHours()).padStart(2, '0')}:${String(lite.status.savedAt.getMinutes()).padStart(2, '0')}`]) : '—'
            }</b></div>
            <div className="kvrow"><span className="muted">{t('資料檔')}</span><b className="num">sf_erp.sqlite · {info ? `${(info.size / 1024).toFixed(0)} KB` : '—'}</b></div>
            <div className="kvrow"><span className="muted">{t('最近備份')}</span><b className="num">{info?.lastBackup ?? t('尚未備份')}{info?.backups ? t('（共 {0} 份）', [info.backups]) : ''}</b></div>
            <div className="kvrow"><span className="muted">{t('保留份數')}</span><b className="num">{t('{0} 份', [st.settings.backup_keep])}</b></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <button type="button" className="btn sm" disabled={src.readOnly} onClick={async () => {
                const n = await run(() => lite.backupNow());
                if (n) { toast(t('已備份到 backup/{0}', [n])); setInfo(await lite.info()); }
              }}>{t('立即備份')}</button>
              <button type="button" className="btn sm" disabled={src.readOnly} onClick={() => backupInput.current?.click()}><Icon name="upload" size={16} />{t('從備份還原')}</button>
              <button type="button" className="btn sm" onClick={() => downloadBlob(`sf_erp_${today}.sqlite`, lite.exportBlob())}><Icon name="download" size={16} />{t('匯出給標準版')}</button>
              <button type="button" className="btn sm" onClick={() => { location.hash = ''; location.reload(); }}>{t('換資料夾')}</button>
            </div>
            <input ref={backupInput} type="file" accept=".sqlite,.sqlite3,.db,application/vnd.sqlite3" hidden onChange={(e) => restore(e.target.files?.[0])} />
          </section>
        )}

        {empty && (
          <section className="card pad stack">
            <h2>{t('匯入舊版資料')}</h2>
            <span className="muted">{tr('把舊版（v1.2）的 {0} 匯入這個資料檔：員工、出缺勤紀錄、行事曆（含手動修改）全部轉入。只能匯入到還沒有資料的資料檔。', [<b>data/db.json</b>])}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn sm primary" disabled={src.readOnly} onClick={() => legacyInput.current?.click()}><Icon name="upload" size={16} />{t('選擇 db.json')}</button>
              {lite?.store.ephemeral && <button type="button" className="btn sm" onClick={() => run(() => lite.seedDemo(), t('已載入範例資料'))}>{t('載入範例資料（測試用）')}</button>}
            </div>
            <input ref={legacyInput} type="file" accept=".json,application/json" hidden onChange={(e) => importLegacy(e.target.files?.[0])} />
          </section>
        )}
      </div>
    </div>
  );
}

/** 部門清單：新增、改名（改完離開欄位自動儲存）、刪除（還有員工的部門不能刪除） */
function DepartmentsEditor() {
  const { st, src, run, confirm } = useApp();
  const [text, setText] = useState('');
  const add = async () => {
    const v = text.trim();
    if (!v) return;
    if ((await run(() => src.saveDepartment(v), t('已新增部門「{0}」', [v]))) !== undefined) setText('');
  };
  const del = async (id: number, name: string) => {
    if (await confirm({ title: t('刪除部門「{0}」？', [name]), ok: t('刪除'), danger: true })) await run(() => src.deleteDepartment(id), t('已刪除部門「{0}」', [name]));
  };
  return (
    <section className="card pad stack" style={{ gap: 8 }}>
      <h2 style={{ marginBottom: 4 }}>{t('部門')}</h2>
      <span className="muted small">{t('員工主檔可以選擇部門（也可以留空）；請假總覽匯出時可依部門篩選。')}</span>
      {st.departments.length === 0 && <span className="muted">{t('還沒有部門。')}</span>}
      {st.departments.map((d) => (
        <DepartmentRow key={`${d.id}-${d.name}`} id={d.id} name={d.name} count={st.employees.filter((e) => e.departmentId === d.id).length} onDelete={() => del(d.id, d.name)} />
      ))}
      <form style={{ display: 'flex', gap: 8, marginTop: 4 }} onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={30} placeholder={t('新增部門，例如：業務部')} disabled={src.readOnly} />
        <button type="submit" className="btn sm" disabled={!text.trim() || src.readOnly}>{t('新增')}</button>
      </form>
    </section>
  );
}

function DepartmentRow({ id, name, count, onDelete }: { id: number; name: string; count: number; onDelete: () => void }) {
  const { src, run } = useApp();
  const [v, setV] = useState(name);
  const commit = async () => {
    const n = v.trim();
    if (n === name) return;
    if (!n || (await run(() => src.saveDepartment(n, id), t('已更新部門名稱'))) === undefined) setV(name);
  };
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input className="input" aria-label={t('部門名稱')} value={v} maxLength={30} disabled={src.readOnly}
        onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      <span className="muted small num" style={{ whiteSpace: 'nowrap' }}>{t('{0} 人', [count])}</span>
      <button type="button" className="btn sm danger" aria-label={t('刪除部門「{0}」？', [name])} onClick={onDelete} disabled={src.readOnly}>{t('刪除')}</button>
    </div>
  );
}

/** 手動改放假日／上班日的原因快選：新增、刪除 */
function DayReasonsEditor() {
  const { st, src, run } = useApp();
  const [text, setText] = useState('');
  const list = dayReasons(st);
  const save = (next: string[], msg: string) => run(() => src.setSetting('day_reasons', JSON.stringify(next)), msg);
  const add = async () => {
    const v = text.trim();
    if (!v || list.includes(v)) { setText(''); return; }
    if ((await save([...list, v], t('已新增快選「{0}」', [v]))) !== undefined) setText('');
  };
  return (
    <div className="stack" style={{ gap: 10, marginTop: 12, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
      <div className="stack" style={{ gap: 2 }}>
        <b>{t('手動改日的原因快選')}</b>
        <span className="muted small">{t('在出缺勤月曆把某天改為放假日或上班日時，必須填原因；這裡的項目會列成快選。')}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {list.length === 0 && <span className="muted small">{t('目前沒有快選。')}</span>}
        {list.map((r) => (
          <span key={r} className="tag" style={{ color: 'var(--text)', fontSize: 13, padding: '4px 6px 4px 12px' }}>
            {r}
            <button type="button" className="chip-x" aria-label={t('刪除快選「{0}」', [r])} disabled={src.readOnly}
              onClick={() => save(list.filter((x) => x !== r), t('已刪除快選「{0}」', [r]))}>×</button>
          </span>
        ))}
      </div>
      <form style={{ display: 'flex', gap: 8 }} onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={100} placeholder={t('新增原因，例如：颱風停班')} disabled={src.readOnly} />
        <button type="submit" className="btn sm" disabled={!text.trim() || src.readOnly}>{t('新增')}</button>
      </form>
    </div>
  );
}
