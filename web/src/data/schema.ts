// SQLite 資料表（對應 docs/規格.md 第 15 節）；以 PRAGMA user_version 記錄版本，依序套用
import { DEFAULT_LEAVE_TYPES } from '../rules/rules';

const seedTypes = DEFAULT_LEAVE_TYPES.map((t) =>
  `('${t.code}', '${t.name}', ${t.payRatio}, ${t.unitMinutes}, ${+t.segmentOnly}, ${+t.femaleOnly}, ${t.maxMinutes ?? 'NULL'}, ${+t.confirmTwice}, '${t.color}', ${t.sortOrder})`,
).join(',\n  ');

export const MIGRATIONS: string[] = [
  `
CREATE TABLE employee (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('M', 'F')),
  salary INTEGER NOT NULL CHECK (salary > 0),
  hire_date TEXT NOT NULL,
  annual_base_date TEXT NOT NULL,
  leave_date TEXT,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE leave_type (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pay_ratio REAL NOT NULL,
  unit_minutes INTEGER NOT NULL,
  segment_only INTEGER NOT NULL,
  female_only INTEGER NOT NULL,
  max_minutes INTEGER,
  confirm_twice INTEGER NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
INSERT INTO leave_type VALUES
  ${seedTypes};

CREATE TABLE leave_record (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  type_code TEXT NOT NULL REFERENCES leave_type(code),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  hours REAL NOT NULL,
  deduction INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX leave_record_date ON leave_record(date);
CREATE INDEX leave_record_emp ON leave_record(employee_id, date);

CREATE TABLE annual_settlement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  remaining_hours REAL NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('cash', 'defer', 'zero')),
  amount INTEGER NOT NULL,
  deferred_hours REAL NOT NULL DEFAULT 0,
  deferred_until TEXT,
  decided_at TEXT NOT NULL,
  UNIQUE (employee_id, period_start)
);

CREATE TABLE calendar_year (
  year INTEGER PRIMARY KEY,
  source_file TEXT NOT NULL,
  uploaded_at TEXT NOT NULL
);

CREATE TABLE calendar_day (
  date TEXT PRIMARY KEY,
  year INTEGER NOT NULL REFERENCES calendar_year(year),
  gov_holiday INTEGER NOT NULL,
  override INTEGER
);

CREATE TABLE app_setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO app_setting VALUES
  ('work_start', '09:30'), ('work_end', '18:30'), ('lunch_start', '12:00'), ('lunch_end', '13:30'),
  ('hours_per_day', '8'), ('annual_remind_days', '30'), ('backup_keep', '30');
`,
  // 特休到期處理從這天起追蹤；在這之前就到期的週年期間視為已在系統外處理
  `INSERT INTO app_setting VALUES ('annual_track_from', date('now', 'localtime'));`,
  // 特休改以半天為單位：上午、下午各 4h，全天 8h；既有紀錄一併換算（已處理的換錢／遞延紀錄不動）
  `
UPDATE leave_record SET hours = CASE WHEN start_time = '09:30' AND end_time = '18:30' THEN 8 ELSE 4 END WHERE type_code = 'annual';
UPDATE leave_type SET unit_minutes = 240 WHERE code = 'annual';
`,
  // 手動改放假日／上班日時記錄原因；原因快選清單（JSON 陣列）可在制度與設定修改
  `
ALTER TABLE calendar_day ADD COLUMN override_reason TEXT;
INSERT INTO app_setting VALUES ('day_reasons', '["颱風停班","公司自訂休假","補班","公司活動"]');
`,
  // 每筆紀錄記下登記當時的月本薪，編輯舊紀錄時以此重算扣款（不回溯調薪）；
  // 既有紀錄沒有當時薪資的資料，以升級時的薪資補上
  `
ALTER TABLE leave_record ADD COLUMN salary INTEGER NOT NULL DEFAULT 0;
UPDATE leave_record SET salary = (SELECT e.salary FROM employee e WHERE e.id = leave_record.employee_id);
`,
  // 遲到沒有分鐘上限（原為 30 分鐘）
  `
UPDATE leave_type SET max_minutes = NULL WHERE code = 'late';
`,
  // 新增曠職假別；扣除金額改存不取整的值（逐筆加總後才取整），既有紀錄依已存的時數與薪資重算
  `
INSERT OR IGNORE INTO leave_type VALUES ('absent', '曠職', 0, 30, 0, 0, NULL, 1, 'absent', 7);
UPDATE leave_record SET deduction = round(hours * 60) * salary
  * (1 - COALESCE((SELECT t.pay_ratio FROM leave_type t WHERE t.code = leave_record.type_code), 0)) / 14400.0;
`,
  // 部門：在制度與設定維護清單，員工可選一個（可為空）
  `
CREATE TABLE department (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
ALTER TABLE employee ADD COLUMN department_id INTEGER REFERENCES department(id);
`,
  // 颱風假：不能手動登記，颱風停班日（手動放假且原因含「颱風」）當天在職員工自動不支薪一天
  `
INSERT OR IGNORE INTO leave_type VALUES ('typhoon', '颱風假', 0, 480, 0, 0, NULL, 0, 'typhoon', 8);
`,
];
