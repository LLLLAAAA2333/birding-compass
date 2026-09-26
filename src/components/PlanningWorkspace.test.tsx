// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PlanningWorkspace } from './PlanningWorkspace';
import { RecentClient } from '../lib/recentData';
const { loadPage, openExternal, mapProps } = vi.hoisted(() => ({ loadPage: vi.fn(), openExternal:vi.fn(), mapProps:vi.fn() }));
vi.mock('../lib/birdreport', async original => ({ ...(await original<typeof import('../lib/birdreport')>()), birdReportClient: { loadPage, resume() {} } }));
vi.mock('../lib/presentation',async original=>({...await original<typeof import('../lib/presentation')>(),openExternal}));
vi.mock('./BirdMap',()=>({BirdMap:(props:unknown)=>{mapProps(props);return <div>联合地图</div>;}}));
const record={ id:'birdreport:1:1',source:'birdreport',sourceRecordId:'1:1',reportId:'1',sourceTaxonId:'1',commonName:'白鹭',scientificName:'Egretta garzetta',englishName:'Little Egret',observedAt:'2026-09-26',locationName:'合肥湿地',position:{latitude:31.83,longitude:117.21},coordinateNote:'BD-09 转 WGS84',count:3,quality:'unflagged',originalUrl:'https://www.birdreport.cn/home/record/page.html?test',fetchedAt:'2026-09-26T08:00:00Z'};
const area={id:'hf',name:'合肥',latitude:31.82,longitude:117.22};
const props={client:new RecentClient('test-key'),apiKey:'test-key',area,areas:[area],days:7,radiusKm:50,onDays:vi.fn(),onRadius:vi.fn(),onArea:vi.fn(),onAreas:vi.fn(),onSettings:vi.fn()};
beforeEach(()=>{
  const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)});
  loadPage.mockResolvedValue({records:[record],total:1,reportIds:['1'],page:1,skipped:0,fetchedAt:record.fetchedAt,warnings:[]});
  vi.spyOn(props.client,'load').mockResolvedValue({observations:[],hotspots:[],days:7,limited:false,source:'live',fetchedAt:record.fetchedAt});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.clearAllMocks();vi.unstubAllGlobals();});
it('queries only on request, works without an eBird key, and retains original record links',async()=>{
  render(<PlanningWorkspace {...props} apiKey="" />);
  expect(loadPage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'查询两边鸟讯'}));
  fireEvent.click(await screen.findByRole('button',{name:/中国观鸟记录中心合肥湿地/}));
  expect(screen.getByText('未标红 · 不等于人工审核',{exact:false})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'查看原始报告'}));
  expect(openExternal).toHaveBeenCalledWith(record.originalUrl);
  expect(props.client.load).not.toHaveBeenCalled();
  expect(mapProps.mock.calls[mapProps.mock.calls.length - 1]?.[0].points).toHaveLength(1);
});
it('retains the working source when eBird fails and filters list and map together',async()=>{
  vi.mocked(props.client.load).mockRejectedValue(new Error('eBird offline'));
  render(<PlanningWorkspace {...props} />);
  fireEvent.click(screen.getByRole('button',{name:'查询两边鸟讯'}));
  await screen.findByText('eBird offline');
  expect(await screen.findByRole('button',{name:/中国观鸟记录中心合肥湿地/})).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox',{name:'鸟讯来源'}),{target:{value:'ebird'}});
  await waitFor(()=>expect(mapProps.mock.calls[mapProps.mock.calls.length - 1]?.[0].points).toHaveLength(0));
  expect(screen.queryByRole('button',{name:/中国观鸟记录中心合肥湿地/})).toBeNull();
});
