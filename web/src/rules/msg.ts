// 規則層與資料層的訊息：只記中文原文（同時當作訊息代碼）與參數，不依賴目前的介面語言。
// 畫面層用 i18n 的 msgText() 依語言翻譯；toString() 是中文全文，給共用測試案例、標準版對照與除錯用

export type MsgArg = string | number | Msg;

export class Msg {
  constructor(readonly key: string, readonly args: readonly MsgArg[] = []) {}

  toString(): string {
    return this.key.replace(/\{(\d+)\}/g, (m, i: string) => (Number(i) < this.args.length ? String(this.args[Number(i)]) : m));
  }
}

export const msg = (key: string, args: MsgArg[] = []) => new Msg(key, args);

/** 使用者看得懂、可以直接顯示的錯誤（例如「這天是放假日」）；其他錯誤視為程式問題 */
export class UserError extends Error {
  readonly msg: Msg;
  constructor(m: Msg) {
    super(m.toString());
    this.msg = m;
  }
}
