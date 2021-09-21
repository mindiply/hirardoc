import {
  diff3Merge,
  IMergeConflictRegion,
  IMergeOkRegion,
  MergeRegion
} from 'node-diff3';
import {isEqual} from 'lodash';
import {
  cloneNormalizedDocument,
  idAndTypeForPath,
  idAndTypeOfChange,
  mutableDocument,
  parentToChildFieldName,
  pathForElementWithId
} from './HDocument';
import {
  AllMappedTypesFields,
  ArrayChange,
  ArrayKeepElement,
  ConflictsMap,
  DocumentVisitTraversal,
  ElementInfoConflicts,
  EqualFn,
  HDocCommandType,
  IChangeElement,
  Id,
  IDeleteElement,
  IDocumentSchema,
  IElementConflicts,
  IFieldEntityReference,
  IGetterSetter,
  II3MergeResult,
  II3WMergeContext,
  IInsertElement,
  IMergeElementOverrides,
  IMergeElementsState,
  IMergeHooks,
  IMergeOptions,
  IMoveElement,
  IMutableDocument,
  INormalizedDocument,
  INormalizedMutableMapsDocument,
  IParentedId,
  IProcessingOrderElement,
  IValueConflict,
  MapsOfNormDoc,
  MergeStatus,
  Path,
  ProcessingOrderFrom,
  SubEntityPathElement,
  UOfNormDoc
} from './HTypes';
import {visitDocument} from './HVisit';
import {
  applyArrayDiff,
  defaultEquals,
  diff,
  diffArray,
  diffElementInfo
} from './HDiff';
import {
  assert,
  generateNewId,
  hasMappedElement,
  isNullableId,
  isParentedId,
  mappedElement
} from './HUtils';

type DataValue = string | Date | number | boolean | Array<any>;

function isDataValue(obj: any): obj is DataValue {
  return (
    typeof obj === 'string' ||
    typeof obj === 'number' ||
    typeof obj === 'boolean' ||
    obj instanceof Date ||
    Array.isArray(obj)
  );
}

// function mergeArrays<T>(
//   baseValue: T[],
//   myValue: T[],
//   theirValue: T[]
// ): T[] | IValueConflict<T[]> {
//
// }

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
    typeof baseValue === 'boolean' &&
    typeof theirValue === 'boolean' &&
    typeof myValue === 'boolean'
  ) {
    mergedValue = myValue;
  } else if (
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
    mergedValue = (
      res.every(region => typeof region === 'string')
        ? res.join('')
        : myValue < theirValue
        ? myValueInp
        : theirValueInp
    ) as T;
  } else if (
    Array.isArray(baseValue) &&
    Array.isArray(myValue) &&
    Array.isArray(theirValue)
  ) {
    mergedValue = threeWayMergeArray(
      baseValue,
      myValue,
      theirValue,
      isEqual
    ) as T;
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

type NDoc = INormalizedDocument<any, any>;

const defaultHooks: IMergeHooks<NDoc> = {
  onIncompatibleElementVersions: (
    elementType,
    elementId,
    parentPath,
    position,
    versionMoved,
    mergeCtx
  ) => {
    const {newElementId} = reIdElementSubtree(
      mergeCtx,
      versionMoved === ProcessingOrderFrom.left
        ? ProcessingOrderFrom.right
        : ProcessingOrderFrom.left,
      elementType,
      elementId
    );
    const cloneId = newElementId;
    const elementConflicts =
      mergeCtx.conflicts[elementType].get(elementId) || {};
    elementConflicts.positionConflicts = {
      clonedElements: [cloneId],
      mergeStatus: MergeStatus.autoMerged
    };
    mergeCtx.conflicts[elementType].set(elementId, elementConflicts);
    let currentId: Id | null = null;
    let currentType: UOfNormDoc<NDoc> | null = null;
    try {
      const {_id, __typename} = idAndTypeForPath(
        mergeCtx.mergedDoc,
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
        MapsOfNormDoc<NDoc>,
        UOfNormDoc<NDoc>,
        IParentedId<UOfNormDoc<NDoc>, UOfNormDoc<NDoc>>
      > = {
        __typename: HDocCommandType.MOVE_ELEMENT,
        element: pathForElementWithId(
          mergeCtx.mergedDoc,
          elementType,
          elementId
        ),
        toParent: parentPath,
        toPosition: position,
        changes: {
          __typename: elementType
        }
      };
      mergeCtx.mergedDoc.moveElement(moveElementCmd);
    }
    if (versionMoved === ProcessingOrderFrom.left) {
      mergeCtx.myElementsMergeState.set(
        getElementUid(elementType, cloneId),
        mergeCtx.myElementsMergeState.get(
          getElementUid(elementType, elementId)
        )!
      );
    } else {
      mergeCtx.theirElementsMergeState.set(
        getElementUid(elementType, cloneId),
        mergeCtx.theirElementsMergeState.get(
          getElementUid(elementType, elementId)
        )!
      );
    }
    return {
      advancedMergingIndex: true,
      rebasedIds: [
        {
          rebasedSide:
            versionMoved === ProcessingOrderFrom.left
              ? ProcessingOrderFrom.right
              : ProcessingOrderFrom.left,
          _id: elementId,
          newId: cloneId
        }
      ]
    };
  },
  moveToMergePosition: (
    elementType,
    elementId,
    toParentPath,
    toPosition,
    mergeContext
  ) => {
    const moveCmd: IMoveElement<
      MapsOfNormDoc<NDoc>,
      UOfNormDoc<NDoc>,
      IParentedId<UOfNormDoc<NDoc>, UOfNormDoc<NDoc>>
    > = {
      __typename: HDocCommandType.MOVE_ELEMENT,
      element: pathForElementWithId(
        mergeContext.mergedDoc,
        elementType,
        elementId
      ),
      toParent: toParentPath,
      toPosition
    };
    mergeContext.mergedDoc.moveElement(moveCmd);
  },
  mergeElementInfo: <
    T extends IParentedId<UOfNormDoc<NDoc>, UOfNormDoc<NDoc>>,
    K extends keyof T = keyof T
  >(
    mergeContext: II3WMergeContext<NDoc>,
    elementType: UOfNormDoc<NDoc>,
    base: T | null,
    a: T | null,
    b: T | null,
    ignoreFields?: K[]
  ) => {
    let elementInfoDiff: Partial<T> | null = null;

    if (a && b && base) {
      const mergeElement = mappedElement(
        mergeContext.mergedDoc.maps,
        elementType,
        base._id
      ) as T;
      const mergeRes = mergeElementInfo(
        mergeContext.mergedDoc.schema,
        elementType,
        base,
        a,
        b,
        ignoreFields
      );
      if (mergeRes.conflicts) {
        const elementConflicts: IElementConflicts<
          MapsOfNormDoc<NDoc>[typeof elementType]
        > = mergeContext.conflicts[elementType].get(base._id) || {};
        mergeContext.conflicts[elementType].set(base._id, {
          ...elementConflicts,
          infoConflicts:
            mergeRes.conflicts as MapsOfNormDoc<NDoc>[typeof elementType]
        });
      }
      elementInfoDiff = diffElementInfo(
        mergeContext.mergedDoc.schema,
        elementType,
        mergeElement,
        mergeRes.mergedElement
      );
    } else if (base && (a || b)) {
      const mergeElement = mappedElement(
        mergeContext.mergedDoc.maps,
        elementType,
        base._id
      ) as T;
      const laterEl = a ? a : b;
      elementInfoDiff = diffElementInfo(
        mergeContext.mergedDoc.schema,
        elementType,
        mergeElement,
        laterEl!
      );
    }
    if (elementInfoDiff && Object.keys(elementInfoDiff).length > 0) {
      const changeCmd: IChangeElement<
        MapsOfNormDoc<NDoc>,
        UOfNormDoc<NDoc>,
        T
      > = {
        __typename: HDocCommandType.CHANGE_ELEMENT,
        element: pathForElementWithId(
          mergeContext.mergedDoc,
          elementType,
          (base as IParentedId)._id
        ),
        changes: {
          ...elementInfoDiff,
          __typename: elementType as UOfNormDoc<NDoc>
        }
      };
      mergeContext.mergedDoc.changeElement(changeCmd);
    }
  },
  onDeleteElement: (elementType, elementId, mergeContext) => {
    const deleteCmd: IDeleteElement<MapsOfNormDoc<NDoc>, UOfNormDoc<NDoc>> = {
      __typename: HDocCommandType.DELETE_ELEMENT,
      element: pathForElementWithId(
        mergeContext.mergedDoc,
        elementType,
        elementId
      )
    };
    mergeContext.mergedDoc.deleteElement(deleteCmd);
  },
  cmpSiblings: (elementType, base, a, b) => {
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
  arePositionsCompatible: (elementType, elementId, fromSide, mergeContext) => {
    const leftElement = hasMappedElement(
      mergeContext.myDoc().maps,
      elementType,
      elementId
    )
      ? (mappedElement(
          mergeContext.myDoc().maps,
          elementType,
          elementId
        ) as IParentedId)
      : null;
    const rightElement = hasMappedElement(
      mergeContext.theirDoc().maps,
      elementType,
      elementId
    )
      ? (mappedElement(
          mergeContext.theirDoc().maps,
          elementType,
          elementId
        ) as IParentedId)
      : null;
    if (!(leftElement && rightElement)) return true;
    if (
      !isNullableId(leftElement.parentId) &&
      !isNullableId(rightElement.parentId)
    ) {
      return true;
    }
    if (
      leftElement.parentId !== rightElement.parentId ||
      leftElement.parentType !== rightElement.parentType
    ) {
      return false;
    }
    return fromSide === ProcessingOrderFrom.both;
  },
  addElement: <
    ElementType extends IParentedId<UOfNormDoc<NDoc>, UOfNormDoc<NDoc>>
  >(
    elementType: UOfNormDoc<NDoc>,
    element: ElementType,
    parentPath: Path<MapsOfNormDoc<NDoc>>,
    position: SubEntityPathElement<MapsOfNormDoc<NDoc>>,
    mergeContext: II3WMergeContext<NDoc>
  ): ElementType => {
    const insertCmd: IInsertElement<
      MapsOfNormDoc<NDoc>,
      UOfNormDoc<NDoc>,
      ElementType
    > = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      element: stripChildrenFromElement(
        mergeContext.mergedDoc.schema,
        elementType,
        element
      ),
      parent: parentPath,
      position
    };
    return mergeContext.mergedDoc.insertElement(insertCmd);
  }
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
 * @param {MergeOverridesMap<MapsInterface, U, ElementType>} options
 * @returns {II3MergeResult<MapsInterface, U>}
 */
export function threeWayMerge<NorDoc extends INormalizedDocument<any, any>>(
  baseDoc: NorDoc,
  myDoc: NorDoc,
  theirDoc: NorDoc,
  options?: IMergeOptions<NorDoc>
): II3MergeResult<NorDoc> {
  const mergedDoc =
    options && options.onCreateMutableDocument
      ? options.onCreateMutableDocument(myDoc)
      : mutableDocument(myDoc);
  const mergeContext: II3WMergeContext<NorDoc> = {
    mergedDoc,
    myElementsMergeState: buildMergeElementsState(baseDoc, myDoc),
    theirElementsMergeState: buildMergeElementsState(baseDoc, theirDoc),
    baseDoc,
    myDoc: createGetterSetter(myDoc),
    theirDoc: createGetterSetter(theirDoc),
    elementsToDelete: [],
    conflicts: {} as ConflictsMap<MapsOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>,
    overrides:
      options && options.elementsOverrides ? options.elementsOverrides : {},
    defaultHooks: defaultHooks as any as IMergeHooks<NorDoc>
  };
  for (const elementType in baseDoc.maps) {
    // ToDo resolve this type error
    // @ts-expect-error
    mergeContext.conflicts[elementType as U] = new Map();
  }
  buildMergedTree(mergeContext);
  const updatedDoc = mergedDoc.updatedDocument();
  return {
    mergedDoc: updatedDoc,
    conflicts: mergeContext.conflicts
  };
}

export function mergeElementInfo<
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
      excludeFields.indexOf(fieldName as any as K) !== -1 ||
      !isDataValue(cloneElement[fieldName])
    ) {
      continue;
    }
    const mergedVal = mergeDataValues(
      baseElement[fieldName as keyof ElementType] as any as DataValue,
      leftElement[fieldName as keyof ElementType] as any as DataValue,
      rightElement[fieldName as keyof ElementType] as any as DataValue
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

const getElementTypeUid = <MapsInterface, U extends keyof MapsInterface>(
  doc:
    | INormalizedDocument<MapsInterface, U>
    | INormalizedMutableMapsDocument<MapsInterface, U>,
  elementType: U
): string => `${doc.schema.documentType}.${elementType}`;

const elementTypesOverridesMap: Map<
  string,
  IMergeElementOverrides<any, any>
> = new Map();

function createGetterSetter<T>(value: T): IGetterSetter<T> {
  let val = value;
  return (newValue?) => {
    if (newValue !== undefined) {
      val = newValue;
    }
    return val;
  };
}

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
function reIdElementSubtree<NorDoc extends INormalizedDocument<any, any>>(
  context: II3WMergeContext<NorDoc>,
  treeToRebase: ProcessingOrderFrom.left | ProcessingOrderFrom.right,
  elementType: UOfNormDoc<NorDoc>,
  elementId: Id
): {doc: NorDoc; newElementId: Id} {
  const document =
    treeToRebase === ProcessingOrderFrom.left
      ? context.myDoc()
      : context.theirDoc();
  const newIds: Map<string, Id> = new Map();
  const elUid = getElementUid(elementType, elementId);
  const changedDocument = cloneNormalizedDocument(document);

  // First I generate Ids for all the elements in the subtree
  visitDocument(
    document,
    (doc, nodeType, nodeId) => {
      const nodeUid = getElementUid(nodeType, nodeId);
      const newId = generateNewId();
      if (!newIds.has(nodeUid)) {
        newIds.set(nodeUid, newId);
        if (treeToRebase === ProcessingOrderFrom.left) {
          context.myElementsMergeState.set(
            getElementUid(nodeType, newId),
            context.myElementsMergeState.get(getElementUid(nodeType, nodeId))!
          );
        } else {
          context.theirElementsMergeState.set(
            getElementUid(nodeType, newId),
            context.theirElementsMergeState.get(
              getElementUid(nodeType, nodeId)
            )!
          );
        }
      }
    },
    {
      context: {},
      traversal: DocumentVisitTraversal.DEPTH_FIRST,
      startElement: {
        type: elementType,
        _id: elementId
      }
    }
  );

  const rebasingRootElement = mappedElement(
    changedDocument.maps,
    elementType,
    elementId
  ) as IParentedId;
  const rebasedRootId = newIds.get(elUid)!;
  if (rebasingRootElement.parentId && rebasingRootElement.parentType) {
    const parent = mappedElement(
      changedDocument.maps,
      rebasingRootElement.parentType,
      rebasingRootElement.parentId
    ) as IParentedId;
    const parentToChildField = parentToChildFieldName(
      changedDocument,
      rebasingRootElement.parentType,
      elementType
    );
    const newParent = {
      ...parent,
      [parentToChildField]: (
        (parent as any)[parentToChildField] as Id[]
      ).slice()
    };
    const oldIndex = ((newParent as any)[parentToChildField] as Id[]).indexOf(
      elementId
    );
    if (oldIndex !== -1) {
      ((newParent as any)[parentToChildField] as Id[])[oldIndex] =
        rebasedRootId;
    }
    (
      changedDocument.maps[
        rebasingRootElement.parentType as UOfNormDoc<NorDoc>
      ] as Map<Id, IParentedId>
    ).set(rebasingRootElement.parentId, newParent);
  } else {
    changedDocument.rootId = rebasedRootId;
  }

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
      const reIdUid = getElementUid(elementType, elementId);
      const reIdedElement = {
        ...element,
        _id: newIds.get(reIdUid)!
      };
      const nodeSchema = doc.schema.types[elementType];
      const reIdedParentId: null | Id =
        element.parentId !== null &&
        newIds.has(getElementUid(element.parentType, element.parentId))
          ? newIds.get(getElementUid(element.parentType, element.parentId))!
          : null;
      for (const linkField in nodeSchema) {
        if (linkField === 'parentId' && reIdedParentId !== null) {
          reIdedElement.parentId = reIdedParentId;
          continue;
        }
        const linkFieldProps = nodeSchema[linkField];
        if (Array.isArray(linkFieldProps)) {
          const {__schemaType} = linkFieldProps[0];
          (reIdedElement as any)[linkField] = (
            (reIdedElement as any)[linkField] as Id[]
          ).map(
            existingId => newIds.get(getElementUid(__schemaType, existingId))!
          );
        } else {
          const {__schemaType} = linkFieldProps as IFieldEntityReference<
            UOfNormDoc<NorDoc>
          >;
          (reIdedElement as any)[linkField] = newIds.get(
            getElementUid(__schemaType, (reIdedElement as any)[linkField] as Id)
          )!;
        }
      }
      doc.maps[elementType].set(reIdedElement._id, reIdedElement);
      doc.maps[elementType].delete(elementId);
    },
    {
      context: {},
      traversal: DocumentVisitTraversal.DEPTH_FIRST,
      startElement: {
        type: elementType,
        _id: elementId
      }
    }
  );

  if (treeToRebase === ProcessingOrderFrom.left) {
    context.myDoc(changedDocument);
  } else {
    context.theirDoc(changedDocument);
  }
  return {
    doc: changedDocument,
    newElementId: newIds.get(elUid)!
  };
}

/**
 * Provides the functions to use for an elementType
 * @param {II3WMergeContext<MapsInterface, U>} context
 * @param {U} elementType
 * @returns {IMergeElementOverrides<MapsInterface, U, MapsInterface[typeof elementType]>}
 */
function fnsForElementType<
  NorDoc extends INormalizedDocument<any, any>,
  ElementType extends IParentedId<UOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>
>(
  context: II3WMergeContext<NorDoc>,
  elementType: UOfNormDoc<NorDoc>
): IMergeElementOverrides<ElementType, NorDoc> {
  const typeUid = getElementTypeUid(context.myDoc(), elementType);
  let overridableFunctions:
    | undefined
    | IMergeElementOverrides<ElementType, NorDoc> =
    elementTypesOverridesMap.get(typeUid);
  if (!overridableFunctions) {
    const {overrides} = context;
    const elementOverrides =
      overrides && elementType in overrides
        ? overrides[elementType]!
        : ({} as IMergeElementOverrides<any, NorDoc>);
    overridableFunctions = {
      onIncompatibleElementVersions:
        elementOverrides.onIncompatibleElementVersions
          ? elementOverrides.onIncompatibleElementVersions
          : (elementId, parentPath, position, versionMoved, mergeContext) =>
              context.defaultHooks.onIncompatibleElementVersions(
                elementType,
                elementId,
                parentPath,
                position,
                versionMoved,
                mergeContext
              ),
      moveToMergePosition: elementOverrides.moveToMergePosition
        ? elementOverrides.moveToMergePosition
        : (elementId, toParentPath, toPosition, mergeContext) =>
            context.defaultHooks.moveToMergePosition(
              elementType,
              elementId,
              toParentPath,
              toPosition,
              mergeContext
            ),
      mergeElementInfo: elementOverrides.mergeElementInfo
        ? elementOverrides.mergeElementInfo
        : <
            ElementType extends IParentedId<
              UOfNormDoc<NorDoc>,
              UOfNormDoc<NorDoc>
            >,
            K extends keyof ElementType = keyof ElementType
          >(
            base: ElementType | null,
            a: ElementType | null,
            b: ElementType | null,
            mergeContext: II3WMergeContext<NorDoc>,
            ignoreFields?: K[]
          ) =>
            context.defaultHooks.mergeElementInfo(
              mergeContext,
              elementType,
              base,
              a,
              b,
              ignoreFields
            ),
      onDeleteElement: elementOverrides.onDeleteElement
        ? elementOverrides.onDeleteElement
        : (elementId, mergeContext) =>
            context.defaultHooks.onDeleteElement(
              elementType,
              elementId,
              mergeContext
            ),
      cmpSiblings: elementOverrides.cmpSiblings
        ? elementOverrides.cmpSiblings
        : (base, a, b, mergeCtx) =>
            context.defaultHooks.cmpSiblings(elementType, base, a, b, mergeCtx),
      arePositionsCompatible: elementOverrides.arePositionsCompatible
        ? elementOverrides.arePositionsCompatible
        : (elementId, fromSide, mergeContext) =>
            context.defaultHooks.arePositionsCompatible(
              elementType,
              elementId,
              fromSide,
              mergeContext
            ),
      addElement: elementOverrides.addElement
        ? elementOverrides.addElement
        : <ElementType extends IParentedId>(
            element: ElementType,
            parentPath: Path<MapsOfNormDoc<NorDoc>>,
            position: SubEntityPathElement<MapsOfNormDoc<NorDoc>>,
            mergeContext: II3WMergeContext<NorDoc>
          ): ElementType =>
            context.defaultHooks.addElement(
              elementType,
              element,
              parentPath,
              position,
              mergeContext
            )
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
function buildMergedTree<NorDoc extends INormalizedDocument<any, any>>(
  mergeCtx: II3WMergeContext<NorDoc>
): IMutableDocument<MapsOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>, NorDoc> {
  const {myDoc: left, theirDoc: right, mergedDoc, baseDoc} = mergeCtx;
  for (
    const nodeQueue: Array<[UOfNormDoc<NorDoc>, Id]> = [
        [mergedDoc.rootType, mergedDoc.rootId]
      ],
      nodesInQueue: Set<string> = new Set([
        getElementUid(mergedDoc.rootType, mergedDoc.rootId)
      ]);
    nodeQueue.length > 0;

  ) {
    const [nodeType, nodeId] = nodeQueue.shift()!;
    const {mergeElementInfo} = fnsForElementType(mergeCtx, nodeType);
    const baseEl = hasMappedElement(baseDoc.maps, nodeType, nodeId)
      ? (mappedElement(baseDoc.maps, nodeType, nodeId) as IParentedId<
          UOfNormDoc<NorDoc>,
          UOfNormDoc<NorDoc>
        >)
      : null;
    const leftEl = hasMappedElement(left().maps, nodeType, nodeId)
      ? (mappedElement(left().maps, nodeType, nodeId) as IParentedId<
          UOfNormDoc<NorDoc>,
          UOfNormDoc<NorDoc>
        >)
      : null;
    const rightEl = hasMappedElement(right().maps, nodeType, nodeId)
      ? (mappedElement(right().maps, nodeType, nodeId) as IParentedId<
          UOfNormDoc<NorDoc>,
          UOfNormDoc<NorDoc>
        >)
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
          (linkFieldProps[0] as IFieldEntityReference<UOfNormDoc<NorDoc>>)
            .__schemaType,
          linkField as AllMappedTypesFields<MapsOfNormDoc<NorDoc>>
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
  const elementsToDelete: Array<[UOfNormDoc<NorDoc>, Id]> = [];
  visitDocument(
    mergedDoc,
    (doc, nodeType, nodeId) => {
      const nodeUid = getElementUid(nodeType, nodeId);
      const existsLeft = hasMappedElement(
        mergeCtx.myDoc().maps,
        nodeType,
        nodeId
      );
      const editedLeft = existsLeft
        ? mergeCtx.myElementsMergeState.get(nodeUid)!.isInEditedPath
        : false;
      const existsRight = hasMappedElement(
        mergeCtx.theirDoc().maps,
        nodeType,
        nodeId
      );
      const editedRight = existsRight
        ? mergeCtx.theirElementsMergeState.get(nodeUid)!.isInEditedPath
        : false;
      if ((!existsLeft || !existsRight) && !editedLeft && !editedRight) {
        elementsToDelete.push([nodeType, nodeId]);
      }
    },
    {
      context: {},
      traversal: DocumentVisitTraversal.DEPTH_FIRST
    }
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
    typeof obj.conflict.aIndex === 'number' &&
    typeof obj.conflict.bIndex === 'number' &&
    typeof obj.conflict.oIndex === 'number'
  );
}

/**
 * Creates an iterator over a three-way merging array
 * of children IDs.
 *
 * The iterator allows changing an id to a new one if this was
 * needed during the merging and we want to ensure the new rebased
 * value is used straight away.
 */
class NextSiblingToProcessIterator<NorDoc extends INormalizedDocument<any, any>>
  implements IterableIterator<IProcessingOrderElement>
{
  private baseArray: Id[];
  private _mergingArray: Id[];
  private _leftArray: Id[];
  private _rightArray: Id[];
  private mergeZones: MergeRegion<Id>[];
  private mergeCtx: II3WMergeContext<NorDoc>;
  private childType: UOfNormDoc<NorDoc>;
  private parentType: UOfNormDoc<NorDoc>;

  constructor(
    mergeCtx: II3WMergeContext<NorDoc>,
    parentType: UOfNormDoc<NorDoc>,
    parentId: Id,
    childType: UOfNormDoc<NorDoc>,
    linkedArrayField: AllMappedTypesFields<MapsOfNormDoc<NorDoc>>
  ) {
    this.mergeCtx = mergeCtx;
    this.childType = childType;
    this.parentType = parentType;
    this.baseArray = hasMappedElement(
      mergeCtx.baseDoc.maps,
      parentType,
      parentId
    )
      ? (mappedElement(mergeCtx.baseDoc.maps, parentType, parentId)[
          linkedArrayField
        ] as Id[])
      : [];
    this._mergingArray = (
      mappedElement(mergeCtx.mergedDoc.maps, parentType, parentId)[
        linkedArrayField
      ] as Id[]
    ).slice();
    this._leftArray = hasMappedElement(
      mergeCtx.myDoc().maps,
      parentType,
      parentId
    )
      ? (
          mappedElement(mergeCtx.myDoc().maps, parentType, parentId)[
            linkedArrayField
          ] as Id[]
        ).slice()
      : [];
    this._rightArray = hasMappedElement(
      mergeCtx.theirDoc().maps,
      parentType,
      parentId
    )
      ? (
          mappedElement(mergeCtx.theirDoc().maps, parentType, parentId)[
            linkedArrayField
          ] as Id[]
        ).slice()
      : [];
    this.mergeZones = diff3Merge(
      this._leftArray,
      this.baseArray,
      this._rightArray
    );
  }

  public next = (): IteratorResult<IProcessingOrderElement, undefined> => {
    if (this.mergeZones.length === 0) {
      return {
        done: true,
        value: undefined
      };
    }
    const mergeZone = this.mergeZones[0];
    if (isOkMergeZone(mergeZone)) {
      const nextId = mergeZone.ok.shift()!;
      const isInLeft = this._leftArray.indexOf(nextId) !== -1;
      const isInRight = this._rightArray.indexOf(nextId) !== -1;
      const nextFrom =
        isInLeft && isInRight
          ? ProcessingOrderFrom.both
          : isInLeft
          ? ProcessingOrderFrom.left
          : ProcessingOrderFrom.right;
      const nextValue: IProcessingOrderElement = {
        _id: nextId,
        from: nextFrom
      };
      if (mergeZone.ok.length === 0) {
        this.mergeZones.shift();
      }
      return {
        done: false,
        value: nextValue
      };
    } else if (isConflictMergeZone(mergeZone)) {
      let nextValue: IProcessingOrderElement | null = null;
      if (
        mergeZone.conflict.a.length === 0 &&
        mergeZone.conflict.b.length > 0
      ) {
        nextValue = {
          _id: mergeZone.conflict.b.shift()!,
          from: ProcessingOrderFrom.right
        };
      } else if (
        mergeZone.conflict.b.length === 0 &&
        mergeZone.conflict.a.length > 0
      ) {
        nextValue = {
          _id: mergeZone.conflict.a.shift()!,
          from: ProcessingOrderFrom.left
        };
      } else {
        const {
          conflict: {a, b, o}
        } = mergeZone;
        const leftId = a[0];
        const rightId = b[0];
        if (leftId === rightId) {
          nextValue = {
            _id: mergeZone.conflict.a.shift()!,
            from: ProcessingOrderFrom.left
          };
          mergeZone.conflict.b.shift();
        } else {
          const baseEl =
            o.length > 0
              ? (mappedElement(
                  this.mergeCtx.baseDoc.maps,
                  this.childType,
                  o[0]
                ) as IParentedId<UOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>)
              : null;
          const leftEl: IParentedId<
            UOfNormDoc<NorDoc>,
            UOfNormDoc<NorDoc>
          > | null = leftId
            ? (mappedElement(
                this.mergeCtx.myDoc().maps,
                this.childType,
                leftId
              ) as IParentedId<UOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>)
            : null;
          const rightEl: IParentedId<
            UOfNormDoc<NorDoc>,
            UOfNormDoc<NorDoc>
          > | null = rightId
            ? (mappedElement(
                this.mergeCtx.theirDoc().maps,
                this.childType,
                rightId
              ) as IParentedId<UOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>)
            : null;
          const {cmpSiblings} = fnsForElementType(
            this.mergeCtx,
            this.parentType
          );
          const siblingsComparison = cmpSiblings(
            baseEl,
            leftEl,
            rightEl,
            this.mergeCtx
          );
          nextValue = {
            _id:
              siblingsComparison === 0 || siblingsComparison < 1 ? a[0] : b[0],
            from:
              siblingsComparison === 0
                ? ProcessingOrderFrom.both
                : siblingsComparison < 1
                ? ProcessingOrderFrom.left
                : ProcessingOrderFrom.right
          };
          if (siblingsComparison <= 0) {
            a.shift();
          }
          if (siblingsComparison >= 0) {
            b.shift();
          }
          if (o.length > 0) {
            o.shift();
          }
        }
      }
      if (
        mergeZone.conflict.a.length === 0 &&
        mergeZone.conflict.b.length === 0
      ) {
        this.mergeZones.shift();
      }
      return nextValue
        ? {
            done: false,
            value: nextValue
          }
        : {
            done: true,
            value: undefined
          };
    } else {
      return {
        done: true,
        value: undefined
      };
    }
  };

  public reId(existingId: Id, newId: Id, sideToReId: ProcessingOrderFrom) {
    if (
      sideToReId === ProcessingOrderFrom.left ||
      sideToReId === ProcessingOrderFrom.both
    ) {
      for (let i = 0; i < this._leftArray.length; i++) {
        if (this._leftArray[i] === existingId) {
          this._leftArray[i] = newId;
        }
      }
    }
    if (
      sideToReId === ProcessingOrderFrom.right ||
      sideToReId === ProcessingOrderFrom.both
    ) {
      for (let i = 0; i < this._rightArray.length; i++) {
        if (this._rightArray[i] === existingId) {
          this._rightArray[i] = newId;
        }
      }
    }
    for (const mergeZone of this.mergeZones) {
      if (isOkMergeZone(mergeZone)) {
        for (let i = 0; i < mergeZone.ok.length; i++) {
          if (mergeZone.ok[i] === existingId) {
            mergeZone.ok[i] = newId;
          }
        }
      } else if (isConflictMergeZone(mergeZone)) {
        for (let i = 0; i < mergeZone.conflict.a.length; i++) {
          if (mergeZone.conflict.a[i] === existingId) {
            mergeZone.conflict.a[i] = newId;
          }
        }
        for (let i = 0; i < mergeZone.conflict.b.length; i++) {
          if (mergeZone.conflict.b[i] === existingId) {
            mergeZone.conflict.b[i] = newId;
          }
        }
        for (let i = 0; i < mergeZone.conflict.o.length; i++) {
          if (mergeZone.conflict.o[i] === existingId) {
            mergeZone.conflict.o[i] = newId;
          }
        }
      }
    }
  }

  public [Symbol.iterator](): IterableIterator<IProcessingOrderElement> {
    return this;
  }
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
function mergeLinkedArray<NorDoc extends INormalizedDocument<any, any>>(
  mergeCtx: II3WMergeContext<NorDoc>,
  parentType: UOfNormDoc<NorDoc>,
  parentId: Id,
  childType: UOfNormDoc<NorDoc>,
  linkedArrayField: AllMappedTypesFields<MapsOfNormDoc<NorDoc>>
): Array<[UOfNormDoc<NorDoc>, Id]> {
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
  const idsToProcessIterator = new NextSiblingToProcessIterator(
    mergeCtx,
    parentType,
    parentId,
    childType,
    linkedArrayField
  );
  const childrenToQueue: Array<[UOfNormDoc<NorDoc>, Id]> = [];
  const parentPath = pathForElementWithId(mergedDoc, parentType, parentId);
  for (
    let i = 0,
      il = 0,
      ir = 0,
      mergedIndex = 0,
      nextId = idsToProcessIterator.next();
    !nextId.done;
    nextId = idsToProcessIterator.next(), i++
  ) {
    const mergedIndexAtStart = mergedIndex;
    const baseArray = mappedElement(mergedDoc.maps, parentType, parentId)[
      linkedArrayField
    ] as Id[];
    const leftArray: Id[] = hasMappedElement(
      mergeCtx.myDoc().maps,
      parentType,
      parentId
    )
      ? (mappedElement(mergeCtx.myDoc().maps, parentType, parentId)[
          linkedArrayField
        ] as Id[])
      : [];
    const rightArray: Id[] = hasMappedElement(
      mergeCtx.theirDoc().maps,
      parentType,
      parentId
    )
      ? (mappedElement(mergeCtx.theirDoc().maps, parentType, parentId)[
          linkedArrayField
        ] as Id[])
      : [];
    const baseChildId =
      baseArray.length > mergedIndex ? baseArray[mergedIndex] : null;
    const leftChildId = leftArray.length > il ? leftArray[il] : null;
    const rightChildId = rightArray.length > ir ? rightArray[ir] : null;
    const {_id: childId, from: childFrom} = nextId.value;
    if (childId === leftChildId) il++;
    if (childId === rightChildId) ir++;
    const baseElement = hasMappedElement(mergedDoc.maps, childType, childId)
      ? (mappedElement(mergedDoc.maps, childType, childId) as IParentedId<
          UOfNormDoc<NorDoc>,
          UOfNormDoc<NorDoc>
        >)
      : null;
    const leftElement = hasMappedElement(myDoc().maps, childType, childId)
      ? (mappedElement(myDoc().maps, childType, childId) as IParentedId<
          UOfNormDoc<NorDoc>,
          UOfNormDoc<NorDoc>
        >)
      : null;
    const rightElement = hasMappedElement(theirDoc().maps, childType, childId)
      ? (mappedElement(theirDoc().maps, childType, childId) as IParentedId<
          UOfNormDoc<NorDoc>,
          UOfNormDoc<NorDoc>
        >)
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
        if (arePositionsCompatible(childId, childFrom, mergeCtx)) {
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
          const {advancedMergingIndex, rebasedIds} =
            onIncompatibleElementVersions(
              childId,
              parentPath,
              [linkedArrayField, mergedIndex],
              childFrom === ProcessingOrderFrom.right
                ? ProcessingOrderFrom.right
                : ProcessingOrderFrom.left,
              mergeCtx
            );
          for (const {_id: oldId, newId, rebasedSide} of rebasedIds) {
            idsToProcessIterator.reId(oldId, newId, rebasedSide);
          }
          if (advancedMergingIndex) mergedIndex++;
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
          if (baseChildId !== childId) {
            moveToMergePosition(
              childId,
              parentPath,
              [linkedArrayField, mergedIndex],
              mergeCtx
            );
          }
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
        if (!leftState!.hasPositionBeenProcessed) {
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
    const {__typename, _id} = idAndTypeOfChange(branchChange);
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
        const elementUid = getElementUid(nextType, nextId);
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

export function threeWayMergeArray<T>(
  base: T[],
  mine: T[],
  their: T[],
  equalsFn: EqualFn = defaultEquals
): T[] {
  const {changes: dmChanges, elementChanges: mElChanges} = diffArray(
    base,
    mine,
    equalsFn
  );
  const {changes: dtChanges, elementChanges: tElChanges} = diffArray(
    base,
    their,
    equalsFn
  );
  assert(
    base.length === mElChanges.length,
    'elementChanges should be as long as the base array'
  );
  assert(
    base.length === tElChanges.length,
    'elementChanges should be as long as the base array'
  );
  const mChanges = delayDeletions(dmChanges).filter(
    createArrayChangeFilter(tElChanges, true)
  );
  const tChanges = delayDeletions(dtChanges).filter(
    createArrayChangeFilter(mElChanges, false)
  );
  const mergedChanges: ArrayChange<T>[] = delayDeletions([
    ...mChanges,
    ...tChanges
  ]);
  return applyArrayDiff(base, mergedChanges);
}

function createArrayChangeFilter(
  otherChanges: Array<ArrayKeepElement | ArrayChange<any>>,
  winByDefault: boolean
) {
  return (change: ArrayChange<any>): boolean => {
    if (change.__typename === 'AddElement') {
      return true;
    }
    const otherChange = otherChanges[change.elIndex];
    if (change.__typename === 'ArrayMoveElementLeft') {
      if (otherChange.__typename === 'ArrayMoveElementLeft') {
        const mDelta =
          change.elIndex -
          (change.afterElIndex === null ? -1 : change.afterElIndex);
        const tDelta =
          otherChange.elIndex -
          (otherChange.afterElIndex === null ? -1 : otherChange.afterElIndex);
        return mDelta !== tDelta ? mDelta > tDelta : winByDefault;
      } else {
        return true;
      }
    } else if (otherChange.__typename === 'ArrayMoveElementLeft') {
      return false;
    } else if (change.__typename === 'ArrayMoveElementRight') {
      if (otherChange.__typename === 'ArrayMoveElementRight') {
        const mDelta =
          (change.beforeElIndex === null
            ? otherChanges.length - 1
            : change.beforeElIndex) - change.elIndex;
        const tDelta =
          (otherChange.beforeElIndex === null
            ? otherChanges.length - 1
            : otherChange.beforeElIndex) - otherChange.elIndex;
        return mDelta !== tDelta ? mDelta > tDelta : winByDefault;
      } else {
        return true;
      }
    } else if (otherChange.__typename === 'ArrayMoveElementRight') {
      return true;
    } else if (change.__typename === 'DeleteElement') {
      if (otherChange.__typename === 'DeleteElement') {
        return winByDefault;
      } else {
        return true;
      }
    }
    assert(false, 'We should have chose a true or false by now');
    return false;
  };
}

function delayDeletions(changes: ArrayChange<any>[]) {
  const deletions: ArrayChange<any>[] = [];
  const additions: ArrayChange<any>[] = [];
  const moves: ArrayChange<any>[] = [];
  for (const change of changes) {
    if (change.__typename === 'DeleteElement') {
      deletions.push(change);
    } else if (change.__typename === 'AddElement') {
      additions.push(change);
    } else {
      moves.push(change);
    }
  }
  return [...moves, ...deletions, ...additions];
}
