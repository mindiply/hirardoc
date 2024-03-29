# Change Log
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).

## [0.0.18] - 2024-03-01

### New
- Added asyncVisitDocument, to perform asynchronous visits of a document.

## [0.0.17] - 2023-03-12

### HotFixes
- Hot-fixed error in 0.0.16 three-way merge fix.

## [0.0.16] - 2023-03-17

### Fixes
- In the three-way merge, if you add elements to a node, while you delete that node
in another version, the node gets deleted after the merge

## [0.0.15] - 2022-11-14

### Fixes
- The three-way merge would delete new children of an element that in the
  other branch would move to another parent.

## [0.0.14] - 2022-02-26

### Fixes
- Typing fixes only of EntitiesMaps

## [0.0.13] - 2021-09-21

### Changes
- Weakened type checking functions *isParentedMap* and *isParentedMutableMap*
for performance reasons, given that being maps keeps true the has and get members
of the interface

## [0.0.12] - 2021-05-27

### Added
- **threeWayMergeArray** allows merging two arrays, and is also
used in threeWayMerge for nodes that have array fields.

## [0.0.11] - 2021-01-19

### Fixes
- Changed the implementation of *isParentedMap* and *isParentedMutableMap* that
were a performance bottleneck.

## [0.0.10] - 2020-11-26

### Added
- **generateNewId** creates a new Id and can be used to pre-assign ids
to elements to be added to a HDocument.

## [0.0.9] - 2020-11-24

### Added
- Have a history of versions of a document with committing, branching
and merging

### Fixes
- Removing and element removes the entire subtree, rather than
leaving dangling references in the maps

## [0.0.7] - 2020-08-01

### Changes
- Updated dependencies

## [0.0.6] -2020-07-09

### Added
- **LazyMap**'s constructor now accepts an optional equality
  function to determine if an element being added is different
  from the existing one

## [0.0.5] - 2020-06-29

### Added
- **visitDocument** now allows to traverse only certain
node types, to cut visit time, and also to call the visitor
function only on a subset of element types.

### Changed
- **visitDocument** now receives an option object rather
than a long list of optional parameters, 

## [0.0.4] - 2020-06-09

### Added
- Added reducers to add and remove elements from an array
field, *addElementToArrayReducer* and *removeElementFromArrayReducer*

## [0.0.3] - 2020-06-05

### Changes
- All the HDocOperation changes have been refactored to work
with both ids and paths, rather than making the awkward
distinction with targetElement
- Added the Changelog

### Fixes
- **hasMappedElement** and **mappedElement** now also
accept documents, not only entity maps.  

## [0.0.2] - 2019-10-23

### Fixes
- Firts usable version with outside project

## [0.0.1] - 2019-10-23

### Added
- Initial testing with outside project
