# hirardoc

Library for hierarchical offline first documents.

Documents are represented as hierarchies of normalized elements, with a single 
root element.

The basic shape of a hierarchical document is

    interface INormalizedDocument {
        rootType: RootElementTypeName;
        rootId: Id;
        maps: {
            [ElementTypeName: string]: Map<Id, IElementTypeName>;
        }
    } 

The library provides move low level operations on these types of documents (insert, change, delete, move), the
ability to diff between versions of a document and performing three-way merges of the document.

The library is a foundation for higher-level data structures that still want to have a unified way
to represent changes and distribute these changes for synchronising data via merges and deltas.  

## The gist

Declare the type of elements in your hierarchical documents:

    interface IRoot extends IParentedId<'Root', null> {
        name: string;
        children: Id[]
    }
    
    interface INode extends IParentedId<'Node', 'Root'> {
        name: string;
        children: Id[];
    }
    
    interface ITestDocElementTypes {
        Root: IRoot;
        Node: INode;
    }
    
Each document should come with its schema



Then create a mutable version of a document
