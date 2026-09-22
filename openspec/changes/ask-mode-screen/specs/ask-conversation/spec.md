# Spec Delta

## Purpose

Turns a ready, indexed book into a working conversation on the landing screen: the reader asks a question, watches the answer arrive, and can check every claim against the exact passage it cites, in plain language and in their own language.

## ADDED Requirements

### Requirement: The reader can ask a question about the active, ready book

The system SHALL, when the active book is ready (indexed for the configured embedding model), offer a text field and a way to submit a question. Submitting an empty or whitespace-only question SHALL do nothing.

#### Scenario: Question box shown

- **WHEN** the active book is ready
- **THEN** the landing screen offers a question field instead of "coming soon"

#### Scenario: Empty question ignored

- **WHEN** the reader submits an empty or whitespace-only question
- **THEN** nothing is asked and the field stays as it was

### Requirement: Each turn shows the question, the streamed answer, and its citations

The system SHALL, for each question asked, show the question, then the answer's text as it arrives, in order, and then the resolved citations once the answer finishes. Each citation SHALL show the passage's exact locator (at least its chapter) and the passage's own text, not only a chapter number. Earlier turns in the conversation SHALL remain visible.

#### Scenario: Answer appears as it streams

- **WHEN** an answer is being generated
- **THEN** its text grows on screen as pieces arrive, in order

#### Scenario: A citation shows its passage

- **WHEN** an answer's citations are shown
- **THEN** each one names its chapter and shows the exact passage text it points to

#### Scenario: Turns accumulate

- **WHEN** a second question is asked
- **THEN** the first question, its answer and its citations are still shown above the new turn

### Requirement: Nothing relevant is shown like any other answer

The system SHALL show a `nothing-relevant` answer the same way as any other turn, with no special screen state, since it is already the plain, fixed reply asking where in the book to look.

#### Scenario: Nothing found

- **WHEN** the verdict for a question is nothing relevant
- **THEN** the fixed reply is shown as that turn's answer, with no citations and no error styling

### Requirement: A slow first answer says why

The system SHALL, while waiting for the first piece of an answer's text, say plainly that getting the AI ready can take a few minutes the first time and that this is expected, rather than showing nothing or an unexplained spinner.

#### Scenario: Waiting for the first token

- **WHEN** a question has been sent and no text has arrived yet
- **THEN** the screen says getting ready can take a few minutes

### Requirement: An answer can be stopped

The system SHALL let the reader stop an answer while it is streaming. Stopping SHALL keep whatever text and citations had already arrived and SHALL let the reader ask another question immediately afterward.

#### Scenario: Stop mid-answer

- **WHEN** the reader stops an answer that is partly written
- **THEN** the partial text and its citations so far stay visible and a new question can be asked at once

### Requirement: Only one question is answered at a time

The system SHALL NOT let the reader submit a new question while an answer is being generated, except to stop the current one first.

#### Scenario: Busy while answering

- **WHEN** an answer is being generated
- **THEN** the question field or its submit action does not accept a new question until it finishes or is stopped

### Requirement: Failures have a plain message and a retry for that turn

The system SHALL show a plain-language message and a retry action when a turn's retrieval or generation fails: Ollama unreachable, a required model not found, or an answer that could not be produced. Retrying SHALL ask the same question again. Earlier turns SHALL be unaffected.

#### Scenario: Ollama stops mid-conversation

- **WHEN** a question fails because Ollama is unreachable
- **THEN** that turn shows a plain message and a retry, and earlier turns are unchanged

#### Scenario: Retry asks the same question

- **WHEN** the reader retries a failed turn
- **THEN** the same question is sent again

### Requirement: The conversation is per session and per book

The system SHALL start with an empty conversation each time the app opens, and SHALL clear the conversation when the active book changes. It SHALL NOT save the conversation.

#### Scenario: Fresh on restart

- **WHEN** the app is closed and reopened
- **THEN** the conversation is empty, even though the same book is still active

#### Scenario: Fresh on a different book

- **WHEN** the active book changes to a different one
- **THEN** the conversation clears

### Requirement: The conversation is usable without a mouse and announces its answers

The system SHALL let every action (asking, stopping, retrying) be reached and operated by keyboard, and SHALL announce to assistive technology when an answer finishes or fails.

#### Scenario: Keyboard only

- **WHEN** a reader uses only the keyboard
- **THEN** the question field, submit, stop and retry can all be reached and activated

#### Scenario: Completion announced

- **WHEN** an answer finishes or fails
- **THEN** a polite announcement says so
