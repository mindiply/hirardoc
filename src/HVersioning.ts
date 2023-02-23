import jsSHA from 'jssha';
import {omit} from 'lodash';
import {
  HDocOperation,
  Id,
  IMutableDocument,
  INormalizedDocument,
  ThreeWayMergeFn
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
  U extends keyof MapsInterface,
  Checkpoint
> {
  __typename: HistoryEntryType;
  commitId: string;
  previousCommitId: string | null;
  changes: Array<HDocOperation<MapsInterface, U>>;
  userId: Id | null;
  when: Date;
  checkpoint?: Checkpoint;
}

/**
 * A history operation record represents the fact that one or more operations changed the hierarchical
 * document. It documents the operation(s) run, and a list of the changes that brought the
 * document from the previousCommitId to the one after the operation was run.
 */
export interface HistoryOperationRecord<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint,
  Operation
> extends BaseHistoryRecord<MapsInterface, U, Checkpoint> {
  __typename: HistoryEntryType.OPERATION;
  operation: Operation | Operation[];
}

export interface InitializeHistoryWithDocumentOperation<Checkpoint> {
  __typename: 'InitializeHistoryWithDocumentOperation';
  document: Checkpoint;
}

export type HistoryRecordInitializeRecord<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> = HistoryOperationRecord<
  MapsInterface,
  U,
  Checkpoint,
  InitializeHistoryWithDocumentOperation<Checkpoint>
>;

/**
 * An undo record expresses the fact that the user decided to undo
 * one or more commands, and the timeline tree was reset to what it
 * was at commit undoneToCommitId.
 */
export interface HistoryUndoRecord<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> extends BaseHistoryRecord<MapsInterface, U, Checkpoint> {
  __typename: HistoryEntryType.UNDO;
  undoneToCommitId: string;
}

/**
 * A Redo record represents the fact that we want to redo undone commands.
 * It points to the commitId we redid, and to the undo history record
 * that was redone.
 */
export interface HistoryRedoRecord<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> extends BaseHistoryRecord<MapsInterface, U, Checkpoint> {
  __typename: HistoryEntryType.REDO;
  undoCommitId: string;
  reverseToCommitId: string;
}

export interface HistoryMergeRecord<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> extends BaseHistoryRecord<MapsInterface, U, Checkpoint> {
  __typename: HistoryEntryType.MERGE;
  baseCommitId: string;
  theirOperations: Array<
    | HistoryOperationRecord<MapsInterface, U, Checkpoint, any>
    | HistoryUndoRecord<MapsInterface, U, Checkpoint>
    | HistoryRedoRecord<MapsInterface, U, Checkpoint>
    | HistoryMergeRecord<MapsInterface, U, Checkpoint>
  >;
}

export type HistoryRecord<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> =
  | HistoryOperationRecord<MapsInterface, U, Checkpoint, any>
  | HistoryUndoRecord<MapsInterface, U, Checkpoint>
  | HistoryRedoRecord<MapsInterface, U, Checkpoint>
  | HistoryMergeRecord<MapsInterface, U, Checkpoint>;

function commitIdOfOperation<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
>(
  operation: Omit<HistoryRecord<MapsInterface, U, Checkpoint>, 'commitId'>
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

export function defaultInterpreter<
  MapsInterface,
  U extends keyof MapsInterface
>(
  mutableDoc: IMutableDocument<MapsInterface, U>,
  operation: HDocOperation<MapsInterface, U> | HDocOperation<MapsInterface, U>[]
) {
  mutableDoc.applyChanges(operation);
}

/**
 * A history delta can be exchanged between HDocHistory objects of the same document
 * to perform reconciliations of separate diverging versions of the document.
 */
export interface HistoryDelta<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> {
  __typename: 'HistoryDelta';
  fromCommitId: string;
  historyRecords: Array<
    Omit<HistoryRecord<MapsInterface, U, Checkpoint>, 'checkpoint'>
  >;
}

/**
 * A normalized document history needs some basic options, unique to the type of
 * normalized document, in order to operate.
 *
 * This interface includes those options.
 */
export interface HDocHistoryOptions<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> {
  operationInterpreter: OperationInterpreter<MapsInterface, U>;
  defaultUserId: Id;
  hDocCheckpointTranslator: HDocCheckpointTranslator<
    MapsInterface,
    U,
    Checkpoint
  >;
  mergeFn: ThreeWayMergeFn<MapsInterface, U>;
}

/**
 * Minimal interface of a hierarchical document history.
 *
 * It includes only basic operations, no merge, no branching, just add changes
 * sequentially.
 *
 * Minimal interface that can be implemented by library clients for their
 * specialized purposes - like a db backed version, or perhaps a history automatically
 * synchronizing with a remote backend.
 */
export interface HBaseDocHistory<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> {
  readonly hDocHistoryOptions: HDocHistoryOptions<MapsInterface, U, Checkpoint>;

  /**
   * Allows to check if the commitId is among those stored in the HDocHistory.
   * @param commitId
   */
  hasCommitId: (commitId: string) => boolean;

  /**
   * Returns the history record with the provided commitId, or null if it's not
   * found in the history.
   *
   * @param {string} commitId
   * @returns {HistoryRecord<MapsInterface, U> | null}
   */
  getCommitIdRecord: (
    commitId: string
  ) => HistoryRecord<MapsInterface, U, Checkpoint> | null;

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
  readonly historyEntries: Array<HistoryRecord<MapsInterface, U, Checkpoint>>;

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
   * If the last historyEntry that changed the document was an undo command, it will redo
   * the command that the undo undid.
   * @param userId
   */
  redo: (userId: Id | null) => INormalizedDocument<MapsInterface, U>;

  /**
   * Returns true if there is at least an undo we can currently redo at the tip
   * of the history.
   *
   * @returns {boolean}
   */
  canRedo: () => boolean;

  /**
   * If the last historyEntry that changed the document, which was not and undo, is not the first record in the historyRecord,
   * it will undo the changes of that record and record here what the state was before that change.
   * @param userId
   */
  undo: (userId: Id | null) => INormalizedDocument<MapsInterface, U>;

  /**
   * Returns true if we can undo at least one operation in the current timeline
   * history. It may be false if we have already undone all of the history
   * records.
   *
   * @returns {boolean}
   */
  canUndo: () => boolean;

  /**
   * Returns the hierarchical document at the requested commitId. If no commitId is provided,
   * returns the document as of the lastCommitId.
   * @param commitId
   */
  documentAtCommitId: (
    commitId?: string
  ) => INormalizedDocument<MapsInterface, U>;
}

/**
 * Interface of an object that maintains the history of a document, allowing to modifying it
 * and merging changes from other sources.
 *
 * The interface makes no promises that copies contain full history of the document or that they will
 * be able to merge each other changes, it depends on the calling code if that can happen or not.
 */
export interface HDocHistory<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint,
  Operation = any
> extends HBaseDocHistory<MapsInterface, U, Checkpoint> {
  /**
   * Creates a new [HDocHistory] that goes from the first historyEntry up to and including
   * toCommitId. If toCommitId is not provided, it will use lastCommitId.
   * @param toCommitId
   */
  branch: (
    toCommitId?: string
  ) => HDocHistory<MapsInterface, U, Checkpoint, Operation>;

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
  ) => HistoryDelta<MapsInterface, U, Checkpoint>;

  /**
   *
   * @param historyDelta
   * @param userId
   */
  mergeHistoryDelta: (
    historyDelta: HistoryDelta<MapsInterface, U, Checkpoint>,
    userId: Id
  ) => INormalizedDocument<MapsInterface, U>;
}

export interface HDocCheckpointTranslator<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
> {
  hDocToCheckpoint: (doc: INormalizedDocument<MapsInterface, U>) => Checkpoint;
  checkpointToHDoc: (
    checkpoint: Checkpoint
  ) => INormalizedDocument<MapsInterface, U>;
}

class HDocHistoryImpl<MapsInterface, U extends keyof MapsInterface, Checkpoint>
  implements HDocHistory<MapsInterface, U, Checkpoint, any>
{
  private _hDocHistoryOptions: HDocHistoryOptions<MapsInterface, U, Checkpoint>;
  private _commitIdsIndexMap: Map<string, number>;
  private _mergedCommitsIds: Set<string>;
  private _historyEntries: HistoryRecord<MapsInterface, U, Checkpoint>[];
  private readonly _maxOpsWithoutCheckpoint: number;

  constructor(
    entriesOrDoc:
      | INormalizedDocument<MapsInterface, U>
      | HistoryRecord<MapsInterface, U, Checkpoint>[],
    initProps: Partial<HDocHistoryOptions<MapsInterface, U, Checkpoint>> = {}
  ) {
    this._hDocHistoryOptions = {
      defaultUserId: initProps.defaultUserId || 'NOTSET',
      // @ts-expect-error this being a serializer is an implementation matter
      hDocCheckpointTranslator: initProps.hDocCheckpointTranslator || this,
      mergeFn: initProps.mergeFn || threeWayMerge,
      operationInterpreter: initProps.operationInterpreter || defaultInterpreter
    };
    this._historyEntries = [];
    this._commitIdsIndexMap = new Map();
    this._mergedCommitsIds = new Set();
    this._maxOpsWithoutCheckpoint = 20;
    if (Array.isArray(entriesOrDoc)) {
      this._pushHistoryRecords(entriesOrDoc);
    } else {
      const checkpoint =
        this._hDocHistoryOptions.hDocCheckpointTranslator.hDocToCheckpoint(
          entriesOrDoc
        );
      const initOp: Omit<
        HistoryRecordInitializeRecord<MapsInterface, U, Checkpoint>,
        'commitId'
      > = {
        __typename: HistoryEntryType.OPERATION,
        previousCommitId: null,
        checkpoint,
        changes: [],
        userId: this._hDocHistoryOptions.defaultUserId,
        when: new Date(),
        operation: {
          __typename: 'InitializeHistoryWithDocumentOperation',
          document: checkpoint
        }
      };
      const commitId = commitIdOfOperation<MapsInterface, U, Checkpoint>(
        initOp
      );
      this._pushHistoryRecords({...initOp, commitId});
    }
  }

  public get hDocHistoryOptions() {
    return this._hDocHistoryOptions;
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

  public getCommitIdRecord = (commitId: string) => {
    const entryIndex = this._commitIdsIndexMap.get(commitId);
    if (typeof entryIndex === 'number') {
      if (entryIndex >= 0 && entryIndex < this._historyEntries.length) {
        return this._historyEntries[entryIndex];
      }
    }
    return null;
  };

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
    const checkpointDoc =
      this.hDocHistoryOptions.hDocCheckpointTranslator.checkpointToHDoc(
        this._historyEntries[checkpointIndex].checkpoint!
      );
    if (targetCommitIndex === checkpointIndex) {
      return checkpointDoc;
    }
    const mutableDoc = mutableDocument(checkpointDoc);
    for (let i = checkpointIndex + 1; i < this._historyEntries.length; i++) {
      mutableDoc.applyChanges(this._historyEntries[i].changes);
    }
    return mutableDoc.updatedDocument();
  };

  public commit = <Operation>(
    operation: Operation | Operation[],
    userId: Id | null = null
  ): INormalizedDocument<MapsInterface, U> => {
    const mutableDoc = mutableDocument(
      this.documentAtCommitId()
    ) as unknown as IMutableDocument<MapsInterface, U>;
    const operations = Array.isArray(operation) ? operation : [operation];
    for (const op of operations) {
      this._hDocHistoryOptions.operationInterpreter(mutableDoc, op);
    }
    const operationRecord: Omit<
      HistoryOperationRecord<MapsInterface, U, Checkpoint, Operation>,
      'commitId'
    > = {
      __typename: HistoryEntryType.OPERATION,
      operation,
      changes: mutableDoc.changes,
      previousCommitId: this.lastCommitId,
      userId,
      when: new Date()
    };
    const updatedDocument = mutableDoc.updatedDocument();
    if (this.nOpsSinceLastCheckpoint() >= this._maxOpsWithoutCheckpoint) {
      operationRecord.checkpoint =
        this.hDocHistoryOptions.hDocCheckpointTranslator.hDocToCheckpoint(
          updatedDocument
        );
    }
    const commitId = commitIdOfOperation(operationRecord);
    this._pushHistoryRecords({...operationRecord, commitId});
    return updatedDocument;
  };

  public branch = (
    fromCommitId?: string
  ): HDocHistory<MapsInterface, U, Checkpoint> => {
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
  ): HistoryDelta<MapsInterface, U, Checkpoint> => {
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
    historyDelta: HistoryDelta<MapsInterface, U, Checkpoint>,
    userId?: Id
  ): INormalizedDocument<MapsInterface, U> => {
    /* Check if we can fast forward the delta passed through */
    if (this.lastCommitId === historyDelta.fromCommitId) {
      // We can fast forward, just add the entries from the
      // delta
      this._pushHistoryRecords(
        historyDelta.historyRecords as HistoryRecord<
          MapsInterface,
          U,
          Checkpoint
        >[]
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
    const {mergedDoc} = this._hDocHistoryOptions.mergeFn(
      baseTree,
      mergeFromTree,
      mergeToTree
    );
    const changes = diff(mergeToTree, mergedDoc);
    const _mergeEntry: Omit<
      HistoryMergeRecord<MapsInterface, U, Checkpoint>,
      'commitId'
    > = {
      __typename: HistoryEntryType.MERGE,
      userId: userId || null,
      when: new Date(),
      changes,
      previousCommitId: this.lastCommitId,
      baseCommitId: historyDelta.fromCommitId,
      theirOperations: historyDelta.historyRecords as HistoryRecord<
        MapsInterface,
        U,
        Checkpoint
      >[]
    };
    if (this.nOpsSinceLastCheckpoint() >= this._maxOpsWithoutCheckpoint) {
      _mergeEntry.checkpoint =
        this.hDocHistoryOptions.hDocCheckpointTranslator.hDocToCheckpoint(
          mergedDoc
        );
    }
    this._pushHistoryRecords({
      ..._mergeEntry,
      commitId: commitIdOfOperation(_mergeEntry)
    });
    return this.documentAtCommitId();
  };

  public canRedo = () => {
    return this.prevUndoCommitIdOf(this.lastCommitId) !== null;
  };

  public redo = (userId: Id | null): INormalizedDocument<MapsInterface, U> => {
    const tipCommitId = this.lastCommitId;
    if (!tipCommitId) {
      return this.documentAtCommitId();
    }
    const undoCommitIdToRedo = this.prevUndoCommitIdOf(tipCommitId);
    if (!undoCommitIdToRedo) {
      return this.documentAtCommitId();
    }
    const undoEntry = this.getCommitIdRecord(undoCommitIdToRedo);
    if (undoEntry && undoEntry.__typename === HistoryEntryType.UNDO) {
      const redoToCommitId = this.nextCommitIdOf(undoEntry.undoneToCommitId);
      if (redoToCommitId) {
        const redoneTree = this.documentAtCommitId(redoToCommitId);
        const undoneTree = this.documentAtCommitId(undoEntry.undoneToCommitId);
        const redoCmd: Omit<
          HistoryRedoRecord<MapsInterface, U, Checkpoint>,
          'commitId'
        > = {
          __typename: HistoryEntryType.REDO,
          undoCommitId: undoEntry.commitId,
          reverseToCommitId: redoToCommitId,
          when: new Date(),
          userId,
          previousCommitId:
            this._historyEntries[this._historyEntries.length - 1].commitId,
          changes: diff(undoneTree, redoneTree)
        };
        if (this.nOpsSinceLastCheckpoint() >= this._maxOpsWithoutCheckpoint) {
          redoCmd.checkpoint =
            this.hDocHistoryOptions.hDocCheckpointTranslator.hDocToCheckpoint(
              redoneTree
            );
        }
        this._pushHistoryRecords({
          ...redoCmd,
          commitId: commitIdOfOperation(redoCmd)
        });
        return redoneTree;
      }
    }
    return this.documentAtCommitId();
  };

  public canUndo = () => this.nextCommitIdToUndoTo(this.lastCommitId) !== null;

  public undo = (userId: Id | null): INormalizedDocument<MapsInterface, U> => {
    const tipCommitId = this.lastCommitId;
    if (!tipCommitId) {
      return this.documentAtCommitId();
    }
    const targetCommitId = this.nextCommitIdToUndoTo(tipCommitId);
    if (targetCommitId) {
      const undoneTree = this.documentAtCommitId(targetCommitId);
      const currentTree = this.documentAtCommitId();

      const undoCmd: Omit<
        HistoryUndoRecord<MapsInterface, U, Checkpoint>,
        'commitId'
      > = {
        __typename: HistoryEntryType.UNDO,
        undoneToCommitId: targetCommitId,
        changes: diff(currentTree, undoneTree),
        userId,
        previousCommitId:
          this._historyEntries[this._historyEntries.length - 1].commitId,
        when: new Date()
      };
      if (this.nOpsSinceLastCheckpoint() >= this._maxOpsWithoutCheckpoint) {
        undoCmd.checkpoint =
          this.hDocHistoryOptions.hDocCheckpointTranslator.hDocToCheckpoint(
            undoneTree
          );
      }
      this._pushHistoryRecords({
        ...undoCmd,
        commitId: commitIdOfOperation(undoCmd)
      });
      return undoneTree;
    }
    return this.documentAtCommitId();
  };

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
    providedMergeDelta: HistoryDelta<MapsInterface, U, Checkpoint>,
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
    const operationsToApply: HistoryRecord<MapsInterface, U, Checkpoint>[] =
      providedMergeDelta.historyRecords.slice() as HistoryRecord<
        MapsInterface,
        U,
        Checkpoint
      >[];
    for (const operation of providedMergeDelta.historyRecords) {
      if (!this.hasCommitId(operation.commitId)) {
        break;
      }
      operationsToApply.shift();
      if (this._mergedCommitsIds.has(operation.commitId)) {
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
      ) as HDocHistoryImpl<MapsInterface, U, Checkpoint>;
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
    ) as HDocHistoryImpl<MapsInterface, U, Checkpoint>;
    remoteBranch._pushHistoryRecords(
      providedMergeDelta.historyRecords as HistoryRecord<
        MapsInterface,
        U,
        Checkpoint
      >[]
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
      | HistoryRecord<MapsInterface, U, Checkpoint>
      | HistoryRecord<MapsInterface, U, Checkpoint>[]
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
    mergeOp: HistoryMergeRecord<MapsInterface, U, Checkpoint>
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
      | HistoryRecord<MapsInterface, U, Checkpoint>
      | HistoryRecord<MapsInterface, U, Checkpoint>[]
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

  /**
   * Navigates backwards the timeline history passed as input for
   * the undo commitId that the next redo operation can redo, if any.
   *
   * If not such undo history entry exists, returns null.
   *
   * @param {ITimelineHistory} history
   * @param {string} fromCommitId
   * @returns {string | null}
   */
  private prevUndoCommitIdOf = (fromCommitId: string): string | null => {
    const entry = this.getCommitIdRecord(fromCommitId);
    if (entry) {
      if (entry.__typename === HistoryEntryType.UNDO) {
        return entry.commitId;
      } else if (entry.__typename === HistoryEntryType.REDO) {
        const undoneEntry = this.getCommitIdRecord(entry.undoCommitId);
        if (undoneEntry && undoneEntry.previousCommitId) {
          return this.prevUndoCommitIdOf(undoneEntry.previousCommitId);
        }
      }
    }
    return null;
  };

  /**
   * Returns the commitId of the operation's status we should return to with an undo,
   * if undo was to be applied to the timeline history passed as parameter, starting at
   * the commitId provided.
   *
   * Returns null if there is nothing to undo.
   *
   * @param {ITimelineHistory} history
   * @param {string} fromCommitId
   * @returns {string | null}
   */
  private nextCommitIdToUndoTo = (fromCommitId: string): string | null => {
    const entry = this.getCommitIdRecord(fromCommitId);
    if (entry) {
      if (entry.__typename !== HistoryEntryType.UNDO) {
        return entry.previousCommitId &&
          this.hasCommitId(entry.previousCommitId)
          ? entry.previousCommitId
          : null;
      } else {
        return this.nextCommitIdToUndoTo(entry.undoneToCommitId);
      }
    }
    return null;
  };

  private nOpsSinceLastCheckpoint = () => {
    for (let i = 0; i < this.historyEntries.length; i++) {
      const index = this.historyEntries.length - 1 - i;
      if (this.historyEntries[index].checkpoint) {
        return i;
      }
    }
    return this._maxOpsWithoutCheckpoint;
  };

  private hDocToCheckpoint = (doc: INormalizedDocument<MapsInterface, U>) =>
    doc as unknown as Checkpoint;

  private checkpointToHDoc = (checkpoint: Checkpoint) =>
    checkpoint as unknown as INormalizedDocument<MapsInterface, U>;

  public cloneHDocHistory() {
    return new HDocHistoryImpl(this._historyEntries, this.hDocHistoryOptions);
  }
}

export function initHDocHistory<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
>(
  documentOrHistoryRecords:
    | INormalizedDocument<MapsInterface, U>
    | HistoryRecord<MapsInterface, U, Checkpoint>[],
  options: HDocHistoryOptions<MapsInterface, U, Checkpoint>
): HDocHistory<MapsInterface, U, Checkpoint> {
  return new HDocHistoryImpl(documentOrHistoryRecords, options);
}

export function cloneHDocHistory<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
>(
  history: HDocHistory<MapsInterface, U, Checkpoint>
): HDocHistory<MapsInterface, U, Checkpoint> {
  if (history instanceof HDocHistoryImpl) {
    return history.cloneHDocHistory();
  } else {
    return new HDocHistoryImpl(history.historyEntries);
  }
}

export function lastCommonCommitId<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
>(
  originHistory: HDocHistory<MapsInterface, U, Checkpoint>,
  localHistory: HDocHistory<MapsInterface, U, Checkpoint>
): string | null {
  let lastCommonCommitId: string | null = null;
  for (
    let i = 0;
    i < localHistory.historyEntries.length &&
    originHistory.hasCommitId(localHistory.historyEntries[i].commitId);
    i++
  ) {
    lastCommonCommitId = localHistory.historyEntries[i].commitId;
  }
  return lastCommonCommitId;
}

export function pullOriginChangesIntoLocalHistory<
  MapsInterface,
  U extends keyof MapsInterface,
  Checkpoint
>(
  originHistory: HDocHistory<MapsInterface, U, Checkpoint>,
  localHistory: HDocHistory<MapsInterface, U, Checkpoint>
) {
  const fromCommitId = lastCommonCommitId(originHistory, localHistory);
  if (!fromCommitId) {
    throw new RangeError(
      'No common commit Id between the two document histories'
    );
  }
  const originDelta = originHistory.generateHistoryDelta(fromCommitId);
  if (!(originDelta && originDelta.historyRecords.length > 0)) {
    return localHistory;
  }
  const localDelta = localHistory.generateHistoryDelta(fromCommitId);
  if (localDelta && localDelta.historyRecords.length > 0) {
    // We do need to merge the changes since the last common commit into origin
    const newLocalHistory = initHDocHistory(
      originHistory.historyEntries,
      originHistory.hDocHistoryOptions
    );
    newLocalHistory.mergeHistoryDelta(
      localDelta,
      localDelta.historyRecords[localDelta.historyRecords.length - 1].userId ||
        'NOTSET'
    );
    return newLocalHistory;
  } else {
    // We can replace the local history with the origin one, everything is already in it
    return initHDocHistory(
      originHistory.historyEntries,
      originHistory.hDocHistoryOptions
    );
  }
}
