# passage-retrieval Specification

## Purpose
Finds the passages of an indexed book that best match a reader's question, each with its exact place in the book and a similarity score, and says whether the best match is relevant at all, so a later answer can cite the source precisely or say plainly that it found nothing.

## Requirements

### Requirement: A question returns the best passages with their exact places

The system SHALL, for a question about an indexed book, return the passages whose chunks are most similar to the question, best first. Each passage SHALL carry the chunk's text, its locator (chapter number and title, paragraph range and character range) and its similarity score. Each passage's text SHALL equal the chapter text at its locator's range.

#### Scenario: Best passages first

- **WHEN** a question is asked about an indexed book
- **THEN** the passages are ordered from the highest score to the lowest

#### Scenario: A passage points to the exact place

- **WHEN** a passage is returned
- **THEN** its locator gives the chapter and the character range, and the text at that range in the chapter equals the passage text

#### Scenario: A question quoting a passage finds it

- **WHEN** the question is the exact text of a chunk
- **THEN** that chunk is the first passage returned

### Requirement: The number of passages is bounded

The system SHALL return at most a chosen number of passages, with a documented default. A book with fewer chunks than that SHALL return all of them.

#### Scenario: Default number

- **WHEN** no number is chosen and the book has more chunks than the default
- **THEN** exactly the default number of passages is returned

#### Scenario: Small book

- **WHEN** the book has fewer chunks than the number asked for
- **THEN** every chunk is returned, ranked

### Requirement: The question is embedded with the index's model and sent only to Ollama

The system SHALL embed the question with the configured embedding model, the model the book's index was built with, and SHALL send the question only to the Ollama address that is configured.

#### Scenario: Same model as the index

- **WHEN** a question is asked
- **THEN** it is embedded with the configured embedding model

#### Scenario: Only Ollama sees the question

- **WHEN** a question is asked
- **THEN** the only network request made carries the question to the configured Ollama address

### Requirement: Only a fully indexed book is searched

The system SHALL search a book only when it is indexed for the configured model, and SHALL otherwise fail with a typed failure that says the book is not indexed, without sending anything to Ollama and without searching part of an index.

#### Scenario: Not indexed

- **WHEN** a question is asked about a book with no index for the configured model
- **THEN** the search fails as not indexed and no request is sent

#### Scenario: Partly indexed

- **WHEN** a question is asked about a book whose index is unfinished
- **THEN** the search fails as not indexed and no request is sent

### Requirement: Every result carries a relevance verdict

The system SHALL give every successful result a verdict: `relevant` when the best passage's score reaches the relevance cutoff, and `nothing-relevant` when it does not. The passages SHALL be returned in both cases. The cutoff SHALL be a documented value chosen from measurements on a real book, and the verdict SHALL NOT state that the book lacks an answer.

#### Scenario: A question the text answers

- **WHEN** the question is answered by a passage of the book
- **THEN** the verdict is relevant

#### Scenario: A question the text does not touch

- **WHEN** the question has nothing to do with the book
- **THEN** the verdict is nothing relevant, and the ranked passages are still returned

#### Scenario: The verdict follows the best passage

- **WHEN** the best passage's score is at or above the cutoff
- **THEN** the verdict is relevant whatever the scores of the other passages

### Requirement: The question is cleaned before it is used

The system SHALL treat a question that is empty or only whitespace as a typed failure and send nothing. It SHALL collapse runs of whitespace before embedding and SHALL cut a question that is longer than a documented limit.

#### Scenario: Empty question

- **WHEN** the question is empty or only spaces
- **THEN** the search fails as an empty question and no request is sent

#### Scenario: Untidy question

- **WHEN** the question has extra spaces and line breaks
- **THEN** the text embedded has single spaces and no leading or trailing space

#### Scenario: Very long question

- **WHEN** the question is longer than the limit
- **THEN** only the first part up to the limit is embedded

### Requirement: Failures have typed reasons

The system SHALL report each failure as a typed failure and SHALL NOT throw for an expected outcome: Ollama unreachable, the embedding model not found, an answer from Ollama that cannot be used, a question vector whose length differs from the stored vectors, an empty question, a book that is not indexed, or a search that was aborted.

#### Scenario: Ollama stops

- **WHEN** the connection to Ollama fails while the question is embedded
- **THEN** the failure is reported as unreachable

#### Scenario: Model missing

- **WHEN** Ollama says the embedding model does not exist
- **THEN** the failure is reported as model not found

#### Scenario: Index does not match

- **WHEN** the question vector has a different length than the stored vectors
- **THEN** the failure is reported as an index that does not match, and nothing is ranked

#### Scenario: Aborted

- **WHEN** the search is aborted while waiting for Ollama
- **THEN** it stops without an error result

### Requirement: Results are repeatable and searching changes nothing

The system SHALL give the same passages in the same order for the same question, book and index, with ties broken by the chunk's place in the book, and SHALL NOT change any stored data.

#### Scenario: Same question twice

- **WHEN** the same question is asked twice
- **THEN** the results are identical

#### Scenario: Ties

- **WHEN** two chunks have exactly the same score
- **THEN** the chunk that comes first in the book is ranked first

#### Scenario: Nothing is written

- **WHEN** a search runs
- **THEN** the saved books and vectors are unchanged afterwards

### Requirement: A search can be restricted to one chapter

The system SHALL accept an optional chapter to search in. When one is given, only that chapter's passages SHALL be ranked and returned, still best first and still bounded by the chosen number, and only that chapter's stored vectors SHALL be read. The verdict SHALL be computed the same way as for a whole-book search. A chapter that has no passages SHALL return no passages with a `nothing-relevant` verdict, without sending anything to Ollama. The question SHALL still be embedded with the configured embedding model and sent only to the configured Ollama address.

#### Scenario: Only that chapter's passages

- **WHEN** a question is searched in one chapter
- **THEN** every passage returned belongs to that chapter, ordered from the highest score to the lowest

#### Scenario: A better match elsewhere is ignored

- **WHEN** a passage in another chapter matches the question better than any passage in the chosen chapter
- **THEN** that passage is not returned

#### Scenario: Low scores are still returned

- **WHEN** no passage of the chosen chapter reaches the relevance cutoff
- **THEN** the chapter's best passages are still returned, with a `nothing-relevant` verdict

#### Scenario: Chapter without text

- **WHEN** the chosen chapter has no passages
- **THEN** no passages are returned, the verdict is nothing relevant, and no request is sent to Ollama
