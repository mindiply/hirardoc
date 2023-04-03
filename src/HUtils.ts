import {v1 as uuid} from 'uuid';
import {
  Id,
  ElementId,
  NormalizedDocument,
  NodesDefOfDoc,
  ArrayPathElement,
  SetPathElement,
  DocumentSchema,
  TreeNode
} from './HTypes';

export function isId(obj: any): obj is Id {
  return typeof obj === 'number' || (obj !== '' && typeof obj === 'string');
}

export function extractElementId<T>(elementId: ElementId<T>): ElementId<T> {
  return {
    __typename: elementId.__typename,
    _id: elementId._id
  };
}

export function isElementId<TypeName = any>(
  obj: any
): obj is ElementId<TypeName> {
  return (
    typeof obj === 'object' &&
    isId(obj._id) &&
    typeof obj.__typename === 'string'
  );
}

export function elementIdsEquals(
  el1: ElementId<any>,
  el2: ElementId<any>
): boolean {
  return el1.__typename === el2.__typename && el1._id === el2._id;
}

export function isNullableId(obj: any): obj is Id | null {
  return obj === null || isId(obj);
}

/**
 * Checks if an element of type elementType with id elementId is in the document
 * hierarchy.
 *
 * @param {EntitiesMaps<MapsInterface, U> | MutableEntitiesMaps<MapsInterface, U>} docOrMaps
 * @param {U} elementType
 * @param {Id} elementId
 * @returns {boolean}
 */
export function hasMappedElement<NorDoc extends NormalizedDocument<any, any>>(
  docOrMaps: NorDoc,
  elementType: keyof NodesDefOfDoc<NorDoc>,
  elementId: Id
): boolean {
  return docOrMaps.getNode({_id: elementId, __typename: elementType}) !== null;
}

/**
 * Given a map of entities or mutable entities, returns the element that corresponds to the type
 * and id provided as parameter.
 *
 * If the type requested is not mapped, a type error is thrown. If no element with the requested _id is found,
 * a reference error is thrown.
 *
 * @param {EntitiesMaps<MapsInterface, U> | MutableEntitiesMaps<MapsInterface, U>} maps
 * @param {U} elementType
 * @param {Id} elementId
 * @returns {EntitiesMaps<MapsInterface>[U] extends Map<Id, infer T> ? T : never}
 */
export function mappedElement<
  NorDoc extends NormalizedDocument<any, any>,
  N extends keyof NodesDefOfDoc<NorDoc>
>(docOrMaps: NorDoc, elementType: N, elementId: Id): NodesDefOfDoc<NorDoc>[N] {
  const element = docOrMaps.getNode({__typename: elementType, _id: elementId});
  if (!element) {
    throw new ReferenceError(
      `Referential integrity: element ${String(
        elementType
      )}.${elementId} not found`
    );
  }
  return element;
}

/**
 * Generates a unique id to assign to an element.
 *
 * @returns {Id}
 */
export const generateNewId = (): Id => uuid();

export interface AssertConf {
  outputFn: (text: string) => void;
  throwOnViolation: boolean;
}

let assertConf: AssertConf = {
  outputFn: console.log,
  throwOnViolation: true
};

export function setAssertOptions(assertSettings: Partial<AssertConf>) {
  assertConf = {...assertConf, ...assertSettings};
}

export function assert(predicate: boolean, errorMsg: string) {
  if (!predicate) {
    if (assertConf.outputFn) {
      assertConf.outputFn(errorMsg);
    }
    if (assertConf.throwOnViolation) {
      throw new Error(errorMsg);
    }
  }
}

export function isArrayPathElement(obj: any): obj is ArrayPathElement<any> {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.field === 'string' &&
    typeof obj.index === 'number'
  );
}

export function isSetPathElement(obj: any): obj is SetPathElement<any, any> {
  return Boolean(
    obj &&
      typeof obj === 'object' &&
      typeof obj.field === 'string' &&
      obj.nodeType &&
      typeof obj.nodeType === 'string' &&
      obj.nodeId &&
      isId(obj.nodeId)
  );
}

export function isDocumentSchema<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  RootType extends keyof NodesDef
>(obj: any): obj is DocumentSchema<NodesDef, RootType> {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.documentType === 'string' &&
    obj.nodeTypes &&
    typeof obj.nodeTypes === 'object' &&
    typeof obj.rootType === 'string'
  );
}

export function iidToStr(elementId: ElementId<any>): string {
  return `${elementId.__typename}.${elementId._id}`;
}

export class NodeWithIdIterator<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >
> implements IterableIterator<[string, NodesDef[keyof NodesDef]]>
{
  private originalTreeIterator: IterableIterator<NodesDef[keyof NodesDef]>;
  constructor(hTree: NormalizedDocument<NodesDef>) {
    this.originalTreeIterator = hTree[Symbol.iterator]();
  }

  public [Symbol.iterator]() {
    return this;
  }

  public next(): IteratorResult<[string, NodesDef[keyof NodesDef]]> {
    const nextVal = this.originalTreeIterator.next();
    if (nextVal.done) {
      return {
        done: true,
        value: undefined
      };
    } else {
      return {
        done: false,
        value: [iidToStr(nextVal.value), nextVal.value]
      };
    }
  }
}
