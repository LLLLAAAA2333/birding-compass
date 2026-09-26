// Run with: node scripts/preview-fixtures.mjs
// Isolated localhost preview. All eBird, BirdReport and geocoding responses are explicitly simulated.
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
const now = new Date();
const date = (offset) => {
  const d = new Date(now);
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const birds = [
  ["litgre1", "小白鹭", "Little Egret", "Egretta garzetta"],
  ["comkin1", "普通翠鸟", "Common Kingfisher", "Alcedo atthis"],
  ["blakit1", "黑鸢", "Black Kite", "Milvus migrans"],
  ["eurbla", "乌鸫", "Eurasian Blackbird", "Turdus merula"],
];
const places = [
  "巢湖国家湿地公园",
  "天鹅湖公园",
  "董铺水库东岸",
  "三河古镇湿地",
  "包河公园",
  "大蜀山森林公园",
];
const inventory = Array.from({ length: 62 }, (_, i) => ({
  locId: `L${9000 + i}`,
  locName: places[i] ?? `验收鸟点 ${i + 1}`,
  lat: 31.82 + Math.sin(i) * 0.12,
  lng: 117.22 + Math.cos(i) * 0.2,
  numSpeciesAllTime: 182 - i,
  latestObsDt: `${date(i % 6)} 07:30`,
  subnational1Code: i > 49 ? "CN-JS" : "CN-AH",
  subnational2Code: i > 49 ? "CN-JS-01" : "CN-AH-01",
}));
const observation = (place, bird, index = 0) => ({
  speciesCode: bird[0],
  comName: bird[1],
  sciName: bird[3],
  locId: place.locId,
  locName: place.locName,
  lat: place.lat,
  lng: place.lng,
  obsDt: `${date(index)} 07:30`,
  howMany: index + 2,
  subId: `S${990000 + index}`,
  locationPrivate: index % 2 === 0,
});
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  cacheDir: `node_modules/.vite-fixtures-${process.env.BIRD_FIXTURE_PORT ?? 1421}`,
  server: { host: "127.0.0.1", port: Number(process.env.BIRD_FIXTURE_PORT ?? 1421), strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  plugins: [
    react(),
    {
      name: "isolated-bird-fixtures",
      transform(code, id) {
        // Only this isolated fixture server replaces request encoding. Production
        // encoding is separately exercised against the public website protocol.
        if (id.endsWith("/src/lib/birdreportProtocol.ts"))
          return { code: `export class BirdReportError extends Error {}
            export async function prepareBirdReportRequest(params) { return {body:JSON.stringify(params),headers:{'Content-Type':'application/json'}}; }
            export async function decodeBirdReportResponse(value) { return value; }
            export function validReportId(value) { return typeof value === 'string' && /^[0-9]+$/.test(value); }
            export function reportUrl(id) { return 'https://www.birdreport.cn/home/activity/page.html?fixture=' + id; }`, map: null };
        if (id.endsWith("/src/lib/settings.ts"))
          return {
            code: "export async function readApiKey(){ return 'preview-fixture-only'; } export async function saveApiKey(){ return 'preview-fixture-only'; } export async function clearApiKey(){}",
            map: null,
          };
        if (id.endsWith("/src/App.tsx"))
          return {
            code: code.replace("循着鸟讯，走进自然", "界面验收 · 模拟数据"),
            map: null,
          };
      },
      transformIndexHtml(html) {
        return html.replace(
          "</head>",
          '<style>body::after{content:"模拟数据 · 界面验收";position:fixed;right:16px;bottom:4px;z-index:2000;font:12px sans-serif;background:#fdfcf8;color:#97422e;padding:3px 8px;pointer-events:none}</style></head>',
        );
      },
      configureServer(vite) {
        vite.middlewares.use((req, res, next) => {
          const url = new URL(req.url, "http://localhost");
          const path = url.pathname;
          if (!path.startsWith("/api/")) return next();
          if (path.startsWith('/api/birdreport/')) {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              let params;
              try { params = JSON.parse(body); } catch { res.statusCode = 400; res.end('Invalid fixture request'); return; }
              const n = Number(params.reportId ?? 1);
              let result;
              if (path.endsWith('/search')) {
                const start = (Number(params.page) - 1) * 5;
                result = { code: 0, count: 7, data: Array.from({ length: Math.min(5, 7 - start) }, (_, i) => ({ reportId: String(start + i + 1) })) };
              } else if (path.endsWith('/get')) {
                result = { code: 0, success: true, errorCode: 2, data: { reportId: String(n), startTime: `${date(1)} 08:00`, address: `合肥 · ${places[(n - 1) % places.length]}`, location: n === 3 ? '' : `${117.22 + n * 0.015},${31.83 + n * 0.01}` } };
              } else {
                result = { code: 0, count: 3, data: birds.slice(0, 3).map((b, i) => ({ taxon_id: i + 1, taxon_name: b[1], latinname: b[3], englishname: b[2], taxon_count: i + 1, outside_type: i === 2 ? 1 : 0 })) };
              }
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            });
            return;
          }
          let payload;
          if (path.includes("/ref/taxonomy/"))
            payload = birds.map((bird) => ({
              speciesCode: bird[0],
              comName:
                url.searchParams.get("locale") === "en" ? bird[2] : bird[1],
              sciName: bird[3],
              category: "species",
            }));
          else if (path.includes("/ref/region/list/subnational1/"))
            payload = [
              { code: "CN-AH", name: "安徽" },
              { code: "CN-JS", name: "江苏" },
            ];
          else if (path.includes("/ref/region/list/subnational2/"))
            payload = [
              { code: "CN-AH-01", name: "合肥" },
              { code: "CN-JS-01", name: "南京" },
            ];
          else if (path.includes("/ref/hotspot/"))
            payload = path.endsWith("/geo")
              ? inventory.slice(0, 26)
              : inventory;
          else if (path.includes("/data/obs/geo/recent/"))
            payload = inventory
              .slice(0, 8)
              .map((place, i) =>
                observation(
                  place,
                  birds.find((bird) => path.endsWith(bird[0])) ?? birds[0],
                  i % 3,
                ),
              );
          else if (path.includes("/data/obs/")) {
            const place =
              inventory.find((item) => path.includes(`/${item.locId}/`)) ??
              inventory[0];
            payload = birds.map((bird, i) => observation(place, bird, i));
          } else if (path.startsWith("/api/geocode/"))
            payload = {
              results: [
                {
                  id: 1808722,
                  name: "合肥",
                  latitude: 31.82,
                  longitude: 117.22,
                  admin1: "安徽",
                  country: "中国",
                },
              ],
            };
          else {
            res.statusCode = 404;
            res.end();
            return;
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(payload));
        });
      },
    },
  ],
});
await server.listen();
server.printUrls();
