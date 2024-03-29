import {
	AsyncVisitor,
	DocumentVisitTraversal,
	Id,
	INormalizedDocument,
	INormalizedMutableMapsDocument,
	IVisitor,
	VisitDocumentOptions
} from './HTypes';
import {isParentedId, mappedElement} from './HUtils';

/**
 * Traversal of a normalized document, calling
 * for each node the visitor function passed as parameter.
 *
 * The traversal is breadth first by default, unless the
 * goBreadthFirst parameter is false in which case its depthFirst
 *
 * @param {IDocumentSchema<MapsInterface, V>} docSchema
 * @param {INormalizedDocument<MapsInterface, U, V>} doc
 * @param {IVisitor<MapsInterface, U, V>} onNodeVisit
 * @param {Context} context
 */
export function visitDocument<
	MapsInterface,
	U extends keyof MapsInterface = keyof MapsInterface,
	Context = any
>(
	doc:
		| INormalizedDocument<MapsInterface, U>
		| INormalizedMutableMapsDocument<MapsInterface, U>,
	onNodeVisit: IVisitor<MapsInterface, U>,
	{
		context,
		traversal = DocumentVisitTraversal.BREADTH_FIRST,
		startElement,
		typesToTraverse,
		typesToVisit
	}: VisitDocumentOptions<MapsInterface, U, Context> = {}
) {
	const elementType = startElement ? startElement.type : doc.rootType;
	const elementId = startElement ? startElement._id : doc.rootId;
	const traversableMap = typesToTraverse ? new Set(typesToTraverse) : undefined;
	const visitableMap = typesToVisit ? new Set(typesToVisit) : undefined;
	for (
		const nodesToVisit: Array<[U, Id]> =
			traversal === DocumentVisitTraversal.BREADTH_FIRST
				? breadthFirstNodes(
						doc,
						elementType,
						elementId,
						traversableMap,
						visitableMap
					)
				: depthFirstNodes(
						doc,
						elementType,
						elementId,
						traversableMap,
						visitableMap
					);
		nodesToVisit.length > 0;

	) {
		const [nextType, nextId] = nodesToVisit.shift()!;
		onNodeVisit(doc, nextType, nextId, context || {});
	}
}

/**
 * Traversal of a normalized document, calling
 * for each node the async visitor function passed as parameter.
 *
 * The traversal is breadth first by default, unless the
 * goBreadthFirst parameter is false in which case its depthFirst
 *
 * @param {IDocumentSchema<MapsInterface, V>} docSchema
 * @param {INormalizedDocument<MapsInterface, U, V>} doc
 * @param {IVisitor<MapsInterface, U, V>} onNodeVisit
 * @param {Context} context
 */
export async function asyncVisitDocument<
	MapsInterface,
	U extends keyof MapsInterface = keyof MapsInterface,
	Context = any
>(
	doc:
		| INormalizedDocument<MapsInterface, U>
		| INormalizedMutableMapsDocument<MapsInterface, U>,
	onNodeVisit: AsyncVisitor<MapsInterface, U>,
	{
		context,
		traversal = DocumentVisitTraversal.BREADTH_FIRST,
		startElement,
		typesToTraverse,
		typesToVisit
	}: VisitDocumentOptions<MapsInterface, U, Context> = {}
) {
	const elementType = startElement ? startElement.type : doc.rootType;
	const elementId = startElement ? startElement._id : doc.rootId;
	const traversableMap = typesToTraverse ? new Set(typesToTraverse) : undefined;
	const visitableMap = typesToVisit ? new Set(typesToVisit) : undefined;
	for (
		const nodesToVisit: Array<[U, Id]> =
			traversal === DocumentVisitTraversal.BREADTH_FIRST
				? breadthFirstNodes(
						doc,
						elementType,
						elementId,
						traversableMap,
						visitableMap
					)
				: depthFirstNodes(
						doc,
						elementType,
						elementId,
						traversableMap,
						visitableMap
					);
		nodesToVisit.length > 0;

	) {
		const [nextType, nextId] = nodesToVisit.shift()!;
		await onNodeVisit(doc, nextType, nextId, context || {});
	}
}

function breadthFirstNodes<
	MapsInterface,
	U extends keyof MapsInterface = keyof MapsInterface
>(
	doc:
		| INormalizedDocument<MapsInterface, U>
		| INormalizedMutableMapsDocument<MapsInterface, U>,
	nodeType: U,
	nodeId: Id,
	typesToTraverse?: Set<U>,
	typesToVisit?: Set<U>,
	nodesVisited: Set<string> = new Set()
): Array<[U, Id]> {
	const nodeUid = `${String(nodeType)}:${nodeId}`;
	if (nodesVisited.has(nodeUid)) {
		return [];
	} else {
		nodesVisited.add(nodeUid);
	}
	const element = mappedElement(doc.maps, nodeType, nodeId);
	if (!isParentedId(element)) return [];
	const nodeList: Array<[U, Id]> =
		typesToVisit && !typesToVisit.has(nodeType) ? [] : [[nodeType, nodeId]];
	const childrenToVisit: Array<[U, Id]> = [];
	const nodeSchema = doc.schema.types[nodeType];
	for (const linkField in nodeSchema) {
		if (linkField === 'parentId') continue;
		const linkFieldProps = nodeSchema[linkField][0];
		const {__schemaType} = linkFieldProps;
		if (typesToTraverse && !typesToTraverse.has(__schemaType)) {
			continue;
		}
		const fieldIds = (element as any)[linkField] as Id[];
		for (const fieldId of fieldIds) {
			childrenToVisit.push([__schemaType, fieldId]);
		}
	}
	for (const [childType, childId] of childrenToVisit) {
		nodeList.push(
			...breadthFirstNodes(
				doc,
				childType,
				childId,
				typesToTraverse,
				typesToVisit,
				nodesVisited
			)
		);
	}
	return nodeList;
}

function depthFirstNodes<
	MapsInterface,
	U extends keyof MapsInterface = keyof MapsInterface
>(
	doc:
		| INormalizedDocument<MapsInterface, U>
		| INormalizedMutableMapsDocument<MapsInterface, U>,
	nodeType: U,
	nodeId: Id,
	typesToTraverse?: Set<U>,
	typesToVisit?: Set<U>,
	nodesVisited: Set<string> = new Set()
): Array<[U, Id]> {
	const nodeUid = `${String(nodeType)}:${nodeId}`;
	if (nodesVisited.has(nodeUid)) {
		return [];
	} else {
		nodesVisited.add(nodeUid);
	}
	const nodeList: Array<[U, Id]> =
		typesToVisit && !typesToVisit.has(nodeType) ? [] : [[nodeType, nodeId]];
	const element = mappedElement(doc.maps, nodeType, nodeId);
	if (!isParentedId(element)) return [];
	const nodeSchema = doc.schema.types[nodeType];
	for (const linkField in nodeSchema) {
		if (linkField === 'parentId') continue;
		const linkFieldProps = nodeSchema[linkField][0];
		const {__schemaType} = linkFieldProps;
		if (typesToTraverse && !typesToTraverse.has(__schemaType)) {
			continue;
		}
		const fieldIds = (element as any)[linkField] as Id[];
		for (const fieldId of fieldIds) {
			nodeList.unshift(
				...depthFirstNodes(
					doc,
					__schemaType,
					fieldId,
					typesToTraverse,
					typesToVisit,
					nodesVisited
				)
			);
		}
	}
	return nodeList;
}
