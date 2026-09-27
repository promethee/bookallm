# Spec Delta

## MODIFIED Requirements

### Requirement: Nothing relevant is shown like any other answer

The system SHALL show a `nothing-relevant` answer the same way as any other turn, with no error styling, since it is already the plain, fixed reply asking where in the book to look. Below that reply, the turn SHALL offer a way to answer it by choosing a chapter, as described by the retrieval recovery capability. A message sent right after such a turn that names a chapter SHALL be read as a chapter hint for it rather than as a new question, as described there; any other message SHALL be asked as a new question.

#### Scenario: Nothing found

- **WHEN** the verdict for a question is nothing relevant
- **THEN** the fixed reply is shown as that turn's answer, with no citations and no error styling, and with a way to choose a chapter

#### Scenario: A new question after nothing found

- **WHEN** the reader's next message after a nothing-found turn does not name a chapter
- **THEN** it is asked as a new question over the whole book
