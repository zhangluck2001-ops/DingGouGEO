// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
// Studio preview skeleton — pure state helpers and reducer. No backend,
// no side effects; safe to unit-test in isolation.

import type {
  ChatMessage,
  ChatOption,
  ChatStep,
  FeedItem,
  FocusTag,
  MemoryItem,
  StudioMode,
  StudioProduct,
} from './mocks/mockData';
import {
  mockChatByMode,
  mockFeed,
  mockFocusTags,
  mockFreshFeed,
  mockMemoriesByProduct,
  mockOnboardGreetEmpty,
  mockProducts,
  STUDIO_TODAY,
} from './mocks/mockData';

export type { StudioMode };

export type OnboardStage =
  | 'asking-intro'
  | 'asking-competitors'
  | 'guided'
  | 'none';

export interface StudioState {
  products: StudioProduct[];
  currentProductId: string | null;
  mode: StudioMode;
  tab: { data: string; run: string; diag: string };
  chatByMode: Record<StudioMode, ChatMessage[]>;
  onboardChat: ChatMessage[];
  isAsking: boolean;
  onboardStage: OnboardStage;
  brandCardOpen: boolean;
  feed: FeedItem[];
  freshFeed: FeedItem[];
  hiddenFeedIds: string[];
  unreadFeed: number;
  focusTags: FocusTag[];
  focusNotice: string | null;
  focusFreq: 'low' | 'medium' | 'high';
  pendingInput: string | null;
  /** 「助手记住的事」 keyed by product id; follows the product, not the mode. */
  memoriesByProduct: Record<string, MemoryItem[]>;
  memoryOpen: boolean;
  /** Whether each mode's folded older days are expanded to the original chat. */
  historyExpanded: Record<StudioMode, boolean>;
}

export type StudioAction =
  | { type: 'SET_MODE'; mode: StudioMode }
  | { type: 'SET_TAB'; mode: StudioMode; tab: string }
  | { type: 'SWITCH_PRODUCT'; productId: string }
  | { type: 'NEW_PRODUCT_FROM_SELECTOR' }
  | { type: 'SUBMIT_PRODUCT_INTRO'; raw: string }
  | { type: 'SUBMIT_COMPETITORS'; raw: string }
  | { type: 'SKIP_COMPETITORS' }
  | { type: 'APPEND_ONBOARD_USER_MESSAGE'; text: string }
  | { type: 'APPEND_USER_MESSAGE'; mode: StudioMode; text: string }
  | { type: 'OPEN_BRAND_CARD' }
  | { type: 'CLOSE_BRAND_CARD' }
  | { type: 'ADD_FOCUS_TAG'; text: string }
  | { type: 'REMOVE_FOCUS_TAG'; id: string }
  | { type: 'SET_FOCUS_FREQ'; freq: 'low' | 'medium' | 'high' }
  | { type: 'HIDE_FEED_ITEM'; id: string }
  | { type: 'ASK_ASSISTANT'; text: string }
  | { type: 'CONSUME_PENDING_INPUT' }
  | { type: 'ADD_FRESH_FEED' }
  | { type: 'CLEAR_FEED_UNREAD' }
  | { type: 'RESET_TO_EMPTY' }
  | { type: 'TOGGLE_HISTORY'; mode: StudioMode }
  | { type: 'OPEN_MEMORY' }
  | { type: 'CLOSE_MEMORY' }
  | { type: 'REMEMBER'; mode: StudioMode; messageId: string; text: string }
  | { type: 'FORGET'; mode: StudioMode; messageId: string }
  | { type: 'ADD_MEMORY'; text: string }
  | { type: 'REMOVE_MEMORY'; id: string };

export const STUDIO_TABS: Record<StudioMode, string[]> = {
  data: ['清洗', '知识库', '探针', '稿子'],
  run: ['采集进度', '发布记录'],
  diag: ['动态', '指标', '缺口', '引用来源'],
};

export const STUDIO_DEFAULT_TAB: Record<StudioMode, string> = {
  data: '清洗',
  run: '采集进度',
  diag: '动态',
};

/**
 * Parse a one-sentence product intro into a name + positioning line.
 *
 * Handles three shapes the spec calls out:
 * - "全安素，一款给中老年的营养粉"  → name=全安素, desc=一款给中老年的营养粉
 * - "我们的产品是全安素，给术后人群" → name=全安素, desc=给术后人群
 * - "小安素"                         → name=小安素, desc=""
 */
export function parseProductIntro(
  raw: string,
  fallbackIndex: number,
): { name: string; desc: string } {
  const text = raw.trim().replace(/^(我们?的?产品(名字)?(叫|是)|叫)/, '');
  const firstChunk = (text.split(/[，,。\s]|是一款|是/)[0] ?? '').trim();
  const name = firstChunk.slice(0, 12) || `新产品${fallbackIndex}`;
  const idx = text.indexOf(name);
  const desc =
    idx === -1
      ? ''
      : text
          .slice(idx + name.length)
          .replace(/^[，,。\s]*(是一款|是)?/, '')
          .trim();
  return { name, desc };
}

/**
 * Split a free-text competitor list into individual names.
 * Separators: 、（顿号） ，（中文逗号） ,（英文逗号） 空白
 */
export function parseCompetitors(raw: string): string[] {
  return raw
    // The real product lets the model read the reply; the skeleton also
    // treats 和/及/与 as list separators.
    .split(/[、，,\s]+|和|及|与/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface ChatDayGroup {
  /** MM-DD from the date marker; '' for messages before any marker. */
  date: string;
  messages: ChatMessage[];
}

/** Group a mode's chat into days using its date marker messages. */
export function groupChatByDay(messages: ChatMessage[]): ChatDayGroup[] {
  const groups: ChatDayGroup[] = [];
  for (const m of messages) {
    if (m.kind === 'date') {
      groups.push({ date: m.date ?? '', messages: [] });
      continue;
    }
    if (groups.length === 0) groups.push({ date: '', messages: [] });
    groups[groups.length - 1].messages.push(m);
  }
  return groups;
}

/** How many of the latest days stay expanded; earlier days fold into a digest. */
export const RECENT_DAYS_KEPT = 2;

export function splitFoldedHistory(
  groups: ChatDayGroup[],
  keepDays = RECENT_DAYS_KEPT,
): { folded: ChatDayGroup[]; recent: ChatDayGroup[] } {
  const cut = Math.max(0, groups.length - keepDays);
  return { folded: groups.slice(0, cut), recent: groups.slice(cut) };
}

/**
 * Whether a message reads like a standing instruction worth remembering.
 * The real product lets the model judge this; the skeleton matches keywords.
 */
export function isRememberIntent(text: string): boolean {
  return /以后|今后|往后|别再|不要再|不许|记住|统一用|一律/.test(text);
}

export function currentMemories(state: StudioState): MemoryItem[] {
  if (!state.currentProductId) return [];
  return state.memoriesByProduct[state.currentProductId] ?? [];
}

export function currentProduct(state: StudioState): StudioProduct | null {
  return state.products.find((p) => p.id === state.currentProductId) ?? null;
}

/** Asking = no product yet, or the user just clicked 「新建产品档案」. */
export function isAskingState(state: StudioState): boolean {
  return state.products.length === 0 || state.isAsking;
}

export function hasData(state: StudioState): boolean {
  return currentProduct(state)?.hasData ?? false;
}

export function createInitialStudioState(
  overrides?: Partial<StudioState>,
): StudioState {
  const products = overrides?.products ?? mockProducts;
  const hasProducts = products.length > 0;
  return {
    products,
    currentProductId: overrides?.currentProductId ?? (hasProducts ? products[0].id : null),
    mode: 'diag',
    tab: { data: '清洗', run: '采集进度', diag: '动态' },
    chatByMode: overrides?.chatByMode ?? mockChatByMode,
    onboardChat: overrides?.onboardChat ?? (hasProducts ? [] : [mockOnboardGreetEmpty]),
    isAsking: !hasProducts,
    onboardStage: hasProducts ? 'none' : 'asking-intro',
    brandCardOpen: false,
    feed: mockFeed,
    freshFeed: [],
    hiddenFeedIds: [],
    unreadFeed: 0,
    focusTags: mockFocusTags,
    focusNotice: null,
    focusFreq: 'low',
    pendingInput: null,
    memoriesByProduct: mockMemoriesByProduct,
    memoryOpen: false,
    historyExpanded: { data: false, run: false, diag: false },
    ...overrides,
  };
}

let messageCounter = 0;
function nextId(prefix: string): string {
  messageCounter += 1;
  return `${prefix}-${messageCounter}`;
}

/** Append messages to a mode's chat, opening today's day first if needed. */
function appendToday(
  chat: ChatMessage[],
  ...messages: ChatMessage[]
): ChatMessage[] {
  const lastDate = [...chat].reverse().find((m) => m.kind === 'date');
  const needsDay = lastDate?.date !== STUDIO_TODAY;
  return [
    ...chat,
    ...(needsDay
      ? [{ id: nextId('chat-date'), kind: 'date' as const, date: STUDIO_TODAY }]
      : []),
    ...messages,
  ];
}

/** Drop the options from an answered memory proposal so it can't be re-picked. */
function closeProposal(
  chat: ChatMessage[],
  messageId: string,
  answer: string,
): ChatMessage[] {
  return chat.map((m) =>
    m.id === messageId
      ? {
          ...m,
          options: undefined,
          steps: [...(m.steps ?? []), { symbol: '→', text: answer }],
        }
      : m,
  );
}

function guideSteps(): ChatStep[] {
  return [
    { symbol: '·', text: '上传原件，清洗进知识库（资料模式）' },
    { symbol: '·', text: '准备探针问题（资料模式）' },
    { symbol: '·', text: '第一轮采集 AI 回答（运行模式）' },
  ];
}

function guideOptions(): ChatOption[] {
  return [
    {
      text: '去资料模式上传原件',
      sub: '清洗进知识库',
      rec: true,
      switch: { mode: 'data', tab: '清洗' },
    },
    {
      text: '先填品牌名片',
      sub: '公司名称、资质、合规红线',
      openCard: true,
    },
  ];
}

export function studioReducer(
  state: StudioState,
  action: StudioAction,
): StudioState {
  switch (action.type) {
    case 'SET_MODE': {
      if (isAskingState(state) && action.mode !== 'diag') return state;
      return { ...state, mode: action.mode };
    }
    case 'SET_TAB': {
      const nextTab = { ...state.tab, [action.mode]: action.tab };
      const clearUnread = action.mode === 'diag' && action.tab === '动态';
      return {
        ...state,
        tab: nextTab,
        unreadFeed: clearUnread ? 0 : state.unreadFeed,
      };
    }
    case 'SWITCH_PRODUCT': {
      if (!state.products.some((p) => p.id === action.productId)) return state;
      return {
        ...state,
        currentProductId: action.productId,
        mode: 'diag',
        tab: { ...state.tab, diag: '动态' },
        isAsking: false,
        onboardStage: 'none',
        freshFeed: [],
        hiddenFeedIds: [],
        unreadFeed: 0,
        onboardChat: [],
        memoryOpen: false,
        historyExpanded: { data: false, run: false, diag: false },
      };
    }
    case 'NEW_PRODUCT_FROM_SELECTOR': {
      const hasOthers = state.products.length > 0;
      const greet: ChatMessage = hasOthers
        ? {
            id: nextId('onboard-greet'),
            kind: 'ai',
            text: '好的，新建一个产品档案。这个产品叫什么？一句话介绍一下就行。',
          }
        : { ...mockOnboardGreetEmpty, id: nextId('onboard-greet') };
      return {
        ...state,
        isAsking: true,
        onboardStage: 'asking-intro',
        mode: 'diag',
        onboardChat: [greet],
      };
    }
    case 'SUBMIT_PRODUCT_INTRO': {
      const { name, desc } = parseProductIntro(
        action.raw,
        state.products.length + 1,
      );
      const newProduct: StudioProduct = {
        id: `prod-${Date.now()}`,
        name,
        intro: desc,
        hasData: false,
        round: 0,
        competitors: [],
      };
      const acknowledge: ChatMessage = {
        id: nextId('onboard-ai'),
        kind: 'ai',
        text: `记下了 ✓ 已经建好「${name}」的档案，写进了产品简介：`,
        steps: [
          { symbol: '✦', text: `产品名称：${name}` },
          { symbol: '✦', text: `我理解的定位：${desc || '（待补充）'}` },
          { symbol: '✦', text: '开始为它收集相关资讯' },
        ],
        options: [
          { text: '对，没问题', rec: true },
          { text: '改一下', sub: '重新介绍产品' },
        ],
      };
      const askCompetitors: ChatMessage = {
        id: nextId('onboard-ask-comp'),
        kind: 'ai',
        text: '主要竞品有哪些？用顿号或逗号隔开，没有可以跳过。',
        options: [{ text: '跳过', sub: '以后再补', skip: true }],
      };
      return {
        ...state,
        products: [...state.products, newProduct],
        currentProductId: newProduct.id,
        isAsking: false,
        onboardStage: 'asking-competitors',
        mode: 'diag',
        tab: { ...state.tab, diag: '动态' },
        onboardChat: [
          ...state.onboardChat,
          { id: nextId('onboard-user'), kind: 'user', text: action.raw },
          acknowledge,
          askCompetitors,
        ],
      };
    }
    case 'SUBMIT_COMPETITORS': {
      const product = currentProduct(state);
      if (!product) return state;
      const competitors = parseCompetitors(action.raw);
      const updatedProducts = state.products.map((p) =>
        p.id === product.id ? { ...p, competitors } : p,
      );
      const newTags: FocusTag[] = competitors.map((c, idx) => ({
        id: `tag-comp-${Date.now()}-${idx}`,
        text: c,
        removable: true,
      }));
      const list = competitors.length > 0 ? competitors.join('、') : '（无）';
      const ackMessage: ChatMessage = {
        id: nextId('onboard-comp-ack'),
        kind: 'ai',
        text: `记下了：竞品 ${list}，已加入动态的关注范围。`,
      };
      const guideMessage: ChatMessage = {
        id: nextId('onboard-guide'),
        kind: 'ai',
        text: '接下来按这个顺序：',
        steps: guideSteps(),
        options: guideOptions(),
      };
      return {
        ...state,
        products: updatedProducts,
        focusTags: [...state.focusTags, ...newTags],
        onboardStage: 'guided',
        onboardChat: [
          ...state.onboardChat,
          { id: nextId('onboard-user'), kind: 'user', text: action.raw },
          ackMessage,
          guideMessage,
        ],
      };
    }
    case 'SKIP_COMPETITORS': {
      if (state.onboardStage !== 'asking-competitors') return state;
      const guideMessage: ChatMessage = {
        id: nextId('onboard-guide'),
        kind: 'ai',
        text: '没问题，竞品以后再补。接下来按这个顺序：',
        steps: guideSteps(),
        options: guideOptions(),
      };
      return {
        ...state,
        onboardStage: 'guided',
        onboardChat: [...state.onboardChat, guideMessage],
      };
    }
    case 'APPEND_ONBOARD_USER_MESSAGE': {
      return {
        ...state,
        onboardChat: [
          ...state.onboardChat,
          { id: nextId('onboard-user'), kind: 'user', text: action.text },
        ],
      };
    }
    case 'APPEND_USER_MESSAGE': {
      const userMessage: ChatMessage = {
        id: nextId('chat-user'),
        kind: 'user',
        text: action.text,
      };
      // A standing instruction is never saved silently: the assistant asks
      // first, so the list only holds what the user agreed to.
      const proposal: ChatMessage[] = isRememberIntent(action.text)
        ? [
            {
              id: nextId('chat-remember'),
              kind: 'ai',
              text: '这句话像是一条长期规则。要我记进「助手记住的事」吗？记住后，三个模式每次回答前都会先读它。',
              steps: [{ symbol: '✦', text: action.text }],
              options: [
                { text: '记住这条', rec: true, remember: action.text },
                { text: '不用记', sub: '只在这次对话里用', forget: true },
              ],
              hideNone: true,
            },
          ]
        : [];
      return {
        ...state,
        chatByMode: {
          ...state.chatByMode,
          [action.mode]: appendToday(
            state.chatByMode[action.mode],
            userMessage,
            ...proposal,
          ),
        },
      };
    }
    case 'REMEMBER': {
      const productId = state.currentProductId;
      if (!productId) return state;
      const existing = state.memoriesByProduct[productId] ?? [];
      const memory: MemoryItem = {
        id: nextId('memory-new'),
        text: action.text,
        kind: 'rule',
        source: { mode: action.mode, date: STUDIO_TODAY },
      };
      const chat = closeProposal(
        state.chatByMode[action.mode],
        action.messageId,
        '已记住',
      );
      return {
        ...state,
        memoriesByProduct: {
          ...state.memoriesByProduct,
          [productId]: existing.some((m) => m.text === action.text)
            ? existing
            : [memory, ...existing],
        },
        chatByMode: {
          ...state.chatByMode,
          [action.mode]: [
            ...chat,
            {
              id: nextId('chat-ai'),
              kind: 'ai',
              text: '记住了 ✓ 已写进「助手记住的事」，随时可以在清单里改掉或删掉。',
            },
          ],
        },
      };
    }
    case 'FORGET': {
      const chat = closeProposal(
        state.chatByMode[action.mode],
        action.messageId,
        '不记',
      );
      return {
        ...state,
        chatByMode: {
          ...state.chatByMode,
          [action.mode]: [
            ...chat,
            {
              id: nextId('chat-ai'),
              kind: 'ai',
              text: '好，这条不记，只在这次对话里用。',
            },
          ],
        },
      };
    }
    case 'ADD_MEMORY': {
      const productId = state.currentProductId;
      const text = action.text.trim();
      if (!productId || !text) return state;
      const existing = state.memoriesByProduct[productId] ?? [];
      if (existing.some((m) => m.text === text)) return state;
      const memory: MemoryItem = {
        id: nextId('memory-new'),
        text,
        kind: 'rule',
        source: 'manual',
      };
      return {
        ...state,
        memoriesByProduct: {
          ...state.memoriesByProduct,
          [productId]: [memory, ...existing],
        },
      };
    }
    case 'REMOVE_MEMORY': {
      const productId = state.currentProductId;
      if (!productId) return state;
      return {
        ...state,
        memoriesByProduct: {
          ...state.memoriesByProduct,
          [productId]: (state.memoriesByProduct[productId] ?? []).filter(
            (m) => m.id !== action.id,
          ),
        },
      };
    }
    case 'OPEN_MEMORY':
      return { ...state, memoryOpen: true };
    case 'CLOSE_MEMORY':
      return { ...state, memoryOpen: false };
    case 'TOGGLE_HISTORY':
      return {
        ...state,
        historyExpanded: {
          ...state.historyExpanded,
          [action.mode]: !state.historyExpanded[action.mode],
        },
      };
    case 'OPEN_BRAND_CARD':
      return { ...state, brandCardOpen: true };
    case 'CLOSE_BRAND_CARD':
      return { ...state, brandCardOpen: false };
    case 'ADD_FOCUS_TAG': {
      const tag: FocusTag = {
        id: `tag-${Date.now()}`,
        text: action.text,
        removable: true,
      };
      return {
        ...state,
        focusTags: [...state.focusTags, tag],
        focusNotice: '助手已按这句话调整收集范围',
      };
    }
    case 'REMOVE_FOCUS_TAG':
      return {
        ...state,
        focusTags: state.focusTags.filter((t) => t.id !== action.id),
      };
    case 'SET_FOCUS_FREQ':
      return { ...state, focusFreq: action.freq };
    case 'HIDE_FEED_ITEM':
      return {
        ...state,
        hiddenFeedIds: [...state.hiddenFeedIds, action.id],
      };
    case 'ASK_ASSISTANT':
      return { ...state, pendingInput: action.text };
    case 'CONSUME_PENDING_INPUT':
      return { ...state, pendingInput: null };
    case 'ADD_FRESH_FEED': {
      if (state.freshFeed.length > 0) return state;
      const isViewingFeed =
        state.mode === 'diag' && state.tab.diag === '动态';
      return {
        ...state,
        freshFeed: [mockFreshFeed],
        unreadFeed: isViewingFeed ? 0 : state.unreadFeed + 1,
      };
    }
    case 'CLEAR_FEED_UNREAD':
      return { ...state, unreadFeed: 0 };
    case 'RESET_TO_EMPTY': {
      return {
        ...state,
        products: [],
        currentProductId: null,
        isAsking: true,
        onboardStage: 'asking-intro',
        mode: 'diag',
        tab: { data: '清洗', run: '采集进度', diag: '动态' },
        onboardChat: [
          { ...mockOnboardGreetEmpty, id: nextId('onboard-greet') },
        ],
        freshFeed: [],
        hiddenFeedIds: [],
        unreadFeed: 0,
        focusTags: [],
        focusNotice: null,
        brandCardOpen: false,
        pendingInput: null,
        memoriesByProduct: {},
        memoryOpen: false,
        historyExpanded: { data: false, run: false, diag: false },
      };
    }
    default:
      return state;
  }
}
