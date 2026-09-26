# mode-tabs Specification

## Purpose

Lets the reader move between Ask mode and Verify mode at a glance, always knowing which one they are in, so Verify mode's deliberately false claims never read as Ask mode's sincere answers.

## Requirements

### Requirement: Both modes are offered as tabs once the active book is ready

The system SHALL, when the active book is ready, show an Ask tab and a Verify tab on the landing screen, both visible at the same time, with the current one marked as selected. Choosing a tab SHALL switch to that mode. The system SHALL open in Ask mode each time the app starts. When there is no ready active book, no tabs SHALL be shown.

#### Scenario: Tabs shown for a ready book

- **WHEN** the reader reaches the landing screen with a ready, indexed active book
- **THEN** both an Ask tab and a Verify tab are shown, and Ask is selected

#### Scenario: Switching to Verify

- **WHEN** the reader chooses the Verify tab
- **THEN** the Verify mode screen is shown and the Verify tab is marked as selected

#### Scenario: Fresh start opens in Ask mode

- **WHEN** the app is closed while in Verify mode and opened again
- **THEN** it opens in Ask mode

#### Scenario: No tabs without a ready book

- **WHEN** there is no active book
- **THEN** no mode tabs are shown

### Requirement: The disclosure line names the current mode and what it means

The system SHALL always show, at the top of the landing screen, one plain line naming the current mode and what it means, and SHALL change it when the mode changes: in Ask mode, that answers are cited and should be checked; in Verify mode, that the claim shown may be false.

#### Scenario: Line follows the mode

- **WHEN** the reader switches from Ask mode to Verify mode
- **THEN** the line changes from the Ask mode wording to the Verify mode wording

### Requirement: Ask mode and Verify mode look distinct

The system SHALL give Verify mode a color and layout that differ visibly from Ask mode's, including its disclosure line, so a Verify mode claim cannot be mistaken for an Ask mode answer.

#### Scenario: Distinct at a glance

- **WHEN** the reader is in Verify mode
- **THEN** the disclosure line and the claim area use Verify mode's own color, not Ask mode's

### Requirement: Switching modes keeps each mode's state for the session

The system SHALL keep the Ask conversation, the current Verify claim and the Verify tally when the reader switches between tabs, for the rest of the session. A claim or answer being generated SHALL keep going while the other tab is shown.

#### Scenario: Round trip keeps both

- **WHEN** the reader asks a question, switches to Verify, judges a claim, and switches back to Ask
- **THEN** the Ask conversation is unchanged, and returning to Verify shows the same claim and tally

### Requirement: The tabs work by keyboard and are announced as tabs

The system SHALL let the reader reach and switch the tabs by keyboard, and SHALL expose them to assistive technology as a set of tabs with the current one marked selected.

#### Scenario: Keyboard switch

- **WHEN** a reader using only the keyboard moves to the tabs and activates Verify
- **THEN** Verify mode is shown and assistive technology reports the Verify tab as selected
