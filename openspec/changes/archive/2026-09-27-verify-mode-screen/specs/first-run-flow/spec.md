# Spec Delta

## MODIFIED Requirements

### Requirement: The landing screen is an honest Ask-mode placeholder

The system SHALL show a landing screen that names the app, states the current mode and what it means in one plain line, shows the active book's title, and offers an action to import a book. When there is no active book it SHALL say so and offer the same action. When the active book is ready, the screen SHALL offer both Ask mode and Verify mode through tabs, opening in Ask mode with its conversation shown in place of any "coming soon" wording.

#### Scenario: After importing a first book

- **WHEN** the reader finishes importing a book
- **THEN** the landing screen shows the mode line and that book's title as the active book

#### Scenario: No active book

- **WHEN** the reader reaches the landing screen without a book
- **THEN** it says no book is selected and offers to import one

#### Scenario: Ready book shows the conversation

- **WHEN** the reader reaches the landing screen with a ready, indexed active book
- **THEN** the Ask mode conversation is shown instead of a placeholder, with a Verify tab available beside Ask
