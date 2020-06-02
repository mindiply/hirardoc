import {
  AllMappedTypesFields,
  DocumentVisitTraversal,
  HDocCommandType,
  HDocOperation,
  IChangeElement,
  Id,
  IDeleteElement,
  IDocumentSchema,
  IFieldEntityReference,
  IInsertElement,
  IMoveElement,
  INormalizedDocument,
  INormalizedMutableMapsDocument,
  IParentedId,
  MappedParentedTypesFields,
  MapsOfNormDoc,
  UOfNormDoc
} from './HTypes';
import {
  hasMappedElement,
  isParentedId,
  mappedElement,
  mutableDocument,
  pathForElementWithId
} from './HDocument';
import {isEqual, omit} from 'lodash';
import {visitDocument} from './HVisit';

/**
 * Returns a list of HDocOperations that if applied
 * will transform baseDoc in laterDoc. laterDoc
 * is assumed to have the same root element and schema as
 * baseDoc
 *
 * @param {INormalizedDocument<MapsInterface, U>} baseDoc
 * @param {INormalizedDocument<MapsInterface, U>} laterDoc
 * @returns {HDocOperation<MapsInterface, any, U>[]}
 */
export function diff<NorDoc extends INormalizedDocument<any, any>>(
  baseDoc: NorDoc,
  laterDoc: NorDoc
): HDocOperation<MapsOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>, any>[] {
  /**
   * We visit laterDoc breadth first, and for each element visited
   * we ensure that the info is up to date and that the children
   * in laterDoc are all in the correct position.
   *
   * If a move is needed info changes are also performed to avoid
   * a second change info command. At the end of the visit some
   * children arrays may have additional elements in the list.
   *
   * These elements will either move somewhere else later in the
   * tree visit, if they are still present in laterdoc, or they
   * will be deleted after the visit.
   */
  if (
    !(
      baseDoc.schema === laterDoc.schema &&
      baseDoc.rootType === laterDoc.rootType &&
      baseDoc.rootId === laterDoc.rootId
    )
  ) {
    return [];
  }
  const mutableDoc = mutableDocument(baseDoc);
  visitDocument(
    laterDoc,
    (doc, nodeType, nodeId) => {
      const destElement = mappedElement(laterDoc.maps, nodeType, nodeId);
      let mutableElement = mappedElement(mutableDoc.maps, nodeType, nodeId);
      if (!isParentedId(destElement) || !isParentedId(mutableElement)) {
        throw new ReferenceError(`Node ${nodeType}:${nodeId} not found`);
      }

      // 1. If we are an existing node, check if the info fields should be
      // updated
      const nodePath = pathForElementWithId(mutableDoc, nodeType, nodeId);
      if (hasMappedElement(baseDoc.maps, nodeType, nodeId)) {
        const infoChanges = diffInfoOf<
          MapsOfNormDoc<NorDoc>,
          UOfNormDoc<NorDoc>,
          MappedParentedTypesFields<MappedParentedTypesFields<NorDoc>>
        >(mutableDoc, laterDoc, nodeType, nodeId);
        if (Object.keys(infoChanges).length > 0) {
          const changeElementCmd: IChangeElement<
            MapsOfNormDoc<NorDoc>,
            UOfNormDoc<NorDoc>,
            IParentedId<UOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>
          > = {
            __typename: HDocCommandType.CHANGE_ELEMENT,
            targetElement: {
              __typename: nodeType,
              _id: nodeId
            },
            path: nodePath,
            changes: {__typename: destElement.__typename, ...infoChanges}
          };
          mutableDoc.changeElement(changeElementCmd);
        }
      }

      // 2. Iterate across the children
      const {schema} = doc;
      for (const linkFieldName in schema.types[nodeType]) {
        if (linkFieldName === 'parentId') continue;
        const fieldLink = schema.types[nodeType][linkFieldName] as
          | IFieldEntityReference<UOfNormDoc<NorDoc>>
          | [IFieldEntityReference<UOfNormDoc<NorDoc>>];
        if (Array.isArray(fieldLink)) {
          const {__schemaType: childType} = fieldLink[0];
          const destChildrenIds: Id[] = (destElement as any)[linkFieldName];
          for (let i = 0; i < destChildrenIds.length; i++) {
            const destChildId = destChildrenIds[i];
            // Every iteration of dest child, there is a chance that the mutable
            // element has changed, so I need to refresh to the latest reference
            mutableElement = mappedElement(mutableDoc.maps, nodeType, nodeId);
            const mutableChildrenIds: Id[] = (mutableElement as any)[
              linkFieldName
            ];
            const mutableChildId =
              i < mutableChildrenIds.length ? mutableChildrenIds[i] : null;
            const destChild = mappedElement(
              laterDoc.maps,
              childType,
              destChildId
            );
            if (!isParentedId(destChild)) {
              throw new ReferenceError(
                `Child node ${childType}:${destChildId} not found`
              );
            }

            if (destChildId !== mutableChildId) {
              // No else branch needed, the position is the same and the visit to the child node
              // will take care of the potential differences int he data within the child node
              if (hasMappedElement(mutableDoc.maps, childType, destChildId)) {
                // Node exists in the document, move it from there
                const childInfoDiff = diffInfoOf(
                  mutableDoc,
                  laterDoc,
                  childType,
                  destChildId
                );
                const moveChildCmd: IMoveElement<
                  MapsOfNormDoc<NorDoc>,
                  UOfNormDoc<NorDoc>,
                  IParentedId<UOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>
                > = {
                  __typename: HDocCommandType.MOVE_ELEMENT,
                  targetElement: {
                    _id: destChildId,
                    __typename: childType
                  },
                  fromPath: pathForElementWithId(
                    mutableDoc,
                    childType,
                    destChildId
                  ),
                  toParentPath: pathForElementWithId(
                    mutableDoc,
                    nodeType,
                    nodeId
                  ),
                  toPosition: [
                    (linkFieldName as any) as AllMappedTypesFields<
                      MapsOfNormDoc<NorDoc>
                    >,
                    i
                  ],
                  changes:
                    Object.keys(childInfoDiff).length > 0
                      ? {
                          __typename: destChild.__typename,
                          ...omit(childInfoDiff, '__typename')
                        }
                      : undefined
                };
                mutableDoc.moveElement(moveChildCmd);
              } else {
                // New element, let's add the basic info from it,
                // emptying children links
                const elementInfo = {...(destChild as IParentedId)};
                for (const childLinkFieldName in schema.types[childType]) {
                  if (childLinkFieldName === 'parentId') continue;
                  const childFieldLink =
                    schema.types[childType][childLinkFieldName];
                  (elementInfo as any)[childLinkFieldName] = Array.isArray(
                    childFieldLink
                  )
                    ? []
                    : null;
                }
                const addChildCmd: IInsertElement<
                  MapsOfNormDoc<NorDoc>,
                  UOfNormDoc<NorDoc>,
                  IParentedId<UOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>
                > = {
                  __typename: HDocCommandType.INSERT_ELEMENT,
                  parentPath: nodePath,
                  position: [
                    (linkFieldName as any) as AllMappedTypesFields<
                      MapsOfNormDoc<NorDoc>
                    >,
                    i
                  ],
                  element: elementInfo,
                  targetElement: {
                    __typename: childType,
                    _id: destChild._id
                  }
                };
                mutableDoc.insertElement(addChildCmd);
              }
            }
          }
        } else {
          if (
            (destElement as any)[linkFieldName] !==
            (mutableElement as any)[linkFieldName]
          ) {
            const changeLinkFieldCmd: IChangeElement<
              MapsOfNormDoc<NorDoc>,
              UOfNormDoc<NorDoc>,
              IParentedId<UOfNormDoc<NorDoc>, UOfNormDoc<NorDoc>>
            > = {
              __typename: HDocCommandType.CHANGE_ELEMENT,
              path: pathForElementWithId(mutableDoc, nodeType, nodeId),
              targetElement: {
                __typename: nodeType,
                _id: nodeId
              },
              changes: {
                __typename: destElement.__typename,
                [linkFieldName]: (destElement as any)[linkFieldName]
              }
            };
            mutableDoc.changeElement(changeLinkFieldCmd);
          }
        }
      }
    },
    {}
  );

  // After replicating the destination tree, I can go through the mutable document
  // depth first and delete any element that was in the base tree but is not in
  // the destination tree
  visitDocument(
    mutableDoc,
    (doc, nodeType, nodeId) => {
      if (!hasMappedElement(laterDoc.maps, nodeType, nodeId)) {
        const deleteElementCmd: IDeleteElement<
          MapsOfNormDoc<NorDoc>,
          UOfNormDoc<NorDoc>
        > = {
          __typename: HDocCommandType.DELETE_ELEMENT,
          path: pathForElementWithId(doc, nodeType, nodeId),
          targetElement: {
            __typename: nodeType,
            _id: nodeId
          }
        };
        mutableDoc.deleteElement(deleteElementCmd);
      }
    },
    {},
    DocumentVisitTraversal.DEPTH_FIRST
  );
  return mutableDoc.changes;
}

/**
 * Given a base version and a later version of a document element
 * with schema schema and type elementType, returns a Partial version
 * of the element containing the info fields that have changed between baseEl
 * and laterEl.
 *
 * @param {IDocumentSchema<MapsInterface, U>} schema
 * @param {U} elementType
 * @param {T} baseEl
 * @param {T} laterEl
 * @returns {Partial<T>}
 */
export function diffElementInfo<
  MapsInterface,
  U extends keyof MapsInterface,
  T extends IParentedId<U, U>
>(
  schema: IDocumentSchema<MapsInterface, U>,
  elementType: U,
  baseEl: T,
  laterEl: T
): Partial<T> {
  const infoDiff: Partial<T> = {};
  const elementLinkedFields = schema.types[elementType];
  if (!elementLinkedFields) {
    return infoDiff;
  }
  const fieldsChecked: Set<string> = new Set();
  for (const fieldName in baseEl) {
    if (fieldName === 'parentId' || fieldName in elementLinkedFields) {
      continue;
    }
    fieldsChecked.add(fieldName);
    const baseVal = (baseEl as any)[fieldName];
    const laterVal = (laterEl as any)[fieldName];
    if (!isEqual(baseVal, laterVal)) {
      infoDiff[fieldName] = laterVal;
    }
  }
  for (const fieldName in laterEl) {
    if (
      fieldName === 'parentId' ||
      fieldName in elementLinkedFields ||
      fieldsChecked.has(fieldName)
    ) {
      continue;
    }
    // If the field is not in the set of checked fields,
    // it was undefined in base but is defined in later
    infoDiff[fieldName] = (laterEl as any)[fieldName];
  }
  return infoDiff;
}

export function diffInfoOf<
  MapsInterface,
  U extends keyof MapsInterface,
  T extends MappedParentedTypesFields<MapsInterface>
>(
  baseDoc:
    | INormalizedDocument<MapsInterface, U>
    | INormalizedMutableMapsDocument<MapsInterface, U>,
  laterDoc:
    | INormalizedDocument<MapsInterface, U>
    | INormalizedMutableMapsDocument<MapsInterface, U>,
  elementType: U,
  elementId: Id
): Partial<T> {
  if (
    !hasMappedElement(baseDoc.maps, elementType, elementId) ||
    !hasMappedElement(laterDoc.maps, elementType, elementId)
  ) {
    return {};
  }
  const baseEl = mappedElement(baseDoc.maps, elementType, elementId) as T;
  const laterEl = mappedElement(laterDoc.maps, elementType, elementId) as T;
  return diffElementInfo(baseDoc.schema, elementType, baseEl, laterEl);
}
