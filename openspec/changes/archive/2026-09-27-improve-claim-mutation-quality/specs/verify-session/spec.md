# Spec Delta

## MODIFIED Requirements

### Requirement: Judging reveals the answer and the real passage

The system SHALL, once the reader chooses, say whether the choice was right and whether the claim was true or false. When the claim was false, it SHALL say which kind of detail was changed (the cause, the order of events, who did or said it, or where), show what the book says (the true claim), and show each changed run of words as the book's words and the words that replaced them. In every case it SHALL show the source passage's exact locator (at least its chapter) and the passage's own text. A claim SHALL be judged only once.

#### Scenario: Judged a false claim correctly

- **WHEN** the reader chooses false on a claim that was changed
- **THEN** the screen says they were right, that the claim was false, which kind of detail was changed, what the book says, the changed words, and shows the real passage with its chapter

#### Scenario: Changed words shown

- **WHEN** a changed claim that replaced "Cunégonde" with "Paquette" is revealed
- **THEN** the screen shows "Cunégonde" as the book's words and "Paquette" as what replaced them

#### Scenario: Judged a true claim wrongly

- **WHEN** the reader chooses false on a claim that was true
- **THEN** the screen says they were not right, that the claim was true, and shows the real passage with its chapter, with no changed words

#### Scenario: Only one judgment

- **WHEN** a claim has been judged
- **THEN** the true and false choices can no longer be used for that claim
