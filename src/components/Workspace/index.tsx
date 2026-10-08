// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========

import BottomBox, { type FileAttachment } from '@/components/ChatBox/BottomBox';
import { useWorkbenchChatDraft } from '@/components/Workbench/useWorkbenchChatDraft';
import { useModelConfigCheck } from '@/hooks/useModelConfigCheck';
import { useUsageIncidentBanner } from '@/hooks/useUsageIncidentBanner';
import { useHost } from '@/host';
import { APP_NAME } from '@/lib/appName';
import { notifyError } from '@/lib/notifyError';
import { isLegacySpace, isLocalWorkspaceSpace } from '@/lib/spaceLabel';
import { createSyncedProjectInSpace } from '@/lib/spaceProject';
import { getAuthStore, useAuthStore } from '@/store/authStore';
import { usePageTabStore } from '@/store/pageTabStore';
import { useProjectRuntimeStore } from '@/store/projectRuntimeStore';
import { openSettings } from '@/store/settingsStore';
import { useSpaceStore } from '@/store/spaceStore';
import { SessionMode, type SessionModeType } from '@/types/constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

const WORKSPACE_COWORK_TEXT_CLASS =
  'inline-flex shrink-0 items-center font-display text-ds-text-display font-semibold text-ds-ink-default-default';

interface WorkspaceProps {
  /**
   * `'workspace'` (default): Cowork composer on the Workspace tab.
   * `'new-project'`: same composer inside the Session new-project shell.
   */
  variant?: 'workspace' | 'new-project';
  /** When true, fill the Session content column instead of the page shell. */
  embedded?: boolean;
  /** Controlled session mode when embedded in the new-project Session shell. */
  sessionMode?: SessionModeType;
  onSessionModeChange?: (mode: SessionModeType) => void;
}

/**
 * Workspace tab: project landing with a centered task input.
 * After the user starts a task, it switches to the Project chat tab.
 */
export default function Workspace({
  variant = 'workspace',
  embedded = false,
  sessionMode: controlledSessionMode,
  onSessionModeChange,
}: WorkspaceProps) {
  const { t } = useTranslation();
  const host = useHost();
  const activeSpaceId = useSpaceStore((s) => s.activeSpaceId);
  const activeSpace = useSpaceStore((s) =>
    s.activeSpaceId ? s.spaces[s.activeSpaceId] : null
  );
  // Legacy Spaces are read-only — new Projects can't be started inside them.
  const isLegacyActiveSpace = activeSpace ? isLegacySpace(activeSpace) : false;
  const setActiveWorkspaceTab = usePageTabStore((s) => s.setActiveWorkspaceTab);
  const activeWorkspaceTab = usePageTabStore((s) => s.activeWorkspaceTab);
  const workspaceChatFocusRequestId = usePageTabStore(
    (s) => s.workspaceChatFocusRequestId
  );
  const { modelType } = useAuthStore();
  const [draftSessionMode, setDraftSessionMode] = useState<SessionModeType>(
    SessionMode.SINGLE_AGENT
  );
  const effectiveSessionMode = controlledSessionMode ?? draftSessionMode;

  const setActiveProjectMode = useCallback(
    (mode: SessionModeType) => {
      if (onSessionModeChange) {
        onSessionModeChange(mode);
        return;
      }
      setDraftSessionMode(mode);
    },
    [onSessionModeChange]
  );

  const [message, setMessage] = useState('');
  const [draftFiles, setDraftFiles] = useState<FileAttachment[]>([]);
  useWorkbenchChatDraft(setMessage);
  const directProjectStartRef = useRef(false);
  const mountedRef = useRef(false);
  const [isStartingDirectProject, setIsStartingDirectProject] = useState(false);
  const { hasModel, cloudUsageLimitReached } = useModelConfigCheck();
  const isCloudUsageLimited = modelType === 'cloud' && cloudUsageLimitReached;
  const usageLimitBanner = useUsageIncidentBanner(modelType);
  const [useCloudModelInDev, setUseCloudModelInDev] = useState(false);

  const textareaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (workspaceChatFocusRequestId === 0) return;
    if (
      activeWorkspaceTab !== 'workforce' &&
      activeWorkspaceTab !== 'new-project'
    )
      return;
    const focusTimer = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 180);
    return () => window.clearTimeout(focusTimer);
  }, [workspaceChatFocusRequestId, activeWorkspaceTab]);

  useEffect(() => {
    if (
      import.meta.env.VITE_USE_LOCAL_PROXY === 'true' &&
      modelType === 'cloud'
    ) {
      setUseCloudModelInDev(true);
    } else {
      setUseCloudModelInDev(false);
    }
  }, [modelType]);

  const handleSend = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      return;
    }

    // A known account limit should not create another empty Session.
    if (isCloudUsageLimited) return;

    if (!hasModel) {
      toast.error(t('layout.please-select-model-first'));
      openSettings('models');
      return;
    }

    if (directProjectStartRef.current) {
      return;
    }
    directProjectStartRef.current = true;
    setIsStartingDirectProject(true);
    const startingAuth = getAuthStore();
    const startingAccount =
      startingAuth.token && startingAuth.user_id != null
        ? String(startingAuth.user_id)
        : null;

    try {
      if (!activeSpaceId) {
        toast.error(t('layout.spaces-create-failed'));
        return;
      }

      if (isLegacyActiveSpace) {
        toast.error(
          t('layout.spaces-legacy-readonly-hint', {
            defaultValue:
              'Legacy Spaces are read-only. Create a new Space to start a session.',
          })
        );
        return;
      }

      const projectStore = useProjectRuntimeStore.getState();
      const composerThinkingEffort = projectStore.getComposerThinkingEffort();
      const syncedProject = await createSyncedProjectInSpace({
        projectStore,
        spaceId: activeSpaceId,
        name: trimmedMessage.slice(0, 120),
        mode: effectiveSessionMode,
        workdirMode: isLocalWorkspaceSpace(activeSpace)
          ? 'direct-write'
          : 'artifact-only',
        metadata: {
          createdFrom: 'workspace_direct_chat',
          ...(composerThinkingEffort !== undefined
            ? { thinkingEffort: composerThinkingEffort }
            : {}),
        },
      });
      useSpaceStore.getState().setActiveSpace(syncedProject.spaceId);
      const targetProjectId = syncedProject.projectId;
      const targetChatStore =
        useProjectRuntimeStore
          .getState()
          .getActiveChatStore(targetProjectId)
          ?.getState() ?? null;

      if (!targetProjectId || !targetChatStore?.activeTaskId) {
        throw new Error('No active Project chat available');
      }

      const taskId = targetChatStore.activeTaskId;
      targetChatStore.setHasMessages(taskId, true);
      const attachesToSend = JSON.parse(JSON.stringify(draftFiles)) || [];
      targetChatStore.setAttaches(taskId, attachesToSend);

      // Keep the draft mounted until the server accepts startup. Key/usage and
      // admission failures must not navigate away from the user's composer.
      await targetChatStore.startTask(
        taskId,
        undefined,
        undefined,
        undefined,
        trimmedMessage,
        attachesToSend,
        undefined,
        targetProjectId,
        effectiveSessionMode,
        { awaitAdmission: true }
      );
      targetChatStore.setHasWaitComfirm(taskId, true);
      targetChatStore.setAttaches(taskId, []);
      // A newer New session command can clear selection without unmounting
      // this composer or changing its Space/tab. It owns the draft and view.
      if (
        mountedRef.current &&
        useProjectRuntimeStore.getState().activeProjectId === targetProjectId &&
        useSpaceStore.getState().activeSpaceId === activeSpaceId &&
        usePageTabStore.getState().activeWorkspaceTab === activeWorkspaceTab
      ) {
        setDraftFiles([]);
        setMessage('');
        setActiveWorkspaceTab('project');
      }
    } catch (err: unknown) {
      console.error('Failed to start task:', err);
      // Auth changes before useUsageNotices synchronizes its account. Never
      // re-report a departed account's rejection as the current user's limit.
      const currentAuth = getAuthStore();
      const currentAccount =
        currentAuth.token && currentAuth.user_id != null
          ? String(currentAuth.user_id)
          : null;
      if (currentAccount === startingAccount) {
        notifyError(
          err instanceof Error ? err.message : t('layout.failed-to-start-task')
        );
      }
    } finally {
      directProjectStartRef.current = false;
      setIsStartingDirectProject(false);
    }
  };

  const handleFileSelect = useCallback(async () => {
    try {
      const result = await host?.electronAPI?.selectFile({
        title: t('chat.select-file'),
        filters: [{ name: t('chat.all-files'), extensions: ['*'] }],
      });

      if (result?.success && result.files && result.files.length > 0) {
        setDraftFiles((existingFiles) => [
          ...existingFiles,
          ...result.files.filter(
            (r: File) => !existingFiles.some((f) => f.filePath === r.filePath)
          ),
        ]);
      }
    } catch (error) {
      console.error('Select File Error:', error);
    }
  }, [host, t]);

  const composerInputProps = {
    value: message,
    onChange: setMessage,
    onSend: handleSend,
    files: draftFiles,
    onFilesChange: setDraftFiles,
    onAddFile: handleFileSelect,
    disabled:
      !hasModel ||
      isCloudUsageLimited ||
      isStartingDirectProject ||
      isLegacyActiveSpace,
    textareaRef,
    allowDragDrop: true,
    useCloudModelInDev,
    placeholder: isLegacyActiveSpace
      ? t('layout.spaces-legacy-readonly-hint', {
          defaultValue:
            'Legacy Spaces are read-only. Create a new Space to start a session.',
        })
      : t('layout.project-task-placeholder'),
  };

  // One headline that wraps in a narrow chat column instead of clipping.
  const workspaceComposerTop = (
    <h1
      data-workspace-cowork-row
      className="m-0 mb-3 flex min-h-[46px] w-full min-w-0 flex-wrap items-center gap-x-3"
    >
      <span className={WORKSPACE_COWORK_TEXT_CLASS}>
        {t('layout.cowork-with', { defaultValue: 'Cowork with' })}
      </span>
      <span className={WORKSPACE_COWORK_TEXT_CLASS}>{APP_NAME}</span>
    </h1>
  );

  const composerInput = (
    <>
      <div data-workspace-bottom-box className="w-full">
        <BottomBox
          state="input"
          queuedMessages={[]}
          onRemoveQueuedMessage={() => {}}
          noModelOverlay={!hasModel && !isCloudUsageLimited}
          usageLimitBanner={usageLimitBanner}
          onSelectModel={() => openSettings('models')}
          inputProps={composerInputProps}
          sessionMode={effectiveSessionMode}
          onSessionModeChange={setActiveProjectMode}
          sessionModeSelectInteractive
          modelSelectDisabled={isStartingDirectProject || isLegacyActiveSpace}
        />
      </div>
    </>
  );

  return (
    <div
      data-workspace-variant={variant}
      className={
        embedded
          ? 'relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
          : 'relative z-[1] flex h-full min-h-0 w-full min-w-0 flex-row overflow-hidden'
      }
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <section
          aria-label={t('layout.workspace-header', {
            defaultValue: 'Workspace header',
          })}
          className="flex min-h-0 w-full flex-1 items-center gap-0"
        >
          <div
            data-workspace-input-section
            className="flex min-w-0 flex-1 items-center justify-center p-4"
          >
            <div className="flex w-full max-w-[600px] min-w-0 flex-col pb-[58px]">
              {workspaceComposerTop}
              {composerInput}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
