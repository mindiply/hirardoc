import {Id, IDocumentSchema, INormalizedDocument, IParentedId} from '../src/HTypes'

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

export const testDocSchema: IDocumentSchema<ITestDocElementsMap> = {
  documentType: 'TestDocSchema',
  rootType: 'Root',
  types: {
    'Root': {
      children: [{__schemaType: 'Node', notNull: true}]
    },
    'Node': {
      children: [{
        __schemaType: 'Node',
        notNull: true
      }]
    }
  }
}
