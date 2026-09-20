# chapter-chunking Specification

## Purpose
Splits each chapter's text into retrievable chunks that carry an exact locator back into the chapter, so every later citation can point to the precise passage.

## Requirements

### Requirement: Chunks map exactly onto chapter text

The system SHALL split each chapter's text into ordered chunks, each carrying a locator that gives the chapter it belongs to and the character range it occupies in that chapter's text. A chunk's text SHALL be identical to the chapter text at that range. No chunk SHALL span two chapters.

#### Scenario: Locator round trip

- **WHEN** a chunk's locator range is applied to its chapter's text
- **THEN** the extracted text equals the chunk's text exactly

#### Scenario: Chapter boundaries

- **WHEN** a book is chunked
- **THEN** every chunk belongs to exactly one chapter and lies entirely within that chapter's text

### Requirement: Every passage is covered

The system SHALL ensure that every non-whitespace character of each chapter's text belongs to at least one chunk, so no passage of the book is unsearchable.

#### Scenario: Full coverage

- **WHEN** a chapter is chunked
- **THEN** the union of its chunks' ranges includes every non-whitespace character of the chapter text

### Requirement: Chunks respect a size bound at natural boundaries

The system SHALL keep each chunk within a configurable maximum size and aim for a configurable target size, preferring to break at paragraph boundaries, then at sentence boundaries, and only then inside a sentence. Documented default sizes SHALL apply when none are configured.

#### Scenario: Paragraph-aligned chunks

- **WHEN** a chapter's paragraphs each fit within the maximum size
- **THEN** chunks begin and end at paragraph boundaries and none exceeds the maximum size

#### Scenario: Oversized paragraph

- **WHEN** a single paragraph is longer than the maximum size
- **THEN** it is split at sentence boundaries where possible, and inside a sentence only if a sentence alone exceeds the maximum size

#### Scenario: Configured sizes

- **WHEN** a smaller target and maximum size are configured
- **THEN** the same chapter is split into more, smaller chunks, none exceeding the configured maximum

### Requirement: Locators identify chapter and place for citation

The system SHALL include in each chunk's locator the chapter's position in the book, its title, and the range of paragraphs the chunk covers, in addition to the character range, so a citation can name the chapter and passage.

#### Scenario: Citation details

- **WHEN** a chunk is read
- **THEN** its locator states the chapter number, chapter title, paragraph range and character range

### Requirement: Chapters and chunks are retrievable by chapter

The system SHALL make each chapter's full text available, and SHALL allow listing the chunks of a given chapter, so a chapter can be looked up directly or shown as raw text.

#### Scenario: Look up by chapter

- **WHEN** chapter 7 is requested
- **THEN** its full text and its chunks are returned, and no chunk from another chapter is included

### Requirement: Chapter numbering is preserved and stable

The system SHALL keep chapters with no text in the chapter list, with no chunks, so chapter numbers match the book's table of contents. Chunk identifiers SHALL be stable: importing the same bytes again SHALL produce the same identifiers for the same chunks.

#### Scenario: Chapter without text

- **WHEN** a table-of-contents entry leads to an image-only page
- **THEN** the chapter still appears in its position with no chunks, and later chapters keep their numbers

#### Scenario: Stable identifiers

- **WHEN** the same EPUB bytes are chunked twice
- **THEN** each chunk has the same identifier both times
