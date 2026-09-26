# Birding-Compass

个人用的 Mac 与 Windows 观鸟罗盘：从全国近期到访鸟点出发，查看城市周边的近期鸟种，或寻找一种鸟最近出现的地点。

## 数据范围

- 「全国发现」是首次启动的默认页。通过 eBird 公共热点接口筛选近 3、7、14、30 天有到访记录的中国鸟点，默认 7 天，按最近记录时间排序。省份和地点名称筛选作用于完整接口结果，首次显示 50 个，可继续加载；地图与当前已加载列表一致。这里表示近期到访情况，不提供全国热度分数。
- 「我的城市」先搜索并关注城市，再查询距该地区中心 10、25、50 公里内的近期公共鸟点。每个鸟点单独请求近期物种记录，按鸟种去重，显示当前时段种数和鸟名；首次显示 20 个。排序可选最近记录或距地区中心的直线距离。加载失败显示「查询失败」，不会当作零种。
- 「找鸟」支持中文名、英文名和学名搜索。选定鸟种后，查询所选地区附近每个地点的最新公开记录；普通观测地点与公共鸟点分别标注。结果不是所有观测次数或出现概率。
- 三个近期页面的搜索框均有「搜索」按钮，也支持 Enter；地点筛选在提交后生效，清空输入可恢复全部地点。城市、各页地点及目标鸟搜索分别在本机保留最近 10 条，重复搜索置顶，不记录逐字输入。「历史」中可点击再次搜索、逐条删除或清空；删除记录不会取消关注城市或改变当前结果。浏览器预览和桌面版的历史分别保存在各自站点数据中。
- 地点详情显示近期物种、观测日期、这条记录的个体数和原始清单链接，也可打开地图。Mac 桌面版使用苹果地图 App；Windows 和浏览器预览打开 OpenStreetMap 网页。数据抓取时间与观测时间分别显示。热点接口的 `numSpeciesAllTime` 始终是历史累计，仅在详情中作为补充；地图标记大小不随该值变化。
- 「历史分析」保留原有 EBD 导入与已导入结果。选观测日期后，从 [eBird 下载 EBD 数据集](https://ebird.org/data/download)，建议申请覆盖中国、目标日期、全部鸟种的自定义下载；完整全球 EBD 体积很大。解压并导入 EBD `.txt` / `.tsv` 文件。应用在本机按「观测日期、国家 CN、物种、已审核、清单编号」筛选，同一鸟种在同一份清单中只计一次。结果按日期保存在本机 IndexedDB；未导入的日期需再次选择文件。文件覆盖不全时，统计只代表文件所含记录。
- EBD 按月更新，历史榜不代表实时鸟况；近期三种查询均不依赖 EBD。鸟点种数只反映 eBird 在该范围、时段可返回的公开物种记录，不代表现场所有鸟种。接口达到返回上限时会提示结果可能不完整。接口语义以 [eBird API 官方文档](https://documenter.getpostman.com/view/664302/S1ENwy59?version=latest) 为准。
- 城市中心来自 [Open-Meteo 地名搜索](https://open-meteo.com/en/docs/geocoding-api)（基于 GeoNames），不等于行政区边界或当前位置；搜索数据可能不包含所有区县或公园。
- 「双源鸟讯」按需读取中国观鸟记录中心的公开报告，与 eBird 近期摘要统一搜索、同图展示，逐条保留来源和原报告入口。地图瓦片来自 OpenStreetMap，需联网显示。
- eBird API Key 可在「个人配置」中保存、更换或清除。Mac 桌面版保存在系统钥匙串中，Windows 版保存在 Windows 凭据管理器中，重启后自动读取，不写入项目文件；浏览器预览时保存在当前浏览器的站点数据中，且未加密。关注城市与时间、半径、近期页签偏好会保存在本机。

## 缓存与请求

- 近期查询使用独立的 IndexedDB 缓存，30 分钟内复用，最多保留 500 个查询结果。缓存键包含完整查询范围，不含 API Key；保留完整热点结果，不截断成首页。
- 更新时可先显示已有缓存。刷新失败保留上次成功数据，超过 24 小时的缓存显示出发前更新提示；离线时只能查看已缓存数据，底图仍需网络。
- 鸟点、物种记录及地区名称共用最多 3 个并发请求，相同请求合并，选中鸟点优先。切换查询会取消不再需要的请求，过期响应不会覆盖当前页面。
- 遇到 HTTP 429 会暂停后续查询，切换页签不会解除暂停。稍后点击「更新鸟讯」或重试可恢复；手动刷新绕过 30 分钟缓存。鸟种中英文目录单独缓存 30 天。

## 双源鸟讯

在顶部选择「双源鸟讯」，关注一个城市，选近 3 / 7 / 14 / 30 天并填写记录中心地点关键词，再点击「查询两边鸟讯」。无需记录中心账号；未配置 eBird Key 时仍可单独查询记录中心。

- eBird 按城市中心和 10 / 25 / 50 公里半径返回各鸟种最近的公开摘要；记录中心按地点文字、日期匹配报告。这两个范围并不等价，界面分别注明实际查询范围，记录中心结果不声称位于 eBird 半径内。
- 记录中心每批读取 5 份报告，由用户点击继续加载，单次最多 100 份；地图和列表仅反映已加载的记录，不代表全量鸟况。统一搜索支持鸟名、学名、地点以及来源提供的英文名，作用于已经加载的两边记录；不会因为输入搜索词而遍历站点。
- 两来源用森林绿、陶土色分别标记；无可用坐标的记录保留在列表。记录中心页面使用百度地图，本机将该坐标按 BD-09 转为 WGS84（近似），再与 eBird 的 WGS84 点位显示在同一地图；不把城市中心当作缺失的报告坐标。
- 每条鸟种记录保留来源、原报告编号、来源鸟种编号、观测日期、数量、获取时间及原报告链接。同来源按「报告 + 鸟种」去重，跨来源保留，避免把相似观测误删。不同名录保留原名、学名和编号，不做未经核实的物种拆分/合并，不相加为观测次数、个体总量或出现概率。
- 只读取官网详情响应明确可读（`success: true`、`errorCode: 2`）的报告；标红记录默认不显示，可以主动勾选。未标红不等于人工审核通过；不读取账号资料、评论或媒体，缓存中剔除记录人用户名、用户 ID 和备注。
- 记录中心使用独立的串行请求队列，每次请求至少间隔 2 秒，20 秒超时；列表缓存 30 分钟、报告缓存 6 小时。只有点击查询、刷新或继续加载才查询；不会后台定时采集。同一请求合并，离开页面/切换城市取消未完成请求。
- 遇到访问验证、401 / 403 / 429 / 405 / 505，停止该来源的后续请求，并至少冷却十分钟；需要用户在官网检查后手动重试。不会自动解决验证或轮换身份。一次来源失败不影响另一来源；同范围刷新失败保留上次结果，格式异常不会冒充零条记录。
- 网页请求协议不是有稳定性承诺的开放 API。公开编码参数来自官网前端，2026-09-26 已用本项目实现实测一个地点的一份公开报告（9 条鸟种记录）。接口变更可能导致不可用；代码不包含记录中心账号、Cookie 或私有凭据。

参考：[记录查询](https://www.birdreport.cn/home/activity/page.html)、[服务协议](https://www.birdreport.cn/home/terms/page.html)、[名录升级说明](https://www.birdreport.cn/home/notice/upgrade.html)、[坐标转换库 gcoord](https://github.com/hujiulong/gcoord)。

## 运行

需要 Node.js、Rust，以及对应平台的 Tauri 构建环境（Mac 使用 Xcode Command Line Tools；Windows 使用 Visual Studio C++ Build Tools 和 WebView2）。先在项目目录运行：

当前机器直连部分包仓库不稳定，因此项目的 Rust 构建配置使用 `rsproxy.cn` 镜像。依赖版本和校验值分别记录在 `Cargo.lock` 与 `package-lock.json`。

```sh
npm install
export PATH="$HOME/.cargo/bin:$PATH"
npm run tauri dev
```

历史榜通过本地 EBD 文件导入，不需要 API Key。近期鸟况需要在「个人配置」中保存 [eBird API Key](https://ebird.org/api/keygen)。以后启动自动读取 Key，进入相应视图时查询鸟讯；切换天数或半径会自动更新当前范围。

如需只在浏览器预览界面，可运行 `npm run dev`。这一模式通过 Vite 开发代理访问 eBird、中国观鸟记录中心和 Open-Meteo；正式桌面程序通过 Tauri HTTP 插件访问。

界面采用暖白、森林绿和陶土色的自然图鉴风格，参考 [taste-skill](https://github.com/Leonxlnx/taste-skill) 的既有项目改版方法。桌面最低按 900 × 700 验收；详情支持键盘操作、Escape 关闭和焦点恢复，遵循系统减少动态效果偏好。

## 地图来源与高德切换

当前地图组件是 Leaflet，底图瓦片来自 OpenStreetMap。选中鸟点后，Mac 桌面版在「地图」App 中打开，Windows 和浏览器预览在 OpenStreetMap 网页中打开。若切换为高德地图，先在[高德开放平台](https://lbs.amap.com/api/javascript-api-v2/prerequisites)创建应用并申请 **Web端（JS API）Key** 与配套安全密钥。桌面应用可先以本地配置验证；正式分发宜按[高德安全密钥文档](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)通过代理转发，避免把安全密钥明文打包。接入时还需替换地图组件、调整 Tauri 的 CSP，并将 eBird 提供的 WGS84 坐标转换为高德使用的 GCJ-02，防止鸟点图钉偏移。高德 JS API 需联网加载。

构建 Mac 应用：

```sh
export PATH="$HOME/.cargo/bin:$PATH"
npm run tauri -- build --bundles app
```

构建结果位于 `src-tauri/target/release/bundle/macos/`。本地自用构建未进行 Apple 开发者签名或公证。

Windows x64 安装包由 `.github/workflows/windows.yml` 在推送到 `main` 后自动构建，也可从 GitHub Actions 手动运行。成功后下载 `bird-windows-x64-installer` 构建产物，其中包含 NSIS `-setup.exe` 安装程序。在 Windows 开发机上也可运行 `npm ci`，然后执行 `npm run tauri -- build --bundles nsis`，产物位于 `src-tauri/target/release/bundle/nsis/`。安装包目前未签名，Windows 可能显示 SmartScreen 提示。

## 检查

```sh
npm run test
npm run build
```

无需真实 Key 的界面验收：运行 `npm run preview:fixtures`，打开 `http://127.0.0.1:1421`。此独立预览明确标注「模拟数据」，包含 62 个全国地点、26 个城市地点、目标鸟记录及 7 份记录中心模拟报告（含无坐标与标红记录）；搜索「合肥」可添加演示城市。它使用独立站点存储，不读取系统凭据管理器，不改正式配置。该模式用于检查布局和交互，不能验证真实 eBird 鸟况、系统凭据或桌面地图跳转。

## 技术结构

- `src/lib/ebird.ts`、`src/lib/data.ts`：接口参数、观测与热点数据验证、地区名称。
- `src/lib/recentData.ts`、`src/lib/requestQueue.ts`、`src/lib/recentCache.ts`：按地点及鸟种查询、并发取消与限流、近期缓存。
- `src/hooks/useRecentQuery.ts`：查询状态、旧响应隔离、每个鸟点的近期种数。
- `src/lib/taxonomy.ts`：中英文鸟种目录、学名检索与历史数据的中文名补全。
- `src/lib/dailySpecies.ts`、`src/lib/dailySpeciesImport.ts`：EBD 单日清单统计、流式导入与本地缓存。
- `src/lib/areas.ts`：中文地区搜索与关注地区保存。
- `src/components/SearchField.tsx`、`src/lib/searchHistory.ts`：统一搜索操作、本机历史记录及删除。
- `src/components/BirdMap.tsx`：Leaflet 地图与地点图钉。
- `src/App.tsx`：导航、偏好与应用级请求客户端。
- `src/components/RecentWorkspace.tsx`、`BirdDetail.tsx`、`AreaPicker.tsx`：近期查询、筛选、地图列表和详情。
- `src/components/PlanningWorkspace.tsx`、`src/hooks/usePlanningQuery.ts`：双源查询、独立来源状态、渐进加载及统一搜索。
- `src/lib/birdreportProtocol.ts`、`src/lib/birdreport.ts`、`src/lib/planning.ts`：记录中心网页协议、公开报告筛选、限速缓存、坐标转换和来源标识。
- `src/components/HistoryView.tsx`、`SettingsPage.tsx`：历史导入和个人配置。
- `src/lib/settings.ts`、`src-tauri/src/lib.rs`：从 macOS 钥匙串或 Windows 凭据管理器保存、读取与清除 eBird API Key；浏览器预览使用站点数据。
- `src-tauri/`：Tauri 桌面外壳和限定 eBird、Open-Meteo 域名及记录中心三个读取端点的网络权限。

项目借鉴了 [qBird](https://github.com/TaQini/qBird) 将多个来源整理为可查鸟讯的想法，没有使用其非官方取数代码。eBird 使用官方接口；记录中心通过独立的按需网页查询适配器接入。
