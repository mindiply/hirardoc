import {HDocHistoryOptions, HistoryDelta, HistoryRecord} from './HVersioning';

interface PushedToOrigin<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> {
  __typename: 'PushedToOrigin';
  baseCommitId: string;
  deltaAfterMerge: HistoryDelta<MapsInterface, U, Checkpoint>;
}

interface PushFetchError {
  __typename: 'PushFetchError';
  errorCode: string;
  errorDescription?: string;
}

export interface PushToOriginFn<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> {
  (historyDelta: HistoryDelta<MapsInterface, U, Checkpoint>): Promise<
    PushedToOrigin<MapsInterface, U, Checkpoint> | PushFetchError
  >;
}

export interface FetchFromOriginFn<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> {
  (fromCommitId?: string): Promise<
    HistoryDelta<MapsInterface, U, Checkpoint> | null | PushFetchError
  >;
}

export interface LocalHistoryStorage<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> {
  storeHistory: (
    history: HistoryRecord<MapsInterface, U, Checkpoint>
  ) => Promise<boolean>;
  getHistory: () => Promise<
    HistoryRecord<MapsInterface, U, Checkpoint>[] | null
  >;
}

export interface RemoteHistoryConfig<
MapsInterface,
U extends keyof MapsInterface,
Checkpoint
> extends HDocHistoryOptions<
MapsInterface,
U,
Checkpoint
> {
  pushFn: PushToOriginFn<MapsInterface, U, Checkpoint>;
  fetchFn: FetchFromOriginFn<MapsInterface, U, Checkpoint>;
  storage?: LocalHistoryStorage<MapsInterface, U, Checkpoint>;
}

