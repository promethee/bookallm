# book-import Specification

## Purpose
Lets a reader bring in an EPUB by choosing or dropping it, tells them in plain language exactly what happened, and never overwrites a book or touches their file.

## Requirements

### Requirement: A book can be chosen or dropped

The system SHALL let the reader choose an EPUB file with a file picker or drop it on a marked area. The area SHALL also be usable from the keyboard. When several files are given at once it SHALL import the first and tell the reader that the others were skipped and that one book is imported at a time.

#### Scenario: File picker

- **WHEN** the reader chooses an EPUB with the file picker
- **THEN** that file is imported

#### Scenario: Drag and drop

- **WHEN** the reader drops an EPUB on the drop area
- **THEN** that file is imported

#### Scenario: Several files

- **WHEN** the reader drops three files at once
- **THEN** the first is imported and a message says the other two were skipped

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

### Requirement: Every failure is explained in plain language

The system SHALL show a plain-language message and a way to try another file for each import failure code. For a file that is not an EPUB it SHALL say so; for a damaged EPUB it SHALL say the file could not be read; for an EPUB without text it SHALL say it has no readable text; for a protected book it SHALL say the book is protected, that the app does not remove protection, and that a copy without protection is needed.

#### Scenario: Not an EPUB

- **WHEN** the chosen file is not an EPUB
- **THEN** the message says it is not an EPUB and offers to try another file

#### Scenario: Damaged EPUB

- **WHEN** the EPUB cannot be read
- **THEN** the message says the file could not be read

#### Scenario: Image-only book

- **WHEN** the EPUB has no readable text
- **THEN** the message says there is no readable text in it

#### Scenario: Protected book

- **WHEN** the EPUB is protected
- **THEN** the message says it is protected, that the app never removes protection, and that a copy without protection is needed

### Requirement: A book already imported is recognised

The system SHALL tell the reader when the book was already imported, without processing it again, and SHALL make it the active book.

#### Scenario: Same file again

- **WHEN** the reader imports a file that was imported before
- **THEN** a message says they already have this book and it becomes the active book

### Requirement: A possible duplicate is a question, not a replacement

The system SHALL, when a new file has the same title or file name as an imported book but is not the same file, show the new book and the matching book or books side by side with their titles, authors and chapter counts, and offer exactly two actions: add it as a separate book, or cancel. Nothing SHALL be saved until the reader chooses to add it, cancelling SHALL save nothing, and no existing book SHALL be replaced or changed.

#### Scenario: Same title, different file

- **WHEN** the reader imports a file whose title matches an imported book but whose contents differ
- **THEN** both books are shown and the actions offered are to add it separately or to cancel

#### Scenario: Add separately

- **WHEN** the reader chooses to add it as a separate book
- **THEN** both books exist afterwards and the original is unchanged

#### Scenario: Cancel

- **WHEN** the reader cancels
- **THEN** nothing is saved and the existing books are unchanged

### Requirement: The reader's file is only ever read

The system SHALL only read the chosen file. It SHALL NOT write to, move, rename or delete it, and no action in this flow removes a book.

#### Scenario: Source file untouched

- **WHEN** any import outcome occurs
- **THEN** the original file is exactly as it was

### Requirement: A failed save is reported and leaves nothing half-saved

The system SHALL, when a book cannot be saved (for example storage is full or unavailable), tell the reader plainly that it could not be saved and SHALL NOT leave a partly saved book behind.

#### Scenario: Storage full

- **WHEN** saving a book fails because there is no room
- **THEN** a message says the book could not be saved and it does not appear among the imported books
