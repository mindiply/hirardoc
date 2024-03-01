import {
	AllMappedTypesFields,
	ArrayChange,
	ArrayKeepElement,
	DiffArrayResult,
	DocumentVisitTraversal,
	EqualFn,
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
	UOfNormDoc,
	WasTouchedFn
} from './HTypes';
import {mutableDocument, pathForElementWithId} from './HDocument';
import {isEqual, omit} from 'lodash';
import {visitDocument} from './HVisit';
import {assert, hasMappedElement, isParentedId, mappedElement} from './HUtils';
import {defaultWasTouchedFn} from './bufferDiff3';

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
						element: nodePath,
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
									element: pathForElementWithId(
										mutableDoc,
										childType,
										destChildId
									),
									toParent: pathForElementWithId(mutableDoc, nodeType, nodeId),
									toPosition: [
										linkFieldName as any as AllMappedTypesFields<
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
									parent: nodePath,
									position: [
										linkFieldName as any as AllMappedTypesFields<
											MapsOfNormDoc<NorDoc>
										>,
										i
									],
									element: elementInfo
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
							element: pathForElementWithId(mutableDoc, nodeType, nodeId),
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
					element: pathForElementWithId(doc, nodeType, nodeId)
				};
				mutableDoc.deleteElement(deleteElementCmd);
			}
		},
		{
			context: {},
			traversal: DocumentVisitTraversal.DEPTH_FIRST
		}
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
	const elementLinkedFields = schema.types[elementType] || {};
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

export const defaultEquals = (a: any, b: any) => a === b;

interface BaseElementStatus<T> {
	element: T;
	originalIndex: number;
	finalIndex: number | null;
	filteredIndex: number;
	currentIndex: number;
}

/**
 * Creates a diff between two arrays, returning a list of change operations
 * that would bring the base array to the later array.
 *
 * Elements are considered equal based on the equalsFn parameter, that by
 * default uses the === boolean operator. You can use equals from lodash for
 * deep compares, for instance.
 *
 * The diff result returns both the list of sequential changes in the changes
 * member, and an array that has the same number of elements as the base array.
 * Each element shows what happened to the base element in the later array:
 * kept in the same position, moved to the left of the array or deleted.
 *
 * @param {T[]} base
 * @param {T[]} later
 * @param {EqualFn} equalsFn
 * @returns {DiffArrayResult<T>}
 */
export function diffArray<T>(
	base: T[],
	later: T[],
	{
		equalsFn = defaultEquals,
		wasTouchedFn = defaultWasTouchedFn
	}: {
		equalsFn?: EqualFn;
		wasTouchedFn?: WasTouchedFn<T>;
	} = {}
): DiffArrayResult<T> {
	const elementChanges: Array<null | ArrayKeepElement | ArrayChange<T>> = [];
	const changes: ArrayChange<T>[] = [];

	const baseElementsQueue: BaseElementStatus<T>[] = [];
	const existingElementsIndexes: Map<number, number> = new Map();

	// 1. Find elements deleted from base.
	for (let i = 0; i < base.length; i++) {
		const laterIndex = later.findIndex(laterEl => equalsFn(laterEl, base[i]));
		if (laterIndex !== -1) {
			existingElementsIndexes.set(laterIndex, i);
			baseElementsQueue.push({
				element: base[i],
				originalIndex: i,
				finalIndex: laterIndex,
				currentIndex: baseElementsQueue.length,
				filteredIndex: -1
			});
			elementChanges.push({
				__typename: 'KeepElement',
				elIndex: i,
				wasTouched: wasTouchedFn(base[i])
			});
		} else {
			changes.push({
				__typename: 'DeleteElement',
				elIndex: i
			});
			elementChanges.push(changes[changes.length - 1]);
		}
	}

	// 2. Move the remaining elements after deletions until the order respect the
	// order in later, filtered of the elements that have been added since base
	const filteredFinal = [...baseElementsQueue];
	filteredFinal.sort(cmpByFinalIndex);
	for (let i = 0; i < filteredFinal.length; i++) {
		filteredFinal[i].filteredIndex = i;
	}

	for (let i = 0, k = filteredFinal.length - 1; k > i; ) {
		if (filteredFinal[i].currentIndex === i) {
			i++;
		} else if (filteredFinal[k].currentIndex === k) {
			k--;
		} else if (
			Math.abs(
				filteredFinal[i].currentIndex - filteredFinal[i].filteredIndex
			) >=
			Math.abs(filteredFinal[k].currentIndex - filteredFinal[k].filteredIndex)
		) {
			changes.push({
				__typename: 'ArrayMoveElementLeft',
				afterElIndex: i > 0 ? filteredFinal[i - 1].originalIndex : null,
				elIndex: filteredFinal[i].originalIndex
			});
			elementChanges[filteredFinal[i].originalIndex] =
				changes[changes.length - 1];
			const [el] = baseElementsQueue.splice(filteredFinal[i].currentIndex, 1);
			baseElementsQueue.splice(filteredFinal[i].filteredIndex, 0, el);
			for (let j = i + 1; j <= k; j++) {
				baseElementsQueue[j].currentIndex = j;
			}
			i++;
		} else {
			changes.push({
				__typename: 'ArrayMoveElementRight',
				beforeElIndex:
					k < filteredFinal.length - 1
						? filteredFinal[k + 1].originalIndex
						: null,
				elIndex: filteredFinal[k].originalIndex
			});
			elementChanges[filteredFinal[k].originalIndex] =
				changes[changes.length - 1];
			const [el] = baseElementsQueue.splice(filteredFinal[k].currentIndex, 1);
			baseElementsQueue.splice(filteredFinal[k].filteredIndex, 0, el);
			for (let j = k - 1; j >= i; j--) {
				baseElementsQueue[j].currentIndex = j;
			}
			k--;
		}
	}

	// 3. Add the elements in later that were not in base
	for (let laterIndex = 0; laterIndex < later.length; laterIndex++) {
		if (!existingElementsIndexes.has(laterIndex)) {
			const afterElIndex =
				laterIndex > 0
					? existingElementsIndexes.has(laterIndex - 1)
						? existingElementsIndexes.get(laterIndex - 1)!
						: null
					: null;
			changes.push({
				__typename: 'AddElement',
				element: later[laterIndex],
				afterElIndex
			});
			elementChanges.push(changes[changes.length - 1]);
			existingElementsIndexes.set(laterIndex, elementChanges.length - 1);
		}
	}

	return {
		elementChanges: elementChanges.slice(0, base.length) as Array<
			ArrayKeepElement | ArrayChange<T>
		>,
		changes
	};
}

function cmpByFinalIndex(a: BaseElementStatus<any>, b: BaseElementStatus<any>) {
	return (a.finalIndex || -1) - (b.finalIndex || -1);
}

interface ArrayElementPos<T> {
	element: T;
	currentIndex: number;
	elIndex: number;
}

/**
 * Given a base array and an array of array changes, returns a shallow copied
 * version of the base array to which all the changes have been applied in
 * sequence.
 *
 * @param {T[]} base
 * @param {ArrayChange<T>[]} changes
 * @returns {T[]}
 */
export function applyArrayDiff<T>(base: T[], changes: ArrayChange<T>[]): T[] {
	const elements: ArrayElementPos<T>[] = base.map((_, i) => ({
		element: base[i],
		currentIndex: i,
		elIndex: i
	}));
	const res = [...elements];

	for (const change of changes) {
		if (change.__typename === 'AddElement') {
			const {afterElIndex, element} = change;
			assert(
				afterElIndex === null ||
					(afterElIndex >= 0 && afterElIndex < elements.length),
				'Expect valid insertion index'
			);
			const afterElement =
				afterElIndex === null ? null : elements[afterElIndex];
			const targetIndex =
				afterElement === null ? 0 : afterElement.currentIndex + 1;
			elements.push({
				element,
				elIndex: elements.length,
				currentIndex: targetIndex
			});
			res.splice(targetIndex, 0, elements[elements.length - 1]);
			for (let i = targetIndex + 1; i < res.length; i++) {
				res[i].currentIndex++;
			}
		} else if (change.__typename === 'ArrayMoveElementLeft') {
			const {elIndex, afterElIndex} = change;
			assert(
				elIndex >= 0 && elIndex < elements.length,
				'Expect the element index to be valid'
			);
			assert(
				afterElIndex === null ||
					(afterElIndex >= 0 && afterElIndex < elements.length),
				'Valid afterElIndex expected'
			);
			const elementToMove = elements[elIndex];
			const afterElement =
				afterElIndex === null ? null : elements[afterElIndex];
			const targetIndex = afterElement ? afterElement.currentIndex + 1 : 0;
			const moveFromIndex = elementToMove.currentIndex;
			assert(
				targetIndex < moveFromIndex,
				'Moving left - target should be less than source'
			);
			const [el] = res.splice(moveFromIndex, 1);
			el.currentIndex = targetIndex;
			res.splice(targetIndex, 0, el);
			for (let i = targetIndex + 1; i <= moveFromIndex; i++) {
				res[i].currentIndex++;
			}
		} else if (change.__typename === 'ArrayMoveElementRight') {
			const {elIndex, beforeElIndex} = change;
			assert(
				elIndex >= 0 && elIndex < elements.length,
				'Expect the element index to be valid'
			);
			assert(
				beforeElIndex === null ||
					(beforeElIndex >= 0 && beforeElIndex < elements.length),
				'Valid afterElIndex expected'
			);
			const elementToMove = elements[elIndex];
			const beforeElement =
				beforeElIndex === null ? null : elements[beforeElIndex];
			const targetIndex = beforeElement
				? beforeElement.currentIndex - 1
				: res.length - 1;
			const moveFromIndex = elementToMove.currentIndex;
			const [el] = res.splice(moveFromIndex, 1);
			el.currentIndex = targetIndex;
			res.splice(targetIndex, 0, el);
			for (let i = moveFromIndex; i < targetIndex; i++) {
				res[i].currentIndex--;
			}
		} else if (change.__typename === 'DeleteElement') {
			const {elIndex} = change;
			const targetElement = elements[elIndex];
			const targetIndex = targetElement.currentIndex;
			res.splice(targetIndex, 1);
			for (let i = targetIndex; i < res.length; i++) {
				res[i].currentIndex--;
			}
		}
	}
	return res.map(element => element.element);
}
