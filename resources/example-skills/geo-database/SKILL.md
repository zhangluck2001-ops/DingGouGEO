---
name: geo-database
description: "Read, analyze, and (when the user asks) edit the local GEO database behind the GEO data and GEO content boards in the workbench: captured AI answers per platform and capture round, their cited sources, the probe (question) library, and the published-content log. Use whenever the user asks about GEO answers, sources/citations, probes, published content, which articles AI cites, round-over-round (before/after optimization) comparisons, or refers to rows they selected in the workbench (messages that mention a GEO/geo.db file or table geo_answer / geo_citation / geo_probe / geo_content / geo_capture_round)."
---

# GEO local database

Each Space is one brand (or product) project and keeps **its own** SQLite file inside the Space folder:

`<Space folder>/GEO/geo.db` — i.e. `GEO/geo.db` under the workspace you are working in.

The workbench boards and you read the same file. Messages sent from the board name the exact path. If you can't find
`GEO/geo.db` in the current workspace, look the Space up in the registry `~/.eigent/geo/geo.db`
(`SELECT id, name, space_id, workspace_root FROM geo_project`) — it lists every project; projects that have no Space
folder yet still keep their rows there.

Query it with the `sqlite3` CLI, e.g. `sqlite3 -header -column GEO/geo.db "SELECT ..."`.
Open it read-only (`sqlite3 -readonly`) unless the user explicitly asked you to change data.

## Tables

Every record table has `id`, `project_id`, `record_id` (`local_…` for rows made in the app or by you; an imported record id for rows from an optional import),
`local_edited` (1 = changed locally; a re-import won't overwrite it), `deleted` (1 = soft-deleted), `updated_at`.
**Always filter `deleted = 0`.**

- `geo_project(id, name, space_id, workspace_root, feishu_base_token)` — the Space's own project (one row in a Space
  database). Its files live in `<workspace_root>/GEO/` next to `geo.db`: `01_品牌知识库` (the brand knowledge base — see below), `02_意图探针`,
  `03_AI采集` (one sub-folder per capture round), `04_诊断分析`, `05_引用来源`, `06_内容生产`, `07_内容发布`,
  `08_效果追踪` — save files you produce into the matching stage folder.
- `geo_capture_round(id, name, seq, kind, status, started_on, ended_on, probe_scope, platforms, note)` — the capture
  rounds. The same probe set is captured once as a baseline (`kind` 基线, 第一轮) and again after every optimization pass
  (`kind` 复测: 第二轮, 第三轮 …). `seq` orders them; `status` is 计划中/采集中/已完成. Compare rounds to show the effect
  of optimizing. Files of a round go to `GEO/03_AI采集/<round name>/`.
- `geo_answer` — one captured AI answer: `capture_code` (RUN_xxxx), `probe_code` (Qxxx), `probe_text` (the question as
  asked in that round), `platform` (豆包网页端, Qwen网页端, 元宝网页端, DeepSeek网页端, …移动端),
  `capture_round` (= `geo_capture_round.name`), `probe_group` (optional: which capture account/batch ran it within the
  round — **not** a round),
  `capture_date`, `account`, `answer` (full text), `web_search`, `share_url`, `keywords`, `category_word`, `brand_pointer`.
- `geo_citation` — one source cited by an answer: `run_id` (= answer `capture_code` within the same `capture_round`),
  `probe_code`, `ai_platform`, `capture_round`, `source_platform` (site), `source_type`, `title`, `url`, `domain` (URL host), `capture_date`.
  Join: `geo_citation.run_id = geo_answer.capture_code AND geo_citation.capture_round = geo_answer.capture_round`.
  Per-URL / per-site citation counts are computed from this table (GROUP BY `url` or `domain`); they are not stored.
- `geo_answer_analysis` — the 诊断分析 stage: how one answer treats the project's own brand (one row per answer; you
  fill it when asked to diagnose a round): `capture_code` + `capture_round` (join to `geo_answer` like citations), `mentions_own` (是/否),
  `mentioned_brands`, `brand_count`, `top_brand` (首推品牌), `own_in_top3` (是/否/无…), `recommend_own`
  (推荐/条件推荐/不推荐/未提及), `recommend_reason`, `reason_selling_points` (S-codes), `not_recommend_reason`,
  `competitor_relation`, `sentiment`, `risk_tags`. Keep the wording consistent within a Space.
- `geo_probe` — the question library: `code`, `text`, `review_status` (核心探针 = counts toward mention rate), `cep`,
  `direction` (正向/反向), `category_word`, `brand_pointer` (L1非品牌指向/L2品牌指向), `framework` (对比/排名榜单/求推荐/求验证),
  `selling_points` (S-codes the probe targets), `no_go`, `panel` (固定盘 / 轮换-表N = which NO.N probe group it runs in), `note`.
  The user decides which probes exist and which ones a round captures. Answers keep the question text they were asked with.
- `geo_content` — published content log: `serial`, `title`, `url`, `channel` (自媒体 / 媒体), `account_platform`
  (publishing platform or media outlet), `account_name` (self-media only), `status` (草稿/待发布/已发布).
  A piece is "cited by AI" when its `url` equals some `geo_citation.url` (exact match for now).

- `geo_fact` — the brand knowledge ledger (one atomic fact per row): `module` (00_总览 … 06_合规红线), `product`, `field`,
  `content`, `claim_type` (事实/宣称/话术/存疑/待核实), `evidence_grade` (A–E), `source` (file + page), `note`.
- `geo_kb_source(project_id, file_name, status, imported_at, cleaned_at)` — raw materials in `01_品牌知识库/原始资料/`;
  `status` is 待清洗 / 清洗中 / 已清洗.

## Brand knowledge base (stage 1)

`<workspace_root>/GEO/01_品牌知识库/` holds `清洗规则.md` (the team's cleaning standard — read it fully before cleaning),
`原始资料/` (uploads, never edit), and the modules `00_总览.md`, `01_品牌实体.md`, `02_产品库/<SKU>.md`, `03_资质合规.md`,
`04_FAQ.md`, `05_竞品对比.md`, `06_合规红线.md`. A module still containing `<!-- DingGouGEO 模板` is an unfilled template:
replace the example rows with real content and delete that marker line.

- **Cleaning**: read the raw file (use the pdf/docx/xlsx skills), write facts into the module files per the rules, insert
  each fact into `geo_fact` (`record_id = 'local_' || lower(hex(randomblob(16)))`, `local_edited = 1`), then
  `UPDATE geo_kb_source SET status='已清洗', cleaned_at=datetime('now') WHERE project_id=? AND file_name=?`.
- **Grounding**: before writing any GEO content, read `06_合规红线.md`, `02_产品库/`, and `04_FAQ.md`, and only state
  facts that exist in the ledger (grade A/B as facts, C as「品牌方表示」, never E). Missing facts → say they're missing.

## How to work

1. Start with counts/grouping to size the question, then pull the specific rows. Quote record `id`s so the user can open them in the board.
2. When the user's message lists rows as `[id=123] …`, those are `id`s in the named table — look them up for full fields (e.g. the full `answer`).
3. For mention / TOP3 / recommendation questions, use the human-labelled `geo_answer_analysis` columns first
   (e.g. mention rate = `mentions_own = '是'` over analysed answers) and say which column you used. Always state which
   capture round(s) a number covers; never pool rounds unless asked — compare them side by side instead. Only fall back to
   searching `answer` text when an answer has no analysis row, and say so.
4. Editing (only when asked): `UPDATE … SET …, local_edited = 1, updated_at = datetime('now')`; delete with
   `UPDATE … SET deleted = 1, updated_at = datetime('now')` — never `DELETE`. New rows need `project_id`,
   `record_id = 'local_' || lower(hex(randomblob(16)))`, `local_edited = 1`; new answers/sources/analyses also need
   `capture_round` (the round being captured — usually the latest `geo_capture_round`). Say what you changed; the user sees it after refreshing the board.
