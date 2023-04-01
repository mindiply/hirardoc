# hirardoc

Library for hierarchical offline first documents.

A document is represented by a hierarchy of normalized elements, with a single 
root element.

The basic shape of a hierarchical document is

    interface INormalizedDocument {
        rootType: RootElementTypeName;
        rootId: Id;
        maps: {
            [ElementTypeName: string]: Map<Id, IElementTypeName>;
        }
    } 

The library provides:
1. low level operations on these types of documents (insert, change, delete, move)
2. ability to diff between versions of a document
3. perform information loss preventing three-way merges of the document,
  with hooks in the merging algorithm to take domain specific decisions in detecting
  and resolving conflicts

The library is a foundation for higher-level data structures that still want to have a unified way
to represent changes and distribute these changes for synchronising data via merges and deltas.  

## The gist

### Declaring your document structure

Declare the type of elements in your hierarchical documents:

    interface IRoot extends IParentedId<'Root', null> {
        name: string;
        children: Id[]
    }
    
    interface INode extends IParentedId<'Node', 'Root'> {
        name: string;
        children: Id[];
    }
    
    interface ITestDocElementsMap {
        Root: Map<Id, IRoot>;
        Node: Map<Id, INode>;
    }
    
Each document should come with its schema

    const testDocSchema: IDocumentSchema<ITestDocElementsMap> = {
      documentType: 'TestDocSchema',
      rootType: 'Root',
      types: {
        Root: {
          children: [{__schemaType: 'Node', notNull: true}]
        },
        Node: {
          children: [
            {__schemaType: 'Node', notNull: true}]
        }
      }
    };

### Changing your document

Then either create a mutable version of a document, to perform
a sequence of changes on it, or call a reducer with one or more
operations on it to change it.

    docReducer(emptyTestDocument(), [
            {
              __typename: HDocCommandType.INSERT_ELEMENT,
              position: ['children', 0],
              parentPath: [],
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
              parentPath: [],
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

### Diffing a document

    diff(baseDoc, laterDoc)
    
    it returns a minimal array of document operation that will
    transfrom baseDoc in laterDoc
    
### Three-way merge between documents

    const baseTree = docReducer(emptyTestDocument(), {
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
    });
    const myTree = docReducer(baseTree, [
      {
        __typename: HDocCommandType.INSERT_ELEMENT,
        position: ['children', 0],
        parentPath: [],
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
        parentPath: [],
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
        path: ['children', 1]
      }
    ]);
    const {mergedDoc, conflicts} = threeWayMerge(baseTree, myTree, theirTree);
    
**mergedDoc** contains the merged normalized document. The tree will
still have the same elements as the documents in inp

The information in **conflicts** will tell you of any conflicts which either
were not resolved or were resolved but are provided to show which options were
available.

A non-trivial conflict object looks like this:

{
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
        ],
        [
            'Node2_1',
            {
                positionConflicts: {
                    clonedElements: ['NewSubtreeRootId'],
                    status: MergeStatus.automerged
                }
            }
        ]
      ]),
      Root: new Map()
    };
    
There are two types of conflicts:

1. Field value conflicts, where the same field was changed concurrently
   and it's not clear which the winner should be
2. Positional conflicts, when the same element has been placed in different
  positions in the document hierarchy. These are the more interesting one the library deals
  with and where hooks are provided to affect how the merge works
  
  
## Customizing the 3-way merge

To be documented. Using some code from node-diff3 to avoid package dependency.
