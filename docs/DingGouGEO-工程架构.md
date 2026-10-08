# DingGouGEO 工程架构

2026-10-08 整理。DingGouGEO 由开源项目 Eigent 改造而来，是做 GEO（生成式引擎优化）的内部工具。本文写清现在的工程由哪几部分组成、各自管什么、哪些上游功能保留、哪些已删、哪些还闲置在代码里。

相关文档：

- 链路怎么走：[GEO-链路契约.md](GEO-链路契约.md)
- 智能体、提示词、记忆：[GEO-Agent-提示词与记忆设计.md](GEO-Agent-提示词与记忆设计.md)
- 改动历史：[DingGouGEO-改动日志.md](DingGouGEO-改动日志.md)

---

## 一、三个进程

```
┌──────────────────────────── 桌面应用（Electron） ────────────────────────────┐
│  前端 src/（React）                     主进程 electron/                     │
│  空间列表 · 左侧栏 · 对话 · 右侧 GEO 面板    窗口、菜单、快捷键、本机浏览器、        │
│                                         启动并守护本地后端                     │
└───────────────┬───────────────────────────────────────┬──────────────────────┘
                │ HTTP / SSE（127.0.0.1:5001 起）          │ HTTP（localhost:3001）
                ▼                                         ▼
┌──────────── 本地后端 backend/ ────────────┐   ┌──── 本地服务 server/（Docker） ────┐
│ FastAPI + CAMEL                          │   │ FastAPI + Postgres + Redis + Celery │
│ GEO Agent、工具、技能、记忆、运行日志、     │   │ 账户、模型服务商配置、自动化（触发器）、 │
│ GEO 数据与指标、空间文件版本               │   │ 连接器 OAuth、空间登记                │
└──────────────────────────────────────────┘   └────────────────────────────────────┘
```

| 进程 | 位置 | 负责 |
|---|---|---|
| 桌面应用 | `src/`、`electron/` | 界面；Electron 主进程管窗口、菜单、内置浏览器（CDP 9222）并拉起本地后端 |
| 本地后端 | `backend/` | 跑 GEO Agent；读写空间里的 GEO 数据库和文件；权限确认；运行日志 |
| 本地服务 | `server/`，`docker compose up -d` | 模型服务商和密钥配置、账户、自动化任务的存储与调度、连接器授权。**没起时对话框会提示「请选择模型」** |

模型请求从本地后端直接发往模型服务商；Codex 订阅走 `~/.eigent/.env` 里的 `HTTP_PROXY`（本机 Shadowrocket）。

## 二、数据放在哪

| 数据 | 位置 |
|---|---|
| 一个品牌的全部 GEO 数据 | 空间文件夹 `GEO/geo.db`（SQLite）：知识条目、探针、轮次、回答、来源、诊断、缺口、对标库、内容 |
| 一个品牌的 GEO 文件 | 空间文件夹 `GEO/01_品牌知识库` … `08_效果追踪`；品牌专属技能配置 `GEO/stage_skills.json` |
| 项目登记 | `~/.eigent/geo/geo.db`（空间 ↔ 项目对照，暂存没有空间的项目） |
| 运行日志（每次对话、工具调用、审批） | `~/.eigent/run-journal.sqlite3` |
| 技能 | 内置 `resources/example-skills/` → 启动时同步到 `~/.eigent/skills/`；本机专用技能直接放 `~/.eigent/skills/`（如 sma-geo） |
| 记忆 | 运行日志库里的 memory 表（用户／空间／会话三层） |
| 模型窗口表 | 内置 `backend/app/geo/model_profiles.json`，本机覆盖 `~/.eigent/geo/model_profiles.json` |

空间 = 一个品牌或产品。链路的所有数据和文件都跟着空间走。

## 三、本地后端（backend/app）

### GEO 专属（DingGouGEO 自己写的）

| 模块 | 负责 |
|---|---|
| `geo/harness.py` | **链路登记表** `STAGES`：8 环的输入、做什么、产出、完成标准、子智能体、技能槽；按模型定上下文预算；空间级技能配置 |
| `geo/agent_prompt.py` | GEO Agent 系统提示词、环节子智能体提示词、会话标题提示词、每回合的「当前空间」状态卡 |
| `geo/metrics.py` | 统一指标（契约 1.3）：提及、首提、TOP3、证据锚同段、顾虑、事实吸收、目标内容被引 |
| `geo/stage_tasks.py` | 环节按钮的任务指令，由登记表和空间现状生成（含本轮指标表） |
| `geo/pipeline_status.py` | 8 环完成标准的自动检查（总览「链路进度」） |
| `geo/store.py`、`queries.py` | 空间数据库的表结构、迁移、看板读写 |
| `geo/knowledge.py`、`space_bootstrap.py`、`rounds.py`、`feishu_import.py` | 品牌知识库文件夹、空间初始化、采集轮次、可选的飞书导入 |
| `controller/geo_controller.py` | `/geo/*` 接口 |

### 智能体运行

| 模块 | 负责 |
|---|---|
| `agent/factory/single_agent.py` | 建 GEO Agent（唯一的主智能体）和会话标题的后台调用 |
| `agent/factory/toolkit_assembler.py` | GEO Agent 的工具：提问、记忆、文件、终端、技能、待办、搜索、浏览器、网页读取、读图、连接器（MCP）、派发子智能体 |
| `agent/toolkit/` | 上述工具的实现；`depth_limited_agent_toolkit.py` 负责派发环节子智能体（只能一层） |
| `agent/agent_model.py`、`listen_chat_agent.py` | 按所选模型建模型后端；智能体执行、事件上报、上下文压缩 |
| `service/chat_service.py`、`single_agent_service.py` | 一次对话的执行循环 |
| `controller/chat_controller.py` | `/chat` 入口；`start_chat_stream` 是所有对话的唯一入口 |
| `run_journal/`、`run_runtime/`、`run_context/`、`workload/` | 运行日志（可恢复、可回放）、执行协调、超时、工具检查点 |
| `permission_policy/`、`hands/`、`auth/`、`file_access/` | 工具调用的权限与审批、本机能力边界、本机控制鉴权、文件访问范围 |
| `memory/`、`lightweight_memory/` | 跨会话记忆 |
| `workspace_config/` | 模型能力表、运行准入（核心，保留） |
| `workspace_bundle/` | 工作区安装包（「配置」页） |
| `workspace_git/` | 空间文件版本历史、Review、撤回 |
| `run_sync/`、`utils/server/` | 把运行步骤同步给本地服务 |

## 四、前端（src/）

| 区域 | 目录 | 说明 |
|---|---|---|
| 空间列表 | `components/SpacesHub`、`components/Home` | 启动即进；空间 = 品牌 |
| 左侧栏 | `components/SpaceSidebar` | 工作区、文件、自动化、配置；「GEO 链路」组；会话列表 |
| 对话 | `components/ChatBox`、`components/Session` | 时间线、「已工作」与「运行详情」、对话框（审批模式、模型与思考强度） |
| 右侧面板 | `components/Session/PreviewPanel`、`components/Workbench` | GEO 标签、浏览器、文件、Review、终端 |
| GEO 页面 | `components/Geo` | 总览（链路进度、图表）和各环节页；多维表格、看板、仪表盘；「交给 AI」按钮取后端任务指令 |
| 设置 | `components/Settings` | 通用、模型、GEO 智能体（只读名单）、技能、连接器、记忆；设备组：浏览器、扩展、Cookies |
| 自动化 | `components/Trigger`、`store/triggerStore.ts` | 定时或触发执行的任务 |
| 配置 | `components/WorkspaceConfiguration`、`components/WorkspaceBundle` | 工作区配置与安装包 |

## 五、上游功能的去留

### 保留（对 GEO 有用）

| 功能 | 用途 |
|---|---|
| 自动化（定时任务） | 以后定期复测、定期出报告 |
| 配置页（工作区配置与安装包） | 打包分发技能、连接器 |
| 文件版本与 Review | 智能体改了知识库或稿件可以回退 |
| 浏览器设置 | GEO Agent 用浏览器登录网站、抓对标原文 |
| 连接器（MCP）、技能、记忆、模型设置 | 智能体的基础能力 |

### 已删除（2026-10-08）

| 功能 | 删了什么 |
|---|---|
| 远程控制 | 侧栏「调度」页及快捷键、菜单项，`/remote-control` 页面，桌面桥接，后端远程命令收件箱接口 |
| Workforce 多智能体 | 执行循环、协调者与任务规划者、问题判断智能体、6 个通用角色（开发、浏览器、文档、多模态、社交媒体、MCP）及其提示词、工作流画布、worker 卡片与「添加 worker」、模式切换、Workforce 遥测 |
| Gemini 远程子智能体 | 后端模块、接口、工具，前端配置页 |
| Workforce 专用工具 | 25 个工具：社交媒体、Google Drive／Gmail、GitHub、网页部署、图片／音视频、RAG 等 |
| 会话侧栏 | 09-29 起已不渲染的侧栏外壳、展开画布、折叠智能体面板（活动面板保留给「运行详情」） |

### 还闲置在代码里（没有调用方，删除风险大于收益，暂留）

| 闲置部分 | 原因 |
|---|---|
| 运行日志里的 `remote_command_inbox` 等表和 `run_sync/command_sync.py` | 属于运行日志的表结构和迁移，删除要动已有数据库 |
| `chatStore` 里处理 Workforce 事件（拆解任务、分配 worker）的分支 | 和单智能体的事件处理交织在一起；后端已不会再发这些事件 |
| `SessionMode`（workforce/single-agent）类型、`Chat.new_agents`、`Agents` 枚举里的旧角色名 | 已持久化的旧项目和接口字段还在用这些值 |
| 本地服务 `server/app/domains/remote_control`、`remote_sub_agent` | 有自己的数据库表和迁移；桌面端已不调用 |
| 界面里与 Eigent 云服务、额度、套餐相关的提示文案和 `workforce` 翻译文件 | 云服务功能已停用，文案不会出现；翻译键清理放到以后 |
| `components/WorkFlow/` 目录 | 只剩共用的 `MarkDown.tsx` 和 `agents.tsx`，目录名是历史遗留 |

## 六、运行与检查

```bash
# 本地服务（需要 Docker）
cd server && docker compose up -d
# 桌面应用（开发模式）
npm run dev
```

检查：

```bash
npm run type-check
npx vitest run --config vitest.config.ts
node scripts/check-i18n-locale-parity.js
npm run check:design-tokens
cd backend && .venv/bin/python -m pytest tests
```

前端测试目前有 68 个已知失败，分布在 23 个文件，都是改名和定制留下的旧断言（时间线文案、设置页、主题、构建与安装配置、几个聊天集成测试），清理上游功能前后数量没有增加，与 GEO 功能无关；后端测试全部通过。改后端后，运行中的应用要重启才生效。
