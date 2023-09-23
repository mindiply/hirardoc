import {
  ArrayChange,
  ArrayKeepElement,
  DiffArrayResult,
  DocumentVisitTraversal,
  EqualFn,
  HDocCommandType,
  HDocOperation,
  ChangeElement,
  Id,
  DeleteElement,
  DocumentSchema,
  InsertElement,
  MoveElement,
  NormalizedDocument,
  WasTouchedFn,
  TreeNode,
  NodeDataOfTreeNode,
  LinkType,
  ElementId,
  NodeLink,
  AllChildrenFields
} from './HTypes';
import {pathForElementWithId} from './HDocument';
import {mutableDocument} from './HMutableDocument';
import {isEqual, omit} from 'lodash';
import {visitDocument} from './HVisit';
import {
  assert,
  elementIdsEquals,
  hasMappedElement,
  isElementId,
  mappedElement
} from './HUtils';
import {defaultWasTouchedFn} from './bufferDiff3';

/**
 * Returns a list of HDocOperations that if applied
 * will transform baseDoc in laterDoc. laterDoc
 * is assumed to have the same root element and schema as
 * baseDoc
 *
 * @param {NormalizedDocument<MapsInterface, U>} baseDoc
 * @param {NormalizedDocument<MapsInterface, U>} laterDoc
 * @returns {HDocOperation<MapsInterface, any, U>[]}
 */
export function diff<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef
>(
  baseDoc: NormalizedDocument<NodesDef, R>,
  laterDoc: NormalizedDocument<NodesDef, R>
): HDocOperation<NodesDef, keyof NodesDef, keyof NodesDef>[] {
  /**
   * We visit laterDoc breadth first, and for each element visited
   * we ensure that the info is up to date and that the children
   * in laterDoc are all in the correct position.
   *
   * If a move is needed info changes are also performed to avoid
   * a second change info command. At the end of the visit some
   * children arrays may have additional elements in the list.
   *
   * These elements will either move somewhere else later in the
   * tree visit, if they are still present in laterdoc, or they
   * will be deleted after the visit.
   */
  if (
    !(
      baseDoc.schema === laterDoc.schema &&
      baseDoc.rootId.__typename === laterDoc.rootId.__typename &&
      baseDoc.rootId._id === laterDoc.rootId._id
    )
  ) {
    return [];
  }
  const mutableDoc = mutableDocument(baseDoc);
  visitDocument(
    laterDoc,
    (doc, nodeType, nodeId) => {
      const destElement = mappedElement(laterDoc, nodeType, nodeId);
      let mutableElement = mappedElement(mutableDoc, nodeType, nodeId);

      // 1. If we are an existing node, check if the info fields should be
      // updated
      const nodePath = pathForElementWithId(mutableDoc, nodeType, nodeId);
      if (hasMappedElement(baseDoc, nodeType, nodeId)) {
        const infoChanges = diffInfoOf(mutableDoc, laterDoc, nodeType, nodeId);
        if (Object.keys(infoChanges).length > 0) {
          mutableDoc.changeElement({
            element: nodePath,
            changes: {__typename: destElement.__typename, ...infoChanges}
          });
        }
      }

      // 2. Iterate across the children
      const {schema} = doc;
      const schemaChildren = schema.nodeTypes[nodeType].children;
      for (const linkFieldName in schemaChildren) {
        const schemaLinkType = schemaChildren[linkFieldName];
        const recordLinkField = destElement.children[linkFieldName] as NodeLink<
          keyof NodesDef
        >;
        if (schemaLinkType !== LinkType.single && !recordLinkField) {
          throw new TypeError('Null value for array or set fields');
        }
        if (schemaLinkType === LinkType.array) {
          if (!Array.isArray(recordLinkField)) {
            throw new TypeError('Expected array of links.');
          }
          const destChildrenIds: ElementId<keyof NodesDef>[] = recordLinkField;
          for (let i = 0; i < destChildrenIds.length; i++) {
            const destChildElId = destChildrenIds[i];
            // Every iteration of dest child, there is a chance that the mutable
            // element has changed, so I need to refresh to the latest reference
            mutableElement = mappedElement(mutableDoc, nodeType, nodeId);
            const mutableChildrenIds: ElementId<keyof NodesDef>[] =
              mutableElement.children[linkFieldName];
            if (!Array.isArray(mutableChildrenIds)) {
              throw new TypeError('Expected array of link ids');
            }
            const mutableChildId =
              i < mutableChildrenIds.length ? mutableChildrenIds[i] : null;
            const destChild = mappedElement(
              laterDoc,
              destChildElId.__typename,
              destChildElId._id
            );

            if (
              !(
                mutableChildId &&
                elementIdsEquals(destChildElId, mutableChildId)
              )
            ) {
              // No else branch needed, the position is the same and the visit to the child node
              // will take care of the potential differences in the data within the child node
              if (
                hasMappedElement(
                  mutableDoc,
                  destChildElId.__typename,
                  destChildElId._id
                )
              ) {
                // Node exists in the document, move it from there
                const childInfoDiff = diffInfoOf(
                  mutableDoc,
                  laterDoc,
                  destChildElId.__typename,
                  destChildElId._id
                );
                mutableDoc.moveElement({
                  element: pathForElementWithId(
                    mutableDoc,
                    destChildElId.__typename,
                    destChildElId._id
                  ),
                  toParent: pathForElementWithId(mutableDoc, nodeType, nodeId),
                  toPosition: {
                    field: linkFieldName as AllChildrenFields<
                      NodesDef[keyof NodesDef]
                    >,
                    index: i
                  },
                  changes:
                    Object.keys(childInfoDiff).length > 0
                      ? Object.assign(childInfoDiff, {
                          __typename: destChild.__typename
                        })
                      : undefined
                });
              } else {
                // New element, let's add the basic info from it,
                // emptying children links
                const elementInfo = Object.assign({}, destChild.data, {
                  __typename: destChild.__typename,
                  _id: destChild._id
                });
                mutableDoc.insertElement({
                  parent: nodePath,
                  position: {
                    field: linkFieldName as AllChildrenFields<
                      NodesDef[keyof NodesDef]
                    >,
                    index: i
                  },
                  element: elementInfo
                });
              }
            }
          }
        } else if (schemaLinkType === LinkType.single) {
          if (!isElementId(recordLinkField)) {
            const currentLink = isElementId(
              mutableElement.children[linkFieldName]
            )
              ? (mutableElement.children[linkFieldName] as ElementId<
                  keyof NodesDef
                >)
              : null;
            if (currentLink) {
              if (
                hasMappedElement(
                  laterDoc,
                  currentLink.__typename,
                  currentLink._id
                )
              ) {
                // The record we link to is present in the later document, so we orhpan it at the moment, and then
                // we can move it from here, rather that delete and reinsert in the document
                mutableDoc.moveElement({
                  element: currentLink,
                  toParent: {__typename: nodeType, _id: nodeId},
                  toPosition: {field: '__orphans', index: 0}
                });
              } else {
                mutableDoc.deleteElement({
                  element: currentLink
                });
              }
            } else {
              // No change, null both originally and now
              continue;
            }
          } else if (
            !elementIdsEquals(
              recordLinkField,
              mutableElement.children[linkFieldName]
            )
          ) {
            if (
              !hasMappedElement(
                baseDoc,
                recordLinkField.__typename,
                recordLinkField._id
              )
            ) {
              mutableDoc.insertElement({
                parent: nodePath,
                position: linkFieldName as AllChildrenFields<
                  NodesDef[keyof NodesDef]
                >,
                element: Object.assign(
                  {
                    __typename: recordLinkField.__typename,
                    _id: recordLinkField._id
                  },
                  mappedElement(
                    laterDoc,
                    recordLinkField.__typename,
                    recordLinkField._id
                  ).data
                )
              });
            } else {
              const childInfoDiff = diffInfoOf(
                mutableDoc,
                laterDoc,
                recordLinkField.__typename,
                recordLinkField._id
              );
              mutableDoc.moveElement({
                element: {
                  __typename: recordLinkField.__typename,
                  _id: recordLinkField._id
                },
                toParent: {__typename: nodeType, _id: nodeId},
                toPosition: linkFieldName as AllChildrenFields<
                  NodesDef[keyof NodesDef]
                >,
                changes:
                  Object.keys(childInfoDiff).length > 0
                    ? Object.assign(
                        {__typename: recordLinkField.__typename},
                        childInfoDiff
                      )
                    : undefined
              });
            }
          }
        } else if (schemaLinkType === LinkType.set) {
          if (!(recordLinkField instanceof Map)) {
            throw new TypeError('Expected a map of link ids');
          }
          const originalMap: Map<
            string,
            ElementId<keyof NodesDef>
          > = hasMappedElement(baseDoc, nodeType, nodeId)
            ? (
                mappedElement(
                  baseDoc,
                  nodeType,
                  nodeId
                ) as NodesDef[keyof NodesDef]
              ).children[linkFieldName as keyof NodesDef[keyof NodesDef]]
            : new Map();
          if (!(originalMap instanceof Map)) {
            throw new TypeError('The original node is not a map of elementIds');
          }
          for (const [
            elementStrId,
            childElementId
          ] of recordLinkField.entries()) {
            if (!originalMap.has(elementStrId)) {
              // We have a new element in the map, need to work out if it was moved or
              // inserted as a new node
              if (
                hasMappedElement(
                  baseDoc,
                  childElementId.__typename,
                  childElementId._id
                )
              ) {
                const childInfoDiff = diffInfoOf(
                  mutableDoc,
                  laterDoc,
                  childElementId.__typename,
                  childElementId._id
                );
                mutableDoc.moveElement({
                  toParent: nodePath,
                  toPosition: {
                    field: linkFieldName as AllChildrenFields<
                      NodesDef[keyof NodesDef]
                    >,
                    nodeType: childElementId.__typename,
                    nodeId: childElementId._id
                  },
                  element: {
                    __typename: childElementId.__typename,
                    _id: childElementId._id
                  },
                  changes:
                    Object.keys(childInfoDiff).length > 0
                      ? Object.assign(
                          {__typename: childElementId.__typename},
                          childInfoDiff
                        )
                      : undefined
                });
              } else {
                mutableDoc.insertElement({
                  parent: nodePath,
                  position: {
                    field: linkFieldName as AllChildrenFields<
                      NodesDef[keyof NodesDef]
                    >,
                    nodeType: childElementId.__typename,
                    nodeId: childElementId._id
                  },
                  element: Object.assign(
                    {
                      __typename: childElementId.__typename,
                      _id: childElementId._id
                    },
                    mappedElement(
                      laterDoc,
                      childElementId.__typename,
                      childElementId._id
                    ).data
                  )
                });
              }
            } else {
              // The element was already in, we're fine
            }
          }
          const mutableChildrenMap: Map<
            string,
            ElementId<keyof NodesDef>
          > = mutableElement.children[linkFieldName];
          if (!(mutableChildrenMap instanceof Map)) {
            throw new TypeError('Expected a map of link ids');
          }
        }
      }
    },
    {}
  );

  // After replicating the destination tree, I can go through the mutable document
  // depth first and delete any element that was in the base tree but is not in
  // the destination tree
  visitDocument(
    mutableDoc,
    (doc, nodeType, nodeId) => {
      if (!hasMappedElement(laterDoc, nodeType, nodeId)) {
        mutableDoc.deleteElement({
          element: {__typename: nodeType, _id: nodeId}
        });
      }
    },
    {
      context: {},
      traversal: DocumentVisitTraversal.DEPTH_FIRST
    }
  );
  return mutableDoc.changes;
}

/**
 * Given a base version and a later version of a document element
 * with schema schema and type elementType, returns a Partial version
 * of the element containing the info fields that have changed between baseEl
 * and laterEl.
 *
 * @param {DocumentSchema<MapsInterface, U>} schema
 * @param {U} elementType
 * @param {T} baseEl
 * @param {T} laterEl
 * @returns {Partial<T>}
 */
export function diffElementInfo<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef,
  T extends keyof NodesDef
>(
  schema: DocumentSchema<NodesDef, R>,
  elementType: T,
  baseEl: NodesDef[T],
  laterEl: NodesDef[T]
): Partial<NodeDataOfTreeNode<NodesDef, T>> {
  const infoDiff: Partial<NodeDataOfTreeNode<NodesDef, T>> = {};
  const fieldsChecked: Set<string> = new Set();
  for (const fieldName in baseEl.data) {
    fieldsChecked.add(fieldName);
    const baseVal = baseEl.data[fieldName];
    const laterVal = laterEl.data[fieldName];
    if (!isEqual(baseVal, laterVal)) {
      infoDiff[fieldName as keyof NodeDataOfTreeNode<NodesDef, T>] = laterVal;
    }
  }
  for (const fieldName in laterEl.data) {
    if (fieldsChecked.has(fieldName)) {
      continue;
    }
    // If the field is not in the set of checked fields,
    // it was undefined in base but is defined in later
    infoDiff[fieldName as keyof NodeDataOfTreeNode<NodesDef, T>] = (
      laterEl.data as any
    )[fieldName];
  }
  return infoDiff;
}

export function diffInfoOf<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef,
  T extends keyof NodesDef
>(
  baseDoc: NormalizedDocument<NodesDef, R>,
  laterDoc: NormalizedDocument<NodesDef, R>,
  elementType: T,
  elementId: Id
): Partial<NodeDataOfTreeNode<NodesDef, T>> {
  if (
    !hasMappedElement(baseDoc, elementType, elementId) ||
    !hasMappedElement(laterDoc, elementType, elementId)
  ) {
    return {};
  }
  const baseEl = mappedElement(baseDoc, elementType, elementId);
  const laterEl = mappedElement(laterDoc, elementType, elementId);
  return diffElementInfo(baseDoc.schema, elementType, baseEl, laterEl);
}

export const defaultEquals = (a: any, b: any) => a === b;

interface BaseElementStatus<T> {
  element: T;
  originalIndex: number;
  finalIndex: number | null;
  filteredIndex: number;
  currentIndex: number;
}

/**
 * Creates a diff between two arrays, returning a list of change operations
 * that would bring the base array to the later array.
 *
 * Elements are considered equal based on the equalsFn parameter, that by
 * default uses the === boolean operator. You can use equals from lodash for
 * deep compares, for instance.
 *
 * The diff result returns both the list of sequential changes in the changes
 * member, and an array that has the same number of elements as the base array.
 * Each element shows what happened to the base element in the later array:
 * kept in the same position, moved to the left of the array or deleted.
 *
 * @param {T[]} base
 * @param {T[]} later
 * @param {EqualFn} equalsFn
 * @returns {DiffArrayResult<T>}
 */
export function diffArray<T>(
  base: T[],
  later: T[],
  {
    equalsFn = defaultEquals,
    wasTouchedFn = defaultWasTouchedFn
  }: {
    equalsFn?: EqualFn;
    wasTouchedFn?: WasTouchedFn<T>;
  } = {}
): DiffArrayResult<T> {
  const elementChanges: Array<null | ArrayKeepElement | ArrayChange<T>> = [];
  const changes: ArrayChange<T>[] = [];

  const baseElementsQueue: BaseElementStatus<T>[] = [];
  const existingElementsIndexes: Map<number, number> = new Map();

  // 1. Find elements deleted from base.
  for (let i = 0; i < base.length; i++) {
    const laterIndex = later.findIndex(laterEl => equalsFn(laterEl, base[i]));
    if (laterIndex !== -1) {
      existingElementsIndexes.set(laterIndex, i);
      baseElementsQueue.push({
        element: base[i],
        originalIndex: i,
        finalIndex: laterIndex,
        currentIndex: baseElementsQueue.length,
        filteredIndex: -1
      });
      elementChanges.push({
        __typename: 'KeepElement',
        elIndex: i,
        wasTouched: wasTouchedFn(base[i])
      });
    } else {
      changes.push({
        __typename: 'DeleteElement',
        elIndex: i
      });
      elementChanges.push(changes[changes.length - 1]);
    }
  }

  // 2. Move the remaining elements after deletions until the order respect the
  // order in later, filtered of the elements that have been added since base
  const filteredFinal = [...baseElementsQueue];
  filteredFinal.sort(cmpByFinalIndex);
  for (let i = 0; i < filteredFinal.length; i++) {
    filteredFinal[i].filteredIndex = i;
  }

  for (let i = 0, k = filteredFinal.length - 1; k > i; ) {
    if (filteredFinal[i].currentIndex === i) {
      i++;
    } else if (filteredFinal[k].currentIndex === k) {
      k--;
    } else if (
      Math.abs(
        filteredFinal[i].currentIndex - filteredFinal[i].filteredIndex
      ) >=
      Math.abs(filteredFinal[k].currentIndex - filteredFinal[k].filteredIndex)
    ) {
      changes.push({
        __typename: 'ArrayMoveElementLeft',
        afterElIndex: i > 0 ? filteredFinal[i - 1].originalIndex : null,
        elIndex: filteredFinal[i].originalIndex
      });
      elementChanges[filteredFinal[i].originalIndex] =
        changes[changes.length - 1];
      const [el] = baseElementsQueue.splice(filteredFinal[i].currentIndex, 1);
      baseElementsQueue.splice(filteredFinal[i].filteredIndex, 0, el);
      for (let j = i + 1; j <= k; j++) {
        baseElementsQueue[j].currentIndex = j;
      }
      i++;
    } else {
      changes.push({
        __typename: 'ArrayMoveElementRight',
        beforeElIndex:
          k < filteredFinal.length - 1
            ? filteredFinal[k + 1].originalIndex
            : null,
        elIndex: filteredFinal[k].originalIndex
      });
      elementChanges[filteredFinal[k].originalIndex] =
        changes[changes.length - 1];
      const [el] = baseElementsQueue.splice(filteredFinal[k].currentIndex, 1);
      baseElementsQueue.splice(filteredFinal[k].filteredIndex, 0, el);
      for (let j = k - 1; j >= i; j--) {
        baseElementsQueue[j].currentIndex = j;
      }
      k--;
    }
  }

  // 3. Add the elements in later that were not in base
  for (let laterIndex = 0; laterIndex < later.length; laterIndex++) {
    if (!existingElementsIndexes.has(laterIndex)) {
      const afterElIndex =
        laterIndex > 0
          ? existingElementsIndexes.has(laterIndex - 1)
            ? existingElementsIndexes.get(laterIndex - 1)!
            : null
          : null;
      changes.push({
        __typename: 'AddElement',
        element: later[laterIndex],
        afterElIndex
      });
      elementChanges.push(changes[changes.length - 1]);
      existingElementsIndexes.set(laterIndex, elementChanges.length - 1);
    }
  }

  return {
    elementChanges: elementChanges.slice(0, base.length) as Array<
      ArrayKeepElement | ArrayChange<T>
    >,
    changes
  };
}

function cmpByFinalIndex(a: BaseElementStatus<any>, b: BaseElementStatus<any>) {
  return (a.finalIndex || -1) - (b.finalIndex || -1);
}

interface ArrayElementPos<T> {
  element: T;
  currentIndex: number;
  elIndex: number;
}

/**
 * Given a base array and an array of array changes, returns a shallow copied
 * version of the base array to which all the changes have been applied in
 * sequence.
 *
 * @param {T[]} base
 * @param {ArrayChange<T>[]} changes
 * @returns {T[]}
 */
export function applyArrayDiff<T>(base: T[], changes: ArrayChange<T>[]): T[] {
  const elements: ArrayElementPos<T>[] = base.map((_, i) => ({
    element: base[i],
    currentIndex: i,
    elIndex: i
  }));
  const res = [...elements];

  for (const change of changes) {
    if (change.__typename === 'AddElement') {
      const {afterElIndex, element} = change;
      assert(
        afterElIndex === null ||
          (afterElIndex >= 0 && afterElIndex < elements.length),
        'Expect valid insertion index'
      );
      const afterElement =
        afterElIndex === null ? null : elements[afterElIndex];
      const targetIndex =
        afterElement === null ? 0 : afterElement.currentIndex + 1;
      elements.push({
        element,
        elIndex: elements.length,
        currentIndex: targetIndex
      });
      res.splice(targetIndex, 0, elements[elements.length - 1]);
      for (let i = targetIndex + 1; i < res.length; i++) {
        res[i].currentIndex++;
      }
    } else if (change.__typename === 'ArrayMoveElementLeft') {
      const {elIndex, afterElIndex} = change;
      assert(
        elIndex >= 0 && elIndex < elements.length,
        'Expect the element index to be valid'
      );
      assert(
        afterElIndex === null ||
          (afterElIndex >= 0 && afterElIndex < elements.length),
        'Valid afterElIndex expected'
      );
      const elementToMove = elements[elIndex];
      const afterElement =
        afterElIndex === null ? null : elements[afterElIndex];
      const targetIndex = afterElement ? afterElement.currentIndex + 1 : 0;
      const moveFromIndex = elementToMove.currentIndex;
      assert(
        targetIndex < moveFromIndex,
        'Moving left - target should be less than source'
      );
      const [el] = res.splice(moveFromIndex, 1);
      el.currentIndex = targetIndex;
      res.splice(targetIndex, 0, el);
      for (let i = targetIndex + 1; i <= moveFromIndex; i++) {
        res[i].currentIndex++;
      }
    } else if (change.__typename === 'ArrayMoveElementRight') {
      const {elIndex, beforeElIndex} = change;
      assert(
        elIndex >= 0 && elIndex < elements.length,
        'Expect the element index to be valid'
      );
      assert(
        beforeElIndex === null ||
          (beforeElIndex >= 0 && beforeElIndex < elements.length),
        'Valid afterElIndex expected'
      );
      const elementToMove = elements[elIndex];
      const beforeElement =
        beforeElIndex === null ? null : elements[beforeElIndex];
      const targetIndex = beforeElement
        ? beforeElement.currentIndex - 1
        : res.length - 1;
      const moveFromIndex = elementToMove.currentIndex;
      const [el] = res.splice(moveFromIndex, 1);
      el.currentIndex = targetIndex;
      res.splice(targetIndex, 0, el);
      for (let i = moveFromIndex; i < targetIndex; i++) {
        res[i].currentIndex--;
      }
    } else if (change.__typename === 'DeleteElement') {
      const {elIndex} = change;
      const targetElement = elements[elIndex];
      const targetIndex = targetElement.currentIndex;
      res.splice(targetIndex, 1);
      for (let i = targetIndex; i < res.length; i++) {
        res[i].currentIndex--;
      }
    }
  }
  return res.map(element => element.element);
}
