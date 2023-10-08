import {
  AllChildrenFields,
  ArrayPathElement,
  DocumentSchema,
  ElementId,
  Id,
  LinksArray,
  LinkType,
  NewNodeInfo,
  NodeChildrenOfTreeNode,
  NodeDataOfTreeNode,
  NodeLink,
  NodeLinksOfTreeNode,
  NormalizedDocument,
  ParentToChildLinkField,
  Path,
  PathElement,
  RootTreeNode,
  SetPathElement,
  TreeNode
} from './HTypes';
import {
  elementIdsEquals,
  generateNewId,
  iidToStr,
  isArrayPathElement,
  isDocumentSchema,
  isElementId,
  isSetPathElement,
  mappedElement
} from './HUtils';
import {breadthFirstNodes, depthFirstNodes} from './HVisit';
import {isEqual} from 'lodash';

/**
 * Creates an empty copy version of the normalized document
 * passed as parameter.
 *
 * @returns {NormalizedDocument<MapsInterface, U>}
 */

export function clearedNormalizedDocument<
  NorDoc extends NormalizedDocument<any, any>
>(doc: NorDoc): NorDoc {
  return createNormalizedDocument(doc.schema) as NorDoc;
}

export function idAndTypeForPath<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef = keyof NodesDef
>(
  doc: NormalizedDocument<NodesDef, R>,
  path: Path<NodesDef>
): ElementId<keyof NodesDef> {
  if (!(path && Array.isArray(path) && path.length > 0)) {
    return {__typename: doc.rootId.__typename, _id: doc.rootId._id};
  }
  let node = doc.getNode(doc.rootId) as NodesDef[keyof NodesDef];
  for (const _pathEl of path) {
    if (isArrayPathElement(_pathEl)) {
      const pathEl = _pathEl as ArrayPathElement<NodesDef>;
      const link = node.children[pathEl.field] as NodeLink<keyof NodesDef>;
      if (!Array.isArray(link)) {
        throw new TypeError('Array link expected');
      }
      node = doc.getNode(link[pathEl.index])!;
      if (!node) {
        throw new ReferenceError('Reference child node not fund');
      }
    } else if (isSetPathElement(_pathEl)) {
      const pathEl = _pathEl as SetPathElement<NodesDef>;
      const link = node.children[pathEl.field] as NodeLink<keyof NodesDef>;
      if (!(link instanceof Map)) {
        throw new TypeError('LinksSet expected');
      }
      if (
        !link.has(iidToStr({__typename: pathEl.nodeType, _id: pathEl.nodeId}))
      ) {
        throw new ReferenceError(
          'The element id in the path is not in the links set'
        );
      }
      node = doc.getNode({__typename: pathEl.nodeType, _id: pathEl.nodeId})!;
      if (!node) {
        throw new ReferenceError('Referenced child node not fund');
      }
    } else if (typeof _pathEl === 'string') {
      const pathEl = _pathEl as keyof AllChildrenFields<
        NodesDef[keyof NodesDef]
      >;
      const link = node.children[pathEl] as NodeLink<keyof NodesDef>;
      if (link === null) {
        throw new ReferenceError('Child node not found');
      }
      if (!isElementId(link)) {
        throw new TypeError('Expected an ElementId');
      }
      node = doc.getNode(link)!;
      if (!node) {
        throw new ReferenceError('Referenced child node not fund');
      }
    } else {
      throw new TypeError('Unknown path element');
    }
  }
  return {__typename: node.__typename, _id: node._id};
}

export function fieldAndIndexOfPosition<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  ParentType extends keyof NodesDef = keyof NodesDef
>(
  doc: NormalizedDocument<NodesDef>,
  parentPath: Path<NodesDef> | ElementId<ParentType>,
  positionInParent: PathElement<NodesDef, ParentType>
): {
  parentNode: NodesDef[ParentType];
  field: keyof NodeChildrenOfTreeNode<NodesDef, ParentType>;
  index: number;
} {
  const parentElId = isElementId<ParentType>(parentPath)
    ? parentPath
    : (doc.idAndTypeForPath(parentPath) as ElementId<ParentType>);
  const parentNode = doc.getNode(parentElId);
  if (!parentNode) {
    throw new ReferenceError('Parent node not found');
  }
  let parentFieldName: AllChildrenFields<NodesDef[ParentType]> | '__orphans';
  let indexInParent = -1;
  if (isSetPathElement(positionInParent)) {
    parentFieldName = (positionInParent as SetPathElement<NodesDef, ParentType>)
      .field;
  } else if (isArrayPathElement(positionInParent)) {
    parentFieldName = positionInParent.field;
    indexInParent = positionInParent.index;
  } else {
    parentFieldName = positionInParent as AllChildrenFields<
      NodesDef[ParentType]
    >;
  }
  return {
    parentNode,
    field: parentFieldName,
    index: indexInParent
  };
}

export function nodeInfo<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef,
  NodeType extends keyof NodesDef
>(
  doc: NormalizedDocument<NodesDef, R>,
  nodeOrNodeId: ElementId<NodeType> | NodesDef[NodeType]
): NodeDataOfTreeNode<NodesDef, NodeType> {
  const node = doc.getNode(nodeOrNodeId);
  if (!node) {
    throw new ReferenceError('Node not found');
  }
  return node.data;
}

export class NormalizedDocumentImpl<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef = keyof NodesDef
> implements NormalizedDocument<NodesDef, R>
{
  public readonly schema: DocumentSchema<NodesDef, R>;
  protected nodes: Map<
    string,
    NodesDef[keyof NodesDef] | RootTreeNode<NodesDef, R, any, any, any>
  >;

  public rootId: ElementId<R>;

  constructor(
    schema: DocumentSchema<NodesDef, R>,
    rootData?: Omit<NewNodeInfo<NodesDef, R>, '__typename'>
  );
  constructor(existingDoc: NormalizedDocument<NodesDef, R>);
  constructor(
    schemaOrTree: DocumentSchema<NodesDef, R> | NormalizedDocument<NodesDef, R>,
    rootData = {} as Omit<NewNodeInfo<NodesDef, R>, '__typename'>
  ) {
    if (isDocumentSchema<NodesDef, R>(schemaOrTree)) {
      this.schema = schemaOrTree;
      this.nodes = new Map();
      const root = this.emptyNode(schemaOrTree.rootType);
      const {_id, ...otherRootData} = rootData;
      Object.assign(root.data, otherRootData);
      if (_id) {
        root._id = _id;
      }
      this.rootId = root as unknown as ElementId<R>;
      this.nodes.set(
        iidToStr(this.rootId),
        Object.assign(root, {__orphans: []})
      );
    } else {
      const treeNodes = Array.from(schemaOrTree[Symbol.iterator]());
      this.nodes = new Map(
        treeNodes.map(treeNode =>
          treeNode.__typename === schemaOrTree.rootId.__typename &&
          treeNode._id === schemaOrTree.rootId._id
            ? [iidToStr(treeNode), Object.assign({}, treeNode, {__orphans: []})]
            : [iidToStr(treeNode), treeNode]
        )
      );
      this.schema = schemaOrTree.schema;
      this.rootId = Object.assign({}, schemaOrTree.rootId);
    }
  }

  public [Symbol.iterator](): IterableIterator<NodesDef[keyof NodesDef]> {
    return this.nodes.values() as IterableIterator<NodesDef[keyof NodesDef]>;
  }

  public emptyNode<NodeType extends keyof NodesDef>(nodeType: NodeType) {
    const schema = this.schema;
    const nodeTypeDef = schema.nodeTypes[nodeType];
    const emptyChildren: Partial<NodeChildrenOfTreeNode<NodesDef, NodeType>> =
      {};
    for (const linkName in nodeTypeDef.children) {
      const lType = nodeTypeDef.children[linkName];
      const emptyLink: NodeLink<keyof NodesDef> | null =
        lType === LinkType.single
          ? null
          : lType === LinkType.array
          ? []
          : lType === LinkType.set
          ? new Map()
          : null;
      if (!emptyLink && lType !== LinkType.single) {
        throw new TypeError('Invalid link value for link type');
      }
      // @ts-expect-error too many generics
      emptyChildren[linkName] = emptyLink;
    }
    if (nodeType === (this.schema.rootType as keyof NodesDef)) {
      emptyChildren.__orphans = [];
    }
    const emptyLinks: Partial<NodeLinksOfTreeNode<NodesDef, NodeType>> = {};
    if (nodeTypeDef.links) {
      for (const linkName in nodeTypeDef.links) {
        const lType = nodeTypeDef.links[linkName];
        const emptyLink: NodeLink<keyof NodesDef> | null =
          lType === LinkType.single
            ? null
            : lType === LinkType.array
            ? []
            : lType === LinkType.set
            ? new Map()
            : null;
        if (!emptyLink) {
          throw new TypeError('Invalid link type');
        }
        // @ts-expect-error too many generics
        emptyLinks[linkName] = emptyLink;
      }
    }
    const newNode = {
      _id: generateNewId(),
      __typename: nodeType,
      children: emptyChildren as NodeChildrenOfTreeNode<NodesDef, NodeType>,
      data: nodeTypeDef.data() as NodeDataOfTreeNode<NodesDef, NodeType>,
      parent: null
    } as unknown as NodesDef[NodeType];
    if (nodeTypeDef.links && Object.keys(emptyLinks).length > 0) {
      newNode.links = emptyLinks;
    }
    return newNode;
  }

  public getNode<Type extends keyof NodesDef>(
    nodeIId: ElementId<Type>
  ): NodesDef[Type] | null {
    return (
      (this.nodes.get(iidToStr(nodeIId)) as NodesDef[Type] | undefined) || null
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

  public idAndTypeForPath(path: Path<NodesDef>): ElementId<keyof NodesDef> {
    return idAndTypeForPath(this, path);
  }

  public reIdSubtree(
    subtreeRootId: ElementId<keyof NodesDef>
  ): NormalizedDocument<NodesDef, R> {
    function substituteChildId<C extends keyof NodesDef>(
      parentNode: NodesDef[keyof NodesDef],
      parentField: ParentToChildLinkField<
        keyof NodesDef,
        keyof NodeChildrenOfTreeNode<NodesDef, keyof NodesDef>
      >,
      oldElement: NodesDef[C],
      newElement: NodesDef[C]
    ): NodesDef[keyof NodesDef] {
      const parentToChildField = parentNode.children[
        oldElement.parent!.parentField
      ] as NodeLink<C>;
      const newElId: ElementId<C> = {
        // @ts-expect-error unable to cast to C
        __typename: newElement.__typename,
        _id: newElement._id
      };
      let updatedParentToChildField: NodeLink<C>;
      if (Array.isArray(parentToChildField)) {
        updatedParentToChildField = parentToChildField.slice();
        const index = updatedParentToChildField.findIndex(
          childElId =>
            childElId.__typename === oldElement.__typename &&
            childElId._id === oldElement._id
        );
        if (index === -1) {
          throw new TypeError(
            'Integrity constraing error, child not found in parent'
          );
        }
        updatedParentToChildField[index] = newElId;
      } else if (parentToChildField instanceof Map) {
        updatedParentToChildField = new Map(parentToChildField);
        updatedParentToChildField.delete(iidToStr(oldElement));
        // @ts-expect-error Unable to cast to ElementId<C>
        updatedParentToChildField.set(iidToStr(newElement), newElement);
      } else if (
        parentToChildField === null ||
        isElementId(parentToChildField)
      ) {
        updatedParentToChildField = newElId;
      } else {
        throw new TypeError('Incorrect link field');
      }
      return Object.assign({}, parentNode, {
        children: Object.assign({}, parentNode.children, {
          [parentField.parentField]: updatedParentToChildField
        })
      });
    }

    const newTree = new NormalizedDocumentImpl(this);
    const nodesToReid = depthFirstNodes(
      newTree,
      subtreeRootId.__typename,
      subtreeRootId._id
    );
    for (const nodeToReidId of nodesToReid.map(nodeId => ({
      __typename: nodeId[0],
      _id: nodeId[1]
    }))) {
      const nodeToReid = newTree.getNode(nodeToReidId);
      if (!nodeToReid) {
        throw new TypeError('Element with requested elementId not found');
      }
      newTree.nodes.delete(iidToStr(nodeToReidId));
      const reidedNode = Object.assign({}, nodeToReid, {_id: generateNewId()});
      newTree.nodes.set(iidToStr(reidedNode), reidedNode);
      if (reidedNode.parent) {
        const parentNode = newTree.getNode(reidedNode.parent);
        if (!parentNode) {
          throw new TypeError('Reference to parent node is incorrect');
        }
        const updatedParent = substituteChildId(
          parentNode,
          reidedNode.parent,
          nodeToReid,
          reidedNode
        );
        newTree.nodes.set(iidToStr(updatedParent), updatedParent);
      } else {
        if (!elementIdsEquals(newTree.rootId, nodeToReidId)) {
          throw new TypeError(
            'Node with null parent is not the root of the tree'
          );
        }
        newTree.rootId = {
          __typename: reidedNode.__typename as R,
          _id: reidedNode._id
        };
      }
    }
    return newTree;
  }
}

export function createNormalizedDocument<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef = keyof NodesDef
>(
  schema: DocumentSchema<NodesDef, R>,
  rootData?: NewNodeInfo<NodesDef, R>
): NormalizedDocument<NodesDef, R>;
export function createNormalizedDocument<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef = keyof NodesDef
>(
  existingDoc: NormalizedDocument<NodesDef, R>
): NormalizedDocument<NodesDef, R>;
export function createNormalizedDocument<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef = keyof NodesDef
>(
  schemaOrDoc: DocumentSchema<NodesDef, R> | NormalizedDocument<NodesDef, R>,
  rootData: Partial<NodeDataOfTreeNode<NodesDef, R>> = {}
): NormalizedDocument<NodesDef, R> {
  // @ts-expect-error not working well with overload
  return new NormalizedDocumentImpl(schemaOrDoc, rootData);
}

/**
 * Creates a shallow clone of the document. The maps are new objects,
 * but the entities mapped are the same as the original.
 *
 * The rationale for the shallow version of the elements is that
 * changes will be performed as setting new versions in the dictionary, rather
 * than direct manipulation of the objects.
 *
 * @param {NormalizedDocument<MapsInterface, U>} doc The document to be cloned
 * @returns {NormalizedDocument<MapsInterface, U>} shallow clone of the document
 */
export function cloneNormalizedDocument<
  NorDoc extends NormalizedDocument<any, any>
>(doc: NorDoc): NorDoc {
  return new NormalizedDocumentImpl(doc) as unknown as NorDoc;
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
 * @param {U} elementType
 * @param {Id} elementId
 * @returns {Path}
 */

export function pathForElementWithId<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef,
  K extends keyof NodesDef
>(
  doc: NormalizedDocument<NodesDef, R>,
  elementType: K,
  elementId: Id
): Path<NodesDef> {
  const element = doc.getNode({
    __typename: elementType,
    _id: elementId
  }) as TreeNode<NodesDef, K, any, any, any> | null;
  if (!element) {
    throw new Error(
      `Referential integrity error with type ${String(
        elementType
      )} and id ${elementId}`
    );
  }
  const path: Path<NodesDef> = [];
  if (element.parent) {
    let pathElement: PathElement<NodesDef> | null = null;
    const parentEl = mappedElement(
      doc,
      element.parent.__typename,
      element.parent._id
    );
    const parentLinkField = parentEl.children[element.parent.parentField];
    if (parentLinkField) {
      if (Array.isArray(parentLinkField)) {
        const index = (parentLinkField as LinksArray<keyof NodesDef>).findIndex(
          arrayElId => elementIdsEquals(arrayElId, element)
        );
        if (index === -1) {
          throw new RangeError(
            'The child element cannot find itself in the parent array'
          );
        }
        pathElement = {
          field: element.parent.parentField as AllChildrenFields<NodesDef>,
          index
        };
      } else if (parentLinkField instanceof Map) {
        pathElement = {
          field: element.parent.parentField as AllChildrenFields<NodesDef>,
          nodeType: element.parent.__typename,
          nodeId: element.parent._id
        };
      } else {
        pathElement = element.parent.parentField as AllChildrenFields<NodesDef>;
      }
      path.push(pathElement!);
    } else {
      throw new TypeError(
        'Cannot find the field that should connect the parent to the node'
      );
    }

    const parentPath = pathForElementWithId(
      doc,
      element.parent.__typename,
      element.parent._id
    );
    path.unshift(...parentPath);
    return path;
  } else {
    if (
      //@ts-expect-error K and R are the same keyof
      !(elementType === doc.rootId.__typename && elementId === doc.rootId._id)
    ) {
      throw new Error(
        `Top level element of type ${String(
          elementType
        )} is not the root element of the document`
      );
    }
  }
  return path;
}
