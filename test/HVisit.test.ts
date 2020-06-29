import {
  ITestDocElementsMap,
  testDocSchema,
  TestNormalizeDocument
} from './testTypes';
import {DocumentVisitTraversal, IVisitor, visitDocument} from '../src';

const testDoc: TestNormalizeDocument = {
  schema: testDocSchema,
  maps: {
    Node: new Map([
      [
        'node_1',
        {
          __typename: 'Node',
          _id: 'node_1',
          parentType: 'Root',
          parentId: 'root_1',
          text: 'Parent node',
          isChecked: false,
          children: ['node_2', 'node_3']
        }
      ],
      [
        'node_2',
        {
          __typename: 'Node',
          _id: 'node_2',
          children: [],
          isChecked: true,
          text: 'Child Node 1',
          parentType: 'Node',
          parentId: 'node_1'
        }
      ],
      [
        'node_3',
        {
          __typename: 'Node',
          _id: 'node_3',
          children: [],
          isChecked: false,
          text: 'Child Node 2',
          parentType: 'Node',
          parentId: 'node_1'
        }
      ]
    ]),
    Root: new Map([
      [
        'root_1',
        {
          __typename: 'Root',
          _id: 'root_1',
          parentType: null,
          parentId: null,
          createdAt: new Date(),
          children: ['node_1'],
          name: 'A tree'
        }
      ]
    ])
  },
  rootType: 'Root',
  rootId: 'root_1'
};

const testVisit: IVisitor<
  ITestDocElementsMap,
  keyof ITestDocElementsMap,
  {count: number; nodeIds: string[]}
> = (doc, nodeType, nodeId, context) => {
  if (context) {
    context.count = context.count + 1;
    context.nodeIds.push(`${nodeType}:${nodeId}`);
  }
};

describe('HVisit tests', () => {
  test('Normal visit', () => {
    const context = {count: 0, nodeIds: []};
    visitDocument(testDoc, testVisit, {context});
    expect(context.count).toEqual(4);
    expect(context.nodeIds).toEqual([
      'Root:root_1',
      'Node:node_1',
      'Node:node_2',
      'Node:node_3'
    ]);
  });

  test('Normal visit - depth first', () => {
    const context = {count: 0, nodeIds: []};
    visitDocument(testDoc, testVisit, {
      context,
      traversal: DocumentVisitTraversal.DEPTH_FIRST
    });
    expect(context.count).toEqual(4);
    expect(context.nodeIds).toEqual([
      'Node:node_3',
      'Node:node_2',
      'Node:node_1',
      'Root:root_1'
    ]);
  });

  test('Skip node types visit', () => {
    const context = {count: 0, nodeIds: []};
    visitDocument(testDoc, testVisit, {
      context,
      typesToVisit: ['Node']
    });
    expect(context.count).toEqual(3);
    expect(context.nodeIds).toEqual([
      'Node:node_1',
      'Node:node_2',
      'Node:node_3'
    ]);
    context.count = 0;
    context.nodeIds = [];
    visitDocument(testDoc, testVisit, {
      context,
      typesToVisit: ['Root']
    });
    expect(context.count).toEqual(1);
    expect(context.nodeIds).toEqual(['Root:root_1']);
    context.count = 0;
    context.nodeIds = [];
    visitDocument(testDoc, testVisit, {
      context,
      typesToVisit: ['Root', 'Node']
    });
    expect(context.count).toEqual(4);
    expect(context.nodeIds).toEqual([
      'Root:root_1',
      'Node:node_1',
      'Node:node_2',
      'Node:node_3'
    ]);
  });

  test('Skip node types visit - depth first', () => {
    const context = {count: 0, nodeIds: []};
    visitDocument(testDoc, testVisit, {
      context,
      traversal: DocumentVisitTraversal.DEPTH_FIRST,
      typesToVisit: ['Node']
    });
    expect(context.count).toEqual(3);
    expect(context.nodeIds).toEqual([
      'Node:node_3',
      'Node:node_2',
      'Node:node_1'
    ]);
    context.count = 0;
    context.nodeIds = [];
    visitDocument(testDoc, testVisit, {
      context,
      traversal: DocumentVisitTraversal.DEPTH_FIRST,
      typesToVisit: ['Root']
    });
    expect(context.count).toEqual(1);
    expect(context.nodeIds).toEqual([
      'Root:root_1'
    ]);
    context.count = 0;
    context.nodeIds = [];
    visitDocument(testDoc, testVisit, {
      context,
      traversal: DocumentVisitTraversal.DEPTH_FIRST,
      typesToVisit: ['Root', 'Node']
    });
    expect(context.count).toEqual(4);
    expect(context.nodeIds).toEqual([
      'Node:node_3',
      'Node:node_2',
      'Node:node_1',
      'Root:root_1'
    ]);
  });

  test('Skip traversal of types', () => {
    const context = {count: 0, nodeIds: []};
    visitDocument(testDoc, testVisit, {
      context,
      typesToTraverse: ['Node']
    });
    expect(context.count).toEqual(4);
    expect(context.nodeIds).toEqual([
      'Root:root_1',
      'Node:node_1',
      'Node:node_2',
      'Node:node_3'
    ]);
    context.count = 0;
    context.nodeIds = [];
    visitDocument(testDoc, testVisit, {
      context,
      typesToVisit: ['Root']
    });
    expect(context.count).toEqual(1);
    expect(context.nodeIds).toEqual([
      'Root:root_1'
    ]);
    context.count = 0;
    context.nodeIds = [];
    visitDocument(testDoc, testVisit, {
      context,
      typesToVisit: ['Root', 'Node']
    });
    expect(context.count).toEqual(4);
    expect(context.nodeIds).toEqual([
      'Root:root_1',
      'Node:node_1',
      'Node:node_2',
      'Node:node_3'
    ]);
  });

  test('Skip traversal of types - depth first', () => {
    const context = {count: 0, nodeIds: []};
    visitDocument(testDoc, testVisit, {
      context,
      typesToTraverse: ['Node'],
      traversal: DocumentVisitTraversal.DEPTH_FIRST
    });
    expect(context.count).toEqual(4);
    expect(context.nodeIds).toEqual([
      'Node:node_3',
      'Node:node_2',
      'Node:node_1',
      'Root:root_1'
    ]);
    context.count = 0;
    context.nodeIds = [];
    visitDocument(testDoc, testVisit, {
      context,
      typesToVisit: ['Root'],
      traversal: DocumentVisitTraversal.DEPTH_FIRST
    });
    expect(context.count).toEqual(1);
    expect(context.nodeIds).toEqual([
      'Root:root_1'
    ]);
    context.count = 0;
    context.nodeIds = [];
    visitDocument(testDoc, testVisit, {
      context,
      typesToVisit: ['Root', 'Node'],
      traversal: DocumentVisitTraversal.DEPTH_FIRST
    });
    expect(context.count).toEqual(4);
    expect(context.nodeIds).toEqual([
      'Node:node_3',
      'Node:node_2',
      'Node:node_1',
      'Root:root_1'
    ]);
  });

  test('Visit subtree', () => {
    const context = {count: 0, nodeIds: []};
    visitDocument(testDoc, testVisit, {
      context,
      startElement: {
        type: 'Node',
        _id: 'node_1'
      }
    });
    expect(context.count).toEqual(3);
    expect(context.nodeIds).toEqual([
      'Node:node_1',
      'Node:node_2',
      'Node:node_3'
    ]);
    context.count = 0;
    context.nodeIds = [];
    visitDocument(testDoc, testVisit, {
      context,
      startElement: {
        type: 'Node',
        _id: 'node_2'
      }
    });
    expect(context.count).toEqual(1);
    expect(context.nodeIds).toEqual([
      'Node:node_2'
    ]);
    context.count = 0;
    context.nodeIds = [];
    visitDocument(testDoc, testVisit, {
      context,
      startElement: {
        type: 'Root',
        _id: 'root_1'
      }
    });
    expect(context.count).toEqual(4);
    expect(context.nodeIds).toEqual([
      'Root:root_1',
      'Node:node_1',
      'Node:node_2',
      'Node:node_3'
    ]);
  });

  test('Visit subtree - depth first', () => {
    const context = {count: 0, nodeIds: []};
    visitDocument(testDoc, testVisit, {
      context,
      traversal: DocumentVisitTraversal.DEPTH_FIRST,
      startElement: {
        type: 'Node',
        _id: 'node_1'
      }
    });
    expect(context.count).toEqual(3);
    expect(context.nodeIds).toEqual([
      'Node:node_3',
      'Node:node_2',
      'Node:node_1'
    ]);
    context.count = 0;
    context.nodeIds = [];
    visitDocument(testDoc, testVisit, {
      context,
      traversal: DocumentVisitTraversal.DEPTH_FIRST,
      startElement: {
        type: 'Node',
        _id: 'node_2'
      }
    });
    expect(context.nodeIds).toEqual([
      'Node:node_2'
    ]);
    expect(context.count).toEqual(1);
    context.count = 0;
    context.nodeIds = [];
    visitDocument(testDoc, testVisit, {
      context,
      traversal: DocumentVisitTraversal.DEPTH_FIRST,
      startElement: {
        type: 'Root',
        _id: 'root_1'
      }
    });
    expect(context.count).toEqual(4);
    expect(context.nodeIds).toEqual([
      'Node:node_3',
      'Node:node_2',
      'Node:node_1',
      'Root:root_1'
    ]);
  });
});
