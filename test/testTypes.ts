import {
  DocumentSchema,
  ElementId,
  Id,
  LinksArray,
  LinksSet,
  LinkType,
  NormalizedDocument,
  SingleLink,
  TreeNode
} from '../src'
import {omit} from 'lodash'
import {createNormalizedDocument} from '../src/HDocument'

export interface MemberFields {
  firstName: string;
  lastName: string;
}

export type Member = TreeNode<ITestDocElementsMap, 'Member', MemberFields, {}, {}>;

export interface IRootFields {
  name: string;
  createdAt: Date;
}

export type IRoot = TreeNode<
  ITestDocElementsMap,
  'Root',
  IRootFields,
  {
    children: LinksArray<'Node'>;
    owner: SingleLink<'Member'>;
    members: LinksSet<'Member'>;
  },
  {}
>;

export interface IRootNode extends ElementId<'Root'>, IRootFields {
  children: INodeNode[];
}

export interface INodeFields {
  text: string;
  isChecked: boolean;
  membersIds: Id[];
}

export type INode = TreeNode<
  ITestDocElementsMap,
  'Node',
  INodeFields,
  {
    children: LinksArray<'Node'>;
  },
  {}
>;

export interface INodeNode extends ElementId<'Node'>, INodeFields {
  children: INodeNode[];
}

export interface ITestDocElementsMap {
  Member: Member;
  Root: IRoot;
  Node: INode;
}

export type TestNormalizeDocument = NormalizedDocument<
  ITestDocElementsMap,
  'Root'
>;

export const testDocSchema: DocumentSchema<ITestDocElementsMap, 'Root'> = {
  documentType: 'TestDocSchema',
  rootType: 'Root',
  nodeTypes: {
    Member: {
      __typename: 'Member',
      children: {},
      data: () => ({
        lastName: '',
        firstName:''
      })
    },
    Node: {
      __typename: 'Node',
      children: {
        children: LinkType.array
      },
      data: () => ({
        membersIds: [],
        isChecked: false,
        text: ''
      }),
      links: {}
    },
    Root: {
      __typename: 'Root',
      data: () => ({
        createdAt: new Date(),
        name: ''
      }),
      links: {},
      children: {
        children: LinkType.array,
        owner: LinkType.single,
        members: LinkType.set
      }
    }
  }
};

export const creationDate = new Date();
export const emptyTestDocument = (): TestNormalizeDocument =>
  createNormalizedDocument(testDocSchema, {
    __typename: 'Root',
    createdAt: creationDate,
    _id: 1,
    name: 'root'
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
  return emptyTestDocument().emptyNode('Node');
}

export function emptyNodeInfo(): Omit<INode, 'parentId' | 'parentType'> {
  return emptyTestDocument().emptyNode('Node');
}
