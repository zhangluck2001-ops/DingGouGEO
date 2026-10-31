// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
// Studio preview skeleton — sample data only. No backend, all copy is Chinese
// placeholder text with fictional source names. Anything sounding like real
// news or a real outlet is coincidental and marked 「示例」.

export type StudioMode = 'data' | 'run' | 'diag';

export interface StudioProduct {
  id: string;
  name: string;
  intro: string;
  hasData: boolean;
  round: number;
  competitors: string[];
}

export type ChatMsgKind = 'ai' | 'user' | 'date';

export interface ChatStep {
  symbol: string;
  text: string;
}

export interface ChatOption {
  text: string;
  sub?: string;
  rec?: boolean;
  switch?: { mode: StudioMode; tab: string };
  ask?: string;
  openCard?: boolean;
  skip?: boolean;
}

export interface ChatMessage {
  id: string;
  kind: ChatMsgKind;
  text?: string;
  steps?: ChatStep[];
  options?: ChatOption[];
  date?: string;
}

export type FeedType = 'competitor' | 'policy' | 'ai' | 'brand';

export interface FeedItem {
  id: string;
  type: FeedType;
  source: string;
  time: string;
  title: string;
  summary: string;
  relation: string;
  urgent?: boolean;
  askPreset?: string;
  sample?: boolean;
}

export interface FocusTag {
  id: string;
  text: string;
  removable: boolean;
}

export type CleanStepStatus = 'done' | 'doing' | 'todo';
export type CleanActor = 'program' | 'ai' | 'you';

export interface CleanStep {
  seq: number;
  status: CleanStepStatus;
  title: string;
  detail: string;
  actor: CleanActor;
  backend?: string;
}

export type EvidenceGrade = 'A' | 'B' | 'C' | 'D' | 'E';

export interface PendingFact {
  id: string;
  question: string;
  grade: EvidenceGrade;
  source: string;
  conflict?: string;
  weak?: boolean;
}

export interface CleaningUsage {
  chars: string;
  cacheHit: string;
  cost: string;
}

export interface KnowledgeModule {
  key: string;
  count: number;
  fromCard?: boolean;
}

export interface GradeDistribution {
  grade: EvidenceGrade;
  count: number;
}

export interface Probe {
  id: string;
  text: string;
  nonBrand: boolean;
}

export type DraftStatus = 'pending' | 'published' | 'failed';

export interface Draft {
  id: string;
  title: string;
  status: DraftStatus;
  failDetail?: string;
}

export interface CapturePlatform {
  name: string;
  done: number;
  total: number;
}

export interface PublishRecord {
  id: string;
  title: string;
  platform: string;
  date: string;
}

export interface Kpi {
  label: string;
  value: string;
  delta: number;
}

export interface PlatformMetric {
  platform: string;
  mention: number;
  first: number;
  top3: number;
}

export type GapSeverity = 'high' | 'mid' | 'none';

export interface Gap {
  id: string;
  text: string;
  severity: GapSeverity;
}

export interface CitationSite {
  site: string;
  count: number;
}

export interface BrandCard {
  company: string;
  certs: string;
  redlines: string;
}

// ---------------------------------------------------------------------------
// Sample products: 全安素 has a full round of data; 小安素 is a freshly
// created profile with no capture yet (drives the empty-state branches).
// ---------------------------------------------------------------------------

export const mockProducts: StudioProduct[] = [
  {
    id: 'quan-ansu',
    name: '全安素',
    intro: '一款给中老年和术后人群的营养粉',
    hasData: true,
    round: 3,
    competitors: ['竞品甲', '竞品乙', '竞品丙'],
  },
  {
    id: 'xiao-ansu',
    name: '小安素',
    intro: '一款给儿童的成长营养粉',
    hasData: false,
    round: 0,
    competitors: [],
  },
];

export const mockBrandCard: BrandCard = {
  company: '示例营养科技有限公司',
  certs:
    '食品生产许可证 SC12345678901 · 保健食品批文 国食健字 G2024XXXX（2 份原件已上传）',
  redlines:
    '不得宣称治疗、治愈；不得使用「最」「第一」等绝对化用语；特医食品须标注适用人群（共 14 条）',
};

// ---------------------------------------------------------------------------
// Chat — per-mode sample conversations for 全安素.
// ---------------------------------------------------------------------------

export const mockChatByMode: Record<StudioMode, ChatMessage[]> = {
  data: [
    {
      id: 'd-date',
      kind: 'date',
      date: '10-31',
    },
    {
      id: 'd-ai-1',
      kind: 'ai',
      text: '清洗流程跑完了。46 条候选事实里，41 条通过，3 条合并，剩 7 条要你确认。',
      steps: [
        { symbol: '✓', text: '上传原件：3 份（说明书、标签、检测报告）' },
        { symbol: '✓', text: '解析成文字：12 页 PDF + 3 张表 + 1 份 Word' },
        { symbol: '✓', text: 'AI 拆成事实：46 条候选' },
        { symbol: '…', text: '程序校验：41 通过 · 3 合并 · 2 冲突' },
        { symbol: '·', text: '人工确认：待确认 7 条' },
      ],
    },
  ],
  run: [
    {
      id: 'r-date',
      kind: 'date',
      date: '10-31',
    },
    {
      id: 'r-ai-1',
      kind: 'ai',
      text: '第 3 轮采集进行中。豆包和 DeepSeek 已跑完，千问和元宝还在排队。',
      steps: [
        { symbol: '✓', text: '豆包：30 / 30 完成' },
        { symbol: '✓', text: 'DeepSeek：22 / 30 完成' },
        { symbol: '…', text: '千问：排队中' },
        { symbol: '·', text: '元宝：排队中' },
      ],
      options: [
        {
          text: '等全部跑完再看诊断',
          sub: '约还要 10 分钟',
          rec: true,
        },
        {
          text: '先看豆包和 DeepSeek 的结果',
          sub: '样本覆盖约 60%',
          switch: { mode: 'diag', tab: '动态' },
        },
      ],
    },
  ],
  diag: [
    {
      id: 'g-date',
      kind: 'date',
      date: '10-31',
    },
    {
      id: 'g-ai-1',
      kind: 'ai',
      text: '自上次以来有 3 处变化：提及率 +6%、豆包排位上升 2 位、有一条要紧的竞品动态。',
      steps: [
        { symbol: '↑', text: '提及率 37%（+6%）' },
        { symbol: '↑', text: '豆包 TOP3 排位第 2（升 2 位）' },
        { symbol: '!', text: '竞品「竞品甲」发了一款新品，主打银发人群' },
      ],
      options: [
        {
          text: '看看这条竞品动态怎么应对',
          sub: '可能会挤压你的银发人群份额',
          rec: true,
          ask: '竞品甲的新品对我们全安素的银发人群份额有什么影响？',
        },
        {
          text: '先改稿子，把「术后恢复」这条卖点补强',
          sub: '稿子校验未过：2 处说法对不上知识库',
          switch: { mode: 'data', tab: '稿子' },
        },
        {
          text: '看完整诊断报告',
          sub: '本轮 30 个问题的逐条分析',
        },
      ],
    },
  ],
};

// Onboarding conversation shown when there is no product yet.
export const mockOnboardGreetEmpty: ChatMessage = {
  id: 'onboard-greet',
  kind: 'ai',
  text: '你好，我是 DingGouGEO 的 GEO 助手 👋 先认识一下：你要优化的产品叫什么？顺便一句话说说它是什么、卖给谁，比如「全安素，一款给中老年和术后人群的营养粉」。',
};

// Guide shown after a profile is created but has no capture data yet.
export const mockGuideSteps: ChatStep[] = [
  { symbol: '·', text: '上传原件，清洗进知识库（资料模式）' },
  { symbol: '·', text: '准备探针问题（资料模式）' },
  { symbol: '·', text: '第一轮采集 AI 回答（运行模式）' },
];

// ---------------------------------------------------------------------------
// Feed — sample activity items for 全安素. One item is urgent so the
// 「要紧」tag and the opening recap can both be exercised.
// ---------------------------------------------------------------------------

export const mockFeed: FeedItem[] = [
  {
    id: 'feed-1',
    type: 'competitor',
    source: '某行业媒体',
    time: '10 分钟前',
    title: '竞品甲发布新品「银养+」，主打银发人群',
    summary: '竞品甲上线了一款针对 50+ 人群的蛋白粉，强调「高蛋白、低糖、加钙」，定价 198 元。',
    relation: '可能挤压全安素在银发人群的份额，建议尽快对比卖点差异。',
    urgent: true,
    askPreset: '竞品甲的新品对我们全安素的银发人群份额有什么影响？',
    sample: true,
  },
  {
    id: 'feed-2',
    type: 'policy',
    source: '某监管部门网站',
    time: '2 小时前',
    title: '特医食品新增适用人群标注要求',
    summary: '新版指引要求特医食品在包装和宣传中明确标注适用人群,不得模糊「全人群」表述。',
    relation: '全安素的合规红线已覆盖此条,稿子审校时注意不要越线。',
    askPreset: '这条新规对我们现有稿子有没有影响？',
    sample: true,
  },
  {
    id: 'feed-3',
    type: 'ai',
    source: '某 AI 行业观察',
    time: '昨天',
    title: '豆包更新回答排序逻辑,优先引用带来源的段落',
    summary: '豆包本周调整了排序权重,带明确出处的段落更容易进 TOP3。',
    relation: '稿子里补强出处和引用,有助于提升在全安素相关提问下的排位。',
    askPreset: '我们哪些稿子需要补出处？',
    sample: true,
  },
  {
    id: 'feed-4',
    type: 'brand',
    source: '某企业资讯站',
    time: '前天',
    title: '示例营养科技获得一项配方专利',
    summary: '公司获得一项关于「中老年蛋白吸收配方」的专利,期限 10 年。',
    relation: '可以作为 A 级证据写入知识库,稿子里能引用。',
    askPreset: '把这条专利写进知识库要怎么操作？',
    sample: true,
  },
];

// The fresh item inserted ~20s after the feed opens, to demo unread count.
export const mockFreshFeed: FeedItem = {
  id: 'feed-fresh',
  type: 'ai',
  source: '某 AI 行业观察',
  time: '刚刚',
  title: 'DeepSeek 回答里开始出现「竞品甲」的首提',
  summary: '本轮采集中,DeepSeek 在 3 个问题上首推了竞品甲,而非全安素。',
  relation: '首提率可能下滑,建议在稿子里强化与竞品甲的差异化卖点。',
  askPreset: 'DeepSeek 首推竞品甲的那 3 个问题是什么？',
  sample: true,
};

export const mockFocusTags: FocusTag[] = [
  { id: 'tag-1', text: '银发人群', removable: true },
  { id: 'tag-2', text: '术后恢复', removable: true },
  { id: 'tag-3', text: '竞品甲', removable: true },
];

// ---------------------------------------------------------------------------
// Data-mode panels.
// ---------------------------------------------------------------------------

export const mockCleanSteps: CleanStep[] = [
  {
    seq: 1,
    status: 'done',
    title: '上传原件',
    detail: '3 份 · 存进本产品档案',
    actor: 'program',
    backend:
      '文件放进「全安素/原始资料/」,记下文件指纹。同一份文件再传一次不会重复清洗,省用量。',
  },
  {
    seq: 2,
    status: 'done',
    title: '解析成文字',
    detail: '12 页 PDF + 3 张表 + 1 份 Word',
    actor: 'program',
    backend:
      'PDF（扫描页走识别）、Excel（含单元格图片）、Word、PPT、图片转成带位置的文字。这一步不用 AI,不花模型费用。',
  },
  {
    seq: 3,
    status: 'done',
    title: 'AI 拆成事实',
    detail: '46 条候选',
    actor: 'ai',
    backend:
      '按文件分给几个子助手同时拆,每条事实必须写清出处。AI 只看解析结果,看不到其他产品档案。',
  },
  {
    seq: 4,
    status: 'doing',
    title: '程序校验',
    detail: '41 通过 · 3 合并 · 2 冲突',
    actor: 'program',
    backend:
      '逐条核对:出处在原文里找得到吗?跟已有事实重复或冲突吗?碰合规红线了吗?证据等级按规则定（A 官方批文 … E 口头说法）,不由 AI 自己打分。',
  },
  {
    seq: 5,
    status: 'todo',
    title: '人工确认',
    detail: '待确认 7 条',
    actor: 'you',
    backend:
      '冲突和 D/E 级给你逐条看,A/B 级可以一键确认。确认后才写进知识库七个模块和知识条目表。',
  },
];

export const mockPendingFacts: PendingFact[] = [
  {
    id: 'fact-1',
    question: '全安素的蛋白质含量是每 100g 18g 还是 16g?',
    grade: 'B',
    source: '产品标签（2024 版） vs 检测报告（2023 版）',
    conflict: '标签写 18g,检测报告写 16g',
  },
  {
    id: 'fact-2',
    question: '全安素适用于「术后恢复期人群」吗?',
    grade: 'A',
    source: '产品注册证',
  },
  {
    id: 'fact-3',
    question: '经销商反馈「老年客户复购率高」能作为事实写入吗?',
    grade: 'E',
    source: '某经销商访谈记录',
    weak: true,
  },
];

export const mockCleaningUsage: CleaningUsage = {
  chars: '约 8.4 万字',
  cacheHit: '缓存命中率 62%',
  cost: '约 ¥1.8',
};

export const mockKnowledgeModules: KnowledgeModule[] = [
  { key: 'overview', count: 12 },
  { key: 'brand', count: 8 },
  { key: 'product', count: 64 },
  { key: 'compliance', count: 9 },
  { key: 'faq', count: 31 },
  { key: 'compare', count: 17 },
  { key: 'redline', count: 14, fromCard: true },
];

export const mockGradeDistribution: GradeDistribution[] = [
  { grade: 'A', count: 38 },
  { grade: 'B', count: 61 },
  { grade: 'C', count: 27 },
  { grade: 'D', count: 9 },
  { grade: 'E', count: 6 },
];

export const mockProbes: Probe[] = [
  { id: 'probe-1', text: '中老年营养粉哪个牌子好?', nonBrand: true },
  { id: 'probe-2', text: '术后吃什么恢复快?', nonBrand: true },
  { id: 'probe-3', text: '蛋白粉选购要注意什么?', nonBrand: true },
  { id: 'probe-4', text: '特医食品和保健食品区别?', nonBrand: true },
];

export const mockDrafts: Draft[] = [
  {
    id: 'draft-1',
    title: '术后恢复期怎么科学补营养',
    status: 'pending',
  },
  {
    id: 'draft-2',
    title: '中老年蛋白粉选购指南',
    status: 'published',
  },
  {
    id: 'draft-3',
    title: '特医食品 5 个常见误区',
    status: 'failed',
    failDetail: '2 处说法对不上知识库',
  },
];

// ---------------------------------------------------------------------------
// Run-mode panels.
// ---------------------------------------------------------------------------

export const mockCapturePlatforms: CapturePlatform[] = [
  { name: '豆包', done: 30, total: 30 },
  { name: 'DeepSeek', done: 22, total: 30 },
  { name: '千问', done: 0, total: 30 },
  { name: '元宝', done: 0, total: 30 },
];

export const mockPublishRecords: PublishRecord[] = [
  {
    id: 'pub-1',
    title: '中老年蛋白粉选购指南',
    platform: '知乎',
    date: '10-28',
  },
  {
    id: 'pub-2',
    title: '术后营养补给的 3 个误区',
    platform: '小红书',
    date: '10-25',
  },
  {
    id: 'pub-3',
    title: '特医食品合规标注怎么读',
    platform: '公众号',
    date: '10-20',
  },
];

// ---------------------------------------------------------------------------
// Diagnose-mode panels.
// ---------------------------------------------------------------------------

export const mockKpis: Kpi[] = [
  { label: '提及率', value: '37%', delta: 6 },
  { label: '首提率', value: '9%', delta: 2 },
  { label: 'TOP3 率', value: '18%', delta: -1 },
];

export const mockPlatformMetrics: PlatformMetric[] = [
  { platform: '豆包', mention: 18, first: 5, top3: 4 },
  { platform: 'DeepSeek', mention: 12, first: 3, top3: 2 },
  { platform: '千问', mention: 4, first: 1, top3: 0 },
  { platform: '元宝', mention: 3, first: 0, top3: 0 },
];

export const mockGaps: Gap[] = [
  {
    id: 'gap-1',
    text: '在「术后恢复」相关提问里,全安素被首推的比例偏低（12%）',
    severity: 'high',
  },
  {
    id: 'gap-2',
    text: '稿子里「高蛋白」卖点没有出处,被豆包降权',
    severity: 'mid',
  },
  {
    id: 'gap-3',
    text: '千问和元宝的样本量不够,诊断置信度低',
    severity: 'none',
  },
];

export const mockCitationSites: CitationSite[] = [
  { site: '某医疗科普站', count: 41 },
  { site: '某母婴社区', count: 27 },
  { site: '某问答平台', count: 19 },
  { site: '品牌官网', count: 3 },
];
