# local-persistence Specification

## Purpose
Keeps the reader's settings and imported books on their machine between launches, and reports storage problems plainly instead of failing silently.

## Requirements

### Requirement: Settings survive a restart

The system SHALL save the chosen language, the chat and embedding model names, the Ollama address and the active book, and SHALL restore them on the next launch. When nothing has been saved it SHALL use the documented defaults.

#### Scenario: Restored on launch

- **WHEN** the reader changes settings and restarts the app
- **THEN** the same settings are in effect

#### Scenario: Nothing saved

- **WHEN** the app starts with no saved settings
- **THEN** the default models and the default Ollama address are used and no language is chosen yet

### Requirement: Unreadable settings never stop the app

The system SHALL ignore saved settings that are damaged or have the wrong shape and fall back to the default for each affected value, and SHALL start normally.

#### Scenario: Damaged settings

- **WHEN** the saved settings cannot be read
- **THEN** the app starts with the defaults instead of failing

#### Scenario: One bad value

- **WHEN** only one saved value is invalid
- **THEN** that value falls back to its default and the others are kept

### Requirement: Imported books survive a restart

The system SHALL keep each imported book, meaning its registry entry together with its chapters and chunks, so that it is available after a restart without importing it again, and a later import of the same file is recognised as already imported.

#### Scenario: Book after restart

- **WHEN** a book was imported and the app is restarted
- **THEN** the book is still listed and its text is available

#### Scenario: Same file after restart

- **WHEN** the same file is imported after a restart
- **THEN** it is recognised as already imported

### Requirement: A book and its record are saved together

The system SHALL save a book's registry entry and its content as one all-or-nothing step, so that an entry never exists without its content and content never exists without its entry, even if saving is interrupted.

#### Scenario: Interrupted save

- **WHEN** saving fails part-way
- **THEN** neither the entry nor the content is left behind

### Requirement: The saved registry behaves like any registry

The system SHALL provide a persistent registry that satisfies the registry contract: adding, finding by hash and by title or file name, listing, removing, and rejecting a second entry with the same hash.

#### Scenario: Contract tests

- **WHEN** the shared registry contract is run against the persistent registry
- **THEN** every case passes

### Requirement: Removing a book removes only the app's own copy

The system SHALL, when a book's record is removed, remove its stored content and all of its vectors as well, and SHALL NOT touch the reader's original file.

#### Scenario: Remove

- **WHEN** a book's record is removed
- **THEN** its stored content and vectors are gone and the original file is unaffected

### Requirement: Storage problems are reported plainly

The system SHALL tell the reader in plain language when settings or books cannot be saved because storage is unavailable or full, and SHALL keep working for the current session using what is in memory rather than failing silently.

#### Scenario: Storage unavailable

- **WHEN** storage cannot be used at all
- **THEN** the reader is told that changes will not be remembered and the app keeps working for this session

#### Scenario: Storage full

- **WHEN** a save fails because there is no room
- **THEN** a message says so and nothing is left half-saved

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
