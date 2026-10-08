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
- 本地库 `~/.eigent/geo/geo.db`（SQLite）：`geo_project`、`geo_fact`、`geo_kb_source`、`geo_probe`、`geo_answer`、`geo_answer_analysis`、`geo_citation`、`geo_content`、`geo_import_run`。本地修改/删除用 `local_edited` / `deleted` 软标记，飞书重新同步不会覆盖或恢复。
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

### 开发模式不再自动打开 DevTools

- `npm run dev` 启动时原先会无条件弹出 Chrome 开发者工具（`electron/main/index.ts` 的 `openDevTools()`）。现在默认关闭；需要时按 Cmd+Opt+I，或以 `EIGENT_OPEN_DEVTOOLS=1 npm run dev` 启动。

### 本地库按飞书共性字段补全（SMA 监测 Base 43 张表梳理）

原则：只建各轮次、各平台都有的通用 GEO 字段；某个项目特有、或飞书里没有数据的表/字段不建。每个空间（品牌）用 `project_id` 隔离成自己的一套表。

| 飞书表 | 本地表 | 处理 |
|---|---|---|
| NO.1–5 问题探针表、题库总表 | `geo_probe` | 新增 `selling_points`（卖点）、`no_go`、`panel`（固定盘/轮换-表N，NO.N 表即 panel 子集，不单独建表） |
| AI 抓取主表 一轮/二轮 | `geo_answer` | 两轮字段一致，原字段已覆盖 |
| 非品牌指向分析 一轮/二轮 | **新建** `geo_answer_analysis` | 是否提及自有品、提及品牌/数量、首推品牌、TOP3、是否推荐自有品、推荐理由/归类、未推荐原因、竞品同框关系、情感、风险提醒。按 `capture_code + batch` 关联回答。飞书字段名带品牌名（如「是否推荐SMA敏护」）按规律匹配，换品牌 Base 可直接导入 |
| 16 张来源明细（网页/移动 × 两轮） | `geo_citation` | 8 个共有字段已覆盖；新增 `domain`（来源域名，导入/编辑时自动算）。移动端特有的「映射抖音/淘宝店铺」「父記錄」不建 |
| 内容发布表 + 媒体内容发布 | `geo_content` | 合并，新增 `channel`（自媒体/媒体） |
| 14 张引用源分析 | 不建 | 都是来源明细的计数/公式，查询时按 `url`/`domain` 现算 |
| 品牌指向分析 ×2、跑批任务表 | 不建 | 飞书里 0 条数据 |

- 旧库启动时自动补列并回填 `domain`（`store._migrate`）。
- 「AI 采集」页新增「回答分析」视图（与「回答」切换），显示对应问句、平台。探针/来源/内容页新增对应列（默认隐藏的可在「字段」里打开）。
- 本机 `~/.eigent/geo/sources.json` 新增 13 张表（分析两轮、一轮网页端来源、移动端来源两轮、媒体内容发布），原文件备份为 `sources.json.bak-20260928`。导入核对：行数与飞书一致，分析表 4,935 条全部关联到回答；一轮提及自有品 371/2490。
- 智能体技能 `~/.eigent/skills/geo-database/SKILL.md` 已写入新表与字段，提及率等优先用分析表的人工标注列。

### 其他

- `scripts/check-i18n-locale-parity.js`：登记新增的 `geo.json` 语言文件。
- `server/docker-compose.override.yml`：本机 Postgres 端口映射到 5433（系统已有 PostgreSQL 占用 5432）。

### 2026-09-29 空间绑定到底 + 采集轮次

**空间 = 品牌/产品项目，链路数据全放在空间文件夹里**

- 每个空间自己一个库：`<空间文件夹>/GEO/geo.db`（同一套表结构），飞书数据源 `GEO/feishu_sources.json`。`~/.eigent/geo/geo.db` 降为「项目登记表」，只列项目，并暂存还没有空间的项目（如先从飞书导入、后建空间的）。
- 首次打开空间（`POST /geo/spaces/ensure`）：建文件夹 → 同名旧项目自动认领 → 旧库里该项目的数据整体搬进空间库（搬前备份 `geo.db.bak-<日期>`，搬后 VACUUM）→ 从全局 `sources.json` 复制一份飞书配置到空间 → 为每个采集轮次建 `03_AI采集/<轮次名>/`。
- GEO 页面去掉「项目」下拉框，只显示当前空间自己的数据；「从飞书同步」按当前空间配置单独同步（`POST /geo/import {project_id}`），没配置时提示去空间文件夹填写。
- 记录的查看/修改/删除接口都带 `project_id`，按项目路由到对应库（`store.connect(project_id)`）。
- 旧版自动生成的 README（写着全局库路径）会重新生成；智能体技能 `~/.eigent/skills/geo-database/SKILL.md` 改为读空间内 `GEO/geo.db`。

**采集轮次（同一空间多次采集怎么区分）**

- 概念：同一套探针，第一轮 = 优化前**基线**，之后每做一轮优化再采一轮**复测**（第二轮、第三轮…）。NO.1–NO.5 是**探针分组**（一张探针表对应一个账号，把同一轮拆给多账号跑），不是轮次。
- 字段改名（旧库启动时自动 RENAME COLUMN）：`batch` → `capture_round`（采集轮次，回答/引用来源/回答分析三表），`geo_answer.round` → `probe_group`（探针分组）。飞书的「抓取轮次」字段实际存的是 NO.N，映射到 `probe_group`。
- 新表 `geo_capture_round`：名称、序号、类型（基线/复测）、状态（计划中/采集中/已完成）、起止日期、探针范围、采集平台、备注，另算回答数/引用数/分析数。已有数据自动生成轮次（名称按「第N轮」解析序号，日期取该轮回答的首末采集日期）。
- 「AI 采集」页新增「采集轮次」视图：新建时不填名称自动取下一轮（第三轮…）并建文件夹；改名会同步改掉三张表里的轮次名和文件夹；轮次下还有数据时不允许删除。新增回答/来源/分析默认记到最新一轮（或当前筛选的轮次）。
- 总览与 AI 采集仪表盘加「采集轮次」切换和「各采集轮次回答数」图；「被 AI 引用」在选定轮次时只算该轮的引用。
- `feishu_sources.json` 表配置里用 `round` 标注这张表是哪一轮（旧的 `batch` 仍兼容）。

实测：用 SMA 真实库副本搬家 1.2 秒，4,954 回答 / 82,699 来源 / 4,935 分析全部到位，自动识别 第一轮(基线, 08-28–08-31)、第二轮(复测, 09-23–09-28)。

### 2026-09-29（下午）脱离飞书、诊断分析独立、首页改为空间列表

用户定：探针完全由使用者自己放、自己选，不分固定盘/轮换盘，也不锁轮次；诊断分析单独成一环；指标口径、采集方案以后再商定。

- **链路 8 环**：总览 → 品牌知识库 → 意图探针 → AI 采集（含采集轮次）→ **诊断分析**（新，`stages/Analysis.tsx`，section `geo-analysis`）→ 引用来源 → 内容生产 → 发布追踪。空间文件夹同步改为 `01_品牌知识库 … 03_AI采集 / 04_诊断分析 / 05_引用来源 / 06_内容生产 / 07_内容发布 / 08_效果追踪`，旧空间的 04–07 文件夹自动顺延改名，自动生成的 README 会重写。
- **每环「交给 AI」**：GeoBase 新增 `agentTask`，把该环节的任务说明（含本空间的库路径、GEO 文件夹、当前轮次）写进对话框，用户可改后发送。已配：意图探针（起草探针、确认后入库）、诊断分析（逐条标注 + 本轮结论）、引用来源（站点排行 + 投放建议）、内容生产（按缺口写稿入库）、发布追踪（轮次对比阶段报告）。知识库沿用原「交给 AI 清洗」。采集暂不接。
- **引用来源**加仪表盘：来源站点、来源域名排行，按 AI 平台/来源类型，可按轮次切换。**诊断分析**仪表盘：提及/推荐/TOP3/首推品牌/竞品同框/情感。
- **发布追踪**新增「轮次对比」视图（`GeoRoundCompare.tsx`，`GET /geo/rounds/compare`）：各轮回答数、带引用回答、来源数、来源域名数、已诊断、提及/推荐/TOP3 自有品、我方内容被引用——只给原始计数，比率等口径定了再加。
- **飞书退出主链路**：GEO 页面去掉「从飞书同步」按钮；空间不再自动生成 `feishu_sources.json`；设置 → 通用里保留「从飞书导入（可选）」。
- **首页**：应用启动直接进空间列表（`routers/index.tsx` 的 `LaunchToSpaces`，只在首次进入 `/` 时跳转）；空间列表页不再显示左侧设置栏；设置页左栏顶部改为「返回空间」，只剩设置/设备两组。中文界面里的「Space」统一改为「空间」。
- **Bug 修复**：新建采集轮次前先同步已有数据里的轮次，避免编号从「第一轮」重来。
- 智能体读库技能 `geo-database` 移入仓库 `resources/example-skills/`，随应用同步到 `~/.eigent/skills`，去掉飞书依赖表述。
- 四个平台采集技能 + 监督器原样存档到 `resources/geo-capture-skills/`（**未接入**，不同步给智能体；脚本里有 SMA 飞书 token，已在 `electron-builder.json` 排除打包）。

### 2026-09-29（晚）GEO Agent 系统提示词 + 记忆口径

- 根智能体改为 **GEO Agent**：`backend/app/geo/agent_prompt.py` 的系统提示词仿 Claude Code 结构（身份 / 运行环境 / 空间=品牌 / 8 环链路与写回位置 / 事实与证据 / 如何做事 / 需先征得同意的操作 / 记忆 / 工具 / 回复风格），保留 Eigent 的 toolchain_preflight 安全约束。`agent/factory/single_agent.py` 改用它，角色名 GEO Agent。workforce 模式未改。
- 每回合在上下文最前拼「当前空间」状态卡（`space_status`），因为会话内 agent 复用、系统提示词只生成一次。
- 记忆：品牌/产品事实不进记忆（只认知识库）；空间记忆=品牌项目的决策、口径、反馈、外部参考；会话记忆只放临时笔记。自动提取收紧：中文作用域句式须带冒号；空间里未写作用域的「记住…」默认进空间层，「这次/本次会话」进会话层；无空间时保持上游行为。更新了上游 2 条测试样例（改为明写 this session），新增 `test_geo_memory_scopes.py`、`tests/app/geo/test_agent_prompt.py`。
- 设置 → 记忆：空间/会话记忆说明文案改为 GEO 口径。
- 设计说明见 `docs/GEO-Agent-提示词与记忆设计.md`。

### 2026-09-29（晚）SMA 历史数据并入空间 + 首轮 agent 测试

- 新增 `store.merge_project_into(source, target)`：把一个项目的数据改挂到另一个项目、搬进其空间库（搬前两边备份，搬后压缩源库），删除源项目登记，保留飞书 token。用它把登记库里的「SMA敏护」并入「雀巢SMA敏护」空间：回答 4,954 / 来源 82,699 / 诊断 4,935 / 探针 394 / 内容 324，自动识别 第一轮（基线 08-28–08-31）、第二轮（复测 09-23–09-28）。完整备份 `~/.eigent/geo/geo.db.before-merge-20260929-170642`。
- 修复：打开空间库时每次都重写项目行、启动迁移会重写无域名来源行 → 文件修改时间变化，对话里误报「已编辑 geo.db」。改为内容不变不写；测试按修改时间校验（`test_reading_the_status_leaves_the_database_untouched`，已确认去掉修复时会失败）。
- agent 实测（Codex gpt-6-sol）：「这个空间现在做到哪了？」——据状态卡正确给出两轮进度、第二轮 19 条未诊断、知识库为空，未自创指标；「第二轮和第一轮比提及变化」——自行加载 geo-database、按 mentions_own 分轮统计 371→97，说明口径与覆盖平台，未改数据。
- 数据侧待清理：部分自媒体内容的「标题」字段是链接（飞书原表如此）。

### 2026-09-29（晚）界面收成三栏：对话 + 一个右侧面板

参照 Claude Code 桌面版：左侧栏 | 对话 | 右侧只有一个带标签的面板。

- **GEO 变成会话面板里的一个标签**（`pageTabStore` 新增 `geo` 标签类型，每个会话只有一个；标题显示「GEO · 当前环节」）。左侧「GEO 链路」、各环节跳转、顶栏右上开关都走 `workbenchStore` 的统一入口：在会话里打开/切换 GEO 标签，在新会话首页等其他页面仍用原来的 GEO 栏（`WorkbenchPane`，会话页不再渲染）。`useGeoVisible` / `useRightPanelOpen` 供侧栏高亮与顶栏按钮用。
- **新会话默认打开右侧面板的 GEO 标签**（`ensureDefaultSessionPreview`；已有面板状态的会话保持原样）。「+」菜单第一项是 GEO，其后是浏览器/文件/Review/终端。
- **去掉「摘要」栏**：智能体、进度本来就在「已工作」里；执行上下文、环境、文件汇总改为最新一轮「已工作」展开区底部的「运行详情」（默认折叠，`ChatBox/TimelineModes/RunDetails.tsx`，接在 `TaskWorkLogAccordion` 与 `NarrativeTimeline`）。原摘要栏的快捷键开关改为开关右侧面板。
- 宽度：聊天栏最窄 420px，右侧面板最窄 440px；打开面板时聊天栏默认占 45%（不再一下缩到最窄）；窗口放不下两者时自动收起左侧栏一次（用户可再打开）。
- `Space/useGeoSpaceBootstrap` 移到 Workspace 页面调用（原来挂在 GEO 栏上）。
- 测试：更新 `pageTabStore.preview`、`PreviewPanel`、`SessionResize`、`TerminalProcessRows` 中与默认标签/选项数/默认宽度相关的断言，新增 GEO 标签用例。仍失败的 10 个为改名遗留（EventTimeline「Eigent's reply」、TimelineModes「Eigent is working」、SessionHistoryAction）与 installationStore，与本次无关。

### 2026-09-30 主智能体 Harness：开场只剩一个智能体、按链路派子智能体、上下文预算

参照 Claude Code 的 harness：一个和用户对话的主智能体负责编排，每环一个子智能体类型，上下文预算跟着接入的模型走。设计说明见 `docs/GEO-Agent-提示词与记忆设计.md`。

- **开场多出来的两个智能体**：此前每次对话都注册 `question_confirm_agent`、`single_agent`、`task_summary_agent` 三个。
  - `question_confirm_agent` 是上游 Workforce 模式判断「简单问答还是复杂任务」用的，单智能体模式下从未被调用。现在只在 Workforce 模式下创建（`service/chat_service.py` `step_solve`）。
  - `task_summary_agent` 不是在总结记忆，是每次提问额外调一次模型生成会话标题和摘要。功能保留，改成后台调用：`agent_model(..., announce=False)` 不注册、不发布回合事件（`ListenChatAgent.announce`），token 用量照常上报。提示词改为中文、限定为 GEO 会话标题，只看用户这一回合的消息（原来还拼了一段完成报告要求）。`agent/factory/single_agent.py` `session_title_agent()`。
- **主智能体改为编排者**：系统提示词新增「你所处的系统」「你和子智能体的分工」两节，链路表多一列子智能体类型。链路表由 `backend/app/geo/harness.py` 的 `STAGES` 生成（8 环的文件夹、职责、写回位置、子智能体类型 `geo-knowledge` … `geo-tracking`）。
- **子智能体派发接口**：`agent_run_subagent(subagent_type="geo-…")` 时，子智能体拿到该环的提示词（`agent_prompt.build_subagent_prompt`，接在 `DepthLimitedAgentToolkit._build_system_message`）；其他类型仍用上游通用提示词。8 环目前共用一个模板，各环的专门做法和工具子集下一轮做。
- **上下文预算**：CAMEL 对不认识的模型把上下文上限当成 999,999,999，等于关掉自动压缩；`gpt-6-sol`、`deepseek-flash` 都在此列。现在由 `harness.context_budget()` 按模型窗口定预算（上限 200,000 token，可用 `GEO_AGENT_WORKING_WINDOW` 调），超过 80% 自动压缩。窗口取值顺序：`~/.eigent/geo/model_profiles.json` → 内置 `backend/app/geo/model_profiles.json` → CAMEL 模型表 → 128,000。`agent_model` 新增 `token_limit`、`summarize_threshold` 参数，不传时行为不变。
- **显示名**：主智能体在界面上由「CAMEL 智能体」改为「GEO Agent」（11 个语言的 `chat.camel-agent` 显示值及三处硬编码兜底；翻译键和 `single_agent` 标识不变）。
- 测试：新增 `tests/app/geo/test_harness.py`、`tests/app/agent/factory/test_single_agent.py`（用真实的主智能体验证：开场只注册 `single_agent`、预算生效、派 `geo-knowledge` 得到该环提示词且子智能体不能再派），并在 `test_agent_prompt.py`、`test_agent_model.py`、`test_listen_chat_agent.py`、`test_depth_limited_agent_toolkit.py`、`test_chat_service.py` 补用例。
- 没动：Workforce 模式和它的六个通用角色；主智能体的工具集（Workspace Git、PlanningWorktree 两个编码场景工具是否去掉待定）。
- 改的是后端，运行中的应用要重启才生效。

### 2026-10-08 智能体只剩 DingGouGEO 这一套

- **关闭上游多智能体（Workforce）**：对话框底部的「单智能体 / Workforce」切换去掉；前端请求固定为 `single-agent`（`chatStore`，旧项目记录的 workforce 也不再沿用）；后端在所有对话的唯一入口 `start_chat_stream` 强制改为 GEO Agent（`chat_controller._on_geo_agent`）。Workforce 代码暂不删，等链路跑通再清。
- **设置「子智能体」页改为「GEO 智能体」**：只读展示 GEO Agent 及其工具、8 个环节智能体的职责、产出、技能槽（目前都「未配置」）。新接口 `GET /geo/agents`，数据来自 `harness.agents_overview()`；`Stage` 增加 `skills` 字段作为技能槽。Gemini 远程子智能体入口去掉，前端不再每次发起对话前去服务器取它的配置。
- **GEO Agent 工具收窄**：关闭 Workspace Git、PlanningWorktree 两个编码工具。
- 测试：后端全量 2629 项通过；新增 `test_every_session_runs_on_the_geo_agent` 等用例和前端 `GeoAgentsSettings.test.tsx`。前端时间线 6 项、设置页 8 项失败在改动前就存在（改名遗留），本次没有新增失败。

---

## 运行

```bash
# 本地服务（Postgres/Redis/API，需先打开 Docker）
cd server && docker compose up -d
# 桌面应用（开发模式）
npm run dev
```

检查：`npm run type-check`、`npm run check:design-tokens`、`node scripts/check-i18n-locale-parity.js`、`cd backend && uv run pytest tests/app/geo`。
