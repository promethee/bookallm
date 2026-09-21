# Spec Delta

## Purpose

Turns the chunks of the active book into vectors with the embedding model, keeps them safely on the device chapter by chapter, and resumes or rebuilds them when an index is unfinished or the model changes, so later features can find passages.

## ADDED Requirements

### Requirement: Every chunk gets a vector from the configured embedding model

The system SHALL compute one vector for every chunk of a book with the configured embedding model through Ollama, and SHALL keep each vector tied to the id of its chunk. All vectors of one index SHALL have the same length.

#### Scenario: Full index

- **WHEN** a book is indexed
- **THEN** every chunk of the book has exactly one vector, identified by the chunk's id

#### Scenario: Same length

- **WHEN** a book is indexed
- **THEN** every vector in the index has the same number of values

### Requirement: Book text goes only to the configured Ollama address

The system SHALL send chunk text only to the Ollama address that is configured, and to no other address.

#### Scenario: Only Ollama sees the text

- **WHEN** a book is indexed
- **THEN** every network request made carries chunk text only to the configured Ollama address

### Requirement: Vectors are saved chapter by chapter

The system SHALL save the vectors of a chapter together, in one step, as soon as every chunk of that chapter has a vector. A chapter with no chunks SHALL need no vectors. A book SHALL count as indexed only when every chapter that has chunks has its vectors saved.

#### Scenario: A chapter finishes

- **WHEN** every chunk of a chapter has a vector
- **THEN** the chapter's vectors are saved before the next chapter starts

#### Scenario: Some chapters missing

- **WHEN** some chapters that have chunks have no saved vectors
- **THEN** the book does not count as indexed

#### Scenario: A chapter without text

- **WHEN** a chapter has no chunks
- **THEN** it needs no vectors and does not stop the book from counting as indexed

#### Scenario: Never half a chapter

- **WHEN** indexing stops in the middle of a chapter
- **THEN** none of that chapter's vectors are saved

### Requirement: An interrupted index resumes where it stopped

The system SHALL, when indexing a book that already has vectors for some chapters from the same model, compute vectors only for the chapters that are missing, and SHALL keep the finished chapters unchanged.

#### Scenario: Resume after a restart

- **WHEN** the app is closed after 10 of 22 chapters were saved and the book is indexed again
- **THEN** only the remaining 12 chapters are sent to Ollama and the book then counts as indexed

#### Scenario: Nothing left to do

- **WHEN** a book that already counts as indexed for the configured model is indexed again
- **THEN** no request is sent to Ollama

### Requirement: Progress is reported honestly

The system SHALL report, while indexing, which chapter is being indexed and how many chapters need indexing in total, counting the chapters already saved, and how many chunks have a vector out of all the chunks that need one. It SHALL report progress only for work that has really happened.

#### Scenario: Progress while indexing

- **WHEN** a book is being indexed
- **THEN** the reported chapter position and chunk count grow as chapters are saved and never exceed their totals

#### Scenario: Progress on resume

- **WHEN** an index resumes after 10 of 22 chapters were saved
- **THEN** progress starts from those 10 chapters, not from zero

### Requirement: An index belongs to the model that made it

The system SHALL record which embedding model made each index and SHALL compare model names the same way it does elsewhere, so a name with and without the default tag is the same model. A book SHALL count as indexed only for the configured embedding model.

#### Scenario: Same model, different spelling

- **WHEN** an index was made with `bge-m3` and the configured model is `bge-m3:latest`
- **THEN** the book counts as indexed

#### Scenario: Different model

- **WHEN** an index was made with one model and a different embedding model is configured
- **THEN** the book does not count as indexed for the configured model

### Requirement: A changed embedding model rebuilds the index

The system SHALL, when the configured embedding model differs from the one that made a book's index, build a new index with the configured model, and SHALL delete the old index only once the new one is complete. Until then the old index SHALL be kept.

#### Scenario: Rebuild after a swap

- **WHEN** the reader changes the embedding model and the book is indexed again
- **THEN** a full new index is built with the new model and the old index is deleted when the new one is complete

#### Scenario: Rebuild interrupted

- **WHEN** a rebuild stops before every chapter is saved
- **THEN** the old index is still there and the rebuild resumes the next time

### Requirement: Ollama's answers are checked before anything is saved

The system SHALL check that Ollama returned exactly one non-empty vector of finite numbers per chunk sent, all of the same length, and SHALL save nothing from an answer that fails the check. When a new vector's length differs from the vectors already saved for the same model name, the system SHALL discard those saved vectors and start that index again, because the model behind the name has changed.

#### Scenario: Wrong number of vectors

- **WHEN** Ollama answers with a different number of vectors than chunks sent
- **THEN** indexing fails with a typed failure and nothing from that answer is saved

#### Scenario: Invalid numbers

- **WHEN** a vector is empty or contains a value that is not a finite number
- **THEN** indexing fails with a typed failure and nothing from that answer is saved

#### Scenario: Model behind the name changed

- **WHEN** new vectors have a different length than the vectors already saved for the same model name
- **THEN** the saved vectors for that model are discarded and the index starts again

### Requirement: Indexing failures have typed reasons

The system SHALL report every indexing failure as one of a small set of typed failures: Ollama unreachable, the embedding model not found, no room left to save, or another failure that carries Ollama's own message. A failure SHALL keep every chapter saved before it. It SHALL NOT throw for an expected outcome.

#### Scenario: Ollama stops

- **WHEN** the connection to Ollama fails or drops during indexing
- **THEN** the failure is reported as unreachable and the chapters saved so far are kept

#### Scenario: Model not installed

- **WHEN** Ollama says the embedding model does not exist
- **THEN** the failure is reported as model not found

#### Scenario: Disk full

- **WHEN** saving a chapter fails because there is no room
- **THEN** the failure is reported as no room left and that chapter is not saved

#### Scenario: Another failure

- **WHEN** Ollama answers with another error
- **THEN** the failure is reported with Ollama's message kept for details

### Requirement: Indexing can be stopped without harm

The system SHALL stop promptly when indexing is aborted, for example when the app closes, and SHALL keep every chapter saved before that.

#### Scenario: Abort

- **WHEN** indexing is aborted during a chapter
- **THEN** it stops without an error and the earlier chapters remain saved
