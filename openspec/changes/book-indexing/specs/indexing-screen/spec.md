# Spec Delta

## Purpose

Shows the reader that BookaLLM is getting to know their book, how far along it is, and what to do when it cannot finish, in plain words and in their language.

## ADDED Requirements

### Requirement: The reader sees real progress while a book is indexed

The system SHALL, while the active book is being indexed, show the book's title, which chapter is being indexed out of how many, and a progress bar that assistive technology can read. It SHALL say in plain words that this is a one-time step that can take a few minutes for a long book and that closing the app is safe because it continues where it stopped. Numbers SHALL follow the reader's language.

#### Scenario: Watching an index

- **WHEN** a book is being indexed
- **THEN** the screen shows its title, "chapter 4 of 22" style progress, a progress bar and the one-time note

#### Scenario: Progress bar for assistive technology

- **WHEN** a screen reader reads the progress bar
- **THEN** it exposes the current value, the minimum and the maximum

### Requirement: Indexing starts and ends by itself

The system SHALL start indexing without a button press whenever the active book is not indexed for the configured model, and SHALL move on by itself when the index is complete: to the "Book added" summary after an import, otherwise to the landing screen.

#### Scenario: After an import

- **WHEN** a book has just been imported and saved
- **THEN** indexing starts by itself and, when it completes, the "Book added" summary is shown

#### Scenario: Book imported before indexing existed

- **WHEN** the app starts with an active book that has no index
- **THEN** the indexing screen is shown, indexing starts by itself, and the landing screen follows when it completes

### Requirement: A resumed or rebuilt index says so

The system SHALL say that it is continuing where it stopped when some chapters were already saved, and SHALL say that the embedding model was changed and the book is being prepared again when the index is being rebuilt for that reason.

#### Scenario: Continuing

- **WHEN** indexing resumes with some chapters already saved
- **THEN** the screen says it is continuing and progress starts from the saved chapters

#### Scenario: Model changed

- **WHEN** the index is being rebuilt because the embedding model was changed
- **THEN** the screen says the embedding model changed and the book is being prepared again

### Requirement: Every indexing failure has a plain message and a next step

The system SHALL show a plain-language message and a retry action for each indexing failure. It SHALL say Ollama seems to have stopped for an unreachable failure, ask the reader to check the embedding model name for a model-not-found failure, ask them to free some space for a no-room failure, and for any other failure say the book could not be prepared and offer Ollama's own message in a details section. The chapters already saved SHALL be kept.

#### Scenario: Ollama stops during indexing

- **WHEN** Ollama stops while a book is being indexed
- **THEN** the screen says Ollama seems to have stopped and offers to try again

#### Scenario: Disk full

- **WHEN** a chapter cannot be saved for lack of space
- **THEN** the screen asks the reader to free some space and try again

#### Scenario: Another failure

- **WHEN** indexing fails for another reason
- **THEN** the screen says the book could not be prepared and shows Ollama's message under a details section

### Requirement: Trying again checks the real state first

The system SHALL, when the reader presses the retry button, check the real state before indexing again, so that a stopped Ollama sends the reader to the get-Ollama screen and indexing resumes by itself once the state allows.

#### Scenario: Retry while Ollama is still stopped

- **WHEN** the reader presses retry and Ollama is still not running
- **THEN** the get-Ollama screen is shown, and when Ollama starts, indexing resumes where it stopped

#### Scenario: Retry works

- **WHEN** the reader presses retry and Ollama is running
- **THEN** indexing resumes with the chapters not yet saved

### Requirement: Indexing changes are announced

The system SHALL announce to assistive technology when indexing fails and when it completes.

#### Scenario: Completion announced

- **WHEN** indexing completes
- **THEN** a polite announcement says the book is ready
