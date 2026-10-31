// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
import { describe, expect, it } from 'vitest';

import {
  createInitialStudioState,
  currentMemories,
  currentProduct,
  groupChatByDay,
  hasData,
  isAskingState,
  isRememberIntent,
  splitFoldedHistory,
  parseCompetitors,
  parseProductIntro,
  studioReducer,
} from './studioState';

describe('parseProductIntro', () => {
  it('parses "全安素，一款给中老年的营养粉" into name + desc', () => {
    const result = parseProductIntro('全安素，一款给中老年的营养粉', 1);
    expect(result.name).toBe('全安素');
    expect(result.desc).toBe('一款给中老年的营养粉');
  });

  it('strips leading "我们的产品是" and keeps the rest', () => {
    const result = parseProductIntro('我们的产品是全安素，给术后人群', 1);
    expect(result.name).toBe('全安素');
    expect(result.desc).toBe('给术后人群');
  });

  it('handles a bare product name with no descriptor', () => {
    const result = parseProductIntro('小安素', 1);
    expect(result.name).toBe('小安素');
    expect(result.desc).toBe('');
  });

  it('falls back to a placeholder name when input is empty', () => {
    const result = parseProductIntro('   ', 3);
    expect(result.name).toBe('新产品3');
    expect(result.desc).toBe('');
  });

  it('truncates names longer than 12 characters', () => {
    const result = parseProductIntro('一二三四五六七八九十十一十二十三', 1);
    expect(result.name.length).toBeLessThanOrEqual(12);
  });
});

describe('createInitialStudioState', () => {
  it('enters diagnose mode by default', () => {
    const state = createInitialStudioState();
    expect(state.mode).toBe('diag');
    expect(state.tab.diag).toBe('动态');
  });

  it('defaults each mode to its first tab', () => {
    const state = createInitialStudioState();
    expect(state.tab).toEqual({
      data: '清洗',
      run: '采集进度',
      diag: '动态',
    });
  });

  it('starts with the first product selected', () => {
    const state = createInitialStudioState();
    expect(state.currentProductId).toBe(state.products[0].id);
    expect(isAskingState(state)).toBe(false);
  });

  it('enters asking state when the products list is empty', () => {
    const state = createInitialStudioState({ products: [] });
    expect(state.products).toHaveLength(0);
    expect(state.isAsking).toBe(true);
    expect(isAskingState(state)).toBe(true);
    expect(state.onboardChat).toHaveLength(1);
  });
});

describe('studioReducer — SWITCH_PRODUCT', () => {
  it('resets to diagnose mode and the activity tab when switching products', () => {
    const state = createInitialStudioState();
    const switched = studioReducer(state, {
      type: 'SWITCH_PRODUCT',
      productId: state.products[1].id,
    });
    expect(switched.mode).toBe('diag');
    expect(switched.tab.diag).toBe('动态');
    expect(switched.currentProductId).toBe(state.products[1].id);
  });

  it('clears fresh feed, hidden ids, and unread when switching products', () => {
    const state = createInitialStudioState();
    const withFresh = studioReducer(state, { type: 'ADD_FRESH_FEED' });
    const withHidden = studioReducer(withFresh, {
      type: 'HIDE_FEED_ITEM',
      id: state.feed[0].id,
    });
    const switched = studioReducer(withHidden, {
      type: 'SWITCH_PRODUCT',
      productId: state.products[1].id,
    });
    expect(switched.freshFeed).toHaveLength(0);
    expect(switched.hiddenFeedIds).toHaveLength(0);
    expect(switched.unreadFeed).toBe(0);
  });
});

describe('studioReducer — SUBMIT_PRODUCT_INTRO', () => {
  it('creates a new product with the parsed name and intro', () => {
    const state = createInitialStudioState({ products: [] });
    const next = studioReducer(state, {
      type: 'SUBMIT_PRODUCT_INTRO',
      raw: '全安素，一款给中老年的营养粉',
    });
    expect(next.products).toHaveLength(1);
    expect(next.products[0].name).toBe('全安素');
    expect(next.products[0].intro).toBe('一款给中老年的营养粉');
    expect(next.products[0].hasData).toBe(false);
    expect(next.isAsking).toBe(false);
    expect(next.mode).toBe('diag');
    expect(next.tab.diag).toBe('动态');
    expect(next.onboardStage).toBe('asking-competitors');
    // user message + acknowledge + ask-competitors
    expect(next.onboardChat.length).toBeGreaterThan(state.onboardChat.length);
  });
});

describe('studioReducer — SET_MODE / SET_TAB', () => {
  it('does not allow data or run mode while asking', () => {
    const state = createInitialStudioState({ products: [] });
    const next = studioReducer(state, { type: 'SET_MODE', mode: 'data' });
    expect(next.mode).toBe('diag');
  });

  it('allows switching to data mode once a product exists', () => {
    const state = createInitialStudioState();
    const next = studioReducer(state, { type: 'SET_MODE', mode: 'data' });
    expect(next.mode).toBe('data');
  });

  it('clears unread when entering the activity tab', () => {
    const state = createInitialStudioState();
    // leave the tab, add fresh (unread bumps), then come back
    const away = studioReducer(state, {
      type: 'SET_TAB',
      mode: 'diag',
      tab: '指标',
    });
    const withUnread = studioReducer(away, { type: 'ADD_FRESH_FEED' });
    expect(withUnread.unreadFeed).toBe(1);
    const cleared = studioReducer(withUnread, {
      type: 'SET_TAB',
      mode: 'diag',
      tab: '动态',
    });
    expect(cleared.unreadFeed).toBe(0);
  });
});

describe('studioReducer — ADD_FRESH_FEED', () => {
  it('increments unread when the activity tab is not open', () => {
    const state = createInitialStudioState();
    // leave the activity tab so unread starts counting
    const away = studioReducer(state, {
      type: 'SET_TAB',
      mode: 'diag',
      tab: '指标',
    });
    const next = studioReducer(away, { type: 'ADD_FRESH_FEED' });
    expect(next.freshFeed).toHaveLength(1);
    expect(next.unreadFeed).toBe(1);
  });

  it('does not increment unread when the activity tab is already open', () => {
    const state = createInitialStudioState();
    // initial state is already on diag · 动态
    const next = studioReducer(state, { type: 'ADD_FRESH_FEED' });
    expect(next.freshFeed).toHaveLength(1);
    expect(next.unreadFeed).toBe(0);
  });

  it('is idempotent — a second add does not stack another fresh item', () => {
    const state = createInitialStudioState();
    const first = studioReducer(state, { type: 'ADD_FRESH_FEED' });
    const second = studioReducer(first, { type: 'ADD_FRESH_FEED' });
    expect(second.freshFeed).toHaveLength(1);
  });
});

describe('studioReducer — ASK_ASSISTANT / CONSUME_PENDING_INPUT', () => {
  it('sets pendingInput from the preset question', () => {
    const state = createInitialStudioState();
    const next = studioReducer(state, {
      type: 'ASK_ASSISTANT',
      text: '为什么在豆包里排不进前三？',
    });
    expect(next.pendingInput).toBe('为什么在豆包里排不进前三？');
  });

  it('clears pendingInput after consume', () => {
    const state = createInitialStudioState();
    const withPending = studioReducer(state, {
      type: 'ASK_ASSISTANT',
      text: '看看这条竞品动态',
    });
    const consumed = studioReducer(withPending, {
      type: 'CONSUME_PENDING_INPUT',
    });
    expect(consumed.pendingInput).toBeNull();
  });
});

describe('studioReducer — focus range', () => {
  it('adds a focus tag and records the adjustment notice', () => {
    const state = createInitialStudioState();
    const next = studioReducer(state, {
      type: 'ADD_FOCUS_TAG',
      text: '银发人群份额',
    });
    expect(next.focusTags.some((t) => t.text === '银发人群份额')).toBe(true);
    expect(next.focusNotice).toBeTruthy();
  });

  it('removes a focus tag by id', () => {
    const state = createInitialStudioState();
    const target = state.focusTags[0];
    const next = studioReducer(state, {
      type: 'REMOVE_FOCUS_TAG',
      id: target.id,
    });
    expect(next.focusTags.find((t) => t.id === target.id)).toBeUndefined();
  });
});

describe('studioReducer — product selectors after actions', () => {
  it('currentProduct tracks the active id', () => {
    const state = createInitialStudioState();
    const next = studioReducer(state, {
      type: 'SWITCH_PRODUCT',
      productId: state.products[1].id,
    });
    expect(currentProduct(next)?.id).toBe(state.products[1].id);
    expect(hasData(next)).toBe(state.products[1].hasData);
  });
});

describe('parseCompetitors', () => {
  it('splits by 和 between the last two names', () => {
    expect(parseCompetitors('雅培、雀巢和汤臣倍健')).toEqual([
      '雅培',
      '雀巢',
      '汤臣倍健',
    ]);
  });
  it('splits by 顿号', () => {
    expect(parseCompetitors('竞品甲、竞品乙、竞品丙')).toEqual([
      '竞品甲',
      '竞品乙',
      '竞品丙',
    ]);
  });
  it('splits by 中文逗号 and 英文逗号', () => {
    expect(parseCompetitors('竞品甲，竞品乙,竞品丙')).toEqual([
      '竞品甲',
      '竞品乙',
      '竞品丙',
    ]);
  });
  it('splits by whitespace', () => {
    expect(parseCompetitors('竞品甲 竞品乙')).toEqual(['竞品甲', '竞品乙']);
  });
  it('returns empty array for empty input', () => {
    expect(parseCompetitors('')).toEqual([]);
  });
  it('trims and drops empty segments', () => {
    expect(parseCompetitors('竞品甲， ，竞品乙')).toEqual([
      '竞品甲',
      '竞品乙',
    ]);
  });
});

describe('studioReducer — SUBMIT_COMPETITORS', () => {
  it('splits competitors, adds them to focus tags, and moves to guided', () => {
    const state = createInitialStudioState({ products: [] });
    const after = studioReducer(state, {
      type: 'SUBMIT_PRODUCT_INTRO',
      raw: '全安素，一款给中老年的营养粉',
    });
    const next = studioReducer(after, {
      type: 'SUBMIT_COMPETITORS',
      raw: '竞品甲、竞品乙',
    });
    expect(next.products[0].competitors).toEqual(['竞品甲', '竞品乙']);
    expect(next.focusTags.some((t) => t.text === '竞品甲')).toBe(true);
    expect(next.focusTags.some((t) => t.text === '竞品乙')).toBe(true);
    expect(next.onboardStage).toBe('guided');
  });
});

describe('studioReducer — SKIP_COMPETITORS', () => {
  it('skips straight to guided when asking for competitors', () => {
    const state = createInitialStudioState({ products: [] });
    const after = studioReducer(state, {
      type: 'SUBMIT_PRODUCT_INTRO',
      raw: '全安素',
    });
    const next = studioReducer(after, { type: 'SKIP_COMPETITORS' });
    expect(next.onboardStage).toBe('guided');
  });
  it('is a no-op when not asking for competitors', () => {
    const state = createInitialStudioState();
    const next = studioReducer(state, { type: 'SKIP_COMPETITORS' });
    expect(next).toBe(state);
  });
});

describe('studioReducer — RESET_TO_EMPTY', () => {
  it('clears all products and re-enters asking-intro', () => {
    const state = createInitialStudioState();
    const next = studioReducer(state, { type: 'RESET_TO_EMPTY' });
    expect(next.products).toHaveLength(0);
    expect(next.isAsking).toBe(true);
    expect(next.onboardStage).toBe('asking-intro');
    expect(next.onboardChat).toHaveLength(1);
  });
});

describe('chat history by day', () => {
  it('groups messages under their date markers', () => {
    const groups = groupChatByDay([
      { id: 'a', kind: 'date', date: '10-24' },
      { id: 'b', kind: 'ai', text: '一' },
      { id: 'c', kind: 'date', date: '10-31' },
      { id: 'd', kind: 'user', text: '二' },
      { id: 'e', kind: 'ai', text: '三' },
    ]);
    expect(groups.map((g) => g.date)).toEqual(['10-24', '10-31']);
    expect(groups[1].messages.map((m) => m.id)).toEqual(['d', 'e']);
  });

  it('keeps the latest two days and folds the rest', () => {
    const state = createInitialStudioState();
    const groups = groupChatByDay(state.chatByMode.diag);
    const { folded, recent } = splitFoldedHistory(groups);
    expect(folded.map((g) => g.date)).toEqual(['10-24', '10-27']);
    expect(recent.map((g) => g.date)).toEqual(['10-30', '10-31']);
  });

  it('folds nothing when there are only two days', () => {
    const { folded } = splitFoldedHistory(
      groupChatByDay([
        { id: 'a', kind: 'date', date: '10-30' },
        { id: 'b', kind: 'date', date: '10-31' },
      ]),
    );
    expect(folded).toHaveLength(0);
  });

  it('toggles the folded history per mode', () => {
    const state = createInitialStudioState();
    const next = studioReducer(state, { type: 'TOGGLE_HISTORY', mode: 'diag' });
    expect(next.historyExpanded).toEqual({ data: false, run: false, diag: true });
  });
});

describe('assistant memory', () => {
  it('recognises standing instructions', () => {
    expect(isRememberIntent('以后稿子里别提价格')).toBe(true);
    expect(isRememberIntent('别再拿竞品丙做对比')).toBe(true);
    expect(isRememberIntent('豆包这周有变化吗？')).toBe(false);
  });

  it('asks before remembering instead of saving silently', () => {
    const state = createInitialStudioState();
    const before = currentMemories(state).length;
    const next = studioReducer(state, {
      type: 'APPEND_USER_MESSAGE',
      mode: 'diag',
      text: '以后稿子里别提价格',
    });
    const last = next.chatByMode.diag[next.chatByMode.diag.length - 1];
    expect(last.options?.[0].remember).toBe('以后稿子里别提价格');
    expect(last.hideNone).toBe(true);
    expect(currentMemories(next)).toHaveLength(before);
  });

  it('adds no proposal for an ordinary question', () => {
    const state = createInitialStudioState();
    const next = studioReducer(state, {
      type: 'APPEND_USER_MESSAGE',
      mode: 'diag',
      text: '豆包这周有变化吗？',
    });
    expect(next.chatByMode.diag).toHaveLength(state.chatByMode.diag.length + 1);
  });

  it('remembers on yes and closes the proposal', () => {
    const state = createInitialStudioState();
    const asked = studioReducer(state, {
      type: 'APPEND_USER_MESSAGE',
      mode: 'diag',
      text: '以后稿子里别提价格',
    });
    const proposal = asked.chatByMode.diag[asked.chatByMode.diag.length - 1];
    const next = studioReducer(asked, {
      type: 'REMEMBER',
      mode: 'diag',
      messageId: proposal.id,
      text: '以后稿子里别提价格',
    });
    const memories = currentMemories(next);
    expect(memories[0].text).toBe('以后稿子里别提价格');
    expect(memories[0].source).toEqual({ mode: 'diag', date: '10-31' });
    expect(next.chatByMode.diag.find((m) => m.id === proposal.id)?.options).toBeUndefined();
  });

  it('does not duplicate a memory picked twice', () => {
    const state = createInitialStudioState();
    const action = {
      type: 'REMEMBER' as const,
      mode: 'diag' as const,
      messageId: 'x',
      text: '以后稿子里别提价格',
    };
    const once = studioReducer(state, action);
    const twice = studioReducer(once, action);
    expect(currentMemories(twice)).toHaveLength(currentMemories(once).length);
  });

  it('keeps the list unchanged on no', () => {
    const state = createInitialStudioState();
    const next = studioReducer(state, {
      type: 'FORGET',
      mode: 'diag',
      messageId: 'x',
    });
    expect(currentMemories(next)).toEqual(currentMemories(state));
  });

  it('adds and removes items by hand', () => {
    const state = createInitialStudioState();
    const added = studioReducer(state, { type: 'ADD_MEMORY', text: ' 稿子里不提价格 ' });
    expect(currentMemories(added)[0]).toMatchObject({
      text: '稿子里不提价格',
      source: 'manual',
    });
    const removed = studioReducer(added, {
      type: 'REMOVE_MEMORY',
      id: currentMemories(added)[0].id,
    });
    expect(currentMemories(removed)).toEqual(currentMemories(state));
  });

  it('keeps each product its own list', () => {
    const state = createInitialStudioState();
    const switched = studioReducer(state, {
      type: 'SWITCH_PRODUCT',
      productId: state.products[1].id,
    });
    expect(currentMemories(state).length).toBeGreaterThan(0);
    expect(currentMemories(switched)).toHaveLength(0);
  });

  it('clears all memories on the first-open demo', () => {
    const state = createInitialStudioState();
    const next = studioReducer(state, { type: 'RESET_TO_EMPTY' });
    expect(next.memoriesByProduct).toEqual({});
  });
});

describe('assistant memory — ids', () => {
  it('deleting a new item leaves the sample items alone', () => {
    const state = createInitialStudioState();
    const before = currentMemories(state).length;
    let next = state;
    for (let i = 0; i < 6; i += 1) {
      next = studioReducer(next, { type: 'ADD_MEMORY', text: `规则${i}` });
    }
    const ids = currentMemories(next).map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const removed = studioReducer(next, { type: 'REMOVE_MEMORY', id: ids[0] });
    expect(currentMemories(removed)).toHaveLength(before + 5);
  });
});
