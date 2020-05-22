import {ILazyMutableMap} from './LazyMap';

export type Id = number | string;

export interface IId {
  _id: Id;
}

export type KeysOfMappedTypes<T> = {
  [F in keyof T]: T[F] extends Map<Id, infer S> ? keyof S : never;
};

export type MappedParentedTypesFields<MapsInterface> = {
  [F in keyof MapsInterface]: MapsInterface[F] extends Map<Id, infer S>
    ? S extends IParentedId
      ? F
      : never
    : never;
}[keyof MapsInterface];

type MappedParentedTypes<
  MapsInterface,
  U extends keyof MapsInterface = keyof MapsInterface
> = {
  [F in U]: MapsInterface[F] extends Map<Id, infer S>
    ? S extends IParentedId<F, U>
      ? S
      : never
    : never;
};

export type ValueOf<T> = T[keyof T];

/**
 * Lists all the fields of all the types that are mapped in the
 * maps interface passed as parameter
 */
export type AllMappedTypesFields<T> = ValueOf<KeysOfMappedTypes<T>>;

/**
 * Lists all the types that are mapped in the Maps interface T.
 */
export type AllMappedTypes<T> = ValueOf<MappedParentedTypes<T>>;

export interface IParentedId<ElementType = any, ParentType = any>
  extends IId,
    Object {
  __typename: ElementType;
  parentId: null | Id;
  parentType: null | ParentType;
}

export type EntitiesMaps<
  MapsInterface,
  U extends keyof MapsInterface = keyof MapsInterface
> = {
  [F in U]: MapsInterface[F] extends Map<Id, infer S>
    ? S extends IParentedId<U, U>
      ? Map<Id, S>
      : never
    : never;
};
export type MutableEntitiesMaps<
  MapsInterface,
  U extends keyof MapsInterface = keyof MapsInterface
> = {
  [F in U]: MapsInterface[F] extends Map<Id, infer S>
    ? ILazyMutableMap<Id, S>
    : never;
};
/**
 * Each element in the path that from the root of the document
 * brings us to an element
 */
export type PathElement<MapsInterface> =
  | number
  | AllMappedTypesFields<MapsInterface>;
/**
 * The type of Path elements we can find within a normalized entity is more
 * constrained.
 */
export type SubEntityPathElement<MapsInterface> = [
  AllMappedTypesFields<MapsInterface>,
  number
];
/**
 * A path identifies uniquely an element within the hierarchical
 * document, or the fields withing an element.
 */
export type Path<MapsInterface> = PathElement<MapsInterface>[];

/**
 * A normalized document represents a tree like document made
 * up of linked entities.
 *
 * Entities refer to each other via Ids, and there is a root element
 * pointed to by element type and id.
 *
 * All the data in the document is captured via maps of Id, entities,
 * one map for each data type.
 */
export interface INormalizedDocument<
  MapsInterface,
  U extends keyof MapsInterface
> {
  /**
   * The schema that links the various entities to each other
   */
  readonly schema: IDocumentSchema<MapsInterface, U>;

  /**
   * The element type within the maps field that contains the root
   * element of the document
   */
  rootType: U;

  /**
   * The Id of the root element of the document, whose type is designated
   * by rootType
   */
  rootId: Id;

  /**
   * The maps field contains the internal normalised databse of the document.
   * One Map Id -> entity for each  element type in the document.
   */
  maps: EntitiesMaps<MapsInterface, U>;
}

export enum HDocCommandType {
  INSERT_ELEMENT = 'InsertElementChange',
  CHANGE_ELEMENT = 'ChangeElementChange',
  DELETE_ELEMENT = 'DeleteElementChange',
  MOVE_ELEMENT = 'MoveElementChange'
}

export interface IReplayableElementCommand<
  MapsInterface,
  U extends keyof MutableEntitiesMaps<MapsInterface> = keyof EntitiesMaps<
    MapsInterface
  >
> {
  __typename: HDocCommandType;
  targetElement?: {
    __typename: U;
    _id: Id;
  };
}

export interface IInsertElement<
  T extends IParentedId,
  MapsInterface,
  Mandatory extends keyof T = keyof T,
  U extends keyof EntitiesMaps<MapsInterface> = keyof EntitiesMaps<
    MapsInterface
  >
> extends IReplayableElementCommand<MapsInterface, U> {
  __typename: HDocCommandType.INSERT_ELEMENT;
  parentPath: Path<MapsInterface>;
  position: SubEntityPathElement<MapsInterface>;
  element: Omit<Pick<T, Mandatory>, '_id'> &
    Partial<Omit<T, '_id' & Mandatory>> & {
      _id?: Id;
    };
}

export interface IChangeElement<
  MapsInterface,
  T extends IParentedId,
  U extends keyof EntitiesMaps<MapsInterface> = keyof EntitiesMaps<
    MapsInterface
  >
> extends IReplayableElementCommand<MapsInterface, U> {
  __typename: HDocCommandType.CHANGE_ELEMENT;
  path: Path<MapsInterface>;
  changes: Pick<T, '__typename'> & Partial<Omit<T, '__typename'>>;
}

export interface IDeleteElement<
  MapsInterface,
  U extends keyof EntitiesMaps<MapsInterface> = keyof EntitiesMaps<
    MapsInterface
  >
> extends IReplayableElementCommand<MapsInterface, U> {
  __typename: HDocCommandType.DELETE_ELEMENT;
  path: Path<MapsInterface>;
}

export interface IMoveElement<
  MapsInterface,
  T extends IParentedId,
  U extends keyof EntitiesMaps<MapsInterface> = keyof EntitiesMaps<
    MapsInterface
  >
> extends IReplayableElementCommand<MapsInterface, U> {
  __typename: HDocCommandType.MOVE_ELEMENT;
  fromPath: Path<MapsInterface>;
  toParentPath: Path<MapsInterface>;
  toPosition: SubEntityPathElement<MapsInterface>;
  changes?: Pick<T, '__typename'> & Partial<Omit<T, '__typename'>>;
}

export type HDocOperation<
  MapsInterface,
  T extends IParentedId,
  U extends keyof EntitiesMaps<MapsInterface> = keyof EntitiesMaps<
    MapsInterface
  >
> =
  | IInsertElement<T, MapsInterface, any, U>
  | IChangeElement<MapsInterface, T, U>
  | IDeleteElement<MapsInterface, U>
  | IMoveElement<MapsInterface, T, U>;

// Schema related types
export interface IFieldEntityReference<T> {
  __schemaType: T;
  notNull?: boolean;
}

export type EntityReference<T> =
  | IFieldEntityReference<T>
  | [IFieldEntityReference<T>];

export type EntityReferences<T> = {
  [fieldName: string]: EntityReference<T>;
} & {
  parentId?: IFieldEntityReference<T>;
};

/**
 * The document schema describes the shape of a normalized document,
 * allowing navigating the hierarchy while using IDs between entities
 */
export type IDocumentSchema<
  MapsInterface,
  U extends keyof EntitiesMaps<MapsInterface> = keyof EntitiesMaps<
    MapsInterface
  >
> = {types: {[P in U]: EntityReferences<U>}} & {
  documentType: string;
  rootType: U;
};

/**
 * The same as a normalized document, with the only difference being
 * that the maps field now has Lazy maps instead pf Maps.
 */
export interface INormalizedMutableMapsDocument<
  MapsInterface,
  U extends keyof EntitiesMaps<MapsInterface> = keyof EntitiesMaps<
    MapsInterface
  >
> {
  /**
   * The schema that declares how elements are linked within
   * the document
   */
  readonly schema: IDocumentSchema<MapsInterface, U>;

  /**
   * The map of LazyMutableMap objects that contain a mutable version
   * of the internal document database
   */
  readonly maps: MutableEntitiesMaps<MapsInterface, U>;

  /**
   * As in the original document, we track the element type the root of
   * the document belongs to
   */
  readonly rootType: U;

  /**
   * Id of the root document of the document
   */
  readonly rootId: Id;
}

/**
 * A Replay changes document is a document that was generated from
 * a normalized document, and that can replay a list of the underlying
 * document changes with applyChanges.
 *
 * This interface is what can be extended to create domain speific operations,
 * that rely on the functions in IMutableDocument to track changes at a lower
 * level of abstraction.
 */
export interface IReplayChangesDocument<
  MapsInterface,
  U extends keyof EntitiesMaps<MapsInterface> = keyof EntitiesMaps<
    MapsInterface
  >,
  NDoc extends INormalizedDocument<MapsInterface, U> = INormalizedDocument<
    MapsInterface,
    U
  >
> extends INormalizedMutableMapsDocument<MapsInterface, U> {
  /**
   * Get a copy of the original document.
   */
  readonly originalDocument: NDoc;

  /**
   * Get a normalised version of Doc that reflects all the changes
   * operated on the mutable document.
   *
   * If no changes have been done, the original document is returned.
   *
   * @returns {NormalizedDocument<Doc, K, U>}
   */
  updatedDocument: () => NDoc;

  /**
   * List of the commands operated on this mutable document since
   * its instantiation for the original normalized document
   */
  readonly changes: HDocOperation<MapsInterface, any, U>[];

  /**
   * Applies a series of document changes to the document,
   * without doing checks about consistency because what we want is
   * to reproduce history.
   *
   * The function is meant to be used mostly by versioning functions that need
   * to move towards a desired final state and monitor how the tree changes while
   * getting there.
   *
   * @param {HDocOperation<ITimelineBar | ITimelineBarRow | IRootContext, ITimelineEntitiesMaps> | Array<HDocOperation<ITimelineBar | ITimelineBarRow | IRootContext, ITimelineEntitiesMaps>>} changes
   */
  applyChanges: (
    changes:
      | HDocOperation<MapsInterface, any, U>
      | Array<HDocOperation<MapsInterface, any, U>>
  ) => void;
}

/**
 * A Mutable document represents the mutable version of a normalized document,
 * that keeps track of what changed.
 *
 * The document can be changed only with four basic commands, and these are tracked
 * since the creation of the mutable version of the original document.
 *
 * It is also possible to obtain a NormalizedDocument back after the changes have happened.
 */
export interface IMutableDocument<
  MapsInterface,
  U extends keyof EntitiesMaps<MapsInterface> = keyof EntitiesMaps<
    MapsInterface
  >,
  NDoc extends INormalizedDocument<MapsInterface, U> = INormalizedDocument<
    MapsInterface,
    U
  >
> extends IReplayChangesDocument<MapsInterface, U, NDoc> {
  /**
   * Inserts an element within the document, providing path to the parent
   * and position within the parent (field or field + index)
   *
   * @param {IInsertElement<ElementType, Doc, U>} insertCommand
   */
  insertElement: <T extends IParentedId, Mandatory extends keyof T = keyof T>(
    insertCommand: IInsertElement<T, MapsInterface, Mandatory, U>
  ) => T;

  /**
   * Provided a path to an element in the document, deletes
   * the document from within the document
   *
   * @param {IDeleteElement<Doc, U>} deleteCommand
   */
  deleteElement: (deleteCommand: IDeleteElement<MapsInterface, U>) => void;

  /**
   * Provided a path to an element, merge the existing element
   * with the new values provided with the parameter
   *
   * @param {IChangeElement<ElementType, Doc, U>} changeCommand
   */
  changeElement: <T extends IParentedId>(
    changeCommand: IChangeElement<MapsInterface, T, U>
  ) => void;

  /**
   * Provided the path to an element, moves it to a new parent
   * and position withing the document. Optionally you can also change
   * the values of the element being moved at the same time.
   * @param {IMoveElement<ElementType, Doc, U>} moveCommand
   */
  moveElement: <T extends IParentedId>(
    moveCommand: IMoveElement<MapsInterface, T, U>
  ) => void;

  pathForElementWithId: (
    elementTypeMap: U,
    elementId: Id
  ) => Path<MapsInterface>;

  /**
   * Given a path, it returns the type of element and element id that
   * corresponds to the path, if any.
   *
   * If the root context is provided null is returned.
   *
   * If the path does not point to an element or the root context, an error
   * is returned.
   *
   * @param {Path} path
   * @returns {{_id: Id; type: U}}
   */
  idAndTypeForPath: (path: Path<MapsInterface>) => {_id: Id; __typename: U};
}

export enum DocumentVisitTraversal {
  BREADTH_FIRST = 'breadth_first',
  DEPTH_FIRST = 'depth_first'
}

/**
 * The status of merging two versions of a value, element
 * or element position
 */
export enum MergeStatus {
  /**
   * The conflict has a provisional merge value, but needs intervention from
   * a human
   * @type {string}
   */
  open = 'open',

  /**
   * A conflict has been automatically resolved, but can be reviewed
   * by a human to potentially change the resolution value
   * @type {string}
   */
  autoMerged = 'autoMerged',

  /**
   * A resolved conflict has been selected by a human among the
   * potential options (or a completely different option)
   *
   * @type {string}
   */
  resolved = 'resolved'
}

/**
 * A conflicted value represents a field value of an element
 * which can have one of a number of values, generated on
 * different versions of the same document.
 */
export interface IValueConflict<T> {
  /**
   * The base value is the value before the changes in
   * that generated the list of conflicted values.
   */
  baseValue: T;

  /**
   * Each potential value the field could assume
   */
  conflictValues: T[];

  /**
   * The (provisional) value
   */
  mergedValue: T;

  /**
   * The current status of the conflict
   */
  mergeStatus: MergeStatus;
}

/**
 * Represents a conflict where an element present in the base document
 * has been moved to two incompatible positions in the two later versions
 * of a three-way merge.
 *
 * This type of conflict is usually marked as autoMerged, and it's
 * offered as an explanation to humans of what has happened so they
 * can perfect the merge if so wished.
 */
export interface IPositionConflict<MapsInterface> {
  /**
   * Ids of all the copies of the element in the merged tree
   * (usually one)
   */
  clonedElements: Id[];

  /**
   * The status of this conflict.
   */
  mergeStatus: MergeStatus;
}

/**
 * A record of the conflicts for an element of type
 * S. Fields are present only for those fields that are
 * in conflict.
 */
export type ElementInfoConflicts<S> = {
  [F in keyof S]?: IValueConflict<S[F]>;
};

export interface IElementConflicts<MapsInterface, S> {
  infoConflicts?: ElementInfoConflicts<S>;
  positionConflicts?: IPositionConflict<MapsInterface>;
}

/**
 * For each mapped element, creates a map Id -> ElementConflicts record.
 * Additional data structure that models conflicts resulting from merging
 * different branches of a document.
 */
export type ConflictsMap<
  MapsInterface,
  U extends keyof MapsInterface = keyof MapsInterface
> = {
  [F in keyof MapsInterface]: Map<
    Id,
    IElementConflicts<MapsInterface, MapsInterface[F]>
  >;
};

/**
 * Visitor interface for a visitor pattern that
 * visits a HDocument in breadth first format from the
 * document root.
 */
export interface IVisitor<
  MapsInterface,
  U extends keyof MapsInterface = keyof MapsInterface,
  Context extends any = any
> {
  (
    doc:
      | INormalizedDocument<MapsInterface, U>
      | INormalizedMutableMapsDocument<MapsInterface, U>,
    nodeType: U,
    nodeId: Id,
    context: Context
  ): void;
}

/**
 * Represents the results returned from a 3-way merge of a HDocument.
 *
 * It includes a working version of the document, and a map of the conflicts
 * the merge generated, if any.
 */
export interface II3MergeResult<MapsInterface, U extends keyof MapsInterface> {
  mergedDoc: INormalizedDocument<MapsInterface, U>;
  conflicts: ConflictsMap<MapsInterface, U>;
  delta: Array<HDocOperation<MapsInterface, AllMappedTypes<MapsInterface>, U>>;
}
