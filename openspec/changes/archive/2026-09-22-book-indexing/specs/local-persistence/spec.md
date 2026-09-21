# Spec Delta

## ADDED Requirements

### Requirement: Indexed vectors survive a restart

The system SHALL keep the vectors saved for a book, chapter by chapter, so that they are available after a restart and an unfinished index can resume without redoing saved chapters.

#### Scenario: Vectors after restart

- **WHEN** a book was indexed and the app is restarted
- **THEN** the book still counts as indexed and needs no new request to Ollama

#### Scenario: Unfinished index after restart

- **WHEN** the app is closed with some chapters saved
- **THEN** after the restart those chapters are still saved and only the others need indexing

### Requirement: A chapter's vectors are saved together or not at all

The system SHALL save all the vectors of a chapter in one all-or-nothing step, and SHALL report a save that fails for lack of room as a storage-full failure without leaving part of a chapter behind.

#### Scenario: Save fails

- **WHEN** saving a chapter's vectors fails
- **THEN** none of that chapter's vectors are stored and earlier chapters are unaffected

### Requirement: An existing library survives the storage upgrade

The system SHALL keep every book and registry entry already saved when the storage format is upgraded to hold vectors, and SHALL treat those books as not yet indexed.

#### Scenario: Upgrade with books

- **WHEN** the app starts with books saved before vectors existed
- **THEN** every book is still listed with its text, and each counts as not yet indexed

## MODIFIED Requirements

### Requirement: Removing a book removes only the app's own copy

The system SHALL, when a book's record is removed, remove its stored content and all of its vectors as well, and SHALL NOT touch the reader's original file.

#### Scenario: Remove

- **WHEN** a book's record is removed
- **THEN** its stored content and vectors are gone and the original file is unaffected
