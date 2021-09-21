import {v1 as uuid} from 'uuid';
import {
  EntitiesMaps,
  Id,
  IElementId,
  IFieldEntityReference,
  ILazyMutableMap,
  IMutableDocument,
  INormalizedDocument,
  IParentedId,
  MutableEntitiesMaps,
  SubEntityPathElement
} from './HTypes';
import {LazyMutableMap} from './LazyMap';

export function isId(obj: any): obj is Id {
  return typeof obj === 'number' || (obj !== '' && typeof obj === 'string');
}

export function isElementId(obj: any): obj is IElementId<any> {
  return (
    typeof obj === 'object' &&
    isId(obj._id) &&
    typeof obj.__typename === 'string'
  );
}

export function isNullableId(obj: any): obj is Id | null {
  return obj === null || isId(obj);
}

export function isParentedId(obj: any): obj is IParentedId {
  return (
    typeof obj === 'object' &&
    isId(obj._id) &&
    typeof obj.__typename === 'string' &&
    (obj.parentType === null || typeof obj.parentType === 'string') &&
    (obj.parentId === null || isId(obj.parentId))
  );
}

/**
 * Check if a map contains parented id elements. For performance reasons
 * we only check the object is a map.
 * @param obj
 * @returns {obj is Map<Id, IParentedId>}
 */
export function isParentedMap(obj: any): obj is Map<Id, IParentedId> {
  return Boolean(obj && obj instanceof Map);
}

export function isEntitiesMap(obj: any): obj is EntitiesMaps<any, any> {
  if (typeof obj !== 'object') return false;
  let i = 0;
  for (const entityType of Object.keys(obj)) {
    if (!isParentedMap(obj[entityType])) {
      return false;
    }
    i++;
  }
  return i > 0;
}

export function isSubEntityPathElement(
  obj: any
): obj is SubEntityPathElement<any> {
  if (typeof obj === 'string') {
    return true;
  }
  if (
    Array.isArray(obj) &&
    obj.length === 2 &&
    typeof obj[0] === 'string' &&
    typeof obj[1] === 'number'
  ) {
    return true;
  }
  return false;
}

export function isSchemaReference(obj: any): obj is IFieldEntityReference<any> {
  return Boolean(
    obj &&
      typeof obj === 'object' &&
      '__schemaType' in obj &&
      obj.__schemaType &&
      typeof obj.__schemaType === 'string'
  );
}

export function isIParentedId<U>(obj: any): obj is IParentedId<U> {
  return (
    obj &&
    typeof obj === 'object' &&
    obj._id !== undefined &&
    isId(obj._id) &&
    (typeof obj.parentId === 'undefined' ||
      isId(obj.parentId) ||
      obj.parentId === null)
  );
}

/**
 * Checks if the object passed as parameter is a mutable
 * lazy map with Ids as keys and IParentedId subtypes as
 * values.
 *
 * @param obj
 * @returns {obj is ILazyMutableMap<Id, IParentedId>}
 */
export function isParentedMutableMap(
  obj: any
): obj is ILazyMutableMap<Id, IParentedId> {
  return Boolean(obj && obj instanceof LazyMutableMap);
}

export function isMutableEntitiesMap(
  obj: any
): obj is MutableEntitiesMaps<any, any> {
  if (typeof obj !== 'object') return false;
  const fieldNames = Object.keys(obj);
  if (fieldNames.length < 1) return false;
  for (const fieldName of fieldNames) {
    if (!isParentedMutableMap(obj[fieldName])) {
      return false;
    }
  }
  return true;
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
export function hasMappedElement<
  MapsInterface,
  U extends keyof EntitiesMaps<MapsInterface> = keyof EntitiesMaps<MapsInterface>
>(
  docOrMaps:
    | EntitiesMaps<MapsInterface, U>
    | MutableEntitiesMaps<MapsInterface, U>
    | INormalizedDocument<MapsInterface, U>
    | IMutableDocument<MapsInterface, U>,
  elementType: U,
  elementId: Id
): boolean {
  let maps:
    | EntitiesMaps<MapsInterface, U>
    | MutableEntitiesMaps<MapsInterface, U>;
  if (isEntitiesMap(docOrMaps) || isMutableEntitiesMap(docOrMaps)) {
    maps = docOrMaps;
  } else if (
    isEntitiesMap((docOrMaps as any).maps) ||
    isMutableEntitiesMap((docOrMaps as any).maps)
  ) {
    maps = (docOrMaps as any).maps;
  } else {
    return false;
  }
  if (!(elementType in maps)) {
    return false;
  }
  const typeMap: ILazyMutableMap<Id, any> | Map<Id, any> = maps[elementType];
  return typeMap.has(elementId);
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
  MapsInterface,
  U extends keyof EntitiesMaps<MapsInterface> = keyof EntitiesMaps<MapsInterface>
>(
  docOrMaps:
    | EntitiesMaps<MapsInterface, U>
    | MutableEntitiesMaps<MapsInterface, U>
    | INormalizedDocument<MapsInterface, U>
    | IMutableDocument<MapsInterface, U>,
  elementType: U,
  elementId: Id
): EntitiesMaps<MapsInterface>[U] extends Map<Id, infer T> ? T : never {
  let maps:
    | EntitiesMaps<MapsInterface, U>
    | MutableEntitiesMaps<MapsInterface, U>;
  if (isEntitiesMap(docOrMaps) || isMutableEntitiesMap(docOrMaps)) {
    maps = docOrMaps;
  } else if (
    isEntitiesMap((docOrMaps as any).maps) ||
    isMutableEntitiesMap((docOrMaps as any).maps)
  ) {
    maps = (docOrMaps as any).maps;
  } else {
    maps = {} as
      | EntitiesMaps<MapsInterface, U>
      | MutableEntitiesMaps<MapsInterface, U>;
  }
  if (!(elementType in maps)) {
    throw new TypeError(`Element type ${elementType} not found`);
  }
  const typeMap: ILazyMutableMap<Id, any> | Map<Id, any> = maps[elementType];
  if (!typeMap.has(elementId)) {
    throw new ReferenceError(
      `Referential integrity: element ${elementType}.${elementId} not found`
    );
  }
  return typeMap.get(elementId)!;
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
