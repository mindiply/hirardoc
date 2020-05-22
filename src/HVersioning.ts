import {v1 as uuid} from 'uuid';
import {diff3Merge, IMergeConflictRegion, IMergeOkRegion} from 'node-diff3';
import {
  cloneNormalizedDocument,
  hasMappedElement,
  idAndTypeForPath,
  isParentedId,
  mappedElement,
  mutableDocument,
  pathForElementWithId
} from './HDocument';
import {
  AllMappedTypesFields,
  ConflictsMap,
  DocumentVisitTraversal,
  ElementInfoConflicts,
  HDocCommandType,
  IChangeElement,
  Id,
  IDeleteElement,
  IDocumentSchema,
  IElementConflicts,
  IFieldEntityReference,
  II3MergeResult,
  IInsertElement,
  IMoveElement,
  IMutableDocument,
  INormalizedDocument,
  INormalizedMutableMapsDocument,
  IParentedId,
  IValueConflict,
  MergeStatus,
  Path,
  SubEntityPathElement
} from './HTypes';
import {visitDocument} from './HVisit';
import {diff, diffElementInfo, diffInfoOf} from './HDiff';

type DataValue = string | Date | number | boolean;

function isDataValue(obj: any): obj is DataValue {
  return (
    typeof obj === 'string' ||
    typeof obj === 'number' ||
    typeof obj === 'boolean' ||
    obj instanceof Date
  );
}

/**
 * Merges atomic values, given a base value, and a
 * mine and their versions for a three-way merge.
 *
 * If a conflict occurs that cannot be fixed, it returns a IValueConflict
 * record. If no conflict occurs the merged value is returned instead.
 *
 * @param {T} baseValueInp
 * @param {T} myValueInp
 * @param {T} theirValueInp
 * @returns {IValueConflict<T> | T}
 */
function mergeDataValues<T extends DataValue>(
  baseValueInp: T,
  myValueInp: T,
  theirValueInp: T
): T | IValueConflict<T> {
  const baseValue =
    baseValueInp instanceof Date ? baseValueInp.getTime() : baseValueInp;
  const myValue =
    myValueInp instanceof Date ? myValueInp.getTime() : myValueInp;
  const theirValue =
    theirValueInp instanceof Date ? theirValueInp.getTime() : theirValueInp;
  if (theirValue === myValue) {
    return myValueInp;
  }
  if (baseValue === myValue) {
    return theirValueInp;
  }
  if (baseValue === theirValue) {
    return myValueInp;
  }
  let mergedValue: T;
  if (
    typeof baseValue === 'number' &&
    typeof theirValue === 'number' &&
    typeof myValue === 'number'
  ) {
    const myDiff = Math.abs(theirValue - baseValue);
    const theirDiff = Math.abs(theirValue - baseValue);
    if (myDiff > theirDiff) {
      mergedValue = myValueInp;
    } else if (myDiff < theirDiff) {
      mergedValue = theirValueInp;
    } else {
      mergedValue = myValue < theirValue ? myValueInp : theirValueInp;
    }
  } else if (
    typeof baseValue === 'string' &&
    typeof theirValue === 'string' &&
    typeof myValue === 'string'
  ) {
    const res = diff3Merge(myValue, baseValue, theirValue, {
      stringSeparator: ''
    });
    mergedValue = (res.every(region => typeof region === 'string')
      ? res.join('')
      : myValue < theirValue
      ? myValueInp
      : theirValueInp) as T;
  } else {
    mergedValue =
      myValue === theirValue && myValue === baseValue
        ? baseValueInp
        : myValue < theirValue
        ? myValueInp
        : theirValueInp;
  }
  return {
    baseValue: baseValueInp,
    conflictValues: [myValueInp, theirValueInp],
    mergeStatus: MergeStatus.open,
    mergedValue
  };
}

interface IMergedElementInfoResult<
  MapsInterface,
  U extends keyof MapsInterface,
  ElementType extends IParentedId<U, U>
> {
  mergedElement: ElementType;
  conflicts?: ElementInfoConflicts<ElementType>;
}

function mergeElementInfo<
  MapsInterface,
  U extends keyof MapsInterface,
  ElementType extends IParentedId<U, U>,
  K extends keyof ElementType = keyof ElementType
>(
  schema: IDocumentSchema<MapsInterface, U>,
  elementType: U,
  baseElement: ElementType,
  leftElement: ElementType,
  rightElement: ElementType,
  excludeFields: K[] = []
): IMergedElementInfoResult<MapsInterface, U, ElementType> {
  const mergeResult: IMergedElementInfoResult<MapsInterface, U, ElementType> = {
    mergedElement: {
      ...baseElement
    }
  };
  const conflicts: ElementInfoConflicts<ElementType> = {};
  const cloneElement = mergeResult.mergedElement;
  for (const fieldName in cloneElement) {
    if (
      fieldName === 'parentId' ||
      fieldName === 'parentType' ||
      fieldName in schema.types[elementType] ||
      excludeFields.indexOf((fieldName as any) as K) !== -1 ||
      !isDataValue(cloneElement[fieldName])
    ) {
      continue;
    }
    const mergedVal = mergeDataValues(
      (baseElement[fieldName as keyof ElementType] as any) as DataValue,
      (leftElement[fieldName as keyof ElementType] as any) as DataValue,
      (rightElement[fieldName as keyof ElementType] as any) as DataValue
    );
    if (isDataValue(mergedVal)) {
      // @ts-expect-error
      cloneElement[fieldName] = mergedVal;
    } else {
      // @ts-expect-error
      cloneElement[fieldName] = mergedVal.mergedValue;
      // @ts-expect-error
      conflicts[fieldName] = mergedVal;
    }
  }
  return Object.keys(conflicts).length > 0
    ? {...mergeResult, conflicts}
    : mergeResult;
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

/**
 * The merge context is used during a three way merge to track progress
 * and allow higher-level data structures to change how the merge works
 * for specific types of elements.
 *
 * The overridable functions during the merge always receive this object
 * as part of their list of parameters
 */
interface II3WMergeContext<MapsInterface, U extends keyof MapsInterface> {
  myElementsMergeState: Map<string, IMergeElementsState>;
  theirElementsMergeState: Map<string, IMergeElementsState>;
  myDoc: INormalizedDocument<MapsInterface, U>;
  theirDoc: INormalizedDocument<MapsInterface, U>;
  elementsToDelete: Array<{__typename: U; _id: Id}>;
  mergedDoc: IMutableDocument<MapsInterface, U>;
  conflicts: ConflictsMap<MapsInterface, U>;
  overrides?: MergeOverrides<MapsInterface, U, any>;
}

/**
 * Customisation hooks for an element type. This way each element type
 * can deviate from the default handling of merges.
 */
export interface IMergeElementOverrides<
  MapsInterface,
  U extends keyof MapsInterface,
  ElementType extends IParentedId
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
    base: ElementType | null,
    a: ElementType | null,
    b: ElementType | null,
    mergeContext: II3WMergeContext<MapsInterface, U>
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
    base: ElementType,
    a: ElementType | null,
    b: ElementType | null,
    mergeContext: II3WMergeContext<MapsInterface, U>
  ) => void;

  /**
   * Allows customising how an element is removed from the merging tree
   */
  onDeleteElement: (
    elementId: Id,
    mergeContext: II3WMergeContext<MapsInterface, U>
  ) => void;

  /**
   * Called when an element is present in all the versions
   * of the document being merged, but has been moved to different places
   * within the document's hierarchy. If true is returned, instead of the
   * node in a different position being cloned, we consider this position to be
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
    mergeContext: II3WMergeContext<MapsInterface, U>
  ) => boolean;

  /**
   * Called when an element is moved to a different position in the merged document.
   * Allows documents to use their domain aware move functions.
   */
  moveToMergePosition: (
    elementId: Id,
    toParentPath: Path<MapsInterface>,
    toPosition: SubEntityPathElement<MapsInterface>,
    mergeContext: II3WMergeContext<MapsInterface, U>
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
    element: ElementType,
    parentPath: Path<MapsInterface>,
    position: SubEntityPathElement<MapsInterface>,
    mergeContext: II3WMergeContext<MapsInterface, U>
  ) => ElementType;

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
    parentPath: Path<MapsInterface>,
    position: SubEntityPathElement<MapsInterface>,
    versionMoved: 'left' | 'right',
    mergeContext: II3WMergeContext<MapsInterface, U>
  ) => boolean;
}

export type MergeOverrides<
  MapsInterface,
  U extends keyof MapsInterface,
  ElementType extends IParentedId<U, U>
> = {
  [F in U]?: Partial<IMergeElementOverrides<MapsInterface, U, ElementType>>;
};

/**
 * Given a base version of a normalized document, and
 * two later versions of the document, generates a merge
 * tree reporting back if there were conflicts and a diff
 * object to go from myDoc to theirDoc.
 *
 * @param {INormalizedDocument<MapsInterface, U>} baseDoc
 * @param {INormalizedDocument<MapsInterface, U>} myDoc
 * @param {INormalizedDocument<MapsInterface, U>} theirDoc
 * @param {MergeOverrides<MapsInterface, U, ElementType>} options
 * @returns {II3MergeResult<MapsInterface, U>}
 */
export function threeWayMerge<
  MapsInterface,
  U extends keyof MapsInterface,
  ElementType extends IParentedId<U, U>
>(
  baseDoc: INormalizedDocument<MapsInterface, U>,
  myDoc: INormalizedDocument<MapsInterface, U>,
  theirDoc: INormalizedDocument<MapsInterface, U>,
  options?: MergeOverrides<MapsInterface, U, ElementType>
): II3MergeResult<MapsInterface, U> {
  const mergedDoc = mutableDocument(myDoc);
  const mergeContext: II3WMergeContext<MapsInterface, U> = {
    mergedDoc,
    myElementsMergeState: buildMergeElementsState(baseDoc, myDoc),
    theirElementsMergeState: buildMergeElementsState(baseDoc, theirDoc),
    myDoc: myDoc,
    theirDoc: theirDoc,
    elementsToDelete: [],
    conflicts: {} as ConflictsMap<MapsInterface, U>,
    overrides: options
  };
  for (const elementType in baseDoc.maps) {
    mergeContext.conflicts[elementType] = new Map();
  }
  buildMergedTree(mergeContext);
  const updatedDoc = mergedDoc.updatedDocument();
  return {
    mergedDoc: updatedDoc,
    conflicts: mergeContext.conflicts,
    delta: diff(baseDoc, updatedDoc)
  };
}

const getElementTypeUid = <MapsInterface, U extends keyof MapsInterface>(
  doc:
    | INormalizedDocument<MapsInterface, U>
    | INormalizedMutableMapsDocument<MapsInterface, U>,
  elementType: U
): string => `${doc.schema.documentType}.${elementType}`;

const elementTypesOverridesMap: Map<
  string,
  IMergeElementOverrides<any, any, any>
> = new Map();

/**
 * Creates new IDs for all the elements in the document subTree
 * starting at the given element identified by its type and id.
 *
 * This is a destructive change which is not tracked as usual via
 * the changes array, it is meant to be used only within the merging
 * functions
 *
 * @param {IMutableDocument<MapsInterface, U>} document
 * @param {U} elementType
 * @param {Id} elementId
 * @returns {IMutableDocument<MapsInterface, U>}
 */
function reIdElementSubtree<MapsInterface, U extends keyof MapsInterface>(
  document: INormalizedDocument<MapsInterface, U>,
  elementType: U,
  elementId: Id
): {doc: INormalizedDocument<MapsInterface, U>; newElementId: Id} {
  const newIds: Map<U, Map<Id, Id>> = new Map();
  const changedDocument = cloneNormalizedDocument(document);

  // First I generate Ids for all the elements in the subtree
  visitDocument(
    document,
    (doc, elementType, elementId) => {
      if (!newIds.has(elementType)) {
        newIds.set(elementType, new Map());
      }
      const idsMap = newIds.get(elementType)!;
      if (!idsMap.has(elementId)) {
        idsMap.set(elementId, uuid());
      }
    },
    {},
    DocumentVisitTraversal.DEPTH_FIRST,
    elementType,
    elementId
  );

  // Second I go depth first down the elements and change the ids
  // of each one of them
  visitDocument(
    changedDocument,
    (doc, elementType, elementId) => {
      const element = mappedElement(
        doc.maps,
        elementType,
        elementId
      ) as IParentedId;
      const reIdedElement = {
        ...element,
        _id: newIds.get(elementType)!.get(elementId)!
      };
      const nodeSchema = doc.schema.types[elementType];
      const reIdedParentId: null | Id =
        element.parentId !== null &&
        newIds.has(element.parentType) &&
        newIds.get(element.parentType)!.has(element.parentId)
          ? newIds.get(element.parentType)!.get(element.parentId)!
          : null;
      for (const linkField in nodeSchema) {
        if (linkField === 'parentId' && reIdedParentId !== null) {
          reIdedElement.parentId = reIdedParentId;
          continue;
        }
        const linkFieldProps = nodeSchema[linkField];
        if (Array.isArray(linkFieldProps)) {
          const {__schemaType} = linkFieldProps[0];
          (reIdedElement as any)[linkField] = ((reIdedElement as any)[
            linkField
          ] as Id[]).map(
            existingId => newIds.get(__schemaType)!.get(existingId)!
          );
        } else {
          const {__schemaType} = linkFieldProps as IFieldEntityReference<U>;
          (reIdedElement as any)[linkField] = newIds
            .get(__schemaType)!
            .get((reIdedElement as any)[linkField] as Id)!;
        }
      }
      doc.maps[elementType].set(reIdedElement._id, reIdedElement);
      doc.maps[elementType].delete(elementId);
    },
    {},
    DocumentVisitTraversal.DEPTH_FIRST,
    elementType,
    elementId
  );

  return {
    doc: changedDocument,
    newElementId: newIds.get(elementType)!.get(elementId)!
  };
}

/**
 * Provides the functions to use for an elementType
 * @param {II3WMergeContext<MapsInterface, U>} context
 * @param {U} elementType
 * @returns {IMergeElementOverrides<MapsInterface, U, MapsInterface[typeof elementType]>}
 */
function fnsForElementType<
  MapsInterface,
  U extends keyof MapsInterface,
  ElementType extends IParentedId<U, U>
>(
  context: II3WMergeContext<MapsInterface, U>,
  elementType: U
): IMergeElementOverrides<MapsInterface, U, ElementType> {
  const typeUid = getElementTypeUid(context.myDoc, elementType);
  let overridableFunctions:
    | undefined
    | IMergeElementOverrides<
        MapsInterface,
        U,
        ElementType
      > = elementTypesOverridesMap.get(typeUid);
  if (!overridableFunctions) {
    const {overrides} = context;
    const elementOverrides =
      overrides && elementType in overrides
        ? overrides[elementType]!
        : ({} as IMergeElementOverrides<MapsInterface, U, any>);
    overridableFunctions = {
      onIncompatibleElementVersions: elementOverrides.onIncompatibleElementVersions
        ? elementOverrides.onIncompatibleElementVersions
        : (
            elementId: Id,
            parentPath: Path<MapsInterface>,
            position: SubEntityPathElement<MapsInterface>,
            versionMoved: 'left' | 'right',
            {mergedDoc}: II3WMergeContext<MapsInterface, U>
          ): boolean => {
            let cloneId: Id;
            if (versionMoved === 'left') {
              const {doc: changedDoc, newElementId} = reIdElementSubtree(
                context.theirDoc,
                elementType,
                elementId
              );
              cloneId = newElementId;
              context.theirDoc = changedDoc;
              context.myElementsMergeState.get(
                getElementUid(elementType, elementId)
              )!.hasPositionBeenProcessed = true;
            } else {
              const {doc: changedDoc, newElementId} = reIdElementSubtree(
                context.myDoc,
                elementType,
                elementId
              );
              context.myDoc = changedDoc;
              cloneId = newElementId;
              context.theirElementsMergeState.get(
                getElementUid(elementType, elementId)
              )!.hasPositionBeenProcessed = true;
            }
            const elementConflicts =
              context.conflicts[elementType].get(elementId) || {};
            elementConflicts.positionConflicts = {
              clonedElements: [cloneId],
              mergeStatus: MergeStatus.autoMerged
            };
            context.conflicts[elementType].set(elementId, elementConflicts);
            let currentId: Id | null = null;
            let currentType: U | null = null;
            try {
              const {_id, __typename} = idAndTypeForPath(
                mergedDoc,
                parentPath.concat(position)
              );
              currentId = _id;
              currentType = __typename;
            } catch (err) {
              // it's possible there is no node at the path, in which case
              // let's swallow the integrity exception
            }
            if (currentType !== elementType || currentId !== elementId) {
              const moveElementCmd: IMoveElement<
                MapsInterface,
                IParentedId,
                U
              > = {
                __typename: HDocCommandType.MOVE_ELEMENT,
                fromPath: pathForElementWithId(
                  mergedDoc,
                  elementType,
                  elementId
                ),
                toParentPath: parentPath,
                toPosition: position,
                changes: {
                  __typename: elementType
                },
                targetElement: {
                  __typename: elementType,
                  _id: elementId
                }
              };
              mergedDoc.moveElement(moveElementCmd);
            }
            return true;
          },
      moveToMergePosition: elementOverrides.moveToMergePosition
        ? elementOverrides.moveToMergePosition
        : (
            elementId: Id,
            toParentPath: Path<MapsInterface>,
            toPosition: SubEntityPathElement<MapsInterface>,
            mergeContext: II3WMergeContext<MapsInterface, U>
          ) => {
            const moveCmd: IMoveElement<MapsInterface, IParentedId, U> = {
              __typename: HDocCommandType.MOVE_ELEMENT,
              fromPath: pathForElementWithId(
                mergeContext.mergedDoc,
                elementType,
                elementId
              ),
              toParentPath,
              toPosition,
              targetElement: {
                __typename: elementType,
                _id: elementId
              }
            };
            mergeContext.mergedDoc.moveElement(moveCmd);
          },
      mergeElementInfo: elementOverrides.mergeElementInfo
        ? elementOverrides.mergeElementInfo
        : <ElementType extends IParentedId<U, U>>(
            base: ElementType,
            a: ElementType | null,
            b: ElementType | null,
            mergeContext: II3WMergeContext<MapsInterface, U>
          ) => {
            let elementInfoDiff: Partial<ElementType> | null = null;
            if (a && b) {
              const mergeRes = mergeElementInfo<MapsInterface, U, ElementType>(
                mergeContext.mergedDoc.schema,
                elementType,
                base,
                a,
                b
              );
              if (mergeRes.conflicts) {
                const elementConflicts: IElementConflicts<
                  MapsInterface,
                  MapsInterface[typeof elementType]
                > = mergeContext.conflicts[elementType].get(base._id) || {};
                mergeContext.conflicts[elementType].set(base._id, {
                  ...elementConflicts,
                  infoConflicts: mergeRes.conflicts as MapsInterface[typeof elementType]
                });
              }
              elementInfoDiff = diffElementInfo(
                mergeContext.mergedDoc.schema,
                elementType,
                base,
                mergeRes.mergedElement
              );
            } else if (a || b) {
              const laterEl = (a ? a : b) as ElementType;
              elementInfoDiff = diffElementInfo(
                mergeContext.mergedDoc.schema,
                elementType,
                base,
                laterEl
              );
            }
            if (elementInfoDiff && Object.keys(elementInfoDiff).length > 0) {
              const changeCmd: IChangeElement<MapsInterface, ElementType, U> = {
                __typename: HDocCommandType.CHANGE_ELEMENT,
                path: pathForElementWithId(
                  mergeContext.mergedDoc,
                  elementType,
                  (base as IParentedId)._id
                ),
                changes: {
                  ...elementInfoDiff,
                  __typename: elementType as U
                },
                targetElement: {
                  __typename: elementType,
                  _id: (base as IParentedId)._id
                }
              };
              mergeContext.mergedDoc.changeElement(changeCmd);
            }
          },
      onDeleteElement: elementOverrides.onDeleteElement
        ? elementOverrides.onDeleteElement
        : (elementId: Id, mergeContext: II3WMergeContext<MapsInterface, U>) => {
            const deleteCmd: IDeleteElement<MapsInterface, U> = {
              __typename: HDocCommandType.DELETE_ELEMENT,
              path: pathForElementWithId(
                mergeContext.mergedDoc,
                elementType,
                elementId
              ),
              targetElement: {
                __typename: elementType,
                _id: elementId
              }
            };
            mergeContext.mergedDoc.deleteElement(deleteCmd);
          },
      cmpSiblings: elementOverrides.cmpSiblings
        ? elementOverrides.cmpSiblings
        : <ElementType extends IParentedId>(
            base: ElementType | null,
            a: ElementType | null,
            b: ElementType | null
          ): number => {
            if (a === null && b === null) return 0;
            if (a === null) return 1;
            if (b === null) return -1;
            if (a._id === b._id) return 0;

            if (base && a._id === base._id) return 1;
            if (base && b._id === base._id) return -1;
            return (a._id || 0) < (b._id || 0)
              ? -1
              : (a._id || 0) > (b._id || 0)
              ? 1
              : 0;
          },
      arePositionsCompatible: elementOverrides.arePositionsCompatible
        ? elementOverrides.arePositionsCompatible
        : (
            elementId: Id,
            mergeContext: II3WMergeContext<MapsInterface, U>
          ): boolean => {
            const infoDiff = diffInfoOf(
              mergeContext.myDoc,
              mergeContext.theirDoc,
              elementType,
              elementId
            );
            return Object.keys(infoDiff).length === 0;
          },
      addElement: elementOverrides.addElement
        ? elementOverrides.addElement
        : <ElementType extends IParentedId>(
            element: ElementType,
            parentPath: Path<MapsInterface>,
            position: SubEntityPathElement<MapsInterface>,
            mergeContext: II3WMergeContext<MapsInterface, U>
          ): ElementType => {
            const insertCmd: IInsertElement<
              ElementType,
              MapsInterface,
              keyof ElementType,
              U
            > = {
              __typename: HDocCommandType.INSERT_ELEMENT,
              element: stripChildrenFromElement(
                mergeContext.mergedDoc.schema,
                elementType,
                element
              ),
              parentPath,
              position,
              targetElement: element._id
                ? {
                    __typename: elementType,
                    _id: element._id
                  }
                : undefined
            };
            const newElement = mergeContext.mergedDoc.insertElement(insertCmd);
            return newElement;
          }
    };
    elementTypesOverridesMap.set(typeUid, overridableFunctions!);
  }
  return overridableFunctions!;
}

/**
 * Creates the desired shape of the merged three during a three-way
 * merge of a NormalizedDocument.
 *
 * @param {II3WMergeContext<MapsInterface, U>} mergeCtx
 * @returns {IMutableDocument<MapsInterface, U>}
 */
function buildMergedTree<MapsInterface, U extends keyof MapsInterface>(
  mergeCtx: II3WMergeContext<MapsInterface, U>
): IMutableDocument<MapsInterface, U> {
  const {myDoc: left, theirDoc: right, mergedDoc} = mergeCtx;
  for (
    const nodeQueue: Array<[U, Id]> = [[mergedDoc.rootType, mergedDoc.rootId]],
      nodesInQueue: Set<string> = new Set([
        getElementUid(mergedDoc.rootType, mergedDoc.rootId)
      ]);
    nodeQueue.length > 0;

  ) {
    const [nodeType, nodeId] = nodeQueue.shift()!;
    const {mergeElementInfo} = fnsForElementType(mergeCtx, nodeType);
    const baseEl = mappedElement(
      mergedDoc.maps,
      nodeType,
      nodeId
    ) as IParentedId<U, U>;
    const leftEl = hasMappedElement(left.maps, nodeType, nodeId)
      ? (mappedElement(left.maps, nodeType, nodeId) as IParentedId<U, U>)
      : null;
    const rightEl = hasMappedElement(right.maps, nodeType, nodeId)
      ? (mappedElement(right.maps, nodeType, nodeId) as IParentedId<U, U>)
      : null;
    mergeElementInfo(baseEl, leftEl, rightEl, mergeCtx);
    const nodeSchema = mergedDoc.schema.types[nodeType];
    for (const linkField in nodeSchema) {
      if (linkField === 'parentId') continue;
      const linkFieldProps = nodeSchema[linkField];
      if (Array.isArray(linkFieldProps)) {
        const elementsToPush = mergeLinkedArray(
          mergeCtx,
          nodeType,
          nodeId,
          (linkFieldProps[0] as IFieldEntityReference<U>).__schemaType,
          linkField as AllMappedTypesFields<MapsInterface>
        ).filter(([nodeType, nodeId]) => {
          const nodeUid = getElementUid(nodeType, nodeId);
          if (nodesInQueue.has(nodeUid)) {
            return false;
          }
          nodesInQueue.add(nodeUid);
          return true;
        });
        nodeQueue.push(...elementsToPush);
      }
      // We only expect children arrays, we don't deal with one to one
      // linked fields. They should be modelled as single element arrays,
      // so that in merges we could clone copies if needed.
    }
  }
  const elementsToDelete: Array<[U, Id]> = [];
  visitDocument(
    mergedDoc,
    (doc, nodeType, nodeId) => {
      const nodeUid = getElementUid(nodeType, nodeId);
      const existsLeft = hasMappedElement(
        mergeCtx.myDoc.maps,
        nodeType,
        nodeId
      );
      const editedLeft = existsLeft
        ? mergeCtx.myElementsMergeState.get(nodeUid)!.isInEditedPath
        : false;
      const existsRight = hasMappedElement(
        mergeCtx.theirDoc.maps,
        nodeType,
        nodeId
      );
      const editedRight = existsLeft
        ? mergeCtx.theirElementsMergeState.get(nodeUid)!.isInEditedPath
        : false;
      if ((!existsLeft || !existsRight) && !editedLeft && !editedRight) {
        elementsToDelete.push([nodeType, nodeId]);
      }
    },
    {},
    DocumentVisitTraversal.DEPTH_FIRST
  );
  for (const [nodeType, nodeId] of elementsToDelete) {
    const {onDeleteElement} = fnsForElementType(mergeCtx, nodeType);
    onDeleteElement(nodeId, mergeCtx);
  }
  return mergedDoc;
}

function isOkMergeZone(obj: any): obj is IMergeOkRegion<any> {
  return obj && obj.ok && Array.isArray(obj.ok);
}

function isConflictMergeZone(obj: any): obj is IMergeConflictRegion<any> {
  return (
    obj &&
    typeof obj.conflict === 'object' &&
    Array.isArray(obj.conflict.a) &&
    Array.isArray(obj.conflict.b) &&
    Array.isArray(obj.conflict.o) &&
    typeof obj.conflict.a === 'number' &&
    typeof obj.conflict.b === 'number' &&
    typeof obj.conflict.o === 'number'
  );
}

enum ProcessingOrderFrom {
  both,
  left,
  right
}

interface IProcessingOrderElement {
  _id: Id;
  from: ProcessingOrderFrom;
}

/**
 * Creates a processing order for a linked array field of
 * a parent element during a three-way merge.
 *
 * Each element of the processing order will be an ID and
 * the provenience of the id (left, right or both trees)
 *
 * @param {II3WMergeContext<MapsInterface, U>} mergeCtx
 * @param {U} parentType
 * @param {Id} parentId
 * @param {U} childType
 * @param {AllMappedTypesFields<MapsInterface>} linkedArrayField
 * @returns {IProcessingOrderElement[]}
 */
function determineLinkedArrayProcessingOrder<
  MapsInterface,
  U extends keyof MapsInterface
>(
  mergeCtx: II3WMergeContext<MapsInterface, U>,
  parentType: U,
  parentId: Id,
  childType: U,
  linkedArrayField: AllMappedTypesFields<MapsInterface>
): IProcessingOrderElement[] {
  const {cmpSiblings} = fnsForElementType(mergeCtx, parentType);
  const baseArray: Id[] = mappedElement(
    mergeCtx.mergedDoc.maps,
    parentType,
    parentId
  )[linkedArrayField] as Id[];
  const leftArray: Id[] = hasMappedElement(
    mergeCtx.myDoc.maps,
    parentType,
    parentId
  )
    ? (mappedElement(mergeCtx.myDoc.maps, parentType, parentId)[
        linkedArrayField
      ] as Id[]).slice()
    : [];
  const rightArray: Id[] = hasMappedElement(
    mergeCtx.theirDoc.maps,
    parentType,
    parentId
  )
    ? (mappedElement(mergeCtx.theirDoc.maps, parentType, parentId)[
        linkedArrayField
      ] as Id[]).slice()
    : [];
  const idsInProcessingOrder: IProcessingOrderElement[] = [];
  const mergeZones = diff3Merge(baseArray, leftArray, rightArray);
  for (const mergeZone of mergeZones) {
    if (isOkMergeZone(mergeZone)) {
      idsInProcessingOrder.push(
        ...mergeZone.ok.map(id => ({_id: id, from: ProcessingOrderFrom.both}))
      );
    } else if (isConflictMergeZone(mergeZone)) {
      let {a, b} = mergeZone.conflict;
      const {o} = mergeZone.conflict;
      for (; a.length > 0 && b.length > 0; ) {
        const leftId: Id | null = a.length > 0 ? a[0] : null;
        const rightId: Id | null = b.length > 0 ? b[0] : null;
        if (leftId === null) {
          idsInProcessingOrder.push(
            ...b.map(id => ({_id: id, from: ProcessingOrderFrom.right}))
          );
          b = [];
        } else if (rightId === null) {
          idsInProcessingOrder.push(
            ...a.map(id => ({_id: id, from: ProcessingOrderFrom.left}))
          );
          a = [];
        } else {
          if (leftId === rightId) {
            idsInProcessingOrder.push({
              _id: b.shift()!,
              from: ProcessingOrderFrom.both
            });
            a.shift();
            if (o.length > 0 && leftId === o[0]) {
              o.shift();
            }
          } else {
            const baseEl =
              b.length > 0
                ? (mappedElement(
                    mergeCtx.mergedDoc.maps,
                    childType,
                    o[0]
                  ) as IParentedId<U, U>)
                : null;
            const leftEl: IParentedId<U, U> | null = leftId
              ? (mappedElement(
                  mergeCtx.myDoc.maps,
                  childType,
                  leftId
                ) as IParentedId<U, U>)
              : null;
            const rightEl: IParentedId<U, U> | null = rightId
              ? (mappedElement(
                  mergeCtx.theirDoc.maps,
                  childType,
                  rightId
                ) as IParentedId<U, U>)
              : null;
            const siblingsComparison = cmpSiblings(
              baseEl,
              leftEl,
              rightEl,
              mergeCtx
            );
            const idPicked: Id =
              siblingsComparison === 0 || siblingsComparison < 1 ? a[0] : b[0];
            idsInProcessingOrder.push({
              _id: idPicked,
              from:
                siblingsComparison === 0
                  ? ProcessingOrderFrom.both
                  : siblingsComparison < 1
                  ? ProcessingOrderFrom.left
                  : ProcessingOrderFrom.right
            });
            if (a.length > 0 && a[0] === idPicked) {
              a.shift();
            }
            if (b.length > 0 && b[0] === idPicked) {
              b.shift();
            }
            if (o.length > 0 && o[0] === idPicked) {
              o.shift();
            }
          }
        }
      }
    }
  }
  return idsInProcessingOrder;
}

/**
 * Given a parent node and the name a linked field representing an array
 * of ids to elements of type childType, creates a merged version
 * of the array in mergeCtx.mergedDoc
 *
 * @param {II3WMergeContext<MapsInterface, U>} mergeCtx
 * @param {U} parentType
 * @param {Id} parentId
 * @param {U} childType
 * @param {AllMappedTypesFields<MapsInterface>} linkedArrayField
 * @returns {Array<[U, Id]>}
 */
function mergeLinkedArray<MapsInterface, U extends keyof MapsInterface>(
  mergeCtx: II3WMergeContext<MapsInterface, U>,
  parentType: U,
  parentId: Id,
  childType: U,
  linkedArrayField: AllMappedTypesFields<MapsInterface>
): Array<[U, Id]> {
  const {
    mergedDoc,
    myDoc,
    theirDoc,
    myElementsMergeState,
    theirElementsMergeState
  } = mergeCtx;
  const {
    addElement,
    moveToMergePosition,
    arePositionsCompatible,
    onIncompatibleElementVersions
  } = fnsForElementType(mergeCtx, childType);
  const childrenToProcess: IProcessingOrderElement[] = determineLinkedArrayProcessingOrder(
    mergeCtx,
    parentType,
    parentId,
    childType,
    linkedArrayField
  );
  const childrenToQueue: Array<[U, Id]> = [];
  const parentPath = pathForElementWithId(mergedDoc, parentType, parentId);
  const leftArray: Id[] = hasMappedElement(
    mergeCtx.myDoc.maps,
    parentType,
    parentId
  )
    ? (mappedElement(mergeCtx.myDoc.maps, parentType, parentId)[
        linkedArrayField
      ] as Id[]).slice()
    : [];
  const rightArray: Id[] = hasMappedElement(
    mergeCtx.theirDoc.maps,
    parentType,
    parentId
  )
    ? (mappedElement(mergeCtx.theirDoc.maps, parentType, parentId)[
        linkedArrayField
      ] as Id[]).slice()
    : [];
  for (
    let i = 0, il = 0, ir = 0, mergedIndex = 0;
    i < childrenToProcess.length;
    i++
  ) {
    const mergedIndexAtStart = mergedIndex;
    const baseArray = mappedElement(mergedDoc.maps, parentType, parentId)[
      linkedArrayField
    ] as Id[];
    const baseChildId =
      baseArray.length > mergedIndex ? baseArray[mergedIndex] : null;
    const leftChildId = leftArray.length > il ? leftArray[il] : null;
    const rightChildId = rightArray.length > ir ? rightArray[ir] : null;
    const {_id: childId, from: childFrom} = childrenToProcess[i];
    if (childId === leftChildId) il++;
    if (childId === rightChildId) ir++;
    const baseElement = hasMappedElement(mergedDoc.maps, childType, childId)
      ? (mappedElement(mergedDoc.maps, childType, childId) as IParentedId<U, U>)
      : null;
    const leftElement = hasMappedElement(myDoc.maps, childType, childId)
      ? (mappedElement(myDoc.maps, childType, childId) as IParentedId<U, U>)
      : null;
    const rightElement = hasMappedElement(theirDoc.maps, childType, childId)
      ? (mappedElement(theirDoc.maps, childType, childId) as IParentedId<U, U>)
      : null;
    const childUid = getElementUid(childType, childId);
    if (baseElement) {
      const leftState = myElementsMergeState.get(childUid);
      const rightState = theirElementsMergeState.get(childUid);
      if (
        leftState &&
        leftState.isInEditedPath &&
        rightState &&
        rightState.isInEditedPath
      ) {
        if (arePositionsCompatible(childId, mergeCtx)) {
          if (!leftState.hasPositionBeenProcessed) {
            if (baseChildId !== childId) {
              moveToMergePosition(
                childId,
                parentPath,
                [linkedArrayField, mergedIndex],
                mergeCtx
              );
            }
            mergedIndex++;
            leftState.hasPositionBeenProcessed = true;
            rightState.hasPositionBeenProcessed = true;
          }
        } else {
          const shouldAdvance = onIncompatibleElementVersions(
            childId,
            parentPath,
            [linkedArrayField, mergedIndex],
            childFrom === ProcessingOrderFrom.right ? 'right' : 'left',
            mergeCtx
          );
          if (shouldAdvance) mergedIndex++;
        }
      } else if (
        (leftState && leftState.isInEditedPath) ||
        (rightState && rightState.isInEditedPath)
      ) {
        // One of the two versions of the node is in an edited path, we
        // move it to the current position if the edited node is the one we
        // are meeting now
        if (
          leftState &&
          leftState.isInEditedPath &&
          (childFrom === ProcessingOrderFrom.left ||
            childFrom === ProcessingOrderFrom.both)
        ) {
          if (baseChildId !== childId) {
            moveToMergePosition(
              childId,
              parentPath,
              [linkedArrayField, mergedIndex],
              mergeCtx
            );
            leftState.hasPositionBeenProcessed = true;
            if (rightState) rightState.hasPositionBeenProcessed = true;
          }
          mergedIndex++;
        } else if (
          rightState &&
          rightState.isInEditedPath &&
          (childFrom === ProcessingOrderFrom.right ||
            childFrom === ProcessingOrderFrom.both)
        ) {
          moveToMergePosition(
            childId,
            parentPath,
            [linkedArrayField, mergedIndex],
            mergeCtx
          );
          rightState.hasPositionBeenProcessed = true;
          if (leftState) leftState.hasPositionBeenProcessed = true;
          mergedIndex++;
        }
      } else if (!leftElement || !rightElement) {
        // The node is not present in at least one of the nodes, so
        // it should be deleted. Right now we don't do anything, it
        // will be removed at the end of the merge process. We only marked
        // the node as processed.
        if (leftState) {
          leftState.hasPositionBeenProcessed = true;
          leftState.haveInfoAndChildrenBeenProcessed = true;
        }
        if (rightState) {
          rightState.hasPositionBeenProcessed = true;
          rightState.haveInfoAndChildrenBeenProcessed = true;
        }
      } else {
        // The node is present in both nodes but it hasn't been edited.
        // We add it on the first occurrence
        if (leftState!.hasPositionBeenProcessed) {
          if (childId !== baseChildId) {
            moveToMergePosition(
              childId,
              parentPath,
              [linkedArrayField, mergedIndex],
              mergeCtx
            );
          }
          mergedIndex++;
          leftState!.hasPositionBeenProcessed = true;
          rightState!.hasPositionBeenProcessed = true;
          leftState!.haveInfoAndChildrenBeenProcessed = true;
          rightState!.haveInfoAndChildrenBeenProcessed = true;
        }
      }
    } else {
      const elementToAdd = (leftElement || rightElement)!;
      addElement(
        elementToAdd,
        parentPath,
        [linkedArrayField, mergedIndex],
        mergeCtx
      );
      const elementState =
        myElementsMergeState.get(childUid) ||
        theirElementsMergeState.get(childUid);
      elementState!.hasPositionBeenProcessed = true;
      mergedIndex++;
    }
    if (mergedIndex > mergedIndexAtStart) {
      childrenToQueue.push([childType, childId]);
    }
  }
  return childrenToQueue;
}

function getElementUid<U>(elementType: U, elemendId: Id): string {
  return `${elementType}:${elemendId}`;
}

/**
 * Creates a map of IMergeElementsState records for each element in the
 * document, in preparation for a merge.
 *
 * @param {INormalizedDocument<MapsInterface, U>} baseDoc
 * @param {INormalizedDocument<MapsInterface, U>} laterDoc
 * @returns {Map<string, IMergeElementsState>}
 */
function buildMergeElementsState<MapsInterface, U extends keyof MapsInterface>(
  baseDoc: INormalizedDocument<MapsInterface, U>,
  laterDoc: INormalizedDocument<MapsInterface, U>
): Map<string, IMergeElementsState> {
  const mergeElementsState: Map<string, IMergeElementsState> = new Map();
  visitDocument(
    laterDoc,
    (doc, nodeType, nodeId) => {
      mergeElementsState.set(getElementUid(nodeType, nodeId), {
        hasPositionBeenProcessed: false,
        haveInfoAndChildrenBeenProcessed: false,
        isInBaseTree: hasMappedElement(baseDoc.maps, nodeType, nodeId),
        isInEditedPath: false,
        mergedElementId: nodeId
      });
    },
    {}
  );
  const branchChanges = diff(baseDoc, laterDoc);
  for (const branchChange of branchChanges) {
    if (branchChange.__typename === HDocCommandType.DELETE_ELEMENT) {
      // The element is not in later tree nor in the mergeElementsState, I can
      // just skip it
      continue;
    }
    const {__typename, _id} = branchChange.targetElement!;
    for (
      let nextType: U | null = __typename, nextId: null | Id = _id, i = 0;
      nextId !== null && nextType !== null && i < 10000;
      i++
    ) {
      const element = mappedElement(
        laterDoc.maps,
        nextType,
        nextId
      ) as IParentedId;
      if (!isParentedId(element)) {
        nextId = null;
      } else {
        const elementUid = getElementUid(__typename, _id);
        const elementState = mergeElementsState.get(elementUid);
        if (elementState) {
          mergeElementsState.set(elementUid, {
            ...elementState,
            isInEditedPath: true
          });
        }
        nextId = element.parentId;
        nextType = element.parentType;
      }
    }
  }
  return mergeElementsState;
}

/**
 * Creates a shallow copy of the element record with the given type and id, and strips it of
 * all its children.
 *
 * @param {INormalizedDocument<MapsInterface, U> | IMutableDocument<MapsInterface, U>} doc
 * @param {U} elementType
 * @param {Id} elementId
 * @returns {T}
 */
function stripChildrenFromElement<
  MapsInterface,
  U extends keyof MapsInterface,
  T extends IParentedId<U, U>
>(schema: IDocumentSchema<MapsInterface, U>, elementType: U, element: T): T {
  const clonedElement = {
    ...element
  };
  const fieldsMap = schema.types[elementType];
  for (const fieldName in fieldsMap) {
    if (fieldName === 'parentId') continue;
    if (Array.isArray(fieldsMap[fieldName])) {
      (clonedElement as any)[fieldName] = [];
    } else {
      (clonedElement as any)[fieldName] = null;
    }
  }
  return clonedElement;
}
