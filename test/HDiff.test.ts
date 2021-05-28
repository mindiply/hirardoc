import {isEqual} from 'lodash';
import {
  ArrayKeepElement,
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
import {applyArrayDiff, diffArray} from '../src/HDiff';

describe('Diff between versions of the same tree', () => {
  test('Diff between empty trees', () => {
    const a = emptyTestDocument();
    const b = emptyTestDocument();
    expect(diff(a, b)).toEqual([]);
  });

  test('Diff single insertion command', () => {
    const a = emptyTestDocument();
    const addNodeCmd: IInsertElement<
      ITestDocElementsMap,
      keyof ITestDocElementsMap,
      INode
    > = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parent: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        children: [],
        isChecked: false,
        text: 'firstNode',
        membersIds: []
      }
    };
    const mutableDoc = mutableDocument(a);
    mutableDoc.insertElement(addNodeCmd);
    const b = mutableDoc.updatedDocument();
    const expectedDiff: HDocOperation<
      ITestDocElementsMap,
      keyof ITestDocElementsMap,
      INode
    >[] = [
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        parent: {
          __typename: 'Root',
          _id: 1
        },
        position: ['children', 0],
        element: {
          __typename: 'Node',
          _id: 'Node1',
          children: [],
          isChecked: false,
          text: 'firstNode',
          membersIds: []
        }
      }
    ];
    expect(diff(a, b)).toMatchObject(expectedDiff);
  });

  test('Diff single insertion command after another insertion', () => {
    let a = emptyTestDocument();
    const addNodeCmd: IInsertElement<
      ITestDocElementsMap,
      keyof ITestDocElementsMap,
      INode
    > = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parent: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        children: [],
        isChecked: false,
        text: 'firstNode',
        membersIds: []
      }
    };
    let mutableDoc = mutableDocument(a);
    mutableDoc.insertElement(addNodeCmd);
    a = mutableDoc.updatedDocument();
    mutableDoc = mutableDocument(a);
    const addNodeCmd2: IInsertElement<
      ITestDocElementsMap,
      keyof ITestDocElementsMap,
      INode
    > = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parent: ['children', 0],
      element: {
        __typename: 'Node',
        _id: 'Node2',
        children: [],
        isChecked: false,
        text: 'secondNode',
        membersIds: []
      }
    };
    mutableDoc.insertElement(addNodeCmd2);
    const b = mutableDoc.updatedDocument();
    const expectedDiff: HDocOperation<
      ITestDocElementsMap,
      keyof ITestDocElementsMap,
      INode
    >[] = [
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        parent: {
          __typename: 'Node',
          _id: 'Node1'
        },
        position: ['children', 0],
        element: {
          __typename: 'Node',
          _id: 'Node2',
          children: [],
          isChecked: false,
          text: 'secondNode',
          membersIds: []
        }
      }
    ];
    expect(diff(a, b)).toMatchObject(expectedDiff);
  });

  test('Move of child between parent and inserted parent', () => {
    let a = emptyTestDocument();
    let mutableDoc = mutableDocument(a);
    const addNodeCmd: IInsertElement<
      ITestDocElementsMap,
      keyof ITestDocElementsMap,
      INode
    > = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parent: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        children: [],
        isChecked: false,
        text: 'firstNode',
        membersIds: []
      }
    };
    const addNodeCmd2: IInsertElement<
      ITestDocElementsMap,
      keyof ITestDocElementsMap,
      INode
    > = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parent: ['children', 0],
      element: {
        __typename: 'Node',
        _id: 'Node2',
        children: [],
        isChecked: false,
        text: 'secondNode',
        membersIds: []
      }
    };
    mutableDoc.insertElement(addNodeCmd);
    mutableDoc.insertElement(addNodeCmd2);

    a = mutableDoc.updatedDocument();
    mutableDoc = mutableDocument(a);

    const addNodeCmd3: IInsertElement<
      ITestDocElementsMap,
      keyof ITestDocElementsMap,
      INode
    > = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parent: [],
      element: {
        __typename: 'Node',
        _id: 'Node3',
        children: [],
        isChecked: false,
        text: 'thirdNode',
        membersIds: []
      }
    };
    mutableDoc.insertElement(addNodeCmd3);

    const moveElementCmd: IMoveElement<
      ITestDocElementsMap,
      keyof ITestDocElementsMap,
      INode
    > = {
      __typename: HDocCommandType.MOVE_ELEMENT,
      element: ['children', 1, 'children', 0],
      toParent: ['children', 0],
      toPosition: ['children', 0],
      changes: {
        __typename: 'Node',
        isChecked: true,
        text: 'second node'
      }
    };
    mutableDoc.moveElement(moveElementCmd);
    const b = mutableDoc.updatedDocument();
    const expectedDiff: HDocOperation<
      ITestDocElementsMap,
      keyof ITestDocElementsMap,
      INode
    >[] = [
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parent: {
          __typename: 'Root',
          _id: 1
        },
        element: {
          __typename: 'Node',
          _id: 'Node3',
          children: [],
          isChecked: false,
          text: 'thirdNode',
          membersIds: []
        }
      },
      {
        __typename: HDocCommandType.MOVE_ELEMENT,
        element: {
          __typename: 'Node',
          _id: 'Node2'
        },
        toParent: {
          __typename: 'Node',
          _id: 'Node3'
        },
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
    const addNodeCmd: IInsertElement<
      ITestDocElementsMap,
      keyof ITestDocElementsMap,
      INode
    > = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parent: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        children: [],
        isChecked: false,
        text: 'firstNode',
        membersIds: []
      }
    };
    let mutableDoc = mutableDocument(a);
    mutableDoc.insertElement(addNodeCmd);
    const addNodeCmd2: IInsertElement<
      ITestDocElementsMap,
      keyof ITestDocElementsMap,
      INode
    > = {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parent: ['children', 0],
      element: {
        __typename: 'Node',
        _id: 'Node2',
        children: [],
        isChecked: false,
        text: 'secondNode',
        membersIds: []
      }
    };
    mutableDoc.insertElement(addNodeCmd2);
    a = mutableDoc.updatedDocument();
    mutableDoc = mutableDocument(a);
    const deleteElementCmd: IDeleteElement<ITestDocElementsMap> = {
      __typename: HDocCommandType.DELETE_ELEMENT,
      element: ['children', 0, 'children', 0]
    };
    mutableDoc.deleteElement(deleteElementCmd);
    const changeElementCmd: IChangeElement<
      ITestDocElementsMap,
      keyof ITestDocElementsMap,
      INode
    > = {
      __typename: HDocCommandType.CHANGE_ELEMENT,
      element: ['children', 0],
      changes: {
        __typename: 'Node',
        isChecked: true
      }
    };
    mutableDoc.changeElement(changeElementCmd);
    const b = mutableDoc.updatedDocument();
    const expectedDiff: HDocOperation<
      ITestDocElementsMap,
      keyof ITestDocElementsMap,
      INode
    >[] = [
      {
        __typename: HDocCommandType.CHANGE_ELEMENT,
        element: {
          __typename: 'Node',
          _id: 'Node1'
        },
        changes: {
          __typename: 'Node',
          isChecked: true
        }
      },
      {
        __typename: HDocCommandType.DELETE_ELEMENT,
        element: {
          __typename: 'Node',
          _id: 'Node2'
        }
      }
    ];
    expect(diff(a, b)).toMatchObject(expectedDiff);
  });
});

describe('Diffing arrays', () => {
  describe('Normal equals function', () => {
    test('No changes on empty array', () => {
      const res = diffArray([], []);
      expect(res.changes.length).toBe(0);
      expect(res.elementChanges.length).toBe(0);
    });

    test('No changes on array of identical values', () => {
      const res = diffArray([1, 'hello', true], [1, 'hello', true]);
      expect(res.changes.length).toBe(0);
      expect(res.elementChanges.length).toBe(3);
      for (let i = 0; i < res.elementChanges.length; i++) {
        const elementChange = res.elementChanges[i];
        const expectedObj: ArrayKeepElement = {
          __typename: 'KeepElement',
          elIndex: i
        };
        expect(elementChange).toMatchObject(expectedObj);
      }
    });

    test('Adding elements', () => {
      const res = diffArray(
        [1, 'hello', true],
        [false, 1, 2, 'hello', true, 'ciao']
      );
      expect(res.changes.length).toBe(3);
      expect(res.changes[0]).toMatchObject({
        __typename: 'AddElement',
        element: false,
        afterElIndex: null
      });
      expect(res.changes[1]).toMatchObject({
        __typename: 'AddElement',
        element: 2,
        afterElIndex: 0
      });
      expect(res.changes[2]).toMatchObject({
        __typename: 'AddElement',
        element: 'ciao',
        afterElIndex: 2
      });
      expect(res.elementChanges.length).toBe(3);
      expect(res.elementChanges[0]).toMatchObject({
        __typename: 'KeepElement',
        elIndex: 0
      });
      expect(res.elementChanges[1]).toMatchObject({
        __typename: 'KeepElement',
        elIndex: 1
      });
      expect(res.elementChanges[2]).toMatchObject({
        __typename: 'KeepElement',
        elIndex: 2
      });
    });

    test('Moving elements', () => {
      const res = diffArray([1, 'hello', true], [true, 'hello', 1]);
      expect(res.changes.length).toBe(2);
      expect(res.changes[0]).toMatchObject({
        __typename: 'ArrayMoveElementLeft',
        afterElIndex: null,
        elIndex: 2
      });
      expect(res.changes[1]).toMatchObject({
        __typename: 'ArrayMoveElementLeft',
        afterElIndex: 2,
        elIndex: 1
      });
      expect(res.elementChanges.length).toBe(3);
      expect(res.elementChanges[0]).toMatchObject({
        __typename: 'KeepElement',
        elIndex: 0
      });
      expect(res.elementChanges[1]).toMatchObject(res.changes[1]);
      expect(res.elementChanges[2]).toMatchObject(res.changes[0]);
    });

    test('deleting elements', () => {
      const res = diffArray([1, 'hello', true], ['hello']);
      expect(res.changes.length).toBe(2);
      expect(res.changes[0]).toMatchObject({
        __typename: 'DeleteElement',
        elIndex: 0
      });
      expect(res.changes[1]).toMatchObject({
        __typename: 'DeleteElement',
        elIndex: 2
      });
      expect(res.elementChanges.length).toBe(3);
      expect(res.elementChanges[0]).toMatchObject(res.changes[0]);
      expect(res.elementChanges[1]).toMatchObject({
        __typename: 'KeepElement',
        elIndex: 1
      });
      expect(res.elementChanges[2]).toMatchObject(res.changes[1]);
    });
  });

  describe('Deep equals function', () => {
    test('No changes on empty array', () => {
      const res = diffArray([], [], isEqual);
      expect(res.changes.length).toBe(0);
      expect(res.elementChanges.length).toBe(0);
    });

    test('No changes on array of identical values', () => {
      const res = diffArray(
        [
          {n: 1, s: 'hello', b: true},
          {n: 2, s: 'world', b: true},
          {n: 3, s: '', b: false}
        ],
        [
          {n: 1, s: 'hello', b: true},
          {n: 2, s: 'world', b: true},
          {n: 3, s: '', b: false}
        ],
        isEqual
      );
      expect(res.changes.length).toBe(0);
      expect(res.elementChanges.length).toBe(3);
      for (let i = 0; i < res.elementChanges.length; i++) {
        const elementChange = res.elementChanges[i];
        expect(elementChange).toMatchObject({
          __typename: 'KeepElement',
          elIndex: i
        });
      }
    });

    test('Adding elements', () => {
      const res = diffArray(
        [
          {n: 1, s: 'hello', b: true},
          {n: 2, s: 'world', b: true},
          {n: 3, s: '', b: false}
        ],
        [
          {n: 4, s: 'maybe', b: false},
          {n: 1, s: 'hello', b: true},
          {n: 2, s: 'world', b: true},
          {n: 5, s: 'sure', b: true},
          {n: 3, s: '', b: false},
          {n: 6, s: '', b: false},
          {n: 6, s: '', b: false}
        ],
        isEqual
      );
      expect(res.changes.length).toBe(4);
      expect(res.changes[0]).toMatchObject({
        __typename: 'AddElement',
        element: {n: 4, s: 'maybe', b: false},
        afterElIndex: null
      });
      expect(res.changes[1]).toMatchObject({
        __typename: 'AddElement',
        element: {n: 5, s: 'sure', b: true},
        afterElIndex: 1
      });
      expect(res.changes[2]).toMatchObject({
        __typename: 'AddElement',
        element: {n: 6, s: '', b: false},
        afterElIndex: 2
      });
      expect(res.changes[3]).toMatchObject({
        __typename: 'AddElement',
        element: {n: 6, s: '', b: false},
        afterElIndex: 5
      });
      expect(res.elementChanges.length).toBe(3);
      for (let i = 0; i < res.elementChanges.length; i++) {
        const elementChange = res.elementChanges[i];
        expect(elementChange).toMatchObject({
          __typename: 'KeepElement',
          elIndex: i
        });
      }
    });

    test('Moving elements', () => {
      const res = diffArray(
        [
          {n: 1, s: 'hello', b: true},
          {n: 2, s: 'world', b: true},
          {n: 3, s: '', b: false}
        ],
        [
          {n: 3, s: '', b: false},
          {n: 2, s: 'world', b: true},
          {n: 1, s: 'hello', b: true}
        ],
        isEqual
      );
      expect(res.changes.length).toBe(2);
      expect(res.changes[0]).toMatchObject({
        __typename: 'ArrayMoveElementLeft',
        elIndex: 2,
        afterElIndex: null
      });
      expect(res.changes[1]).toMatchObject({
        __typename: 'ArrayMoveElementLeft',
        afterElIndex: 2,
        elIndex: 1
      });
      expect(res.elementChanges.length).toBe(3);
      expect(res.elementChanges[0]).toMatchObject({
        __typename: 'KeepElement',
        elIndex: 0
      });
      expect(res.elementChanges[1]).toMatchObject(res.changes[1]);
      expect(res.elementChanges[2]).toMatchObject(res.changes[0]);
    });

    test('deleting elements', () => {
      const res = diffArray(
        [
          {n: 1, s: 'hello', b: true},
          {n: 2, s: 'world', b: true},
          {n: 3, s: '', b: false}
        ],
        [{n: 2, s: 'world', b: true}],
        isEqual
      );
      expect(res.changes.length).toBe(2);
      expect(res.changes[0]).toMatchObject({
        __typename: 'DeleteElement',
        elIndex: 0
      });
      expect(res.changes[1]).toMatchObject({
        __typename: 'DeleteElement',
        elIndex: 2
      });
      expect(res.elementChanges.length).toBe(3);
      expect(res.elementChanges[0]).toMatchObject(res.changes[0]);
      expect(res.elementChanges[1]).toMatchObject({
        __typename: 'KeepElement',
        elIndex: 1
      });
      expect(res.elementChanges[2]).toMatchObject(res.changes[1]);
    });

    test('Mix of changes', () => {
      const res = diffArray(
        [
          {n: 1, s: 'hello', b: true},
          {n: 2, s: 'world', b: true},
          {n: 3, s: '', b: false}
        ],
        [
          {n: 4, s: 'j', b: false},
          {n: 3, s: '', b: false},
          {n: 5, s: 'j', b: false},
          {n: 2, s: 'world', b: true},
          {n: 6, s: 'j', b: false}
        ],
        isEqual
      );
      expect(res.changes.length).toBe(5);
      expect(res.changes[0]).toMatchObject({
        __typename: 'DeleteElement',
        elIndex: 0
      });
      expect(res.changes[1]).toMatchObject({
        __typename: 'ArrayMoveElementLeft',
        afterElIndex: null,
        elIndex: 2
      });
      expect(res.changes[2]).toMatchObject({
        __typename: 'AddElement',
        element: {n: 4, s: 'j', b: false},
        afterElIndex: null
      });
      expect(res.changes[3]).toMatchObject({
        __typename: 'AddElement',
        element: {n: 5, s: 'j', b: false},
        afterElIndex: 2
      });
      expect(res.changes[4]).toMatchObject({
        __typename: 'AddElement',
        element: {n: 6, s: 'j', b: false},
        afterElIndex: 1
      });
      expect(res.elementChanges.length).toBe(3);
      expect(res.elementChanges[0]).toMatchObject(res.changes[0]);
      expect(res.elementChanges[1]).toMatchObject({
        __typename: 'KeepElement',
        elIndex: 1
      });
      expect(res.elementChanges[2]).toMatchObject(res.changes[1]);
    });
  });
});

describe('applyArrayDiff', () => {
  test('No changes to apply', () => {
    const diffObj = diffArray(
      [
        {n: 1, s: 'hello', b: true},
        {n: 2, s: 'world', b: true},
        {n: 3, s: '', b: false}
      ],
      [
        {n: 1, s: 'hello', b: true},
        {n: 2, s: 'world', b: true},
        {n: 3, s: '', b: false}
      ],
      isEqual
    );
    expect(
      applyArrayDiff(
        [
          {n: 1, s: 'hello', b: true},
          {n: 2, s: 'world', b: true},
          {n: 3, s: '', b: false}
        ],
        diffObj.changes
      )
    ).toMatchObject([
      {n: 1, s: 'hello', b: true},
      {n: 2, s: 'world', b: true},
      {n: 3, s: '', b: false}
    ]);
  });

  test('Various changes', () => {
    const diffObj = diffArray(
      [
        {n: 1, s: 'hello', b: true},
        {n: 2, s: 'world', b: true},
        {n: 3, s: '', b: false}
      ],
      [
        {n: 4, s: 'j', b: false},
        {n: 3, s: '', b: false},
        {n: 5, s: 'j', b: false},
        {n: 2, s: 'world', b: true},
        {n: 6, s: 'j', b: false}
      ],
      isEqual
    );
    expect(
      applyArrayDiff(
        [
          {n: 1, s: 'hello', b: true},
          {n: 2, s: 'world', b: true},
          {n: 3, s: '', b: false}
        ],
        diffObj.changes
      )
    ).toMatchObject([
      {n: 4, s: 'j', b: false},
      {n: 3, s: '', b: false},
      {n: 5, s: 'j', b: false},
      {n: 2, s: 'world', b: true},
      {n: 6, s: 'j', b: false}
    ]);
  });

  test('Move elements to the right', () => {
    const diffObj = diffArray(
      [
        {n: 1, s: 'hello', b: true},
        {n: 2, s: 'world', b: true},
        {n: 3, s: '', b: false}
      ],
      [
        {n: 4, s: 'j', b: false},
        {n: 3, s: '', b: false},
        {n: 5, s: 'j', b: false},
        {n: 2, s: 'world', b: true},
        {n: 1, s: 'hello', b: true}
      ],
      isEqual
    );
    expect(
      applyArrayDiff(
        [
          {n: 1, s: 'hello', b: true},
          {n: 2, s: 'world', b: true},
          {n: 3, s: '', b: false}
        ],
        diffObj.changes
      )
    ).toMatchObject([
      {n: 4, s: 'j', b: false},
      {n: 3, s: '', b: false},
      {n: 5, s: 'j', b: false},
      {n: 2, s: 'world', b: true},
      {n: 1, s: 'hello', b: true}
    ]);
  });

  test('Swapping the order', () => {
    const diffObj = diffArray(
      [
        {n: 1, s: 'hello', b: true},
        {n: 2, s: 'world', b: true},
        {n: 3, s: '', b: false}
      ],
      [
        {n: 3, s: '', b: false},
        {n: 2, s: 'world', b: true},
        {n: 1, s: 'hello', b: true}
      ],
      isEqual
    );
    expect(
      applyArrayDiff(
        [
          {n: 1, s: 'hello', b: true},
          {n: 2, s: 'world', b: true},
          {n: 3, s: '', b: false}
        ],
        diffObj.changes
      )
    ).toMatchObject([
      {n: 3, s: '', b: false},
      {n: 2, s: 'world', b: true},
      {n: 1, s: 'hello', b: true}
    ]);
  });
});
