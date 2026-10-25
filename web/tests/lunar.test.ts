import { describe, expect, it } from 'vitest';
import { lunarDayText, lunarText, solarTermOf, solarTerms } from '../src/ui/lunar';
import { festivalsOf } from '../src/ui/festivals';

describe('農民曆', () => {
  it('農曆日期：初一顯示月份，閏月照標示', () => {
    expect(lunarText('2026-10-25')).toBe('十六');
    expect(lunarText('2026-02-17')).toBe('正月');
    expect(lunarText('2025-07-25')).toBe('閏六月');
    expect([1, 10, 11, 20, 21, 30].map(lunarDayText)).toEqual(['初一', '初十', '十一', '二十', '廿一', '三十']);
  });
  it('節氣（台灣時間），含公式容易算錯的年份', () => {
    expect(solarTerms(2026).size).toBe(24);
    expect(solarTermOf('2026-02-18')).toBe('雨水');
    expect(solarTermOf('2026-04-05')).toBe('清明');
    expect(solarTermOf('2026-10-23')).toBe('霜降');
    expect(solarTermOf('2026-12-22')).toBe('冬至');
    expect(solarTermOf('2024-01-06')).toBe('小寒');
    expect(solarTermOf('2025-02-03')).toBe('立春');
    expect(solarTermOf('2027-03-06')).toBe('驚蟄');
  });
});

describe('節日', () => {
  it('國曆、農曆節日、母親節、除夕', () => {
    expect(festivalsOf('2026-10-10')).toEqual(['國慶日']);
    expect(festivalsOf('2026-02-16')).toEqual(['除夕']);
    expect(festivalsOf('2026-02-17')).toEqual(['春節']);
    expect(festivalsOf('2026-06-19')).toEqual(['端午節']);
    expect(festivalsOf('2026-09-25')).toEqual(['中秋節']);
    expect(festivalsOf('2026-05-10')).toEqual(['母親節']);
    expect(festivalsOf('2026-05-17')).toEqual([]);
    expect(festivalsOf('2025-07-25')).toEqual([]);
  });
});
