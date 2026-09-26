# verify-session Specification

## Purpose

Turns claim generation into a short loop the reader can play: get one claim about the active book, judge whether it is true, then check the exact passage it came from, with a running score for the session.

## Requirements

### Requirement: The reader asks for a claim when they want one

The system SHALL offer, in Verify mode, an action to get a claim about the active book, and SHALL NOT start generating one until the reader uses it. While a claim is being generated, the action SHALL NOT start another.

#### Scenario: Nothing generated until asked

- **WHEN** the reader switches to Verify mode for the first time in a session
- **THEN** an action to get a claim is offered and no claim is being generated

#### Scenario: One claim at a time

- **WHEN** a claim is being generated
- **THEN** the reader cannot start generating another until it finishes, fails or is stopped

### Requirement: Waiting for a claim says why and can be stopped

The system SHALL, while a claim is being generated, say plainly that getting the AI ready can take a few minutes the first time and that this is expected, and SHALL offer a way to stop. Stopping SHALL leave no claim shown, count nothing in the tally, and let the reader ask for a claim again at once.

#### Scenario: Waiting

- **WHEN** a claim has been requested and is not ready yet
- **THEN** the screen says getting ready can take a few minutes and offers to stop

#### Scenario: Stopped

- **WHEN** the reader stops a claim being generated
- **THEN** no claim is shown, the tally is unchanged, and a new claim can be requested at once

### Requirement: A claim is shown with a true or false choice and nothing that gives the answer away

The system SHALL show the claim's text with two choices, true and false, and SHALL NOT show the citation, the source passage or which attribute was changed until the reader has chosen.

#### Scenario: Claim awaiting judgment

- **WHEN** a claim is ready
- **THEN** its text and the true and false choices are shown, and no source passage is shown

### Requirement: Judging reveals the answer and the real passage

The system SHALL, once the reader chooses, say whether the choice was right and whether the claim was true or false. When the claim was false, it SHALL say which kind of detail was changed (the cause, the order of events, who did or said it, or where). In every case it SHALL show the source passage's exact locator (at least its chapter) and the passage's own text. A claim SHALL be judged only once.

#### Scenario: Judged a false claim correctly

- **WHEN** the reader chooses false on a claim that was changed
- **THEN** the screen says they were right, that the claim was false, which kind of detail was changed, and shows the real passage with its chapter

#### Scenario: Judged a true claim wrongly

- **WHEN** the reader chooses false on a claim that was true
- **THEN** the screen says they were not right, that the claim was true, and shows the real passage with its chapter

#### Scenario: Only one judgment

- **WHEN** a claim has been judged
- **THEN** the true and false choices can no longer be used for that claim

### Requirement: After a reveal the reader can get the next claim

The system SHALL offer, after a reveal, an action to get another claim. A claim SHALL NOT be built from a passage already used for another claim in the same session and book, unless every passage of the book has been used, in which case passages may be used again.

#### Scenario: Next claim

- **WHEN** the reader asks for the next claim after a reveal
- **THEN** a new claim is generated from a passage not already used this session

#### Scenario: Every passage used

- **WHEN** every passage of the book has already been used this session and the reader asks for another claim
- **THEN** a claim is still generated, from a passage used before

### Requirement: The session tally counts judged and correct claims

The system SHALL show how many claims the reader has judged and how many of those they judged correctly, updated after each judgment. Stopped and failed claims SHALL NOT count.

#### Scenario: Tally updates

- **WHEN** the reader judges two claims, one correctly
- **THEN** the tally shows one correct out of two

### Requirement: Verify mode is per session and per book

The system SHALL start Verify mode with no claim and a zero tally each time the app opens, and SHALL clear the current claim, the tally and the passages already used when the active book changes. It SHALL NOT save any of these.

#### Scenario: Fresh on restart

- **WHEN** the app is closed and reopened
- **THEN** Verify mode shows no claim and a zero tally

#### Scenario: Fresh on a different book

- **WHEN** the active book changes to a different one
- **THEN** Verify mode's claim and tally clear

### Requirement: Failures have a plain message and a retry

The system SHALL show a plain-language message and a retry action when a claim cannot be generated: Ollama unreachable, the chat model not found, a claim that could not be made fairly (its changed version never confirmed as false), or any other unusable answer. Retrying SHALL request a new claim. A failure SHALL NOT change the tally.

#### Scenario: Ollama unreachable

- **WHEN** a claim fails because Ollama is unreachable
- **THEN** a plain message says so, a retry is offered, and the tally is unchanged

#### Scenario: Could not make a fair claim

- **WHEN** a claim fails because its changed version was never confirmed as false
- **THEN** a plain message says a fair claim could not be made this time, and a retry is offered

### Requirement: Verify mode is usable without a mouse and announces what happens

The system SHALL let every Verify mode action (get a claim, stop, true, false, next claim, retry) be reached and operated by keyboard, and SHALL announce to assistive technology when a claim is ready, when a judgment is revealed (including whether it was right), and when a claim fails.

#### Scenario: Keyboard only

- **WHEN** a reader uses only the keyboard
- **THEN** every Verify mode action can be reached and activated

#### Scenario: Reveal announced

- **WHEN** the reader judges a claim
- **THEN** a polite announcement says whether they were right
