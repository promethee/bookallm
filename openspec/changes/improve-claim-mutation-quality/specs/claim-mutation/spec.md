# Spec Delta

## MODIFIED Requirements

### Requirement: A claim is built from a real chunk of the active, indexed book

The system SHALL pick one chunk from the active book's already-indexed chunks to build a claim from. It SHALL skip chunks from front and back matter (such as an introduction, preface, foreword, contents, notes, acknowledgements, licence, or Project Gutenberg boilerplate), recognised from the chapter title or the chunk's own text, in English and French. When the book has no chunk outside front and back matter, it SHALL pick from all chunks instead. It SHALL accept a list of chunk ids to avoid, so a caller can keep a session from repeating the same source too soon. When every eligible chunk is excluded, or the book has no chunks, it SHALL report a typed failure rather than picking nothing or reusing an excluded chunk.

#### Scenario: A chunk is picked

- **WHEN** a claim is requested for an indexed book with unexcluded chunks available
- **THEN** the source chunk comes from that book's own chunks, not from another book or from nowhere

#### Scenario: Front matter skipped

- **WHEN** a claim is requested for a book whose chapters include an "Introduction" and story chapters
- **THEN** the source chunk comes from a story chapter, never from the introduction

#### Scenario: Project Gutenberg boilerplate skipped

- **WHEN** a chunk's text contains the Project Gutenberg header or licence
- **THEN** that chunk is never picked while any other eligible chunk is available

#### Scenario: Nothing but front matter

- **WHEN** every chapter of a book is recognised as front or back matter
- **THEN** a chunk is still picked, from any chapter

#### Scenario: Nothing left to pick from

- **WHEN** every eligible chunk of the book is in the excluded list
- **THEN** a typed failure is returned, and no claim is generated

### Requirement: The claim states one concrete, checkable fact from the source chunk

The system SHALL choose, before asking the chat model for a claim, which kind of fact the claim is about: who did or said something, or where something happened. (A cause and the order of two events are planned for a later version; see the change's design.) The first kind SHALL be chosen unpredictably. The system SHALL have the configured chat model state one concrete claim of that kind that the source chunk actually supports, or say that the chunk has none. A claim shorter than a documented minimum number of words SHALL be treated as none. When the chunk has none, the system SHALL try the next kind, until every kind has been tried.

#### Scenario: A checkable claim

- **WHEN** a claim is generated from a source chunk
- **THEN** the claim names a concrete actor or place drawn from that chunk's text, of the kind the system chose

#### Scenario: A claim of the chosen kind

- **WHEN** a claim is generated from a source chunk with the kind "who"
- **THEN** the claim names who did or said something, drawn from that chunk's text

#### Scenario: Only who and where

- **WHEN** many claims are generated
- **THEN** every claim is about who did or said something or where something happened, never a cause or an order of events

#### Scenario: A claim too vague to judge

- **WHEN** the model's claim is shorter than the documented minimum, such as "He said."
- **THEN** it is treated as no claim of that kind, and the next kind is tried

#### Scenario: Kind not in the chunk

- **WHEN** the model says the chunk has no fact of the chosen kind
- **THEN** the next kind is tried on the same chunk

#### Scenario: No kind in the chunk

- **WHEN** the model says the chunk has no fact of any kind
- **THEN** no claim is built from that chunk

### Requirement: A changed version alters exactly one concrete attribute, keeping the rest accurate

The system SHALL have the chat model produce a changed version of the claim that alters only the detail of the chosen kind, choosing a change that matters to what happens rather than a word choice or a minor detail, while keeping every other detail as accurate as the true version. The system SHALL compare the true and changed wording word by word, and SHALL treat a changed version that alters nothing, or alters more than a documented limit, as rejected. A reply from which no changed claim can be read SHALL also be treated as rejected, not as a failure of the whole attempt.

#### Scenario: One attribute changed

- **WHEN** the changed version is produced
- **THEN** it differs from the true claim only in the detail of the chosen kind and matches it in every other stated detail

#### Scenario: Nothing changed

- **WHEN** the changed version has the same words as the true claim
- **THEN** it is rejected and a new changed version is requested

#### Scenario: Too much changed

- **WHEN** the changed version rewrites more of the claim than the documented limit
- **THEN** it is rejected and a new changed version is requested

#### Scenario: Unreadable reply

- **WHEN** the model's reply to the change request contains no readable claim
- **THEN** it is rejected and a new changed version is requested, within the same retry limit

### Requirement: A changed claim is verified to contradict the source before it is ever offered

The system SHALL verify, with a separate check against the source chunk, that the changed version actually contradicts it before returning it as the claim to present. The check SHALL count as confirmed only when the model's answer starts with the word the prompt defines for a contradiction; any other answer, including a negated one, SHALL count as not confirmed. If the check does not confirm a contradiction, or the changed version was rejected, the system SHALL request a new changed version, telling the model why the previous one was rejected, up to a documented limit. When that limit is reached, the system SHALL try the whole attempt once more on a different, unexcluded chunk. It SHALL report a typed failure, and never return an unverified changed claim, when that attempt also produces no confirmed changed version.

#### Scenario: Contradiction confirmed

- **WHEN** the changed version is checked against the source chunk
- **THEN** it is only offered as the claim to present once that check confirms it contradicts the source

#### Scenario: A negated answer is not a confirmation

- **WHEN** the check's answer is "The claim does not contradict the passage"
- **THEN** the contradiction is not confirmed

#### Scenario: Retry says why

- **WHEN** a changed version is not confirmed or is rejected, and the retry limit is not reached
- **THEN** the next change request includes the rejected version and the reason it was rejected

#### Scenario: Fresh passage after the limit

- **WHEN** no changed version is confirmed on the first chunk within the retry limit
- **THEN** the whole attempt is repeated once on a different chunk that is not excluded

#### Scenario: Never confirmed

- **WHEN** no changed version is confirmed on either chunk
- **THEN** a typed failure is returned, and nothing unverified is presented as false

### Requirement: The claim offered is chosen unpredictably between the true and changed versions

The system SHALL choose, without a fixed or predictable pattern, whether the claim it returns to present is the true version or the verified changed version, and SHALL tell the caller which one it chose. It SHALL make that choice only after a changed version is confirmed, and SHALL NOT offer the true version as a fallback when no changed version is confirmed.

#### Scenario: Either version can be offered

- **WHEN** many claims are generated in a row
- **THEN** both the true and the changed version are offered across them, in no fixed pattern

#### Scenario: No fallback to the true claim

- **WHEN** no changed version is confirmed
- **THEN** a typed failure is returned instead of the true claim

## ADDED Requirements

### Requirement: The result says exactly what was changed

The system SHALL include in every result the true claim's text, and, when the claim offered is the changed version, the kind of detail that was changed (the kind the system chose, not a label from the model) and the changed wording: each run of words that differs, as the true claim's words and the changed claim's words in place of them.

#### Scenario: Changed claim result

- **WHEN** the changed version "Candide was driven out because the Baron caught him kissing Paquette" is offered for the true claim "Candide was driven out because the Baron caught him kissing Cunégonde"
- **THEN** the result carries the true claim, the kind "who", and one change from "Cunégonde" to "Paquette"

#### Scenario: True claim result

- **WHEN** the true version is offered
- **THEN** the result carries the true claim's text and no kind or changed wording
