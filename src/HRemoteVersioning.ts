import {
  HBaseDocHistory,
  HDocHistory,
  HistoryDelta,
  InitHDocOptions
} from './HVersioning';
import {Id, INormalizedDocument} from './HTypes';

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

export async function pushToOrigin<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
>(
  localHistory: HDocHistory<MapsInterface, U, Checkpoint, any>,
  remoteHistory: HDocHistory<MapsInterface, U, Checkpoint, any>
): Promise<null | HDocHistory<MapsInterface, U, Checkpoint>> {
  return localHistory;
}

interface ClientToRemoteChannel<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> {
  cloneRemote: (
    fromCommitId?: string
  ) => Promise<HDocHistory<MapsInterface, U, Checkpoint>>;

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

interface ClientSynchedWithRemote<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint,
  Document extends INormalizedDocument<MapsInterface, U>
> extends HBaseDocHistory<MapsInterface, U, Checkpoint> {
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

interface ClientSynchedCreateOptions<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint,
  Document extends INormalizedDocument<MapsInterface, U>
> extends InitHDocOptions<MapsInterface, U, Checkpoint> {
  emptyHDocFactory: () => Document;
  clientToRemoteChannel: ClientSynchedWithRemote<MapsInterface, U, Checkpoint>;
  localHistoryStorage?: LocalHistoryStorage<MapsInterface, U, Checkpoint>;
}
