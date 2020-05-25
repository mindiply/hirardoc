import {omit} from 'lodash';
import {
  DocumentVisitTraversal,
  Id,
  IId,
  INormalizedDocument,
  INormalizedMutableMapsDocument,
  IParentedId
} from './HTypes';
import {visitDocument} from './HVisit';
import {mappedElement} from './HDocument';

interface IParentedNode<U = any> extends IId {
  __typename: U;
  parent: null | IParentedNode;
}

const elementUid = <U>(elementType: U, elementId: Id) =>
  `${elementType}:${elementId}`;

export function denormalizeDocument<
  MapsInterface,
  U extends keyof MapsInterface,
  T extends
    | INormalizedDocument<MapsInterface, U>
    | INormalizedMutableMapsDocument<MapsInterface, U>
>(doc: T): IParentedNode<U> {
  const nodes: Map<string, IParentedNode> = new Map();
  const rootElement = mappedElement(doc.maps, doc.rootType, doc.rootId);
  const rootNode: IParentedNode = {
    ...omit(rootElement as IParentedId, [
      'parentId',
      'parentType',
      '__typename'
    ]),
    __typename: doc.rootType,
    parent: null
  };
  nodes.set(elementUid(doc.rootType, doc.rootId), rootNode);
  visitDocument(
    doc,
    (normalizedDoc, nodeType, nodeId) => {
      const element = mappedElement(doc.maps, nodeType, nodeId);
    },
    {},
    DocumentVisitTraversal.DEPTH_FIRST
  );
  return rootNode;
}
