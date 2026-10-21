// 測試用範例資料：只在「瀏覽器內部儲存（測試用）」模式出現，不會碰到正式資料夾
import { Db } from './db';
import { daysInMonth, weekday, ymd } from '../rules/rules';

const EMPLOYEES = [
  ['陳怡君', 'F', 36000, '2021-03-01'], ['林志明', 'M', 42000, '2023-08-15'], ['張雅婷', 'F', 33000, '2025-09-01'],
  ['黃建宏', 'M', 36000, '2019-11-01'], ['李佩珊', 'F', 42000, '2016-11-15'], ['吳承翰', 'M', 38000, '2024-02-01'],
  ['劉宜蓁', 'F', 35000, '2026-02-02'], ['蔡明哲', 'M', 40000, '2012-05-01'],
] as const;

const SEG: Record<string, [string, string]> = { full: ['09:30', '18:30'], am: ['09:30', '12:00'], pm: ['13:30', '18:30'], h1: ['09:30', '10:30'] };

const RECORDS: [number, number, string, string, string?][] = [
  [1, 1, 'sick', 'pm'], [2, 0, 'annual', 'full'], [5, 5, 'personal', 'am'], [5, 2, 'late', '09:42'],
  [6, 3, 'annual', 'full'], [6, 4, 'official', 'full'], [7, 6, 'menstrual', 'full'], [8, 7, 'personal', 'full'], [8, 0, 'late', '09:38'],
  [12, 3, 'annual', 'full'], [12, 5, 'sick', 'full'], [12, 1, 'personal', 'h1'], [12, 6, 'annual', 'am'], [12, 4, 'late', '09:50'],
  [13, 2, 'sick', 'pm'], [14, 0, 'official', 'am'], [15, 7, 'annual', 'full'],
  [16, 5, 'annual', 'full'], [16, 6, 'personal', 'am'], [16, 1, 'late', '09:35'],
  [19, 0, 'annual', 'full', ''], [19, 1, 'sick', 'pm', '看診'], [19, 2, 'late', '09:42', '交通'],
  [20, 3, 'personal', 'am'], [21, 4, 'annual', 'full'], [21, 7, 'sick', 'am'],
  [23, 5, 'official', 'full'], [23, 6, 'annual', 'full'], [23, 0, 'personal', 'h1', '家中有事'], [23, 2, 'sick', 'am'],
];

export function seedDemo(db: Db) {
  const holidays: string[] = [];
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= daysInMonth(2026, m); d++) {
      const date = ymd(2026, m, d);
      if (weekday(date) === 0 || weekday(date) === 6) holidays.push(date);
    }
  }
  holidays.push('2026-10-09');
  db.importCalendar(2026, holidays, '範例資料（週末＋10/9）');
  const depts = ['業務部', '行政部', '技術部'].map((n) => db.saveDepartment(n));
  const ids = EMPLOYEES.map(([name, gender, salary, hireDate], i) =>
    db.saveEmployee({ name, gender, salary, hireDate, annualBaseDate: '', leaveDate: '', email: '', phone: '', departmentId: i % 4 === 3 ? '' : depts[i % 3] }));
  for (const [d, e, type, seg, reason = ''] of RECORDS) {
    const [start, end] = type === 'late' ? ['09:30', seg] : SEG[seg];
    db.saveLeave({ employeeId: ids[e], date: ymd(2026, 10, d), type, start, end, reason });
  }
}
