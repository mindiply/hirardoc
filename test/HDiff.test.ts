import {
  diff,
  HDocCommandType,
  HDocOperation,
  IChangeElement,
  IDeleteElement,
  IInsertElement,
  IMoveElement,
  mutableDocument
} from '../src';
import {emptyTestDocument, INode, ITestDocElementsMap} from './testTypes';

describe('Diff between versions of the same tree', () => {
  test('Diff between empty trees', () => {
    const a = emptyTestDocument();
    const b = emptyTestDocument();
    expect(diff(a, b)).toEqual([]);
  });

  test('Diff single insertion command', () => {
    const a = emptyTestDocument();
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
    const mutableDoc = mutableDocument(a);
    mutableDoc.insertElement(addNodeCmd);
    const b = mutableDoc.updatedDocument();
    const expectedDiff: HDocOperation<ITestDocElementsMap, INode>[] = [
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        parentPath: [],
        position: ['children', 0],
        element: {
          __typename: 'Node',
          _id: 'Node1',
          children: [],
          isChecked: false,
          text: 'firstNode'
        }
      }
    ];
    expect(diff(a, b)).toMatchObject(expectedDiff);
  });

  test('Diff single insertion command after another insertion', () => {
    let a = emptyTestDocument();
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
    let mutableDoc = mutableDocument(a);
    mutableDoc.insertElement(addNodeCmd);
    a = mutableDoc.updatedDocument();
    mutableDoc = mutableDocument(a);
    const addNodeCmd2: IInsertElement<INode, ITestDocElementsMap> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parentPath: ['children', 0],
      element: {
        __typename: 'Node',
        _id: 'Node2',
        children: [],
        isChecked: false,
        text: 'secondNode'
      }
    };
    mutableDoc.insertElement(addNodeCmd2);
    const b = mutableDoc.updatedDocument();
    const expectedDiff: HDocOperation<ITestDocElementsMap, INode>[] = [
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        parentPath: ['children', 0],
        position: ['children', 0],
        element: {
          __typename: 'Node',
          _id: 'Node2',
          children: [],
          isChecked: false,
          text: 'secondNode'
        }
      }
    ];
    expect(diff(a, b)).toMatchObject(expectedDiff);
  });

  test('Move of child between parent and inserted parent', () => {
    let a = emptyTestDocument();
    let mutableDoc = mutableDocument(a);
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
    const addNodeCmd2: IInsertElement<INode, ITestDocElementsMap> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parentPath: ['children', 0],
      element: {
        __typename: 'Node',
        _id: 'Node2',
        children: [],
        isChecked: false,
        text: 'secondNode'
      }
    };
    mutableDoc.insertElement(addNodeCmd);
    mutableDoc.insertElement(addNodeCmd2);

    a = mutableDoc.updatedDocument();
    mutableDoc = mutableDocument(a);

    const addNodeCmd3: IInsertElement<INode, ITestDocElementsMap> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parentPath: [],
      element: {
        __typename: 'Node',
        _id: 'Node3',
        children: [],
        isChecked: false,
        text: 'thirdNode'
      }
    };
    mutableDoc.insertElement(addNodeCmd3);

    const moveElementCmd: IMoveElement<ITestDocElementsMap, INode> = {
      __typename: HDocCommandType.MOVE_ELEMENT,
      fromPath: ['children', 1, 'children', 0],
      toParentPath: ['children', 0],
      toPosition: ['children', 0],
      changes: {
        __typename: 'Node',
        isChecked: true,
        text: 'second node'
      }
    };
    mutableDoc.moveElement(moveElementCmd);
    const b = mutableDoc.updatedDocument();
    const expectedDiff: HDocOperation<ITestDocElementsMap, INode>[] = [
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parentPath: [],
        element: {
          __typename: 'Node',
          _id: 'Node3',
          children: [],
          isChecked: false,
          text: 'thirdNode'
        }
      },
      {
        __typename: HDocCommandType.MOVE_ELEMENT,
        fromPath: ['children', 1, 'children', 0],
        toParentPath: ['children', 0],
        toPosition: ['children', 0],
        changes: {
          __typename: 'Node',
          isChecked: true,
          text: 'second node'
        }
      }
    ];
    const abDiff = diff(a, b);
    expect(abDiff).toMatchObject(expectedDiff);
  });

  test('Change of parent and deletion of a child node', () => {
    let a = emptyTestDocument();
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
    let mutableDoc = mutableDocument(a);
    mutableDoc.insertElement(addNodeCmd);
    const addNodeCmd2: IInsertElement<INode, ITestDocElementsMap> = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parentPath: ['children', 0],
      element: {
        __typename: 'Node',
        _id: 'Node2',
        children: [],
        isChecked: false,
        text: 'secondNode'
      }
    };
    mutableDoc.insertElement(addNodeCmd2);
    a = mutableDoc.updatedDocument();
    mutableDoc = mutableDocument(a);
    const deleteElementCmd: IDeleteElement<ITestDocElementsMap> = {
      __typename: HDocCommandType.DELETE_ELEMENT,
      path: ['children', 0, 'children', 0]
    };
    mutableDoc.deleteElement(deleteElementCmd);
    const changeElementCmd: IChangeElement<ITestDocElementsMap, INode> = {
      __typename: HDocCommandType.CHANGE_ELEMENT,
      path: ['children', 0],
      changes: {
        __typename: 'Node',
        isChecked: true
      }
    };
    mutableDoc.changeElement(changeElementCmd);
    const b = mutableDoc.updatedDocument();
    const expectedDiff: HDocOperation<ITestDocElementsMap, INode>[] = [
      {
        __typename: HDocCommandType.CHANGE_ELEMENT,
        path: ['children', 0],
        changes: {
          __typename: 'Node',
          isChecked: true
        }
      },
      {
        __typename: HDocCommandType.DELETE_ELEMENT,
        path: ['children', 0, 'children', 0]
      }
    ];
    expect(diff(a, b)).toMatchObject(expectedDiff);
  });
});
