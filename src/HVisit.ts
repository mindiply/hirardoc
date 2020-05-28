import {
  DocumentVisitTraversal,
  Id,
  IFieldEntityReference,
  INormalizedDocument,
  INormalizedMutableMapsDocument,
  IVisitor
} from './HTypes';
import {isParentedId, mappedElement} from './HDocument';

/**
 * Traversal of a normalized document, calling
 * for each node the visitor function passed as parameter.
 *
 * The traversal is breadth first by default, unless the
 * goBreadthFirst parameter is false in which case its depthFirst
 *
 * @param {IDocumentSchema<MapsInterface, V>} docSchema
 * @param {INormalizedDocument<MapsInterface, U, V>} doc
 * @param {IVisitor<MapsInterface, U, V>} onNodeVisit
 * @param {Context} context
 */
export function visitDocument<
  MapsInterface,
  U extends keyof MapsInterface = keyof MapsInterface,
  Context extends any = any
>(
  doc:
    | INormalizedDocument<MapsInterface, U>
    | INormalizedMutableMapsDocument<MapsInterface, U>,
  onNodeVisit: IVisitor<MapsInterface, U>,
  context?: Context,
  traversal = DocumentVisitTraversal.BREADTH_FIRST,
  elementType?: U,
  elementId?: Id
) {
  for (
    const nodesToVisit: Array<[U, Id]> =
      traversal === DocumentVisitTraversal.BREADTH_FIRST
        ? breadthFirstNodes(
            doc,
            elementType || doc.rootType,
            elementId || doc.rootId
          )
        : depthFirstNodes(
            doc,
            elementType || doc.rootType,
            elementId || doc.rootId
          );
    nodesToVisit.length > 0;

  ) {
    const [nextType, nextId] = nodesToVisit.shift()!;
    onNodeVisit(doc, nextType, nextId, context || {});
  }
}

function breadthFirstNodes<
  MapsInterface,
  U extends keyof MapsInterface = keyof MapsInterface
>(
  doc:
    | INormalizedDocument<MapsInterface, U>
    | INormalizedMutableMapsDocument<MapsInterface, U>,
  nodeType: U,
  nodeId: Id,
  nodesVisited: Set<string> = new Set()
): Array<[U, Id]> {
  const nodeUid = `${nodeType}:${nodeId}`;
  if (nodesVisited.has(nodeUid)) {
    return [];
  } else {
    nodesVisited.add(nodeUid);
  }
  const element = mappedElement(doc.maps, nodeType, nodeId);
  if (!isParentedId(element)) return [];
  const nodeList: Array<[U, Id]> = [[nodeType, nodeId]];
  const nodeSchema = doc.schema.types[nodeType];
  for (const linkField in nodeSchema) {
    if (linkField === 'parentId') continue;
    const linkFieldProps = nodeSchema[linkField];
    if (Array.isArray(linkFieldProps)) {
      const {__schemaType} = linkFieldProps[0];
      const fieldIds = (element as any)[linkField] as Id[];
      for (const fieldId of fieldIds) {
        nodeList.push([__schemaType, fieldId]);
      }
    } else {
      const {__schemaType} = linkFieldProps as IFieldEntityReference<U>;
      nodeList.push([__schemaType, (element as any)[linkField] as Id]);
    }
  }
  const lengthWithChildren = nodeList.length;
  for (let i = 1; i < lengthWithChildren; i++) {
    nodeList.push(
      ...breadthFirstNodes(doc, nodeList[i][0], nodeList[i][1], nodesVisited)
    );
  }
  return nodeList;
}

function depthFirstNodes<
  MapsInterface,
  U extends keyof MapsInterface = keyof MapsInterface
>(
  doc:
    | INormalizedDocument<MapsInterface, U>
    | INormalizedMutableMapsDocument<MapsInterface, U>,
  nodeType: U,
  nodeId: Id,
  nodesVisited: Set<string> = new Set()
): Array<[U, Id]> {
  const nodeUid = `${nodeType}:${nodeId}`;
  if (nodesVisited.has(nodeUid)) {
    return [];
  } else {
    nodesVisited.add(nodeUid);
  }
  const nodeList: Array<[U, Id]> = [[nodeType, nodeId]];
  const element = mappedElement(doc.maps, nodeType, nodeId);
  if (!isParentedId(element)) return [];
  const nodeSchema = doc.schema.types[nodeType];
  for (const linkField in nodeSchema) {
    if (linkField === 'parentId') continue;
    const linkFieldProps = nodeSchema[linkField];
    if (Array.isArray(linkFieldProps)) {
      const {__schemaType} = linkFieldProps[0];
      const fieldIds = (element as any)[linkField] as Id[];
      for (const fieldId of fieldIds) {
        nodeList.unshift(
          ...depthFirstNodes(doc, __schemaType, fieldId, nodesVisited)
        );
      }
    } else {
      const {__schemaType} = linkFieldProps as IFieldEntityReference<U>;
      nodeList.unshift(
        ...depthFirstNodes(
          doc,
          __schemaType,
          (element as any)[linkField] as Id,
          nodesVisited
        )
      );
    }
  }
  return nodeList;
}
