# Spec Delta

## Purpose

Tells the app whether a usable Ollama is available on the machine, and gives the interface what it needs to guide someone who has to install or start it, without ever changing the machine itself.

## ADDED Requirements

### Requirement: Report Ollama's availability

The system SHALL report one of three statuses for the Ollama service: `ready` when it answers and its version is at least the minimum supported version, `outdated` when it answers but its version is older than the minimum, and `unreachable` when it cannot be reached or does not behave like Ollama. A `ready` or `outdated` report SHALL include the version found, and an `outdated` report SHALL also include the minimum version.

#### Scenario: Ollama is running and recent

- **WHEN** Ollama answers with a version at or above the minimum
- **THEN** the status is `ready` and includes that version

#### Scenario: Ollama is too old

- **WHEN** Ollama answers with a version below the minimum
- **THEN** the status is `outdated` and includes the version found and the minimum version

#### Scenario: Nothing is listening

- **WHEN** nothing answers at the Ollama address
- **THEN** the status is `unreachable`

#### Scenario: Installed but not running looks the same as not installed

- **WHEN** Ollama is installed on the machine but its service is not running
- **THEN** the status is `unreachable`, the same as when it is not installed at all

#### Scenario: Something else is on the port

- **WHEN** a different service answers at the address with a response that is not an Ollama version
- **THEN** the status is `unreachable`

### Requirement: Detection is bounded in time

The system SHALL give up and report `unreachable` when Ollama does not answer within a short, fixed time limit, so a hung or blocked connection never stalls the app.

#### Scenario: Connection never answers

- **WHEN** a connection is accepted but no answer arrives within the time limit
- **THEN** the status is `unreachable` once the limit has passed

### Requirement: The Ollama address can be changed

The system SHALL look for Ollama at the standard local address by default, and SHALL accept a different address so that a machine with a custom setup can still be detected.

#### Scenario: Default address

- **WHEN** no address is given
- **THEN** detection uses the standard local Ollama address

#### Scenario: Custom address

- **WHEN** a different address is given
- **THEN** detection and every later request use that address

### Requirement: Install guidance is provided as data

The system SHALL provide install guidance as data for the interface to present: an official Ollama download address suited to the platform (windows, macos or linux) and an ordered list of step identifiers covering downloading, installing, making sure Ollama is running, and checking again. It SHALL fall back to the general official download address for an unknown platform. The guidance SHALL contain no display wording.

#### Scenario: Known platform

- **WHEN** guidance is requested for a known platform
- **THEN** the result contains that platform's official download address and the ordered step identifiers

#### Scenario: Unknown platform

- **WHEN** guidance is requested for a platform that is not recognised
- **THEN** the result contains the general official download address and the same step identifiers

### Requirement: Detection changes nothing on the machine

The system SHALL NOT install, start, stop or configure Ollama, and SHALL NOT alter any model, as part of detection. Detection SHALL only read.

#### Scenario: Read-only requests

- **WHEN** detection runs
- **THEN** it makes only read requests to Ollama and nothing is installed, started or changed
