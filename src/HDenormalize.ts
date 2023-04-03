import {
  DocumentVisitTraversal,
  Id,
  NormalizedDocument,
  IParentedNode,
  TreeNode,
  LinkType,
  NodeLink,
  CompactTreeNode,
  NodesDefOfDoc
} from './HTypes';
import {visitDocument} from './HVisit';
import {extractElementId, isElementId, mappedElement} from './HUtils';

const elementUid = <U>(elementType: U, elementId: Id) =>
  `${elementType}:${elementId}`;

export function denormalizeDocument<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef
>(doc: NormalizedDocument<NodesDef, R>): IParentedNode<keyof NodesDef> {
  const nodes: Map<string, IParentedNode> = new Map();
  // I will need two visits. One to create all the nodes while setting the parents, and
  // a second one where we change the children.
  visitDocument(doc, (normalizedDoc, nodeType, nodeId) => {
    const element = mappedElement(doc, nodeType, nodeId);
    const parentUid = element.parent
      ? elementUid(element.parent.__typename, element.parent._id)
      : null;
    const parent = parentUid ? nodes.get(parentUid) || null : null;
    const denormalizedNode: IParentedNode = {...element, parent};
    nodes.set(elementUid(nodeType, nodeId), denormalizedNode);
  });
  visitDocument(
    doc,
    (normDoc, nodeType, nodeId) => {
      const element = mappedElement(doc, nodeType, nodeId);
      const uid = elementUid(nodeType, nodeId);
      const denormalizedNode = nodes.get(uid)!;
      const nodeDef = doc.schema.nodeTypes[nodeType];
      for (const fieldName in nodeDef.children) {
        const linkProps = nodeDef.children[fieldName];
        const elementLink = element.children[fieldName] as NodeLink<
          keyof NodesDef
        >;
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
          denormalizedNode[fieldName as keyof typeof denormalizedNode] =
            nodesSet;
        } else {
          throw new TypeError('Unknown link type');
        }
      }
    },
    {
      context: {},
      traversal: DocumentVisitTraversal.DEPTH_FIRST
    }
  );
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
