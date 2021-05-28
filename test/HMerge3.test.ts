import {isEqual} from 'lodash';
import {
  creationDate,
  emptyTestDocument,
  IRootNode,
  ITestDocElementsMap,
  removeParents
} from './testTypes';
import {
  docReducer,
  cloneNormalizedDocument,
  ConflictsMap,
  denormalizeDocument,
  diff,
  HDocCommandType,
  MergeStatus,
  threeWayMerge,
  threeWayMergeArray
} from '../src';

describe('Merging arrays', () => {
  test('No changes in either branch, keep as is', () => {
    const base = ['a', 'b', 'c', 'd', 'e', 'f'];
    const mine = ['a', 'b', 'c', 'd', 'e', 'f'];
    const their = ['a', 'b', 'c', 'd', 'e', 'f'];
    const merged = threeWayMergeArray(base, mine, their);
    expect(merged).toEqual(base);
  });

  test('Same simple changes on both branches', () => {
    const base = ['a', 'b', 'c', 'd', 'e', 'f'];
    const mine = ['d', 'a', 'c', 'b', 'e'];
    const their = ['d', 'a', 'c', 'b', 'e'];
    const merged = threeWayMergeArray(base, mine, their);
    expect(merged).toEqual(their);
  });

  test('Parallel non conflicting additions', () => {
    const base = ['a', 'b', 'c', 'd', 'e', 'f'];
    const mine = ['g', 'a', 'b', 'h', 'c', 'd', 'e', 'f'];
    const their = ['f', 'a', 'i', 'b', 'c', 'd', 'e', 'f'];
    const merged = threeWayMergeArray(base, mine, their);
    expect(merged).toEqual(['g', 'f', 'a', 'i', 'b', 'h', 'c', 'd', 'e', 'f']);
  });

  test('Parallel non conflicting deletions', () => {
    const base = ['a', 'b', 'c', 'd', 'e', 'f'];
    const mine = ['a', 'b', 'd', 'e'];
    const their = ['b', 'c', 'd', 'f'];
    const merged = threeWayMergeArray(base, mine, their);
    expect(merged).toEqual(['b', 'd']);
  });

  test('Parallel non conflicting moves', () => {
    const base = ['a', 'b', 'c', 'd', 'e', 'f'];
    const mine = ['f', 'a', 'c', 'd', 'b', 'e'];
    const their = ['b', 'c', 'd', 'e', 'f', 'a'];
    const merged = threeWayMergeArray(base, mine, their);
    expect(merged).toEqual(['f', 'c', 'd', 'b', 'e', 'a']);
  });

  test('Parallel non conflicting moves 2', () => {
    const base = ['a', 'b', 'c', 'd', 'e', 'f'];
    const mine = ['a', 'e', 'b', 'c', 'd', 'f'];
    const their = ['b', 'f', 'c', 'd', 'e', 'a'];
    const merged = threeWayMergeArray(base, mine, their);
    expect(merged).toEqual(['e', 'b', 'f', 'c', 'd', 'a']);
  });

  test('Parallel conflicting same moves', () => {
    const base = ['a', 'b', 'c', 'd', 'e', 'f'];
    const mine = ['a', 'e', 'b', 'c', 'd', 'f'];
    const their = ['a', 'e', 'b', 'c', 'd', 'f'];
    const merged = threeWayMergeArray(base, mine, their);
    expect(merged).toEqual(['a', 'e', 'b', 'c', 'd', 'f']);
  });

  test('Parallel conflicting moves', () => {
    const base = ['a', 'b', 'c', 'd', 'e', 'f'];
    const mine = ['a', 'e', 'c', 'b', 'd', 'f'];
    const their = ['b', 'a', 'e', 'c', 'd', 'f'];
    const merged = threeWayMergeArray(base, mine, their);
    expect(merged).toEqual(['b', 'a', 'e', 'c', 'd', 'f']);
  });

  test('Parallel non-conflicting mix of operations', () => {
    const base = ['a', 'b', 'c', 'd', 'e'];
    const mine = ['a', 'e', 'c', 'b', 'd', 'f'];
    const their = ['a', 'e', 'c', 'd', 'f'];
    const merged = threeWayMergeArray(base, mine, their);
    expect(merged).toEqual(['a', 'e', 'c', 'd', 'f', 'f']);
  });

  test('Parallel conflicting mix of operations', () => {
    const base = ['a', 'b', 'c', 'd', 'e'];
    const mine = ['d', 'c', 'f', 'a', 'e'];
    const their = ['g', 'd', 'e', 'b', 'c', 'a'];
    const merged = threeWayMergeArray(base, mine, their);
    expect(merged).toEqual(['g', 'd', 'e', 'c', 'f', 'a']);
  });

  test('Parallel conflicting mix of operations with objects', () => {
    const base = [
      {id: 'a', n: 1},
      {id: 'b', n: 2},
      {id: 'c', n: 3},
      {id: 'd', n: 4},
      {id: 'e', n: 5}
    ];
    const mine = [
      {id: 'd', n: 4},
      {id: 'c', n: 3},
      {id: 'f', n: 6},
      {id: 'a', n: 1},
      {id: 'e', n: 5}
    ];
    const their = [
      {id: 'g', n: 7},
      {id: 'd', n: 4},
      {id: 'e', n: 5},
      {id: 'b', n: 2},
      {id: 'c', n: 3},
      {id: 'a', n: 1}
    ];
    const merged = threeWayMergeArray(base, mine, their, isEqual);
    expect(merged).toEqual([
      {id: 'g', n: 7},
      {id: 'd', n: 4},
      {id: 'e', n: 5},
      {id: 'c', n: 3},
      {id: 'f', n: 6},
      {id: 'a', n: 1}
    ]);
  });
});

describe('Merging trees', () => {
  test('No changes', () => {
    const baseTree = emptyTestDocument();
    const myTree = cloneNormalizedDocument(baseTree);
    const theirTree = cloneNormalizedDocument(baseTree);
    const {conflicts, mergedDoc} = threeWayMerge(baseTree, myTree, theirTree);
    expect(conflicts).toEqual({
      Node: new Map(),
      Root: new Map()
    });
    expect(mergedDoc).toEqual(cloneNormalizedDocument(baseTree));
  });

  test('Only one tree changes', () => {
    const baseTree = emptyTestDocument();
    const myTree = docReducer(baseTree, [
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parent: [],
        element: {
          __typename: 'Node',
          _id: 'Node1',
          children: [],
          isChecked: false,
          text: 'firstNode'
        }
      }
    ]);
    const theirTree = cloneNormalizedDocument(baseTree);
    const {mergedDoc, conflicts} = threeWayMerge(baseTree, myTree, theirTree);
    const {mergedDoc: mergedDoc2, conflicts: conflicts2} = threeWayMerge(
      baseTree,
      theirTree,
      myTree
    );
    expect(mergedDoc).toEqual(mergedDoc2);
    expect(conflicts).toEqual(conflicts2);
    expect(mergedDoc).toEqual(myTree);
    expect(conflicts).toEqual({
      Node: new Map(),
      Root: new Map()
    });
  });

  test('Non conflicting insertions', () => {
    const baseTree = emptyTestDocument();
    const myTree = docReducer(baseTree, [
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parent: [],
        element: {
          __typename: 'Node',
          _id: 'Node1',
          children: [],
          isChecked: false,
          text: 'firstNode'
        }
      }
    ]);
    const theirTree = docReducer(baseTree, [
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parent: [],
        element: {
          __typename: 'Node',
          _id: 'Node2',
          children: [],
          isChecked: false,
          text: 'Another first node'
        }
      }
    ]);
    const {mergedDoc, conflicts} = threeWayMerge(baseTree, myTree, theirTree);
    const {mergedDoc: mergedDoc2, conflicts: conflicts2} = threeWayMerge(
      baseTree,
      theirTree,
      myTree
    );
    expect(mergedDoc).toEqual(
      docReducer(myTree, {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 1],
        parent: [],
        element: {
          __typename: 'Node',
          _id: 'Node2',
          children: [],
          isChecked: false,
          text: 'Another first node'
        }
      })
    );
    expect(conflicts).toEqual({
      Node: new Map(),
      Root: new Map()
    });
    expect(mergedDoc).toEqual(mergedDoc2);
    expect(conflicts).toEqual(conflicts2);
  });

  test('Non conflicting deletion', () => {
    const baseTree = docReducer(emptyTestDocument(), {
      __typename: HDocCommandType.INSERT_ELEMENT,
      position: ['children', 0],
      parent: [],
      element: {
        __typename: 'Node',
        _id: 'Node1',
        children: [],
        isChecked: false,
        text: 'firstNode'
      }
    });
    const myTree = docReducer(baseTree, [
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parent: [],
        element: {
          __typename: 'Node',
          _id: 'Node2',
          children: [],
          isChecked: false,
          text: 'secondNode'
        }
      }
    ]);
    const theirTree = docReducer(baseTree, [
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parent: [],
        element: {
          __typename: 'Node',
          _id: 'Node3',
          children: [],
          isChecked: false,
          text: 'Third node'
        }
      },
      {
        __typename: HDocCommandType.DELETE_ELEMENT,
        element: ['children', 1]
      }
    ]);
    const {mergedDoc, conflicts} = threeWayMerge(baseTree, myTree, theirTree);
    const {mergedDoc: mergedDoc2, conflicts: conflicts2} = threeWayMerge(
      baseTree,
      theirTree,
      myTree
    );
    expect(mergedDoc).toEqual(
      docReducer(emptyTestDocument(), [
        {
          __typename: HDocCommandType.INSERT_ELEMENT,
          position: ['children', 0],
          parent: [],
          element: {
            __typename: 'Node',
            _id: 'Node2',
            children: [],
            isChecked: false,
            text: 'secondNode'
          }
        },
        {
          __typename: HDocCommandType.INSERT_ELEMENT,
          position: ['children', 1],
          parent: [],
          element: {
            __typename: 'Node',
            _id: 'Node3',
            children: [],
            isChecked: false,
            text: 'Third node'
          }
        }
      ])
    );
    expect(conflicts).toEqual({
      Node: new Map(),
      Root: new Map()
    });
    expect(diff(myTree, mergedDoc)).toMatchObject([
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 1],
        parent: {
          __typename: 'Root',
          _id: 1
        },
        element: {
          __typename: 'Node',
          _id: 'Node3',
          children: [],
          isChecked: false,
          text: 'Third node'
        }
      },
      {
        __typename: HDocCommandType.DELETE_ELEMENT,
        element: {
          __typename: 'Node',
          _id: 'Node1'
        }
      }
    ]);
    expect(mergedDoc).toEqual(mergedDoc2);
    expect(conflicts).toEqual(conflicts2);
  });

  test('Non conflicting move', () => {
    const baseTree = docReducer(emptyTestDocument(), [
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parent: [],
        element: {
          __typename: 'Node',
          _id: 'Node1',
          children: [],
          isChecked: false,
          text: 'firstNode'
        }
      },
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 1],
        parent: [],
        element: {
          __typename: 'Node',
          _id: 'Node2',
          children: [],
          isChecked: false,
          text: 'secondNode'
        }
      },
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parent: ['children', 1],
        element: {
          __typename: 'Node',
          _id: 'Node3',
          children: [],
          isChecked: false,
          text: 'Child node'
        }
      }
    ]);
    const myTree = docReducer(baseTree, [
      {
        __typename: HDocCommandType.MOVE_ELEMENT,
        element: ['children', 1, 'children', 0],
        toPosition: ['children', 0],
        toParent: ['children', 0],
        changes: {
          __typename: 'Node',
          isChecked: true
        }
      }
    ]);
    const theirTree = docReducer(baseTree, [
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 1],
        parent: ['children', 1],
        element: {
          __typename: 'Node',
          _id: 'Node4',
          children: [],
          isChecked: false,
          text: 'Other child node'
        }
      }
    ]);
    const {mergedDoc, conflicts} = threeWayMerge(baseTree, myTree, theirTree);
    const {mergedDoc: mergedDoc2, conflicts: conflicts2} = threeWayMerge(
      baseTree,
      theirTree,
      myTree
    );
    expect(mergedDoc).toEqual(
      docReducer(emptyTestDocument(), [
        {
          __typename: HDocCommandType.INSERT_ELEMENT,
          position: ['children', 0],
          parent: [],
          element: {
            __typename: 'Node',
            _id: 'Node1',
            children: [],
            isChecked: false,
            text: 'firstNode'
          }
        },
        {
          __typename: HDocCommandType.INSERT_ELEMENT,
          position: ['children', 1],
          parent: [],
          element: {
            __typename: 'Node',
            _id: 'Node2',
            children: [],
            isChecked: false,
            text: 'secondNode'
          }
        },
        {
          __typename: HDocCommandType.INSERT_ELEMENT,
          position: ['children', 0],
          parent: ['children', 0],
          element: {
            __typename: 'Node',
            _id: 'Node3',
            children: [],
            isChecked: true,
            text: 'Child node'
          }
        },
        {
          __typename: HDocCommandType.INSERT_ELEMENT,
          position: ['children', 0],
          parent: ['children', 1],
          element: {
            __typename: 'Node',
            _id: 'Node4',
            children: [],
            isChecked: false,
            text: 'Other child node'
          }
        }
      ])
    );
    expect(conflicts).toEqual({
      Node: new Map(),
      Root: new Map()
    });
    expect(mergedDoc).toEqual(mergedDoc2);
    expect(conflicts).toEqual(conflicts2);
  });

  test('Conflicting move and deletion', () => {
    const baseTree = docReducer(emptyTestDocument(), [
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parent: [],
        element: {
          __typename: 'Node',
          _id: 'Node1',
          children: [],
          isChecked: false,
          text: 'firstNode'
        }
      },
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 1],
        parent: [],
        element: {
          __typename: 'Node',
          _id: 'Node2',
          children: [],
          isChecked: false,
          text: 'secondNode'
        }
      },
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parent: ['children', 1],
        element: {
          __typename: 'Node',
          _id: 'Node3',
          children: [],
          isChecked: false,
          text: 'Child node'
        }
      }
    ]);
    const myTree = docReducer(baseTree, [
      {
        __typename: HDocCommandType.MOVE_ELEMENT,
        element: ['children', 1, 'children', 0],
        toPosition: ['children', 0],
        toParent: ['children', 0],
        changes: {
          __typename: 'Node',
          isChecked: true
        }
      }
    ]);
    const theirTree = docReducer(baseTree, [
      {
        __typename: HDocCommandType.DELETE_ELEMENT,
        element: ['children', 1, 'children', 0]
      }
    ]);
    const {mergedDoc, conflicts} = threeWayMerge(baseTree, myTree, theirTree);
    const {mergedDoc: mergedDoc2, conflicts: conflicts2} = threeWayMerge(
      baseTree,
      theirTree,
      myTree
    );
    expect(mergedDoc).toEqual(
      docReducer(emptyTestDocument(), [
        {
          __typename: HDocCommandType.INSERT_ELEMENT,
          position: ['children', 0],
          parent: [],
          element: {
            __typename: 'Node',
            _id: 'Node1',
            children: [],
            isChecked: false,
            text: 'firstNode'
          }
        },
        {
          __typename: HDocCommandType.INSERT_ELEMENT,
          position: ['children', 1],
          parent: [],
          element: {
            __typename: 'Node',
            _id: 'Node2',
            children: [],
            isChecked: false,
            text: 'secondNode'
          }
        },
        {
          __typename: HDocCommandType.INSERT_ELEMENT,
          position: ['children', 0],
          parent: ['children', 0],
          element: {
            __typename: 'Node',
            _id: 'Node3',
            children: [],
            isChecked: true,
            text: 'Child node'
          }
        }
      ])
    );
    expect(conflicts).toEqual({
      Node: new Map(),
      Root: new Map()
    });
    expect(mergedDoc).toEqual(mergedDoc2);
    expect(conflicts).toEqual(conflicts2);
  });

  test('Conflicting moves', () => {
    const baseTree = docReducer(emptyTestDocument(), [
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parent: [],
        element: {
          __typename: 'Node',
          _id: 'Node1',
          children: [],
          isChecked: false,
          text: 'firstNode'
        }
      },
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 1],
        parent: [],
        element: {
          __typename: 'Node',
          _id: 'Node2',
          children: [],
          isChecked: false,
          text: 'secondNode'
        }
      },
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 2],
        parent: [],
        element: {
          __typename: 'Node',
          _id: 'Node3',
          children: [],
          isChecked: false,
          text: 'thirdNode'
        }
      },
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parent: ['children', 1],
        element: {
          __typename: 'Node',
          _id: 'Node2_1',
          children: [],
          isChecked: false,
          text: 'Child node'
        }
      }
    ]);
    const myTree = docReducer(baseTree, [
      {
        __typename: HDocCommandType.MOVE_ELEMENT,
        element: ['children', 1, 'children', 0],
        toPosition: ['children', 0],
        toParent: ['children', 0],
        changes: {
          __typename: 'Node',
          isChecked: true
        }
      }
    ]);
    const theirTree = docReducer(baseTree, [
      {
        __typename: HDocCommandType.MOVE_ELEMENT,
        element: ['children', 1, 'children', 0],
        toPosition: ['children', 0],
        toParent: ['children', 2],
        changes: {
          __typename: 'Node',
          text: 'Moved node'
        }
      }
    ]);
    const {mergedDoc, conflicts} = threeWayMerge(baseTree, myTree, theirTree);
    // @ts-ignore
    expect(
      removeParents(denormalizeDocument(mergedDoc) as IRootNode)
    ).toMatchObject(
      removeParents({
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
                _id: 'Node2_1',
                children: [],
                parent: null,
                isChecked: true,
                text: 'Child node'
              }
            ],
            parent: null,
            isChecked: false,
            text: 'firstNode'
          },
          {
            __typename: 'Node',
            _id: 'Node2',
            children: [],
            parent: null,
            isChecked: false,
            text: 'secondNode'
          },
          {
            __typename: 'Node',
            _id: 'Node3',
            children: [
              // @ts-expect-error
              {
                __typename: 'Node',
                children: [],
                parent: null,
                isChecked: false,
                text: 'Moved node'
              }
            ],
            parent: null,
            isChecked: false,
            text: 'thirdNode'
          }
        ]
      })
    );
    expect(
      conflicts['Node']!.get('Node2_1')!.positionConflicts!.clonedElements
    ).toHaveLength(1);
  });

  test('Info conflicts', () => {
    const baseTree = docReducer(emptyTestDocument(), [
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parent: [],
        element: {
          __typename: 'Node',
          _id: 'Node1',
          children: [],
          isChecked: false,
          text: 'firstNode'
        }
      },
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parent: ['children', 0],
        element: {
          __typename: 'Node',
          _id: 'Node2',
          children: [],
          isChecked: false,
          text: 'secondNode'
        }
      }
    ]);
    const leftTree = docReducer(baseTree, [
      {
        __typename: HDocCommandType.CHANGE_ELEMENT,
        element: ['children', 0, 'children', 0],
        changes: {
          __typename: 'INode',
          text: 'second node',
          isChecked: true
        }
      }
    ]);
    const rightTree = docReducer(baseTree, [
      {
        __typename: HDocCommandType.CHANGE_ELEMENT,
        element: ['children', 0, 'children', 0],
        changes: {
          __typename: 'INode',
          text: 'SeconD node',
          isChecked: false
        }
      }
    ]);
    const {conflicts, mergedDoc} = threeWayMerge(baseTree, leftTree, rightTree);
    expect(
      removeParents(denormalizeDocument(mergedDoc) as IRootNode)
    ).toMatchObject({
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
              _id: 'Node2',
              children: [],
              isChecked: true,
              text: 'SeconD node'
            }
          ],
          isChecked: false,
          text: 'firstNode'
        }
      ]
    });
    const expectedConflicts: ConflictsMap<
      ITestDocElementsMap,
      keyof ITestDocElementsMap
    > = {
      Node: new Map([
        [
          'Node2',
          {
            infoConflicts: {
              text: {
                baseValue: 'secondNode',
                conflictValues: ['second node', 'SeconD node'],
                mergedValue: 'SeconD node',
                mergeStatus: MergeStatus.open
              }
            }
          }
        ]
      ]),
      Root: new Map()
    };
    expect(conflicts).toMatchObject(expectedConflicts);
  });

  test('Info array conflicts', () => {
    const baseTree = docReducer(emptyTestDocument(), [
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parent: [],
        element: {
          __typename: 'Node',
          _id: 'Node1',
          children: [],
          isChecked: false,
          text: 'firstNode',
          membersIds: [1, 2, 3]
        }
      },
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parent: ['children', 0],
        element: {
          __typename: 'Node',
          _id: 'Node2',
          children: [],
          isChecked: false,
          text: 'secondNode',
          membersIds: [2, 4]
        }
      }
    ]);
    let leftTree = docReducer(baseTree, [
      {
        __typename: HDocCommandType.CHANGE_ELEMENT,
        element: ['children', 0, 'children', 0],
        changes: {
          __typename: 'INode',
          text: 'second node',
          isChecked: true
        }
      }
    ]);
    leftTree = docReducer(leftTree, [
      {
        __typename: HDocCommandType.CHANGE_ELEMENT,
        element: ['children', 0],
        changes: {
          __typename: 'INode',
          membersIds: [3, 5, 1]
        }
      }
    ]);
    let rightTree = docReducer(baseTree, [
      {
        __typename: HDocCommandType.CHANGE_ELEMENT,
        element: ['children', 0, 'children', 0],
        changes: {
          __typename: 'INode',
          text: 'SeconD node',
          isChecked: false
        }
      }
    ]);
    rightTree = docReducer(rightTree, [
      {
        __typename: HDocCommandType.CHANGE_ELEMENT,
        element: ['children', 0],
        changes: {
          __typename: 'INode',
          membersIds: [4, 3, 2, 1]
        }
      }
    ]);
    const {conflicts, mergedDoc} = threeWayMerge(baseTree, leftTree, rightTree);
    expect(
      removeParents(denormalizeDocument(mergedDoc) as IRootNode)
    ).toMatchObject({
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
              _id: 'Node2',
              children: [],
              isChecked: true,
              text: 'SeconD node',
              membersIds: [2, 4]
            }
          ],
          isChecked: false,
          text: 'firstNode',
          membersIds: [4, 3, 5, 2, 1]
        }
      ]
    });
    const expectedConflicts: ConflictsMap<
      ITestDocElementsMap,
      keyof ITestDocElementsMap
    > = {
      Node: new Map([
        [
          'Node1',
          {
            infoConflicts: {
              membersIds: {
                baseValue: [1, 2, 3],
                conflictValues: [
                  [3, 5, 1],
                  [4, 3, 2, 1]
                ],
                mergedValue: [4, 3, 5, 2, 1],
                mergeStatus: MergeStatus.open
              }
            }
          }
        ],
        [
          'Node2',
          {
            infoConflicts: {
              text: {
                baseValue: 'secondNode',
                conflictValues: ['second node', 'SeconD node'],
                mergedValue: 'SeconD node',
                mergeStatus: MergeStatus.open
              }
            }
          }
        ]
      ]),
      Root: new Map()
    };
    expect(conflicts).toMatchObject(expectedConflicts);
  });
});
