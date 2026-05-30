/**
 * Module-level chat store — survives React component unmounts so AI streaming
 * continues in the background when the user navigates away from a workspace.
 *
 * Items are typed as `unknown[]` to avoid circular imports; ChatPanel casts
 * them back to its local ListItem type when reading.
 */

interface ProjectChatState {
  items: unknown[];
  isStreaming: boolean;
  abortController: AbortController | null;
}

interface GlobalSnapshot {
  anyStreaming: boolean;
  count: number;
  firstProjectId: string | null;
}

const stateMap = new Map<string, ProjectChatState>();
const projectListeners = new Map<string, Set<() => void>>();
const globalListeners = new Set<() => void>();

let globalSnapshot: GlobalSnapshot = { anyStreaming: false, count: 0, firstProjectId: null };

function getState(projectId: string): ProjectChatState {
  if (!stateMap.has(projectId)) {
    stateMap.set(projectId, { items: [], isStreaming: false, abortController: null });
  }
  return stateMap.get(projectId)!;
}

function notifyProject(projectId: string) {
  projectListeners.get(projectId)?.forEach((fn) => fn());
}

function refreshGlobalSnapshot() {
  const ids: string[] = [];
  for (const [id, state] of stateMap) {
    if (state.isStreaming) ids.push(id);
  }
  globalSnapshot = {
    anyStreaming: ids.length > 0,
    count: ids.length,
    firstProjectId: ids[0] ?? null,
  };
}

function notifyGlobal() {
  refreshGlobalSnapshot();
  globalListeners.forEach((fn) => fn());
}

export const chatStore = {
  /** Subscribe to state changes for a specific project. */
  subscribe(projectId: string, fn: () => void): () => void {
    if (!projectListeners.has(projectId)) {
      projectListeners.set(projectId, new Set());
    }
    projectListeners.get(projectId)!.add(fn);
    return () => projectListeners.get(projectId)?.delete(fn);
  },

  /** Subscribe to global streaming state (for Navbar indicator). */
  subscribeGlobal(fn: () => void): () => void {
    globalListeners.add(fn);
    return () => { globalListeners.delete(fn); };
  },

  /** Snapshot for a specific project — stable reference while unchanged. */
  getSnapshot(projectId: string): ProjectChatState {
    return getState(projectId);
  },

  /** Snapshot for global streaming state — stable reference while unchanged. */
  getGlobalSnapshot(): GlobalSnapshot {
    return globalSnapshot;
  },

  /** True if the store already has messages for this project. */
  hasItems(projectId: string): boolean {
    return (stateMap.get(projectId)?.items?.length ?? 0) > 0;
  },

  /** Update items. Accepts a value or functional updater — works after unmount. */
  setItems(
    projectId: string,
    updater: unknown[] | ((prev: unknown[]) => unknown[]),
  ): void {
    const state = getState(projectId);
    const newItems =
      typeof updater === "function" ? updater(state.items) : updater;
    stateMap.set(projectId, { ...state, items: newItems });
    notifyProject(projectId);
  },

  /** Update streaming flag — works after unmount. */
  setStreaming(projectId: string, streaming: boolean): void {
    const state = getState(projectId);
    stateMap.set(projectId, { ...state, isStreaming: streaming });
    notifyProject(projectId);
    notifyGlobal();
  },

  /** Store the active AbortController so it can be accessed after remount. */
  setAbortController(projectId: string, ctrl: AbortController | null): void {
    const state = getState(projectId);
    stateMap.set(projectId, { ...state, abortController: ctrl });
  },

  getAbortController(projectId: string): AbortController | null {
    return stateMap.get(projectId)?.abortController ?? null;
  },
};
