import {
  ChangeElement,
  DeleteElement,
  DocumentVisitTraversal,
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
import {visitDocument} from './HVisit';

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
  private readonly _changes: HDocOperation<NodesDef, any, any>[];

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

  public updatedDocument() {
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
    this.changes.push(insertChange);
    return newElement;
  }

  public deleteElement<TargetType extends keyof NodesDef>(
    deleteCommand: Omit<DeleteElement<NodesDef, TargetType>, '__typename'>
  ) {
    const {element} = deleteCommand;
    const elementId = isElementId(element)
      ? element
      : this.idAndTypeForPath(element);
    const toDeleteElement = this.getNode(elementId);
    if (!toDeleteElement) {
      return;
    }
    if (toDeleteElement.parent) {
      const parentNode = this.getNode(toDeleteElement.parent);
      if (!parentNode) {
        throw new ReferenceError('Parent of node to delete not found');
      }
      const updatedParent = treeNodeReducer(parentNode, {
        __typename: 'RemoveNodeFromLinkField',
        childNodeId: elementId,
        parentField: toDeleteElement.parent.parentField
      });
      this._currentNodes.set(iidToStr(updatedParent), updatedParent);
    }
    const elementsToDelete: ElementId<keyof NodesDef>[] = [];
    visitDocument(
      this,
      (_, nodeType, nodeId) => {
        elementsToDelete.push({__typename: nodeType, _id: nodeId});
      },
      {
        traversal: DocumentVisitTraversal.DEPTH_FIRST,
        startElement: toDeleteElement
      }
    );
    for (const elementToDeleteId of elementsToDelete) {
      const strId = iidToStr(elementToDeleteId);
      if (this._currentNodes.has(strId)) {
        this._currentNodes.delete(strId);
      }
    }
    this.changes.push({
      ...(isElementId(deleteCommand.element)
        ? deleteCommand
        : {
            ...deleteCommand,
            element: extractElementId(elementId)
          }),
      __typename: HDocCommandType.DELETE_ELEMENT
    });
  }

  public changeElement<TargetType extends keyof NodesDef>(
    inpChangeCommand: Omit<ChangeElement<NodesDef, TargetType>, '__typename'>
  ) {
    const {element} = inpChangeCommand;
    const elementId = (
      isElementId(element) ? element : this.idAndTypeForPath(element)
    ) as ElementId<TargetType>;
    const existingElement = this.getNode(elementId);
    if (!existingElement) {
      throw new ReferenceError('Node to change not found');
    }
    const updateCmd: ChangeElement<NodesDef, TargetType> = {
      __typename: HDocCommandType.CHANGE_ELEMENT,
      ...(isElementId(element)
        ? inpChangeCommand
        : {
            ...inpChangeCommand,
            element: extractElementId(elementId)
          })
    };
    const updatedNode = treeNodeReducer(existingElement, updateCmd);
    if (updatedNode === existingElement) return;
    this._currentNodes.set(iidToStr(updatedNode), updatedNode);
    this.changes.push(updateCmd);
  }

  public moveElement<
    TargetTypename extends keyof NodesDef,
    ParentTypename extends keyof NodesDef
  >(
    moveCommand: Omit<
      MoveElement<NodesDef, TargetTypename, ParentTypename>,
      '__typename'
    >
  ) {
    const {changes, element, toParent, toPosition} = moveCommand;
    // 1. Find the element
    const elementId = isElementId(element)
      ? element
      : this.idAndTypeForPath(element);
    const elementToMove = mappedElement(
      this,
      elementId
    ) as NodesDef[TargetTypename];

    // 2. Find the original and target parents, raising ref error before changin anything if needed
    const originalParent = elementToMove.parent
      ? this.getNode(elementToMove.parent)
      : null;
    const targetParentElId = isElementId(toParent)
      ? toParent
      : this.idAndTypeForPath(toParent);

    // 3. If there is an original parent, remove the reference to the element being moved
    if (elementToMove.parent && originalParent) {
      const updatedOriginalParent = treeNodeReducer(originalParent, {
        __typename: 'RemoveNodeFromLinkField',
        parentField: elementToMove.parent.parentField,
        childNodeId: elementToMove
      });
      if (updatedOriginalParent !== originalParent) {
        this._currentNodes.set(
          iidToStr(updatedOriginalParent),
          updatedOriginalParent
        );
      }
    }
    // Important to get the target parent here, because it may also be the original parent, if it's the same
    // field or a different field we are moving to
    const targetParent = this.getNode(targetParentElId);
    if (!targetParent) {
      throw new ReferenceError('New target parent not found');
    }

    const targetPlace = fieldAndIndexOfPosition(
      this,
      targetParentElId,
      toPosition
    );

    // 4. Add reference to element to new parent
    const updatedTargetParent = treeNodeReducer(targetParent, {
      __typename: 'AddNodeToLinkField',
      childNodeId: elementId,
      parentField: targetPlace.field,
      atIndex: targetPlace.index === -1 ? undefined : targetPlace.index
    });
    if (updatedTargetParent !== targetParent) {
      this._currentNodes.set(
        iidToStr(updatedTargetParent),
        updatedTargetParent
      );
    }
    let updatedMovedNode = treeNodeReducer(elementToMove, {
      __typename: 'UpdateParentField',
      parentLink: {
        __typename: updatedTargetParent.__typename,
        _id: updatedTargetParent._id,
        parentField: targetPlace.field
      }
    });

    // 5. If there are changes to the node being moved, apply them
    if (changes) {
      updatedMovedNode = treeNodeReducer(updatedMovedNode, {
        __typename: HDocCommandType.CHANGE_ELEMENT,
        changes: changes
      });
    }
    if (updatedMovedNode !== elementToMove) {
      this._currentNodes.set(iidToStr(updatedMovedNode), updatedMovedNode);
    }

    this.changes.push({
      __typename: HDocCommandType.MOVE_ELEMENT,
      ...(isElementId(moveCommand.element) && isElementId(moveCommand.toParent)
        ? moveCommand
        : {
            ...moveCommand,
            element: extractElementId(elementId),
            toParent: extractElementId(targetParent)
          })
    });
  }

  applyChanges<
    TargetType extends keyof NodesDef,
    ParentType extends keyof NodesDef
  >(
    changes:
      | HDocOperation<NodesDef, TargetType, ParentType>
      | Array<HDocOperation<NodesDef, TargetType, ParentType>>
  ) {
    const arrChanges = Array.isArray(changes) ? changes : [changes];
    for (const change of arrChanges) {
      if (change.__typename === HDocCommandType.INSERT_ELEMENT) {
        this.insertElement(change);
      } else if (change.__typename === HDocCommandType.CHANGE_ELEMENT) {
        this.changeElement(change);
      } else if (change.__typename === HDocCommandType.DELETE_ELEMENT) {
        this.deleteElement(change);
      } else if (change.__typename === HDocCommandType.MOVE_ELEMENT) {
        this.moveElement(change);
      } else {
        throw new TypeError('Unknown change type');
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
}

export const docReducer = <
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef,
  TargetType extends keyof NodesDef,
  ParentType extends keyof NodesDef
>(
  doc: NormalizedDocument<NodesDef, R>,
  cmd:
    | HDocOperation<NodesDef, TargetType, ParentType>
    | Array<HDocOperation<NodesDef, TargetType, ParentType>>
): NormalizedDocument<NodesDef, R> => {
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
