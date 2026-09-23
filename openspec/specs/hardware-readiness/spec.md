# hardware-readiness Specification

## Purpose

Tells the reader, before they invest time importing a book, whether this machine can accelerate local AI, since that is the dominant factor in how long each answer takes.

## Requirements

### Requirement: The app checks for acceleration once the required models are ready

The system SHALL, once the required models are confirmed installed (whether they were already present or were just downloaded) and the check has not yet been acknowledged on this install, make one small request to the required embedding model and determine from Ollama's own report whether that request was GPU-accelerated. The check SHALL NOT download anything and SHALL NOT use the larger chat model.

#### Scenario: Checked after models are ready

- **WHEN** the required models are confirmed installed and the check has not yet been acknowledged
- **THEN** the app makes one small request to the embedding model and determines whether it was GPU-accelerated, downloading nothing

### Requirement: An unaccelerated machine is warned before book import

The system SHALL, when no GPU acceleration is detected, show a plain-language screen before the book import screen, saying that this machine does not appear to accelerate local AI, that a single answer can take a very long time (measured: sometimes ten minutes or more) and may occasionally fail to finish, and that this is a real, large slowdown rather than a minor one. The screen SHALL offer an action to continue anyway.

#### Scenario: No acceleration detected

- **WHEN** the check finds no GPU acceleration
- **THEN** the warning screen is shown before book import, explaining the likely wait and offering to continue

### Requirement: Continuing past the warning proceeds normally

The system SHALL, when the reader chooses to continue, proceed to the next screen exactly as if acceleration had been detected. Choosing to continue SHALL NOT change any answering, retrieval or generation behavior.

#### Scenario: Reader continues anyway

- **WHEN** the reader chooses to continue past the warning
- **THEN** the flow proceeds to the book import screen, and answering works exactly as it does on an accelerated machine

### Requirement: The warning is shown at most once per install

The system SHALL remember, once the reader has continued past the warning, that it has been acknowledged on this install, and SHALL NOT show it again on a later launch even though the underlying condition is unchanged.

#### Scenario: Not shown again after acknowledgement

- **WHEN** the reader has already continued past the warning on a previous launch
- **THEN** the warning does not appear again, and the flow goes straight to the next screen

### Requirement: A check that cannot get a clear answer does not block

The system SHALL, when the acceleration check itself cannot get a clear answer (Ollama becomes unreachable, the request fails, or the expected information is missing), proceed as if acceleration had been detected, without retrying the check or blocking the flow.

#### Scenario: Check itself fails

- **WHEN** the acceleration check cannot get a clear answer
- **THEN** the flow proceeds normally, with no warning shown and no delay added
