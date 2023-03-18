import {
  AllMappedTypesFields,
  ArrayChange,
  ArrayKeepElement,
  DiffArrayResult,
  DocumentVisitTraversal,
  EqualFn,
  HDocCommandType,
  HDocOperation,
  IChangeElement,
  Id,
  IDeleteElement,
  IDocumentSchema,
  IFieldEntityReference,
  IInsertElement,
  IMoveElement,
  INormalizedDocument,
  INormalizedMutableMapsDocument,
  IParentedId,
  MappedParentedTypesFields,
  MapsOfNormDoc,
  UOfNormDoc,
  WasTouchedFn
} from './HTypes';
import {mutableDocument, pathForElementWithId} from './HDocument';
import {isEqual, omit} from 'lodash';
import {visitDocument} from './HVisit';
import {assert, hasMappedElement, isParentedId, mappedElement} from './HUtils';

/**
 * Returns a list of HDocOperations that if applied
 * will transform baseDoc in laterDoc. laterDoc
 * is assumed to have the same root element and schema as
 * baseDoc
 *
 * @param {INormalizedDocument<MapsInterface, U>} baseDoc
 * @param {INormalizedDocument<MapsInterface, U>} laterDoc
 * @returns {HDocOperation<MapsInterface, any, U>[]}
 */
export function diff<NorDoc extends INormalizedDocument<any, any>>(
  baseDoc: NorDoc,
  laterDoc: NorDoc
): HDocOperation<MapsOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>, any>[] {
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
      baseDoc.rootType === laterDoc.rootType &&
      baseDoc.rootId === laterDoc.rootId
    )
  ) {
    return [];
  }
  const mutableDoc = mutableDocument(baseDoc);
  visitDocument(
    laterDoc,
    (doc, nodeType, nodeId) => {
      const destElement = mappedElement(laterDoc.maps, nodeType, nodeId);
      let mutableElement = mappedElement(mutableDoc.maps, nodeType, nodeId);
      if (!isParentedId(destElement) || !isParentedId(mutableElement)) {
        throw new ReferenceError(`Node ${nodeType}:${nodeId} not found`);
      }

      // 1. If we are an existing node, check if the info fields should be
      // updated
      const nodePath = pathForElementWithId(mutableDoc, nodeType, nodeId);
      if (hasMappedElement(baseDoc.maps, nodeType, nodeId)) {
        const infoChanges = diffInfoOf<
          MapsOfNormDoc<NorDoc>,
          UOfNormDoc<NorDoc>,
          MappedParentedTypesFields<MappedParentedTypesFields<NorDoc>>
        >(mutableDoc, laterDoc, nodeType, nodeId);
        if (Object.keys(infoChanges).length > 0) {
          const changeElementCmd: IChangeElement<
            MapsOfNormDoc<NorDoc>,
            UOfNormDoc<NorDoc>,
            IParentedId<UOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>
          > = {
            __typename: HDocCommandType.CHANGE_ELEMENT,
            element: nodePath,
            changes: {__typename: destElement.__typename, ...infoChanges}
          };
          mutableDoc.changeElement(changeElementCmd);
        }
      }

      // 2. Iterate across the children
      const {schema} = doc;
      for (const linkFieldName in schema.types[nodeType]) {
        if (linkFieldName === 'parentId') continue;
        const fieldLink = schema.types[nodeType][linkFieldName] as
          | IFieldEntityReference<UOfNormDoc<NorDoc>>
          | [IFieldEntityReference<UOfNormDoc<NorDoc>>];
        if (Array.isArray(fieldLink)) {
          const {__schemaType: childType} = fieldLink[0];
          const destChildrenIds: Id[] = (destElement as any)[linkFieldName];
          for (let i = 0; i < destChildrenIds.length; i++) {
            const destChildId = destChildrenIds[i];
            // Every iteration of dest child, there is a chance that the mutable
            // element has changed, so I need to refresh to the latest reference
            mutableElement = mappedElement(mutableDoc.maps, nodeType, nodeId);
            const mutableChildrenIds: Id[] = (mutableElement as any)[
              linkFieldName
            ];
            const mutableChildId =
              i < mutableChildrenIds.length ? mutableChildrenIds[i] : null;
            const destChild = mappedElement(
              laterDoc.maps,
              childType,
              destChildId
            );
            if (!isParentedId(destChild)) {
              throw new ReferenceError(
                `Child node ${childType}:${destChildId} not found`
              );
            }

            if (destChildId !== mutableChildId) {
              // No else branch needed, the position is the same and the visit to the child node
              // will take care of the potential differences int he data within the child node
              if (hasMappedElement(mutableDoc.maps, childType, destChildId)) {
                // Node exists in the document, move it from there
                const childInfoDiff = diffInfoOf(
                  mutableDoc,
                  laterDoc,
                  childType,
                  destChildId
                );
                const moveChildCmd: IMoveElement<
                  MapsOfNormDoc<NorDoc>,
                  UOfNormDoc<NorDoc>,
                  IParentedId<UOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>
                > = {
                  __typename: HDocCommandType.MOVE_ELEMENT,
                  element: pathForElementWithId(
                    mutableDoc,
                    childType,
                    destChildId
                  ),
                  toParent: pathForElementWithId(mutableDoc, nodeType, nodeId),
                  toPosition: [
                    linkFieldName as any as AllMappedTypesFields<
                      MapsOfNormDoc<NorDoc>
                    >,
                    i
                  ],
                  changes:
                    Object.keys(childInfoDiff).length > 0
                      ? {
                          __typename: destChild.__typename,
                          ...omit(childInfoDiff, '__typename')
                        }
                      : undefined
                };
                mutableDoc.moveElement(moveChildCmd);
              } else {
                // New element, let's add the basic info from it,
                // emptying children links
                const elementInfo = {...(destChild as IParentedId)};
                for (const childLinkFieldName in schema.types[childType]) {
                  if (childLinkFieldName === 'parentId') continue;
                  const childFieldLink =
                    schema.types[childType][childLinkFieldName];
                  (elementInfo as any)[childLinkFieldName] = Array.isArray(
                    childFieldLink
                  )
                    ? []
                    : null;
                }
                const addChildCmd: IInsertElement<
                  MapsOfNormDoc<NorDoc>,
                  UOfNormDoc<NorDoc>,
                  IParentedId<UOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>
                > = {
                  __typename: HDocCommandType.INSERT_ELEMENT,
                  parent: nodePath,
                  position: [
                    linkFieldName as any as AllMappedTypesFields<
                      MapsOfNormDoc<NorDoc>
                    >,
                    i
                  ],
                  element: elementInfo
                };
                mutableDoc.insertElement(addChildCmd);
              }
            }
          }
        } else {
          if (
            (destElement as any)[linkFieldName] !==
            (mutableElement as any)[linkFieldName]
          ) {
            const changeLinkFieldCmd: IChangeElement<
              MapsOfNormDoc<NorDoc>,
              UOfNormDoc<NorDoc>,
              IParentedId<UOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>
            > = {
              __typename: HDocCommandType.CHANGE_ELEMENT,
              element: pathForElementWithId(mutableDoc, nodeType, nodeId),
              changes: {
                __typename: destElement.__typename,
                [linkFieldName]: (destElement as any)[linkFieldName]
              }
            };
            mutableDoc.changeElement(changeLinkFieldCmd);
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
      if (!hasMappedElement(laterDoc.maps, nodeType, nodeId)) {
        const deleteElementCmd: IDeleteElement<
          MapsOfNormDoc<NorDoc>,
          UOfNormDoc<NorDoc>
        > = {
          __typename: HDocCommandType.DELETE_ELEMENT,
          element: pathForElementWithId(doc, nodeType, nodeId)
        };
        mutableDoc.deleteElement(deleteElementCmd);
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
 * @param {IDocumentSchema<MapsInterface, U>} schema
 * @param {U} elementType
 * @param {T} baseEl
 * @param {T} laterEl
 * @returns {Partial<T>}
 */
export function diffElementInfo<
  MapsInterface,
  U extends keyof MapsInterface,
  T extends IParentedId<U, U>
>(
  schema: IDocumentSchema<MapsInterface, U>,
  elementType: U,
  baseEl: T,
  laterEl: T
): Partial<T> {
  const infoDiff: Partial<T> = {};
  const elementLinkedFields = schema.types[elementType] || {};
  const fieldsChecked: Set<string> = new Set();
  for (const fieldName in baseEl) {
    if (fieldName === 'parentId' || fieldName in elementLinkedFields) {
      continue;
    }
    fieldsChecked.add(fieldName);
    const baseVal = (baseEl as any)[fieldName];
    const laterVal = (laterEl as any)[fieldName];
    if (!isEqual(baseVal, laterVal)) {
      infoDiff[fieldName] = laterVal;
    }
  }
  for (const fieldName in laterEl) {
    if (
      fieldName === 'parentId' ||
      fieldName in elementLinkedFields ||
      fieldsChecked.has(fieldName)
    ) {
      continue;
    }
    // If the field is not in the set of checked fields,
    // it was undefined in base but is defined in later
    infoDiff[fieldName] = (laterEl as any)[fieldName];
  }
  return infoDiff;
}

export function diffInfoOf<
  MapsInterface,
  U extends keyof MapsInterface,
  T extends MappedParentedTypesFields<MapsInterface>
>(
  baseDoc:
    | INormalizedDocument<MapsInterface, U>
    | INormalizedMutableMapsDocument<MapsInterface, U>,
  laterDoc:
    | INormalizedDocument<MapsInterface, U>
    | INormalizedMutableMapsDocument<MapsInterface, U>,
  elementType: U,
  elementId: Id
): Partial<T> {
  if (
    !hasMappedElement(baseDoc.maps, elementType, elementId) ||
    !hasMappedElement(laterDoc.maps, elementType, elementId)
  ) {
    return {};
  }
  const baseEl = mappedElement(baseDoc.maps, elementType, elementId) as T;
  const laterEl = mappedElement(laterDoc.maps, elementType, elementId) as T;
  return diffElementInfo(baseDoc.schema, elementType, baseEl, laterEl);
}

export const defaultEquals = (a: any, b: any) => a === b;
export const defaultWasTouchedFn = (_: any) => false;

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

/**
 * An Id function allows creating a uniquely identifying string for
 * an element.
 */
export interface IdFn<T> {
  (value: T): string | T;
}

const defaultIdFn = <T>(val: T): T => val;

/**
 * Least common sequence result. buffer1[buffer1index] will be equal to
 * buffer2[buffer2index], and chain points to the next character in the least common
 * sequence, if it exists.
 */
export interface LcsResult {
  buffer1index: number;
  buffer2index: number;
  chain: null | LcsResult;
}

export interface DiffProps<T> {
  equalsFn?: EqualFn;
  wasTouchedFn?: WasTouchedFn<T>;
}

interface LcsProps<T> {
  wasTouchedFn: WasTouchedFn<T>;
  idFn: IdFn<T>;
}

// Text diff algorithm following Hunt and McIlroy 1976.
// J. W. Hunt and M. D. McIlroy, An algorithm for differential buffer
// comparison, Bell Telephone Laboratories CSTR #41 (1976)
// http://www.cs.dartmouth.edu/~doug/
// https://en.wikipedia.org/wiki/Longest_common_subsequence_problem
//
// Expects two arrays, finds longest common sequence
export function longestCommonSequence<T>(
  buffer1: T[],
  buffer2: T[],
  inpProps: Partial<LcsProps<T>> = {}
): LcsResult {
  const props: LcsProps<T> = Object.assign(
    {
      wasTouchedFn: defaultWasTouchedFn,
      idFn: defaultIdFn
    },
    inpProps
  );
  const equivalenceClasses = new Map<
    T | string,
    {touched: number[]; unTouched: number[]}
  >();
  for (let j = 0; j < buffer2.length; j++) {
    const item = buffer2[j];
    const itemId = props.idFn(item);
    const wasTouched = props.wasTouchedFn(item);
    const itemClasses = equivalenceClasses.get(itemId) || {
      touched: [],
      unTouched: []
    };
    const equivalenceClass = wasTouched
      ? itemClasses.touched
      : itemClasses.unTouched;
    equivalenceClass.push(j);
    equivalenceClasses.set(itemId, itemClasses);
  }

  const NULLRESULT: LcsResult = {
    buffer1index: -1,
    buffer2index: -1,
    chain: null
  };
  const candidates = [NULLRESULT];

  for (let i = 0; i < buffer1.length; i++) {
    const item = buffer1[i];
    const itemId = props.idFn(item);
    const wasTouched = false;
    const itemClasses = equivalenceClasses.get(itemId) || {
      touched: [],
      unTouched: []
    };
    const buffer2indices = wasTouched
      ? itemClasses.touched
      : itemClasses.unTouched;
    let r = 0;
    let c = candidates[0];

    for (let jx = 0; jx < buffer2indices.length; jx++) {
      const j = buffer2indices[jx];

      let s: number;
      for (s = r; s < candidates.length; s++) {
        if (
          candidates[s].buffer2index < j &&
          (s === candidates.length - 1 || candidates[s + 1].buffer2index > j)
        ) {
          break;
        }
      }

      if (s < candidates.length) {
        const newCandidate = {
          buffer1index: i,
          buffer2index: j,
          chain: candidates[s]
        };
        if (r === candidates.length) {
          candidates.push(c);
        } else {
          candidates[r] = c;
        }
        r = s + 1;
        c = newCandidate;
        if (r === candidates.length) {
          break; // no point in examining further (j)s
        }
      }
    }

    candidates[r] = c;
  }

  // At this point, we know the LCS: it's in the reverse of the
  // linked-list through .chain of candidates[candidates.length - 1].

  return candidates[candidates.length - 1];
}

interface DiffIndicesElement<T> {
  buffer1: number[];
  buffer1Content: T[];
  buffer2: number[];
  buffer2Content: T[];
}

interface Diff3Options<T = any> {
  wasTouchedFn: (val: T, side: 'left' | 'right') => boolean;
}

// We apply the LCS to give a simple representation of the
// offsets and lengths of mismatched chunks in the input
// buffers. This is used by diff3MergeRegions.
function diffIndices<T>(
  buffer1: T[],
  buffer2: T[],
  inpProps?: Partial<LcsProps<T>>
): DiffIndicesElement<T>[] {
  const lcs = longestCommonSequence(buffer1, buffer2, inpProps);
  const result: DiffIndicesElement<T>[] = [];
  let tail1 = buffer1.length;
  let tail2 = buffer2.length;

  for (
    let candidate: null | LcsResult = lcs;
    candidate !== null;
    candidate = candidate.chain
  ) {
    const mismatchLength1 = tail1 - candidate.buffer1index - 1;
    const mismatchLength2 = tail2 - candidate.buffer2index - 1;
    tail1 = candidate.buffer1index;
    tail2 = candidate.buffer2index;

    if (mismatchLength1 || mismatchLength2) {
      result.push({
        buffer1: [tail1 + 1, mismatchLength1],
        buffer1Content: buffer1.slice(tail1 + 1, tail1 + 1 + mismatchLength1),
        buffer2: [tail2 + 1, mismatchLength2],
        buffer2Content: buffer2.slice(tail2 + 1, tail2 + 1 + mismatchLength2)
      });
    }
  }

  result.reverse();
  return result;
}

interface Hunk {
  ab: 'a' | 'b';
  oStart: number;
  oLength: number;
  abStart: number;
  abLength: number;
}

export interface StableRegion<T> {
  stable: true;
  buffer: 'a' | 'o' | 'b';
  bufferStart: number;
  bufferLength: number;
  bufferContent: T[];
}

export interface UnstableRegion<T> {
  stable: false;
  aStart: number;
  aLength: number;
  aContent: T[];
  bStart: number;
  bLength: number;
  bContent: T[];
  oStart: number;
  oLength: number;
  oContent: T[];
}

export type DiffMergeRegion<T> = StableRegion<T> | UnstableRegion<T>;

// Given three buffers, A, O, and B, where both A and B are
// independently derived from O, returns a fairly complicated
// internal representation of merge decisions it's taken. The
// interested reader may wish to consult
//
// Sanjeev Khanna, Keshav Kunal, and Benjamin C. Pierce.
// 'A Formal Investigation of ' In Arvind and Prasad,
// editors, Foundations of Software Technology and Theoretical
// Computer Science (FSTTCS), December 2007.
//
// (http://www.cis.upenn.edu/~bcpierce/papers/diff3-short.pdf)
//
export function diff3MergeRegions<T>(
  a: T[],
  o: T[],
  b: T[],
  inpProps: Partial<Diff3Options> = {}
): DiffMergeRegion<T>[] {
  const props: Diff3Options = Object.assign(
    {wasTouchedFn: defaultWasTouchedFn},
    inpProps
  );
  const wasATouched = (val: T) => props.wasTouchedFn(val, 'left');
  const wasBTouched = (val: T) => props.wasTouchedFn(val, 'right');
  // "hunks" are array subsets where `a` or `b` are different from `o`
  // https://www.gnu.org/software/diffutils/manual/html_node/diff3-Hunks.html
  const hunks: Hunk[] = [];
  function addHunk(h: DiffIndicesElement<T>, ab: 'a' | 'b') {
    hunks.push({
      ab: ab,
      oStart: h.buffer1[0],
      oLength: h.buffer1[1], // length of o to remove
      abStart: h.buffer2[0],
      abLength: h.buffer2[1] // length of a/b to insert
      // abContent: (ab === 'a' ? a : b).slice(h.buffer2[0], h.buffer2[0] + h.buffer2[1])
    });
  }

  diffIndices(o, a, {wasTouchedFn: wasATouched}).forEach(item =>
    addHunk(item, 'a')
  );
  diffIndices(o, b, {wasTouchedFn: wasBTouched}).forEach(item =>
    addHunk(item, 'b')
  );
  hunks.sort((x, y) => x.oStart - y.oStart);

  const results: DiffMergeRegion<T>[] = [];
  let currOffset = 0;

  function advanceTo(endOffset: number) {
    if (endOffset > currOffset) {
      results.push({
        stable: true,
        buffer: 'o',
        bufferStart: currOffset,
        bufferLength: endOffset - currOffset,
        bufferContent: o.slice(currOffset, endOffset)
      });
      currOffset = endOffset;
    }
  }

  while (hunks.length) {
    let hunk = hunks.shift()!;
    const regionStart = hunk.oStart;
    let regionEnd = hunk.oStart + hunk.oLength;
    const regionHunks = [hunk];
    advanceTo(regionStart);

    // Try to pull next overlapping hunk into this region
    while (hunks.length) {
      const nextHunk = hunks[0];
      const nextHunkStart = nextHunk.oStart;
      if (nextHunkStart > regionEnd) break; // no overlap

      regionEnd = Math.max(regionEnd, nextHunkStart + nextHunk.oLength);
      regionHunks.push(hunks.shift()!);
    }

    if (regionHunks.length === 1) {
      // Only one hunk touches this region, meaning that there is no conflict here.
      // Either `a` or `b` is inserting into a region of `o` unchanged by the other.
      if (hunk.abLength > 0) {
        const buffer = hunk.ab === 'a' ? a : b;
        results.push({
          stable: true,
          buffer: hunk.ab,
          bufferStart: hunk.abStart,
          bufferLength: hunk.abLength,
          bufferContent: buffer.slice(
            hunk.abStart,
            hunk.abStart + hunk.abLength
          )
        });
      }
    } else {
      // A true a/b conflict. Determine the bounds involved from `a`, `o`, and `b`.
      // Effectively merge all the `a` hunks into one giant hunk, then do the
      // same for the `b` hunks; then, correct for skew in the regions of `o`
      // that each side changed, and report appropriate spans for the three sides.
      const bounds = {
        a: [a.length, -1, o.length, -1],
        b: [b.length, -1, o.length, -1]
      };
      while (regionHunks.length) {
        hunk = regionHunks.shift()!;
        const oStart = hunk.oStart;
        const oEnd = oStart + hunk.oLength;
        const abStart = hunk.abStart;
        const abEnd = abStart + hunk.abLength;
        const b = bounds[hunk.ab];
        b[0] = Math.min(abStart, b[0]);
        b[1] = Math.max(abEnd, b[1]);
        b[2] = Math.min(oStart, b[2]);
        b[3] = Math.max(oEnd, b[3]);
      }

      const aStart = bounds.a[0] + (regionStart - bounds.a[2]);
      const aEnd = bounds.a[1] + (regionEnd - bounds.a[3]);
      const bStart = bounds.b[0] + (regionStart - bounds.b[2]);
      const bEnd = bounds.b[1] + (regionEnd - bounds.b[3]);

      const result: DiffMergeRegion<T> = {
        stable: false,
        aStart: aStart,
        aLength: aEnd - aStart,
        aContent: a.slice(aStart, aEnd),
        oStart: regionStart,
        oLength: regionEnd - regionStart,
        oContent: o.slice(regionStart, regionEnd),
        bStart: bStart,
        bLength: bEnd - bStart,
        bContent: b.slice(bStart, bEnd)
      };
      results.push(result);
    }
    currOffset = regionEnd;
  }

  advanceTo(o.length);

  return results;
}

export interface OkMergeRegion<T> {
  ok: T[];
}

type ArrayElement<T> = T extends Array<infer S> ? S : T;
export interface ConflictMergeRegion<T> {
  conflict: {
    a: T[];
    aIndex: number;
    b: T[];
    bIndex: number;
    o: T[];
    oIndex: number;
  };
}
export type MergeRegion<T> = OkMergeRegion<T> | ConflictMergeRegion<T>;

export interface Diff3MergeOptions<T = any> extends Diff3Options<T> {
  excludeFalseConflicts: boolean;
  stringSeparator: string | RegExp;
}

// Applies the output of diff3MergeRegions to actually
// construct the merged buffer; the returned result alternates
// between 'ok' and 'conflict' blocks.
// A "false conflict" is where `a` and `b` both change the same from `o`
export function diff3Merge<T extends string | Array<any>>(
  inpA: T,
  inpO: T,
  inpB: T,
  inpOptions: Partial<Diff3MergeOptions> = {}
): MergeRegion<ArrayElement<T>>[] {
  const options: Diff3MergeOptions = Object.assign(
    {
      excludeFalseConflicts: true,
      stringSeparator: /\s+/,
      wasTouchedFn: defaultWasTouchedFn
    },
    inpOptions
  );

  const a = (
    typeof inpA === 'string' ? inpA.split(options.stringSeparator) : inpA
  ) as ArrayElement<T>[];
  const o = (
    typeof inpO === 'string' ? inpO.split(options.stringSeparator) : inpO
  ) as ArrayElement<T>[];
  const b = (
    typeof inpB === 'string' ? inpB.split(options.stringSeparator) : inpB
  ) as ArrayElement<T>[];

  const results: MergeRegion<ArrayElement<T>>[] = [];
  const regions = diff3MergeRegions(a, o, b, options);

  let okBuffer: ArrayElement<T>[] = [];
  function flushOk() {
    if (okBuffer.length) {
      results.push({ok: okBuffer});
    }
    okBuffer = [];
  }

  function isFalseConflict(a: T[], b: T[]) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  for (const region of regions) {
    if (region.stable) {
      okBuffer.push(...region.bufferContent);
    } else {
      if (
        options.excludeFalseConflicts &&
        isFalseConflict(region.aContent, region.bContent)
      ) {
        okBuffer.push(...region.aContent);
      } else {
        flushOk();
        results.push({
          conflict: {
            a: region.aContent,
            aIndex: region.aStart,
            o: region.oContent,
            oIndex: region.oStart,
            b: region.bContent,
            bIndex: region.bStart
          }
        });
      }
    }
  }

  flushOk();
  return results;
}
