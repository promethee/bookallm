# book-deletion Specification

## Purpose

Lets the reader remove the active book from the app when it is no longer wanted, saying plainly that only the app's own copy and index go and never the reader's EPUB file, and leaving the app on the next book or on the import screen.

## Requirements

### Requirement: The active book can be deleted after an inline confirmation

The system SHALL offer, on the active book's card, an action to delete that book. Choosing it SHALL NOT delete anything yet: the card SHALL show a confirmation in place, stating that BookaLLM's copy of the book and its index will be removed and that the reader's EPUB file stays where it is, with a Delete action and a Cancel action. Cancel SHALL return the card to its normal state and change nothing. Only Delete SHALL delete the book.

#### Scenario: Asking to delete

- **WHEN** the reader chooses to delete the active book
- **THEN** the card asks for confirmation, says the app's copy and index will be removed and the EPUB file stays where it is, and nothing is deleted yet

#### Scenario: Cancel

- **WHEN** the reader cancels the confirmation
- **THEN** the card is back to normal and the book, its index and its conversation are unchanged

#### Scenario: Confirm

- **WHEN** the reader confirms the deletion
- **THEN** the book is deleted

### Requirement: Deleting removes the app's copy, never the reader's file

The system SHALL, when a deletion is confirmed, remove the book's record, its stored text and chunks, and its vectors for every embedding model, all together, and SHALL NOT read, change, move or delete the reader's original file.

#### Scenario: Everything the app stored is gone

- **WHEN** a book is deleted
- **THEN** its record, stored text and vectors for every model are gone, and re-importing the same file treats it as a new book

#### Scenario: The original file is untouched

- **WHEN** a book is deleted
- **THEN** the reader's EPUB file is unchanged

### Requirement: The most recent remaining book comes next

The system SHALL, after a deletion, make the most recently imported remaining book the active book and SHALL say so on its card with a line naming it, until another book is imported or deleted. That book SHALL follow the usual flow, so a book whose index is unfinished goes to indexing. When no book remains, the system SHALL show the screen for adding a book.

#### Scenario: Another book remains

- **WHEN** the active book is deleted and other books were imported before it
- **THEN** the most recently imported of them becomes active and its card says it is now the book shown

#### Scenario: Its index is unfinished

- **WHEN** the book that becomes active is not fully indexed for the configured model
- **THEN** indexing starts for it, as after an import

#### Scenario: No book remains

- **WHEN** the only book is deleted
- **THEN** the screen for adding a book is shown

### Requirement: What belonged to the deleted book stops and clears

The system SHALL, when a book is deleted, stop anything still running for it (an answer being written, a claim being generated) and clear the Ask conversation, the Verify claim and the Verify tally, as when the active book changes.

#### Scenario: Conversation cleared

- **WHEN** the active book is deleted after questions were asked about it
- **THEN** the conversation shown for the next book is empty

#### Scenario: Claim stopped

- **WHEN** the active book is deleted while a claim is being generated
- **THEN** that generation stops and the Verify tally starts again at zero

### Requirement: A failed deletion leaves the book as it was

The system SHALL, when a deletion cannot be completed, keep the book, its index and its conversation as they were, and SHALL say plainly that the book could not be deleted, with a way to try again.

#### Scenario: Storage refuses

- **WHEN** the storage cannot remove the book
- **THEN** the book is still the active book with its index, and a plain message and a retry are shown

### Requirement: Deleting is usable without a mouse, in both languages, and announced

The system SHALL let the reader reach and operate the delete action, Delete and Cancel by keyboard alone, SHALL move focus to the confirmation's Cancel action when it opens and back to the delete action when it is cancelled, and SHALL announce politely when a book has been deleted. All new text SHALL be available in English and French.

#### Scenario: Keyboard only

- **WHEN** a reader uses only the keyboard
- **THEN** they can open the confirmation, cancel it, open it again and confirm it

#### Scenario: Deletion announced

- **WHEN** a book has been deleted
- **THEN** a polite announcement names the deleted book

#### Scenario: French

- **WHEN** the interface language is French
- **THEN** the delete action, the confirmation, the "now showing" line and the failure message are in French
