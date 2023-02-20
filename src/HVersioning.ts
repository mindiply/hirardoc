import jsSHA from 'jssha';
import {omit} from 'lodash';
import {
  HDocOperation,
  Id,
  IMutableDocument,
  INormalizedDocument
} from './HTypes';
import {mutableDocument} from './HDocument';
import {threeWayMerge} from './HMerge3';
import {diff} from './HDiff';

export enum HistoryEntryType {
  OPERATION = 'HistoryOperation',
  MERGE = 'HistoryMerge',
  UNDO = 'HistoryUndo',
  REDO = 'HistoryRedo'
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

function commitIdOfOperation<MapsInterface, U extends keyof MapsInterface>(
  operation: Omit<HistoryRecord<MapsInterface, U>, 'commitId'>
): string {
  const shaObj = new jsSHA('SHA-512', 'TEXT');
  shaObj.update(JSON.stringify(omit(operation, 'commitId')));
  return shaObj.getHash('HEX');
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
  __typename: 'HistoryDelta';
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
  private _mergedCommitsIds: Set<string>;
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
    this._mergedCommitsIds = new Set();
    this._operationInterpreter = operationInterpreter || defaultInterpreter;
    if (Array.isArray(entriesOrDoc)) {
      this._pushHistoryRecords(entriesOrDoc);
    } else {
      const initOp: Omit<
        HistoryRecordInitializeRecord<MapsInterface, U>,
        'commitId'
      > = {
        __typename: HistoryEntryType.OPERATION,
        previousCommitId: null,
        checkpoint: entriesOrDoc,
        changes: [],
        userId,
        when: new Date(),
        operation: {
          __typename: 'InitializeHistoryWithDocumentOperation',
          document: entriesOrDoc
        }
      };
      const commitId = commitIdOfOperation<MapsInterface, U>(initOp);
      this._pushHistoryRecords({...initOp, commitId});
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
    const operationRecord: Omit<
      HistoryOperationRecord<MapsInterface, U, Operation>,
      'commitId'
    > = {
      __typename: HistoryEntryType.OPERATION,
      operation,
      changes: mutableDoc.changes,
      previousCommitId: this.lastCommitId,
      userId,
      when: new Date(),
      checkpoint: mutableDoc.updatedDocument()
    };
    const commitId = commitIdOfOperation(operationRecord);
    this._pushHistoryRecords({...operationRecord, commitId});
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
  ): HistoryDelta<MapsInterface, U> => {
    const targetCommitId = toCommitId || this.lastCommitId;
    const fromIndex = this._historyEntries.findIndex(
      entry => entry.commitId === fromCommitId
    );
    if (fromIndex === -1) {
      throw new RangeError('fromCommitId not found');
    }
    const targetIndex = this._historyEntries.findIndex(
      entry => entry.commitId === targetCommitId
    );
    if (targetIndex === -1) {
      throw new RangeError('toCommitId not found');
    }
    if (fromIndex > targetIndex) {
      throw new RangeError(
        'The toCommitId happened earlier than the fromCommitId'
      );
    }
    return {
      __typename: 'HistoryDelta',
      fromCommitId,
      historyRecords: this._historyEntries.slice(fromIndex, targetIndex + 1)
    };
  };

  public mergeHistoryDelta = (
    historyDelta: HistoryDelta<MapsInterface, U>,
    userId?: Id
  ): INormalizedDocument<MapsInterface, U> => {
    /* Check if we can fast forward the delta passed through */
    if (this.lastCommitId === historyDelta.fromCommitId) {
      // We can fast forward, just add the entries from the
      // delta
      this._pushHistoryRecords(
        historyDelta.historyRecords as HistoryRecord<MapsInterface, U>[]
      );
      return this.documentAtCommitId();
    }

    if (!this.hasCommitId(historyDelta.fromCommitId)) {
      return this.documentAtCommitId();
    }
    const {mergeToTree, mergeFromTree, baseTree, nOperationsToApply} =
      this.generateMergeBranchDelta(historyDelta, this.lastCommitId);
    if (nOperationsToApply == 0) {
      return this.documentAtCommitId();
    }
    const {mergedDoc} = threeWayMerge(baseTree, mergeFromTree, mergeToTree);
    const changes = diff(mergeToTree, mergedDoc);
    const _mergeEntry: Omit<
      HistoryMergeRecord<MapsInterface, U>,
      'commitId'
    > = {
      __typename: HistoryEntryType.MERGE,
      userId: userId || null,
      when: new Date(),
      changes,
      previousCommitId: this.lastCommitId,
      checkpoint: mergedDoc,
      baseCommitId: historyDelta.fromCommitId,
      theirOperations: historyDelta.historyRecords as HistoryRecord<
        MapsInterface,
        U
      >[]
    };
    this._pushHistoryRecords({
      ..._mergeEntry,
      commitId: commitIdOfOperation(_mergeEntry)
    });
    return this.documentAtCommitId();
  };

  public redo = (
    userId?: Id | null
  ): INormalizedDocument<MapsInterface, U> => {};

  public undo = (
    userId?: Id | null
  ): INormalizedDocument<MapsInterface, U> => {};

  /**
   * When the timeline is asked to merge a branch delta, it may be
   * the case that portion of that delta was already merged beforehand
   * in the timeline.
   *
   * This function checks if this is the case. If it is it generates a new
   * delta that can be applied to the timeline, by modifying the provided delta
   * to the one that would have been generated if the remote party had known and
   * merged the existing merge.
   *
   * The function assumes that all history entries from and including
   * timeDelta.fromCommitId are included in the timeline history
   *
   * @param {ITimelineDelta} providedMergeDelta
   * @returns {ITimelineDelta}
   */
  private generateMergeBranchDelta = (
    providedMergeDelta: HistoryDelta<MapsInterface, U>,
    localToCommitId: string
  ): {
    baseTree: INormalizedDocument<MapsInterface, U>;
    mergeToTree: INormalizedDocument<MapsInterface, U>;
    mergeFromTree: INormalizedDocument<MapsInterface, U>;
    lastCommonCommitId: string;
    nOperationsToApply: number;
  } => {
    let lastCommonCommitId = providedMergeDelta.fromCommitId;
    let containsMergedOperation = false;
    const operationsToApply: HistoryRecord<MapsInterface, U>[] =
      providedMergeDelta.historyRecords.slice() as HistoryRecord<
        MapsInterface,
        U
      >[];
    for (const operation of providedMergeDelta.historyRecords) {
      if (!this.hasCommitId(operation.commitId)) {
        break;
      }
      operationsToApply.shift();
      if (this.mergedCommitIds.has(operation.commitId)) {
        containsMergedOperation = true;
      }
      lastCommonCommitId = operation.commitId;
    }
    if (
      lastCommonCommitId === providedMergeDelta.fromCommitId ||
      !containsMergedOperation
    ) {
      // There are no partially merged commits, we can apply
      // the delta provided
      const baseTree = this.documentAtCommitId(lastCommonCommitId);
      const mergeToTree = this.documentAtCommitId(localToCommitId);
      const mergeFromBranch = this.branch(
        lastCommonCommitId
      ) as HDocHistoryImpl<MapsInterface, U>;
      mergeFromBranch._pushHistoryRecords(operationsToApply);
      const mergeFromTree = mergeFromBranch.documentAtCommitId();
      return {
        baseTree,
        mergeFromTree,
        mergeToTree,
        lastCommonCommitId,
        nOperationsToApply: operationsToApply.length
      };
    }
    const remoteBranch = this.branch(
      providedMergeDelta.fromCommitId
    ) as HDocHistoryImpl<MapsInterface, U>;
    remoteBranch._pushHistoryRecords(
      providedMergeDelta.historyRecords as HistoryRecord<MapsInterface, U>[]
    );
    const baseTree = remoteBranch.documentAtCommitId(lastCommonCommitId);
    const mergeToTree = this.documentAtCommitId(localToCommitId);
    const mergeFromTree = remoteBranch.documentAtCommitId();
    return {
      baseTree,
      mergeToTree,
      mergeFromTree,
      lastCommonCommitId,
      nOperationsToApply: operationsToApply.length
    };
  };

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
      if (record.__typename === HistoryEntryType.MERGE) {
        this.processMergeOperation(record);
      }
    }
  };

  private processMergeOperation = (
    mergeOp: HistoryMergeRecord<MapsInterface, U>
  ) => {
    if (!(mergeOp && mergeOp.__typename === HistoryEntryType.MERGE)) {
      return;
    }
    for (const mergedOp of mergeOp.theirOperations) {
      this._mergedCommitsIds.add(mergedOp.commitId);
      if (mergedOp.__typename === HistoryEntryType.MERGE) {
        this.processMergeOperation(mergedOp);
      }
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
