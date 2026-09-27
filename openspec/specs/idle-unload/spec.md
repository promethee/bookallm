# idle-unload Specification

## Purpose

Keeps the app from holding the reader's GPU memory and RAM indefinitely: every model the app makes Ollama load is released after a chosen idle time, which the reader can change, at the cost of a slower first answer after an unload.

## Requirements

### Requirement: Every model-loading request says how long to keep the model

The system SHALL include, in every request to Ollama that uses a model (chat requests for answers and for Verify claims, and embedding requests for indexing, searching and the hardware check), how long Ollama should keep that model loaded after the request, taken from the idle unload setting. Requests that load no model (version, model list, running models, downloads) SHALL be unchanged.

#### Scenario: A chat request

- **WHEN** the app sends a chat request with the setting at 10 minutes
- **THEN** the request asks Ollama to keep the model loaded for 10 minutes

#### Scenario: An embedding request

- **WHEN** the app sends an embedding request with the setting at 30 minutes
- **THEN** the request asks Ollama to keep the model loaded for 30 minutes

#### Scenario: Never unload

- **WHEN** the setting is "never"
- **THEN** each model-loading request asks Ollama to keep the model loaded with no time limit

### Requirement: The idle time is a saved setting with a sensible default

The system SHALL offer exactly four idle times: 5 minutes, 10 minutes, 30 minutes and never. The default SHALL be 10 minutes. The choice SHALL be saved like the other settings and survive a restart, and a saved value that is not one of the four SHALL be read as the default.

#### Scenario: First launch

- **WHEN** the reader has never chosen an idle time
- **THEN** models are kept for 10 minutes after their last use

#### Scenario: Remembered

- **WHEN** the reader chooses 30 minutes and restarts the app
- **THEN** the setting is still 30 minutes

#### Scenario: Unknown saved value

- **WHEN** the saved setting holds a value that is not one of the four choices
- **THEN** the setting is read as 10 minutes

### Requirement: The reader can change the idle time from the main screen

The system SHALL show, on the main screen whenever a book is shown, a labelled control named for what it does ("Free memory after") with the four choices, showing the current one. Choosing another SHALL save it at once and SHALL apply to every model-loading request sent afterwards; it SHALL NOT interrupt anything running or send any request by itself.

#### Scenario: Changing it

- **WHEN** the reader chooses 5 minutes
- **THEN** the setting is saved and the next model-loading request asks Ollama to keep the model for 5 minutes

#### Scenario: Nothing sent on change

- **WHEN** the reader changes the idle time
- **THEN** no request is sent to Ollama because of the change

### Requirement: The control is usable without a mouse and in both languages

The system SHALL make the idle time control reachable and operable by keyboard alone, with a visible label, and SHALL provide its label and choices in English and French.

#### Scenario: Keyboard only

- **WHEN** a reader uses only the keyboard
- **THEN** they can reach the control and change the idle time

#### Scenario: French

- **WHEN** the interface language is French
- **THEN** the control's label and its four choices are in French
