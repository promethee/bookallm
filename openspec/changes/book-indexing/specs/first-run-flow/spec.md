# Spec Delta

## MODIFIED Requirements

### Requirement: The next screen comes from the real state

The system SHALL decide which screen to show from the real current state on every launch, in this order: the language choice when no language has been chosen yet; a checking screen while the state is being determined; the get-Ollama screen when Ollama is unreachable; the update-Ollama screen when it is too old; the model download screen when a required model is missing; the indexing screen when the active book is not indexed for the configured embedding model; the book import screen when everything is installed and no book has been imported; and otherwise the landing screen. It SHALL NOT rely on a stored "setup finished" marker.

#### Scenario: First launch

- **WHEN** the app starts with no saved language
- **THEN** the language choice screen is shown first

#### Scenario: Everything already in place

- **WHEN** a returning reader starts the app with Ollama running, both models installed and an indexed book
- **THEN** the landing screen is shown and no setup screen appears

#### Scenario: Ollama has stopped since last time

- **WHEN** a returning reader starts the app and Ollama is not running
- **THEN** the get-Ollama screen is shown

#### Scenario: A model was removed since last time

- **WHEN** Ollama is running but a required model is no longer installed
- **THEN** the model download screen is shown

#### Scenario: Ready but no book yet

- **WHEN** Ollama and both models are ready and no book has been imported
- **THEN** the book import screen is shown

#### Scenario: Ready but the book is not indexed

- **WHEN** Ollama and both models are ready and the active book is not indexed for the configured embedding model
- **THEN** the indexing screen is shown before the landing screen

#### Scenario: Models come before indexing

- **WHEN** the active book is not indexed and the embedding model is not installed
- **THEN** the model download screen is shown, and the indexing screen follows once the model is installed

### Requirement: Nothing is downloaded or changed without an explicit action

The system SHALL NOT download a model, import a book or change any setting except through an action the reader takes on screen. Reaching a screen SHALL only ever read state, with one exception: the indexing screen indexes the active book by itself, because the reader already chose that book or the embedding model, it downloads nothing, and it changes only the app's own index of that book.

#### Scenario: Models missing on launch

- **WHEN** the app starts and a model is missing
- **THEN** the download screen shows what would be downloaded and nothing is downloaded until the reader presses the download button

#### Scenario: Indexing needs no button

- **WHEN** the indexing screen appears for an active book that is not indexed
- **THEN** indexing starts by itself, and no model is downloaded and no setting is changed
