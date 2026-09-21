# Spec Delta

## Purpose

Walks a reader who is not a developer through getting Ollama running and the two models installed, in plain language, with no download happening until they say so.

## ADDED Requirements

### Requirement: The get-Ollama screen explains and guides

The system SHALL, when Ollama is unreachable, show a screen that explains in plain language what Ollama is and why the app needs it, lists the install steps in order (download, install, make sure it is running, check again), and says that Ollama may already be installed but not running. It SHALL offer a button that opens the official Ollama download page for the reader's platform in their default browser, and a button to check again.

#### Scenario: Ollama is missing

- **WHEN** Ollama is unreachable
- **THEN** the screen shows the explanation, the ordered steps and the note that it might only need to be started

#### Scenario: Opening the download page

- **WHEN** the reader presses the download button
- **THEN** the official download page for their platform opens in the default browser, or the general official page when the platform is not recognised

#### Scenario: Only official pages open

- **WHEN** the app is asked to open any address other than an official Ollama page
- **THEN** it refuses and opens nothing

### Requirement: The update-Ollama screen states versions plainly

The system SHALL, when Ollama is too old, show a screen that says the installed version and the minimum version needed, points to the official download page, and re-checks like the get-Ollama screen.

#### Scenario: Old Ollama

- **WHEN** Ollama is older than the minimum
- **THEN** the screen shows both versions and the download button

### Requirement: The reader confirms the models before anything downloads

The system SHALL show, before any download, which models are missing with an approximate size in the reader's language and units and the total of the known sizes, and SHALL say that this is a one-time step that may take a few minutes. A model with an unknown size SHALL say so. It SHALL let the reader change the chat and embedding model names, prefilled with the saved or default names, and SHALL update the list and sizes when a name is changed. Installed models SHALL NOT be listed for download. Downloading SHALL start only when the reader presses the download button.

#### Scenario: Default plan

- **WHEN** the chat model is missing and the embedding model is installed
- **THEN** only the chat model is listed, with its approximate size and the total

#### Scenario: Swapped model

- **WHEN** the reader changes the chat model name to another model
- **THEN** the list and sizes are recalculated for that name

#### Scenario: Unknown size

- **WHEN** a chosen model has no known size
- **THEN** its size is shown as unknown and it is left out of the total

#### Scenario: Nothing starts by itself

- **WHEN** the confirmation screen appears
- **THEN** no download begins until the reader presses the download button

### Requirement: Download progress is clear and stoppable

The system SHALL, while downloading, show which model is downloading, the current phase in plain words, the amount downloaded out of the total in the reader's units, and a progress bar that assistive technology can read. It SHALL offer a cancel button; after a cancel it SHALL offer a continue button that resumes the same download. When every required model is installed it SHALL move on by itself.

#### Scenario: Watching a download

- **WHEN** a model is downloading
- **THEN** the screen shows its name, the phase, the amount downloaded of the total and a progress bar

#### Scenario: Cancel and continue

- **WHEN** the reader cancels and later presses continue
- **THEN** the download resumes and the screen shows the partly downloaded progress again

#### Scenario: All done

- **WHEN** the last required model finishes
- **THEN** the flow moves to the next screen without further action

### Requirement: Every failure has a plain message and a next step

The system SHALL show a plain-language message and a retry action for each download failure code. It SHALL say Ollama seems to have stopped for `unreachable`, ask the reader to check the model name for `model-not-found`, ask them to free some disk space for `insufficient-disk-space`, and for any other failure say the download did not finish and offer Ollama's own message as a details section.

#### Scenario: Ollama stops mid-download

- **WHEN** the connection to Ollama drops while downloading
- **THEN** the screen says Ollama seems to have stopped and offers to try again

#### Scenario: Unknown model name

- **WHEN** a model name does not exist
- **THEN** the screen asks the reader to check the name and lets them change it

#### Scenario: Disk full

- **WHEN** the download fails for lack of disk space
- **THEN** the screen asks the reader to free some space and try again

#### Scenario: Another failure

- **WHEN** the download fails for another reason
- **THEN** the screen says it did not finish and shows Ollama's message under a details section

### Requirement: Model names and the Ollama address are remembered

The system SHALL remember the confirmed model names and use them on the next launch. It SHALL offer an advanced section, closed by default, to change the Ollama address, SHALL accept only a web address, SHALL tell the reader when an entered address is not valid without saving it, and SHALL use and remember a valid one.

#### Scenario: Names remembered

- **WHEN** the reader confirms swapped model names and restarts the app
- **THEN** the swapped names are used

#### Scenario: Custom address

- **WHEN** the reader enters a valid address in the advanced section
- **THEN** it is used for every check and download and is remembered

#### Scenario: Invalid address

- **WHEN** the reader enters something that is not a web address
- **THEN** a message says so and the previous address stays in use
