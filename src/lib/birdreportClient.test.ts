import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BirdReportClient } from './birdreport';
const { cache } = vi.hoisted(() => ({ cache: new Map<string, unknown>() }));
vi.mock('./recentCache', () => ({ readRecentCache: async (key: string) => cache.get(key) ?? null, writeRecentCache: async (key: string, value: unknown) => { cache.set(key, value); } }));
beforeEach(() => cache.clear());
afterEach(() => vi.useRealTimers());
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
it('caches public fields and coalesces duplicate concurrent requests', async () => {
  const fetcher = vi.fn(async () => response({code:0,count:1,data:[{reportId:'12',username:'do-not-cache',userId:'private-id',address:'湿地'}]}));
  const client = new BirdReportClient(fetcher, 0);
  const params = { pointName:'合肥',page:1 };
  const results = await Promise.all([client.request('front/activity/search',params),client.request('front/activity/search',params)]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await client.request('front/activity/search',params);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(results[0].envelope.data).toEqual([{reportId:'12',address:'湿地'}]);
  expect(JSON.stringify([...cache.values()])).not.toContain('do-not-cache');
});
it('stops queued requests on verification and does not undo the cooldown on refresh', async () => {
  const fetcher=vi.fn(async () => response({code:405}));
  const client=new BirdReportClient(fetcher,0);
  const attempts=await Promise.allSettled([client.request('front/activity/search',{page:1}),client.request('front/activity/search',{page:2})]);
  expect(attempts.every(r=>r.status==='rejected')).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(()=>client.resume()).toThrow(/验证/);
  await expect(client.request('front/activity/search',{page:3},{force:true})).rejects.toThrow(/验证/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([403, 429])('allows a manual query after the local cooldown for HTTP %i without polling', async status => {
  vi.useFakeTimers();
  const fetcher = vi.fn()
    .mockResolvedValueOnce(response({}, status))
    .mockImplementation(async () => response({ code: 0, count: 0, data: [] }));
  const client = new BirdReportClient(fetcher, 0);
  const first = expect(client.request('front/activity/search', {})).rejects.toMatchObject({ status, halt: true });
  await vi.runAllTimersAsync();
  await first;
  await vi.advanceTimersByTimeAsync(9 * 60000);
  await expect(client.request('front/activity/search', {})).rejects.toMatchObject({ status });
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const retry = client.request('front/activity/search', {});
  const recovered = expect(retry).resolves.toMatchObject({ envelope: { code: 0, count: 0 } });
  await Promise.all([recovered, vi.runAllTimersAsync()]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('cancels before transport and never interprets an HTTP failure as zero records', async () => {
  const fetcher=vi.fn(async () => response({},503));
  const client=new BirdReportClient(fetcher,0);
  const controller=new AbortController();controller.abort();
  await expect(client.request('front/activity/search',{},{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
  expect(fetcher).not.toHaveBeenCalled();
  await expect(client.request('front/activity/search',{})).rejects.toThrow(/503/);
  expect(cache.size).toBe(0);
});
it('spaces transport starts even when requests are queued together', async () => {
  vi.useFakeTimers();
  const starts: number[]=[];
  const client=new BirdReportClient(vi.fn(async()=>{starts.push(Date.now());return response({code:0,count:0,data:[]});}),2000);
  const requests=Promise.all([client.request('front/activity/search',{page:1}),client.request('front/activity/search',{page:2})]);
  await vi.runAllTimersAsync();await requests;
  expect(starts).toHaveLength(2);
  expect(starts[1]-starts[0]).toBeGreaterThanOrEqual(2000);
});
it('never requests taxa for non-public reports, and preserves first report progress on later failures', async () => {
  const client=new BirdReportClient(vi.fn(),0);
  const fetchedAt='2026-09-26T08:00:00Z';
  const request=vi.spyOn(client,'request').mockImplementation(async (path,params)=> {
    if(path.endsWith('search'))return {envelope:{code:0,count:3,data:[{reportId:'1'},{reportId:'2'},{reportId:'3'}]},fetchedAt};
    if(path.endsWith('get')) {
      if(params.reportId==='2')return {envelope:{code:0,data:null,success:true,errorCode:1},fetchedAt};
      if(params.reportId==='3')throw new Error('network failed');
      return {envelope:{code:0,success:true,errorCode:2,data:{reportId:'1',startTime:'2026-09-26',address:'湿地',location:''}},fetchedAt};
    }
    return {envelope:{code:0,count:1,data:[{taxon_id:1,taxon_name:'白鹭',outside_type:0}]},fetchedAt};
  });
  const progress=vi.fn();
  await expect(client.loadPage({keyword:'合肥',startTime:'2026-09-20',endTime:'2026-09-26'},1,{onProgress:progress})).rejects.toThrow('network failed');
  expect(progress.mock.calls.some(([page])=>page.records.length===1)).toBe(true);
  expect(request.mock.calls.filter(([path])=>path.endsWith('taxon'))).toHaveLength(1);
});
it('does not turn a malformed taxa payload into a successful empty report', async () => {
  const client=new BirdReportClient(vi.fn(),0);
  const fetchedAt='2026-09-26T08:00:00Z';
  vi.spyOn(client,'request').mockImplementation(async path=>({fetchedAt,envelope:path.endsWith('/search')?{code:0,count:1,data:[{reportId:'1'}]}:path.endsWith('/get')?{code:0,success:true,errorCode:2,data:{reportId:'1',startTime:'2026-09-26',address:'湿地'}}:{code:0,data:null}}));
  await expect(client.loadPage({keyword:'合肥',startTime:'2026-09-20',endTime:'2026-09-26'})).rejects.toThrow(/鸟种.*格式/);
});
