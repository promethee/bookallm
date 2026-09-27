# Spec Delta

## ADDED Requirements

### Requirement: A whole-book answer with no resolved citation is recoverable

The system SHALL treat a whole-book question turn as recoverable when its search
found nothing relevant, or when its answer finished (not stopped, not failed)
with no resolved citation to a passage. That includes an answer whose citation
markers do not resolve to any passage, and an answer with no marker at all. An
answer with at least one resolved citation SHALL NOT be recoverable, whatever
its wording. A chapter retry, a stopped turn and a failed turn SHALL NOT be
recoverable. The model's own text on an uncited turn SHALL be shown unchanged.

#### Scenario: Markers that do not resolve

- **WHEN** a question's search finds relevant passages and the finished answer
  is "There is no mention of a dog in any of the passages provided[None]", with
  no resolved citation
- **THEN** that turn is recoverable, and the model's text is shown as it is

#### Scenario: No marker at all

- **WHEN** a question's finished answer contains no citation marker
- **THEN** that turn is recoverable

#### Scenario: One resolved citation

- **WHEN** a question's finished answer has at least one resolved citation
- **THEN** that turn is not recoverable and no chapters are offered

#### Scenario: Stopped before any citation

- **WHEN** the reader stops an answer before it finishes, and it has no resolved
  citation
- **THEN** that turn is not recoverable

#### Scenario: Failed answer

- **WHEN** a question's answer fails part way through
- **THEN** that turn is not recoverable; it offers the failure message and its
  own retry instead

## RENAMED Requirements

- FROM: `### Requirement: A nothing-found turn offers the book's chapters`
- TO: `### Requirement: A recoverable turn offers the book's chapters`

<!-- markdownlint-disable-next-line MD013 -->
- FROM: `### Requirement: A typed chapter number right after a nothing-found turn is read as a hint`
- TO: `### Requirement: A typed chapter number after a recoverable turn is a hint`

## MODIFIED Requirements

### Requirement: A recoverable turn offers the book's chapters

The system SHALL, under a recoverable turn's reply, offer the active book's
chapters to choose from, each shown with its title, in book order. Only chapters
with text of their own SHALL be offered: a chapter that is empty, or whose text
is only its own title (as when an EPUB lists a chapter's number as its own
entry), SHALL NOT be offered. On a turn recoverable because its answer has no
resolved citation, the offer SHALL be introduced by a short line saying the
answer cites no passage and so cannot be checked; that line SHALL NOT claim the
book lacks the answer. The offer SHALL be shown only on a recoverable turn,
never on a chapter retry, and SHALL no longer be usable once that turn has been
retried in a chapter.

#### Scenario: Chapters offered

- **WHEN** a question's search finds nothing relevant
- **THEN** that turn offers the book's chapters with text, by title, in book
  order

#### Scenario: Chapters offered after an uncited answer

- **WHEN** a question's finished answer has no resolved citation
- **THEN** under the model's text, the turn says the answer cites no passage and
  so cannot be checked, then offers the book's chapters with text

#### Scenario: No uncited line after nothing found

- **WHEN** a question's search finds nothing relevant
- **THEN** the chapters are offered under the fixed reply without the "cites no
  passage" line

#### Scenario: Empty chapters left out

- **WHEN** the book has a chapter with no text
- **THEN** that chapter is not offered

#### Scenario: Heading-only entries left out

- **WHEN** the book has an entry whose text is only its own title, such as "V"
- **THEN** that entry is not offered

#### Scenario: Offered once per question

- **WHEN** the reader has already chosen a chapter for a recoverable turn
- **THEN** that turn no longer offers the chapters

### Requirement: A typed chapter number after a recoverable turn is a hint

The system SHALL, when the reader's message immediately follows a recoverable
turn (or the "could not tell which chapter" reply about it) and names a chapter
by number, treat it as a chapter hint for that turn's question instead of a new
question. A chapter is named by the word "chapter" or "chapitre" (any letter
case, optionally abbreviated "ch." or "chap.") followed by a number in digits or
Roman numerals. The number SHALL be matched against the chapters' own titles,
not their position in the table of contents. A matching entry without text of
its own SHALL stand for the next entry that has text of its own, since that is
where its chapter is. When exactly one chapter results, that chapter SHALL be
used. When none or several match, the system SHALL NOT guess: it SHALL say it
could not tell which chapter was meant and offer the chapter list for that
question.

#### Scenario: Digits

- **WHEN** the reader's message after a nothing-found turn is "try chapter 7"
  and exactly one chapter's title names chapter 7
- **THEN** that turn's question is retried in that chapter

#### Scenario: After an uncited answer

- **WHEN** the reader's message after a turn whose answer has no resolved
  citation is "try chapter 7" and exactly one chapter's title names chapter 7
- **THEN** that turn's question is retried in that chapter

#### Scenario: Roman numerals, in French

- **WHEN** the reader's message after a nothing-found turn is "regarde au
  chapitre VII" and exactly one chapter's title names chapter VII or 7
- **THEN** that turn's question is retried in that chapter

#### Scenario: Title numbering differs from position

- **WHEN** the book's seventh entry is an introduction and its "Chapter 7" is a
  later entry
- **THEN** "chapter 7" means the entry titled as chapter 7, not the seventh
  entry

#### Scenario: A number that is its own entry

- **WHEN** "chapter 5" matches an entry titled "V" whose text is only "V",
  followed by an entry with the chapter's text
- **THEN** that turn's question is retried in the entry with the chapter's text

#### Scenario: No unique match

- **WHEN** the named chapter matches no chapter title, or more than one
- **THEN** nothing is retried, the reader is told the chapter could not be
  identified, and the chapter list is offered

#### Scenario: A second try after an unclear hint

- **WHEN** the reader was told the chapter could not be identified and then
  types a chapter that matches exactly one title
- **THEN** the original recoverable question is retried in that chapter

#### Scenario: Not right after a nothing-found turn

- **WHEN** a message names a chapter but the turn before it found relevant
  passages and its answer has at least one resolved citation, or there is no
  turn before it
- **THEN** it is asked as a new question over the whole book

#### Scenario: After a stopped or failed turn

- **WHEN** a message names a chapter and the turn before it was stopped or
  failed
- **THEN** it is asked as a new question over the whole book

### Requirement: The retry looks in the chosen chapter only

The system SHALL retry the recoverable turn's own question, unchanged, against
the chosen chapter's passages only, and SHALL answer from that chapter's best
passages even when none reaches the relevance cutoff. The answer SHALL stream
and carry exact citations the same way as any other answer. The retry SHALL
appear as a new turn that names the chapter and repeats the original question,
so the reader can tell it from a new question.

#### Scenario: Answer from the chapter

- **WHEN** the reader chooses a chapter for a recoverable turn
- **THEN** a new turn names that chapter and the original question, and its
  answer cites only passages from that chapter

#### Scenario: Below the cutoff

- **WHEN** none of the chosen chapter's passages reaches the relevance cutoff
- **THEN** the answer is still generated from the chapter's best passages rather
  than returning the nothing-found reply

### Requirement: One retry, then the chapter itself is handed over

The system SHALL retry at most once per recoverable question. When the chapter
retry's finished answer contains no citation to a passage, or the chosen chapter
has no passages to answer from, the system SHALL stop trying: it SHALL say
plainly that it could not find the answer in that chapter and SHALL show the
chapter's full text in that turn for the reader to scan. It SHALL NOT make
another AI attempt or offer the chapter list again for that question. The
wording SHALL NOT claim the book or the chapter lacks the answer.

#### Scenario: Retry answers with citations

- **WHEN** the chapter retry's answer cites at least one passage
- **THEN** the turn ends like any other answer and no chapter text is shown

#### Scenario: Retry cannot answer

- **WHEN** the chapter retry's finished answer cites no passage
- **THEN** the turn says it could not find it in that chapter and shows the
  chapter's full text

#### Scenario: No endless loop

- **WHEN** the chapter text has been handed over for a question
- **THEN** no chapter list or further retry is offered for that question

#### Scenario: A retry is never itself recoverable

- **WHEN** a chapter retry's finished answer has no resolved citation
- **THEN** the chapter text is handed over and the retry turn offers no chapters

#### Scenario: Honest wording

- **WHEN** the chapter text is handed over
- **THEN** the message invites the reader to look through the chapter and never
  says the answer is not in the book
