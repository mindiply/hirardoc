import {
  Id,
  IDocumentSchema,
  INormalizedDocument,
  IParentedId,
  IParentedNode
} from '../src';
import {omit} from 'lodash';

export interface IRootFields {
  name: string;
  createdAt: Date;
}

export interface IRoot extends IParentedId<'Root', null>, IRootFields {
  children: Id[];
}

export interface IRootNode extends IParentedNode<'Root', null>, IRootFields {
  children: INodeNode[];
}

export interface INodeFields {
  text: string;
  isChecked: boolean;
}

export interface INode
  extends IParentedId<'Node', 'Root' | 'Node'>,
    INodeFields {
  children: Id[];
  membersIds: Id[];
}

export interface INodeNode
  extends IParentedNode<'Node', IRootNode | INodeNode>,
    INodeFields {
  children: INodeNode[];
}

export interface ITestDocElementsMap {
  Root: Map<Id, IRoot>;
  Node: Map<Id, INode>;
}

export type TestNormalizeDocument = INormalizedDocument<
  ITestDocElementsMap,
  keyof ITestDocElementsMap
>;

export const testDocSchema: IDocumentSchema<ITestDocElementsMap> = {
  documentType: 'TestDocSchema',
  rootType: 'Root',
  types: {
    Root: {
      children: [{__schemaType: 'Node', notNull: true}]
    },
    Node: {
      children: [
        {
          __schemaType: 'Node',
          notNull: true
        }
      ]
    }
  }
};
export const creationDate = new Date();
export const emptyTestDocument = (): TestNormalizeDocument => ({
  maps: {
    Root: new Map([
      [
        1,
        {
          __typename: 'Root',
          _id: 1,
          createdAt: creationDate,
          name: 'root',
          children: [],
          parentType: null,
          parentId: null
        }
      ]
    ]),
    Node: new Map()
  },
  rootType: 'Root',
  rootId: 1,
  schema: testDocSchema
});

function removeNodeParent(node: INodeNode) {
  // @ts-expect-error
  delete node.parent;
  for (const child of node.children) {
    removeNodeParent(child);
  }
}

export function removeParents(root: IRootNode) {
  for (const node of root.children) {
    removeNodeParent(node);
  }
  return omit(root, 'parent');
}

export function emptyNode(): INode {
  return {
    __typename: 'Node',
    _id: 'NOT_SET',
    children: [],
    isChecked: false,
    text: '',
    membersIds: [],
    parentType: null,
    parentId: null
  };
}

export function emptyNodeInfo(): Omit<INode, 'parentId' | 'parentType'> {
  return {
    __typename: 'Node',
    _id: 'NOT_SET',
    children: [],
    isChecked: false,
    text: '',
    membersIds: []
  };
}
