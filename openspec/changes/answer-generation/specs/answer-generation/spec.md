# Spec Delta

## Purpose

Turns a question and the passages retrieval found for it into a sincere, streamed answer from the configured chat model, with every claim tied to a checkable citation, or a plain admission when nothing was found, so the reader can trust an answer only as far as it actually points back to the book.

## ADDED Requirements

### Requirement: An answer is grounded only in the retrieved passages

The system SHALL generate an answer with the configured chat model using only the passages it was given as the source of fact, and SHALL number the passages in the request so the model can refer to them.

#### Scenario: Passages are the only source

- **WHEN** an answer is generated for a question
- **THEN** the request given to the chat model contains the retrieved passages and asks it to answer only from them

### Requirement: The answer streams as it is written

The system SHALL return the answer's text as it arrives from the chat model, in the order written, rather than waiting for the whole answer.

#### Scenario: Text arrives in order

- **WHEN** an answer is generated
- **THEN** the text pieces returned, joined in order, equal the model's complete answer

### Requirement: Every citation resolves to a real, exact passage

The system SHALL turn each citation marker the model writes into a citation carrying the exact locator (chapter, paragraph range, character range) of the passage it names, using only the numbers of the passages the model was given. A marker naming a number that was not offered SHALL be dropped, not guessed at or matched to the nearest one.

#### Scenario: A citation is resolved

- **WHEN** the model marks a claim with the number of an offered passage
- **THEN** the citation for that claim carries that passage's exact locator

#### Scenario: A cited passage was not offered

- **WHEN** the model marks a claim with a number that does not match any offered passage
- **THEN** that marker produces no citation and the rest of the answer is unaffected

#### Scenario: Several claims, several citations

- **WHEN** an answer makes claims supported by different passages
- **THEN** each claim's citation names the passage that was marked for it, not another one

### Requirement: Nothing is generated when nothing is relevant

The system SHALL NOT call the chat model when it is given a `nothing-relevant` verdict, and SHALL instead return the fixed reply that plainly says nothing was found and asks where in the book the answer might be. It SHALL NOT phrase this as a claim that the book lacks an answer.

#### Scenario: Nothing relevant

- **WHEN** answer generation is asked to answer with a `nothing-relevant` verdict
- **THEN** it returns the fixed "nothing found" reply without contacting Ollama

#### Scenario: The wording never claims absence

- **WHEN** the fixed reply is shown
- **THEN** it says the reader can point to where it comes up, never that the book does not contain it

### Requirement: Failures have typed reasons and can be stopped

The system SHALL report each failure as a typed failure and SHALL NOT throw for an expected outcome: Ollama unreachable, the chat model not found, an error from Ollama's own answer, or the generation was aborted. Aborting SHALL stop the stream without an error result.

#### Scenario: Ollama stops mid-answer

- **WHEN** the connection to Ollama fails while the answer is streaming
- **THEN** the failure is reported as unreachable

#### Scenario: Chat model missing

- **WHEN** Ollama says the configured chat model does not exist
- **THEN** the failure is reported as model not found

#### Scenario: Aborted

- **WHEN** generation is aborted while waiting for or reading the stream
- **THEN** it stops without an error result

### Requirement: Generating an answer changes nothing that is stored

The system SHALL NOT write to the book library, the settings or the vector store while generating an answer, and SHALL send the question and passages only to the configured Ollama address.

#### Scenario: Nothing is written

- **WHEN** an answer is generated
- **THEN** the saved books, vectors and settings are unchanged afterwards

#### Scenario: Only Ollama sees the question and passages

- **WHEN** an answer is generated
- **THEN** the only network request made carries the question and passages to the configured Ollama address
