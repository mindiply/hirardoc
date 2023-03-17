# HDocuments

HDocuments are structured hierarchical documents that:
1. Have a discrete number of element types
2. Have normalized maps, one map for each element type
3. Have a single root element
4. Each element has one parent and one parent only
  except the root element, which has no parent
5. The parent to child relationship happens only with one specific field

# HVersioning 3-way merging strategy
The principles guiding HVersioning
1. Do not lose data
2. Make sensible tentative decisions on conflicts
  - For atomic values, automatically select the largest change
3. Pluggable - detection and auto-resolution of conflicts can be customised for specific element types, so that domain specific constraints and properties can be used for resolution

## Types of conflicts

### Positional conflicts
This type of conflict happens when an element has been moved from its position in the base version to conflicting positions in the left and right versions of the document.

The conflict has two subtypes
1. Moved to a different parent in a least one of the later versions
2. Stayed within the same parent in both versions but in incompatible positions

### Data conflicts
These types of conflicts happen within non-positional fields of the element. Positional fields either the parent fields or fields linking to children or other elements (without the parent/child relationship).

The merging strategy for these data fields depends on the data type:

- For text, check if a 3diff merge can be done without conflicts. If it can, use that as the automerge value, otherwise mark an open conflict
- For numbers and dates, if the values in left and right versions are different from each other and from the base version, mark an open conflict. As auto-merged value keep the version that has the largest difference from the original type. If the difference is the same, keep the lowest of the two values
- For single linked fields, mark an open conflict. As auto-merged value keep the link with the lowest id.

# The merge algorithm

    function threeWayMerge(base, left, right)
      [mergedTree, conflicts] = createMergedTree(base, left, right)
      return {
        mergedTree,
        conflicts,
        delta: diff(base, left)
      }
  

    function createMergedTree(baseTree, leftTree, rightTree)
        mergeTree = clone(baseTree)
        mergeLeft = clone(leftTree) -- Used if we clone one or more nodes, to have reidd nodes
        mergeRight = clone(rightTree)
        nodeQueue = [[rootType, roodId]]
        while nodeQueue not empty
            [nodeType, nodeId] = nodeQueue.shift()
            [conflicts, mergedValue] = mergeInfo(nodeType, nodeId)
            For linkedField in node.children
                If isArray(linkedField)
                    mergeLinkedArray(base, left, right, node, field)
                    addToQueue(...node[linkedField])
                Else
                    mergeLinkRecord(base, left, right, nodde, field)
                    addToQueue(node[linkedField])
        For element in depthFirstVisit(mergedTree)
          If (element should be deleted in mergedTree)
              deleteElement(element)
    
    function mergeLinkedArray(base, left, right, nodeType, nodeId, linkedField)
      orderOfEvaluation = sortOn(linkedField, base, left, right, cmpFN)
        for ([nodeType, nodeId], i = 0 in orderOfEvaluation, j = 0)
          If node in base
            If leftEdited and rightEdited
              If positionCompatible(base, left, right)
                If !leftProcessed && currentArray[j] !== node._id
                    moveToMergePosition()
                j++
              Else
                shouldAdvance = customResolution ? customeRsolution () :
                  Reid subtree of element in other position
                  If currentArray[j] !== node._id
                    moveToMergePosition()
                  Else
                    noOp -- contents merged later in visit
                If shouldAdvance j++        
            Else if editedInOne
              If thisOneEdited
                If currentArray[j] !== node._id
                    moveToMergePosition()
                j++
              Else 
                Skip, the other one is edited
            Else if removedInOne
              noOp, move to next, already in position
            Else // it wasn’t edited, but the node is still in both trees
              If currentArray[j] !== node._id
                moveToMergePosition()
              j++
          Else
            add(nodeInfo, position)            
          i++
    
    
                
                
