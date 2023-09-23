import {
  Id,
  NormalizedDocument,
  IParentedNode,
  TreeNode,
  LinkType,
  NodeLink,
  CompactTreeNode, ElementId
} from './HTypes'
import {breadthFirstNodes, depthFirstNodes} from './HVisit';
import {extractElementId, isElementId, mappedElement} from './HUtils';
import {omit} from 'lodash';

const elementUid = <U>(elementType: U, elementId: Id) =>
  `${elementType}:${elementId}`;

export function denormalizeDocument<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef
>(
  doc: NormalizedDocument<NodesDef, R>,
  compactNodes = true,
  removeParentField = true
): ElementId<keyof NodesDef> | IParentedNode<keyof NodesDef> {
  const nodes: Map<string, IParentedNode> = new Map();
  // I will need two visits. One to create all the nodes while setting the parents, and
  // a second one where we change the children.
  const breadFirstElIds = breadthFirstNodes(
    doc,
    doc.rootId.__typename,
    doc.rootId._id
  );
  const depthFirstElIds = depthFirstNodes(
    doc,
    doc.rootId.__typename,
    doc.rootId._id
  );
  for (const [nodeType, nodeId] of breadFirstElIds) {
    const element = mappedElement(doc, nodeType, nodeId);
    const {_id, __typename, children, parent: parentElId, links, data} = element;
    const parentUid = parentElId
      ? elementUid(parentElId.__typename, parentElId._id)
      : null;
    const parent = parentUid ? nodes.get(parentUid) || null : null;

    const denormalizedNode: IParentedNode | ElementId<NodesDef> = compactNodes
      ? removeParentField ? {
        __typename,
        _id,
        ...data,
        ...links,
        children
      } : {
          __typename,
          _id,
          parent,
          ...data,
          ...links,
          children
        }
      : removeParentField ? omit(element, 'parent') : {...omit(element, 'parent'), parent};
    // @ts-expect-error odd typing
    nodes.set(elementUid(nodeType, nodeId), denormalizedNode);
  }
  for (const [nodeType, nodeId] of depthFirstElIds) {
    const uid = elementUid(nodeType, nodeId);
    const denormalizedNode = nodes.get(uid)!;
    const nodeDef = doc.schema.nodeTypes[nodeType];
    // @ts-expect-error children not expected in node
    const nodeChildren = denormalizedNode.children;
    // @ts-expect-error children not expected in node
    delete denormalizedNode.children;
    for (const fieldName in nodeDef.children) {
      const linkProps = nodeDef.children[fieldName];
      const elementLink = nodeChildren[fieldName] as NodeLink<keyof NodesDef>;
      if (linkProps === LinkType.single) {
        if (elementLink === null) {
          denormalizedNode[fieldName as keyof typeof denormalizedNode] = null;
          continue;
        }
        if (!isElementId(elementLink)) {
          throw new TypeError('Expected ElementId');
        }
        denormalizedNode[fieldName as keyof typeof denormalizedNode] =
          nodes.get(elementUid(elementLink.__typename, elementLink._id)) ||
          null;
      } else if (linkProps === LinkType.array) {
        if (!Array.isArray(elementLink)) {
          throw new TypeError('Expected array of ids');
        }
        denormalizedNode[fieldName as keyof typeof denormalizedNode] =
          elementLink
            .map(childId =>
              nodes.get(elementUid(childId.__typename, childId._id))
            )
            .filter(childNode => childNode !== undefined);
      } else if (linkProps === LinkType.set) {
        if (!(elementLink && elementLink instanceof Map)) {
          throw new TypeError('Expected a links set');
        }
        const nodesSet = new Map<string, IParentedNode<keyof NodesDef>>();
        for (const [idStr, elId] of elementLink.entries()) {
          nodesSet.set(
            idStr,
            nodes.get(elementUid(elId.__typename, elId._id))!
          );
        }
        denormalizedNode[fieldName as keyof typeof denormalizedNode] = nodesSet;
      } else {
        throw new TypeError('Unknown link type');
      }
    }
  }
  return nodes.get(elementUid(doc.rootId.__typename, doc.rootId._id))!;
}

export function compactTreeNode<
  NodesDef extends Record<keyof NodesDef, TreeNode<any, any, any, any, any>>,
  NodeType extends keyof NodesDef,
  NodeData,
  ChildrenFields extends Record<any, NodeLink<keyof NodesDef>>,
  LinksFields extends Record<any, NodeLink<keyof NodesDef>>
>(
  node: TreeNode<NodesDef, NodeType, NodeData, ChildrenFields, LinksFields>
): CompactTreeNode<NodesDef, NodeType, NodeData, ChildrenFields, LinksFields> {
  return Object.assign(
    {},
    extractElementId(node),
    node.data,
    node.children,
    node.links,
    {parent: node.parent}
  );
}

