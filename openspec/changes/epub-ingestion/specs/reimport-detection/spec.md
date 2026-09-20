# Spec Delta

## Purpose

Recognises books that were already imported by content hash, avoids re-indexing them, and never overwrites a book silently, so citations never point at the wrong edition.

## ADDED Requirements

### Requirement: Content hash identifies a book

The system SHALL compute a content hash from the EPUB's bytes and use it as the book's identity. Identical bytes SHALL always give the same hash and different bytes SHALL give different hashes.

#### Scenario: Same file twice

- **WHEN** the same bytes are imported twice
- **THEN** both imports produce the same hash

#### Scenario: Different edition

- **WHEN** two EPUBs differ by even one byte
- **THEN** their hashes differ

### Requirement: Known books are recognised without re-indexing

When an import's hash matches a book already in the registry, the system SHALL report it as an existing book and return the registry entry, without producing chapters or chunks again.

#### Scenario: Re-import of the same file

- **WHEN** an EPUB whose hash is already registered is imported
- **THEN** the result is "existing" with the registered entry and no new chapters or chunks

### Requirement: Unknown files are new, distinct books

When an import's hash is not in the registry, the system SHALL treat it as a new book. It SHALL NOT overwrite, modify or replace any existing registry entry as a result of the import.

#### Scenario: Different edition of a known title

- **WHEN** an EPUB with the same title as a registered book but a different hash is imported and then registered
- **THEN** both books exist as separate entries and the original entry is unchanged

### Requirement: Possible duplicates are flagged

When a new book's title, or its source filename, matches a registered entry (ignoring letter case and surrounding or repeated whitespace) but its hash differs, the system SHALL report it as a possible duplicate and list the matching entries. The book SHALL still be importable as a distinct book, and no decision SHALL be taken on the user's behalf.

#### Scenario: Same title, new hash

- **WHEN** a new EPUB has the same title as a registered book, differing only in letter case
- **THEN** the result is "possible duplicate" listing that entry, together with the full imported book

#### Scenario: Same filename, different title

- **WHEN** a new EPUB has the same source filename as a registered entry but a different hash
- **THEN** the result is "possible duplicate" listing that entry

#### Scenario: No match

- **WHEN** a new EPUB matches no registered hash, title or filename
- **THEN** the result is "new" with no candidates

### Requirement: Registry contract

Any registry used for import detection SHALL support adding an entry, finding an entry by hash, finding entries by title or source filename, listing entries, and removing an entry. It SHALL reject adding a second entry with the same hash. Removing an entry SHALL remove only the registry's record, never the user's source file.

#### Scenario: Add and find

- **WHEN** an entry is added
- **THEN** it can be found by its hash, by its title, and by its source filename, and appears in the list

#### Scenario: Duplicate hash rejected

- **WHEN** an entry is added whose hash already exists in the registry
- **THEN** the add is rejected and the existing entry is unchanged

#### Scenario: Remove

- **WHEN** an entry is removed
- **THEN** it can no longer be found or listed, and no file belonging to the user is touched
