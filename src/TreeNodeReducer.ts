import {
  ChangeElement,
  ElementId,
  LinkType,
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
  nodeId: ElementId<ToNodeType>;
  atIndex?: number;
}

interface RemoveNodeFromLinkFieldAction<ParentField, NodeType> {
  __typename: 'RemoveNodeFromLinkField';
  parentField: ParentField;
  nodeId: ElementId<NodeType>;
}

interface MoveNodeWithinLinkFieldAction<ParentField, NodeType> {
  __typename: 'MoveNodeWithinLinkField';
  parentField: ParentField;
  nodeId: ElementId<NodeType>;
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
      const nodeIId = iidToStr(action.nodeId);
      if (state.has(nodeIId)) {
        return state;
      }
      const newState = new Map(state);
      newState.set(nodeIId, extractElementId(action.nodeId));
      return newState;
    } else if (action.__typename === 'RemoveNodeFromLinkField') {
      const nodeIId = iidToStr(action.nodeId);
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
            existingIId.__typename === action.nodeId.__typename &&
            existingIId._id === action.nodeId._id
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
        newState.push(extractElementId(action.nodeId));
      } else {
        newState.splice(atIndex, 0, extractElementId(action.nodeId));
      }
      return newState;
    } else if (action.__typename === 'MoveNodeWithinLinkField') {
      if (action.toIndex < 0 || action.toIndex > state.length) {
        throw new RangeError('Incorrect target index to move node to');
      }
      const currentIndex = state.findIndex(nodeIId =>
        elementIdsEquals(nodeIId, action.nodeId)
      );
      if (currentIndex === -1) {
        throw new TypeError('Requested node to move not found');
      }
      let newState = state;
      if (currentIndex !== action.toIndex) {
        newState = state.slice();
        newState.splice(action.toIndex, 0, action.nodeId);
      }
      return newState;
    } else if (action.__typename === 'RemoveNodeFromLinkField') {
      const currentIndex = state.findIndex(nodeIId =>
        elementIdsEquals(nodeIId, action.nodeId)
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
      if (state && elementIdsEquals(action.nodeId, state)) {
        return state;
      } else {
        return extractElementId(action.nodeId);
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
  N extends keyof NodesDef,
  K extends keyof NodeChildrenOfTreeNode<NodesDef, N>
>(state: NodesDef[N], action: LinkFieldAction<K, N>): NodesDef[N] {
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

type TreeNodeAction = LinkFieldAction<any, any> | ChangeElement<any>;

export function treeNodeReducer<
  NodesDef extends Record<
    keyof NodesDef,
    TreeNode<NodesDef, keyof NodesDef, any, any, any>
  >,
  N extends keyof NodesDef
>(state: NodesDef[N], action: TreeNodeAction): NodesDef[N] {
  if (!(action && action.__typename)) return state;
  let updatedState = state;
  if (action.__typename === 'ChangeElementChange') {
    updatedState = Object.assign({}, updatedState, action.changes);
  }
  updatedState = nodeChildrenReducer(
    updatedState,
    action as LinkFieldAction<any, any>
  );

  return updatedState;
}
