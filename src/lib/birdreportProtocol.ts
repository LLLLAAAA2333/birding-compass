import { JSEncrypt } from 'jsencrypt';
import { md5 } from '@noble/hashes/legacy.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

// Public wire-format constants shipped by birdreport.cn's own web client.
// These are not account credentials. Rechecked against the site on 2026-09-26.
const PUBLIC_KEY = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCvxXa98E1uWXnBzXkS2yHUfnBM6n3PCwLdfIox03T91joBvjtoDqiQ5x3tTOfpHs3LtiqMMEafls6b0YWtgB1dse1W5m+FpeusVkCOkQxB4SZDH6tuerIknnmB/Hsq5wgEkIvO5Pff9biig6AyoAkdWpSek/1/B7zYIepYY0lxKQIDAQAB';
const RESPONSE_KEY = 'C8EB5514AF5ADDB94B2207B08C66601C';
const RESPONSE_IV = '55DD79C6F04E1A67';
export class BirdReportError extends Error {
  constructor(message: string, readonly status = 0, readonly halt = false) { super(message); }
}
export type BirdReportEnvelope = { code: number; data: unknown; count?: number; success?: boolean; errorCode?: number };

export async function prepareBirdReportRequest(params: Record<string, string | number>, timestamp = Math.floor(Date.now() / 1000) * 1000, requestId = crypto.randomUUID().replace(/-/g, '')) {
  // The site's jQuery serializes form values before sorting and encrypting JSON.
  const data = JSON.stringify(Object.fromEntries(Object.keys(params).sort().map(key => [key, encodeURIComponent(String(params[key]))])));
  const rsa = new JSEncrypt();
  rsa.setPublicKey(PUBLIC_KEY);
  let binary = '';
  for (let i = 0; i < data.length; i += 117) {
    const part = rsa.encrypt(data.slice(i, i + 117));
    if (!part) throw new Error('记录中心请求编码失败');
    binary += atob(part);
  }
  return { body: btoa(binary), headers: {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    timestamp: String(timestamp), requestId,
    sign: bytesToHex(md5(utf8ToBytes(data + requestId + timestamp))),
  } };
}

export async function decodeBirdReportResponse(value: unknown): Promise<BirdReportEnvelope> {
  if (!value || typeof value !== 'object' || !('code' in value)) throw new Error('记录中心返回格式已变化');
  const row = value as Record<string, unknown>;
  const code = Number(row.code);
  if ([401, 403, 405, 505, 429].includes(code))
    throw new BirdReportError(code === 429 ? '记录中心请求受限，已暂停。请至少十分钟后手动重试。' : '记录中心需要网页验证或拒绝了查询，已暂停。请在官网检查访问状态后手动重试。', code, true);
  if (code !== 0) throw new BirdReportError('记录中心查询失败，请稍后重试', code);
  let data = row.data;
  if (typeof data === 'string' && data) {
    try {
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(RESPONSE_KEY), 'AES-CBC', false, ['decrypt']);
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: new TextEncoder().encode(RESPONSE_IV) }, key, Uint8Array.from(atob(data), c => c.charCodeAt(0)));
      data = JSON.parse(new TextDecoder().decode(decrypted));
    } catch { throw new Error('记录中心响应格式已变化，无法读取'); }
  }
  return { code, data, count: typeof row.count === 'number' ? row.count : undefined, success: row.success === true, errorCode: typeof row.errorCode === 'number' ? row.errorCode : undefined };
}

export function validReportId(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[0-9]{1,20}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.test(value);
}
export function reportUrl(reportId: string): string {
  if (!validReportId(reportId)) throw new Error('无效的记录中心报告编号');
  const url = new URL('https://www.birdreport.cn/home/record/page.html');
  url.searchParams.set('param', btoa(JSON.stringify({ reportId, ts: Date.now() })));
  // The public page calls its legacy calcMD5 with an object, yielding the empty digest.
  url.searchParams.set('sign', 'd41d8cd98f00b204e9800998ecf8427e');
  return url.toString();
}
