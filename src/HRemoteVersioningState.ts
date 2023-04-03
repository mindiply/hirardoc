/**
 * Reducers for data that represents the local and server timeline history
 * for a specific Timeline board.
 */

import {Id, NormalizedDocument} from './HTypes';
import type {HDocHistory, HistoryDelta, HistoryRecord} from './HVersioning';

export enum TimelineHistoryProviderActionType {
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

interface BaseTimelineProviderAction {
  type: TimelineHistoryProviderActionType;
}

interface CloneOriginHistoryAction<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> extends BaseTimelineProviderAction {
  type: TimelineHistoryProviderActionType.SET_CLONE_ORIGIN_HISTORY;
  history: HDocHistory<MapsInterface, U, Checkpoint>;
  when: Date;
}

interface RestoreLocalHistoryAction<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> extends BaseTimelineProviderAction {
  type: TimelineHistoryProviderActionType.RESTORE_LOCAL_HISTORY;
  lastOriginCommit: string;
  historyEntries: HistoryRecord<MapsInterface, U, Checkpoint>[];
}

interface ResetToInitialLoadAction extends BaseTimelineProviderAction {
  type: TimelineHistoryProviderActionType.RESET_TO_INITIALIZATION;
}

interface MergePullFromRemoteAction<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> extends BaseTimelineProviderAction {
  type: TimelineHistoryProviderActionType.MERGE_PULL_ORIGIN_DATA;
  delta: HistoryDelta<MapsInterface, U, Checkpoint> | null;
  userId?: Id;
  when: Date;
}

interface StartLocalHistorySaveToStorageAction {
  type: TimelineHistoryProviderActionType.START_LOCAL_HISTORY_SAVE;
}

interface ErrorLocalHistorySaveToStorageAction {
  type: TimelineHistoryProviderActionType.ERROR_LOCAL_HISTORY_SAVE;
}

interface CompletedLocalHistorySaveToStorageAction {
  type: TimelineHistoryProviderActionType.DONE_LOCAL_HISTORY_SAVE;
  lastLocalCommitId: string | null;
}

export interface ApplyLocalOperationAction<Operation>
  extends BaseTimelineProviderAction {
  type: TimelineHistoryProviderActionType.APPLY_LOCAL_COMMAND;
  action: Operation;
  userId: Id;
  when: Date;
}

export interface UndoTimelineCommand extends BaseTimelineProviderAction {
  type: TimelineHistoryProviderActionType.UNDO_COMMAND;
  userId: Id;
  when: Date;
}

export interface RedoTimelineCommand extends BaseTimelineProviderAction {
  type: TimelineHistoryProviderActionType.REDO_COMMAND;
  userId: Id;
  when: Date;
}

interface RequestLocalHistoryRestoreAction extends BaseTimelineProviderAction {
  type: TimelineHistoryProviderActionType.START_LOCAL_HISTORY_RESTORE;
}

interface FailLocalHistoryRestoreAction extends BaseTimelineProviderAction {
  type: TimelineHistoryProviderActionType.FAIL_LOCAL_HISTORY_RESTORE;
}

interface BaseLocalBranchState<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> {
  localHistory: HDocHistory<MapsInterface, U, Checkpoint>;
  currentDocument: NormalizedDocument<MapsInterface, U>;
}

enum ApiRequestStatus {
  IDLE = 'IDLE',
  SUBMITTED = 'SUBMITTED',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

interface UninitializedLocalBranchState<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> extends BaseLocalBranchState<MapsInterface, U, Checkpoint> {
  type: 'UninitializedLocalBranchState';
  restoreFetchStatus: ApiRequestStatus;
  pendingInitialLoadActions: ApplyLocalOperationAction<any>[];
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
  Checkpoint
> extends BaseLocalBranchState<MapsInterface, U, Checkpoint> {
  type: 'NoLocalCopyLocalBranchState';
  pendingInitialLoadActions: ApplyLocalOperationAction<any>[];
}

export type LocalBranchState<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> =
  | UninitializedLocalBranchState<MapsInterface, U, Checkpoint>
  | InitializedLocalBranchState<MapsInterface, U, Checkpoint>
  | NoLocalCopyLocalBranchState<MapsInterface, U, Checkpoint>;

interface RestoreLocalHistoryAction<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> extends BaseTimelineProviderAction {
  type: TimelineHistoryProviderActionType.RESTORE_LOCAL_HISTORY;
  originCommitId: string;
  historyEntries: HistoryRecord<MapsInterface, U, Checkpoint>[];
}

interface NoLocalHistoryFoundAction extends BaseTimelineProviderAction {
  type: TimelineHistoryProviderActionType.NO_LOCAL_HISTORY_FOUND;
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
  | ApplyLocalOperationAction<any>
  | UndoTimelineCommand
  | RedoTimelineCommand
  | StartLocalHistorySaveToStorageAction
  | ErrorLocalHistorySaveToStorageAction
  | CompletedLocalHistorySaveToStorageAction;

const initialLocalBranchState = <
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
>(): LocalBranchState<MapsInterface, U, Checkpoint> => ({
  type: 'UninitializedLocalBranchState',
  restoreFetchStatus: ApiRequestStatus.IDLE,
  localHistory: createTimelineHistory([]),
  currentDocument: emptyTimelineTree(),
  pendingInitialLoadActions: []
});

const localBranchReducer = (
  state: LocalBranchState | undefined,
  action: LocalBranchAction
): LocalBranchState => {
  const oldState = state || initialLocalBranchState();
  if (action.type === TimelineHistoryProviderActionType.APPLY_LOCAL_COMMAND) {
    if (oldState.type === 'InitializedLocalBranchState') {
      const {userId, when, action: timelineAction} = action;
      const originalLastCommitId = oldState.localHistory.lastCommitId();
      const updatedLocalHistory = createTimelineHistory(oldState.localHistory);
      updatedLocalHistory.commit(
        updatedLocalHistory.lastCommitId()!,
        timelineAction,
        userId,
        when
      );
      return originalLastCommitId === updatedLocalHistory.lastCommitId()
        ? oldState
        : {
            ...oldState,
            localHistory: updatedLocalHistory,
            currentDocument: updatedLocalHistory.timelineTreeForCommit()
          };
    }
  } else if (action.type === TimelineHistoryProviderActionType.UNDO_COMMAND) {
    if (oldState.type === 'InitializedLocalBranchState') {
      const updatedLocalHistory = createTimelineHistory(oldState.localHistory);
      const {userId, when} = action;
      const beforeUndoCommitId = oldState.localHistory.lastCommitId();
      updatedLocalHistory.undo(userId, when);
      return beforeUndoCommitId === updatedLocalHistory.lastCommitId()
        ? oldState
        : {
            ...oldState,
            localHistory: updatedLocalHistory,
            currentDocument: updatedLocalHistory.timelineTreeForCommit()
          };
    }
  } else if (action.type === TimelineHistoryProviderActionType.REDO_COMMAND) {
    const updatedLocalHistory = createTimelineHistory(oldState.localHistory);
    const {userId, when} = action;
    const beforeRedoCommitId = oldState.localHistory.lastCommitId();
    updatedLocalHistory.redo(userId, when);
    return updatedLocalHistory.lastCommitId() === beforeRedoCommitId
      ? oldState
      : {
          ...oldState,
          localHistory: updatedLocalHistory,
          currentDocument: updatedLocalHistory.timelineTreeForCommit()
        };
  } else if (
    action.type === TimelineHistoryProviderActionType.RESTORE_LOCAL_HISTORY
  ) {
    if (
      oldState.type === 'UninitializedLocalBranchState' ||
      oldState.type === 'NoLocalCopyLocalBranchState'
    ) {
      const localBranch = createTimelineHistory(action.historyEntries);
      if (localBranch.length() > 0) {
        for (const pendingAction of oldState.pendingInitialLoadActions) {
          try {
            localBranch.commit(
              localBranch.lastCommitId(),
              pendingAction.action,
              pendingAction.userId,
              pendingAction.when
            );
          } catch (e) {
            console.log('Unable to apply a pending action', e);
          }
        }
        return {
          type: 'InitializedLocalBranchState',
          lastOriginCommitId: action.originCommitId,
          localHistory: localBranch,
          currentDocument: localBranch.timelineTreeForCommit(),
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
    action.type === TimelineHistoryProviderActionType.START_LOCAL_HISTORY_SAVE
  ) {
    if (oldState.type === 'InitializedLocalBranchState') {
      return {...oldState, saveRequestStatus: ApiRequestStatus.SUBMITTED};
    }
  } else if (
    action.type === TimelineHistoryProviderActionType.DONE_LOCAL_HISTORY_SAVE
  ) {
    if (oldState.type === 'InitializedLocalBranchState') {
      return {
        ...oldState,
        saveRequestStatus: ApiRequestStatus.SUCCESS,
        lastSavedCommitId: action.lastLocalCommitId
      };
    }
  } else if (
    action.type === TimelineHistoryProviderActionType.ERROR_LOCAL_HISTORY_SAVE
  ) {
    if (oldState.type === 'InitializedLocalBranchState') {
      return {...oldState, saveRequestStatus: ApiRequestStatus.ERROR};
    }
  } else if (
    action.type === TimelineHistoryProviderActionType.NO_LOCAL_HISTORY_FOUND ||
    action.type === TimelineHistoryProviderActionType.FAIL_LOCAL_HISTORY_RESTORE
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
    action.type ===
    TimelineHistoryProviderActionType.START_LOCAL_HISTORY_RESTORE
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

interface OriginBranchState {
  originHistory: ITimelineHistory;
  cloneFetchStatus: ApiRequestStatus;
  pullFetchStatus: ApiRequestStatus;
  lastPullStartedOn: Date | null;
  pushFetchStatus: ApiRequestStatus;
  lastPushStartedOn: Date | null;
}

const initialOriginBranchState = (): OriginBranchState => ({
  originHistory: createTimelineHistory([]),
  cloneFetchStatus: ApiRequestStatus.IDLE,
  pullFetchStatus: ApiRequestStatus.IDLE,
  pushFetchStatus: ApiRequestStatus.IDLE,
  lastPullStartedOn: null,
  lastPushStartedOn: null
});

interface StartCloneFromOriginAction {
  type: TimelineHistoryProviderActionType.START_CLONE_ORIGIN;
}

interface ErrorCloneFromOriginAction {
  type: TimelineHistoryProviderActionType.ERROR_CLONE_ORIGIN;
}

interface StartOriginPullAction extends BaseTimelineProviderAction {
  type: TimelineHistoryProviderActionType.START_ORIGIN_PULL;
  when: Date;
}

interface ErrorOriginPullAction extends BaseTimelineProviderAction {
  type: TimelineHistoryProviderActionType.ERROR_ORIGIN_PULL;
}

interface StartPushToRemoteAction {
  type: TimelineHistoryProviderActionType.START_PUSH_TO_REMOTE;
  when: Date;
}

interface MergePushedToRemoteAction {
  type: TimelineHistoryProviderActionType.MERGE_PUSHED_TO_REMOTE;
  delta: ITimelineDelta;
  userId?: Id;
}

interface ErrorPushToRemoteAction {
  type: TimelineHistoryProviderActionType.ERROR_PUSH_TO_REMOTE;
}

type OriginBranchAction =
  | CloneOriginHistoryAction
  | MergePullFromRemoteAction
  | StartCloneFromOriginAction
  | ErrorCloneFromOriginAction
  | MergePushedToRemoteAction
  | StartOriginPullAction
  | ErrorOriginPullAction
  | StartPushToRemoteAction
  | ErrorPushToRemoteAction;

export const originBranchReducer = (
  state: OriginBranchState | undefined,
  action: OriginBranchAction
): OriginBranchState => {
  const oldState = state || initialOriginBranchState();
  if (
    action.type === TimelineHistoryProviderActionType.SET_CLONE_ORIGIN_HISTORY
  ) {
    return {
      ...oldState,
      originHistory: action.history,
      cloneFetchStatus: ApiRequestStatus.SUCCESS
    };
  } else if (
    action.type === TimelineHistoryProviderActionType.MERGE_PULL_ORIGIN_DATA ||
    action.type === TimelineHistoryProviderActionType.MERGE_PUSHED_TO_REMOTE
  ) {
    const {delta} = action;
    let updatedOriginHistory = oldState.originHistory;

    // First sanity check on delta and checking we don't already have the delta last commitId in
    // our history
    if (delta && delta.operations.length > 0) {
      const lastOperation = delta.operations[delta.operations.length - 1];
      if (!oldState.originHistory.hasCommitId(lastOperation.commitId)) {
        if (oldState.originHistory.hasCommitId(delta.fromCommitId)) {
          updatedOriginHistory = createTimelineHistory(oldState.originHistory);
          updatedOriginHistory.mergeBranchDeltaToTimeline(
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
        action.type === TimelineHistoryProviderActionType.MERGE_PULL_ORIGIN_DATA
          ? ApiRequestStatus.SUCCESS
          : oldState.pullFetchStatus,
      pushFetchStatus:
        action.type === TimelineHistoryProviderActionType.MERGE_PUSHED_TO_REMOTE
          ? ApiRequestStatus.SUCCESS
          : oldState.pullFetchStatus
    };
  } else if (
    action.type === TimelineHistoryProviderActionType.ERROR_CLONE_ORIGIN
  ) {
    return oldState.cloneFetchStatus === ApiRequestStatus.ERROR
      ? oldState
      : {
          ...oldState,
          cloneFetchStatus: ApiRequestStatus.ERROR
        };
  } else if (
    action.type === TimelineHistoryProviderActionType.START_CLONE_ORIGIN
  ) {
    return {
      ...oldState,
      cloneFetchStatus: ApiRequestStatus.SUBMITTED
    };
  } else if (
    action.type === TimelineHistoryProviderActionType.START_ORIGIN_PULL
  ) {
    return {
      ...oldState,
      pullFetchStatus: ApiRequestStatus.SUBMITTED,
      lastPullStartedOn: action.when
    };
  } else if (
    action.type === TimelineHistoryProviderActionType.ERROR_ORIGIN_PULL
  ) {
    return oldState.pullFetchStatus === ApiRequestStatus.ERROR
      ? oldState
      : {...oldState, pullFetchStatus: ApiRequestStatus.ERROR};
  } else if (
    action.type === TimelineHistoryProviderActionType.START_PUSH_TO_REMOTE
  ) {
    return {
      ...oldState,
      lastPushStartedOn: action.when,
      pushFetchStatus: ApiRequestStatus.SUBMITTED
    };
  } else if (
    action.type === TimelineHistoryProviderActionType.ERROR_PUSH_TO_REMOTE
  ) {
    return {
      ...oldState,
      pushFetchStatus: ApiRequestStatus.ERROR
    };
  }
  return oldState;
};

export interface TimelineHistoryProviderState {
  localBranch: LocalBranchState;
  originBranch: OriginBranchState;
}

export const initialTimelineHistoryProviderState =
  (): TimelineHistoryProviderState => ({
    localBranch: initialLocalBranchState(),
    originBranch: initialOriginBranchState()
  });

type TimelineHistoryProviderAction =
  | OriginBranchAction
  | LocalBranchAction
  | ResetToInitialLoadAction;

const mergeRemoteChangesIntoLocal = (
  state: InitializedLocalBranchState,
  remoteHistory: ITimelineHistory
): InitializedLocalBranchState => {
  if (!remoteHistory.hasCommitId(state.lastOriginCommitId)) {
    return state;
  }
  if (
    !remoteHistory.lastCommitId() ||
    state.localHistory.hasCommitId(remoteHistory.lastCommitId()!)
  ) {
    return state;
  }
  if (state.localHistory.lastCommitId() === state.lastOriginCommitId) {
    // No local changes, create a clone of origin
    return {
      ...state,
      localHistory: remoteHistory.branchHistory(remoteHistory.lastCommitId()!),
      lastOriginCommitId: remoteHistory.lastCommitId()!,
      currentDocument: remoteHistory.timelineTreeForCommit()
    };
  } else {
    const localDelta = state.localHistory.generateTimelineDelta(
      state.lastOriginCommitId
    );
    if (localDelta && localDelta.operations.length > 0) {
      const updatedLocalHistory = createTimelineHistory(remoteHistory);
      updatedLocalHistory.mergeBranchDeltaToTimeline(
        localDelta,
        localDelta.operations[localDelta.operations.length - 1].userId ||
          'NOTSET'
      );
      return {
        ...state,
        localHistory: updatedLocalHistory,
        lastOriginCommitId: remoteHistory.lastCommitId()!,
        currentDocument: updatedLocalHistory.timelineTreeForCommit()
      };
    }
  }
  return state;
};

const initLocalBranchWithOriginBranch = (
  state: NoLocalCopyLocalBranchState,
  originBranch: OriginBranchState
): NoLocalCopyLocalBranchState | InitializedLocalBranchState => {
  if (
    originBranch.cloneFetchStatus === ApiRequestStatus.SUCCESS &&
    originBranch.originHistory.length() > 0
  ) {
    return {
      type: 'InitializedLocalBranchState',
      localHistory: createTimelineHistory(originBranch.originHistory),
      currentDocument: originBranch.originHistory.timelineTreeForCommit(),
      lastOriginCommitId: originBranch.originHistory.lastCommitId()!,
      saveRequestStatus: ApiRequestStatus.IDLE,
      lastSavedCommitId: null
    };
  }
  return state;
};

export const timelineHistoryProviderApp = (
  state: TimelineHistoryProviderState,
  action: TimelineHistoryProviderAction
): TimelineHistoryProviderState => {
  if (action && action.type) {
    if (
      action.type === TimelineHistoryProviderActionType.RESET_TO_INITIALIZATION
    ) {
      return {
        originBranch: initialOriginBranchState(),
        localBranch: initialLocalBranchState()
      };
    }
    const updatedOriginBranch = originBranchReducer(
      state.originBranch,
      action as OriginBranchAction
    );
    let updatedLocalBranch = localBranchReducer(
      state.localBranch,
      action as LocalBranchAction
    );
    if (
      updatedLocalBranch.type === 'InitializedLocalBranchState' &&
      updatedOriginBranch.cloneFetchStatus === ApiRequestStatus.SUCCESS &&
      updatedOriginBranch.originHistory.lastCommitId() &&
      updatedOriginBranch.originHistory.lastCommitId() !==
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

export interface HistoryAction {
  __typename: 'HistoryAction';
  timelineId: Id;
  action: TimelineHistoryProviderAction;
}

export interface AddTimelineHistoryAction {
  __typename: 'AddTimelineHistoryAction';
  timelineId: Id;
  timelineEntry: TimelineHistoryProviderState;
}

export type TimelinesHistories = {
  [timelineId: string]: TimelineHistoryProviderState;
};

export type TimelinesHistoriesAction = HistoryAction | AddTimelineHistoryAction;

export const timelinesHistoriesReducer = (
  state: TimelinesHistories,
  action: TimelinesHistoriesAction
): TimelinesHistories => {
  if (action) {
    if (action.__typename === 'HistoryAction') {
      const {action: innerAction, timelineId} = action;
      const existingInnerState = timelineId in state ? state[timelineId] : null;
      const updatedInnerState = timelineHistoryProviderApp(
        existingInnerState || initialTimelineHistoryProviderState(),
        innerAction
      );
      if (updatedInnerState !== existingInnerState) {
        return {...state, [timelineId]: updatedInnerState};
      }
    } else if (action.__typename === 'AddTimelineHistoryAction') {
      const {timelineId, timelineEntry} = action;
      if (timelineId in state) {
        return state;
      }
      return {
        ...state,
        [timelineId]: timelineEntry
      };
    }
  }
  return state;
};
