# model-provisioning Specification

## Purpose
Checks which models the app needs are installed in Ollama, shows what would have to be downloaded, and downloads missing models only on explicit request, with progress, cancellation and clear failure reasons.

## Requirements

### Requirement: Required models are configurable with defaults

The system SHALL work with a required set of two models, one for chat and one for embeddings, defaulting to `llama3.1:8b` and `bge-m3`. The names SHALL be inputs, so other models can be substituted.

#### Scenario: Defaults

- **WHEN** no model names are given
- **THEN** the required models are `llama3.1:8b` for chat and `bge-m3` for embeddings

#### Scenario: Substituted model

- **WHEN** a different chat model name is given
- **THEN** every check, plan and download uses that name instead of the default

### Requirement: Report which required models are installed

The system SHALL report, for each required model, whether it is installed. Names SHALL be compared ignoring letter case, and a name without a tag SHALL mean the `latest` tag. A different tag of the same model SHALL NOT count as installed. Failure to read the installed list SHALL be reported as an error, not as "nothing installed".

#### Scenario: Untagged name matches the latest tag

- **WHEN** `bge-m3` is required and `bge-m3:latest` is installed
- **THEN** the embedding model is reported as installed

#### Scenario: Other tag does not count

- **WHEN** `llama3.1:8b` is required and only `llama3.1:70b` is installed
- **THEN** the chat model is reported as missing

#### Scenario: Partly set up

- **WHEN** the embedding model is installed and the chat model is not
- **THEN** the report shows the embedding model installed and the chat model missing

#### Scenario: Installed list cannot be read

- **WHEN** the installed models cannot be listed because Ollama stops answering
- **THEN** the result is an `unreachable` error rather than a report that everything is missing

### Requirement: Downloads are planned before they happen

The system SHALL be able to produce a download plan that lists only the missing required models, each with its name and an approximate size in bytes when known, plus the total of the known sizes. Producing a plan SHALL NOT download anything, and no download SHALL start unless a download is explicitly requested.

#### Scenario: Plan lists only what is missing

- **WHEN** the embedding model is installed and the chat model is missing
- **THEN** the plan contains only the chat model, with its approximate size

#### Scenario: Unknown size

- **WHEN** a substituted model has no known size
- **THEN** the plan lists it with an unknown size and leaves it out of the total

#### Scenario: Nothing to download

- **WHEN** every required model is installed
- **THEN** the plan is empty

#### Scenario: No silent download

- **WHEN** detection, readiness checking or planning runs
- **THEN** no model is downloaded

### Requirement: A model download reports progress

The system SHALL report progress while a model downloads: the current phase (preparing, downloading, verifying, finishing, done) and, while downloading, the bytes completed and total bytes summed across everything the model needs, with the completed fraction. Progress SHALL be reported repeatedly, not only at the end.

#### Scenario: Progress across several parts

- **WHEN** a model made of several parts is downloading
- **THEN** progress reports the summed completed and total bytes and the resulting fraction

#### Scenario: Successful download

- **WHEN** a download finishes
- **THEN** the result is success and the last reported phase is done

### Requirement: A download can be cancelled and resumed

The system SHALL let the caller cancel a download in progress. A cancelled download SHALL stop promptly and be reported as cancelled rather than as a failure. The system SHALL NOT delete any partly downloaded data, so that requesting the same download again continues instead of starting over.

#### Scenario: Cancel

- **WHEN** the caller cancels a download in progress
- **THEN** the download stops and the result is cancelled, not failed

#### Scenario: Resume

- **WHEN** a cancelled download is requested again
- **THEN** it is requested from Ollama again without removing partial data, so Ollama continues where it stopped

### Requirement: Download failures have typed reasons

The system SHALL report a failed download with a stable code: `unreachable` when Ollama cannot be reached or stops answering, `model-not-found` when Ollama has no model of that name, `insufficient-disk-space` when the failure is about lack of disk space, and `pull-failed` for any other failure, keeping Ollama's message as detail. A failure that Ollama reports part-way through an otherwise successful response SHALL be treated as a failure.

#### Scenario: Unknown model name

- **WHEN** a model that does not exist is requested
- **THEN** the result is a failure with the code `model-not-found`

#### Scenario: Connection lost mid-download

- **WHEN** the connection to Ollama drops while downloading
- **THEN** the result is a failure with the code `unreachable`

#### Scenario: Error reported inside the response

- **WHEN** Ollama reports an error part-way through a response that began normally
- **THEN** the download is reported as failed, not as success

#### Scenario: Out of disk space

- **WHEN** Ollama reports that there is no space left
- **THEN** the result is a failure with the code `insufficient-disk-space`

#### Scenario: Any other failure

- **WHEN** Ollama reports an error that matches no other reason
- **THEN** the result is a failure with the code `pull-failed` and Ollama's message as detail

### Requirement: Several models download one after another

The system SHALL be able to download all missing required models in sequence on one explicit request, reporting which model is in progress. It SHALL skip models that are already installed and SHALL stop at the first failure or cancellation without starting later models.

#### Scenario: Both missing

- **WHEN** both required models are missing and a download of all missing models is requested
- **THEN** the first model downloads, then the second, and progress names the model in progress

#### Scenario: One already installed

- **WHEN** only one required model is missing
- **THEN** only that model is downloaded

#### Scenario: Stops at the first failure

- **WHEN** the first model fails to download
- **THEN** the second is not started and the failure is reported
