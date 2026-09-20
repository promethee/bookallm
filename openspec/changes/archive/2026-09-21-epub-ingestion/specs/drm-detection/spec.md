# Spec Delta

## Purpose

Detects DRM-locked EPUBs at ingestion and rejects them with a clear error, so users are told to supply a non-DRM copy. The app never attempts to remove DRM.

## ADDED Requirements

### Requirement: DRM-locked EPUBs are rejected

The system SHALL detect EPUBs protected by DRM and reject them with a dedicated "DRM locked" error before reading any chapter content. The error SHALL name the detected protection scheme when it is known and otherwise report it as unknown.

#### Scenario: Adobe-style rights file

- **WHEN** an EPUB contains a rights description in its container metadata folder
- **THEN** the import fails with the DRM-locked error naming the Adobe scheme

#### Scenario: Apple-style protection file

- **WHEN** an EPUB contains an Apple FairPlay protection file
- **THEN** the import fails with the DRM-locked error naming the Apple scheme

#### Scenario: Readium license file

- **WHEN** an EPUB contains a Readium license file
- **THEN** the import fails with the DRM-locked error naming the Readium scheme

#### Scenario: Encrypted content

- **WHEN** an EPUB's encryption description lists any resource encrypted with an algorithm other than font obfuscation
- **THEN** the import fails with the DRM-locked error, naming the scheme as unknown if none of the above applies

### Requirement: Font obfuscation is not DRM

The system SHALL NOT reject an EPUB solely because its encryption description lists fonts protected by the standard font-obfuscation algorithms. Such EPUBs SHALL import normally.

#### Scenario: Obfuscated fonts only

- **WHEN** an EPUB's encryption description lists only fonts with a standard font-obfuscation algorithm
- **THEN** the import succeeds as it would without that description

### Requirement: DRM takes precedence over structural errors

The system SHALL report the DRM-locked error, not a "malformed EPUB" error, when a DRM-protected EPUB's content is unreadable because it is encrypted.

#### Scenario: Encrypted chapters look broken

- **WHEN** an EPUB is DRM-protected and its content documents cannot be parsed because they are encrypted
- **THEN** the import fails with the DRM-locked error

### Requirement: No DRM circumvention

The system SHALL NOT attempt to decrypt, strip or bypass DRM in any form. A DRM-locked EPUB is always rejected, never processed.

#### Scenario: Locked book is never processed

- **WHEN** a DRM-locked EPUB is imported
- **THEN** no chapters, chunks or registry entries are produced for it
