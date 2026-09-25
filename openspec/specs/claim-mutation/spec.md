# claim-mutation Specification

## Purpose

Produces one claim about the active book, true or deliberately changed in one checkable way, with the real citation held back until the reader judges it, so Verify mode can ask "is this actually what the book says?" instead of "what does the book say?"

## Requirements

### Requirement: A claim is built from a real chunk of the active, indexed book

The system SHALL pick one chunk from the active book's already-indexed chunks to build a claim from. It SHALL accept a list of chunk ids to avoid, so a caller can keep a session from repeating the same source too soon. When every chunk is excluded, or the book has no chunks, it SHALL report a typed failure rather than picking nothing or reusing an excluded chunk.

#### Scenario: A chunk is picked

- **WHEN** a claim is requested for an indexed book with unexcluded chunks available
- **THEN** the source chunk comes from that book's own chunks, not from another book or from nowhere

#### Scenario: Nothing left to pick from

- **WHEN** every chunk of the book is in the excluded list
- **THEN** a typed failure is returned, and no claim is generated

### Requirement: The claim states one concrete, checkable fact from the source chunk

The system SHALL have the configured chat model state one concrete claim that the source chunk actually supports, about a cause, an order of events, who did or said something, or where something happened.

#### Scenario: A checkable claim

- **WHEN** a claim is generated from a source chunk
- **THEN** the claim names a concrete cause, order, actor or place drawn from that chunk's text

### Requirement: A changed version alters exactly one concrete attribute, keeping the rest accurate

The system SHALL also have the chat model produce a changed version of the same claim that alters exactly one of its concrete attributes (the cause, the order, who did or said it, or where), while keeping every other detail of the claim as accurate as the true version.

#### Scenario: One attribute changed

- **WHEN** the changed version is produced
- **THEN** it differs from the true claim in exactly one of those attributes and matches it in every other stated detail

### Requirement: A changed claim is verified to contradict the source before it is ever offered

The system SHALL verify, with a separate check against the source chunk, that the changed version actually contradicts it before returning it as the claim to present. If that check does not confirm a contradiction, the system SHALL try generating a changed version again, up to a documented limit, and SHALL report a typed failure rather than return an unverified changed claim.

#### Scenario: Contradiction confirmed

- **WHEN** the changed version is checked against the source chunk
- **THEN** it is only offered as the claim to present once that check confirms it contradicts the source

#### Scenario: Never confirmed

- **WHEN** the changed version still does not clearly contradict the source after the retry limit
- **THEN** a typed failure is returned, and nothing unverified is presented as false

### Requirement: The claim offered is chosen unpredictably between the true and changed versions

The system SHALL choose, without a fixed or predictable pattern, whether the claim it returns to present is the true version or the verified changed version, and SHALL tell the caller which one it chose.

#### Scenario: Either version can be offered

- **WHEN** many claims are generated in a row
- **THEN** both the true and the changed version are offered across them, in no fixed pattern

### Requirement: The result always carries the real citation, whichever claim was offered

The system SHALL, whichever version it offers, include the source chunk's exact locator and text as the citation to reveal once the reader has judged the claim.

#### Scenario: Citation matches the source regardless of which claim was shown

- **WHEN** a result is returned
- **THEN** its citation names the real chunk the claim was built from, whether the claim shown was true or changed

### Requirement: Failures are typed and the system never throws for an expected outcome

The system SHALL report each failure as a typed failure and SHALL NOT throw: Ollama unreachable, the chat model not found, an answer from Ollama that cannot be used, no chunk available to pick from, a changed claim never confirmed to contradict the source, or the request was aborted. Aborting SHALL end the attempt without an error result.

#### Scenario: A typed failure, not a thrown error

- **WHEN** any of these problems happens
- **THEN** a typed failure result is returned, and nothing throws

### Requirement: Nothing is written anywhere, and only the configured Ollama address is used

The system SHALL NOT write to the book library, the settings or the vector store while generating a claim, and SHALL send the source chunk's text only to the configured Ollama address.

#### Scenario: No side effects

- **WHEN** a claim is generated, successfully or not
- **THEN** no stored book, setting or vector data changes, and only the configured Ollama address receives the chunk's text
