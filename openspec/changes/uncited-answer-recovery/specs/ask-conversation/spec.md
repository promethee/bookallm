# Spec Delta

## ADDED Requirements

### Requirement: An answer that cites no passage offers a way forward

The system SHALL show a finished answer that has no resolved citation like any
other answer, keeping the model's text unchanged and with no error styling.
Below that text, the turn SHALL say the answer cites no passage and so cannot be
checked, then offer a way to look in a chosen chapter, as described by the
retrieval recovery capability. A message sent right after such a turn that names
a chapter SHALL be read as a chapter hint for it rather than as a new question,
as described there; any other message SHALL be asked as a new question.

#### Scenario: Uncited answer

- **WHEN** a question's finished answer has no resolved citation
- **THEN** the model's text is shown unchanged with no sources and no error
  styling, followed by the "cites no passage" line and a way to choose a chapter

#### Scenario: A new question after an uncited answer

- **WHEN** the reader's next message after an uncited answer does not name a
  chapter
- **THEN** it is asked as a new question over the whole book

#### Scenario: French

- **WHEN** the interface language is French and an answer has no resolved
  citation
- **THEN** the "cites no passage" line is in French
