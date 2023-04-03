import {
  ChangeElement,
  DeleteElement,
  ElementId,
  HDocCommandType,
  HDocOperation,
  Id,
  InsertElement,
  MoveElement,
  MutableDocument,
  NormalizedDocument,
  Path,
  TreeNode
} from './HTypes';
import {LazyMutableMap} from './LazyMap';
import {
  extractElementId,
  generateNewId,
  hasMappedElement,
  iidToStr,
  isElementId,
  mappedElement,
  NodeWithIdIterator
} from './HUtils';
import {
  fieldAndIndexOfPosition,
  idAndTypeForPath,
  NormalizedDocumentImpl,
  pathForElementWithId
} from './HDocument';
import {treeNodeReducer} from './TreeNodeReducer';

class MutableDocumentImpl<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef
> implements MutableDocument<NodesDef, R>
{
  private readonly _originalDoc: NormalizedDocument<NodesDef, R>;
  private _currentNodes: LazyMutableMap<string, NodesDef[keyof NodesDef]>;
  private readonly _changes: HDocOperation<
    NodesDef,
    keyof NodesDef,
    keyof NodesDef
  >[];

  constructor(originalDoc: NormalizedDocument<NodesDef, R>) {
    this._originalDoc = originalDoc;
    this._currentNodes = new LazyMutableMap(
      new Map(new NodeWithIdIterator(originalDoc))
    );
    this._changes = [];
  }

  public get schema() {
    return this._originalDoc.schema;
  }

  public get originalDocument() {
    return this._originalDoc;
  }

  public get updatedDocument() {
    return this._currentNodes.hasChanged()
      ? new NormalizedDocumentImpl(this as NormalizedDocument<NodesDef, R>)
      : this.originalDocument;
  }

  public get changes() {
    return this._changes;
  }

  public [Symbol.iterator](): IterableIterator<NodesDef[keyof NodesDef]> {
    return this._currentNodes.values();
  }

  public emptyNode<NodeType extends keyof NodesDef>(nodeType: NodeType) {
    return this._originalDoc.emptyNode(nodeType);
  }

  public getNode<Type extends keyof NodesDef>(
    nodeIId: ElementId<Type>
  ): NodesDef[Type] | null {
    return (
      (this._currentNodes.get(iidToStr(nodeIId)) as
        | NodesDef[Type]
        | undefined) || null
    );
  }

  public pathForElementWithId(
    elementTypeMap: keyof NodesDef,
    elementId: Id
  ): Path<NodesDef> {
    return pathForElementWithId(
      this as NormalizedDocument<NodesDef, R>,
      elementTypeMap,
      elementId
    );
  }

  public get rootId() {
    return {
      __typename: this._originalDoc.rootId.__typename,
      _id: this._originalDoc.rootId._id
    };
  }

  public idAndTypeForPath(path: Path<NodesDef>): ElementId<keyof NodesDef> {
    return idAndTypeForPath(this as NormalizedDocument<NodesDef, R>, path);
  }

  public insertElement<
    ChildType extends keyof NodesDef,
    ParentType extends keyof NodesDef
  >(
    insertCmd: Omit<
      InsertElement<NodesDef, ChildType, ParentType>,
      '__typename'
    >
  ): NodesDef[ChildType] {
    const {element, parent, position} = insertCmd;
    const {
      _id: inpElementId,
      __typename: elementTypename,
      ...newNodeData
    } = element;

    const {
      parentNode,
      field: parentField,
      index: indexInParent
    } = fieldAndIndexOfPosition(this, parent, position);
    const elementId = inpElementId ? inpElementId : generateNewId();
    const newElement = Object.assign(this.emptyNode(elementTypename), {
      _id: elementId,
      parent: {
        __typename: parentNode.__typename,
        _id: parentNode._id,
        parentField
      }
    }) as NodesDef[ChildType];
    newElement.data = Object.assign(newElement.data, newNodeData);
    if (indexInParent !== -1) {
      newElement.parent!.index = indexInParent;
    }

    const updatedParentNode = treeNodeReducer(parentNode, {
      __typename: 'AddNodeToLinkField',
      childNodeId: newElement,
      parentField,
      atIndex: indexInParent === -1 ? undefined : indexInParent
    });
    this._currentNodes.set(iidToStr(updatedParentNode), updatedParentNode);
    this._currentNodes.set(iidToStr(newElement), newElement);
    const insertChange: InsertElement<NodesDef, ChildType, ParentType> = {
      ...insertCmd,
      __typename: HDocCommandType.INSERT_ELEMENT,
      element: Object.assign(element, {
        _id: elementId
      }),
      parent: extractElementId(parentNode) as ElementId<ParentType>
    };
    // @ts-expect-error The insert change type cannot be generalised to keyof
    this.changes.push(insertChange);
    return newElement;
  }

  public deleteElement<TargetType extends keyof NodesDef>(
    deleteCommand: Omit<DeleteElement<NodesDef, TargetType>, '__typename'>
  ) {}

  public changeElement<TargetType extends keyof NodesDef>(
    changeCommand: ChangeElement<NodesDef, TargetType>
  ) {
    const {element} = changeCommand;
    const elementId = isElementId(element)
      ? element
      : this.idAndTypeForPath(element);
    const existingElement = this.getNode(elementId);
    if (!existingElement) {
      throw new ReferenceError('Node to change not found');
    }
    // @ts-expect-error Uplift od change command to keyof NodesDef
    const updatedNode = treeNodeReducer(existingElement, changeCommand);
    if (updatedNode === existingElement) return;
    this._currentNodes.set(iidToStr(updatedNode), updatedNode);
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
  }

  public moveElement<
    TargetTypename extends keyof NodesDef,
    ParentTypename extends keyof NodesDef
  >(moveCommand: MoveElement<NodesDef, TargetTypename, ParentTypename>) {}

  applyChanges(
    changes:
      | HDocOperation<NodesDef, keyof NodesDef, keyof NodesDef>
      | Array<HDocOperation<NodesDef, keyof NodesDef, keyof NodesDef>>
  ) {
    const arrChanges = Array.isArray(changes) ? changes : [changes];
    for (const change of arrChanges) {
      if (change.__typename === HDocCommandType.INSERT_ELEMENT) {
        this.insertElement(change);
      }
    }
  }
}

export function mutableDocument<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef
>(doc: NormalizedDocument<NodesDef, R>): MutableDocument<NodesDef, R> {
  return new MutableDocumentImpl(doc);
  // const schema = doc.schema as DocumentSchema<
  //   MapsOfNormDoc<NorDoc>,
  //   UOfNormDoc<NorDoc>
  // >;
  // const typeMap = getSchemaTypeMap(schema);
  //
  // /**
  //  * Helper function that removes the reference to an element via
  //  * its id from its parent. Used in MutableDocument when moving or
  //  * deleting an element.
  //  *
  //  * Looks up in the schema to what parent type to look out for,
  //  * checking that the child is indeed referenced before removing it.
  //  *
  //  * @param {MutableDocument<MapsInterface, U>} doc
  //  * @param {U} childType
  //  * @param {Id} childId
  //  * @private
  //  */
  // function _removeElementFromParentContext(
  //   doc: MutableDocument<MapsOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>,
  //   childType: UOfNormDoc<NorDoc>,
  //   childId: Id
  // ): void {
  //   const toRemoveElement = mappedElement(
  //     doc.maps,
  //     childType,
  //     childId
  //   ) as IParentedId<UOfNormDoc<NorDoc>>;
  //   if (toRemoveElement.parentId) {
  //     const parentId = toRemoveElement.parentId;
  //     const parentType = parentTypeOfElement(doc, childType, childId);
  //     const {field: parentToElementFieldName} = parentToChildTypeMappings(
  //       doc,
  //       parentType,
  //       childType
  //     );
  //
  //     const parentElement = mappedElement(
  //       doc.maps,
  //       parentType,
  //       parentId
  //     ) as IParentedId<UOfNormDoc<NorDoc>> & {[field: string]: Id | Id[]};
  //
  //     const parentChildField = parentElement[parentToElementFieldName];
  //     if (parentChildField && Array.isArray(parentChildField)) {
  //       const elementIndex = parentChildField.indexOf(toRemoveElement._id);
  //       if (elementIndex === -1) {
  //         throw new ReferenceError(
  //           'Child element to delete not found in parent element'
  //         );
  //       }
  //       const updatedList: Id[] = (parentChildField as Id[]).slice();
  //       updatedList.splice(elementIndex, 1);
  //       doc.maps[parentType].set(parentElement._id, {
  //         ...parentElement,
  //         [parentToElementFieldName]: updatedList
  //       });
  //     } else {
  //       if (!(parentToElementFieldName in parentElement)) {
  //         throw new TypeError(
  //           `Field ${parentToElementFieldName} not found in parent object of type ${parentType}`
  //         );
  //       }
  //       doc.maps[parentType].set(parentElement._id, {
  //         ...parentElement,
  //         [parentToElementFieldName]: null
  //       });
  //     }
  //   }
  // }
  //
  // /**
  //  * Helper function that inserts an element, via its ID, to
  //  * a parent element context.
  //  *
  //  * The function modifies both the parent, by referencing to the child element,
  //  * and the child element, by updating its parentId field.
  //  *
  //  * The function also ensures that the operation respects referential integrity
  //  * and schema integrity.
  //  *
  //  * @param {MutableDocument<MapsInterface, U>} doc
  //  * @param {U} parentType
  //  * @param {Id} parentId
  //  * @param {SubEntityPathElement} positionInParent
  //  * @param {IParentedId} childElement
  //  * @returns {U}
  //  * @private
  //  */
  // function _addElementIdToParentContext<T extends IParentedId>(
  //   doc: MutableDocument<MapsOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>,
  //   parentType: UOfNormDoc<NorDoc>,
  //   parentId: Id,
  //   positionInParent: SubEntityPathElement<MapsOfNormDoc<NorDoc>>,
  //   childElement: T
  // ): UOfNormDoc<NorDoc> {
  //   const context = mappedElement(
  //     doc.maps,
  //     parentType,
  //     parentId
  //   ) as IParentedId;
  //   const parentSchema = doc.schema.types[parentType];
  //   if (!parentSchema) {
  //     throw new TypeError(`Schema for parent type ${parentType} not found`);
  //   }
  //   const field =
  //     typeof positionInParent === 'string'
  //       ? positionInParent
  //       : (positionInParent as [string, number | number[]])[0];
  //   if (
  //     !(
  //       typeof context === 'object' &&
  //       field in context &&
  //       field in parentSchema
  //     )
  //   ) {
  //     throw new Error('Position not found for insert operation');
  //   }
  //   const {__schemaType} = parentSchema[field][0];
  //   doc.maps[__schemaType].set(
  //     childElement._id,
  //     childElement.parentId === parentId
  //       ? childElement
  //       : {
  //           ...childElement,
  //           parentId,
  //           parentType
  //         }
  //   );
  //
  //   if (positionInParent instanceof Array && positionInParent.length === 2) {
  //     // expect string and index tuple
  //     const targetList = ((context as any)[field] as Id[]).slice();
  //     const index =
  //       positionInParent[1] < 0
  //         ? 0
  //         : positionInParent[1] > targetList.length
  //         ? targetList.length
  //         : positionInParent[1];
  //     targetList.splice(index, 0, childElement._id);
  //     doc.maps[parentType].set(parentId, {
  //       ...context,
  //       [field]: targetList
  //     });
  //   } else {
  //     throw new Error('Unexpected position object');
  //   }
  //   return __schemaType;
  // }
  //
  // let lazyMaps = {} as MutableEntitiesMaps<
  //   MapsOfNormDoc<NorDoc>,
  //   UOfNormDoc<NorDoc>
  // >;
  // for (const entityType in doc.maps) {
  //   lazyMaps = {
  //     ...lazyMaps,
  //     [entityType]: new LazyMutableMap(doc.maps[entityType])
  //   };
  // }
  // const mutableDoc: MutableDocument<
  //   MapsOfNormDoc<NorDoc>,
  //   UOfNormDoc<NorDoc>,
  //   NorDoc
  // > = {
  //   maps: lazyMaps,
  //   schema,
  //   originalDocument: doc,
  //   rootType: doc.rootType,
  //   rootId: doc.rootId,
  //   changes: [],
  //   updatedDocument: function () {
  //     const updatedMaps = {} as EntitiesMaps<
  //       MapsOfNormDoc<NorDoc>,
  //       UOfNormDoc<NorDoc>
  //     >;
  //     let hasChanges = false;
  //     for (const mapName in this.maps) {
  //       // @ts-expect-error
  //       updatedMaps[mapName as UOfNormDoc<NorDoc>] =
  //         this.maps[mapName as UOfNormDoc<NorDoc>].getMap();
  //       hasChanges =
  //         hasChanges || this.maps[mapName as UOfNormDoc<NorDoc>].hasChanged();
  //     }
  //     return hasChanges
  //       ? {
  //           ...this.originalDocument,
  //           maps: updatedMaps
  //         }
  //       : this.originalDocument;
  //   },
  //   applyChanges: function (
  //     changes:
  //       | HDocOperation<MapsOfNormDoc<NorDoc>, any, UOfNormDoc<NorDoc>>
  //       | Array<HDocOperation<MapsOfNormDoc<NorDoc>, any, UOfNormDoc<NorDoc>>>
  //   ) {
  //     const changesToRun = Array.isArray(changes) ? changes : [changes];
  //     for (const command of changesToRun) {
  //       if (command.__typename === HDocCommandType.INSERT_ELEMENT) {
  //         this.insertElement(command);
  //       }
  //       if (command.__typename === HDocCommandType.CHANGE_ELEMENT) {
  //         this.changeElement(command);
  //       }
  //       if (command.__typename === HDocCommandType.DELETE_ELEMENT) {
  //         this.deleteElement(command);
  //       }
  //       if (command.__typename === HDocCommandType.MOVE_ELEMENT) {
  //         this.moveElement(command);
  //       }
  //     }
  //   },
  //   insertElement: function <
  //     T extends IParentedId<UOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>
  //   >(
  //     insertCmd: InsertElement<MapsOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>, T>
  //   ): T {
  //     const {element, parent, position} = insertCmd;
  //     if (!isSubEntityPathElement(position)) {
  //       throw new Error('Incorrect position parameter');
  //     }
  //     const {__typename: parentType, _id: parentId} = isElementId(parent)
  //       ? parent
  //       : this.idAndTypeForPath(parent);
  //     const elementId = element._id ? element._id : generateNewId();
  //     const newElement = {
  //       ...element,
  //       _id: elementId
  //     } as T;
  //     _addElementIdToParentContext(
  //       this,
  //       parentType,
  //       parentId,
  //       position,
  //       newElement
  //     );
  //     this.changes.push({
  //       ...insertCmd,
  //       element: {
  //         ...element,
  //         _id: elementId
  //       },
  //       parent: {__typename: parentType, _id: parentId}
  //     });
  //     return newElement;
  //   },
  //   changeElement: function (changeCommand) {
  //     const {element, changes} = changeCommand;
  //     const {__typename, _id} = isElementId(element)
  //       ? element
  //       : this.idAndTypeForPath(element);
  //     const existingElement = mappedElement(
  //       this.maps,
  //       __typename,
  //       _id
  //     ) as IParentedId;
  //     const updatedElement = {
  //       ...existingElement,
  //       ...changes
  //     };
  //     if (isEqual(updatedElement, existingElement)) return;
  //     this.maps[__typename].set(updatedElement._id, updatedElement);
  //     this.changes.push(
  //       isElementId(element)
  //         ? changeCommand
  //         : {
  //             ...changeCommand,
  //             element: {
  //               __typename,
  //               _id
  //             }
  //           }
  //     );
  //   },
  //   moveElement: function <
  //     T extends IParentedId<UOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>
  //   >(moveCommand: MoveElement<MapsOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>, T>) {
  //     const {changes, element, toParent, toPosition} = moveCommand;
  //     // 1. Find the element
  //     const {__typename, _id} = isElementId(element)
  //       ? element
  //       : this.idAndTypeForPath(element);
  //     const elementToMove = mappedElement(this.maps, __typename, _id) as T;
  //     const elementSchemaContext = typeMap.get(__typename);
  //     if (!elementSchemaContext) {
  //       throw new TypeError(`Schema for type ${__typename} not found`);
  //     }
  //
  //     // 2. Find the original parent - if any and remove reference to element
  //     const originalParentId = elementToMove.parentId || null;
  //     if (originalParentId) {
  //       _removeElementFromParentContext(this, __typename, _id);
  //     }
  //
  //     // 3. Find the new parent
  //     const {__typename: targetParentType, _id: targetParentId} = isElementId(
  //       toParent
  //     )
  //       ? toParent
  //       : this.idAndTypeForPath(toParent);
  //
  //     // 4. Add reference to element to new parent, while applying additional changes
  //     // if provided int he command
  //     _addElementIdToParentContext(
  //       this,
  //       targetParentType,
  //       targetParentId,
  //       toPosition,
  //       changes ? {...elementToMove, ...changes} : elementToMove
  //     );
  //     this.changes.push(
  //       isElementId(moveCommand.element) && isElementId(moveCommand.toParent)
  //         ? moveCommand
  //         : {
  //             ...moveCommand,
  //             element: {
  //               __typename,
  //               _id
  //             },
  //             toParent: {
  //               __typename: targetParentType,
  //               _id: targetParentId
  //             }
  //           }
  //     );
  //   },
  //   deleteElement: function (deleteCommand): void {
  //     const {element} = deleteCommand;
  //     const {__typename, _id} = isElementId(element)
  //       ? element
  //       : this.idAndTypeForPath(element);
  //     const toDeleteElement = mappedElement(
  //       this.maps,
  //       __typename,
  //       _id
  //     ) as IParentedId;
  //     if (toDeleteElement.parentId) {
  //       _removeElementFromParentContext(this, __typename, _id);
  //     }
  //     const elementsToDelete: ElementId<UOfNormDoc<NorDoc>>[] = [];
  //     visitDocument(
  //       this,
  //       (_, nodeType, nodeId) => {
  //         elementsToDelete.push({__typename: nodeType, _id: nodeId});
  //       },
  //       {
  //         traversal: DocumentVisitTraversal.DEPTH_FIRST,
  //         startElement: {
  //           type: __typename,
  //           _id
  //         }
  //       }
  //     );
  //     for (const elementToDeleteId of elementsToDelete) {
  //       this.maps[elementToDeleteId.__typename].delete(elementToDeleteId._id);
  //     }
  //     this.changes.push(
  //       isElementId(deleteCommand.element)
  //         ? deleteCommand
  //         : {
  //             ...deleteCommand,
  //             element: {
  //               __typename,
  //               _id
  //             }
  //           }
  //     );
  //   },
  //   idAndTypeForPath: function (path) {
  //     const {schema} = doc;
  //     if (!(path && Array.isArray(path) && path.length > 0)) {
  //       return {
  //         __typename: doc.rootId.__typename,
  //         _id: doc.rootId._id
  //       };
  //     }
  //     for (
  //       let i = 0,
  //         node = doc.getNode(
  //           doc.rootId
  //         ) as NodesDefOfDoc<NorDoc>[keyof NodesDefOfDoc<NorDoc>];
  //       i < path.length;
  //       i++
  //     ) {
  //       const pathEl = path[i];
  //       const childFieldName = isArrayPathElement(pathEl)
  //         ? (pathEl as ArrayPathElement<NodesDefOfDoc<NorDoc>>).field
  //         : pathEl;
  //       const childIndex = isArrayPathElement(pathEl)
  //         ? (pathEl as ArrayPathElement<NodesDefOfDoc<NorDoc>>).index
  //         : -1;
  //       const childLink = node.children[childFieldName];
  //     }
  //     let trimmedPath = path.slice();
  //     let docContext: IParentedId = doc.maps[doc.rootType].get(
  //       doc.rootId
  //     )! as IParentedId;
  //     let schemaContext: EntityReferences<U> = schema.types[schema.rootType];
  //     for (let i = 0; trimmedPath.length > 0 && i < 10000; i++) {
  //       const {remainingPath, element} = nextElementTypeAndId(
  //         doc,
  //         docContext,
  //         schemaContext,
  //         trimmedPath
  //       ) as INextElementAndIdRetVal<MapsInterface, U>;
  //       const {_id, __typename} = element;
  //       trimmedPath = remainingPath;
  //       if (trimmedPath.length > 0) {
  //         docContext = mappedElement(doc.maps, __typename, _id) as IParentedId;
  //         if (!(__typename in schema.types)) {
  //           throw new Error(`TYpe not found in schema: ${String(__typename)}`);
  //         }
  //         schemaContext = schema.types[__typename as U];
  //       } else {
  //         return {
  //           __typename,
  //           _id
  //         };
  //       }
  //     }
  //     throw new Error('Entity not found for path');
  //   },
  //   pathForElementWithId: function (elementTypeMap, elementId) {
  //     if (
  //       !(
  //         elementTypeMap in this.maps &&
  //         typeof this.maps[elementTypeMap] === 'object'
  //       )
  //     ) {
  //       throw new Error(`Map for type ${elementTypeMap} not found`);
  //     }
  //     const map = this.maps[elementTypeMap]!;
  //     const element = map.get(elementId) as IParentedId;
  //     if (!element) {
  //       throw new Error(
  //         `Referential integrity error with type ${elementTypeMap} and id ${elementId}`
  //       );
  //     }
  //     const path: Path<MapsOfNormDoc<NorDoc>> = [];
  //     if (element.parentId) {
  //       const parentType = parentTypeOfElement(this, elementTypeMap, elementId);
  //       const parentToUsFieldLink = parentToChildTypeMappings(
  //         this,
  //         parentType,
  //         elementTypeMap
  //       );
  //       // We are not a root element, let's go up the hierarchy
  //       const parentElement = mappedElement(
  //         this.maps,
  //         parentType,
  //         element.parentId
  //       );
  //       if (!parentElement) {
  //         throw new Error(
  //           `Referential integrity error for parent of element ${elementTypeMap}.${elementId}`
  //         );
  //       }
  //       path.push(parentToUsFieldLink.field);
  //       if (parentToUsFieldLink.isArray) {
  //         const position = (
  //           (parentElement as any)[parentToUsFieldLink.field] as Array<Id>
  //         ).findIndex(parentedElementId => parentedElementId === elementId);
  //         if (position === -1) {
  //           throw new Error(
  //             `Element ${elementTypeMap}.${elementId} not found in parent`
  //           );
  //         }
  //         path.push(position);
  //       }
  //       const parentPath = this.pathForElementWithId(
  //         parentType,
  //         element.parentId
  //       );
  //       return parentPath.concat(path);
  //     } else {
  //       if (!(elementTypeMap === this.rootType && elementId === this.rootId)) {
  //         throw new Error(
  //           `Top level element of type ${elementTypeMap} is not the root element of the document`
  //         );
  //       }
  //     }
  //     return path;
  //   }
  // };
  // return mutableDoc;
}

export const docReducer = <
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef = keyof NodesDef
>(
  doc: NormalizedDocument<NodesDef, R>,
  cmd:
    | HDocOperation<NodesDef, keyof NodesDef, keyof NodesDef>
    | Array<HDocOperation<NodesDef, keyof NodesDef, keyof NodesDef>>
): NormalizedDocument<NodesDef, R> => {
  const cmds = Array.isArray(cmd) ? cmd : [cmd];
  if (cmds.length < 1) return doc;
  const mutableDoc = mutableDocument(doc);
  try {
    mutableDoc.applyChanges(cmds);
  } catch (err) {
    // silently eaten
  }
  return mutableDoc.updatedDocument;
};

export const removeElementFromArrayReducer = <
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef,
  TargetType extends keyof NodesDef,
  T
>(
  doc: NormalizedDocument<NodesDef, R>,
  elementType: TargetType,
  elementId: Id,
  arrayFieldName: keyof NodesDef[TargetType],
  arrayElement: T
): NormalizedDocument<NodesDef, R> => {
  if (!hasMappedElement(doc, elementType, elementId)) return doc;
  const element = mappedElement(doc, elementType, elementId);
  if (arrayFieldName in element) {
    const elementArray = (element as any)[arrayFieldName] as T[];
    const index = elementArray.indexOf(arrayElement);
    if (index !== -1) {
      const updatedArray = elementArray.slice();
      updatedArray.splice(index, 1);
      const updateChange: ChangeElement<NodesDef, TargetType> = {
        __typename: HDocCommandType.CHANGE_ELEMENT,
        element: {
          __typename: elementType,
          _id: elementId
        },
        // @ts-expect-error
        changes: {
          [arrayFieldName]: updatedArray
        }
      };
      // @ts-expect-error Cannot uplift TargetType to keyof NodesDef
      return docReducer(doc, updateChange);
    }
  }
  return doc;
};

/**
 * Creates a new document with an array field updated with the
 * additional element(s) passed as parameters, optionally from a specific
 * index.
 *
 * @param {NorDoc} doc
 * @param {UOfNormDoc<NorDoc>} elementType
 * @param {Id} elementId
 * @param {AllMappedTypesFields<MapsOfNormDoc<NorDoc>>} arrayFieldName
 * @param {T} arrayElement
 * @param {number} insertIntoIndex
 * @returns {NorDoc}
 */
export const addElementToArrayReducer = <
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef,
  TargetType extends keyof NodesDef,
  T
>(
  doc: NormalizedDocument<NodesDef, R>,
  elementType: TargetType,
  elementId: Id,
  arrayFieldName: keyof NodesDef[TargetType],
  arrayElement: T | T[],
  insertIntoIndex = -1
): NormalizedDocument<NodesDef, R> => {
  if (!hasMappedElement(doc, elementType, elementId)) return doc;
  const element = mappedElement(doc, elementType, elementId);
  if (arrayFieldName in element) {
    const elementArray = (element as any)[arrayFieldName] as T[];
    const elementsToAdd = (
      Array.isArray(arrayElement) ? arrayElement : [arrayElement]
    ).filter(el => elementArray.indexOf(el) === -1);
    if (elementsToAdd.length === 0) {
      return doc;
    }
    const insertIndex =
      insertIntoIndex < 0 || insertIntoIndex >= elementArray.length
        ? elementArray.length
        : insertIntoIndex;
    const updatedArray = elementArray.slice();
    updatedArray.splice(insertIndex, 0, ...elementsToAdd);
    const updateChange: ChangeElement<NodesDef, TargetType> = {
      __typename: HDocCommandType.CHANGE_ELEMENT,
      element: {
        __typename: elementType,
        _id: elementId
      },
      // @ts-expect-error
      changes: {
        [arrayFieldName]: updatedArray
      }
    };
    // @ts-expect-error Cannot uplift TargetType to keyof NodesDef
    return docReducer(doc, updateChange);
  }
  return doc;
};

export function idAndTypeOfChange<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef
>(
  change: HDocOperation<NodesDef, keyof NodesDef, keyof NodesDef>,
  doc?: NormalizedDocument<NodesDef, R>
): ElementId<keyof NodesDef> {
  if (change.__typename === HDocCommandType.INSERT_ELEMENT) {
    return (
      isElementId(change.element)
        ? change.element
        : {__typename: change.element.__typename, _id: 'NOTVALID'}
    ) as ElementId<keyof NodesDef>;
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
          __typename: 'Invalid' as keyof NodesDef,
          _id: 'Invalid'
        };
  } else {
    return {
      __typename: 'Invalid' as keyof NodesDef,
      _id: 'Invalid'
    };
  }
}
