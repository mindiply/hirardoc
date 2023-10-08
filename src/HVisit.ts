import {
  DocumentVisitTraversal,
  Id,
  NormalizedDocument,
  NodeVisitor,
  VisitDocumentOptions,
  TreeNode,
  LinkType,
  NodeLink,
  ElementId,
  NodesDefOfDoc,
  RootTypeOfDoc
} from './HTypes';
import {isElementId, mappedElement} from './HUtils';

/**
 * Traversal of a normalized document, calling
 * for each node the visitor function passed as parameter.
 *
 * The traversal is breadth first by default, unless the
 * goBreadthFirst parameter is false in which case its depthFirst
 *
 * @param {IDocumentSchema<MapsInterface, V>} docSchema
 * @param {NormalizedDocument<MapsInterface, U, V>} doc
 * @param {NodeVisitor<MapsInterface, U, V>} onNodeVisit
 * @param {Context} context
 */
export function visitDocument<
  NorDoc extends NormalizedDocument<any, any>,
  Context = any
>(
  doc: NormalizedDocument<NodesDefOfDoc<NorDoc>, RootTypeOfDoc<NorDoc>>,
  onNodeVisit: NodeVisitor<NodesDefOfDoc<NorDoc>, RootTypeOfDoc<NorDoc>>,
  {
    context,
    traversal = DocumentVisitTraversal.BREADTH_FIRST,
    startElement,
    typesToTraverse,
    typesToVisit
  }: VisitDocumentOptions<
    NodesDefOfDoc<NorDoc>,
    keyof NodesDefOfDoc<NorDoc>,
    Context
  > = {}
) {
  const elementType = startElement
    ? startElement.__typename
    : doc.rootId.__typename;
  const elementId = startElement ? startElement._id : doc.rootId._id;
  const traversableMap = typesToTraverse ? new Set(typesToTraverse) : undefined;
  const visitableMap = typesToVisit ? new Set(typesToVisit) : undefined;
  for (
    const nodesToVisit: Array<[keyof NodesDefOfDoc<NorDoc>, Id]> =
      traversal === DocumentVisitTraversal.BREADTH_FIRST
        ? breadthFirstNodes(
            doc,
            elementType,
            elementId,
            traversableMap,
            visitableMap
          )
        : depthFirstNodes(
            doc,
            elementType,
            elementId,
            traversableMap,
            visitableMap
          );
    nodesToVisit.length > 0;

  ) {
    const [nextType, nextId] = nodesToVisit.shift()!;
    onNodeVisit(doc, nextType, nextId, context || {});
  }
}

export function breadthFirstNodes<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  U extends keyof NodesDef
>(
  doc: NormalizedDocument<NodesDef, U>,
  nodeType: U,
  nodeId: Id,
  typesToTraverse: Set<U> = new Set(),
  typesToVisit: Set<U> = new Set()
): Array<[U, Id]> {
  const nodesVisited = new Set<string>();
  const bfNodes: Array<[U, Id]> =
    typesToVisit.size > 0 && !typesToVisit.has(nodeType)
      ? []
      : [[nodeType, nodeId]];
  if (typesToTraverse.size > 0 && !typesToTraverse.has(nodeType)) {
    return bfNodes;
  }
  populateBreadthFirstDescendants(
    doc,
    nodeType,
    nodeId,
    bfNodes,
    typesToTraverse,
    typesToVisit,
    nodesVisited
  );
  return bfNodes;
}

function populateBreadthFirstDescendants<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  U extends keyof NodesDef
>(
  doc: NormalizedDocument<NodesDef, U>,
  nodeType: U,
  nodeId: Id,
  bfElements: Array<[U, Id]>,
  typesToTraverse: Set<U> = new Set(),
  typesToVisit: Set<U> = new Set(),
  nodesVisited: Set<string> = new Set()
) {
  const nodeUid = `${String(nodeType)}:${nodeId}`;
  if (nodesVisited.has(nodeUid)) {
    return;
  }
  nodesVisited.add(nodeUid);
  const bfDescendats: Array<[U, Id]> = [];
  const allChildren: Array<[U, Id]> = [];
  const element = mappedElement(doc, nodeType, nodeId);
  const nodeSchema = doc.schema.nodeTypes[nodeType];
  for (const linkField in nodeSchema.children) {
    const linkFieldProps = nodeSchema.children[linkField];
    const nodeLink =
      element.children[linkField as keyof typeof element.children];
    if (linkFieldProps === LinkType.set) {
      if (!(nodeLink && nodeLink instanceof Map)) {
        throw new TypeError('Expected a link set');
      }
      allChildren.push(
        ...(Array.from(nodeLink.values()).map(elId => [
          elId.__typename,
          elId._id
        ]) as Array<[U, Id]>)
      );
    } else if (linkFieldProps === LinkType.array) {
      if (!Array.isArray(nodeLink)) {
        throw new TypeError('Expected a links array');
      }
      allChildren.push(
        ...(nodeLink.map(elId => [elId.__typename, elId._id]) as Array<[U, Id]>)
      );
    } else if (linkFieldProps === LinkType.single) {
      if (nodeLink) {
        if (!isElementId(nodeLink)) {
          throw new TypeError('Expected null or ElementId');
        }
        allChildren.push([nodeLink.__typename, nodeLink._id] as [U, Id]);
      }
    }
  }
  for (const [childType, childId] of allChildren) {
    if (typesToVisit.size > 0 && !typesToVisit.has(childType)) {
      continue;
    }
    bfElements.push([childType, childId]);
  }
  for (const [childType, childId] of allChildren) {
    if (typesToTraverse.size > 0 && !typesToTraverse.has(childType)) {
      continue;
    }
    populateBreadthFirstDescendants(
      doc,
      childType,
      childId,
      bfElements,
      typesToTraverse,
      typesToVisit,
      nodesVisited
    );
  }
}

export function depthFirstNodes<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef
>(
  doc: NormalizedDocument<NodesDef, R>,
  nodeType: keyof NodesDef,
  nodeId: Id,
  typesToTraverse: Set<keyof NodesDef> = new Set(),
  typesToVisit: Set<keyof NodesDef> = new Set()
): Array<[keyof NodesDef, Id]> {
  const nodesVisited = new Set<string>();
  const dfNodes: Array<[keyof NodesDef, Id]> = [];

  if (!(typesToTraverse.size > 0 && !typesToTraverse.has(nodeType))) {
    populateDepthFirstDescendants(
      doc,
      nodeType,
      nodeId,
      dfNodes,
      typesToTraverse,
      typesToVisit,
      nodesVisited
    );
  }
  if (!(typesToVisit.size > 0 && !typesToVisit.has(nodeType))) {
    dfNodes.push([nodeType, nodeId]);
  }
  return dfNodes;
}

function populateDepthFirstDescendants<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  U extends keyof NodesDef
>(
  doc: NormalizedDocument<NodesDef, U>,
  nodeType: U,
  nodeId: Id,
  bfElements: Array<[U, Id]>,
  typesToTraverse: Set<U> = new Set(),
  typesToVisit: Set<U> = new Set(),
  nodesVisited: Set<string> = new Set()
) {
  const nodeUid = `${String(nodeType)}:${nodeId}`;
  if (nodesVisited.has(nodeUid)) {
    return;
  }
  nodesVisited.add(nodeUid);
  const allChildren: Array<[U, Id]> = [];
  const element = mappedElement(doc, nodeType, nodeId);
  const nodeSchema = doc.schema.nodeTypes[nodeType];
  for (const linkField in nodeSchema.children) {
    const linkFieldProps = nodeSchema.children[linkField];
    const nodeLink =
      element.children[linkField as keyof typeof element.children];
    if (linkFieldProps === LinkType.set) {
      if (!(nodeLink && nodeLink instanceof Map)) {
        throw new TypeError('Expected a link set');
      }
      allChildren.push(
        ...(Array.from(nodeLink.values()).map(elId => [
          elId.__typename,
          elId._id
        ]) as Array<[U, Id]>)
      );
    } else if (linkFieldProps === LinkType.array) {
      if (!Array.isArray(nodeLink)) {
        throw new TypeError('Expected a links array');
      }
      allChildren.push(
        ...(nodeLink.map(elId => [elId.__typename, elId._id]) as Array<[U, Id]>)
      );
    } else if (linkFieldProps === LinkType.single) {
      if (nodeLink) {
        if (!isElementId(nodeLink)) {
          throw new TypeError('Expected null or ElementId');
        }
        allChildren.push([nodeLink.__typename, nodeLink._id] as [U, Id]);
      }
    }
  }
  for (const [childType, childId] of allChildren.reverse()) {
    if (typesToTraverse.size > 0 && !typesToTraverse.has(childType)) {
      continue;
    }
    populateDepthFirstDescendants(
      doc,
      childType,
      childId,
      bfElements,
      typesToTraverse,
      typesToVisit,
      nodesVisited
    );
  }
  for (const [childType, childId] of allChildren) {
    if (typesToVisit.size > 0 && !typesToVisit.has(childType)) {
      continue;
    }
    bfElements.push([childType, childId]);
  }
}
