# retrieval-recovery Specification

## Purpose
Gives a "nothing found" answer a way forward: the reader points to a chapter, the app looks once more in that chapter only, and if it still cannot answer it hands over the chapter itself, so a failed search ends with the primary source in the reader's hands rather than a loop of non-answers.

## Requirements

### Requirement: A nothing-found turn offers the book's chapters

The system SHALL, under a nothing-found turn's reply, offer the active book's chapters to choose from, each shown with its title, in book order. Only chapters with text of their own SHALL be offered: a chapter that is empty, or whose text is only its own title (as when an EPUB lists a chapter's number as its own entry), SHALL NOT be offered. The offer SHALL be shown only on a turn whose whole-book search found nothing relevant, never on a chapter retry, and SHALL no longer be usable once that turn has been retried in a chapter.

#### Scenario: Chapters offered

- **WHEN** a question's search finds nothing relevant
- **THEN** that turn offers the book's chapters with text, by title, in book order

#### Scenario: Empty chapters left out

- **WHEN** the book has a chapter with no text
- **THEN** that chapter is not offered

#### Scenario: Heading-only entries left out

- **WHEN** the book has an entry whose text is only its own title, such as "V"
- **THEN** that entry is not offered

#### Scenario: Offered once per question

- **WHEN** the reader has already chosen a chapter for a nothing-found turn
- **THEN** that turn no longer offers the chapters

### Requirement: A typed chapter number right after a nothing-found turn is read as a hint

The system SHALL, when the reader's message immediately follows a nothing-found turn (or the "could not tell which chapter" reply about it) and names a chapter by number, treat it as a chapter hint for that turn's question instead of a new question. A chapter is named by the word "chapter" or "chapitre" (any letter case, optionally abbreviated "ch." or "chap.") followed by a number in digits or Roman numerals. The number SHALL be matched against the chapters' own titles, not their position in the table of contents. A matching entry without text of its own SHALL stand for the next entry that has text of its own, since that is where its chapter is. When exactly one chapter results, that chapter SHALL be used. When none or several match, the system SHALL NOT guess: it SHALL say it could not tell which chapter was meant and offer the chapter list for that question.

#### Scenario: Digits

- **WHEN** the reader's message after a nothing-found turn is "try chapter 7" and exactly one chapter's title names chapter 7
- **THEN** that turn's question is retried in that chapter

#### Scenario: Roman numerals, in French

- **WHEN** the reader's message after a nothing-found turn is "regarde au chapitre VII" and exactly one chapter's title names chapter VII or 7
- **THEN** that turn's question is retried in that chapter

#### Scenario: Title numbering differs from position

- **WHEN** the book's seventh entry is an introduction and its "Chapter 7" is a later entry
- **THEN** "chapter 7" means the entry titled as chapter 7, not the seventh entry

#### Scenario: A number that is its own entry

- **WHEN** "chapter 5" matches an entry titled "V" whose text is only "V", followed by an entry with the chapter's text
- **THEN** that turn's question is retried in the entry with the chapter's text

#### Scenario: No unique match

- **WHEN** the named chapter matches no chapter title, or more than one
- **THEN** nothing is retried, the reader is told the chapter could not be identified, and the chapter list is offered

#### Scenario: A second try after an unclear hint

- **WHEN** the reader was told the chapter could not be identified and then types a chapter that matches exactly one title
- **THEN** the original nothing-found question is retried in that chapter

#### Scenario: Not right after a nothing-found turn

- **WHEN** a message names a chapter but the turn before it found relevant passages, or there is no turn before it
- **THEN** it is asked as a new question over the whole book

### Requirement: The retry looks in the chosen chapter only

The system SHALL retry the nothing-found turn's own question, unchanged, against the chosen chapter's passages only, and SHALL answer from that chapter's best passages even when none reaches the relevance cutoff. The answer SHALL stream and carry exact citations the same way as any other answer. The retry SHALL appear as a new turn that names the chapter and repeats the original question, so the reader can tell it from a new question.

#### Scenario: Answer from the chapter

- **WHEN** the reader chooses a chapter for a nothing-found turn
- **THEN** a new turn names that chapter and the original question, and its answer cites only passages from that chapter

#### Scenario: Below the cutoff

- **WHEN** none of the chosen chapter's passages reaches the relevance cutoff
- **THEN** the answer is still generated from the chapter's best passages rather than returning the nothing-found reply

### Requirement: One retry, then the chapter itself is handed over

The system SHALL retry at most once per nothing-found question. When the chapter retry's finished answer contains no citation to a passage, or the chosen chapter has no passages to answer from, the system SHALL stop trying: it SHALL say plainly that it could not find the answer in that chapter and SHALL show the chapter's full text in that turn for the reader to scan. It SHALL NOT make another AI attempt or offer the chapter list again for that question. The wording SHALL NOT claim the book or the chapter lacks the answer.

#### Scenario: Retry answers with citations

- **WHEN** the chapter retry's answer cites at least one passage
- **THEN** the turn ends like any other answer and no chapter text is shown

#### Scenario: Retry cannot answer

- **WHEN** the chapter retry's finished answer cites no passage
- **THEN** the turn says it could not find it in that chapter and shows the chapter's full text

#### Scenario: No endless loop

- **WHEN** the chapter text has been handed over for a question
- **THEN** no chapter list or further retry is offered for that question

#### Scenario: Honest wording

- **WHEN** the chapter text is handed over
- **THEN** the message invites the reader to look through the chapter and never says the answer is not in the book

### Requirement: The handed-over chapter text is readable in place

The system SHALL show the handed-over chapter inside the conversation, under its title, with its paragraphs kept, in a block of bounded height that scrolls, and SHALL let the reader collapse and expand it. It SHALL be shown expanded at first.

#### Scenario: Long chapter

- **WHEN** the handed-over chapter is longer than the block's height
- **THEN** the block scrolls on its own and the rest of the conversation stays where it is

#### Scenario: Collapse

- **WHEN** the reader collapses the chapter text
- **THEN** only its title line remains, and expanding it shows the text again

### Requirement: Stopping, failures and the busy state work as for any turn

The system SHALL let a chapter retry be stopped, SHALL show a plain message and a retry of the same chapter retry when it fails (Ollama unreachable, a model not found, an answer that could not be produced), and SHALL NOT accept another question while it runs. A stopped or failed retry SHALL NOT hand over the chapter text, and retrying a failed chapter retry SHALL NOT count as a second retry.

#### Scenario: Stopped retry

- **WHEN** the reader stops a chapter retry while it is answering
- **THEN** the partial answer is kept and no chapter text is shown

#### Scenario: Failed retry

- **WHEN** a chapter retry fails because Ollama is unreachable
- **THEN** the turn shows a plain message and a retry that searches the same chapter again

### Requirement: Recovery is usable without a mouse, in both languages, and announced

The system SHALL let the reader reach and choose a chapter, and collapse or expand the handed-over text, by keyboard alone. All new text SHALL be available in English and French. The system SHALL announce politely when a chapter retry finishes, fails, or hands over the chapter text.

#### Scenario: Keyboard only

- **WHEN** a reader uses only the keyboard after a nothing-found turn
- **THEN** they can reach the chapter list, choose a chapter, and collapse and expand the handed-over text

#### Scenario: Hand-over announced

- **WHEN** the chapter text is handed over
- **THEN** a polite announcement says the chapter is shown to look through

#### Scenario: French

- **WHEN** the interface language is French
- **THEN** the chapter offer, the retry label, the hand-over message and the collapse control are in French
