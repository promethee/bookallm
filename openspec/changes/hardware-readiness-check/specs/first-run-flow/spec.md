# Spec Delta

## MODIFIED Requirements

### Requirement: The next screen comes from the real state

The system SHALL decide which screen to show from the real current state on every launch, in this order: the language choice when no language has been chosen yet; a checking screen while the state is being determined; the get-Ollama screen when Ollama is unreachable; the update-Ollama screen when it is too old; the model download screen when a required model is missing; the hardware warning screen when the required models are ready and its acceleration check has not yet been acknowledged on this install; the indexing screen when the active book is not indexed for the configured embedding model; the book import screen when everything is installed and no book has been imported; and otherwise the landing screen. It SHALL NOT rely on a stored "setup finished" marker.

#### Scenario: First launch

- **WHEN** the app starts with no saved language
- **THEN** the language choice screen is shown first

#### Scenario: Everything already in place

- **WHEN** a returning reader starts the app with Ollama running, both models installed, the hardware warning already acknowledged (or not needed) and an indexed book
- **THEN** the landing screen is shown and no setup screen appears

#### Scenario: Ollama has stopped since last time

- **WHEN** a returning reader starts the app and Ollama is not running
- **THEN** the get-Ollama screen is shown

#### Scenario: A model was removed since last time

- **WHEN** Ollama is running but a required model is no longer installed
- **THEN** the model download screen is shown

#### Scenario: Ready but no book yet

- **WHEN** Ollama and both models are ready, the hardware warning is already acknowledged (or not needed) and no book has been imported
- **THEN** the book import screen is shown

#### Scenario: Ready but the book is not indexed

- **WHEN** Ollama and both models are ready, the hardware warning is already acknowledged (or not needed) and the active book is not indexed for the configured embedding model
- **THEN** the indexing screen is shown before the landing screen

#### Scenario: Models come before indexing

- **WHEN** the active book is not indexed and the embedding model is not installed
- **THEN** the model download screen is shown, and the indexing screen follows once the model is installed

#### Scenario: The hardware warning comes before indexing and book import

- **WHEN** the required models have just become ready and the hardware warning has not yet been acknowledged on this install
- **THEN** the hardware warning screen is shown before either the indexing screen or the book import screen
