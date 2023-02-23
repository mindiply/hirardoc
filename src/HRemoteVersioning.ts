import {
  defaultInterpreter,
  HBaseDocHistory,
  HDocHistory,
  HDocHistoryOptions,
  HistoryDelta,
  HistoryRecord,
  initHDocHistory
} from './HVersioning';
import {INormalizedDocument} from './HTypes';
import {
  ApiRequestStatus,
  initialSynchedHistoryState,
  SynchedHistoryAction,
  synchedHistoryReducer,
  SynchedHistoryState
} from './HRemoveVersioningReducers';
import {threeWayMerge} from './HMerge3';

export enum LocalRemoteEvent {
  LOCAL_RESTORED,
  LOCAL_CLONED_FROM_ORIGIN,
  APPLIED_LOCAL_CHANGE,
  MERGED_REMOTE_CHANGES
}

export interface SynchedClientListener<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> {
  (
    event: LocalRemoteEvent,
    synchedClient: ClientSynchedWithRemote<MapsInterface, U, Checkpoint>
  ): void;
}

interface ClientToRemoteChannel<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> {
  cloneRemote: (
    fromCommitId?: string
  ) => Promise<HistoryRecord<MapsInterface, U, Checkpoint>[] | null>;

  pushChanges: (
    delta: HistoryDelta<MapsInterface, U, Checkpoint>
  ) => Promise<null | HistoryDelta<MapsInterface, U, Checkpoint>>;

  pullChanges: (
    fromCommitId: string
  ) => Promise<null | HistoryDelta<MapsInterface, U, Checkpoint>>;
}

interface LocalHistoryStorage<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> {
  store: (
    localHistory: HDocHistory<MapsInterface, U, Checkpoint>
  ) => Promise<boolean>;
  restore: () => Promise<HDocHistory<MapsInterface, U, Checkpoint> | null>;
}

export enum LocalState {
  UNINITIALIZED,
  LOCALLY_RESTORED,
  SYNCHED_WITH_REMOTE
}

export enum SynchronizationState {
  UNSYNCHED,
  SYNCHED,
  ERROR
}
const nullChannel: ClientToRemoteChannel<any, any, any> = {
  cloneRemote: async () => null,
  pullChanges: async () => null,
  pushChanges: async () => null
};

interface ClientSynchedHistoryOptions<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> extends HDocHistoryOptions<MapsInterface, U, Checkpoint> {
  emptyHDocFactory: () => INormalizedDocument<MapsInterface, U>;
  clientToRemoteChannel: ClientToRemoteChannel<MapsInterface, U, Checkpoint>;
  localHistoryStorage: LocalHistoryStorage<MapsInterface, U, Checkpoint>;
}

const nullLocalHistoryStorage: LocalHistoryStorage<any, any, any> = {
  restore: async () => null,
  store: async () => false
};

interface ClientSynchedWithRemote<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> extends HBaseDocHistory<MapsInterface, U, Checkpoint> {
  readonly clientOptions: ClientSynchedHistoryOptions<
    MapsInterface,
    U,
    Checkpoint
  >;
  readonly isInitialized: boolean;
  readonly hadLocalStorageCopy: null | boolean;
  readonly wasOriginCloned: null | boolean;
  readonly isPushing: boolean;
  readonly isPulling: boolean;

  readonly remoteChannel: ClientToRemoteChannel<MapsInterface, U, Checkpoint>;
  readonly localStorage: LocalHistoryStorage<MapsInterface, U, Checkpoint>;

  subscribe: (
    listenFn: SynchedClientListener<MapsInterface, U, Checkpoint>
  ) => void;

  unsubscribe: (
    listenFn: SynchedClientListener<MapsInterface, U, Checkpoint>
  ) => void;
}

class ClientSynchedWithRemoteImpl<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> implements ClientSynchedWithRemote<MapsInterface, U, Checkpoint>
{
  private _synchedOptions: ClientSynchedHistoryOptions<
    MapsInterface,
    U,
    Checkpoint
  >;
  private _state: SynchedHistoryState<MapsInterface, U, Checkpoint>;
  private _dispatch: (
    action: SynchedHistoryAction<MapsInterface, U, Checkpoint>
  ) => SynchedHistoryState<MapsInterface, U, Checkpoint>;
  private _listeners: SynchedClientListener<MapsInterface, U, Checkpoint>[];
  private _hadLocalStorageCopy: boolean;

  constructor(
    options: Partial<
      ClientSynchedHistoryOptions<MapsInterface, U, Checkpoint>
    > &
      Pick<
        ClientSynchedHistoryOptions<MapsInterface, U, Checkpoint>,
        'emptyHDocFactory'
      >
  ) {
    this._synchedOptions = {
      defaultUserId: options.defaultUserId || 'NOTSET',
      // @ts-expect-error this being a serializer is an implementation matter
      hDocCheckpointTranslator: initProps.hDocCheckpointTranslator || this,
      mergeFn: options.mergeFn || threeWayMerge,
      operationInterpreter: options.operationInterpreter || defaultInterpreter,
      clientToRemoteChannel: options.clientToRemoteChannel || nullChannel,
      emptyHDocFactory: options.emptyHDocFactory,
      localHistoryStorage:
        options.localHistoryStorage || nullLocalHistoryStorage
    };
    const emptyHistory = initHDocHistory(
      this._synchedOptions.emptyHDocFactory(),
      this._synchedOptions
    );
    this._state = initialSynchedHistoryState(emptyHistory);
    this._hadLocalStorageCopy = false;
    this._dispatch = action => {
      const newState = synchedHistoryReducer(this._state, action);
      if (newState !== this._state) {
        this._state = newState;
        // Give a chance to the function to return before reacting to state changes
        // with side effects
        setTimeout(this.reactToStateChange, 0);
      }
      return this._state;
    };
    this._listeners = [];
  }

  public get isInitialized() {
    return this._state.localBranch.type === 'InitializedLocalBranchState';
  }

  public get hadLocalStorageCopy() {
    return this._hadLocalStorageCopy;
  }

  public get wasOriginCloned() {
    return (
      this._state.originBranch.cloneFetchStatus === ApiRequestStatus.SUCCESS
    );
  }

  public get isPushing() {
    return (
      this._state.originBranch.pushFetchStatus === ApiRequestStatus.SUBMITTED
    );
  }

  public get isPulling() {
    return (
      this._state.originBranch.pullFetchStatus === ApiRequestStatus.SUBMITTED
    );
  }

  public get remoteChannel() {
    return this._synchedOptions.clientToRemoteChannel;
  }

  public get localStorage() {
    return this._synchedOptions.localHistoryStorage;
  }

  private notifyListeners = (eventType: LocalRemoteEvent) => {
    for (const listener of this._listeners) {
      try {
        listener(eventType, this);
      } catch (e) {
        // not reported, the client is caller is causing troubles
      }
    }
  };

  private reactToStateChange() {}
}
