# interface-language Specification

## Purpose
Lets the reader use the app in English or French, chosen at first launch or later, without tying the interface language to the models or books they use.

## Requirements

### Requirement: The app is available in English and French

The system SHALL show every piece of text a reader sees (labels, buttons, messages, errors, install guidance, sizes and numbers) in the chosen language, English or French. Sizes and numbers SHALL follow that language's conventions.

#### Scenario: Switching to French

- **WHEN** the reader chooses French
- **THEN** all visible text is in French

#### Scenario: Sizes follow the language

- **WHEN** a size of about 4.9 gigabytes is shown
- **THEN** it reads with English conventions in English and French conventions in French

### Requirement: First launch starts from the system language

The system SHALL, on the first launch, show a language choice preselected to the system language when it is French, and English otherwise, and SHALL let the reader confirm or change it before anything else.

#### Scenario: French system

- **WHEN** the system prefers French and the app starts for the first time
- **THEN** French is preselected on the language screen

#### Scenario: Any other system language

- **WHEN** the system language is neither English nor French
- **THEN** English is preselected

### Requirement: The language can be changed at any time

The system SHALL keep a language control visible on every screen. Changing the language SHALL take effect at once, without restarting and without losing progress, including during a download.

#### Scenario: Switch mid-download

- **WHEN** the reader changes the language while a model is downloading
- **THEN** the text changes and the download and its progress continue unaffected

### Requirement: The choice is remembered

The system SHALL remember the chosen language and use it on the next launch.

#### Scenario: Restart

- **WHEN** the reader chose French and restarts the app
- **THEN** the app opens in French and does not ask again

### Requirement: No text is ever missing

The system SHALL define the same set of messages in both languages. If a message were ever missing in the chosen language, it SHALL show the English text and SHALL NOT show an internal key or a blank.

#### Scenario: Both languages complete

- **WHEN** the two languages are compared
- **THEN** every message exists in both

#### Scenario: Missing text falls back

- **WHEN** a message is missing in the chosen language
- **THEN** the English message is shown

### Requirement: Interface language is independent of the models

The system SHALL NOT change model names, model choices or any download because the interface language changed.

#### Scenario: French interface, default models

- **WHEN** the interface is French
- **THEN** the default models are still the ones offered
