export type Id = number | string;

export interface IId {
  _id: Id;
}

export interface ElementId<U> extends IId {
  __typename: U;
}

export enum LinkType {
  single,
  array,
  set
}
export type SingleLink<LinkedTypename> = ElementId<LinkedTypename> | null;

export type LinksArray<LinkedTypename> = ElementId<LinkedTypename>[];

/**
 * A linksSet represents a parent to multiple children link where
 * the order between links is not important, the existence of it is
 */
export type LinksSet<LinkedTypename> = Map<string, ElementId<LinkedTypename>>;

export type NodeLink<LinkedTypename> =
  | SingleLink<LinkedTypename>
  | LinksSet<LinkedTypename>
  | LinksArray<LinkedTypename>;

export interface ParentToChildLinkField<ParentType, ParentField>
  extends ElementId<ParentType> {
  parentField: ParentField;
  index?: number;
}

export interface TreeNode<
  NodesDef extends Record<keyof NodesDef, TreeNode<any, any, any, any, any>>,
  NodeType extends keyof NodesDef,
  NodeData,
  ChildrenFields extends Record<any, NodeLink<keyof NodesDef>>,
  LinksFields extends Record<any, NodeLink<keyof NodesDef>>
> extends ElementId<NodeType> {
  data: NodeData;
  children: ChildrenFields;
  links?: LinksFields;
  parent: null | ParentToChildLinkField<
    keyof NodesDef,
    keyof NodeChildrenOfTreeNode<NodesDef, keyof NodesDef>
  >;
}

export type CompactTreeNode<
  NodesDef extends Record<keyof NodesDef, TreeNode<any, any, any, any, any>>,
  NodeType extends keyof NodesDef,
  NodeData,
  ChildrenFields extends Record<any, NodeLink<keyof NodesDef>>,
  LinksFields extends Record<any, NodeLink<keyof NodesDef>>
> = ElementId<NodeType> &
  NodeData &
  ChildrenFields &
  LinksFields & {
    parent: null | ParentToChildLinkField<
      keyof NodesDef,
      keyof NodeChildrenOfTreeNode<NodesDef, keyof NodesDef>
    >;
  };

export type NodeDataOfTreeNode<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  N extends keyof NodesDef
> = NodesDef[N] extends TreeNode<NodesDef, N, infer NodeData, any, any>
  ? NodeData
  : never;

export type NodeChildrenOfTreeNode<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  N extends keyof NodesDef
> = NodesDef[N] extends TreeNode<NodesDef, N, any, infer ChildrenFields, any>
  ? ChildrenFields
  : never;

export type NodeLinksOfTreeNode<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  N extends keyof NodesDef
> = NodesDef[N] extends TreeNode<NodesDef, N, any, any, infer LinksFields>
  ? LinksFields
  : never;

type ChildrenLinkTypes<ChildrenDef extends Record<any, any>> = {
  [LinkName in keyof ChildrenDef]: ChildrenDef[LinkName] extends NodeLink<any>
    ? LinkType
    : never;
};

type LinksTypes<LinksDef extends Record<any, NodeLink<any>>> = {
  [LinkName in keyof LinksDef]: LinksDef[LinkName] extends NodeLink<any>
    ? LinkType
    : never;
};

export interface TreeNodeSchema<
  NodesDef extends Record<keyof NodesDef, TreeNode<any, any, any, any, any>>,
  NodeType extends keyof NodesDef,
  NodeData,
  ChildrenFields extends Record<any, NodeLink<keyof NodesDef>>,
  LinksFields extends Record<any, NodeLink<keyof NodesDef>>
> {
  __typename: NodeType;
  data: () => NodeData;
  children: ChildrenLinkTypes<ChildrenFields>;
  links?: LinksTypes<LinksFields>;
}

export type SchemaTreeNodes<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >
> = {
  [T in keyof NodesDef]: TreeNodeSchema<
    NodesDef,
    T,
    NodeDataOfTreeNode<NodesDef, T>,
    NodeChildrenOfTreeNode<NodesDef, T>,
    NodeLinksOfTreeNode<NodesDef, T>
  >;
};

export type AllChildrenFields<NodeDef> = NodeDef extends TreeNode<
  any,
  any,
  any,
  infer ChildrenDef,
  any
>
  ? keyof ChildrenDef
  : never;

/**
 * A normalized document represents a tree like document made
 * up of linked entities.
 *
 * Entities refer to each other via Ids, and there is a root element
 * pointed to by element type and id.
 *
 */
export interface NormalizedDocument<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef = keyof NodesDef
> {
  readonly schema: DocumentSchema<NodesDef, R>;

  [Symbol.iterator](): IterableIterator<NodesDef[keyof NodesDef]>;

  rootId: ElementId<R>;

  /**
   * Given a type of element and its id, it returns the path
   * the node has in the document.
   *
   * @param elementTypeMap
   * @param elementId
   */
  pathForElementWithId: (
    elementTypeMap: keyof NodesDef,
    elementId: Id
  ) => Path<NodesDef>;

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
  idAndTypeForPath: (path: Path<NodesDef>) => ElementId<keyof NodesDef>;

  getNode: <Type extends keyof NodesDef>(
    nodeIId: ElementId<Type>
  ) => NodesDef[Type] | null;

  emptyNode: <Type extends keyof NodesDef>(
    nodeType: Type,
    nodeId?: Id
  ) => NodesDef[Type];
}

export interface SetPathElement<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  ParentType extends keyof NodesDef = keyof NodesDef
> {
  field: AllChildrenFields<NodesDef[ParentType]>;
  nodeType: keyof NodesDef;
  nodeId: Id;
}

export interface ArrayPathElement<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  ParentType extends keyof NodesDef = keyof NodesDef
> {
  field: AllChildrenFields<NodesDef[ParentType]>;
  index: number;
}

/**
 * Each element in the path that from the root of the document
 * brings us to an element
 */
export type PathElement<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  ParentType extends keyof NodesDef = keyof NodesDef
> =
  | AllChildrenFields<NodesDef[ParentType]>
  | SetPathElement<NodesDef, ParentType>
  | ArrayPathElement<NodesDef, ParentType>;

export type Path<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >
> = PathElement<NodesDef>[];
export enum HDocCommandType {
  INSERT_ELEMENT = 'InsertElementChange',
  CHANGE_ELEMENT = 'ChangeElementChange',
  DELETE_ELEMENT = 'DeleteElementChange',
  MOVE_ELEMENT = 'MoveElementChange'
}

export type NewNodeInfo<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  ChildTypename extends keyof NodesDef
> = {__typename: ChildTypename; _id?: Id} & Partial<
  NodeDataOfTreeNode<NodesDef, ChildTypename>
>;

export interface InsertElement<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  ChildTypename extends keyof NodesDef,
  ParentTypename extends keyof NodesDef
> {
  __typename: HDocCommandType.INSERT_ELEMENT;
  parent: Path<NodesDef> | ElementId<ParentTypename>;
  position: PathElement<NodesDef, ParentTypename>;
  element: NewNodeInfo<NodesDef, ChildTypename>;
}

export interface ChangeElement<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  ChildTypename extends keyof NodesDef = keyof NodesDef
> {
  __typename: HDocCommandType.CHANGE_ELEMENT;
  element: Path<NodesDef> | ElementId<ChildTypename>;
  changes: {__typename: ChildTypename} & Partial<
    NodeDataOfTreeNode<NodesDef, ChildTypename>
  >;
}

export interface DeleteElement<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  NodeTypename extends keyof NodesDef = keyof NodesDef
> {
  __typename: HDocCommandType.DELETE_ELEMENT;
  element: Path<NodesDef> | ElementId<NodeTypename>;
}

export interface MoveElement<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  TargetTypename extends keyof NodesDef = keyof NodesDef,
  ParentTypename extends keyof NodesDef = keyof NodesDef
> {
  __typename: HDocCommandType.MOVE_ELEMENT;
  element: Path<NodesDef> | ElementId<TargetTypename>;
  toParent: Path<NodesDef> | ElementId<ParentTypename>;
  toPosition: PathElement<NodesDef, ParentTypename>;
  changes?: Partial<NodeDataOfTreeNode<NodesDef, TargetTypename>>;
}

export type HDocOperation<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  TargetTypename extends keyof NodesDef = keyof NodesDef,
  ParentTypename extends keyof NodesDef = keyof NodesDef
> =
  | InsertElement<NodesDef, TargetTypename, ParentTypename>
  | ChangeElement<NodesDef, TargetTypename>
  | DeleteElement<NodesDef, TargetTypename>
  | MoveElement<NodesDef, TargetTypename, ParentTypename>;

export type ValueOf<T> = T[keyof T];

/**
 * The document schema describes the shape of a normalized document,
 * allowing navigating the hierarchy while using IDs between entities
 */
export interface DocumentSchema<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  RootType extends keyof NodesDef = keyof NodesDef
> {
  nodeTypes: SchemaTreeNodes<NodesDef>;
  rootType: RootType;
  documentType: string;
}

/**
 * A Replay changes document is a document that was generated from
 * a normalized document, and that can replay a list of the underlying
 * document changes with applyChanges.
 *
 * This interface is what can be extended to create domain specific operations,
 * that rely on the functions in IMutableDocument to track changes at a lower
 * level of abstraction.
 */
export interface ReplayChangesDocument<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef = keyof NodesDef
> extends NormalizedDocument<NodesDef, R> {
  /**
   * Get a copy of the original document.
   */
  readonly originalDocument: NormalizedDocument<NodesDef, R>;

  /**
   * Get a normalised version of Doc that reflects all the changes
   * operated on the mutable document.
   *
   * If no changes have been done, the original document is returned.
   *
   * @returns {NormalizedDocument<Doc, K, U>}
   */
  readonly updatedDocument: NormalizedDocument<NodesDef, R>;

  /**
   * List of the commands operated on this mutable document since
   * its instantiation for the original normalized document
   */
  readonly changes: HDocOperation<NodesDef, keyof NodesDef, keyof NodesDef>[];

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
      | HDocOperation<NodesDef, keyof NodesDef, keyof NodesDef>
      | Array<HDocOperation<NodesDef, keyof NodesDef, keyof NodesDef>>
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
export interface MutableDocument<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef = keyof NodesDef
> extends ReplayChangesDocument<NodesDef, R> {
  /**
   * Inserts an element within the document, providing path to the parent
   * and position within the parent (field or field + index)
   *
   * @param {InsertElement<ElementType, Doc, U>} insertCommand
   */
  insertElement: <
    ChildType extends keyof NodesDef,
    ParentType extends keyof NodesDef
  >(
    insertCommand: Omit<
      InsertElement<NodesDef, ChildType, ParentType>,
      '__typename'
    >
  ) => NodesDef[ChildType];

  /**
   * Provided a path to an element in the document, deletes
   * the document from within the document
   *
   * @param {DeleteElement<Doc, U>} deleteCommand
   */
  deleteElement: <TargetType extends keyof NodesDef>(
    deleteCommand: Omit<DeleteElement<NodesDef, TargetType>, '__typename'>
  ) => void;

  /**
   * Provided a path to an element, merge the existing element
   * with the new values provided with the parameter
   *
   * @param {ChangeElement<ElementType, Doc, U>} changeCommand
   */
  changeElement: <TargetType extends keyof NodesDef>(
    changeCommand: ChangeElement<NodesDef, TargetType>
  ) => void;

  /**
   * Provided the path to an element, moves it to a new parent
   * and position withing the document. Optionally you can also change
   * the values of the element being moved at the same time.
   * @param {MoveElement<ElementType, Doc, U>} moveCommand
   */
  moveElement: <
    TargetTypename extends keyof NodesDef,
    ParentTypename extends keyof NodesDef
  >(
    moveCommand: MoveElement<NodesDef, TargetTypename, ParentTypename>
  ) => void;
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

export interface ArrayAddElement<T> {
  __typename: 'AddElement';
  element: T;
  afterElIndex: null | number;
}

export interface ArrayMoveElementRight {
  __typename: 'ArrayMoveElementRight';
  beforeElIndex: number | null;
  elIndex: number;
}

export interface ArrayMoveElementLeft {
  __typename: 'ArrayMoveElementLeft';
  afterElIndex: number | null;
  elIndex: number;
}

export interface ArrayDeleteElement {
  __typename: 'DeleteElement';
  elIndex: number;
}

/**
 * A keep element change means that the element remained
 * quiet in the array, while other elements may have changed around it.
 */
export interface ArrayKeepElement {
  __typename: 'KeepElement';

  /**
   * The index of the element in the base array
   */
  elIndex: number;

  /**
   * Allows pointing out to a merge that although the element itself didn't change
   * within the array, something related to it did, and in a three way merge if
   * the other side was deleted, this element should still be kept
   */
  wasTouched: boolean;
}

export type ArrayChange<T> =
  | ArrayAddElement<T>
  | ArrayMoveElementRight
  | ArrayMoveElementLeft
  | ArrayDeleteElement;

/**
 * Represents changes that happened between
 */
export interface DiffArrayResult<T> {
  changes: ArrayChange<T>[];
  elementChanges: Array<ArrayKeepElement | ArrayChange<T>>;
}

export interface EqualFn {
  (a: any, b: any): boolean;
}

export interface WasTouchedFn<T> {
  (element: T): boolean;
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
export interface IPositionConflict {
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

export interface IElementConflicts<S> {
  infoConflicts?: ElementInfoConflicts<S>;
  positionConflicts?: IPositionConflict;
}

/**
 * For each mapped element, creates a map Id -> ElementConflicts record.
 * Additional data structure that models conflicts resulting from merging
 * different branches of a document.
 */
export type ConflictsMap<
  NodesDef extends Record<keyof NodesDef, TreeNode<any, any, any, any, any>>
> = {
  [F in keyof NodesDef]: NodesDef[F] extends TreeNode<
    NodesDef,
    any,
    infer NodeData,
    any,
    any
  >
    ? Map<Id, IElementConflicts<NodeData>>
    : never;
};

/**
 * Visitor interface for a visitor pattern that
 * visits a HDocument in breadth first format from the
 * document root.
 */
export interface NodeVisitor<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef = keyof NodesDef,
  Context = any
> {
  (
    doc: NormalizedDocument<NodesDef, R>,
    nodeType: keyof NodesDef,
    nodeId: Id,
    context?: Context
  ): void;
}

/**
 * Represents the results returned from a 3-way merge of a HDocument.
 *
 * It includes a working version of the document and a map of the conflicts
 * the merge generated, if any.
 */
export interface II3MergeResult<NorDoc extends NormalizedDocument<any, any>> {
  /**
   * The merged document, which is still a normalized document. It contains the
   * provisional victors of any conflicts generated during the merge
   */
  mergedDoc: NorDoc;

  /**
   * For each entity type in the normalised document, it has a conflict map
   * that has one record for each element of that type that has at least a conflict.
   */
  conflicts: ConflictsMap<NodesDefOfDoc<NorDoc>>;
}

/**
 * Data used during merge for each element in mine
 * and their branches.
 */
export interface IMergeElementsState {
  hasPositionBeenProcessed: boolean;
  haveInfoAndChildrenBeenProcessed: boolean;
  isInBaseTree: boolean;
  isInEditedPath: boolean;
  mergedElementId: Id;
}

export interface IGetterSetter<T> {
  (value?: T): T;
}

export type NodesDefOfDoc<NorDoc extends NormalizedDocument<any, any>> =
  NorDoc extends NormalizedDocument<infer NodesDef> ? NodesDef : never;

export type RootTypeOfDoc<NorDoc extends NormalizedDocument<any, any>> =
  NorDoc extends NormalizedDocument<any, infer RootType> ? RootType : never;
/**
 * The merge context is used during a three way merge to track progress
 * and allow higher-level data structures to change how the merge works
 * for specific types of elements.
 *
 * The overridable functions during the merge always receive this object
 * as part of their list of parameters
 */
export interface II3WMergeContext<NorDoc extends NormalizedDocument<any, any>> {
  myElementsMergeState: Map<string, IMergeElementsState>;
  theirElementsMergeState: Map<string, IMergeElementsState>;
  baseDoc: NorDoc;
  myDoc: IGetterSetter<NorDoc>;
  theirDoc: IGetterSetter<NorDoc>;
  elementsToDelete: Array<{__typename: keyof NodesDefOfDoc<NorDoc>; _id: Id}>;
  mergedDoc: MutableDocument<NodesDefOfDoc<NorDoc>, RootTypeOfDoc<NorDoc>>;
  conflicts: ConflictsMap<NodesDefOfDoc<NorDoc>>;
  overrides?: MergeOverridesMap<NodesDefOfDoc<NorDoc>>;
  defaultHooks: MergeHooks<NorDoc>;
}

/**
 * When an element has been moved to incompatible parts
 * of the document, a custom resolution of the conflict
 * should tell the merge function two things:
 * 1) is the current mergingIndex to be included in the
 * final merged document, and we should advance to the next
 * or not
 * 2)
 */
export interface IOnIncompatibleArrayElementsResult {
  /**
   * true if the current mergingIndex is to be included in the
   * final merged document
   */
  advancedMergingIndex: boolean;

  /**
   * If to resolve the conflict we had to rebase a version
   * of the document, we list here the _ids that were rebased
   * and which side we rebased
   */
  rebasedIds: Array<{
    _id: Id;
    newId: Id;
    rebasedSide: ProcessingOrderFrom;
  }>;
}

/**
 * Customisation hooks for an element type. This way each element type
 * can deviate from the default handling of merges.
 */
export interface IMergeElementOverrides<
  NorDoc extends NormalizedDocument<any, any>,
  ElementTypename extends keyof NodesDefOfDoc<NorDoc>
> {
  /**
   * Comparison used to determine the processing order of an array linked field. The elements
   * compared will be from the two later branches of a three-way merge to determine which
   * id will potentially be added first in the linked array of the merged tree.
   *
   * @param {ElementType | null} a
   * @param {ElementType | null} b
   * @param {II3WMergeContext<MapsInterface, U>} mergeContext
   * @returns {number}
   */
  cmpSiblings: (
    base: NodesDefOfDoc<NorDoc>[ElementTypename] | null,
    a: NodesDefOfDoc<NorDoc>[ElementTypename] | null,
    b: NodesDefOfDoc<NorDoc>[ElementTypename] | null,
    mergeContext: II3WMergeContext<NodesDefOfDoc<NorDoc>>
  ) => number;

  /**
   * Allows customising which fields are considered when merging element information.
   * If some fields for instance determine and are merged when determining the position
   * of elements in parents, this mergeInfo can decide not to look at those fields.
   *
   * @param {ElementType} base
   * @param {ElementType} a
   * @param {ElementType} b
   * @returns {ElementInfoConflicts<ElementType>}
   */
  mergeElementInfo: (
    base: NodesDefOfDoc<NorDoc>[ElementTypename] | null,
    a: NodesDefOfDoc<NorDoc>[ElementTypename] | null,
    b: NodesDefOfDoc<NorDoc>[ElementTypename] | null,
    mergeContext: II3WMergeContext<NorDoc>
  ) => void;

  /**
   * Allows customising how an element is removed from the merging tree
   */
  onDeleteElement: (
    elementId: Id,
    mergeContext: II3WMergeContext<NorDoc>
  ) => void;

  /**
   * Called when an element is present in all the versions
   * of the document being merged, but has been edited in both later versions.
   *
   * This function determines if the merged tree will retain a single element that
   * merges the information from the two branches, or if one of the two versions of
   * the element will be cloned as a new subtree.
   *
   * If true is returned, instead of the node in a different position being cloned,
   * we consider this position to be
   * fine for the other version of the document as well and only one copy of the
   * element will be kept (and merged).
   *
   * This allows documents to say that even if the positions are different, in
   * their domain the positions are equivalent so keeping the first you meet is
   * fine.
   *
   * @param {Id} elementId
   * @param {II3WMergeContext<MapsInterface, U>} mergeContext
   * @returns {boolean}
   */
  arePositionsCompatible: (
    elementId: Id,
    fromSide: ProcessingOrderFrom,
    mergeContext: II3WMergeContext<NorDoc>
  ) => boolean;

  /**
   * Called when an element is moved to a different position in the merged document.
   * Allows documents to use their domain aware move functions.
   */
  moveToMergePosition: (
    elementId: Id,
    toParentPath: Path<NodesDefOfDoc<NorDoc>>,
    toPosition: PathElement<NodesDefOfDoc<NorDoc>>,
    mergeContext: II3WMergeContext<NorDoc>
  ) => void;

  /**
   * Called when an element is added to the document, allowing domain specific
   * functions to override the generic HDocument insert command.
   *
   * @param {ElementType} element
   * @param {Path<MapsInterface>} parentPath
   * @param {SubEntityPathElement<MapsInterface>} position
   * @returns {ElementType}
   */
  addElement: (
    element: NodesDefOfDoc<NorDoc>[ElementTypename],
    parentPath: Path<NodesDefOfDoc<NorDoc>>,
    position: PathElement<NodesDefOfDoc<NorDoc>>,
    mergeContext: II3WMergeContext<NorDoc>
  ) => NodesDefOfDoc<NorDoc>[ElementTypename];

  /**
   * Called when an element is present in all versions of the document,
   * has been moved to different positions within the document hierarchy,
   * and the two new positions are not compatible.
   *
   * Allows documents to customise how this conflict is resolved instead of
   * relying on the standard resolution method - creating a clone of the subtree
   * rooted at the element by reiding the subtree in the version of the tree where
   * the element occurs later in the visit.
   *
   * @param {Id} elementId
   * @param {Path<MapsInterface>} parentPath
   * @param {SubEntityPathElement<MapsInterface>} position
   * @param {"left" | "right"} versionMoved
   * @param {II3WMergeContext<MapsInterface, U>} mergeContext
   * @returns {boolean} return true if you added a node at the current position
   *          in the merged array
   */
  onIncompatibleElementVersions: (
    elementId: Id,
    parentPath: Path<NodesDefOfDoc<NorDoc>>,
    position: PathElement<NodesDefOfDoc<NorDoc>>,
    versionMoved: ProcessingOrderFrom.left | ProcessingOrderFrom.right,
    mergeContext: II3WMergeContext<NorDoc>
  ) => IOnIncompatibleArrayElementsResult;
}

export interface MergeHooks<NorDoc extends NormalizedDocument<any, any>> {
  /**
   * Comparison used to determine the processing order of an array linked field. The elements
   * compared will be from the two later branches of a three-way merge to determine which
   * id will potentially be added first in the linked array of the merged tree.
   *
   * @param {ElementType | null} a
   * @param {ElementType | null} b
   * @param {II3WMergeContext<MapsInterface, U>} mergeContext
   * @returns {number}
   */
  cmpSiblings: <ElementType extends keyof NodesDefOfDoc<NorDoc>>(
    elementType: ElementType,
    base: NodesDefOfDoc<NorDoc>[ElementType] | null,
    a: NodesDefOfDoc<NorDoc>[ElementType] | null,
    b: NodesDefOfDoc<NorDoc>[ElementType] | null,
    mergeContext: II3WMergeContext<NorDoc>
  ) => number;

  /**
   * Allows customising which fields are considered when merging element information.
   * If some fields for instance determine and are merged when determining the position
   * of elements in parents, this mergeInfo can decide not to look at those fields.
   *
   * @param {ElementType} base
   * @param {ElementType} a
   * @param {ElementType} b
   * @returns {ElementInfoConflicts<ElementType>}
   */
  mergeElementInfo: <
    ElementType extends keyof NodesDefOfDoc<NorDoc>,
    K extends keyof NodeDataOfTreeNode<
      NodesDefOfDoc<NorDoc>[ElementType],
      keyof NodesDefOfDoc<NorDoc>
    > = keyof NodeDataOfTreeNode<
      NodesDefOfDoc<NorDoc>[ElementType],
      keyof NodesDefOfDoc<NorDoc>
    >
  >(
    mergeContext: II3WMergeContext<NorDoc>,
    elementType: ElementType,
    base: NodesDefOfDoc<NorDoc>[ElementType] | null,
    a: NodesDefOfDoc<NorDoc>[ElementType] | null,
    b: NodesDefOfDoc<NorDoc>[ElementType] | null,
    ignoreFields?: K[]
  ) => void;

  /**
   * Allows customising how an element is removed from the merging tree
   */
  onDeleteElement: <ElementType extends keyof NodesDefOfDoc<NorDoc>>(
    elementType: ElementType,
    elementId: Id,
    mergeContext: II3WMergeContext<NorDoc>
  ) => void;

  /**
   * Called when an element is present in all the versions
   * of the document being merged, but has been edited in both later versions.
   *
   * This function determines if the merged tree will retain a single element that
   * merges the information from the two branches, or if one of the two versions of
   * the element will be cloned as a new subtree.
   *
   * If true is returned, instead of the node in a different position being cloned,
   * we consider this position to be
   * fine for the other version of the document as well and only one copy of the
   * element will be kept (and merged).
   *
   * This allows documents to say that even if the positions are different, in
   * their domain the positions are equivalent so keeping the first you meet is
   * fine.
   *
   * @param {Id} elementId
   * @param {II3WMergeContext<MapsInterface, U>} mergeContext
   * @returns {boolean}
   */
  arePositionsCompatible: <ElementType extends keyof NodesDefOfDoc<NorDoc>>(
    elementType: ElementType,
    elementId: Id,
    fromSide: ProcessingOrderFrom,
    mergeContext: II3WMergeContext<NorDoc>
  ) => boolean;

  /**
   * Called when an element is moved to a different position in the merged document.
   * Allows documents to use their domain aware move functions.
   */
  moveToMergePosition: <ElementType extends keyof NodesDefOfDoc<NorDoc>>(
    elementType: ElementType,
    elementId: Id,
    toParentPath: Path<NodesDefOfDoc<NorDoc>>,
    toPosition: PathElement<NodesDefOfDoc<NorDoc>>,
    mergeContext: II3WMergeContext<NorDoc>
  ) => void;

  /**
   * Called when an element is added to the document, allowing domain specific
   * functions to override the generic HDocument insert command.
   *
   * @param {ElementType} element
   * @param {Path<MapsInterface>} parentPath
   * @param {SubEntityPathElement<MapsInterface>} position
   * @returns {ElementType}
   */
  addElement: <ChildType extends keyof NodesDefOfDoc<NorDoc>>(
    elementType: ChildType,
    element: NodesDefOfDoc<NorDoc>[ChildType],
    parentPath: Path<NodesDefOfDoc<NorDoc>>,
    position: PathElement<NodesDefOfDoc<NorDoc>>,
    mergeContext: II3WMergeContext<NorDoc>
  ) => NodesDefOfDoc<NorDoc>[ChildType];

  /**
   * Called when an element is present in all versions of the document,
   * has been moved to different positions within the document hierarchy,
   * and the two new positions are not compatible.
   *
   * Allows documents to customise how this conflict is resolved instead of
   * relying on the standard resolution method - creating a clone of the subtree
   * rooted at the element by reiding the subtree in the version of the tree where
   * the element occurs later in the visit.
   *
   * @param {Id} elementId
   * @param {Path<MapsInterface>} parentPath
   * @param {SubEntityPathElement<MapsInterface>} position
   * @param {"left" | "right"} versionMoved
   * @param {II3WMergeContext<MapsInterface, U>} mergeContext
   * @returns {boolean} return true if you added a node at the current position
   *          in the merged array
   */
  onIncompatibleElementVersions: <
    ElementType extends keyof NodesDefOfDoc<NorDoc>
  >(
    elementType: ElementType,
    elementId: Id,
    parentPath: Path<NodesDefOfDoc<NorDoc>>,
    position: PathElement<NodesDefOfDoc<NorDoc>>,
    versionMoved: ProcessingOrderFrom.left | ProcessingOrderFrom.right,
    mergeContext: II3WMergeContext<NorDoc>
  ) => IOnIncompatibleArrayElementsResult;
}

export type MergeOverridesMap<NorDoc extends NormalizedDocument<any, any>> = {
  [F in keyof NodesDefOfDoc<NorDoc>]?: Partial<
    IMergeElementOverrides<NorDoc, F>
  >;
};

export interface IMergeOptions<NorDoc extends NormalizedDocument<any, any>> {
  /**
   * During the merge process a mutable document is generated at the start
   * of the merging process to generate the merge tree.
   *
   * This hook allows customising how the mutable document is initialised
   * starting from a input normalised document.
   *
   * @param {NorDoc} document
   * @returns {MutableDocument<MapsOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>}
   */
  onCreateMutableDocument?: (
    document: NorDoc
  ) => MutableDocument<NodesDefOfDoc<NorDoc>, RootTypeOfDoc<NorDoc>>;

  /**
   * For each element type you can customise how various aspects of the
   * merge operate, so that higher level data structures can keep their
   * own invariants during a merge.
   */
  elementsOverrides: MergeOverridesMap<NorDoc>;
}

/**
 * The signature of a three-way merge function. Allows passing in customized three
 * way merge functions to the versioning of documents.
 */
export interface ThreeWayMergeFn<NorDoc extends NormalizedDocument<any, any>> {
  (
    baseDoc: NorDoc,
    myDoc: NorDoc,
    theirDoc: NorDoc,
    options?: IMergeOptions<NorDoc>
  ): II3MergeResult<NorDoc>;
}

// Represents a denormalized node, where parentType and
// parentId are replaced by a parent pointer
export interface IParentedNode<U = any, P = IParentedNode<any, any>>
  extends IId {
  __typename: U;
  parent: null | P;
}

export enum ProcessingOrderFrom {
  both,
  left,
  right
}

export interface IProcessingOrderElement {
  _id: Id;
  from: ProcessingOrderFrom;
}

/**
 * Options that guide the traversal of a hierarchical document
 */
export interface VisitDocumentOptions<
  NodesDef,
  U extends keyof NodesDef = keyof NodesDef,
  Context = any
> {
  /**
   * A context object that is passed to the visit function and allows
   * to inject information external to the document within the visit function.
   */
  context?: Context;

  /**
   * Whether to traverese the tree breadth first of depth first
   */
  traversal?: DocumentVisitTraversal;

  /**
   * If set, visit only the subtree rooted at the element with the give
   * type and id
   */
  startElement?: {
    type: U;
    _id: Id;
  };

  /**
   * Whitelist of node types the visit function will be called on.
   * This allows visiting a limited number of document nodes, while potentially
   * traversing the entire document.
   */
  typesToVisit?: U[];

  /**
   * Whitelist of node types that will be traversed during the visit. This
   * allows skipping visiting parts of the document tree that we are not
   * interested about.
   */
  typesToTraverse?: U[];
}

/**
 * An Id function allows creating a uniquely identifying string for
 * an element.
 */
export interface IdFn<T> {
  (value: T): string | T;
}
