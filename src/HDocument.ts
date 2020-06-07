import {isEqual} from 'lodash';
import {v1 as uuid} from 'uuid';
import {LazyMutableMap} from './LazyMap';
import {
  AllMappedTypesFields,
  EntitiesMaps,
  EntityReferences,
  HDocCommandType,
  HDocOperation,
  Id,
  IDocumentSchema,
  IElementId,
  IFieldEntityReference,
  IInsertElement,
  ILazyMutableMap,
  IMoveElement,
  IMutableDocument,
  INormalizedDocument,
  INormalizedMutableMapsDocument,
  IParentedId,
  MapsOfNormDoc,
  MutableEntitiesMaps,
  Path,
  SubEntityPathElement,
  UOfNormDoc
} from './HTypes';

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

export function isParentedMap(obj: any): obj is Map<Id, IParentedId> {
  if (obj && obj instanceof Map) {
    if (obj.size === 0) return true;
    for (const [key, val] of obj.entries()) {
      if (!(isId(key) && isParentedId(val))) {
        return false;
      }
    }
    return true;
  }
  return false;
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

function isSubEntityPathElement(obj: any): obj is SubEntityPathElement<any> {
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

/**
 * Creates a shallow clone of the document. The maps are new objects,
 * but the entities mapped are the same as the original.
 *
 * The rationale for the shallow version of the elements is that
 * changes will be performed as setting new versions in the dictionary, rather
 * than direct manipulation of the objects.
 *
 * @param {INormalizedDocument<MapsInterface, U>} doc The document to be cloned
 * @returns {INormalizedDocument<MapsInterface, U>} shallow clone of the document
 */
export function cloneNormalizedDocument<
  NorDoc extends INormalizedDocument<any, any>
>(doc: NorDoc): NorDoc {
  const clonedMaps: EntitiesMaps<
    MapsOfNormDoc<NorDoc>,
    UOfNormDoc<NorDoc>
  > = {} as EntitiesMaps<MapsOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>;
  let mapField: UOfNormDoc<NorDoc>;
  for (mapField in doc.maps) {
    const entityMap = doc.maps[mapField];
    if (isParentedMap(entityMap)) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      clonedMaps[mapField] = new Map(entityMap);
    }
  }
  return {
    ...doc,
    maps: clonedMaps
  };
}

/**
 * Creates an empty copy version of the normalized document
 * passed as parameter.
 *
 * @returns {INormalizedDocument<MapsInterface, U>}
 */

export function clearedNormalizedDocument<
  NorDoc extends INormalizedDocument<any, any>
>(doc: NorDoc): NorDoc {
  const clone = cloneNormalizedDocument(doc);
  let mapField: UOfNormDoc<NorDoc>;
  for (mapField in clone.maps) {
    const entityMap = clone.maps[mapField];
    if (!isParentedMap(entityMap)) continue;
    const parentedMap: Map<Id, IParentedId> = entityMap;
    if (mapField === clone.rootType) {
      const rootsIdsToDelete = Array.from(parentedMap.keys()).filter(
        rootId => rootId !== clone.rootId
      );
      for (const rootIdToDelete of rootsIdsToDelete) {
        parentedMap.delete(rootIdToDelete);
      }
      const rootElement = parentedMap.get(clone.rootId);
      if (!rootElement) {
        throw new TypeError('Invalid document');
      }
      const rootFieldsMap = doc.schema.types[clone.rootType];
      for (const rootField in rootFieldsMap) {
        if (rootField === 'parentId') continue;
        if (Array.isArray(rootFieldsMap[rootField])) {
          const rootFieldVal = (rootElement as any)[rootField];
          if (!Array.isArray(rootFieldVal)) continue;
          (rootElement as any)[rootField] = [];
        } else {
          const rootFieldVal = (rootElement as any)[rootField];
          if (rootFieldVal !== null && rootFieldVal !== undefined) {
            (rootElement as any)[rootField] = null;
          }
        }
      }
    } else {
      parentedMap.clear();
    }
  }
  return clone;
}

function isSchemaReference(obj: any): obj is IFieldEntityReference<any> {
  return Boolean(
    obj &&
      typeof obj === 'object' &&
      '__schemaType' in obj &&
      obj.__schemaType &&
      typeof obj.__schemaType === 'string'
  );
}

function isIParentedId<U>(obj: any): obj is IParentedId<U> {
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

type GetLinkedElementType<U> = (elementId: Id) => U;

/**
 * A Type link links an Element Type A to another element type U, where
 * element of types Y are either children or parent of the element of type A.
 * */
type TypeLink<MapsInterface, U extends keyof EntitiesMaps<MapsInterface>> = {
  /**
   * The type of the linked elemennt (which is either a parent or a child of ours)
   */
  type: U;
  /**
   * The field that links us to the linked type
   */
  field: AllMappedTypesFields<MapsInterface>;

  /**
   * Whether the field linking us the a parent is a single Id or an array
   * of IDs
   */
  isArray: boolean;
};

/**
 * For a type element A, list all the types we are linked to via parent
 * or children relationships.
 */
type TypeLinks<MapsInterface, U extends keyof EntitiesMaps<MapsInterface>> = {
  /**
   * Each element is linked to other element in a hierarchical document with a single
   * parent type.
   *
   * The only element type that has no parent link defined is the
   * type of the document's root
   */
  parent?: TypeLink<MapsInterface, U>;

  /**
   * All the element types we are connected to which are not our
   * parent. There is one link for each element type, we are not supposed
   * to be linked to the same type more than once.
   */
  children: {
    [P in U]: undefined | TypeLink<MapsInterface, U>;
  };
};

/**
 * Store links to other types for each element
 * type in a normalized hierarchical document
 */
type TypeLinkDictionary<
  MapsInterface,
  U extends keyof EntitiesMaps<MapsInterface>
> = Map<U, TypeLinks<MapsInterface, U>>;

const schemaMap: Map<string, TypeLinkDictionary<any, any>> = new Map();

function getSchemaTypeMap<
  MapsInterface,
  U extends keyof EntitiesMaps<MapsInterface>
>(
  schema: IDocumentSchema<MapsInterface, U>
): TypeLinkDictionary<MapsInterface, U> {
  if (!schemaMap.has(schema.documentType)) {
    schemaMap.set(schema.documentType, createTypesMapForSchema(schema));
  }
  return (schemaMap.get(schema.documentType)! as any) as TypeLinkDictionary<
    MapsInterface,
    U
  >;
}

interface INextElementAndIdRetVal<
  MapsInterface,
  U extends keyof MapsInterface
> {
  element: {
    __typename: U;
    _id: Id;
  };
  remainingPath: Path<MapsInterface>;
}

export function idAndTypeForPath<MapsInterface, U extends keyof MapsInterface>(
  doc:
    | INormalizedDocument<MapsInterface, U>
    | INormalizedMutableMapsDocument<MapsInterface, U>
    | IMutableDocument<MapsInterface, U>,
  path: Path<MapsInterface>
): {
  __typename: U;
  _id: Id;
} {
  const {schema} = doc;
  if (!(path && Array.isArray(path) && path.length > 0)) {
    return {
      __typename: doc.rootType,
      _id: doc.rootId
    };
  }
  let trimmedPath = path.slice();
  let docContext: IParentedId = doc.maps[doc.rootType].get(
    doc.rootId
  )! as IParentedId;
  let schemaContext: EntityReferences<U> = schema.types[schema.rootType];
  for (let i = 0; trimmedPath.length > 0 && i < 10000; i++) {
    const {remainingPath, element} = nextElementTypeAndId(
      doc,
      docContext,
      schemaContext,
      trimmedPath
    ) as INextElementAndIdRetVal<MapsInterface, U>;
    const {_id, __typename} = element;
    trimmedPath = remainingPath;
    if (trimmedPath.length > 0) {
      docContext = mappedElement(doc.maps, __typename, _id) as IParentedId;
      if (!(__typename in schema.types)) {
        throw new Error(`TYpe not found in schema: ${__typename}`);
      }
      schemaContext = schema.types[__typename as U];
    } else {
      return {
        __typename,
        _id
      };
    }
  }
  throw new Error('Entity not found for path');
}

/**
 * Function that navigates the hierarchy of the document and of the schema to retrieve
 * the next record type and id based on the subPath passed as parameter.
 *
 * @param {OMutableDocument<NormalizedDoc, U>} doc the document we are
 * navigating
 * @param {Id | IParentedId | OMutableDocument<NormalizedDoc, U>} docContext the current
 * subtree of the document we are working on.
 * @param {EntityReferences<U> | EntityReference<U>} schemaContext the current schema
 * subtree we are working on
 * @param {Path} subPath the path we are looking at to navigate. It is based on the
 * current schema and document contexts
 * @returns {{element: {type: U; _id: Id}; remainingPath: Path}}
 */
function nextElementTypeAndId<MapsInterface, U extends keyof MapsInterface>(
  doc:
    | INormalizedDocument<MapsInterface, U>
    | INormalizedMutableMapsDocument<MapsInterface, U>,
  docContext: Id | IParentedId<U> | IMutableDocument<MapsInterface, U>,
  schemaContext: EntityReferences<U> | [IFieldEntityReference<U>],
  subPath: Path<MapsInterface>
): INextElementAndIdRetVal<MapsInterface, U> {
  const typeMap = getSchemaTypeMap(doc.schema);
  const remainingPath = subPath.slice();
  if (isSchemaReference(schemaContext)) {
    const {__schemaType} = schemaContext;
    if (!typeMap.has(__schemaType)) {
      throw new Error(`Schema does not contain type ${__schemaType}`);
    }
    if (!(isIParentedId(docContext) || isId(docContext))) {
      throw new Error(`Document error: expecting to be an entity`);
    }
    return {
      element: {
        __typename: __schemaType,
        _id: isIParentedId(docContext) ? docContext._id : (docContext as Id)
      },
      remainingPath
    };
  } else if (Array.isArray(schemaContext)) {
    if (
      !(
        remainingPath.length >= 1 &&
        typeof remainingPath[0] === 'number' &&
        isSchemaReference(schemaContext[0]) &&
        Array.isArray(docContext) &&
        docContext.length > remainingPath[0]
      )
    ) {
      throw new Error('Expected an index for an array in the path');
    }
    const index = remainingPath[0];
    remainingPath.shift();
    return {
      element: {
        __typename: schemaContext[0].__schemaType,
        _id: docContext[index]
      },
      remainingPath
    };
  } else if (typeof schemaContext === 'object') {
    if (
      !(
        remainingPath.length >= 1 &&
        typeof remainingPath[0] === 'string' &&
        remainingPath[0] in schemaContext &&
        remainingPath[0] in (docContext as any)
      )
    ) {
      throw new Error('Expecting a field within the root document and schema');
    }
    const nextSchemaContext = (schemaContext as EntityReferences<any>)[
      remainingPath[0]
    ];
    const nextDocContext = (docContext as any)[remainingPath[0]];
    remainingPath.shift();
    return nextElementTypeAndId(
      doc,
      nextDocContext,
      nextSchemaContext,
      remainingPath
    );
  }
  throw new Error('Schema/document error');
}

function parentTypeOfElement<MapsInterface, U extends keyof MapsInterface>(
  document:
    | INormalizedDocument<MapsInterface, U>
    | INormalizedMutableMapsDocument<MapsInterface, U>,
  childType: U,
  childId: Id
): U {
  const typeMap = getSchemaTypeMap(document.schema);
  const childElement = mappedElement(
    document.maps,
    childType,
    childId
  ) as IParentedId<U>;
  let parentType: U | null = null;
  if (childElement.parentType) {
    parentType = childElement.parentType;
  }
  if (!parentType) {
    const elementMappings = typeMap.get(childType);
    if (!(elementMappings && elementMappings.parent)) {
      throw new TypeError(`Type mappings not found for type ${childType}`);
    }
    parentType = elementMappings.parent.type;
  }
  return parentType;
}

function parentToChildTypeMappings<
  MapsInterface,
  U extends keyof MapsInterface
>(
  document:
    | INormalizedDocument<MapsInterface, U>
    | INormalizedMutableMapsDocument<MapsInterface, U>,
  parentType: U,
  childType: U
): TypeLink<MapsInterface, U> {
  const typeMap = getSchemaTypeMap(document.schema);
  const parentMappings = typeMap.get(parentType);
  if (!parentMappings) {
    throw new TypeError(`Parent type mappings for child type ${childType}`);
  }
  if (!(childType in parentMappings.children)) {
    throw new TypeError(
      `Child type ${childType} not found among children types of parent type ${parentType}`
    );
  }
  return parentMappings.children[childType]!;
}

export function parentToChildFieldName<
  MapsInterface,
  U extends keyof MapsInterface
>(
  document:
    | INormalizedDocument<MapsInterface, U>
    | INormalizedMutableMapsDocument<MapsInterface, U>,
  parentType: U,
  childType: U
): AllMappedTypesFields<MapsInterface> {
  const linkedFieldProps = parentToChildTypeMappings(
    document,
    parentType,
    childType
  );
  return linkedFieldProps.field;
}

/**
 * Creates a dictionary of types for the schema passed as parameter.
 *
 * The dictionary is used to work out the parent / child relation when
 * navigating a normalized documents from a node up to the root of the document.
 *
 * @param {IDocumentSchema<NormalizedDoc, U>} schema
 * @returns {TypeLinkDictionary<NormalizedDocument, U>}
 */
function createTypesMapForSchema<
  MapsInterface,
  U extends keyof EntitiesMaps<MapsInterface>
>(
  schema: IDocumentSchema<MapsInterface, U>
): TypeLinkDictionary<MapsInterface, U> {
  const childMap: Map<U, {[childTypeName: string]: string}> = new Map();
  for (const typeName in schema.types) {
    const typeSettings = schema.types[typeName];
    for (const fieldName in typeSettings) {
      if (fieldName === 'parentId') continue;
      const fieldValue = typeSettings[fieldName];
      const childFieldSettings = Array.isArray(fieldValue)
        ? fieldValue[0]
        : fieldValue;
      const existingSettings =
        childMap.get(childFieldSettings.__schemaType) || {};
      childMap.set(childFieldSettings.__schemaType, {
        ...existingSettings,
        [typeName]: fieldName
      });
    }
  }
  const typeLinkMap: TypeLinkDictionary<MapsInterface, U> = new Map();
  for (const typeName in schema.types) {
    const typeSettings = schema.types[typeName];
    const typeEntry = {children: {}} as TypeLinks<MapsInterface, U>;
    for (const fieldName in typeSettings) {
      if (fieldName === 'parentId') continue;
      const fieldSettingsValue = typeSettings[fieldName];
      const childFieldSettings = Array.isArray(fieldSettingsValue)
        ? fieldSettingsValue[0]
        : fieldSettingsValue;
      typeEntry.children[childFieldSettings.__schemaType] = {
        type: childFieldSettings.__schemaType,
        field: (fieldName as any) as AllMappedTypesFields<MapsInterface>,
        isArray: Array.isArray(fieldSettingsValue)
      };
    }
    typeLinkMap.set(typeName, typeEntry);
  }
  return typeLinkMap;
}

/**
 * Given an element type and id of and element within the document,
 * returns the path to it.
 *
 * Each element is expected to be referenced only once as an official child
 * within the document.
 *
 * The element could still be referenced informally from fields not captured
 * in the document schema
 *
 * @param {U} elementTypeMap
 * @param {Id} elementId
 * @returns {Path}
 */

export function pathForElementWithId<
  NorDoc extends INormalizedDocument<any, any>
>(
  doc:
    | INormalizedDocument<MapsOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>
    | INormalizedMutableMapsDocument<MapsOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>,
  elementTypeMap: UOfNormDoc<NorDoc>,
  elementId: Id
): Path<MapsOfNormDoc<NorDoc>> {
  if (
    !(
      elementTypeMap in doc.maps && typeof doc.maps[elementTypeMap] === 'object'
    )
  ) {
    throw new Error(`Map for type ${elementTypeMap} not found`);
  }
  const map = doc.maps[elementTypeMap]!;
  const element = map.get(elementId) as IParentedId;
  if (!element) {
    throw new Error(
      `Referential integrity error with type ${elementTypeMap} and id ${elementId}`
    );
  }
  const path: Path<MapsOfNormDoc<NorDoc>> = [];
  if (element.parentId) {
    const parentType = parentTypeOfElement(doc, elementTypeMap, elementId);
    const parentToUsFieldLink = parentToChildTypeMappings(
      doc,
      parentType,
      elementTypeMap
    );
    // We are not a root element, let's go up the hierarchy
    const parentElement = mappedElement(doc.maps, parentType, element.parentId);
    if (!parentElement) {
      throw new Error(
        `Referential integrity error for parent of element ${elementTypeMap}.${elementId}`
      );
    }
    path.push(parentToUsFieldLink.field);
    if (parentToUsFieldLink.isArray) {
      const position = ((parentElement as any)[
        parentToUsFieldLink.field
      ] as Array<Id>).findIndex(
        parentedElementId => parentedElementId === elementId
      );
      if (position === -1) {
        throw new Error(
          `Element ${elementTypeMap}.${elementId} not found in parent`
        );
      }
      path.push(position);
    }
    const parentPath = pathForElementWithId(doc, parentType, element.parentId);
    return parentPath.concat(path);
  } else {
    if (!(elementTypeMap === doc.rootType && elementId === doc.rootId)) {
      throw new Error(
        `Top level element of type ${elementTypeMap} is not the root element of the document`
      );
    }
  }
  return path;
}

export function mutableDocument<NorDoc extends INormalizedDocument<any, any>>(
  doc: NorDoc
): IMutableDocument<MapsOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>, NorDoc> {
  const schema = doc.schema as IDocumentSchema<
    MapsOfNormDoc<NorDoc>,
    UOfNormDoc<NorDoc>
  >;
  const typeMap = getSchemaTypeMap(schema);

  /**
   * Helper function that removes the reference to an element via
   * its id from its parent. Used in MutableDocument when moving or
   * deleting an element.
   *
   * Looks up in the schema to what parent type to look out for,
   * checking that the child is indeed referenced before removing it.
   *
   * @param {IMutableDocument<MapsInterface, U>} doc
   * @param {U} childType
   * @param {Id} childId
   * @private
   */
  function _removeElementFromParentContext(
    doc: IMutableDocument<MapsOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>,
    childType: UOfNormDoc<NorDoc>,
    childId: Id
  ): void {
    const toRemoveElement = mappedElement(
      doc.maps,
      childType,
      childId
    ) as IParentedId<UOfNormDoc<NorDoc>>;
    if (toRemoveElement.parentId) {
      const parentId = toRemoveElement.parentId;
      const parentType = parentTypeOfElement(doc, childType, childId);
      const {field: parentToElementFieldName} = parentToChildTypeMappings(
        doc,
        parentType,
        childType
      );

      const parentElement = mappedElement(
        doc.maps,
        parentType,
        parentId
      ) as IParentedId<UOfNormDoc<NorDoc>> & {[field: string]: Id | Id[]};

      const parentChildField = parentElement[parentToElementFieldName];
      if (parentChildField && Array.isArray(parentChildField)) {
        const elementIndex = parentChildField.indexOf(toRemoveElement._id);
        if (elementIndex === -1) {
          throw new ReferenceError(
            'Child element to delete not found in parent element'
          );
        }
        const updatedList: Id[] = (parentChildField as Id[]).slice();
        updatedList.splice(elementIndex, 1);
        doc.maps[parentType].set(parentElement._id, {
          ...parentElement,
          [parentToElementFieldName]: updatedList
        });
      } else {
        if (!(parentToElementFieldName in parentElement)) {
          throw new TypeError(
            `Field ${parentToElementFieldName} not found in parent object of type ${parentType}`
          );
        }
        doc.maps[parentType].set(parentElement._id, {
          ...parentElement,
          [parentToElementFieldName]: null
        });
      }
    }
  }

  /**
   * Helper function that inserts an element, via its ID, to
   * a parent element context.
   *
   * The function modifies both the parent, by referencing to the child element,
   * and the child element, by updating its parentId field.
   *
   * The function also ensures that the operation respects referential integrity
   * and schema integrity.
   *
   * @param {IMutableDocument<MapsInterface, U>} doc
   * @param {U} parentType
   * @param {Id} parentId
   * @param {SubEntityPathElement} positionInParent
   * @param {IParentedId} childElement
   * @returns {U}
   * @private
   */
  function _addElementIdToParentContext<
    T extends IParentedId,
    ParentType extends IParentedId
  >(
    doc: IMutableDocument<MapsOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>,
    parentType: UOfNormDoc<NorDoc>,
    parentId: Id,
    positionInParent: SubEntityPathElement<MapsOfNormDoc<NorDoc>>,
    childElement: T
  ): UOfNormDoc<NorDoc> {
    const context = mappedElement(
      doc.maps,
      parentType,
      parentId
    ) as IParentedId;
    const parentSchema = doc.schema.types[parentType];
    if (!parentSchema) {
      throw new TypeError(`Schema for parent type ${parentType} not found`);
    }
    const field =
      typeof positionInParent === 'string'
        ? positionInParent
        : (positionInParent as [string, number | number[]])[0];
    if (
      !(
        typeof context === 'object' &&
        field in context &&
        field in parentSchema
      )
    ) {
      throw new Error('Position not found for insert operation');
    }
    const {__schemaType} = parentSchema[field][0];
    doc.maps[__schemaType].set(
      childElement._id,
      childElement.parentId === parentId
        ? childElement
        : {
            ...childElement,
            parentId,
            parentType
          }
    );

    if (positionInParent instanceof Array && positionInParent.length === 2) {
      // expect string and index tuple
      const targetList = ((context as any)[field] as Id[]).slice();
      const index =
        positionInParent[1] < 0
          ? 0
          : positionInParent[1] > targetList.length
          ? targetList.length
          : positionInParent[1];
      targetList.splice(index, 0, childElement._id);
      doc.maps[parentType].set(parentId, {
        ...context,
        [field]: targetList
      });
    } else {
      throw new Error('Unexpected position object');
    }
    return __schemaType;
  }

  let lazyMaps = {} as MutableEntitiesMaps<
    MapsOfNormDoc<NorDoc>,
    UOfNormDoc<NorDoc>
  >;
  for (const entityType in doc.maps) {
    lazyMaps = {
      ...lazyMaps,
      [entityType]: new LazyMutableMap(doc.maps[entityType])
    };
  }
  const mutableDoc: IMutableDocument<
    MapsOfNormDoc<NorDoc>,
    UOfNormDoc<NorDoc>,
    NorDoc
  > = {
    maps: lazyMaps,
    schema,
    originalDocument: doc,
    rootType: doc.rootType,
    rootId: doc.rootId,
    changes: [],
    updatedDocument: function () {
      const updatedMaps = {} as EntitiesMaps<
        MapsOfNormDoc<NorDoc>,
        UOfNormDoc<NorDoc>
      >;
      let hasChanges = false;
      for (const mapName in this.maps) {
        // @ts-expect-error
        updatedMaps[mapName as UOfNormDoc<NorDoc>] = this.maps[
          mapName as UOfNormDoc<NorDoc>
        ].getMap();
        hasChanges =
          hasChanges || this.maps[mapName as UOfNormDoc<NorDoc>].hasChanged();
      }
      return hasChanges
        ? {
            ...this.originalDocument,
            maps: updatedMaps
          }
        : this.originalDocument;
    },
    applyChanges: function (
      changes:
        | HDocOperation<MapsOfNormDoc<NorDoc>, any, UOfNormDoc<NorDoc>>
        | Array<HDocOperation<MapsOfNormDoc<NorDoc>, any, UOfNormDoc<NorDoc>>>
    ) {
      const changesToRun = Array.isArray(changes) ? changes : [changes];
      for (const command of changesToRun) {
        if (command.__typename === HDocCommandType.INSERT_ELEMENT) {
          this.insertElement(command);
        }
        if (command.__typename === HDocCommandType.CHANGE_ELEMENT) {
          this.changeElement(command);
        }
        if (command.__typename === HDocCommandType.DELETE_ELEMENT) {
          this.deleteElement(command);
        }
        if (command.__typename === HDocCommandType.MOVE_ELEMENT) {
          this.moveElement(command);
        }
      }
    },
    insertElement: function <
      T extends IParentedId<UOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>
    >(
      insertCmd: IInsertElement<MapsOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>, T>
    ): T {
      const {element, parent, position} = insertCmd;
      if (!isSubEntityPathElement(position)) {
        throw new Error('Incorrect position parameter');
      }
      const {__typename: parentType, _id: parentId} = isElementId(parent)
        ? parent
        : this.idAndTypeForPath(parent);
      const elementId = element._id ? element._id : uuid();
      const newElement = {
        ...element,
        _id: elementId
      } as T;
      _addElementIdToParentContext(
        this,
        parentType,
        parentId,
        position,
        newElement
      );
      this.changes.push({
        ...insertCmd,
        element: {
          ...element,
          _id: elementId
        },
        parent: {__typename: parentType, _id: parentId}
      });
      return newElement;
    },
    changeElement: function (changeCommand) {
      const {element, changes} = changeCommand;
      const {__typename, _id} = isElementId(element)
        ? element
        : this.idAndTypeForPath(element);
      const existingElement = mappedElement(
        this.maps,
        __typename,
        _id
      ) as IParentedId;
      const updatedElement = {
        ...existingElement,
        ...changes
      };
      if (isEqual(updatedElement, existingElement)) return;
      this.maps[__typename].set(updatedElement._id, updatedElement);
      this.changes.push(
        isElementId(element)
          ? changeCommand
          : {
              ...changeCommand,
              element: {
                __typename,
                _id
              }
            }
      );
    },
    moveElement: function <
      T extends IParentedId<UOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>
    >(moveCommand: IMoveElement<MapsOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>, T>) {
      const {changes, element, toParent, toPosition} = moveCommand;
      // 1. Find the element
      const {__typename, _id} = isElementId(element)
        ? element
        : this.idAndTypeForPath(element);
      const elementToMove = mappedElement(this.maps, __typename, _id) as T;
      const elementSchemaContext = typeMap.get(__typename);
      if (!elementSchemaContext) {
        throw new TypeError(`Schema for type ${__typename} not found`);
      }

      // 2. Find the original parent - if any and remove reference to element
      const originalParentId = elementToMove.parentId || null;
      if (originalParentId) {
        _removeElementFromParentContext(this, __typename, _id);
      }

      // 3. Find the new parent
      const {__typename: targetParentType, _id: targetParentId} = isElementId(
        toParent
      )
        ? toParent
        : this.idAndTypeForPath(toParent);

      // 4. Add reference to element to new parent, while applying additional changes
      // if provided int he command
      _addElementIdToParentContext(
        this,
        targetParentType,
        targetParentId,
        toPosition,
        changes ? {...elementToMove, ...changes} : elementToMove
      );
      this.changes.push(
        isElementId(moveCommand.element) && isElementId(moveCommand.toParent)
          ? moveCommand
          : {
              ...moveCommand,
              element: {
                __typename,
                _id
              },
              toParent: {
                __typename: targetParentType,
                _id: targetParentId
              }
            }
      );
    },
    deleteElement: function (deleteCommand): void {
      const {element} = deleteCommand;
      const {__typename, _id} = isElementId(element)
        ? element
        : this.idAndTypeForPath(element);
      const toDeleteElement = mappedElement(
        this.maps,
        __typename,
        _id
      ) as IParentedId;
      if (toDeleteElement.parentId) {
        _removeElementFromParentContext(this, __typename, _id);
      }
      this.maps[__typename].delete(toDeleteElement._id);
      this.changes.push(
        isElementId(deleteCommand.element)
          ? deleteCommand
          : {
              ...deleteCommand,
              element: {
                __typename,
                _id
              }
            }
      );
    },
    idAndTypeForPath: function (path) {
      return idAndTypeForPath(this, path);
    },
    pathForElementWithId: function (elementTypeMap, elementId) {
      if (
        !(
          elementTypeMap in this.maps &&
          typeof this.maps[elementTypeMap] === 'object'
        )
      ) {
        throw new Error(`Map for type ${elementTypeMap} not found`);
      }
      const map = this.maps[elementTypeMap]!;
      const element = map.get(elementId) as IParentedId;
      if (!element) {
        throw new Error(
          `Referential integrity error with type ${elementTypeMap} and id ${elementId}`
        );
      }
      const path: Path<MapsOfNormDoc<NorDoc>> = [];
      if (element.parentId) {
        const parentType = parentTypeOfElement(this, elementTypeMap, elementId);
        const parentToUsFieldLink = parentToChildTypeMappings(
          this,
          parentType,
          elementTypeMap
        );
        // We are not a root element, let's go up the hierarchy
        const parentElement = mappedElement(
          this.maps,
          parentType,
          element.parentId
        );
        if (!parentElement) {
          throw new Error(
            `Referential integrity error for parent of element ${elementTypeMap}.${elementId}`
          );
        }
        path.push(parentToUsFieldLink.field);
        if (parentToUsFieldLink.isArray) {
          const position = ((parentElement as any)[
            parentToUsFieldLink.field
          ] as Array<Id>).findIndex(
            parentedElementId => parentedElementId === elementId
          );
          if (position === -1) {
            throw new Error(
              `Element ${elementTypeMap}.${elementId} not found in parent`
            );
          }
          path.push(position);
        }
        const parentPath = this.pathForElementWithId(
          parentType,
          element.parentId
        );
        return parentPath.concat(path);
      } else {
        if (!(elementTypeMap === this.rootType && elementId === this.rootId)) {
          throw new Error(
            `Top level element of type ${elementTypeMap} is not the root element of the document`
          );
        }
      }
      return path;
    }
  };
  return mutableDoc;
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
  if (obj && obj instanceof LazyMutableMap) {
    if (obj.getMap().size === 0) return true;
    for (const [key, val] of obj.getMap().entries()) {
      if (!(isId(key) && isParentedId(val))) {
        return false;
      }
    }
    return true;
  }
  return false;
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
  U extends keyof EntitiesMaps<MapsInterface> = keyof EntitiesMaps<
    MapsInterface
  >
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
  U extends keyof EntitiesMaps<MapsInterface> = keyof EntitiesMaps<
    MapsInterface
  >
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

export const docReducer = <NorDoc extends INormalizedDocument<any, any>>(
  doc: NorDoc,
  cmd:
    | HDocOperation<MapsOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>, any>
    | Array<HDocOperation<MapsOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>, any>>
): NorDoc => {
  const cmds = Array.isArray(cmd) ? cmd : [cmd];
  if (cmds.length < 1) return doc;
  const mutableDoc = mutableDocument(doc);
  try {
    mutableDoc.applyChanges(cmds);
  } catch (err) {
    // silently eaten
  }
  return mutableDoc.updatedDocument();
};

export function idAndTypeOfChange<MapsInterface, U extends keyof MapsInterface>(
  change: HDocOperation<MapsInterface, U, IParentedId<U, U>>,
  doc?:
    | INormalizedDocument<MapsInterface, U>
    | IMutableDocument<MapsInterface, U>
): IElementId<U> {
  if (change.__typename === HDocCommandType.INSERT_ELEMENT) {
    return isElementId(change.element)
      ? change.element
      : {__typename: change.element.__typename, _id: 'NOTVALID'};
  } else if (
    change.__typename === HDocCommandType.CHANGE_ELEMENT ||
    change.__typename === HDocCommandType.DELETE_ELEMENT ||
    change.__typename === HDocCommandType.MOVE_ELEMENT
  ) {
    return isElementId(change.element)
      ? change.element
      : doc
      ? idAndTypeForPath(doc, change.element)
      : {
          __typename: 'Invalid' as U,
          _id: 'Invalid'
        };
  } else {
    return {
      __typename: 'Invalid' as U,
      _id: 'Invalid'
    };
  }
}
