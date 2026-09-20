# Spec Delta

## Purpose

Combines Ollama detection and model checking into a single answer, "what should the reader do next", so the first-run experience can drive its screens from one result.

## ADDED Requirements

### Requirement: One readiness result names the next step

The system SHALL produce a single readiness result whose next step is chosen in this fixed priority: `get-ollama` when Ollama is unreachable, `update-ollama` when it is outdated, `pull-models` when any required model is missing, and `ready` otherwise. Each result SHALL carry what the step needs: the detection details for the first two, the download plan for `pull-models`, and the installed status for `ready`.

#### Scenario: Ollama not reachable

- **WHEN** Ollama is unreachable
- **THEN** the next step is `get-ollama` and models are not checked

#### Scenario: Ollama too old

- **WHEN** Ollama is reachable but older than the minimum version
- **THEN** the next step is `update-ollama` with the version details

#### Scenario: Models missing

- **WHEN** Ollama is ready and at least one required model is missing
- **THEN** the next step is `pull-models` and the result includes the download plan

#### Scenario: Everything in place

- **WHEN** Ollama is ready and both required models are installed
- **THEN** the next step is `ready`

#### Scenario: Ollama disappears while checking

- **WHEN** Ollama answers the version check but stops answering when its models are listed
- **THEN** the next step is `get-ollama`

### Requirement: Readiness reflects the current state every time

The system SHALL check the real state on every call and SHALL NOT remember an earlier answer, and a check SHALL have no side effects, so the interface can check again after the reader installs Ollama or after a download finishes.

#### Scenario: Ollama gets started

- **WHEN** a check reports `get-ollama` and Ollama is started, and the check is repeated
- **THEN** the second result reflects the running Ollama

#### Scenario: Download completes

- **WHEN** a check reports `pull-models`, the missing models are downloaded, and the check is repeated
- **THEN** the second result is `ready`

### Requirement: Readiness uses the chosen models and address

The system SHALL apply the same Ollama address and required model names to readiness as to detection and provisioning.

#### Scenario: Substituted model

- **WHEN** a different chat model name is given and that model is installed
- **THEN** the chat model counts as present and the default chat model is not required
