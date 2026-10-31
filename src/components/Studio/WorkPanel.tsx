// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
import { Badge } from '@/components/ui/badge';
import { DsText } from '@/components/ui/ds-text';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from 'react-i18next';

import { CapturePanel } from './CapturePanel';
import { CitationsPanel } from './CitationsPanel';
import { CleanPanel } from './CleanPanel';
import { DraftsPanel } from './DraftsPanel';
import { FeedPanel } from './FeedPanel';
import { GapsPanel } from './GapsPanel';
import { KnowledgePanel } from './KnowledgePanel';
import { MetricsPanel } from './MetricsPanel';
import { ProbesPanel } from './ProbesPanel';
import { PublishPanel } from './PublishPanel';
import {
  hasData,
  isAskingState,
  STUDIO_TABS,
  type StudioAction,
  type StudioMode,
  type StudioState,
} from './studioState';

const TAB_KEY: Record<string, string> = {
  清洗: 'cleaning',
  知识库: 'knowledge',
  探针: 'probes',
  稿子: 'drafts',
  采集进度: 'capture',
  发布记录: 'publish',
  动态: 'feed',
  指标: 'metrics',
  缺口: 'gaps',
  引用来源: 'citations',
};

function renderTab(
  tab: string,
  state: StudioState,
  dispatch: React.Dispatch<StudioAction>,
) {
  switch (tab) {
    case '清洗':
      return <CleanPanel />;
    case '知识库':
      return <KnowledgePanel />;
    case '探针':
      return <ProbesPanel />;
    case '稿子':
      return <DraftsPanel />;
    case '采集进度':
      return <CapturePanel />;
    case '发布记录':
      return <PublishPanel />;
    case '动态':
      return <FeedPanel state={state} dispatch={dispatch} />;
    case '指标':
      return <MetricsPanel />;
    case '缺口':
      return <GapsPanel />;
    case '引用来源':
      return <CitationsPanel />;
    default:
      return null;
  }
}

function AskingEmpty() {
  const { t } = useTranslation();
  const title = t('geo.studio-empty-asking-title', {
    defaultValue: '正在建档',
  });
  const desc = t('geo.studio-empty-asking-desc', {
    defaultValue: '建好档案后，这里会为这个产品收集品牌新闻、竞品动态、行业政策和 AI 平台变化。',
  });
  const chips = [
    { key: 'studio-feed-type-brand', default: '品牌新闻' },
    { key: 'studio-feed-type-competitor', default: '竞品动态' },
    { key: 'studio-feed-type-policy', default: '行业政策' },
    { key: 'studio-feed-type-ai', default: 'AI 平台变化' },
  ];
  return (
    <div className="flex flex-col gap-ds-12 px-ds-16 py-ds-24 text-center">
      <DsText as="h2" role="body-large" weight="semibold">
        {title}
      </DsText>
      <DsText as="p" role="base" className="text-ds-ink-muted-default">
        {desc}
      </DsText>
      <div className="flex flex-wrap justify-center gap-ds-6">
        {chips.map((chip) => (
          <Badge key={chip.key} variant="secondary" tone="information" size="sm">
            {t(`geo.${chip.key}`, { defaultValue: chip.default })}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function EmptyTab({ modeKey }: { modeKey: StudioMode }) {
  const { t } = useTranslation();
  const titleKey = `studio-empty-${modeKey}-title`;
  const descKey = `studio-empty-${modeKey}-desc`;
  return (
    <div className="flex flex-col gap-ds-8 px-ds-16 py-ds-24 text-center">
      <DsText as="h2" role="body-large" weight="semibold">
        {t(`geo.${titleKey}`, { defaultValue: '还没有数据' })}
      </DsText>
      <DsText as="p" role="base" className="text-ds-ink-muted-default">
        {t(`geo.${descKey}`, {
          defaultValue: '完成第一轮采集后，这里会显示诊断结果。',
        })}
      </DsText>
    </div>
  );
}

export function WorkPanel({
  state,
  dispatch,
}: {
  state: StudioState;
  dispatch: React.Dispatch<StudioAction>;
}) {
  const { t } = useTranslation();
  const asking = isAskingState(state);
  const dataReady = hasData(state);
  const mode = state.mode;
  const currentTab = state.tab[mode];

  if (asking) {
    return (
      <aside className="flex min-h-0 w-[400px] shrink-0 flex-col overflow-y-auto border-r-0 border-y-0 border-l border-solid border-ds-hairline-subtle-default">
        <AskingEmpty />
      </aside>
    );
  }

  const tabs = STUDIO_TABS[mode];

  return (
    <aside className="flex min-h-0 w-[400px] shrink-0 flex-col overflow-hidden border-r-0 border-y-0 border-l border-solid border-ds-hairline-subtle-default">
      <Tabs
        value={currentTab}
        onValueChange={(v) =>
          dispatch({ type: 'SET_TAB', mode, tab: v })
        }
        className="flex flex-1 flex-col"
      >
        <TabsList appearance="ghost" className="flex shrink-0 gap-ds-4 overflow-x-auto whitespace-nowrap px-ds-12 py-ds-10">
          {tabs.map((tab) => {
            const label = t(`geo.studio-tab-${TAB_KEY[tab] ?? ''}`, {
              defaultValue: tab,
            });
            const showUnread =
              tab === '动态' && state.unreadFeed > 0;
            return (
              <TabsTrigger key={tab} value={tab} className="relative w-auto shrink-0 whitespace-nowrap">
                {label}
                {showUnread ? (
                  <Badge
                    variant="destructive"
                    size="xs"
                    className="ml-ds-4"
                  >
                    {state.unreadFeed}
                  </Badge>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {tabs.map((tab) => {
          const empty =
            !dataReady && !(mode === 'diag' && tab === '动态');
          return (
            <TabsContent key={tab} value={tab} className="flex-1 overflow-y-auto">
              {empty ? <EmptyTab modeKey={mode} /> : renderTab(tab, state, dispatch)}
            </TabsContent>
          );
        })}
      </Tabs>
    </aside>
  );
}
