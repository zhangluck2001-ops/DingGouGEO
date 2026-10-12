<div align="center">

# DingGouGEO

**品牌的生成式引擎优化（GEO）工作台**

让品牌在豆包、DeepSeek、千问、元宝等 AI 助手的回答里被提及、被推荐、被引用。

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)
![Node](https://img.shields.io/badge/node-22%20LTS-339933)
![Python](https://img.shields.io/badge/python-3.11-3776AB)
[![Based on Eigent](https://img.shields.io/badge/based%20on-Eigent-6b4fbb)](https://github.com/eigent-ai/eigent)

</div>

---

## 目录

- [简介](#简介)
- [功能](#功能)
- [GEO 链路](#geo-链路)
- [架构](#架构)
- [快速开始](#快速开始)
- [使用流程](#使用流程)
- [开发与测试](#开发与测试)
- [项目结构](#项目结构)
- [文档](#文档)
- [致谢与许可](#致谢与许可)

## 简介

DingGouGEO 是一个本地运行的桌面应用，把 GEO 的整条工作链路放进一个工作台：整理品牌资料、设计问题探针、采集 AI 回答、诊断提及与推荐情况、研究被引用的来源、生产内容、发布并追踪效果。

每个**空间**对应一个品牌或产品。空间里的资料、数据和产出都放在空间自己的文件夹里，GEO Agent 在其中按链路一环一环完成工作，每一步都写回空间，能核对、能追溯。

## 功能

- **GEO Agent**：唯一和你对话的智能体，按链路判断当前在哪一环、该做什么，自己完成并核对结果；大批量工作才拆给子智能体。
- **上传即解析**：PDF（含扫描页）、Excel（含单元格图片和嵌入附件）、Word、PowerPoint、图片在上传时由程序解析成带位置标注的文字，AI 只读解析结果，每条知识都能追到「文件 + 页码 / 单元格」。
- **品牌知识库**：七个模块（总览、品牌实体、产品库、资质合规、FAQ、竞品对比、合规红线）＋知识条目表，按 A–E 证据等级管理，含命名和撞名排除条目。
- **统一指标**：提及率、首提率、TOP3 率等只在后端定义一处，按平台、按轮次分列。
- **可观察**：每次运行的模型调用、工具调用、token 与缓存命中都记在运行日志里；`scripts/geo_observe.py` 可在每步前后拍快照对比。
- **人在回路**：需要你决定时给 2–4 个选项（推荐项在前）并可自填；写文件、写库、对外动作按权限策略确认。
- **本地优先**：数据保存在本机；模型可用 Codex 订阅或任意 OpenAI 兼容服务。

## GEO 链路

| 环节 | 做什么 | 结果写到 |
|---|---|---|
| 1 品牌知识库 | 把原始资料清洗成带证据等级和来源的原子事实 | 七个模块文件、`geo_fact` |
| 2 意图探针 | 按用户给的方向起草求推荐型、非品牌指向的问题 | `geo_probe` |
| 3 AI 采集 | 按轮次导入各平台的回答与引用来源 | `geo_answer`、`geo_citation` |
| 4 诊断分析 | 逐条标注提及、首推、TOP3、情感、风险，归纳缺口 | `geo_answer_analysis`、`geo_gap` |
| 5 引用来源 | 统计被引站点，拆解高被引原文入对标库 | `geo_benchmark` |
| 6 内容生产 | 照对标结构写稿，只用知识库事实，过验收闸门 | `06_内容生产/`、`geo_content` |
| 7 内容发布 | 记录各平台发布 | `geo_content` |
| 8 效果追踪 | 轮次对比与阶段报告 | `08_效果追踪/` |

各环节的输入、产出、完成标准见 [GEO 链路契约](docs/GEO-链路契约.md)。

## 架构

```
┌──────────────────────── 桌面应用（Electron + React） ────────────────────────┐
│  src/ 界面：空间、对话、GEO 面板        electron/ 主进程：窗口、内置浏览器、拉起后端  │
└──────────────┬───────────────────────────────────────────┬──────────────────┘
               │ HTTP / SSE                                │ HTTP
               ▼                                           ▼
┌──────── 本地后端 backend/ ────────┐        ┌──── 本地服务 server/（Docker） ────┐
│ FastAPI + CAMEL                   │        │ FastAPI + Postgres + Redis + Celery │
│ GEO Agent、工具、技能、运行日志、  │        │ 账户、模型服务商配置、自动化、        │
│ 资料解析、GEO 数据与指标            │        │ 连接器授权、空间登记                  │
└───────────────────────────────────┘        └─────────────────────────────────────┘
```

| 数据 | 位置 |
|---|---|
| 一个品牌的 GEO 数据 | 空间文件夹 `GEO/geo.db`（SQLite） |
| 一个品牌的 GEO 文件 | 空间文件夹 `GEO/01_品牌知识库` … `08_效果追踪` |
| 运行日志 | `~/.eigent/run-journal.sqlite3` |
| 技能 | `resources/example-skills/`，启动时同步到 `~/.eigent/skills/` |

详见 [工程架构](docs/DingGouGEO-工程架构.md)。

## 快速开始

### 环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | 22 LTS（`>=18 <23`） | 前端与 Electron |
| Python | 3.11 | 本地后端，首次启动由 [uv](https://docs.astral.sh/uv/) 自动建虚拟环境 |
| uv | 最新版 | 管理 Python 依赖 |
| Docker Desktop | 最新版 | 本地服务 |
| Git | 任意 | 空间文件版本记录 |

macOS 和 Windows 均可运行，以下命令在两种系统的终端里通用。

### 安装与启动

```bash
git clone https://github.com/zhangluck2001-ops/DingGouGEO.git
cd DingGouGEO
```

启动本地服务（模型配置、账户等保存在这里；没启动时对话框会提示「请选择模型」）：

```bash
cd server
cp .env.example .env
docker compose up -d
cd ..
```

安装依赖并以开发模式启动桌面应用：

```bash
npm install
npm run dev
```

首次启动会自动准备后端的 Python 环境，需要几分钟。

### 配置模型

在应用 **设置 → 模型** 中选择 Codex 订阅，或添加任意 OpenAI 兼容服务的地址与密钥。需要走代理时，在 `~/.eigent/.env` 里设置 `HTTP_PROXY`。

### 打包

```bash
npm run build
```

日常使用建议运行打包后的应用；`npm run dev` 带有热更新服务器，只在改代码时使用。

## 使用流程

1. **新建空间**：首页「新建空间 → 从零开始」，填品牌或产品名。应用会在空间里生成 `GEO/` 目录、八个环节文件夹和知识库模板。
2. **上传资料**：右侧 GEO 面板「品牌知识库 → 上传资料」，选择品牌方提供的 PDF、Excel、Word 或图片。上传时自动解析，可在 `原始资料解析/` 查看。
3. **交给 AI 清洗**：点「交给 AI 清洗」并发送。GEO Agent 读解析结果、看需要看的图，写七个模块、产品文件和知识条目，最后按完成标准汇报。
4. **往下推进**：在左侧「GEO 链路」进入下一环，「总览 → 链路进度」显示每一环是否达到完成标准。

## 开发与测试

```bash
# 前端
npm run type-check
npx vitest run --config vitest.config.ts

# 后端
cd backend
uv sync
uv run pytest tests
```

冒烟测试用虚构品牌「晨禾」的资料，不触碰客户数据：

```bash
cd backend
uv run python tests/fixtures/geo_smoke/make_fixture.py <输出目录>
```

把生成的三份资料放进一个测试空间的 `GEO/01_品牌知识库/原始资料/`，在应用里点「交给 AI 清洗」，用观察脚本对比前后：

```bash
python3 scripts/geo_observe.py snap "清洗前"
python3 scripts/geo_observe.py snap "清洗后"
python3 scripts/geo_observe.py diff
```

改了后端代码后，需要重启应用才会生效。

## 项目结构

```
.
├── src/                    # 前端（React）
│   └── components/Geo/     # GEO 面板、链路进度、知识库
├── electron/               # Electron 主进程与预加载脚本
├── backend/                # 本地后端（FastAPI + CAMEL）
│   ├── app/geo/            # GEO：链路登记、提示词、资料解析、指标、数据库
│   ├── app/agent/          # 智能体与工具
│   └── tests/              # 后端测试与冒烟测试资料
├── server/                 # 本地服务（Docker）
├── resources/example-skills/  # 内置技能
├── scripts/                # 开发脚本（含 geo_observe.py）
└── docs/                   # 链路契约、工程架构、实测记录
```

## 文档

- [GEO 链路契约](docs/GEO-链路契约.md)：八个环节的输入、产出、完成标准
- [工程架构](docs/DingGouGEO-工程架构.md)：进程、数据位置、模块职责
- [提示词与记忆设计](docs/GEO-Agent-提示词与记忆设计.md)
- [改动日志](docs/DingGouGEO-改动日志.md)
- [实测记录](docs/实测/SMA-从零实测记录.md)：按真实用户路径的测试过程与问题清单

## 致谢与许可

DingGouGEO 基于开源项目 [Eigent](https://github.com/eigent-ai/eigent) 改造，智能体框架来自 [CAMEL-AI](https://github.com/camel-ai/camel)。上游的原始说明保存在 [docs/upstream-eigent/](docs/upstream-eigent/README.md)。

本项目沿用 [Apache License 2.0](LICENSE)。
