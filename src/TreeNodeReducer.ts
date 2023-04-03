import {
  ChangeElement,
  ElementId,
  NodeChildrenOfTreeNode,
  NodeLink,
  TreeNode
} from './HTypes';
import {
  elementIdsEquals,
  extractElementId,
  iidToStr,
  isElementId
} from './HUtils';

interface AddNodeToLinkFieldAction<ParentField, ToNodeType> {
  __typename: 'AddNodeToLinkField';
  parentField: ParentField;
  childNodeId: ElementId<ToNodeType>;
  atIndex?: number;
}

interface RemoveNodeFromLinkFieldAction<ParentField, NodeType> {
  __typename: 'RemoveNodeFromLinkField';
  parentField: ParentField;
  childNodeId: ElementId<NodeType>;
}

interface MoveNodeWithinLinkFieldAction<ParentField, NodeType> {
  __typename: 'MoveNodeWithinLinkField';
  parentField: ParentField;
  childNodeId: ElementId<NodeType>;
  toIndex: number;
}

type LinkFieldAction<ParentField, NodeType> =
  | AddNodeToLinkFieldAction<ParentField, NodeType>
  | RemoveNodeFromLinkFieldAction<ParentField, NodeType>
  | MoveNodeWithinLinkFieldAction<ParentField, NodeType>;

function nodeLinkReducer<T>(
  state: NodeLink<T>,
  action: LinkFieldAction<any, T>
): NodeLink<T> {
  if (!(action && action.__typename)) {
    return state;
  }
  if (state instanceof Map) {
    if (action.__typename === 'AddNodeToLinkField') {
      const nodeIId = iidToStr(action.childNodeId);
      if (state.has(nodeIId)) {
        return state;
      }
      const newState = new Map(state);
      newState.set(nodeIId, extractElementId(action.childNodeId));
      return newState;
    } else if (action.__typename === 'RemoveNodeFromLinkField') {
      const nodeIId = iidToStr(action.childNodeId);
      if (!state.has(nodeIId)) {
        return state;
      }
      const newNodesIds = new Map(state);
      newNodesIds.delete(nodeIId);
      return newNodesIds;
    }
  } else if (Array.isArray(state)) {
    if (action.__typename === 'AddNodeToLinkField') {
      if (
        state.findIndex(
          existingIId =>
            existingIId.__typename === action.childNodeId.__typename &&
            existingIId._id === action.childNodeId._id
        ) !== -1
      ) {
        return state;
      }
      const atIndex = action.atIndex ? action.atIndex : state.length;
      if (atIndex < 0 || atIndex > state.length) {
        throw new RangeError('Incorrect index for insertion');
      }
      const newState = state.slice();
      if (atIndex === newState.length) {
        newState.push(extractElementId(action.childNodeId));
      } else {
        newState.splice(atIndex, 0, extractElementId(action.childNodeId));
      }
      return newState;
    } else if (action.__typename === 'MoveNodeWithinLinkField') {
      if (action.toIndex < 0 || action.toIndex > state.length) {
        throw new RangeError('Incorrect target index to move node to');
      }
      const currentIndex = state.findIndex(nodeIId =>
        elementIdsEquals(nodeIId, action.childNodeId)
      );
      if (currentIndex === -1) {
        throw new TypeError('Requested node to move not found');
      }
      let newState = state;
      if (currentIndex !== action.toIndex) {
        newState = state.slice();
        newState.splice(action.toIndex, 0, action.childNodeId);
      }
      return newState;
    } else if (action.__typename === 'RemoveNodeFromLinkField') {
      const currentIndex = state.findIndex(nodeIId =>
        elementIdsEquals(nodeIId, action.childNodeId)
      );
      if (currentIndex === -1) {
        // We don't throw an error because the end state is what we would have wished for
        return state;
      }
      const newState = state.slice();
      newState.splice(currentIndex, 1);
      return newState;
    }
  } else if (state === null || isElementId(state)) {
    if (action.__typename === 'AddNodeToLinkField') {
      if (state && elementIdsEquals(action.childNodeId, state)) {
        return state;
      } else {
        return extractElementId(action.childNodeId);
      }
    } else if (action.__typename === 'RemoveNodeFromLinkField') {
      if (state !== null) {
        return null;
      } else {
        return state;
      }
    }
  }
  return state;
}

function nodeChildrenReducer<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  N extends keyof NodesDef
>(
  state: NodeChildrenOfTreeNode<NodesDef, N>,
  action: LinkFieldAction<
    keyof NodeChildrenOfTreeNode<NodesDef, N>,
    keyof NodesDef
  >
): NodeChildrenOfTreeNode<NodesDef, N> {
  if (!(action && action.__typename)) {
    return state;
  }
  if (!(action.parentField in state)) {
    throw new TypeError('Requested link field not present');
  }
  const linkField = state[action.parentField] as NodeLink<N>;
  const updatedLinkField = nodeLinkReducer(linkField, action);
  if (updatedLinkField !== linkField) {
    return Object.assign({}, state, {[action.parentField]: updatedLinkField});
  }
  return state;
}

type TreeNodeAction<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  N extends keyof NodesDef
> =
  | LinkFieldAction<keyof NodeChildrenOfTreeNode<NodesDef, N>, keyof NodesDef>
  | ChangeElement<NodesDef, N>;

export function treeNodeReducer<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  N extends keyof NodesDef
>(state: NodesDef[N], action: TreeNodeAction<NodesDef, N>): NodesDef[N] {
  if (!(action && action.__typename)) return state;
  let updatedData = state.data;
  let updatedChildren = state.children;
  if (action.__typename === 'ChangeElementChange') {
    updatedData = Object.assign({}, state.data, action.changes);
  } else {
    updatedChildren = nodeChildrenReducer(state.children, action);
  }
  if (updatedChildren !== state.children || updatedData !== state.data) {
    return {
      ...state,
      children: updatedChildren,
      data: updatedData
    };
  }
  return state;
}
