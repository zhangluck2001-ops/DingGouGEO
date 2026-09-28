# DingGouGEO 改动日志

DingGouGEO 基于开源项目 [Eigent](https://github.com/eigent-ai/eigent)（`dev` 分支）改造，专门用于 GEO（生成式引擎优化）业务：品牌知识库 → 意图探针 → AI 采集 → 引用来源 → 内容生产 → 发布追踪。

本文件记录相对上游 Eigent 的改动、原因与使用方式，便于后续接手。

---

## 2026-09-28

### 界面结构（参照 Claude 桌面版三栏）

- **左侧栏**：工作区 / 文件 / 自动化 / 调度 / 配置 · **GEO 链路**（可折叠）· 新建 · 会话。
- **中间**：AI 对话。单智能体模式下标题为「Cowork with DingGouGEO」，窄栏时自动换行。
- **右侧 GEO 面板**：点左侧 GEO 条目打开，可拖宽、可关闭（× 或再次点击同一条目，顶栏右侧按钮也可开关）。只显示 GEO 页面。
- **设置页**（顶栏「首页」进入）：模型、子智能体、技能、连接器、记忆合并为「设置」组（首项「通用」），浏览器、扩展、Cookies 为「设备」组。
- 相关代码：`src/components/Workbench/`（右侧面板）、`src/components/SpaceSidebar/GeoNavGroup.tsx`、`src/components/Layout/AppShellLayout.tsx`（`trailing` 槽）、`src/components/Settings/settingsNavigation.ts`（`GEO_NAVIGATION` 与设置导航分离）。

### 空间 = 品牌项目

- 空间由用户自己建立，一个空间对应一个品牌。
- 首次进入空间时自动：在本地库建同名 GEO 项目（`geo_project.space_id` 关联；同名的已导入项目直接认领；空间改名项目跟随），并在空间文件夹生成 GEO 链路目录：
  `GEO/01_品牌知识库`、`02_意图探针`、`03_AI采集`、`04_引用来源`、`05_内容生产`、`06_内容发布`、`07_效果追踪` + `README.md`。已有文件不覆盖。
- 相关代码：`backend/app/geo/space_bootstrap.py`、`POST /geo/spaces/ensure`、`src/components/Geo/useGeoSpaceBootstrap.ts`。

### 品牌知识库（链路第 1 环）

- 目录 `GEO/01_品牌知识库/`：`原始资料/`（上传原件，永不修改）、`清洗规则.md`、七个模块 `00_总览 … 06_合规红线`（`02_产品库/` 一个 SKU 一个文件）。
- 清洗规则来自团队的《品牌资料清洗标准模板》（随代码放在 `backend/app/geo/templates/brand_kb_cleaning_rules.md`），补充了证据等级 A–E 与「账本里没有的，不许写」原则。模块文件由模板自动生成，含 `<!-- DingGouGEO 模板 -->` 标记表示尚未整理。
- 页面「资料与模块」：上传资料（复制进原始资料、重名自动编号）、清洗状态（待清洗/清洗中/已清洗）、「交给 AI 清洗」把清洗指令放进对话框、七个模块卡片；「知识条目」为 `geo_fact` 表的多维表格。
- 旧版空间的 `01_品牌资料` 在打开知识库页时自动改名升级，原文件保留。
- 相关代码：`backend/app/geo/knowledge.py`、`/geo/knowledge*` 接口、`src/components/Geo/stages/Knowledge.tsx`、`src/components/Geo/KnowledgeMaterials.tsx`。

### GEO 数据板块（多维表格式）

- 七个页面：总览、品牌知识库、意图探针、AI 采集、引用来源、内容生产、发布追踪（`src/components/Geo/stages/`）。
- 通用组件 `GeoBase`：表格（排序、拖拽列宽、字段显隐、多选批量删除）、看板（按状态拖拽改状态）、仪表盘（点击条形图下钻到对应环节并带筛选）、记录面板（查看/新增/编辑/删除，关联引用来源）、「问 AI」（把当前视图或选中行写进对话框）。
- 总览：六个环节数量串成链路条，点击进入对应环节。
- 本地库 `~/.eigent/geo/geo.db`（SQLite）：`geo_project`、`geo_fact`、`geo_kb_source`、`geo_probe`、`geo_answer`、`geo_citation`、`geo_content`、`geo_import_run`。本地修改/删除用 `local_edited` / `deleted` 软标记，飞书重新同步不会覆盖或恢复。
- 飞书导入：「从飞书同步」按钮，经本机已登录的 `lark-cli` 读取。要导入的 Base 与表配置在本机 `~/.eigent/geo/sources.json`（客户 Base token 不写进源码）；文件不存在时不导入任何数据。
- 后端：`backend/app/geo/`（`store.py`、`queries.py`、`feishu_import.py`）+ `backend/app/controller/geo_controller.py`，接口前缀 `/geo`。测试：`backend/tests/app/geo/`。
- 智能体读库：技能文件 `~/.eigent/skills/geo-database/SKILL.md`（不在仓库内，位于本机 Eigent 数据目录），说明表结构、知识库清洗与「生产内容前先读知识库」规则。

### 品牌与去云化

- 产品改名 **DingGouGEO**：界面文案（11 种语言）、窗口标题、页面标题、打包 `productName`。Eigent 云服务/账户/套餐、配色主题名、上游链接相关文案保留 Eigent。
- 新 logo：`src/assets/logo/dinggou_logo.png`、`public/favicon.*`、`build/icon.*`（四角透明）；开发模式下 Dock 图标也替换。
- 移除：频道模块、模型页 Eigent Cloud、设置页官网行与隐私/遥测、个人资料「管理」（跳 eigent.ai 云后台）、用户菜单「推荐朋友」、顶栏更新与帮助按钮。
- **上游自动更新默认关闭**（`electron/main/update.ts`）：上游更新源会下载官方 Eigent 覆盖本应用。需要时设置环境变量 `DINGGOU_ENABLE_AUTO_UPDATE=true`。
- `appId`（`com.eigent.app`）与本地数据目录 `~/.eigent` 未改，旧数据继续可用。

### 模型连接修复

- 现象：接入 Codex 订阅后对话报 `Connection error`（TLS `UNEXPECTED_EOF`）。
- 原因：Codex 订阅需访问 chatgpt.com，本机直连不通；应用只从 `~/.eigent/.env` 读取 `HTTP_PROXY`，该文件原本不存在，设置页显示的代理从未生效。
- 修复：`~/.eigent/.env` 配置 `HTTP_PROXY=http://127.0.0.1:1082`（本机 Shadowrocket，属本机配置、不在仓库内）；代码侧为后端与 Chromium 增加直连名单 `DEFAULT_NO_PROXY`（本地服务与 DeepSeek、飞书、阿里云、火山、Kimi、智谱、MiniMax 等国内域名），避免开代理后本地服务与国内模型被绕道（`electron/main/utils/envUtil.ts`、`init.ts`、`index.ts`）。可在 `~/.eigent/.env` 写 `NO_PROXY=` 覆盖。
- 代理关闭时 Codex 会断开，DeepSeek 不受影响。

### 其他

- `scripts/check-i18n-locale-parity.js`：登记新增的 `geo.json` 语言文件。
- `server/docker-compose.override.yml`：本机 Postgres 端口映射到 5433（系统已有 PostgreSQL 占用 5432）。

---

## 运行

```bash
# 本地服务（Postgres/Redis/API，需先打开 Docker）
cd server && docker compose up -d
# 桌面应用（开发模式）
npm run dev
```

检查：`npm run type-check`、`npm run check:design-tokens`、`node scripts/check-i18n-locale-parity.js`、`cd backend && uv run pytest tests/app/geo`。
