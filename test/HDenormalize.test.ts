import {compactTreeNode, Id} from '../src';
import {creationDate, emptyTestDocument} from './testTypes';

describe('Compact tree nodes', () => {
  test('Empty root', () => {
    const doc = emptyTestDocument();
    const compactRoot = compactTreeNode(doc.getNode(doc.rootId)!);
    expect(compactRoot).toMatchObject({
      __typename: 'Root',
      _id: 1,
      name: 'root',
      createdAt: creationDate,
      children: []
    });
  });

  test('Empty node', () => {
    const doc = emptyTestDocument();
    const compactRoot = compactTreeNode(doc.emptyNode('Node'));
    expect(compactRoot).toMatchObject({
      __typename: 'Node',
      text: '',
      isChecked: false,
      membersIds: [],
      children: []
    });
  });
});
