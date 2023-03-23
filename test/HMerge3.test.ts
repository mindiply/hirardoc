import {isEqual} from 'lodash';
import {
  creationDate,
  emptyTestDocument,
  IRootNode,
  ITestDocElementsMap,
  removeParents
} from './testTypes';
import {
  cloneNormalizedDocument,
  ConflictsMap,
  denormalizeDocument,
  diff,
  docReducer,
  HDocCommandType,
  MergeStatus,
  threeWayMerge,
  threeWayMergeArray,
  diff3Merge
} from '../src';

describe('Merging buffers', () => {
  test('No changes', () => {
    const base = ['a', 'b', 'c', 'd', 'e', 'f'];
    const left = ['a', 'b', 'c', 'd', 'e', 'f'];
    const right = ['a', 'b', 'c', 'd', 'e', 'f'];
    const mergeRegions = diff3Merge(left, base, right);
    expect(mergeRegions).toMatchObject([{ok: ['a', 'b', 'c', 'd', 'e', 'f']}]);
  });

  test('No changes, one touched', () => {
    const leftCTouched = (val: any, side: 'left' | 'right') =>
      val === 'c' && side === 'left';
    const base = ['a', 'b', 'c', 'd', 'e', 'f'];
    const left = ['a', 'b', 'c', 'd', 'e', 'f'];
    const right = ['a', 'b', 'c', 'd', 'e', 'f'];
    const mergeRegions = diff3Merge(left, base, right, {
      wasTouchedFn: leftCTouched
    });
    expect(mergeRegions).toMatchObject([{ok: ['a', 'b', 'c', 'd', 'e', 'f']}]);
  });

  test('Non conflicting changes left', () => {
    const base = ['a', 'b', 'c', 'd', 'e', 'f'];
    const left = ['q', 'f', 'a', 'c', 'e', 'b', 'q'];
    const right = ['a', 'b', 'c', 'd', 'e', 'f'];
    const mergeRegions = diff3Merge(left, base, right);
    expect(mergeRegions).toMatchObject([
      {ok: ['q', 'f', 'a', 'c', 'e', 'b', 'q']}
    ]);
  });

  test('Non conflicting changes left, left c touched', () => {
    const leftCTouched = (val: any, side: 'left' | 'right') =>
      val === 'c' && side === 'left';
    const base = ['a', 'b', 'c', 'd', 'e', 'f'];
    const left = ['q', 'f', 'a', 'c', 'e', 'b', 'q'];
    const right = ['a', 'b', 'c', 'd', 'e', 'f'];
    const mergeRegions = diff3Merge(left, base, right, {
      wasTouchedFn: leftCTouched
    });
    expect(mergeRegions).toMatchObject([
      {ok: ['q', 'f', 'a']},
      {conflict: {a: ['c'], b: ['b', 'c', 'd'], o: ['b', 'c', 'd']}},
      {ok: ['e', 'b', 'q']}
    ]);
  });

  test('Non conflicting changes right', () => {
    const base = ['a', 'b', 'c', 'd', 'e', 'f'];
    const left = ['a', 'b', 'c', 'd', 'e', 'f'];
    const right = ['q', 'f', 'a', 'c', 'e', 'b', 'q'];
    const mergeRegions = diff3Merge(left, base, right);
    expect(mergeRegions).toMatchObject([
      {ok: ['q', 'f', 'a', 'c', 'e', 'b', 'q']}
    ]);
  });

  test('Non conflicting changes right, left touched', () => {
    const leftFTouched = (val: any, side: 'left' | 'right') =>
      val === 'f' && side === 'left';
    const base = ['a', 'b', 'c', 'd', 'e', 'f'];
    const left = ['a', 'b', 'c', 'd', 'e', 'f'];
    const right = ['q', 'f', 'a', 'c', 'e', 'b', 'q'];
    const mergeRegions = diff3Merge(left, base, right, {
      wasTouchedFn: leftFTouched
    });
    expect(mergeRegions).toMatchObject([
      {ok: ['q', 'f', 'a', 'c', 'e']},
      {conflict: {b: ['b', 'q'], a: ['f'], o: ['f']}}
    ]);
  });

  test('Non conflicting changes no deletions', () => {
    const base = ['a', 'b', 'c', 'd', 'e', 'f'];
    const left = ['q', 'a', 'b', 'c', 'd', 'e', 'f'];
    const right = ['a', 'b', 'c', 'd', 'f', 'e', 'r'];
    const mergeRegions = diff3Merge(left, base, right);
    expect(mergeRegions).toMatchObject([
      {ok: ['q', 'a', 'b', 'c', 'd', 'f', 'e', 'r']}
    ]);
  });

  test('Non conflicting changes with deletions', () => {
    const base = ['a', 'b', 'c', 'd', 'e', 'f'];
    const left = ['b', 'c', 'd', 'e', 'f'];
    const right = ['a', 'b', 'c', 'd', 'e'];
    const mergeRegions = diff3Merge(left, base, right);
    expect(mergeRegions).toMatchObject([{ok: ['b', 'c', 'd', 'e']}]);
  });

  test('No changes, just one element touched', () => {
    const cWasTouched = (val: any, side: 'left' | 'right') =>
      val === 'c' && side === 'left';
    const base = ['a', 'b', 'c', 'd', 'e', 'f'];
    const left = ['a', 'b', 'c', 'd', 'e', 'f'];
    const right = ['a', 'b', 'c', 'd', 'e'];
    const mergeRegions = diff3Merge(left, base, right, {
      wasTouchedFn: cWasTouched
    });
    expect(mergeRegions).toMatchObject([{ok: ['a', 'b', 'c', 'd', 'e']}]);
  });

  test('Apparent non-conflict deletion with touched deleted element', () => {
    const cWasTouched = (val: any, side: 'left' | 'right') =>
      val === 'c' && side === 'left';
    const base = ['a', 'b', 'c', 'd', 'e', 'f'];
    const left = ['a', 'b', 'c', 'd', 'e', 'f'];
    const right = ['a', 'b', 'd', 'e'];
    const mergeRegions = diff3Merge(left, base, right, {
      wasTouchedFn: cWasTouched
    });
    expect(mergeRegions).toMatchObject([
      {ok: ['a', 'b']},
      {conflict: {a: ['c'], o: ['c']}},
      {ok: ['d', 'e']}
    ]);
  });

  test('Conflicting changes', () => {
    const base = ['a', 'b', 'c', 'd', 'e', 'f'];
    const left = ['q', 'a', 'b', 'd', 'e', 'f'];
    const right = ['a', 'c', 'd', 'f', 'e', 'r'];
    const mergeRegions = diff3Merge(left, base, right);
    expect(mergeRegions).toMatchObject([
      {ok: ['q', 'a']},
      {
        conflict: {
          a: ['b'],
          b: ['c'],
          o: ['b', 'c'],
          oIndex: 1,
          aIndex: 2,
          bIndex: 1
        }
      },
      {ok: ['d', 'f', 'e', 'r']}
    ]);
  });
});

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

  test('A deletion of an untouched element prevented with wasTouched', () => {
    const cWasTouched = (el: string) => el === 'c';
    const base = ['a', 'b', 'c', 'd', 'e'];
    const mine = ['e', 'a', 'b', 'c', 'd'];
    const their = ['a', 'b', 'd', 'e'];
    const mergedDefault = threeWayMergeArray(base, mine, their);
    const mergedTouched = threeWayMergeArray(base, mine, their, {
      wasTouchedFn: cWasTouched
    });
    expect(mergedDefault).toEqual(['e', 'a', 'b', 'd']);
    expect(mergedTouched).toEqual(['e', 'a', 'b', 'c', 'd']);
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
    const merged = threeWayMergeArray(base, mine, their, {equalsFn: isEqual});
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

describe('Bug Regression Tests', () => {
  test('Disappearance of children on move to other parent', () => {
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
        position: ['children', 1],
        parent: [],
        element: {
          __typename: 'Node',
          _id: 'Node2',
          children: [],
          isChecked: false,
          text: 'secondNode',
          membersIds: [2, 4]
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
          isChecked: false,
          text: 'thirdNode',
          membersIds: [2, 4]
        }
      }
    ]);
    const leftTree = docReducer(baseTree, [
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parent: ['children', 0, 'children', 0],
        element: {
          __typename: 'Node',
          _id: 'Node4',
          children: [],
          isChecked: false,
          text: 'fourthNode',
          membersIds: []
        }
      },
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 1],
        parent: ['children', 0, 'children', 0],
        element: {
          __typename: 'Node',
          _id: 'Node5',
          children: [],
          isChecked: false,
          text: 'fifthNode',
          membersIds: []
        }
      }
    ]);
    const rightTree = docReducer(baseTree, [
      {
        __typename: HDocCommandType.MOVE_ELEMENT,
        element: ['children', 0, 'children', 0],
        toParent: ['children', 1],
        toPosition: ['children', 0]
      }
    ]);
    const {mergedDoc} = threeWayMerge(baseTree, leftTree, rightTree);
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
              _id: 'Node3',
              children: [
                {
                  __typename: 'Node',
                  _id: 'Node4',
                  children: [],
                  text: 'fourthNode'
                },
                {
                  __typename: 'Node',
                  _id: 'Node5',
                  children: [],
                  text: 'fifthNode'
                }
              ],
              text: 'thirdNode'
            }
          ],
          text: 'firstNode'
        },
        {
          __typename: 'Node',
          _id: 'Node2',
          children: [
            {
              __typename: 'Node',
              children: [],
              text: 'thirdNode'
            }
          ],
          text: 'secondNode'
        }
      ]
    });
  });

  test('Deletion of grandparent kept even if adding grandchild on other tree', () => {
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
        parent: {
          __typename: 'Node',
          _id: 'Node1'
        },
        element: {
          __typename: 'Node',
          _id: 'Node2',
          children: [],
          isChecked: false,
          text: 'childNode',
          membersIds: [2, 4]
        }
      },
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parent: {
          __typename: 'Node',
          _id: 'Node2'
        },
        element: {
          __typename: 'Node',
          _id: 'Node3',
          children: [],
          isChecked: false,
          text: 'granchild node',
          membersIds: [2, 4]
        }
      }
    ]);
    const leftTree = docReducer(baseTree, [
      {
        __typename: HDocCommandType.DELETE_ELEMENT,
        element: {__typename: 'Node', _id: 'Node1'}
      }
    ]);
    const rightTree = docReducer(baseTree, [
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parent: {
          __typename: 'Node',
          _id: 'Node3'
        },
        element: {
          __typename: 'Node',
          _id: 'Node4',
          children: [],
          isChecked: false,
          text: 'Grand grand child node',
          membersIds: [2, 4]
        }
      }
    ]);
    const {mergedDoc} = threeWayMerge(baseTree, leftTree, rightTree);
    expect(mergedDoc.maps['Node'].size).toBe(4);
  });
});
