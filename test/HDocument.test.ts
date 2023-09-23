import {
  creationDate,
  emptyTestDocument,
  ITestDocElementsMap,
  testDocSchema
} from './testTypes';
import {
  compactTreeNode,
  createNormalizedDocument,
  denormalizeDocument,
  docReducer,
  hasMappedElement,
  HDocCommandType,
  InsertElement,
  mappedElement,
  mutableDocument
} from '../src';

describe('Empty doc and nodes', () => {
  const emptyDoc = createNormalizedDocument(testDocSchema);
  test('Should have root element', () => {
    const allNodes = Array.from(emptyDoc[Symbol.iterator]());
    expect(allNodes.length).toBe(1);
    expect(allNodes[0].__typename).toBe('Root');
  });

  test('Should be able to create empty root elements', () => {
    expect(emptyDoc.emptyNode('Root')).toMatchObject({
      __typename: 'Root',
      data: {name: ''},
      children: {
        children: [],
        owner: null,
        members: new Map()
      }
    });
  });

  test('Should be able to create empty node elements', () => {
    expect(emptyDoc.emptyNode('Node')).toMatchObject({
      __typename: 'Node',
      data: {
        text: '',
        isChecked: false,
        membersIds: []
      },
      children: {
        children: []
      }
    });
  });
});

//
describe('Test the basic operations', () => {
  test('Add one node', () => {
    const emptyDoc = emptyTestDocument();
    const expectedRootNode = {
      __typename: 'Root',
      _id: 1,
      createdAt: creationDate,
      name: 'root',
      children: [
        {
          __typename: 'Node',
          _id: 'Node1',
          children: [],
          isChecked: false,
          text: 'firstNode',
          membersIds: []
        }
      ]
    };
    const addNodeCmd: InsertElement<ITestDocElementsMap, 'Node', 'Root'> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: {field: 'children', index: 0},
      parent: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        isChecked: false,
        text: 'firstNode',
        membersIds: []
      }
    };
    const mutableDoc = mutableDocument(emptyDoc);
    mutableDoc.insertElement(addNodeCmd);
    expect(denormalizeDocument(mutableDoc.updatedDocument)).toMatchObject(
      expectedRootNode
    );
    expect(denormalizeDocument(mutableDoc)).toMatchObject(expectedRootNode);

    const replayMutableDoc = mutableDocument(emptyDoc);
    replayMutableDoc.applyChanges(mutableDoc.changes);
    expect(denormalizeDocument(replayMutableDoc)).toMatchObject(
      expectedRootNode
    );
    expect(denormalizeDocument(replayMutableDoc.updatedDocument)).toMatchObject(
      expectedRootNode
    );
  });

  test('Add an owner', () => {
    const emptyDoc = emptyTestDocument();
    const expectedRootNode = {
      __typename: 'Root',
      _id: 1,
      createdAt: creationDate,
      name: 'root',
      owner: {
          __typename: 'Member',
          _id: 'Member1',
          firstName: 'Test',
          lastName: 'Testable'
        }
    };
    const addOwnerCmd: InsertElement<ITestDocElementsMap, 'Member', 'Root'> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: 'owner',
      parent: [],
      element: {
        __typename: 'Member',
        _id: 'Member1',
        firstName: 'Test',
        lastName: 'Testable'
      }
    };
    const mutableDoc = mutableDocument(emptyDoc);
    mutableDoc.insertElement(addOwnerCmd);
    expect(denormalizeDocument(mutableDoc.updatedDocument)).toMatchObject(
      expectedRootNode
    );
    expect(denormalizeDocument(mutableDoc)).toMatchObject(expectedRootNode);

    const replayMutableDoc = mutableDocument(emptyDoc);
    replayMutableDoc.applyChanges(mutableDoc.changes);
    expect(denormalizeDocument(replayMutableDoc)).toMatchObject(
      expectedRootNode
    );
    expect(denormalizeDocument(replayMutableDoc.updatedDocument)).toMatchObject(
      expectedRootNode
    );
  });

  test('Add a member', () => {
    const emptyDoc = emptyTestDocument();
    const expectedRootNode = {
      __typename: 'Root',
      _id: 1,
      createdAt: creationDate,
      name: 'root',
      members: new Map([['Member.Member1', {
        __typename: 'Member',
        _id: 'Member1',
        firstName: 'Test',
        lastName: 'Testable'
      }]])
    };
    const addMemberCmd: InsertElement<ITestDocElementsMap, 'Member', 'Root'> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: {field: 'members', nodeId: 'Member1', nodeType: 'Member'},
      parent: [],
      element: {
        __typename: 'Member',
        _id: 'Member1',
        firstName: 'Test',
        lastName: 'Testable'
      }
    };
    const mutableDoc = mutableDocument(emptyDoc);
    mutableDoc.insertElement(addMemberCmd);
    expect(denormalizeDocument(mutableDoc.updatedDocument)).toMatchObject(
      expectedRootNode
    );
    expect(denormalizeDocument(mutableDoc)).toMatchObject(expectedRootNode);

    const replayMutableDoc = mutableDocument(emptyDoc);
    replayMutableDoc.applyChanges(mutableDoc.changes);
    expect(denormalizeDocument(replayMutableDoc)).toMatchObject(
      expectedRootNode
    );
    expect(denormalizeDocument(replayMutableDoc.updatedDocument)).toMatchObject(
      expectedRootNode
    );
  });

  test('Change a node', () => {
    let doc = emptyTestDocument();
    doc = docReducer(doc, {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: {field: 'children', index: 0},
      parent: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        isChecked: false,
        text: 'firstNode',
        membersIds: []
      }
    });
    doc = docReducer(doc, {
      __typename: HDocCommandType.CHANGE_ELEMENT,
      element: {
        __typename: 'Node',
        _id: 'Node1'
      },
      changes: {
        __typename: 'Node',
        text: 'Changed node',
        isChecked: true,
        membersIds: ['Member1']
      }
    });
    expect(
      compactTreeNode(doc.getNode({__typename: 'Node', _id: 'Node1'})!)
    ).toMatchObject({
      _id: 'Node1',
      __typename: 'Node',
      text: 'Changed node',
      isChecked: true,
      membersIds: ['Member1'],
      children: []
    });
  });

  test('Change an owner', () => {
    let doc = emptyTestDocument();
    doc = docReducer(doc, {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: 'owner',
      parent: [],
      element: {
        __typename: 'Member',
        _id: 'Member1',
        firstName: 'Test',
        lastName: 'Testable'
      }
    });
    doc = docReducer(doc, {
      __typename: HDocCommandType.CHANGE_ELEMENT,
      element: {
        __typename: 'Member',
        _id: 'Member1'
      },
      changes: {
        __typename: 'Member',
        lastName: 'Tested'
      }
    });
    expect(
      compactTreeNode(doc.getNode({__typename: 'Member', _id: 'Member1'})!)
    ).toMatchObject({
      _id: 'Member1',
      __typename: 'Member',
      firstName: 'Test',
      lastName: 'Tested'
    });
  });

  test('Change a member', () => {
    let doc = emptyTestDocument();
    doc = docReducer(doc, {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: {field: 'members', nodeType: 'Member', nodeId: 'Member1'},
      parent: [],
      element: {
        __typename: 'Member',
        _id: 'Member1',
        firstName: 'Test',
        lastName: 'Testable'
      }
    });
    doc = docReducer(doc, {
      __typename: HDocCommandType.CHANGE_ELEMENT,
      element: {
        __typename: 'Member',
        _id: 'Member1'
      },
      changes: {
        __typename: 'Member',
        lastName: 'Tested'
      }
    });
    expect(
      compactTreeNode(doc.getNode({__typename: 'Member', _id: 'Member1'})!)
    ).toMatchObject({
      _id: 'Member1',
      __typename: 'Member',
      firstName: 'Test',
      lastName: 'Tested'
    });
  });

  test('Add and remove one node', () => {
    const emptyDoc = emptyTestDocument();
    const expectedRootNode = {
      __typename: 'Root',
      _id: 1,
      createdAt: creationDate,
      name: 'root',
      children: [],
      owner: null,
      members: new Map()
    };

    const mutableDoc = mutableDocument(emptyDoc);
    mutableDoc.insertElement({
      position: {field: 'children', index: 0},
      parent: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        isChecked: false,
        text: 'firstNode',
        membersIds: []
      }
    });
    mutableDoc.deleteElement({
      element: [{field: 'children', index: 0}]
    });
    expect(denormalizeDocument(mutableDoc)).toMatchObject(expectedRootNode);
    expect(denormalizeDocument(mutableDoc.updatedDocument)).toMatchObject(
      expectedRootNode
    );
    const replayMutableDoc = mutableDocument(emptyDoc);
    replayMutableDoc.applyChanges(mutableDoc.changes);
    expect(denormalizeDocument(replayMutableDoc)).toMatchObject(
      expectedRootNode
    );
    expect(denormalizeDocument(replayMutableDoc.updatedDocument)).toMatchObject(
      expectedRootNode
    );
  });

  test('Add and remove an owner', () => {
    const emptyDoc = emptyTestDocument();
    const expectedRootNode = {
      __typename: 'Root',
      _id: 1,
      createdAt: creationDate,
      name: 'root',
      children: [],
      owner: null,
      members: new Map()
    };

    const mutableDoc = mutableDocument(emptyDoc);
    mutableDoc.insertElement({
      position: 'owner',
      parent: [],
      element: {
        __typename: 'Member',
        _id: 'Member1',
        firstName: 'Test',
        lastName: 'Testable'
      }
    });
    mutableDoc.deleteElement({
      element: ['owner']
    });
    expect(denormalizeDocument(mutableDoc)).toMatchObject(expectedRootNode);
    expect(denormalizeDocument(mutableDoc.updatedDocument)).toMatchObject(
      expectedRootNode
    );
    const replayMutableDoc = mutableDocument(emptyDoc);
    replayMutableDoc.applyChanges(mutableDoc.changes);
    expect(denormalizeDocument(replayMutableDoc)).toMatchObject(
      expectedRootNode
    );
    expect(denormalizeDocument(replayMutableDoc.updatedDocument)).toMatchObject(
      expectedRootNode
    );
  });

  test('Add and remove a member', () => {
    const emptyDoc = emptyTestDocument();
    const expectedRootNode = {
      __typename: 'Root',
      _id: 1,
      createdAt: creationDate,
      name: 'root',
      children: [],
      owner: null,
      members: new Map()
    };

    const mutableDoc = mutableDocument(emptyDoc);
    mutableDoc.insertElement({
      position: {field: 'members', nodeId: 'Member1', nodeType: 'Member'},
      parent: [],
      element: {
        __typename: 'Member',
        _id: 'Member1',
        firstName: 'Test',
        lastName: 'Testable'
      }
    });
    mutableDoc.deleteElement({
      element: [{field: 'members', nodeId: 'Member1', nodeType: 'Member'}]
    });
    expect(denormalizeDocument(mutableDoc)).toMatchObject(expectedRootNode);
    expect(denormalizeDocument(mutableDoc.updatedDocument)).toMatchObject(
      expectedRootNode
    );
    const replayMutableDoc = mutableDocument(emptyDoc);
    replayMutableDoc.applyChanges(mutableDoc.changes);
    expect(denormalizeDocument(replayMutableDoc)).toMatchObject(
      expectedRootNode
    );
    expect(denormalizeDocument(replayMutableDoc.updatedDocument)).toMatchObject(
      expectedRootNode
    );
  });

  test('Removing a parent node, removes its descendants as well', () => {
    const emptyDoc = emptyTestDocument();

    const mutableDoc = mutableDocument(emptyDoc);
    mutableDoc.insertElement({
      position: {field: 'children', index: 0},
      parent: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        isChecked: false,
        text: 'firstNode',
        membersIds: []
      }
    });
    mutableDoc.insertElement({
      position: {field: 'children', index: 0},
      parent: [{field: 'children', index: 0}],
      element: {
        __typename: 'Node',
        _id: 'Node2',
        isChecked: false,
        text: 'childNode',
        membersIds: []
      }
    });
    mutableDoc.deleteElement({
      element: {
        __typename: 'Node',
        _id: 'Node1'
      }
    });
    const updatedDoc = mutableDoc.updatedDocument;
    expect(hasMappedElement(updatedDoc, 'Node', 'Node1')).toBe(false);
    expect(hasMappedElement(updatedDoc, 'Node', 'Node2')).toBe(false);
  });

  test('Removing a child node keeps the parent', () => {
    const emptyDoc = emptyTestDocument();
    const mutableDoc = mutableDocument(emptyDoc);
    mutableDoc.insertElement({
      position: {field: 'children', index: 0},
      parent: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        isChecked: false,
        text: 'firstNode'
      }
    });
    mutableDoc.insertElement({
      position: {field: 'children', index: 0},
      parent: [{field: 'children', index: 0}],
      element: {
        __typename: 'Node',
        _id: 'Node2',
        isChecked: false,
        text: 'childNode'
      }
    });
    mutableDoc.deleteElement({
      element: {
        __typename: 'Node',
        _id: 'Node2'
      }
    });
    const updatedDoc = mutableDoc.updatedDocument;
    expect(hasMappedElement(updatedDoc, 'Node', 'Node1')).toBe(true);
    expect(
      compactTreeNode(mappedElement(updatedDoc, 'Node', 'Node1')).children
        .length
    ).toBe(0);
    expect(hasMappedElement(updatedDoc, 'Node', 'Node2')).toBe(false);
  });

  test('Added node and its child', () => {
    const emptyDoc = emptyTestDocument();
    const expectedRootNode = {
      __typename: 'Root',
      _id: 1,
      createdAt: creationDate,
      name: 'root',
      children: [
        {
          __typename: 'Node',
          _id: 'Node1',
          children: [
            {
              __typename: 'Node',
              text: 'secondNode',
              isChecked: true,
              children: [],
              _id: 'Node2'
            }
          ],
          isChecked: false,
          text: 'firstNode'
        }
      ]
    };
    const mutableDoc = mutableDocument(emptyDoc);
    mutableDoc.insertElement({
      position: {field: 'children', index: 0},
      parent: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        isChecked: false,
        text: 'firstNode'
      }
    });
    mutableDoc.insertElement({
      position: {field: 'children', index: 0},
      parent: [{field: 'children', index: 0}],
      element: {
        __typename: 'Node',
        _id: 'Node2',
        isChecked: true,
        text: 'secondNode'
      }
    });
    expect(denormalizeDocument(mutableDoc)).toMatchObject(expectedRootNode);
    expect(denormalizeDocument(mutableDoc.updatedDocument)).toMatchObject(
      expectedRootNode
    );
    const replayMutableDoc = mutableDocument(emptyDoc);
    replayMutableDoc.applyChanges(mutableDoc.changes);
    expect(denormalizeDocument(replayMutableDoc)).toMatchObject(
      expectedRootNode
    );
    expect(denormalizeDocument(replayMutableDoc.updatedDocument)).toMatchObject(
      expectedRootNode
    );
  });

  test('Added three nodes and move a child', () => {
    const emptyDoc = emptyTestDocument();
    const expectedRootNode = {
      __typename: 'Root',
      _id: 1,
      createdAt: creationDate,
      name: 'root',
      children: [
        {
          __typename: 'Node',
          _id: 'Node1',
          children: [],
          isChecked: false,
          text: 'firstNode'
        },
        {
          __typename: 'Node',
          _id: 'Node2',
          children: [
            {
              __typename: 'Node',
              text: 'thirdNode',
              isChecked: true,
              children: [],
              _id: 'Node3'
            }
          ],
          isChecked: false,
          text: 'secondNode'
        }
      ]
    };
    const mutableDoc = mutableDocument(emptyDoc);
    mutableDoc.insertElement({
      position: {field: 'children', index: 0},
      parent: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        isChecked: false,
        text: 'firstNode'
      }
    });
    mutableDoc.insertElement({
      position: {field: 'children', index: 1},
      parent: [],
      element: {
        __typename: 'Node',
        _id: 'Node2',
        isChecked: false,
        text: 'secondNode'
      }
    });
    mutableDoc.insertElement({
      position: {field: 'children', index: 0},
      parent: [{field: 'children', index: 0}],
      element: {
        __typename: 'Node',
        _id: 'Node3',
        isChecked: false,
        text: 'thirdNode'
      }
    });
    mutableDoc.moveElement({
      element: [
        {field: 'children', index: 0},
        {field: 'children', index: 0}
      ],
      toParent: [{field: 'children', index: 1}],
      toPosition: {field: 'children', index: 0},
      changes: {
        __typename: 'Node',
        isChecked: true
      }
    });
    expect(denormalizeDocument(mutableDoc)).toMatchObject(expectedRootNode);
    expect(denormalizeDocument(mutableDoc.updatedDocument)).toMatchObject(
      expectedRootNode
    );
    const replayMutableDoc = mutableDocument(emptyDoc);
    replayMutableDoc.applyChanges(mutableDoc.changes);
    expect(denormalizeDocument(replayMutableDoc)).toMatchObject(
      expectedRootNode
    );
    expect(denormalizeDocument(replayMutableDoc.updatedDocument)).toMatchObject(
      expectedRootNode
    );
  });

  test('Added node, its child and modified parent', () => {
    const emptyDoc = emptyTestDocument();
    const expectedRootNode = {
      __typename: 'Root',
      _id: 1,
      createdAt: creationDate,
      name: 'root',
      children: [
        {
          __typename: 'Node',
          _id: 'Node1',
          children: [
            {
              __typename: 'Node',
              text: 'secondNode',
              isChecked: true,
              children: [],
              _id: 'Node2'
            }
          ],
          isChecked: true,
          text: 'firstNode'
        }
      ]
    };
    const mutableDoc = mutableDocument(emptyDoc);
    mutableDoc.insertElement({
      position: {field: 'children', index: 0},
      parent: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        isChecked: false,
        text: 'firstNode'
      }
    });
    mutableDoc.insertElement({
      position: {field: 'children', index: 0},
      parent: [{field: 'children', index: 0}],
      element: {
        __typename: 'Node',
        _id: 'Node2',
        isChecked: true,
        text: 'secondNode'
      }
    });
    mutableDoc.changeElement({
      element: [{field: 'children', index: 0}],
      changes: {
        __typename: 'Node',
        isChecked: true
      }
    });
    expect(denormalizeDocument(mutableDoc)).toMatchObject(expectedRootNode);
    expect(denormalizeDocument(mutableDoc.updatedDocument)).toMatchObject(
      expectedRootNode
    );
  });

  test('Added node, its child and modified parent - replayed', () => {
    const emptyDoc = emptyTestDocument();
    const expectedRootNode = {
      __typename: 'Root',
      _id: 1,
      createdAt: creationDate,
      name: 'root',
      children: [
        {
          __typename: 'Node',
          _id: 'Node1',
          children: [
            {
              __typename: 'Node',
              text: 'secondNode',
              isChecked: true,
              children: [],
              _id: 'Node2'
            }
          ],
          isChecked: true,
          text: 'firstNode'
        }
      ]
    };
    const mutableDoc = mutableDocument(emptyDoc);
    mutableDoc.insertElement({
      position: {field: 'children', index: 0},
      parent: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        isChecked: false,
        text: 'firstNode'
      }
    });
    mutableDoc.insertElement({
      position: {field: 'children', index: 0},
      parent: [{field: 'children', index: 0}],
      element: {
        __typename: 'Node',
        _id: 'Node2',
        isChecked: true,
        text: 'secondNode'
      }
    });
    mutableDoc.changeElement({
      element: [{field: 'children', index: 0}],
      changes: {
        __typename: 'Node',
        isChecked: true
      }
    });
    expect(denormalizeDocument(mutableDoc)).toMatchObject(expectedRootNode);
    expect(denormalizeDocument(mutableDoc.updatedDocument)).toMatchObject(
      expectedRootNode
    );
    const replayMutableDoc = mutableDocument(emptyDoc);
    replayMutableDoc.applyChanges(mutableDoc.changes);
    expect(denormalizeDocument(replayMutableDoc)).toMatchObject(
      expectedRootNode
    );
    expect(denormalizeDocument(replayMutableDoc.updatedDocument)).toMatchObject(
      expectedRootNode
    );
  });

  test('Added node, its child and modified parent - test the paths', () => {
    const emptyDoc = emptyTestDocument();
    const mutableDoc = mutableDocument(emptyDoc);
    mutableDoc.insertElement({
      position: {field: 'children', index: 0},
      parent: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        isChecked: false,
        text: 'firstNode'
      }
    });
    mutableDoc.insertElement({
      position: {field: 'children', index: 0},
      parent: [{field: 'children', index: 0}],
      element: {
        __typename: 'Node',
        _id: 'Node2',
        isChecked: true,
        text: 'secondNode'
      }
    });
    expect(mutableDoc.pathForElementWithId('Root', 1)).toEqual([]);
    expect(mutableDoc.pathForElementWithId('Node', 'Node1')).toEqual([
      {
        field: 'children',
        index: 0
      }
    ]);
    expect(mutableDoc.pathForElementWithId('Node', 'Node2')).toEqual([
      {field: 'children', index: 0},
      {field: 'children', index: 0}
    ]);
  });

  test('Added node, its child and modified parent - hasMappedElement', () => {
    const emptyDoc = emptyTestDocument();
    const mutableDoc = mutableDocument(emptyDoc);
    mutableDoc.insertElement({
      position: {field: 'children', index: 0},
      parent: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        isChecked: false,
        text: 'firstNode',
        membersIds: []
      }
    });
    mutableDoc.insertElement({
      position: {field: 'children', index: 0},
      parent: [{field: 'children', index: 0}],
      element: {
        __typename: 'Node',
        _id: 'Node2',
        isChecked: true,
        text: 'secondNode',
        membersIds: []
      }
    });
    const modifiedDoc = mutableDoc.updatedDocument;
    // @ts-expect-error  test incorrect parameters
    expect(hasMappedElement(mutableDoc, false, {})).toBe(false);
    expect(hasMappedElement(mutableDoc, 'Root', 2)).toBe(false);
    expect(hasMappedElement(mutableDoc, 'Root', 1)).toBe(true);
    expect(hasMappedElement(mutableDoc, 'Node', 'Node1')).toBe(true);
    expect(hasMappedElement(mutableDoc, 'Node', 'Node2')).toBe(true);
    expect(hasMappedElement(mutableDoc, 'Node', 'Node3')).toBe(false);
    // @ts-expect-error test incorrect parameters
    expect(hasMappedElement(mutableDoc, 'Nod', 'Node1')).toBe(false);
    // @ts-expect-error test incorrect parameters
    expect(hasMappedElement(mutableDoc, 'Nodes', 'Node1')).toBe(false);
    // @ts-expect-error test incorrect parameters
    expect(hasMappedElement(modifiedDoc, false, {})).toBe(false);
    expect(hasMappedElement(modifiedDoc, 'Root', 2)).toBe(false);
    expect(hasMappedElement(modifiedDoc, 'Root', 1)).toBe(true);
    expect(hasMappedElement(modifiedDoc, 'Node', 'Node1')).toBe(true);
    expect(hasMappedElement(modifiedDoc, 'Node', 'Node2')).toBe(true);
    expect(hasMappedElement(modifiedDoc, 'Node', 'Node3')).toBe(false);
    // @ts-expect-error test incorrect name
    expect(hasMappedElement(modifiedDoc, 'Nod', 'Node1')).toBe(false);
    // @ts-expect-error test incorrect id
    expect(hasMappedElement(modifiedDoc, 'Nodes', 'Node1')).toBe(false);
  });
});
