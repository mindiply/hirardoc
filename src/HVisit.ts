import {
  DocumentVisitTraversal,
  Id,
  NormalizedDocument,
  NodeVisitor,
  VisitDocumentOptions,
  TreeNode,
  LinkType,
  NodeLink,
  ElementId
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
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  R extends keyof NodesDef = keyof NodesDef,
  Context = any
>(
  doc: NormalizedDocument<NodesDef, R>,
  onNodeVisit: NodeVisitor<NodesDef, R>,
  {
    context,
    traversal = DocumentVisitTraversal.BREADTH_FIRST,
    startElement,
    typesToTraverse,
    typesToVisit
  }: VisitDocumentOptions<NodesDef, keyof NodesDef, Context> = {}
) {
  const elementType = startElement ? startElement.type : doc.rootId.__typename;
  const elementId = startElement ? startElement._id : doc.rootId._id;
  const traversableMap = typesToTraverse ? new Set(typesToTraverse) : undefined;
  const visitableMap = typesToVisit ? new Set(typesToVisit) : undefined;
  for (
    const nodesToVisit: Array<[keyof NodesDef, Id]> =
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

function breadthFirstNodes<NodesDef, U extends keyof NodesDef>(
  doc: NormalizedDocument<NodesDef, U>,
  nodeType: U,
  nodeId: Id,
  typesToTraverse?: Set<U>,
  typesToVisit?: Set<U>,
  nodesVisited: Set<string> = new Set()
): Array<[U, Id]> {
  const nodeUid = `${String(nodeType)}:${nodeId}`;
  if (nodesVisited.has(nodeUid)) {
    return [];
  } else {
    nodesVisited.add(nodeUid);
  }
  const element = mappedElement(doc, nodeType, nodeId);
  const nodeList: Array<[U, Id]> =
    typesToVisit && !typesToVisit.has(nodeType) ? [] : [[nodeType, nodeId]];
  const childrenToVisit: Array<[U, Id]> = [];
  const nodeSchema = doc.schema.nodeTypes[nodeType];
  for (const linkField in nodeSchema.children) {
    const linkFieldProps = nodeSchema.children[linkField];
    const nodeLink = element[linkField as keyof typeof element] as NodeLink<
      keyof NodesDef
    >;
    if (linkFieldProps === LinkType.set) {
      if (!(nodeLink && nodeLink instanceof Map)) {
        throw new TypeError('Expected a link set');
      }
      childrenToVisit.push(
        ...(Array.from(nodeLink.values()).map(elId => [
          elId.__typename,
          elId._id
        ]) as Array<[U, Id]>)
      );
    } else if (linkFieldProps === LinkType.array) {
      if (!Array.isArray(nodeLink)) {
        throw new TypeError('Expected a links array');
      }
      childrenToVisit.push(
        ...(nodeLink.map(elId => [elId.__typename, elId._id]) as Array<[U, Id]>)
      );
    } else if (linkFieldProps === LinkType.single) {
      if (nodeLink) {
        if (!isElementId(nodeLink)) {
          throw new TypeError('Expected null or ElementId');
        }
        childrenToVisit.push([nodeLink.__typename, nodeLink._id] as [U, Id]);
      }
    }
  }
  for (const [childType, childId] of childrenToVisit) {
    nodeList.push(
      ...breadthFirstNodes(
        doc,
        childType,
        childId,
        typesToTraverse,
        typesToVisit,
        nodesVisited
      )
    );
  }
  return nodeList;
}

function depthFirstNodes<NodesDef, R extends keyof NodesDef>(
  doc: NormalizedDocument<NodesDef, R>,
  nodeType: keyof NodesDef,
  nodeId: Id,
  typesToTraverse?: Set<keyof NodesDef>,
  typesToVisit?: Set<keyof NodesDef>,
  nodesVisited: Set<string> = new Set()
): Array<[keyof NodesDef, Id]> {
  const nodeUid = `${String(nodeType)}:${nodeId}`;
  if (nodesVisited.has(nodeUid)) {
    return [];
  } else {
    nodesVisited.add(nodeUid);
  }
  const nodeList: Array<[keyof NodesDef, Id]> =
    typesToVisit && !typesToVisit.has(nodeType) ? [] : [[nodeType, nodeId]];
  const element = mappedElement(doc, nodeType, nodeId);
  const childrenElIds: ElementId<keyof NodesDef>[] = [];
  const nodeSchema = doc.schema.nodeTypes[nodeType];
  for (const linkField in nodeSchema.children) {
    const linkFieldProps = nodeSchema.children[linkField];
    const nodeLink = element[linkField as keyof typeof element] as NodeLink<
      keyof NodesDef
    >;
    if (linkFieldProps === LinkType.set) {
      if (!(nodeLink && nodeLink instanceof Map)) {
        throw new TypeError('Expected a link set');
      }
      childrenElIds.push(...Array.from(nodeLink.values()));
    } else if (linkFieldProps === LinkType.array) {
      if (!Array.isArray(nodeLink)) {
        throw new TypeError('Expected a links array');
      }
      childrenElIds.push(...nodeLink);
    } else if (linkFieldProps === LinkType.single) {
      if (nodeLink) {
        if (!isElementId(nodeLink)) {
          throw new TypeError('Expected null or ElementId');
        }
        childrenElIds.push(nodeLink);
      }
    }
  }
  for (const childElId of childrenElIds) {
    if (typesToTraverse && !typesToTraverse.has(childElId.__typename)) {
      continue;
    }
    nodeList.unshift(
      ...depthFirstNodes(
        doc,
        childElId.__typename,
        childElId._id,
        typesToTraverse,
        typesToVisit,
        nodesVisited
      )
    );
  }
  return nodeList;
}
