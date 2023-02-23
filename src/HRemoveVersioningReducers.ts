/**
 * Reducers for data that represents the local and server timeline history
 * for a specific Timeline board.
 */
import {
  cloneHDocHistory,
  HDocHistory,
  HistoryDelta,
  HistoryRecord,
  initHDocHistory
} from './HVersioning';
import {Id, INormalizedDocument} from './HTypes';

export enum ApiRequestStatus {
  IDLE = 'idle',
  SUBMITTED = 'submitted',
  SUCCESS = 'success',
  ERROR = 'error'
}

export enum SynchedHistoryActionType {
  // Calls related to refreshing and initializing the local history
  START_LOCAL_HISTORY_RESTORE = 'START_LOCAL_HISTORY_RESTORE',
  FAIL_LOCAL_HISTORY_RESTORE = 'FAIL_LOCAL_HISTORY_RESTORE',
  RESTORE_LOCAL_HISTORY = 'RESTORE_LOCAL_HISTORY',
  NO_LOCAL_HISTORY_FOUND = 'NO_LOCAL_HISTORY_FOUND',
  START_LOCAL_HISTORY_SAVE = 'START_LOCAL_HISTORY_SAVE',
  ERROR_LOCAL_HISTORY_SAVE = 'ERROR_LOCAL_HISTORY_SAVE',
  DONE_LOCAL_HISTORY_SAVE = 'DONE_LOCAL_HISTORY_SAVE',

  // Calls related to refreshing and initializing the origin history
  START_CLONE_ORIGIN = 'START_CLONE_ORIGIN',
  ERROR_CLONE_ORIGIN = 'ERROR_CLONE_ORIGIN',
  SET_CLONE_ORIGIN_HISTORY = 'SET_CLONE_ORIGIN_HISTORY',

  // Calls related to pulling origin data from the server
  START_ORIGIN_PULL = 'START_ORIGIN_PULL',
  ERROR_ORIGIN_PULL = 'ERROR_ORIGIN_PULL',
  MERGE_PULL_ORIGIN_DATA = 'MERGE_PULL_ORIGIN_DATA',

  // Call related to pushing changes from the local branch to remote origin
  START_PUSH_TO_REMOTE = 'START_PUSH_TO_REMOTE',
  ERROR_PUSH_TO_REMOTE = 'ERROR_PUSH_TO_REMOTE',
  MERGE_PUSHED_TO_REMOTE = 'MERGE_PUSHED_TO_REMOTE',

  // Calls to change the local timeline
  APPLY_LOCAL_COMMAND = 'APPLY_LOCAL_COMMAND',
  UNDO_COMMAND = 'UNDO_COMMAND',
  REDO_COMMAND = 'REDO_COMMAND',

  RESET_TO_INITIALIZATION = 'RESET_TO_INITIALIZATION'
}

interface BaseSynchedClientAction {
  type: SynchedHistoryActionType;
}

interface CloneOriginHistoryAction<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> extends BaseSynchedClientAction {
  type: SynchedHistoryActionType.SET_CLONE_ORIGIN_HISTORY;
  history: HDocHistory<MapsInterface, U, Checkpoint>;
  when: Date;
}

interface RestoreLocalHistoryAction<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> extends BaseSynchedClientAction {
  type: SynchedHistoryActionType.RESTORE_LOCAL_HISTORY;
  originCommitId: string;
  historyEntries: HistoryRecord<MapsInterface, U, Checkpoint>[];
}

interface ResetToInitialLoadAction<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> extends BaseSynchedClientAction {
  type: SynchedHistoryActionType.RESET_TO_INITIALIZATION;
  emptyHistory: HDocHistory<MapsInterface, U, Checkpoint>;
}

interface MergePullFromRemoteAction<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> extends BaseSynchedClientAction {
  type: SynchedHistoryActionType.MERGE_PULL_ORIGIN_DATA;
  delta: HistoryDelta<MapsInterface, U, Checkpoint> | null;
  userId?: Id;
  when: Date;
}

interface StartLocalHistorySaveToStorageAction {
  type: SynchedHistoryActionType.START_LOCAL_HISTORY_SAVE;
}

interface ErrorLocalHistorySaveToStorageAction {
  type: SynchedHistoryActionType.ERROR_LOCAL_HISTORY_SAVE;
}

interface CompletedLocalHistorySaveToStorageAction {
  type: SynchedHistoryActionType.DONE_LOCAL_HISTORY_SAVE;
  lastLocalCommitId: string | null;
}

export interface ApplyLocalCommandAction<Operation>
  extends BaseSynchedClientAction {
  type: SynchedHistoryActionType.APPLY_LOCAL_COMMAND;
  action: Operation;
  userId: Id;
  when: Date;
}

export interface UndoCommand extends BaseSynchedClientAction {
  type: SynchedHistoryActionType.UNDO_COMMAND;
  userId: Id;
  when: Date;
}

export interface RedoCommand extends BaseSynchedClientAction {
  type: SynchedHistoryActionType.REDO_COMMAND;
  userId: Id;
  when: Date;
}

interface RequestLocalHistoryRestoreAction extends BaseSynchedClientAction {
  type: SynchedHistoryActionType.START_LOCAL_HISTORY_RESTORE;
}

interface FailLocalHistoryRestoreAction extends BaseSynchedClientAction {
  type: SynchedHistoryActionType.FAIL_LOCAL_HISTORY_RESTORE;
}

interface BaseLocalBranchState<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> {
  localHistory: HDocHistory<MapsInterface, U, Checkpoint>;
  currentDocument: INormalizedDocument<MapsInterface, U>;
}

interface UninitializedLocalBranchState<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint,
  Operation
> extends BaseLocalBranchState<MapsInterface, U, Checkpoint> {
  type: 'UninitializedLocalBranchState';
  restoreFetchStatus: ApiRequestStatus;
  pendingInitialLoadActions: ApplyLocalCommandAction<Operation>[];
}

interface InitializedLocalBranchState<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> extends BaseLocalBranchState<MapsInterface, U, Checkpoint> {
  type: 'InitializedLocalBranchState';
  lastOriginCommitId: string;
  saveRequestStatus: ApiRequestStatus;
  lastSavedCommitId: string | null;
}

interface NoLocalCopyLocalBranchState<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint,
  Operation = any
> extends BaseLocalBranchState<MapsInterface, U, Checkpoint> {
  type: 'NoLocalCopyLocalBranchState';
  pendingInitialLoadActions: ApplyLocalCommandAction<Operation>[];
}

export type LocalBranchState<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint,
  Operation = any
> =
  | UninitializedLocalBranchState<MapsInterface, U, Checkpoint, Operation>
  | InitializedLocalBranchState<MapsInterface, U, Checkpoint>
  | NoLocalCopyLocalBranchState<MapsInterface, U, Checkpoint, Operation>;

interface NoLocalHistoryFoundAction extends BaseSynchedClientAction {
  type: SynchedHistoryActionType.NO_LOCAL_HISTORY_FOUND;
}

type LocalBranchAction<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> =
  | RequestLocalHistoryRestoreAction
  | RestoreLocalHistoryAction<MapsInterface, U, Checkpoint>
  | FailLocalHistoryRestoreAction
  | NoLocalHistoryFoundAction
  | ApplyLocalCommandAction<any>
  | UndoCommand
  | RedoCommand
  | StartLocalHistorySaveToStorageAction
  | ErrorLocalHistorySaveToStorageAction
  | CompletedLocalHistorySaveToStorageAction;

export const initialLocalBranchState = <
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint,
  Operation
>(
  emptyHistory: HDocHistory<MapsInterface, U, Checkpoint>
): LocalBranchState<MapsInterface, U, Checkpoint, Operation> => ({
  type: 'UninitializedLocalBranchState',
  restoreFetchStatus: ApiRequestStatus.IDLE,
  localHistory: emptyHistory,
  currentDocument: emptyHistory.documentAtCommitId(),
  pendingInitialLoadActions: []
});

const localBranchReducer = <
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint,
  Operation
>(
  state: LocalBranchState<MapsInterface, U, Checkpoint, Operation>,
  action: LocalBranchAction<MapsInterface, U, Checkpoint>
): LocalBranchState<MapsInterface, U, Checkpoint, Operation> => {
  const oldState = state;
  if (action.type === SynchedHistoryActionType.APPLY_LOCAL_COMMAND) {
    if (oldState.type === 'InitializedLocalBranchState') {
      const {userId, action: documentAction} = action;
      const originalLastCommitId = oldState.localHistory.lastCommitId;
      const updatedLocalHistory = cloneHDocHistory(oldState.localHistory);
      updatedLocalHistory.commit(documentAction, userId);
      return originalLastCommitId === updatedLocalHistory.lastCommitId
        ? oldState
        : {
            ...oldState,
            localHistory: updatedLocalHistory,
            currentDocument: updatedLocalHistory.documentAtCommitId()
          };
    }
  } else if (action.type === SynchedHistoryActionType.UNDO_COMMAND) {
    if (oldState.type === 'InitializedLocalBranchState') {
      const updatedLocalHistory = cloneHDocHistory(oldState.localHistory);
      const {userId} = action;
      const beforeUndoCommitId = oldState.localHistory.lastCommitId;
      updatedLocalHistory.undo(userId);
      return beforeUndoCommitId === updatedLocalHistory.lastCommitId
        ? oldState
        : {
            ...oldState,
            localHistory: updatedLocalHistory,
            currentDocument: updatedLocalHistory.documentAtCommitId()
          };
    }
  } else if (action.type === SynchedHistoryActionType.REDO_COMMAND) {
    const updatedLocalHistory = cloneHDocHistory(oldState.localHistory);
    const {userId} = action;
    const beforeRedoCommitId = oldState.localHistory.lastCommitId;
    updatedLocalHistory.redo(userId);
    return updatedLocalHistory.lastCommitId === beforeRedoCommitId
      ? oldState
      : {
          ...oldState,
          localHistory: updatedLocalHistory,
          currentDocument: updatedLocalHistory.documentAtCommitId()
        };
  } else if (action.type === SynchedHistoryActionType.RESTORE_LOCAL_HISTORY) {
    if (
      oldState.type === 'UninitializedLocalBranchState' ||
      oldState.type === 'NoLocalCopyLocalBranchState'
    ) {
      const localBranch = initHDocHistory(
        action.historyEntries,
        oldState.localHistory.hDocHistoryOptions
      );
      if (localBranch.historyEntries.length > 0) {
        for (const pendingAction of oldState.pendingInitialLoadActions) {
          try {
            localBranch.commit(pendingAction.action, pendingAction.userId);
          } catch (e) {
            console.log('Unable to apply a pending action', e);
          }
        }
        return {
          type: 'InitializedLocalBranchState',
          lastOriginCommitId: action.originCommitId,
          localHistory: localBranch,
          currentDocument: localBranch.documentAtCommitId(),
          lastSavedCommitId: null,
          saveRequestStatus: ApiRequestStatus.IDLE
        };
      } else {
        return oldState.type === 'NoLocalCopyLocalBranchState'
          ? oldState
          : {
              type: 'NoLocalCopyLocalBranchState',
              localHistory: oldState.localHistory,
              currentDocument: oldState.currentDocument,
              pendingInitialLoadActions: oldState.pendingInitialLoadActions
            };
      }
    }
  } else if (
    action.type === SynchedHistoryActionType.START_LOCAL_HISTORY_SAVE
  ) {
    if (oldState.type === 'InitializedLocalBranchState') {
      return {...oldState, saveRequestStatus: ApiRequestStatus.SUBMITTED};
    }
  } else if (action.type === SynchedHistoryActionType.DONE_LOCAL_HISTORY_SAVE) {
    if (oldState.type === 'InitializedLocalBranchState') {
      return {
        ...oldState,
        saveRequestStatus: ApiRequestStatus.SUCCESS,
        lastSavedCommitId: action.lastLocalCommitId
      };
    }
  } else if (
    action.type === SynchedHistoryActionType.ERROR_LOCAL_HISTORY_SAVE
  ) {
    if (oldState.type === 'InitializedLocalBranchState') {
      return {...oldState, saveRequestStatus: ApiRequestStatus.ERROR};
    }
  } else if (
    action.type === SynchedHistoryActionType.NO_LOCAL_HISTORY_FOUND ||
    action.type === SynchedHistoryActionType.FAIL_LOCAL_HISTORY_RESTORE
  ) {
    if (oldState.type === 'UninitializedLocalBranchState') {
      return {
        type: 'NoLocalCopyLocalBranchState',
        localHistory: oldState.localHistory,
        currentDocument: oldState.currentDocument,
        pendingInitialLoadActions: oldState.pendingInitialLoadActions
      };
    }
  } else if (
    action.type === SynchedHistoryActionType.START_LOCAL_HISTORY_RESTORE
  ) {
    if (
      oldState.type === 'UninitializedLocalBranchState' &&
      oldState.restoreFetchStatus !== ApiRequestStatus.SUBMITTED
    ) {
      return {
        ...oldState,
        restoreFetchStatus: ApiRequestStatus.SUBMITTED
      };
    }
  }
  return oldState;
};

interface OriginBranchState<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> {
  originHistory: HDocHistory<MapsInterface, U, Checkpoint>;
  cloneFetchStatus: ApiRequestStatus;
  pullFetchStatus: ApiRequestStatus;
  lastPullStartedOn: Date | null;
  pushFetchStatus: ApiRequestStatus;
  lastPushStartedOn: Date | null;
}

const initialOriginBranchState = <
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
>(
  emptyHistory: HDocHistory<MapsInterface, U, Checkpoint>
): OriginBranchState<MapsInterface, U, Checkpoint> => ({
  originHistory: emptyHistory,
  cloneFetchStatus: ApiRequestStatus.IDLE,
  pullFetchStatus: ApiRequestStatus.IDLE,
  pushFetchStatus: ApiRequestStatus.IDLE,
  lastPullStartedOn: null,
  lastPushStartedOn: null
});

interface StartCloneFromOriginAction {
  type: SynchedHistoryActionType.START_CLONE_ORIGIN;
}

interface ErrorCloneFromOriginAction {
  type: SynchedHistoryActionType.ERROR_CLONE_ORIGIN;
}

interface StartOriginPullAction extends BaseSynchedClientAction {
  type: SynchedHistoryActionType.START_ORIGIN_PULL;
  when: Date;
}

interface ErrorOriginPullAction extends BaseSynchedClientAction {
  type: SynchedHistoryActionType.ERROR_ORIGIN_PULL;
}

interface StartPushToRemoteAction {
  type: SynchedHistoryActionType.START_PUSH_TO_REMOTE;
  when: Date;
}

interface MergePushedToRemoteAction<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> {
  type: SynchedHistoryActionType.MERGE_PUSHED_TO_REMOTE;
  delta: HistoryDelta<MapsInterface, U, Checkpoint>;
  userId?: Id;
}

interface ErrorPushToRemoteAction {
  type: SynchedHistoryActionType.ERROR_PUSH_TO_REMOTE;
}

type OriginBranchAction<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> =
  | CloneOriginHistoryAction<MapsInterface, U, Checkpoint>
  | MergePullFromRemoteAction<MapsInterface, U, Checkpoint>
  | StartCloneFromOriginAction
  | ErrorCloneFromOriginAction
  | MergePushedToRemoteAction<MapsInterface, U, Checkpoint>
  | StartOriginPullAction
  | ErrorOriginPullAction
  | StartPushToRemoteAction
  | ErrorPushToRemoteAction;

export const originBranchReducer = <
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
>(
  state: OriginBranchState<MapsInterface, U, Checkpoint>,
  action: OriginBranchAction<MapsInterface, U, Checkpoint>
): OriginBranchState<MapsInterface, U, Checkpoint> => {
  const oldState = state;
  if (action.type === SynchedHistoryActionType.SET_CLONE_ORIGIN_HISTORY) {
    return {
      ...oldState,
      originHistory: action.history,
      cloneFetchStatus: ApiRequestStatus.SUCCESS
    };
  } else if (
    action.type === SynchedHistoryActionType.MERGE_PULL_ORIGIN_DATA ||
    action.type === SynchedHistoryActionType.MERGE_PUSHED_TO_REMOTE
  ) {
    const {delta} = action;
    let updatedOriginHistory = oldState.originHistory;

    // First sanity check on delta and checking we don't already have the delta last commitId in
    // our history
    if (delta && delta.historyRecords.length > 0) {
      const lastOperation =
        delta.historyRecords[delta.historyRecords.length - 1];
      if (!oldState.originHistory.hasCommitId(lastOperation.commitId)) {
        if (oldState.originHistory.hasCommitId(delta.fromCommitId)) {
          updatedOriginHistory = initHDocHistory(
            oldState.originHistory.historyEntries,
            oldState.originHistory.hDocHistoryOptions
          );
          updatedOriginHistory.mergeHistoryDelta(
            delta,
            lastOperation.userId || action.userId || 'NOTSET'
          );
        }
      }
    }
    return {
      ...oldState,
      originHistory: updatedOriginHistory,
      pullFetchStatus:
        action.type === SynchedHistoryActionType.MERGE_PULL_ORIGIN_DATA
          ? ApiRequestStatus.SUCCESS
          : oldState.pullFetchStatus,
      pushFetchStatus:
        action.type === SynchedHistoryActionType.MERGE_PUSHED_TO_REMOTE
          ? ApiRequestStatus.SUCCESS
          : oldState.pullFetchStatus
    };
  } else if (action.type === SynchedHistoryActionType.ERROR_CLONE_ORIGIN) {
    return oldState.cloneFetchStatus === ApiRequestStatus.ERROR
      ? oldState
      : {
          ...oldState,
          cloneFetchStatus: ApiRequestStatus.ERROR
        };
  } else if (action.type === SynchedHistoryActionType.START_CLONE_ORIGIN) {
    return {
      ...oldState,
      cloneFetchStatus: ApiRequestStatus.SUBMITTED
    };
  } else if (action.type === SynchedHistoryActionType.START_ORIGIN_PULL) {
    return {
      ...oldState,
      pullFetchStatus: ApiRequestStatus.SUBMITTED,
      lastPullStartedOn: action.when
    };
  } else if (action.type === SynchedHistoryActionType.ERROR_ORIGIN_PULL) {
    return oldState.pullFetchStatus === ApiRequestStatus.ERROR
      ? oldState
      : {...oldState, pullFetchStatus: ApiRequestStatus.ERROR};
  } else if (action.type === SynchedHistoryActionType.START_PUSH_TO_REMOTE) {
    return {
      ...oldState,
      lastPushStartedOn: action.when,
      pushFetchStatus: ApiRequestStatus.SUBMITTED
    };
  } else if (action.type === SynchedHistoryActionType.ERROR_PUSH_TO_REMOTE) {
    return {
      ...oldState,
      pushFetchStatus: ApiRequestStatus.ERROR
    };
  }
  return oldState;
};

export interface SynchedHistoryState<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> {
  localBranch: LocalBranchState<MapsInterface, U, Checkpoint>;
  originBranch: OriginBranchState<MapsInterface, U, Checkpoint>;
}

export const initialSynchedHistoryState = <
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
>(
  emptyHDocHistory: HDocHistory<MapsInterface, U, Checkpoint>
): SynchedHistoryState<MapsInterface, U, Checkpoint> => ({
  localBranch: initialLocalBranchState(emptyHDocHistory),
  originBranch: initialOriginBranchState(emptyHDocHistory)
});

export type SynchedHistoryAction<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> =
  | OriginBranchAction<MapsInterface, U, Checkpoint>
  | LocalBranchAction<MapsInterface, U, Checkpoint>
  | ResetToInitialLoadAction<MapsInterface, U, Checkpoint>;

const mergeRemoteChangesIntoLocal = <
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
>(
  state: InitializedLocalBranchState<MapsInterface, U, Checkpoint>,
  remoteHistory: HDocHistory<MapsInterface, U, Checkpoint>
): InitializedLocalBranchState<MapsInterface, U, Checkpoint> => {
  if (!remoteHistory.hasCommitId(state.lastOriginCommitId)) {
    return state;
  }
  if (
    !remoteHistory.lastCommitId ||
    state.localHistory.hasCommitId(remoteHistory.lastCommitId!)
  ) {
    return state;
  }
  if (state.localHistory.lastCommitId === state.lastOriginCommitId) {
    // No local changes, create a clone of origin
    return {
      ...state,
      localHistory: remoteHistory.branch(remoteHistory.lastCommitId),
      lastOriginCommitId: remoteHistory.lastCommitId,
      currentDocument: remoteHistory.documentAtCommitId()
    };
  } else {
    const localDelta = state.localHistory.generateHistoryDelta(
      state.lastOriginCommitId
    );
    if (localDelta && localDelta.historyRecords.length > 0) {
      const updatedLocalHistory = initHDocHistory(
        remoteHistory.historyEntries,
        remoteHistory.hDocHistoryOptions
      );
      updatedLocalHistory.mergeHistoryDelta(
        localDelta,
        localDelta.historyRecords[localDelta.historyRecords.length - 1]
          .userId || 'NOTSET'
      );
      return {
        ...state,
        localHistory: updatedLocalHistory,
        lastOriginCommitId: remoteHistory.lastCommitId,
        currentDocument: updatedLocalHistory.documentAtCommitId()
      };
    }
  }
  return state;
};

const initLocalBranchWithOriginBranch = <
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
>(
  state: NoLocalCopyLocalBranchState<MapsInterface, U, Checkpoint>,
  originBranch: OriginBranchState<MapsInterface, U, Checkpoint>
):
  | NoLocalCopyLocalBranchState<MapsInterface, U, Checkpoint>
  | InitializedLocalBranchState<MapsInterface, U, Checkpoint> => {
  if (
    originBranch.cloneFetchStatus === ApiRequestStatus.SUCCESS &&
    originBranch.originHistory.historyEntries.length > 0
  ) {
    return {
      type: 'InitializedLocalBranchState',
      localHistory: initHDocHistory(
        originBranch.originHistory.historyEntries,
        originBranch.originHistory.hDocHistoryOptions
      ),
      currentDocument: originBranch.originHistory.documentAtCommitId(),
      lastOriginCommitId: originBranch.originHistory.lastCommitId,
      saveRequestStatus: ApiRequestStatus.IDLE,
      lastSavedCommitId: null
    };
  }
  return state;
};

export const synchedHistoryReducer = <
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
>(
  state: SynchedHistoryState<MapsInterface, U, Checkpoint>,
  action: SynchedHistoryAction<MapsInterface, U, Checkpoint>
): SynchedHistoryState<MapsInterface, U, Checkpoint> => {
  if (action && action.type) {
    if (action.type === SynchedHistoryActionType.RESET_TO_INITIALIZATION) {
      return {
        originBranch: initialOriginBranchState(action.emptyHistory),
        localBranch: initialLocalBranchState(action.emptyHistory)
      };
    }
    const updatedOriginBranch = originBranchReducer(
      state.originBranch,
      action as OriginBranchAction<MapsInterface, U, Checkpoint>
    );
    let updatedLocalBranch = localBranchReducer(
      state.localBranch,
      action as LocalBranchAction<MapsInterface, U, Checkpoint>
    );
    if (
      updatedLocalBranch.type === 'InitializedLocalBranchState' &&
      updatedOriginBranch.cloneFetchStatus === ApiRequestStatus.SUCCESS &&
      updatedOriginBranch.originHistory.lastCommitId &&
      updatedOriginBranch.originHistory.lastCommitId !==
        updatedLocalBranch.lastOriginCommitId &&
      updatedOriginBranch.originHistory.hasCommitId(
        updatedLocalBranch.lastOriginCommitId
      )
    ) {
      // Our local copy of the origin data has new entries since the lastOriginCommitId,
      // time to merge the remote changes into our local copy
      updatedLocalBranch = mergeRemoteChangesIntoLocal(
        updatedLocalBranch,
        updatedOriginBranch.originHistory
      );
    } else if (
      updatedLocalBranch.type === 'NoLocalCopyLocalBranchState' &&
      updatedOriginBranch.cloneFetchStatus === ApiRequestStatus.SUCCESS
    ) {
      // We are here because we don't have a locally saved copy of the timeline
      // history, and we do have a clone of the data
      updatedLocalBranch = initLocalBranchWithOriginBranch(
        updatedLocalBranch,
        updatedOriginBranch
      );
    }

    if (
      updatedLocalBranch === state.localBranch &&
      updatedOriginBranch === state.originBranch
    ) {
      return state;
    } else {
      return {
        ...state,
        localBranch: updatedLocalBranch,
        originBranch: updatedOriginBranch
      };
    }
  }
  return state;
};
