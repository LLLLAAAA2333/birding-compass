# Bird · 个人观鸟地图册

在 Mac 上查看合肥与南京近期公开鸟讯的自用原型。界面以地图为主，按地点聚合鸟种，并显示最近观测时间和可用的原始清单链接。

## 数据范围

- 使用 [eBird 官方 API](https://documenter.getpostman.com/view/664302/S1ENwy59) 的 nearby recent observations 接口。每次查询以城市中心为圆心，范围可选 10、25、50 公里，时间可选 3、7、14、30 天。
- 该接口主要返回**所选范围内每个鸟种最近的一条公开记录**，所以图钉和列表并不代表所有观测次数，也不能据此计算出现概率。
- 中国观鸟记录中心尚未接入；本项目不自动抓取其网页。地图瓦片来自 OpenStreetMap，需联网显示。
- eBird API Key 只保留在当前程序运行的内存里，不写入项目文件或本地缓存。鸟讯本身会在本机缓存；刷新失败时继续显示上次成功的数据及其更新时间。

## 运行

需要 Node.js、Rust 和 macOS 的 Xcode Command Line Tools。先在项目目录运行：

当前机器直连部分包仓库不稳定，因此项目的 Rust 构建配置使用 `rsproxy.cn` 镜像；依赖版本和校验值记录在 `Cargo.lock`。`package-lock.json` 中的 npm 包来自 `npmmirror.com`。

```sh
npm install
export PATH="$HOME/.cargo/bin:$PATH"
npm run tauri dev
```

启动后点「设置 API Key」，输入自己的 [eBird API Key](https://ebird.org/api/keygen)。每次启动程序需重新输入。点击「更新两城鸟讯」会同时更新合肥、南京；切换天数或半径也会自动更新。

如需只在浏览器预览界面，可运行 `npm run dev`。这一模式通过 Vite 开发代理访问 eBird；正式桌面程序通过 Tauri HTTP 插件访问。

构建 Mac 应用：

```sh
export PATH="$HOME/.cargo/bin:$PATH"
npm run tauri -- build --bundles app
```

构建结果位于 `src-tauri/target/release/bundle/macos/`。本地自用构建未进行 Apple 开发者签名或公证。

## 检查

```sh
npm run test
npm run build
```

## 技术结构

- `src/lib/ebird.ts`：接口查询参数、数据验证、地点聚合。
- `src/lib/data.ts`：eBird 请求与本地鸟讯缓存。
- `src/components/BirdMap.tsx`：Leaflet 地图与地点图钉。
- `src/App.tsx`：城市、筛选、地点详情及密钥输入。
- `src-tauri/`：Tauri 桌面外壳和限定 eBird 域名的网络权限。

项目借鉴了 [qBird](https://github.com/TaQini/qBird) 将多个来源整理为可查鸟讯的想法，没有使用其非官方取数代码。当前版本仅使用 eBird 官方接口。
