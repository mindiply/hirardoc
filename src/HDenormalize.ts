import {
  DocumentVisitTraversal,
  Id,
  INormalizedDocument,
  INormalizedMutableMapsDocument,
  IParentedId,
  IParentedNode
} from './HTypes';
import {visitDocument} from './HVisit';
import {mappedElement} from './HUtils';

const elementUid = <U>(elementType: U, elementId: Id) =>
  `${elementType}:${elementId}`;

export function denormalizeDocument<
  MapsInterface,
  U extends keyof MapsInterface
>(
  doc:
    | INormalizedDocument<MapsInterface, U>
    | INormalizedMutableMapsDocument<MapsInterface, U>
): IParentedNode<U> {
  const nodes: Map<string, IParentedNode> = new Map();
  // I will need two visits. One to create all the nodes while setting the parents, and
  // a second one where we change the children.
  visitDocument(doc, (normalizedDoc, nodeType, nodeId) => {
    const element = mappedElement(doc.maps, nodeType, nodeId) as IParentedId;
    const parentUid =
      element.parentType && element.parentId
        ? elementUid(element.parentType, element.parentId)
        : null;
    const parent = parentUid ? nodes.get(parentUid) || null : null;
    const denormalizedNode: IParentedNode = {...element, parent};
    nodes.set(elementUid(nodeType, nodeId), denormalizedNode);
  });
  visitDocument(
    doc,
    (normDoc, nodeType, nodeId) => {
      const element = mappedElement(doc.maps, nodeType, nodeId) as IParentedId;
      const uid = elementUid(nodeType, nodeId);
      const denormalizedNode = nodes.get(uid)!;
      const typeLinks = doc.schema.types[nodeType];
      for (const fieldName in typeLinks) {
        if (fieldName === 'parentId') {
          continue;
        }
        const linkProps = typeLinks[fieldName];
        if (Array.isArray(linkProps)) {
          const linkedIds = (element as any)[fieldName] as Id[];
          if (!Array.isArray(linkedIds)) {
            (denormalizedNode as any)[fieldName] = [];
          } else {
            (denormalizedNode as any)[fieldName] = linkedIds
              .map(childId =>
                nodes.get(elementUid(linkProps[0].__schemaType, childId))
              )
              .filter(childNode => childNode !== undefined);
          }
        } else {
          (denormalizedNode as any)[fieldName] = null;
        }
      }
    },
    {
      context: {},
      traversal: DocumentVisitTraversal.DEPTH_FIRST
    }
  );
  return nodes.get(elementUid(doc.rootType, doc.rootId))!;
}
