import {creationDate, emptyTestDocument, INode, IRootNode, ITestDocElementsMap, removeParents} from './testTypes'
import {
  denormalizeDocument,
  hasMappedElement,
  HDocCommandType,
  IChangeElement,
  IDeleteElement,
  IInsertElement,
  IMoveElement,
  isParentedMutableMap,
  mutableDocument
} from '../src'

describe('Test the basic operations', () => {
  test('The empty document', () => {
    const emptyDoc = emptyTestDocument();
    const expectedNodeTree: IRootNode = {
      __typename: 'Root',
      _id: 1,
      createdAt: creationDate,
      name: 'root',
      children: [],
      parent: null
    };
    expect(denormalizeDocument(emptyDoc)).toMatchObject(expectedNodeTree);
  });

  test('Added one node', () => {
    const emptyDoc = emptyTestDocument();
    const expectedRootNode = removeParents({
      __typename: 'Root',
      _id: 1,
      createdAt: creationDate,
      name: 'root',
      children: [
        {
          __typename: 'Node',
          _id: 'Node1',
          children: [],
          parent: null,
          isChecked: false,
          text: 'firstNode'
        }
      ],
      parent: null
    });
    const addNodeCmd: IInsertElement<INode, ITestDocElementsMap> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parentPath: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        children: [],
        isChecked: false,
        text: 'firstNode'
      }
    };
    const mutableDoc = mutableDocument(emptyDoc);
    mutableDoc.insertElement(addNodeCmd);
    expect(denormalizeDocument(mutableDoc)).toMatchObject(expectedRootNode);
    expect(denormalizeDocument(mutableDoc.updatedDocument())).toMatchObject(
      expectedRootNode
    );
    const replayMutableDoc = mutableDocument(emptyDoc);
    replayMutableDoc.applyChanges(mutableDoc.changes);
    expect(denormalizeDocument(replayMutableDoc)).toMatchObject(
      expectedRootNode
    );
    expect(
      denormalizeDocument(replayMutableDoc.updatedDocument())
    ).toMatchObject(expectedRootNode);
  });

  test('Add and remove one node', () => {
    const emptyDoc = emptyTestDocument();
    const expectedRootNode = removeParents({
      __typename: 'Root',
      _id: 1,
      createdAt: creationDate,
      name: 'root',
      children: [],
      parent: null
    });
    const addNodeCmd: IInsertElement<INode, ITestDocElementsMap> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parentPath: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        children: [],
        isChecked: false,
        text: 'firstNode'
      }
    };
    const mutableDoc = mutableDocument(emptyDoc);
    mutableDoc.insertElement(addNodeCmd);
    const removeNodeCmd: IDeleteElement<ITestDocElementsMap> = {
      __typename: HDocCommandType.DELETE_ELEMENT,
      path: ['children', 0]
    };
    mutableDoc.deleteElement(removeNodeCmd);
    expect(denormalizeDocument(mutableDoc)).toMatchObject(expectedRootNode);
    expect(denormalizeDocument(mutableDoc.updatedDocument())).toMatchObject(
      expectedRootNode
    );
    const replayMutableDoc = mutableDocument(emptyDoc);
    replayMutableDoc.applyChanges(mutableDoc.changes);
    expect(denormalizeDocument(replayMutableDoc)).toMatchObject(
      expectedRootNode
    );
    expect(
      denormalizeDocument(replayMutableDoc.updatedDocument())
    ).toMatchObject(expectedRootNode);
  });

  test('Added node and its child', () => {
    const emptyDoc = emptyTestDocument();
    const expectedRootNode = removeParents({
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
              _id: 'Node2',
              parent: null
            }
          ],
          parent: null,
          isChecked: false,
          text: 'firstNode'
        }
      ],
      parent: null
    });
    const mutableDoc = mutableDocument(emptyDoc);
    const addNodeCmd: IInsertElement<INode, ITestDocElementsMap> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parentPath: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        children: [],
        isChecked: false,
        text: 'firstNode'
      }
    };
    mutableDoc.insertElement(addNodeCmd);
    const addNodeCmd2: IInsertElement<INode, ITestDocElementsMap> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parentPath: ['children', 0],
      element: {
        __typename: 'Node',
        _id: 'Node2',
        children: [],
        isChecked: true,
        text: 'secondNode'
      }
    };
    mutableDoc.insertElement(addNodeCmd2);
    expect(denormalizeDocument(mutableDoc)).toMatchObject(expectedRootNode);
    expect(denormalizeDocument(mutableDoc.updatedDocument())).toMatchObject(
      expectedRootNode
    );
    const replayMutableDoc = mutableDocument(emptyDoc);
    replayMutableDoc.applyChanges(mutableDoc.changes);
    expect(denormalizeDocument(replayMutableDoc)).toMatchObject(
      expectedRootNode
    );
    expect(
      denormalizeDocument(replayMutableDoc.updatedDocument())
    ).toMatchObject(expectedRootNode);
  });

  test('Added three nodes and move a child', () => {
    const emptyDoc = emptyTestDocument();
    const expectedRootNode = removeParents({
      __typename: 'Root',
      _id: 1,
      createdAt: creationDate,
      name: 'root',
      children: [
        {
          __typename: 'Node',
          _id: 'Node1',
          children: [],
          parent: null,
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
              _id: 'Node3',
              parent: null
            }
          ],
          parent: null,
          isChecked: false,
          text: 'secondNode'
        }
      ],
      parent: null
    });
    const mutableDoc = mutableDocument(emptyDoc);
    const addNodeCmd: IInsertElement<INode, ITestDocElementsMap> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parentPath: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        children: [],
        isChecked: false,
        text: 'firstNode'
      }
    };
    mutableDoc.insertElement(addNodeCmd);
    const addNodeCmd2: IInsertElement<INode, ITestDocElementsMap> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 1],
      parentPath: [],
      element: {
        __typename: 'Node',
        _id: 'Node2',
        children: [],
        isChecked: false,
        text: 'secondNode'
      }
    };
    mutableDoc.insertElement(addNodeCmd2);
    const addNodeCmd3: IInsertElement<INode, ITestDocElementsMap> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parentPath: ['children', 0],
      element: {
        __typename: 'Node',
        _id: 'Node3',
        children: [],
        isChecked: false,
        text: 'thirdNode'
      }
    };
    mutableDoc.insertElement(addNodeCmd3);
    const moveNode3Cmd: IMoveElement<ITestDocElementsMap, INode> = {
      __typename: HDocCommandType.MOVE_ELEMENT,
      fromPath: ['children', 0, 'children', 0],
      toParentPath: ['children', 1],
      toPosition: ['children', 0],
      changes: {
        __typename: 'Node',
        isChecked: true
      }
    };
    mutableDoc.moveElement(moveNode3Cmd);
    expect(denormalizeDocument(mutableDoc)).toMatchObject(expectedRootNode);
    expect(denormalizeDocument(mutableDoc.updatedDocument())).toMatchObject(
      expectedRootNode
    );
    const replayMutableDoc = mutableDocument(emptyDoc);
    replayMutableDoc.applyChanges(mutableDoc.changes);
    expect(denormalizeDocument(replayMutableDoc)).toMatchObject(
      expectedRootNode
    );
    expect(
      denormalizeDocument(replayMutableDoc.updatedDocument())
    ).toMatchObject(expectedRootNode);
  });

  test('Added node, its child and modified parent', () => {
    const emptyDoc = emptyTestDocument();
    const expectedRootNode = removeParents({
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
              _id: 'Node2',
              parent: null
            }
          ],
          parent: null,
          isChecked: true,
          text: 'firstNode'
        }
      ],
      parent: null
    });
    const mutableDoc = mutableDocument(emptyDoc);
    const addNodeCmd: IInsertElement<INode, ITestDocElementsMap> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parentPath: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        children: [],
        isChecked: false,
        text: 'firstNode'
      }
    };
    mutableDoc.insertElement(addNodeCmd);
    const addNodeCmd2: IInsertElement<INode, ITestDocElementsMap> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parentPath: ['children', 0],
      element: {
        __typename: 'Node',
        _id: 'Node2',
        children: [],
        isChecked: true,
        text: 'secondNode'
      }
    };
    mutableDoc.insertElement(addNodeCmd2);
    const updateCmd: IChangeElement<ITestDocElementsMap, INode> = {
      __typename: HDocCommandType.CHANGE_ELEMENT,
      path: ['children', 0],
      changes: {
        __typename: 'Node',
        isChecked: true
      }
    };
    mutableDoc.changeElement(updateCmd);
    expect(denormalizeDocument(mutableDoc)).toMatchObject(expectedRootNode);
    expect(denormalizeDocument(mutableDoc.updatedDocument())).toMatchObject(
      expectedRootNode
    );
  });

  test('Added node, its child and modified parent - replayed', () => {
    const emptyDoc = emptyTestDocument();
    const expectedRootNode = removeParents({
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
              _id: 'Node2',
              parent: null
            }
          ],
          parent: null,
          isChecked: true,
          text: 'firstNode'
        }
      ],
      parent: null
    });
    const mutableDoc = mutableDocument(emptyDoc);
    const addNodeCmd: IInsertElement<INode, ITestDocElementsMap> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parentPath: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        children: [],
        isChecked: false,
        text: 'firstNode'
      }
    };
    mutableDoc.insertElement(addNodeCmd);
    const addNodeCmd2: IInsertElement<INode, ITestDocElementsMap> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parentPath: ['children', 0],
      element: {
        __typename: 'Node',
        _id: 'Node2',
        children: [],
        isChecked: true,
        text: 'secondNode'
      }
    };
    mutableDoc.insertElement(addNodeCmd2);
    const updateCmd: IChangeElement<ITestDocElementsMap, INode> = {
      __typename: HDocCommandType.CHANGE_ELEMENT,
      path: ['children', 0],
      changes: {
        __typename: 'Node',
        isChecked: true
      }
    };
    mutableDoc.changeElement(updateCmd);
    expect(denormalizeDocument(mutableDoc)).toMatchObject(expectedRootNode);
    expect(denormalizeDocument(mutableDoc.updatedDocument())).toMatchObject(
      expectedRootNode
    );
    const replayMutableDoc = mutableDocument(emptyDoc);
    replayMutableDoc.applyChanges(mutableDoc.changes);
    expect(denormalizeDocument(replayMutableDoc)).toMatchObject(
      expectedRootNode
    );
    expect(
      denormalizeDocument(replayMutableDoc.updatedDocument())
    ).toMatchObject(expectedRootNode);
  });

  test('Added node, its child and modified parent - test the paths', () => {
    const emptyDoc = emptyTestDocument();
    const expectedRootNode = removeParents({
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
              _id: 'Node2',
              parent: null
            }
          ],
          parent: null,
          isChecked: true,
          text: 'firstNode'
        }
      ],
      parent: null
    });
    const mutableDoc = mutableDocument(emptyDoc);
    const addNodeCmd: IInsertElement<INode, ITestDocElementsMap> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parentPath: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        children: [],
        isChecked: false,
        text: 'firstNode'
      }
    };
    mutableDoc.insertElement(addNodeCmd);
    const addNodeCmd2: IInsertElement<INode, ITestDocElementsMap> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parentPath: ['children', 0],
      element: {
        __typename: 'Node',
        _id: 'Node2',
        children: [],
        isChecked: true,
        text: 'secondNode'
      }
    };
    mutableDoc.insertElement(addNodeCmd2);
    const updateCmd: IChangeElement<ITestDocElementsMap, INode> = {
      __typename: HDocCommandType.CHANGE_ELEMENT,
      path: ['children', 0],
      changes: {
        __typename: 'Node',
        isChecked: true
      }
    };
    expect(mutableDoc.pathForElementWithId('Root', 1)).toEqual([]);
    expect(mutableDoc.pathForElementWithId('Node', 'Node1')).toEqual([
      'children',
      0
    ]);
    expect(mutableDoc.pathForElementWithId('Node', 'Node2')).toEqual([
      'children',
      0,
      'children',
      0
    ]);
  });

  test('Added node, its child and modified parent - hasMappedElement', () => {
    const emptyDoc = emptyTestDocument();
    const expectedRootNode = removeParents({
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
              _id: 'Node2',
              parent: null
            }
          ],
          parent: null,
          isChecked: true,
          text: 'firstNode'
        }
      ],
      parent: null
    });
    const mutableDoc = mutableDocument(emptyDoc);
    const addNodeCmd: IInsertElement<INode, ITestDocElementsMap> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parentPath: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        children: [],
        isChecked: false,
        text: 'firstNode'
      }
    };
    mutableDoc.insertElement(addNodeCmd);
    const addNodeCmd2: IInsertElement<INode, ITestDocElementsMap> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parentPath: ['children', 0],
      element: {
        __typename: 'Node',
        _id: 'Node2',
        children: [],
        isChecked: true,
        text: 'secondNode'
      }
    };
    mutableDoc.insertElement(addNodeCmd2);
    const updateCmd: IChangeElement<ITestDocElementsMap, INode> = {
      __typename: HDocCommandType.CHANGE_ELEMENT,
      path: ['children', 0],
      changes: {
        __typename: 'Node',
        isChecked: true
      }
    };
    const modifiedDoc = mutableDoc.updatedDocument();
    // @ts-expect-error
    expect(hasMappedElement(mutableDoc.maps, false, {})).toBe(false);
    expect(hasMappedElement(mutableDoc.maps, 'Root', 2)).toBe(false);
    expect(hasMappedElement(mutableDoc.maps, 'Root', 1)).toBe(true);
    expect(hasMappedElement(mutableDoc.maps, 'Node', 'Node1')).toBe(true);
    expect(hasMappedElement(mutableDoc.maps, 'Node', 'Node2')).toBe(true);
    expect(hasMappedElement(mutableDoc.maps, 'Node', 'Node3')).toBe(false);
    // @ts-expect-error
    expect(hasMappedElement(mutableDoc.maps, 'Nod', 'Node1')).toBe(false);
    // @ts-expect-error
    expect(hasMappedElement(mutableDoc.maps, 'Nodes', 'Node1')).toBe(false);
    // @ts-expect-error
    expect(hasMappedElement(modifiedDoc.maps, false, {})).toBe(false);
    expect(hasMappedElement(modifiedDoc.maps, 'Root', 2)).toBe(false);
    expect(hasMappedElement(modifiedDoc.maps, 'Root', 1)).toBe(true);
    expect(hasMappedElement(modifiedDoc.maps, 'Node', 'Node1')).toBe(true);
    expect(hasMappedElement(modifiedDoc.maps, 'Node', 'Node2')).toBe(true);
    expect(hasMappedElement(modifiedDoc.maps, 'Node', 'Node3')).toBe(false);
    // @ts-expect-error
    expect(hasMappedElement(modifiedDoc.maps, 'Nod', 'Node1')).toBe(false);
    // @ts-expect-error
    expect(hasMappedElement(modifiedDoc.maps, 'Nodes', 'Node1')).toBe(false);

    expect(isParentedMutableMap(modifiedDoc)).toBe(false);
    expect(isParentedMutableMap(undefined)).toBe(false);
    expect(isParentedMutableMap(modifiedDoc.maps)).toBe(false);
    expect(isParentedMutableMap(modifiedDoc.maps.Node)).toBe(false);
    expect(isParentedMutableMap(modifiedDoc.maps.Root)).toBe(false);
    expect(isParentedMutableMap(mutableDoc.maps)).toBe(false);
    expect(isParentedMutableMap(mutableDoc.maps)).toBe(false);
    expect(isParentedMutableMap(mutableDoc.maps.Node)).toBe(true);
    expect(isParentedMutableMap(mutableDoc.maps.Root)).toBe(true);
  });
});
