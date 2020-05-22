import {Id, INormalizedDocument, IParentedId} from '../src/HTypes';

export interface IRoot extends IParentedId<'Root', null> {
  name: string;
  createdAt: Date;
}

export interface INode extends IParentedId<'Node', 'Root' | 'Node'> {
  text: string;
  isChecked: boolean;
  children: Id[];
}

export interface ITestDocElementsMap {
  Root: Map<Id, IRoot>;
  Node: Map<Id, INode>;
}

export type TestNormalizeDocument = INormalizedDocument<
  ITestDocElementsMap,
  keyof ITestDocElementsMap
>;
