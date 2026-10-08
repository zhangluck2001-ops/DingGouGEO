# GEO Agent：Harness、系统提示词与记忆设计

2026-09-29 初版（提示词与记忆），2026-09-30 补 Harness 架构。参照对象是 Claude Code 的 harness：一个和用户对话的主智能体，加上按需派出、各自有独立上下文的子智能体。

## 一、智能体架构

```
用户
 │
 ▼
GEO Agent（主智能体，唯一和用户对话，负责编排）
 │  agent_run_subagent(subagent_type=…)
 ├── geo-knowledge   1 品牌知识库
 ├── geo-probes      2 意图探针
 ├── geo-capture     3 AI 采集
 ├── geo-analysis    4 诊断分析
 ├── geo-citations   5 引用来源
 ├── geo-content     6 内容生产
 ├── geo-publish     7 内容发布
 ├── geo-tracking    8 效果追踪
 └── general-purpose 不属于任何一环的杂事
```

- **DingGouGEO 只有这一套智能体**（2026-10-08 起）。上游 Eigent 的多智能体模式（Workforce：协调者、任务规划者和开发/浏览器/文档/多模态/社交媒体/MCP 六个通用角色）已关闭：对话框不再有模式切换，前端请求固定为 `single-agent`，后端在所有对话的唯一入口 `start_chat_stream` 再强制一次（`chat_controller._on_geo_agent`，旧项目、远程控制、触发器发来的 workforce 请求也一样）。Workforce 的代码暂未删除。
- 设置 →「GEO 智能体」（原「子智能体」页，路由 id `sub-agents` 不变）只读展示这份名单：GEO Agent 和它的工具，8 个环节智能体的职责、产出和技能槽。数据来自 `GET /geo/agents`（`harness.agents_overview()`）。原来的 Gemini 远程子智能体入口已去掉——它只挂在 Workforce 的通用角色上，GEO Agent 从没用过。
- 一次对话开始时只注册 **一个** 智能体：`single_agent`，界面显示为「GEO Agent」（翻译键仍是 `chat.camel-agent`，只改了显示值）。子智能体只在主智能体派发时才出现。
- 子智能体只有一层，不能再往下派（`DepthLimitedAgentToolkit`，`max_depth=1`）。
- 主智能体自己做：理解需求、看状态、查几条数据、改一两条记录、和用户确认、核对结果、汇报。
- 派给子智能体：一环之内成批、耗上下文的工作（清洗一批资料、逐条诊断一轮回答、写一组稿）。
- 子智能体看不到对话、状态卡和记忆，主智能体要把目标、路径、轮次、范围、已获同意的范围写进派发的 `prompt`；子智能体的返回由主智能体抽查后再向用户汇报。

### 开场不再出现的两个「智能体」

| 名称 | 原来 | 现在 |
|---|---|---|
| `question_confirm_agent` | 每次对话都创建。它是上游多智能体（Workforce）模式用来判断「简单问答还是复杂任务」的，单智能体模式下从未被调用 | 只在 Workforce 模式下创建 |
| `task_summary_agent` | 每次提问额外调一次模型生成会话标题和一句话摘要，并作为智能体注册、发布回合事件。它不是在总结记忆 | 标题仍由模型生成，但改为后台调用（`announce=False`）：不注册、不发布回合事件；提示词改为中文、限定为 GEO 会话标题；只看用户这一回合的消息 |

记忆本身不是智能体：`lightweight_memory/maintainer.py` 按句式规则匹配，不调模型。

## 二、Harness 各层

| 层 | DingGouGEO 里是什么 | 代码 |
|---|---|---|
| 系统提示词（固定） | 身份与编排职责、所处系统、运行环境、空间=品牌、8 环链路与子智能体对照表、分工规则、事实与证据、做事方法、需先征得同意的操作、记忆、工具、回复风格；末尾沿用 Eigent 的 toolchain_preflight 安全约束 | `backend/app/geo/agent_prompt.py` `GEO_AGENT_SYS_PROMPT` |
| 链路登记表 | 8 环的序号、名称、文件夹、职责、写回位置、子智能体类型。系统提示词里的链路表和子智能体提示词都由它生成，文件夹与 `space_bootstrap.PIPELINE_FOLDERS` 一致（有测试） | `backend/app/geo/harness.py` `STAGES` |
| 子智能体提示词 | 「你是某一环的子智能体」+ 本次任务 + 本环职责与写回位置 + 和主智能体相同的事实/数据规则 + 未获同意不做的操作 + 返回格式。目前 8 环共用一个模板，各环的专门做法下一轮补 | `agent_prompt.GEO_SUBAGENT_SYS_PROMPT`、`build_subagent_prompt()`，接入 `agent/toolkit/depth_limited_agent_toolkit.py` |
| 每回合注入 | 「当前空间」状态卡（每回合重新生成）、Lightweight Memory、之前回合的执行记录、附件 | `agent_prompt.space_status()`，`service/single_agent_service.py` |
| 上下文预算与压缩 | 按接入模型的上下文窗口定预算，超过预算的 80% 自动压缩成摘要 | `harness.context_budget()`，`agent/factory/single_agent.py` |
| 工具 | 见第四节 | `agent/factory/toolkit_assembler.py` |
| 权限与确认 | 工具调用逐次过权限策略（上游 tool checkpoint）；提示词另列「需要先征得用户同意的操作」 | `run_runtime/tool_checkpoint.py` |
| 技能 | `geo-database`（读写空间库）、`docx`/`pdf`/`pptx`/`xlsx`；按需 `load_skill` | `~/.eigent/skills/` |
| 记忆 | 见第六节 | `lightweight_memory/` |
| 后台模型调用 | 会话标题 | `agent/factory/single_agent.py` `session_title_agent()` |

状态卡不放系统提示词：同一会话里 agent 会复用，系统提示词只生成一次，会过时。

## 三、接入模型 API 后的配置

模型和密钥在「设置 → 模型」里选，下面这些由 harness 按所选模型自动决定，不用为每个模型改提示词。

| 配置 | 取值 | 来源 |
|---|---|---|
| 传输方式（chat_completions / responses） | 按模型能力表 | 上游 `workspace_config/model_capabilities.json`，见 `docs/model-capabilities.md` |
| 思考强度 | 用户在对话框选的档位，映射到该模型支持的值 | 同上 |
| 提示缓存 | Anthropic/Bedrock 自动加 `cache_control`，OpenAI 自动加 `prompt_cache_key` | `agent/agent_model.py` |
| 上下文预算 `token_limit` | `min(模型上下文窗口, 工作窗口上限 200,000)` | `harness.context_budget()` |
| 压缩阈值 | 预算的 80% | 同上 |

### 为什么要自己定上下文预算

CAMEL 在对话超过 `token_limit × 阈值` 时自动压缩，而 `token_limit` 取自它内置的模型表。表里没有的模型一律按 999,999,999 处理——相当于关掉压缩，长任务会一直涨到服务商拒绝请求。目前实际在用的 `gpt-6-sol`、`deepseek-flash` 都不在表里，所以此前压缩从未生效。

### 上下文窗口从哪里取（按顺序）

1. 本机 `~/.eigent/geo/model_profiles.json`（用户自己加，优先）
2. 内置 `backend/app/geo/model_profiles.json`
3. CAMEL 内置模型表
4. 兜底 128,000

`model_type` 按前缀匹配，最长的前缀优先，带日期后缀的型号沿用同一条；可选 `model_platform` 限定服务商。文件格式：

```json
{
  "default": { "context_window": 128000 },
  "models": [
    { "model_type": "gpt-6-sol", "context_window": 1050000 },
    { "model_platform": "azure", "model_type": "my-deploy", "context_window": 200000 }
  ]
}
```

工作窗口上限默认 200,000 token：窗口再大也不填满，因为每次请求都要重发全部上下文，而且上下文越长回答质量越差。可用环境变量 `GEO_AGENT_WORKING_WINDOW` 调整。子智能体继承主智能体的预算。

内置表里 `gpt-6-sol`（1,050,000）和 `deepseek-flash`（1,000,000）的窗口取自第三方模型目录，没有对过官方文档；两者都远大于 200,000，所以不影响实际预算。

## 四、主智能体的工具

由 `DEFAULT_SINGLE_AGENT_TOOLKIT_CONFIG` 决定，前端目前不传 `toolkit_config`。

| 工具集 | 用途 |
|---|---|
| Human | 向用户提问、发进度消息 |
| Memory | 查/记/提议升级记忆，查历史 |
| File、Terminal | 读写空间文件，`sqlite3` 操作 `geo.db` |
| Skill | 加载技能（`geo-database` 等） |
| Todo | 多步任务列计划 |
| Agent | 派发子智能体 |
| Search、Browser、WebFetch | 查外部信息（Search 要配置了搜索服务、Browser 要有可用的浏览器目标才会出现） |
| Screenshot | 读图片 |
| MCP | 用户接入的连接器 |
| ~~Workspace Git、PlanningWorktree~~ | 上游编码场景的工具，2026-10-08 起关闭（后者还会往空间文件夹写 `.camel-plan.md`） |

## 五、事实从哪里来（不进记忆）

| 信息 | 唯一来源 |
|---|---|
| 品牌、产品事实（成分、功效、资质、FAQ、竞品、合规红线） | `01_品牌知识库`（模块文件 + `geo_fact`，带证据等级 A–E 与来源） |
| 探针、回答、诊断、来源、内容 | 空间库 `GEO/geo.db` |
| 做到哪一轮 | `geo_capture_round` |

## 六、记忆三层记什么

| 层 | 记什么 | 例子 | 不记 |
|---|---|---|---|
| 用户（跨所有空间） | 用户本人的工作偏好 | 先给结论；回复用中文 | 任何品牌的事 |
| 空间（= 品牌项目） | 决策与口径、客户/用户反馈（附原因与日期）、外部参考 | 2026-09-17 起统一用「SMA敏护」——客户要求；功效数字须品牌方确认；发布版标题 ≤30 字 | 产品事实、数据、轮次进度 |
| 会话 | 只对这次会话有用的临时笔记 | 本次先不管采集 | 值得长期保留的（提议升到空间） |

- agent 自己记的先落会话层，再用 `promote_project_memory` 提议升到空间/用户层，由用户在卡片里确认。
- 记忆可能过时：和知识库、数据库、用户当前指令冲突时以后者为准，并更新或删除。

### 自动记忆（用户明说「记住」时）

`backend/app/lightweight_memory/maintainer.py`：
- 只认明确的记忆指令：「记住…」「我偏好…」「我更喜欢…」「我喜欢：…」「这个空间/项目/品牌：…」「所有空间：…」，英文 remember / I prefer / for this space, …。
- 中文作用域句式**必须带冒号**，避免「这个空间里有哪些数据」这类问句被误存。
- 作用域：含「以后都 / 所有空间 / 我偏好…」→ 用户层；含「这次会话 / 本次会话」（英文 this project/session）→ 会话层；其余在空间里默认 **空间层**（中文「项目」指品牌项目）。没有空间的会话仍按上游默认落会话层。
- 测试：`tests/app/lightweight_memory/test_geo_memory_scopes.py`。

## 七、还没做的

- 8 环子智能体各自的专门提示词和工具子集（现在共用一个模板、继承主智能体全部工具）。
- 删除已关闭的 Workforce 代码（`chat_service.py` 大部分、`utils/workforce.py`、六个通用角色的工厂和提示词、工作流画布、`ProjectModeToggle`），等链路跑通后做。
- 链路契约：8 环各自的输入、产出、入口、技能槽、完成标准、交接；数据层补「轮次 → 缺口 → 内容 → 复测」的关联；按钮、主智能体、子智能体的环节定义合成一处。
