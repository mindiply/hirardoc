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
  HDocCommandType,
  InsertElement,
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
        children: []
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

  test('Add and remove one node', () => {
    const emptyDoc = emptyTestDocument();
    const expectedRootNode = {
      __typename: 'Root',
      _id: 1,
      createdAt: creationDate,
      name: 'root',
      children: []
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

  // test('Removing a parent node, removes its descendants as well', () => {
  //   const emptyDoc = emptyTestDocument();
  //   const addNodeCmd: InsertElement<
  //     ITestDocElementsMap,
  //     keyof ITestDocElementsMap,
  //     INode
  //   > = {
  //     __typename: HDocCommandType.INSERT_ELEMENT,
  //     position: ['children', 0],
  //     parent: [],
  //     element: {
  //       __typename: 'Node',
  //       _id: 'Node1',
  //       children: [],
  //       isChecked: false,
  //       text: 'firstNode',
  //       membersIds: []
  //     }
  //   };
  //   const mutableDoc = mutableDocument(emptyDoc);
  //   mutableDoc.insertElement(addNodeCmd);
  //   const addNodeCmd2: InsertElement<
  //     ITestDocElementsMap,
  //     keyof ITestDocElementsMap,
  //     INode
  //   > = {
  //     __typename: HDocCommandType.INSERT_ELEMENT,
  //     position: ['children', 0],
  //     parent: ['children', 0],
  //     element: {
  //       __typename: 'Node',
  //       _id: 'Node2',
  //       children: [],
  //       isChecked: false,
  //       text: 'childNode',
  //       membersIds: []
  //     }
  //   };
  //   mutableDoc.insertElement(addNodeCmd2);
  //   const deleteParentNodeCmd: DeleteElement<
  //     ITestDocElementsMap,
  //     keyof ITestDocElementsMap
  //   > = {
  //     __typename: HDocCommandType.DELETE_ELEMENT,
  //     element: {
  //       __typename: 'Node',
  //       _id: 'Node1'
  //     }
  //   };
  //   mutableDoc.deleteElement(deleteParentNodeCmd);
  //   const updatedDoc = mutableDoc.updatedDocument();
  //   expect(hasMappedElement(updatedDoc.maps, 'Node', 'Node1')).toBe(false);
  //   expect(hasMappedElement(updatedDoc.maps, 'Node', 'Node2')).toBe(false);
  // });
});

//
//   test('Removing a child node keeps the parent', () => {
//     const emptyDoc = emptyTestDocument();
//     const addNodeCmd: InsertElement<
//       ITestDocElementsMap,
//       keyof ITestDocElementsMap,
//       INode
//     > = {
//       __typename: HDocCommandType.INSERT_ELEMENT,
//       position: ['children', 0],
//       parent: [],
//       element: {
//         ...emptyNodeInfo(),
//         _id: 'Node1',
//         children: [],
//         isChecked: false,
//         text: 'firstNode'
//       }
//     };
//     const mutableDoc = mutableDocument(emptyDoc);
//     mutableDoc.insertElement(addNodeCmd);
//     const addNodeCmd2: InsertElement<
//       ITestDocElementsMap,
//       keyof ITestDocElementsMap,
//       INode
//     > = {
//       __typename: HDocCommandType.INSERT_ELEMENT,
//       position: ['children', 0],
//       parent: ['children', 0],
//       element: {
//         ...emptyNodeInfo(),
//         _id: 'Node2',
//         children: [],
//         isChecked: false,
//         text: 'childNode'
//       }
//     };
//     mutableDoc.insertElement(addNodeCmd2);
//     const deleteParentNodeCmd: DeleteElement<
//       ITestDocElementsMap,
//       keyof ITestDocElementsMap
//     > = {
//       __typename: HDocCommandType.DELETE_ELEMENT,
//       element: {
//         __typename: 'Node',
//         _id: 'Node2'
//       }
//     };
//     mutableDoc.deleteElement(deleteParentNodeCmd);
//     const updatedDoc = mutableDoc.updatedDocument();
//     expect(hasMappedElement(updatedDoc.maps, 'Node', 'Node1')).toBe(true);
//     expect(
//       mappedElement(updatedDoc.maps, 'Node', 'Node1').children.length
//     ).toBe(0);
//     expect(hasMappedElement(updatedDoc.maps, 'Node', 'Node2')).toBe(false);
//   });
//
//   test('Added node and its child', () => {
//     const emptyDoc = emptyTestDocument();
//     const expectedRootNode = removeParents({
//       __typename: 'Root',
//       _id: 1,
//       createdAt: creationDate,
//       name: 'root',
//       children: [
//         {
//           __typename: 'Node',
//           _id: 'Node1',
//           children: [
//             {
//               __typename: 'Node',
//               text: 'secondNode',
//               isChecked: true,
//               children: [],
//               _id: 'Node2',
//               parent: null
//             }
//           ],
//           parent: null,
//           isChecked: false,
//           text: 'firstNode'
//         }
//       ],
//       parent: null
//     });
//     const mutableDoc = mutableDocument(emptyDoc);
//     const addNodeCmd: InsertElement<
//       ITestDocElementsMap,
//       keyof ITestDocElementsMap,
//       INode
//     > = {
//       __typename: HDocCommandType.INSERT_ELEMENT,
//       position: ['children', 0],
//       parent: [],
//       element: {
//         ...emptyNodeInfo(),
//         _id: 'Node1',
//         children: [],
//         isChecked: false,
//         text: 'firstNode'
//       }
//     };
//     mutableDoc.insertElement(addNodeCmd);
//     const addNodeCmd2: InsertElement<
//       ITestDocElementsMap,
//       keyof ITestDocElementsMap,
//       INode
//     > = {
//       __typename: HDocCommandType.INSERT_ELEMENT,
//       position: ['children', 0],
//       parent: ['children', 0],
//       element: {
//         ...emptyNodeInfo(),
//         _id: 'Node2',
//         children: [],
//         isChecked: true,
//         text: 'secondNode'
//       }
//     };
//     mutableDoc.insertElement(addNodeCmd2);
//     expect(denormalizeDocument(mutableDoc)).toMatchObject(expectedRootNode);
//     expect(denormalizeDocument(mutableDoc.updatedDocument())).toMatchObject(
//       expectedRootNode
//     );
//     const replayMutableDoc = mutableDocument(emptyDoc);
//     replayMutableDoc.applyChanges(mutableDoc.changes);
//     expect(denormalizeDocument(replayMutableDoc)).toMatchObject(
//       expectedRootNode
//     );
//     expect(
//       denormalizeDocument(replayMutableDoc.updatedDocument())
//     ).toMatchObject(expectedRootNode);
//   });
//
//   test('Added three nodes and move a child', () => {
//     const emptyDoc = emptyTestDocument();
//     const expectedRootNode = removeParents({
//       __typename: 'Root',
//       _id: 1,
//       createdAt: creationDate,
//       name: 'root',
//       children: [
//         {
//           __typename: 'Node',
//           _id: 'Node1',
//           children: [],
//           parent: null,
//           isChecked: false,
//           text: 'firstNode'
//         },
//         {
//           __typename: 'Node',
//           _id: 'Node2',
//           children: [
//             {
//               __typename: 'Node',
//               text: 'thirdNode',
//               isChecked: true,
//               children: [],
//               _id: 'Node3',
//               parent: null
//             }
//           ],
//           parent: null,
//           isChecked: false,
//           text: 'secondNode'
//         }
//       ],
//       parent: null
//     });
//     const mutableDoc = mutableDocument(emptyDoc);
//     const addNodeCmd: InsertElement<
//       ITestDocElementsMap,
//       keyof ITestDocElementsMap,
//       INode
//     > = {
//       __typename: HDocCommandType.INSERT_ELEMENT,
//       position: ['children', 0],
//       parent: [],
//       element: {
//         ...emptyNodeInfo(),
//         _id: 'Node1',
//         children: [],
//         isChecked: false,
//         text: 'firstNode'
//       }
//     };
//     mutableDoc.insertElement(addNodeCmd);
//     const addNodeCmd2: InsertElement<
//       ITestDocElementsMap,
//       keyof ITestDocElementsMap,
//       INode
//     > = {
//       __typename: HDocCommandType.INSERT_ELEMENT,
//       position: ['children', 1],
//       parent: [],
//       element: {
//         ...emptyNodeInfo(),
//         _id: 'Node2',
//         children: [],
//         isChecked: false,
//         text: 'secondNode'
//       }
//     };
//     mutableDoc.insertElement(addNodeCmd2);
//     const addNodeCmd3: InsertElement<
//       ITestDocElementsMap,
//       keyof ITestDocElementsMap,
//       INode
//     > = {
//       __typename: HDocCommandType.INSERT_ELEMENT,
//       position: ['children', 0],
//       parent: ['children', 0],
//       element: {
//         ...emptyNodeInfo(),
//         _id: 'Node3',
//         children: [],
//         isChecked: false,
//         text: 'thirdNode'
//       }
//     };
//     mutableDoc.insertElement(addNodeCmd3);
//     const moveNode3Cmd: MoveElement<
//       ITestDocElementsMap,
//       keyof ITestDocElementsMap,
//       INode
//     > = {
//       __typename: HDocCommandType.MOVE_ELEMENT,
//       element: ['children', 0, 'children', 0],
//       toParent: ['children', 1],
//       toPosition: ['children', 0],
//       changes: {
//         __typename: 'Node',
//         isChecked: true
//       }
//     };
//     mutableDoc.moveElement(moveNode3Cmd);
//     expect(denormalizeDocument(mutableDoc)).toMatchObject(expectedRootNode);
//     expect(denormalizeDocument(mutableDoc.updatedDocument())).toMatchObject(
//       expectedRootNode
//     );
//     const replayMutableDoc = mutableDocument(emptyDoc);
//     replayMutableDoc.applyChanges(mutableDoc.changes);
//     expect(denormalizeDocument(replayMutableDoc)).toMatchObject(
//       expectedRootNode
//     );
//     expect(
//       denormalizeDocument(replayMutableDoc.updatedDocument())
//     ).toMatchObject(expectedRootNode);
//   });
//
//   test('Added node, its child and modified parent', () => {
//     const emptyDoc = emptyTestDocument();
//     const expectedRootNode = removeParents({
//       __typename: 'Root',
//       _id: 1,
//       createdAt: creationDate,
//       name: 'root',
//       children: [
//         {
//           __typename: 'Node',
//           _id: 'Node1',
//           children: [
//             {
//               __typename: 'Node',
//               text: 'secondNode',
//               isChecked: true,
//               children: [],
//               _id: 'Node2',
//               parent: null
//             }
//           ],
//           parent: null,
//           isChecked: true,
//           text: 'firstNode'
//         }
//       ],
//       parent: null
//     });
//     const mutableDoc = mutableDocument(emptyDoc);
//     const addNodeCmd: InsertElement<
//       ITestDocElementsMap,
//       keyof ITestDocElementsMap,
//       INode
//     > = {
//       __typename: HDocCommandType.INSERT_ELEMENT,
//       position: ['children', 0],
//       parent: [],
//       element: {
//         ...emptyNodeInfo(),
//         _id: 'Node1',
//         children: [],
//         isChecked: false,
//         text: 'firstNode'
//       }
//     };
//     mutableDoc.insertElement(addNodeCmd);
//     const addNodeCmd2: InsertElement<
//       ITestDocElementsMap,
//       keyof ITestDocElementsMap,
//       INode
//     > = {
//       __typename: HDocCommandType.INSERT_ELEMENT,
//       position: ['children', 0],
//       parent: ['children', 0],
//       element: {
//         ...emptyNodeInfo(),
//         _id: 'Node2',
//         children: [],
//         isChecked: true,
//         text: 'secondNode'
//       }
//     };
//     mutableDoc.insertElement(addNodeCmd2);
//     const updateCmd: ChangeElement<
//       ITestDocElementsMap,
//       keyof ITestDocElementsMap,
//       INode
//     > = {
//       __typename: HDocCommandType.CHANGE_ELEMENT,
//       element: ['children', 0],
//       changes: {
//         __typename: 'Node',
//         isChecked: true
//       }
//     };
//     mutableDoc.changeElement(updateCmd);
//     expect(denormalizeDocument(mutableDoc)).toMatchObject(expectedRootNode);
//     expect(denormalizeDocument(mutableDoc.updatedDocument())).toMatchObject(
//       expectedRootNode
//     );
//   });
//
//   test('Added node, its child and modified parent - replayed', () => {
//     const emptyDoc = emptyTestDocument();
//     const expectedRootNode = removeParents({
//       __typename: 'Root',
//       _id: 1,
//       createdAt: creationDate,
//       name: 'root',
//       children: [
//         {
//           __typename: 'Node',
//           _id: 'Node1',
//           children: [
//             {
//               __typename: 'Node',
//               text: 'secondNode',
//               isChecked: true,
//               children: [],
//               _id: 'Node2',
//               parent: null
//             }
//           ],
//           parent: null,
//           isChecked: true,
//           text: 'firstNode'
//         }
//       ],
//       parent: null
//     });
//     const mutableDoc = mutableDocument(emptyDoc);
//     const addNodeCmd: InsertElement<
//       ITestDocElementsMap,
//       keyof ITestDocElementsMap,
//       INode
//     > = {
//       __typename: HDocCommandType.INSERT_ELEMENT,
//       position: ['children', 0],
//       parent: [],
//       element: {
//         ...emptyNodeInfo(),
//         _id: 'Node1',
//         children: [],
//         isChecked: false,
//         text: 'firstNode'
//       }
//     };
//     mutableDoc.insertElement(addNodeCmd);
//     const addNodeCmd2: InsertElement<
//       ITestDocElementsMap,
//       keyof ITestDocElementsMap,
//       INode
//     > = {
//       __typename: HDocCommandType.INSERT_ELEMENT,
//       position: ['children', 0],
//       parent: ['children', 0],
//       element: {
//         ...emptyNodeInfo(),
//         _id: 'Node2',
//         children: [],
//         isChecked: true,
//         text: 'secondNode'
//       }
//     };
//     mutableDoc.insertElement(addNodeCmd2);
//     const updateCmd: ChangeElement<
//       ITestDocElementsMap,
//       keyof ITestDocElementsMap,
//       INode
//     > = {
//       __typename: HDocCommandType.CHANGE_ELEMENT,
//       element: ['children', 0],
//       changes: {
//         __typename: 'Node',
//         isChecked: true
//       }
//     };
//     mutableDoc.changeElement(updateCmd);
//     expect(denormalizeDocument(mutableDoc)).toMatchObject(expectedRootNode);
//     expect(denormalizeDocument(mutableDoc.updatedDocument())).toMatchObject(
//       expectedRootNode
//     );
//     const replayMutableDoc = mutableDocument(emptyDoc);
//     replayMutableDoc.applyChanges(mutableDoc.changes);
//     expect(denormalizeDocument(replayMutableDoc)).toMatchObject(
//       expectedRootNode
//     );
//     expect(
//       denormalizeDocument(replayMutableDoc.updatedDocument())
//     ).toMatchObject(expectedRootNode);
//   });
//
//   test('Added node, its child and modified parent - test the paths', () => {
//     const emptyDoc = emptyTestDocument();
//     const mutableDoc = mutableDocument(emptyDoc);
//     const addNodeCmd: InsertElement<
//       ITestDocElementsMap,
//       keyof ITestDocElementsMap,
//       INode
//     > = {
//       __typename: HDocCommandType.INSERT_ELEMENT,
//       position: ['children', 0],
//       parent: [],
//       element: {
//         ...emptyNodeInfo(),
//         _id: 'Node1',
//         children: [],
//         isChecked: false,
//         text: 'firstNode'
//       }
//     };
//     mutableDoc.insertElement(addNodeCmd);
//     const addNodeCmd2: InsertElement<
//       ITestDocElementsMap,
//       keyof ITestDocElementsMap,
//       INode
//     > = {
//       __typename: HDocCommandType.INSERT_ELEMENT,
//       position: ['children', 0],
//       parent: ['children', 0],
//       element: {
//         ...emptyNodeInfo(),
//         _id: 'Node2',
//         children: [],
//         isChecked: true,
//         text: 'secondNode'
//       }
//     };
//     mutableDoc.insertElement(addNodeCmd2);
//     expect(mutableDoc.pathForElementWithId('Root', 1)).toEqual([]);
//     expect(mutableDoc.pathForElementWithId('Node', 'Node1')).toEqual([
//       'children',
//       0
//     ]);
//     expect(mutableDoc.pathForElementWithId('Node', 'Node2')).toEqual([
//       'children',
//       0,
//       'children',
//       0
//     ]);
//   });
//
//   test('Added node, its child and modified parent - hasMappedElement', () => {
//     const emptyDoc = emptyTestDocument();
//     const mutableDoc = mutableDocument(emptyDoc);
//     const addNodeCmd: InsertElement<
//       ITestDocElementsMap,
//       keyof ITestDocElementsMap,
//       INode
//     > = {
//       __typename: HDocCommandType.INSERT_ELEMENT,
//       position: ['children', 0],
//       parent: [],
//       element: {
//         __typename: 'Node',
//         _id: 'Node1',
//         children: [],
//         isChecked: false,
//         text: 'firstNode',
//         membersIds: []
//       }
//     };
//     mutableDoc.insertElement(addNodeCmd);
//     const addNodeCmd2: InsertElement<
//       ITestDocElementsMap,
//       keyof ITestDocElementsMap,
//       INode
//     > = {
//       __typename: HDocCommandType.INSERT_ELEMENT,
//       position: ['children', 0],
//       parent: ['children', 0],
//       element: {
//         __typename: 'Node',
//         _id: 'Node2',
//         children: [],
//         isChecked: true,
//         text: 'secondNode',
//         membersIds: []
//       }
//     };
//     mutableDoc.insertElement(addNodeCmd2);
//     const modifiedDoc = mutableDoc.updatedDocument();
//     // @ts-expect-error
//     expect(hasMappedElement(mutableDoc.maps, false, {})).toBe(false);
//     expect(hasMappedElement(mutableDoc.maps, 'Root', 2)).toBe(false);
//     expect(hasMappedElement(mutableDoc.maps, 'Root', 1)).toBe(true);
//     expect(hasMappedElement(mutableDoc.maps, 'Node', 'Node1')).toBe(true);
//     expect(hasMappedElement(mutableDoc.maps, 'Node', 'Node2')).toBe(true);
//     expect(hasMappedElement(mutableDoc.maps, 'Node', 'Node3')).toBe(false);
//     // @ts-expect-error
//     expect(hasMappedElement(mutableDoc.maps, 'Nod', 'Node1')).toBe(false);
//     // @ts-expect-error
//     expect(hasMappedElement(mutableDoc.maps, 'Nodes', 'Node1')).toBe(false);
//     // @ts-expect-error
//     expect(hasMappedElement(modifiedDoc.maps, false, {})).toBe(false);
//     expect(hasMappedElement(modifiedDoc.maps, 'Root', 2)).toBe(false);
//     expect(hasMappedElement(modifiedDoc.maps, 'Root', 1)).toBe(true);
//     expect(hasMappedElement(modifiedDoc.maps, 'Node', 'Node1')).toBe(true);
//     expect(hasMappedElement(modifiedDoc.maps, 'Node', 'Node2')).toBe(true);
//     expect(hasMappedElement(modifiedDoc.maps, 'Node', 'Node3')).toBe(false);
//     // @ts-expect-error
//     expect(hasMappedElement(modifiedDoc.maps, 'Nod', 'Node1')).toBe(false);
//     // @ts-expect-error
//     expect(hasMappedElement(modifiedDoc.maps, 'Nodes', 'Node1')).toBe(false);
//
//     expect(isParentedMutableMap(modifiedDoc)).toBe(false);
//     expect(isParentedMutableMap(undefined)).toBe(false);
//     expect(isParentedMutableMap(modifiedDoc.maps)).toBe(false);
//     expect(isParentedMutableMap(modifiedDoc.maps.Node)).toBe(false);
//     expect(isParentedMutableMap(modifiedDoc.maps.Root)).toBe(false);
//     expect(isParentedMutableMap(mutableDoc.maps)).toBe(false);
//     expect(isParentedMutableMap(mutableDoc.maps)).toBe(false);
//     expect(isParentedMutableMap(mutableDoc.maps.Node)).toBe(true);
//     expect(isParentedMutableMap(mutableDoc.maps.Root)).toBe(true);
//   });
// });
