# Spec Delta

## ADDED Requirements

### Requirement: A search can be restricted to one chapter

The system SHALL accept an optional chapter to search in. When one is given, only that chapter's passages SHALL be ranked and returned, still best first and still bounded by the chosen number, and only that chapter's stored vectors SHALL be read. The verdict SHALL be computed the same way as for a whole-book search. A chapter that has no passages SHALL return no passages with a `nothing-relevant` verdict, without sending anything to Ollama. The question SHALL still be embedded with the configured embedding model and sent only to the configured Ollama address.

#### Scenario: Only that chapter's passages

- **WHEN** a question is searched in one chapter
- **THEN** every passage returned belongs to that chapter, ordered from the highest score to the lowest

#### Scenario: A better match elsewhere is ignored

- **WHEN** a passage in another chapter matches the question better than any passage in the chosen chapter
- **THEN** that passage is not returned

#### Scenario: Low scores are still returned

- **WHEN** no passage of the chosen chapter reaches the relevance cutoff
- **THEN** the chapter's best passages are still returned, with a `nothing-relevant` verdict

#### Scenario: Chapter without text

- **WHEN** the chosen chapter has no passages
- **THEN** no passages are returned, the verdict is nothing relevant, and no request is sent to Ollama
