# first-run-flow Specification

## Purpose
Shows the reader the one screen they need next, worked out from what is really true on their machine each time the app starts, so setup can never get stuck, skip a step, or disagree with reality.

## Requirements

### Requirement: The next screen comes from the real state

The system SHALL decide which screen to show from the real current state on every launch, in this order: the language choice when no language has been chosen yet; a checking screen while the state is being determined; the get-Ollama screen when Ollama is unreachable; the update-Ollama screen when it is too old; the model download screen when a required model is missing; the book import screen when everything is installed and no book has been imported; and otherwise the landing screen. It SHALL NOT rely on a stored "setup finished" marker.

#### Scenario: First launch

- **WHEN** the app starts with no saved language
- **THEN** the language choice screen is shown first

#### Scenario: Everything already in place

- **WHEN** a returning reader starts the app with Ollama running, both models installed and a book imported
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

### Requirement: Screens that wait re-check on their own

The system SHALL, while the get-Ollama or update-Ollama screen is showing, check the state again every few seconds and whenever the reader asks, and SHALL move on by itself as soon as the state allows. It SHALL stop the automatic checks when the reader leaves that screen.

#### Scenario: Ollama gets started

- **WHEN** the reader starts Ollama while the get-Ollama screen is showing
- **THEN** the flow moves to the next needed screen without the reader pressing anything

#### Scenario: Check again on request

- **WHEN** the reader presses the check-again button
- **THEN** the state is checked immediately and the screen updates

#### Scenario: Checks stop when the screen closes

- **WHEN** the reader leaves the waiting screen
- **THEN** no further automatic checks are made

### Requirement: Nothing is downloaded or changed without an explicit action

The system SHALL NOT download a model, import a book or change any setting except through an action the reader takes on screen. Reaching a screen SHALL only ever read state.

#### Scenario: Models missing on launch

- **WHEN** the app starts and a model is missing
- **THEN** the download screen shows what would be downloaded and nothing is downloaded until the reader presses the download button

### Requirement: The landing screen is an honest Ask-mode placeholder

The system SHALL show a landing screen that names the app, states the current mode and what it means in one plain line, shows the active book's title, and offers an action to import a book. When there is no active book it SHALL say so and offer the same action. Ask mode itself is not part of this screen.

#### Scenario: After importing a first book

- **WHEN** the reader finishes importing a book
- **THEN** the landing screen shows the mode line and that book's title as the active book

#### Scenario: No active book

- **WHEN** the reader reaches the landing screen without a book
- **THEN** it says no book is selected and offers to import one

### Requirement: Import can be postponed

The system SHALL let the reader postpone the first import. Postponing SHALL take them to the landing screen for the rest of that session. The import screen SHALL be offered again the next time the app starts if there is still no book.

#### Scenario: Not now

- **WHEN** the reader chooses "not now" on the import screen
- **THEN** the landing screen is shown and the import screen does not reappear during that session

### Requirement: Screens are usable without a mouse

The system SHALL move keyboard focus to the new screen's heading whenever the screen changes, announce important changes such as errors and finished downloads to assistive technology, and make every action reachable and operable by keyboard.

#### Scenario: Screen change

- **WHEN** the flow moves from one screen to the next
- **THEN** keyboard focus is on the new screen's heading

#### Scenario: Keyboard only

- **WHEN** a reader uses only the keyboard
- **THEN** every button, field and the file drop area can be reached and activated

### Requirement: The window is never blank while the app starts

The system SHALL show a splash with the app name, an activity indicator and a short "starting" message from the first paint until the first screen is ready, in the system's language when it is French and in English otherwise. It SHALL replace the splash with the first screen once the app is running. The desktop window SHALL stay hidden until that splash has loaded, and SHALL appear anyway after three seconds if the page has not finished loading. If the app cannot start, it SHALL replace the indicator with a message asking the reader to close and reopen the app.

#### Scenario: Slow start

- **WHEN** the app takes a few seconds to load
- **THEN** the window shows the splash instead of staying blank

#### Scenario: Start finished

- **WHEN** the app is ready
- **THEN** the splash is gone and the first screen is shown

#### Scenario: Start failed

- **WHEN** the app cannot start
- **THEN** the splash says so and asks the reader to close and reopen the app

#### Scenario: Window appears with content

- **WHEN** the desktop app is launched
- **THEN** its window appears with the splash already showing, never as an empty window

#### Scenario: Page slow to load

- **WHEN** the page has not finished loading three seconds after launch
- **THEN** the window is shown anyway
