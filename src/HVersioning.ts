import jsSHA from 'jssha';
import {
  HDocOperation,
  Id,
  IMutableDocument,
  INormalizedDocument
} from './HTypes';
import {mutableDocument} from './HDocument';

export enum HistoryEntryType {
  OPERATION = 'TimelineOperation',
  MERGE = 'TimelineMerge',
  UNDO = 'TimelineUndo',
  REDO = 'TimelineRedo'
}

/**
 * Each history record represents
 */
export interface BaseHistoryRecord<
  MapsInterface,
  U extends keyof MapsInterface
> {
  __typename: HistoryEntryType;
  commitId: string;
  previousCommitId: string | null;
  changes: Array<HDocOperation<MapsInterface>>;
  userId: Id | null;
  when: Date;
  checkpoint?: INormalizedDocument<MapsInterface, U>;
}

/**
 * A history operation record represents the fact that one or more operations changed the hierarchical
 * document. It documents the operation(s) run, and a list of the changes that brought the
 * document from the previousCommitId to the one after the operation was run.
 */
export interface HistoryOperationRecord<
  MapsInterface,
  U extends keyof MapsInterface,
  Operation
> extends BaseHistoryRecord<MapsInterface, U> {
  __typename: HistoryEntryType.OPERATION;
  operation: Operation | Operation[];
}

export interface InitializeHistoryWithDocumentOperation<
  MapsInterface,
  U extends keyof MapsInterface
> {
  __typename: 'InitializeHistoryWithDocumentOperation';
  document: INormalizedDocument<MapsInterface, U>;
}

export type HistoryRecordInitializeRecord<
  MapsInterface,
  U extends keyof MapsInterface
> = HistoryOperationRecord<
  MapsInterface,
  U,
  InitializeHistoryWithDocumentOperation<MapsInterface, U>
>;

/**
 * An undo record expresses the fact that the user decided to undo
 * one or more commands, and the timeline tree was reset to what it
 * was at commit undoneToCommitId.
 */
export interface HistoryUndoRecord<MapsInterface, U extends keyof MapsInterface>
  extends BaseHistoryRecord<MapsInterface, U> {
  __typename: HistoryEntryType.UNDO;
  undoneToCommitId: string;
}

/**
 * A Redo record represents the fact that we want to redo undone commands.
 * It points to the commitId we redid, and to the undo history record
 * that was redone.
 */
export interface HistoryRedoRecord<MapsInterface, U extends keyof MapsInterface>
  extends BaseHistoryRecord<MapsInterface, U> {
  __typename: HistoryEntryType.REDO;
  undoCommitId: string;
  reverseToCommitId: string;
}

export interface HistoryMergeRecord<
  MapsInterface,
  U extends keyof MapsInterface
> extends BaseHistoryRecord<MapsInterface, U> {
  __typename: HistoryEntryType.MERGE;
  baseCommitId: string;
  theirOperations: Array<
    | HistoryOperationRecord<MapsInterface, U, any>
    | HistoryUndoRecord<MapsInterface, U>
    | HistoryRedoRecord<MapsInterface, U>
    | HistoryMergeRecord<MapsInterface, U>
  >;
}

export type HistoryRecord<MapsInterface, U extends keyof MapsInterface> =
  | HistoryOperationRecord<MapsInterface, U, any>
  | HistoryUndoRecord<MapsInterface, U>
  | HistoryRedoRecord<MapsInterface, U>
  | HistoryMergeRecord<MapsInterface, U>;

function injectCommitIdInOperation<
  MapsInterface,
  U extends keyof MapsInterface,
  T extends HistoryRecord<MapsInterface, U> = HistoryRecord<MapsInterface, U>
>(operation: Omit<T, 'commitId'>): T {
  const shaObj = new jsSHA('SHA-512', 'TEXT');
  shaObj.update(JSON.stringify(operation));
  return {...operation, commitId: shaObj.getHash('HEX')} as T;
}

export interface OperationInterpreter<
  MapsInterface,
  U extends keyof MapsInterface,
  Operation = any
> {
  (mutableDoc: IMutableDocument<MapsInterface, U>, operation: Operation): void;
}

function defaultInterpreter<MapsInterface, U extends keyof MapsInterface>(
  mutableDoc: IMutableDocument<MapsInterface, U>,
  operation: HDocOperation<MapsInterface, U>
) {
  mutableDoc.applyChanges(operation);
}

/**
 * A history delta can be exchanged between HDocHistory objects of the same document
 * to perform reconciliations of separate diverging versions of the document.
 */
export interface HistoryDelta<MapsInterface, U extends keyof MapsInterface> {
  __typaneme: 'HistoryDelta';
  fromCommitId: string;
  historyRecords: Array<Omit<HistoryRecord<MapsInterface, U>, 'checkpoint'>>;
}

/**
 * Interface of an object that maintains the history of a document, allowing to modifying it
 * and merging changes from other sources.
 *
 * The interface makes no promises that copies contain full history of the document or that they will
 * be able to merge each other changes, it depends on the calling code if that can happen or not.
 */
interface HDocHistory<
  MapsInterface,
  U extends keyof MapsInterface,
  Operation = any
> {
  /**
   * An operation interpreter is used when the user wants to change the document.
   * The client code can provide an operationInterpreter when instantiating the HDocHistory
   * instead of relying on the default interpreter, if they want to provide higher level logic
   * that uses a mutableDocument to summarize the changes of this higher level logic.
   *
   * The default interpreter only understands the four basic HDocOperations.
   */
  readonly operationInterpreter: OperationInterpreter<
    MapsInterface,
    U,
    Operation
  >;

  /**
   * Allows to check if the commitId is among those stored in the HDocHistory.
   * @param commitId
   */
  hasCommitId: (commitId: string) => boolean;

  /**
   * Returns the commitId that follows in the history the one provided.
   * Returns null if either the input commit id or its follower don't exist.
   * @param commitId
   */
  nextCommitIdOf: (commitId: string) => string | null;

  /**
   * Returns the commitId that preceded the one provided in input.
   * If the commitId provided or its predecessor don't exist, return null.
   * @param commitId
   */
  prevCommitIdOf: (commitId: string) => string | null;

  /**
   * These are the records of the changes to the document. The first entry is either
   * an [HistoryRecordInitializeRecord] or any command that has the checkpoint field
   * containing a copy of the hierarchical document as it was after the operation documented
   * in the record was performed
   */
  readonly historyEntries: Array<HistoryRecord<MapsInterface, U>>;

  /**
   * The lastCommitId in this history
   */
  readonly lastCommitId: string;

  /**
   * Performs one or more operations on the document corresponding to the end of the commit list,
   * and creates a new operation record that records it.
   *
   * Returns the updated document.
   *
   * @param operation
   * @param userId
   */
  commit: <Operation>(
    operation: Operation | Operation[],
    userId?: Id | null
  ) => INormalizedDocument<MapsInterface, U>;

  /**
   * Creates a new [HDocHistory] that goes from the first historyEntry up to and including
   * fromCommitId. If fromCommitId is not provided, it will use lastCommitId.
   * @param fromCommitId
   */
  branch: (fromCommitId?: string) => HDocHistory<MapsInterface, U>;

  /**
   * Create a historyDelta object starting from fromCommitId up to and including toCommitId.
   * If commitId is not provided is will use lastCommitId.
   *
   * Usually user to send list of local changes to a remote copy of the document for reconciliation.
   *
   * @param fromCommitId
   * @param toCommitId
   */
  generateHistoryDelta: (
    fromCommitId: string,
    toCommitId?: string
  ) => HistoryDelta<MapsInterface, U>;

  /**
   *
   * @param historyDelta
   * @param userId
   */
  mergeHistoryDelta: (
    historyDelta: HistoryDelta<MapsInterface, U>,
    userId?: Id
  ) => INormalizedDocument<MapsInterface, U>;

  /**
   * If the last historyEntry that changed the document was an undo command, it will redo
   * the command that the undo undid.
   * @param userId
   */
  redo: (userId?: Id | null) => INormalizedDocument<MapsInterface, U>;

  /**
   * If the last historyEntry that changed the document, which was not and undo, is not the first record in the historyRecord,
   * it will undo the changes of that record and record here what the state was before that change.
   * @param userId
   */
  undo: (userId?: Id | null) => INormalizedDocument<MapsInterface, U>;

  /**
   * Returns the hierarchical document at the requested commitId. If no commitId is provided,
   * returns the document as of the lastCommitId.
   * @param commitId
   */
  documentAtCommitId: (
    commitId?: string
  ) => INormalizedDocument<MapsInterface, U>;
}

export interface InitHDocOptions<MapsInterface, U extends keyof MapsInterface> {
  operationInterpreter?: OperationInterpreter<MapsInterface, U>;
  userId?: Id | null;
}

class HDocHistoryImpl<MapsInterface, U extends keyof MapsInterface>
  implements HDocHistory<MapsInterface, U>
{
  private _commitIdsIndexMap: Map<string, number>;
  private _historyEntries: HistoryRecord<MapsInterface, U>[];
  private _operationInterpreter: OperationInterpreter<MapsInterface, U>;

  constructor(
    entriesOrDoc:
      | INormalizedDocument<MapsInterface, U>
      | HistoryRecord<MapsInterface, U>[],
    {
      operationInterpreter,
      userId = null
    }: InitHDocOptions<MapsInterface, U> = {}
  ) {
    this._historyEntries = [];
    this._commitIdsIndexMap = new Map();
    this._operationInterpreter = operationInterpreter || defaultInterpreter;
    if (Array.isArray(entriesOrDoc)) {
      this._pushHistoryRecords(entriesOrDoc);
    } else {
      const initOp = injectCommitIdInOperation<MapsInterface, U>({
        __typename: HistoryEntryType.OPERATION,
        previousCommitId: null,
        checkpoint: entriesOrDoc,
        changes: [],
        userId,
        when: new Date()
      });
      this._pushHistoryRecords(initOp);
    }
  }

  public get operationInterpreter() {
    return this._operationInterpreter;
  }

  public get historyEntries() {
    return this._historyEntries;
  }

  public get lastCommitId() {
    if (this.historyEntries.length < 1) {
      throw new RangeError('No history records in versioning object');
    }
    return this.historyEntries[this.historyEntries.length - 1].commitId;
  }

  public hasCommitId = (commitId: string) =>
    this._commitIdsIndexMap.has(commitId);

  public nextCommitIdOf = (commitId: string) => {
    const entryIndex = this._commitIdsIndexMap.get(commitId);
    if (typeof entryIndex === 'number') {
      if (entryIndex < this._historyEntries.length - 1) {
        return this._historyEntries[entryIndex + 1].commitId;
      }
    }
    return null;
  };

  public prevCommitIdOf = (commitId: string) => {
    const entryIndex = this._commitIdsIndexMap.get(commitId);
    if (typeof entryIndex === 'number') {
      if (entryIndex > 0) {
        return this._historyEntries[entryIndex - 1].commitId;
      }
    }
    return null;
  };

  public documentAtCommitId = (
    commitId?: string
  ): INormalizedDocument<MapsInterface, U> => {
    const targetCommitId = commitId || this.lastCommitId;
    const targetCommitIndex = this._commitIdsIndexMap.get(targetCommitId);
    if (targetCommitIndex === undefined) {
      throw new RangeError('Commit id does not exist');
    }
    const checkpointIndex = this._findClosestCheckpointIndex(targetCommitId);
    if (checkpointIndex < 0) {
      throw new TypeError('Cannot find a checkpoint');
    }
    const checkpointDoc = this._historyEntries[checkpointIndex].checkpoint!;
    if (targetCommitIndex === checkpointIndex) {
      return checkpointDoc;
    }
    const mutableDoc = mutableDocument(
      this._historyEntries[checkpointIndex].checkpoint!
    );
    for (let i = checkpointIndex + 1; i < this._historyEntries.length; i++) {
      // @ts-expect-error typing ambiguous for change field
      mutableDoc.applyChanges(this._historyEntries[i].changes);
    }
    return mutableDoc.updatedDocument();
  };

  public commit = <Operation>(
    operation: Operation | Operation[],
    userId: Id | null = null
  ): INormalizedDocument<MapsInterface, U> => {
    const mutableDoc = mutableDocument(this.documentAtCommitId());
    const operations = Array.isArray(operation) ? operation : [operation];
    for (const op of operations) {
      this._operationInterpreter(mutableDoc, op);
    }
    const operationRecord = injectCommitIdInOperation({
      __typename: HistoryEntryType.OPERATION,
      operation,
      changes: mutableDoc.changes,
      previousCommitId: this.lastCommitId,
      userId,
      when: new Date(),
      // @ts-expect-error U can be instantiated to a different type
      checkpoint: mutableDoc.updatedDocument()
    }) as HistoryOperationRecord<MapsInterface, U, Operation>;
    this._pushHistoryRecords(operationRecord);
    return operationRecord.checkpoint as INormalizedDocument<MapsInterface, U>;
  };

  public branch = (fromCommitId?: string): HDocHistory<MapsInterface, U> => {
    const targetCommitId = fromCommitId || this.lastCommitId;
    const commitIndex = this._commitIdsIndexMap.get(targetCommitId);
    if (commitIndex === undefined) {
      throw new RangeError('commitId not found');
    }
    const entries = this._historyEntries.slice(0, commitIndex + 1);
    return new HDocHistoryImpl(entries);
  };

  public generateHistoryDelta = (
    fromCommitId: string,
    toCommitId?: string
  ): HistoryDelta<MapsInterface, U> => {};

  public mergeHistoryDelta = (
    historyDelta: HistoryDelta<MapsInterface, U>,
    userId?: Id
  ): INormalizedDocument<MapsInterface, U> => {};

  public redo = (
    userId?: Id | null
  ): INormalizedDocument<MapsInterface, U> => {};

  public undo = (
    userId?: Id | null
  ): INormalizedDocument<MapsInterface, U> => {};

  private _findClosestCheckpointIndex(commitId: string): number {
    let i = this._commitIdsIndexMap.get(commitId)!;
    for (let checkpointFound = false; !checkpointFound && i >= 0; i--) {
      if (this._historyEntries[i].checkpoint) {
        return i;
      }
    }
    return -1;
  }

  private _pushHistoryRecords = (
    historyRecords:
      | HistoryRecord<MapsInterface, U>
      | HistoryRecord<MapsInterface, U>[]
  ) => {
    const records = Array.isArray(historyRecords)
      ? historyRecords
      : [historyRecords];
    for (const record of records) {
      this._historyEntries.push(record);
      this._commitIdsIndexMap.set(
        record.commitId,
        this._historyEntries.length - 1
      );
    }
  };

  private _deleteHistoryRecords = (
    historyRecords:
      | HistoryRecord<MapsInterface, U>
      | HistoryRecord<MapsInterface, U>[]
  ) => {
    const records = (
      Array.isArray(historyRecords) ? [...historyRecords] : [historyRecords]
    ).filter(record => this._commitIdsIndexMap.has(record.commitId));
    records.sort(
      (a, b) =>
        this._commitIdsIndexMap.get(b.commitId)! -
        this._commitIdsIndexMap.get(a.commitId)!
    );
    for (const recordToDelete of records) {
      const index = this._commitIdsIndexMap.get(recordToDelete.commitId)!;
      this._historyEntries.splice(index, 1);
      for (let i = index; i < this._historyEntries.length; i++) {
        this._commitIdsIndexMap.set(this._historyEntries[i].commitId, i);
      }
    }
  };
}

export function initHDocHistory<MapsInterface, U extends keyof MapsInterface>(
  documentOrHistoryRecords:
    | INormalizedDocument<MapsInterface, U>
    | HistoryRecord<MapsInterface, U>[],
  options: InitHDocOptions<MapsInterface, U>
): HDocHistory<MapsInterface, U> {
  return new HDocHistoryImpl(documentOrHistoryRecords, options);
}
