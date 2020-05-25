import {testDocSchema, TestNormalizeDocument} from './testTypes';

const emptyTestDocument = (): TestNormalizeDocument => ({
  maps: {
    Root: new Map([
      [
        1,
        {
          __typename: 'Root',
          _id: 1,
          createdAt: new Date(),
          name: 'root',
          children: [],
          parentType: null,
          parentId: null
        }
      ]
    ]),
    Node: new Map()
  },
  rootType: 'Node',
  rootId: 1,
  schema: testDocSchema
});

describe('Test the basic operations', () => {
  test('The empty document', () => {
    const emptyDoc = emptyTestDocument();

  });
})
