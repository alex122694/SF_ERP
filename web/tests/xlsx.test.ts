import { describe, expect, it } from 'vitest';
import { buildXlsx } from '../src/data/xlsxWrite';
import { unzip } from '../src/data/calendarXlsx';
import { csvText } from '../src/ui/format';
import { zipStored } from '../src/data/xlsxWrite';

describe('xlsx 匯出', () => {
  it('置中對齊、自動換行，列高依行數最多的一格', async () => {
    const bytes = buildXlsx('請假總覽', {
      rows: [['姓名', '本薪', '假別'], ['陳怡君', 36000, '特休\n事假\n遲到'], ['A&B <x>', 0, '']],
      widths: [14, 12, 14],
      boldRows: [0],
    });
    const files = await unzip(bytes);
    const dec = new TextDecoder();
    expect([...files.keys()]).toEqual(expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/styles.xml']));
    const sheet = dec.decode(files.get('xl/worksheets/sheet1.xml'));
    const styles = dec.decode(files.get('xl/styles.xml'));
    expect(styles).toContain('<alignment horizontal="center" vertical="center" wrapText="1"/>');
    expect(sheet).toContain('<row r="1" ht="18" customHeight="1"><c r="A1" s="2" t="inlineStr">');
    expect(sheet).toContain('<row r="2" ht="54" customHeight="1">');
    expect(sheet).toContain('<c r="B2" s="1"><v>36000</v></c>');
    expect(sheet).toContain('特休\n事假\n遲到');
    expect(sheet).toContain('A&amp;B &lt;x&gt;');
    expect(dec.decode(files.get('xl/workbook.xml'))).toContain('<sheet name="請假總覽"');
  });
});

describe('CSV 匯出', () => {
  it('以 = + - @ 開頭的文字前面加單引號，避免被 Excel 當成公式；數字不變', () => {
    const text = csvText([['=SUM(A1)', '+886', '-x', '@me', 'a,b', 'ok', -5, 3]]);
    expect(text).toBe('﻿' + "'=SUM(A1),'+886,'-x,'@me,\"a,b\",ok,-5,3");
  });
});

describe('解壓縮上限', () => {
  it('解開後超過上限就停止', async () => {
    const big = new Uint8Array(2048);
    const zip = zipStored([{ name: 'a.xml', data: big }, { name: 'b.xml', data: big }]);
    await expect(unzip(zip, 3000)).rejects.toThrow('超過');
    expect((await unzip(zip, 5000)).size).toBe(2);
  });
});
