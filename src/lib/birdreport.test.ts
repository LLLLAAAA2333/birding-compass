import { describe, expect, it } from 'vitest';
import { createCipheriv } from 'node:crypto';
import { decodeBirdReportResponse, prepareBirdReportRequest, reportUrl } from './birdreportProtocol';
import { normalizeBirdReport, dateRange } from './birdreport';

describe('record center protocol', () => {
  it('encodes Chinese form values and signs the exact canonical payload', async () => {
    const request = await prepareBirdReportRequest({ page: 1, pointName: '合肥 市' }, 1000, 'request');
    expect(request.headers.sign).toBe('efab5eb1d77acc8f0498b8bf6650f3f4');
    expect(request.body).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
  it('decodes the public web response and stops on a verification response', async () => {
    const cipher = createCipheriv('aes-256-cbc', Buffer.from('C8EB5514AF5ADDB94B2207B08C66601C'), Buffer.from('55DD79C6F04E1A67'));
    const data = Buffer.concat([cipher.update(JSON.stringify([{ taxon_name: '白鹭' }])), cipher.final()]).toString('base64');
    expect((await decodeBirdReportResponse({ code: 0, count: 1, data })).data).toEqual([{ taxon_name: '白鹭' }]);
    await expect(decodeBirdReportResponse({ code: 405 })).rejects.toThrow(/验证/);
    await expect(decodeBirdReportResponse({ code: 0, data: 'broken' })).rejects.toThrow(/格式/);
  });
  it('builds the website report URL without trusting upstream URLs', () => {
    const url = new URL(reportUrl('1e90e525-0f9f-4331-a11c-c24d5115382a'));
    expect(JSON.parse(atob(url.searchParams.get('param')!)).reportId).toBe('1e90e525-0f9f-4331-a11c-c24d5115382a');
    expect(() => reportUrl('javascript:alert(1)')).toThrow();
  });
});

const report = { reportId: '1e90e525-0f9f-4331-a11c-c24d5115382a', serialId: '2026092601193', startTime: '2026-09-26 13:00', address: '合肥某公园', location: '117.30385,31.84354', pointId: 122097 };
const taxa = [{ taxon_id: 4145, taxon_name: '山斑鸠', latinname: 'Streptopelia orientalis', englishname: 'Oriental Turtle Dove', taxon_count: 1, outside_type: 0 }];
it('keeps source IDs and converts Baidu coordinates before mapping', () => {
  const [row] = normalizeBirdReport(report, taxa, '2026-09-26T08:00:00Z');
  expect(row.source).toBe('birdreport');
  expect(row.sourceRecordId).toBe(`${report.reportId}:4145`);
  expect(row.position!.longitude).toBeCloseTo(117.292, 2);
  expect(row.position!.latitude).toBeCloseTo(31.839, 2);
  expect(row.coordinateNote).toMatch(/BD-09/);
  expect(row.quality).toBe('unflagged');
});
it('keeps records without coordinates off the map and preserves flagged / unknown counts', () => {
  const [row] = normalizeBirdReport({ ...report, location: '' }, [{ ...taxa[0], outside_type: 1, taxon_count: 'X' }], '2026-09-26T08:00:00Z');
  expect(row.position).toBeNull();
  expect(row.quality).toBe('flagged');
  expect(row.count).toBeNull();
  expect(normalizeBirdReport({ ...report, location: '0,0' }, taxa, '')[0]?.position).toBeNull();
});
it('rejects malformed dates and calculates inclusive China calendar days', () => {
  expect(dateRange(7, new Date('2026-09-25T20:00:00Z'))).toEqual({ startTime: '2026-09-20', endTime: '2026-09-26' });
  expect(normalizeBirdReport({ ...report, startTime: '2026-02-30' }, taxa, '')).toEqual([]);
});
