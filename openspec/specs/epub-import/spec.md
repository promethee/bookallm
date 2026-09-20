# epub-import Specification

## Purpose
Turns an EPUB file into a structured, chapter-aware book (metadata plus plain-text chapters) that later features can search and cite, or rejects the file with a clear, typed reason.

## Requirements

### Requirement: Import a valid EPUB into a structured book

The system SHALL accept the raw bytes of an EPUB file, optionally with its source filename, and return a book containing its title, authors, language, and an ordered list of chapters. A missing title SHALL be reported as an empty title rather than an error.

#### Scenario: Well-formed EPUB 3

- **WHEN** a valid EPUB 3 file is imported
- **THEN** the result is a book whose title, authors and language match the file's metadata and whose chapters follow the file's table of contents

#### Scenario: Well-formed EPUB 2

- **WHEN** a valid EPUB 2 file that uses the older navigation format is imported
- **THEN** the result is a book whose chapters follow that navigation, with the same shape as for EPUB 3

#### Scenario: Missing metadata

- **WHEN** a valid EPUB without a title is imported
- **THEN** the import succeeds and the book's title is empty

### Requirement: Chapters follow the book's own structure

The system SHALL define chapters from the EPUB's table of contents, in reading order, using each entry's title. Nested entries SHALL be flattened into the same ordered list in document order. The system SHALL NOT treat the book as flat text when a table of contents exists.

#### Scenario: Entries pointing inside one document

- **WHEN** two table-of-contents entries point to different positions within the same content document
- **THEN** they become two chapters, and each chapter contains only the text between its position and the next entry's position

#### Scenario: Entry spanning several documents

- **WHEN** a table-of-contents entry is followed by content documents that no other entry references
- **THEN** that text belongs to the preceding chapter

#### Scenario: Text before the first entry

- **WHEN** the reading order begins with text that no table-of-contents entry covers
- **THEN** that text forms its own leading chapter so no book text is lost

#### Scenario: No usable table of contents

- **WHEN** an EPUB has no table of contents, or an empty one
- **THEN** each document in reading order becomes one chapter, titled from its first heading or, failing that, its file name

### Requirement: Chapter text is clean, ordered plain text

The system SHALL produce each chapter's text as plain text with markup removed, entities decoded, whitespace collapsed inside paragraphs, and paragraphs separated by a blank line. Navigation lists, scripts and styles SHALL NOT appear in chapter text. Importing the same bytes twice SHALL produce identical chapter text.

#### Scenario: Markup and entities

- **WHEN** a chapter contains headings, paragraphs, emphasis and character entities
- **THEN** the chapter text contains the readable words with entities decoded and no tags

#### Scenario: Non-content elements

- **WHEN** a content document includes a navigation list, a script and a style block
- **THEN** none of their text appears in the chapter text

#### Scenario: Repeatable output

- **WHEN** the same EPUB bytes are imported twice
- **THEN** both results have identical chapters and chapter text

### Requirement: Unusable files are rejected with a typed error

The system SHALL reject input that cannot be turned into a book, returning an error with a stable machine-readable code and no partial book. It SHALL distinguish a file that is not an EPUB, an EPUB whose structure is broken, and an EPUB that contains no extractable text.

#### Scenario: Not an EPUB

- **WHEN** the input is not a zip archive, or is a zip archive without the EPUB container description
- **THEN** the import fails with the code for "not an EPUB"

#### Scenario: Broken structure

- **WHEN** the container names a package document that is missing or unreadable, or the reading order is empty or references missing documents
- **THEN** the import fails with the code for "malformed EPUB"

#### Scenario: Image-only book

- **WHEN** an EPUB's documents contain no extractable text
- **THEN** the import fails with the code for "no text content"

#### Scenario: Codes carry no display wording

- **WHEN** any import error is returned
- **THEN** it identifies the failure by code, so the interface can choose the user's language for the message
