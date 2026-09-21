# Spec Delta

## MODIFIED Requirements

### Requirement: Reading a book shows a plain wait state

The system SHALL show a plain-language message with the file name as soon as an import starts, before the work begins, and SHALL replace it with the result. While the file is being read, the message SHALL NOT claim per-chapter progress that is not happening. Once the book is saved, the reader SHALL be taken to the indexing screen, which shows real per-chapter progress.

#### Scenario: Import in progress

- **WHEN** an import starts
- **THEN** a message such as "getting to know this book" with the file name is visible before any result

#### Scenario: Handing over to indexing

- **WHEN** a new book has been read and saved
- **THEN** the indexing screen takes over and shows real chapter-by-chapter progress

### Requirement: A successful import is summarised and saved

The system SHALL, after a successful import, save the book and make it the active book, index it, and then show the book's title, authors and number of chapters. The summary SHALL appear only once the book is indexed. A book with no title SHALL be shown by its file name.

#### Scenario: New book

- **WHEN** a new EPUB is imported successfully
- **THEN** it becomes the active book, it is indexed, and the reader then sees its title, authors and chapter count

#### Scenario: Untitled book

- **WHEN** an imported EPUB has no title
- **THEN** its file name is shown as the title

#### Scenario: Recognised book that was never indexed

- **WHEN** an EPUB that is already imported but has no index for the configured model is chosen
- **THEN** it becomes the active book and is indexed before the summary is shown
