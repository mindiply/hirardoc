import {
  emptyNodeInfo,
  ITestDocElementsMap,
  testDocSchema,
  TestNormalizeDocument
} from './testTypes';
import {
  createNormalizedDocument,
  DocumentVisitTraversal,
  NodeVisitor,
  visitDocument,
  mutableDocument
} from '../src';

let testDoc = createNormalizedDocument(testDocSchema, {
  __typename: 'Root',
  _id: 'root_1',
  createdAt: new Date(2024, 0, 1),
  name: 'TestDoc'
});
const mutableDoc = mutableDocument(testDoc);
mutableDoc.insertElement({
  element: {
    __typename: 'Node',
    _id: 'node_1',
    text: 'Parent node',
    isChecked: false
  },
  parent: [],
  position: {field: 'children', index: 0}
});

mutableDoc.insertElement({
  element: {
    __typename: 'Node',
    _id: 'node_2',
    isChecked: true,
    text: 'Child Node 1'
  },
  parent: [{field: 'children', index: 0}],
  position: {field: 'children', index: 0}
});

mutableDoc.insertElement({
  element: {
    __typename: 'Node',
    _id: 'node_3',
    isChecked: true,
    text: 'Child Node 2'
  },
  parent: [{field: 'children', index: 0}],
  position: {field: 'children', index: 1}
});

mutableDoc.insertElement({
  element: {
    __typename: 'Member',
    _id: 'member1',
    lastName: 'Test',
    firstName: 'Test1'
  },
  position: 'owner',
  parent: []
});

mutableDoc.insertElement({
  element: {
    __typename: 'Member',
    _id: 'member2',
    lastName: 'Test',
    firstName: 'Test2'
  },
  position: {field: 'members', nodeType: 'Member', nodeId: 'Member2'},
  parent: []
});

testDoc = mutableDoc.updatedDocument();

const testVisit: NodeVisitor<
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
    expect(context.count).toEqual(6);
    expect(context.nodeIds).toEqual([
      'Root:root_1',
      'Node:node_1',
      'Member:member1',
      'Member:member2',
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
    expect(context.nodeIds).toEqual([
      'Node:node_3',
      'Node:node_2',
      'Member:member2',
      'Member:member1',
      'Node:node_1',
      'Root:root_1'
    ]);
    expect(context.count).toEqual(6);
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
    expect(context.nodeIds).toEqual(['Root:root_1']);
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
      typesToTraverse: ['Node', 'Root']
    });
    expect(context.count).toEqual(6);
    expect(context.nodeIds).toEqual([
      'Root:root_1',
      'Node:node_1',
      'Member:member1',
      'Member:member2',
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

  test('Skip traversal of types - depth first', () => {
    const context = {count: 0, nodeIds: []};
    visitDocument(testDoc, testVisit, {
      context,
      typesToTraverse: ['Node', 'Root'],
      typesToVisit: ['Node'],
      traversal: DocumentVisitTraversal.DEPTH_FIRST
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
      typesToVisit: ['Root'],
      traversal: DocumentVisitTraversal.DEPTH_FIRST
    });
    expect(context.count).toEqual(1);
    expect(context.nodeIds).toEqual(['Root:root_1']);
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
        __typename: 'Node',
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
        __typename: 'Node',
        _id: 'node_2'
      }
    });
    expect(context.count).toEqual(1);
    expect(context.nodeIds).toEqual(['Node:node_2']);
    context.count = 0;
    context.nodeIds = [];
    visitDocument(testDoc, testVisit, {
      context,
      startElement: {
        __typename: 'Root',
        _id: 'root_1'
      }
    });
    expect(context.count).toEqual(6);
    expect(context.nodeIds).toEqual([
      'Root:root_1',
      'Node:node_1',
      'Member:member1',
      'Member:member2',
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
        __typename: 'Node',
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
        __typename: 'Node',
        _id: 'node_2'
      }
    });
    expect(context.nodeIds).toEqual(['Node:node_2']);
    expect(context.count).toEqual(1);
    context.count = 0;
    context.nodeIds = [];
    visitDocument(testDoc, testVisit, {
      context,
      traversal: DocumentVisitTraversal.DEPTH_FIRST,
      startElement: {
        __typename: 'Root',
        _id: 'root_1'
      }
    });
    expect(context.count).toEqual(6);
    expect(context.nodeIds).toEqual([
      'Node:node_3',
      'Node:node_2',
      'Member:member2',
      'Member:member1',
      'Node:node_1',
      'Root:root_1'
    ]);
  });
});
