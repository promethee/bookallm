# Spec Delta

## Purpose

Keeps BookaLLM one click away: while it runs it lives in the system tray, closing the window only hides it (unless the reader prefers otherwise), and the tray brings it back as it was or quits it for good.

## ADDED Requirements

### Requirement: The app shows a tray icon with a menu while it runs

The desktop app SHALL show an icon in the system tray for as long as it runs, with the tooltip "BookaLLM" and a menu offering "Show BookaLLM" and "Quit BookaLLM".

#### Scenario: Tray icon present

- **WHEN** the desktop app is running
- **THEN** its icon is in the system tray, and its menu offers to show and to quit the app

### Requirement: Closing the window hides it to the tray by default

The desktop app SHALL, when the reader closes the window and "Keep running in the tray when closed" is on, hide the window without quitting, keeping the app's state (active book, conversation, Verify session) as it was. When the setting is off, closing the window SHALL quit the app.

#### Scenario: Close with the setting on

- **WHEN** the setting is on and the reader closes the window
- **THEN** the window disappears, the tray icon stays, and the app keeps running

#### Scenario: Close with the setting off

- **WHEN** the setting is off and the reader closes the window
- **THEN** the app quits and its tray icon disappears

### Requirement: The tray brings the window back, or quits

The desktop app SHALL show the window again, restored if minimised and focused, when the reader clicks the tray icon or chooses "Show BookaLLM", with its state as it was when hidden. Choosing "Quit BookaLLM" SHALL quit the app whatever the setting.

#### Scenario: Reopen from the tray

- **WHEN** the window was hidden with a question answered, and the reader clicks the tray icon
- **THEN** the window comes back, focused, with the same conversation shown

#### Scenario: Quit from the tray

- **WHEN** the reader chooses "Quit BookaLLM"
- **THEN** the app quits and its tray icon disappears

### Requirement: The tray setting is saved and shown on the main screen

The system SHALL offer, on the main screen, a checkbox "Keep running in the tray when closed", on by default. Its state SHALL be saved like the other settings and survive a restart, and SHALL take effect for the next close without a restart. In the browser build, where there is no tray, the checkbox SHALL still be saved and SHALL have no other effect.

#### Scenario: Default

- **WHEN** the reader has never changed it
- **THEN** the checkbox is on

#### Scenario: Turned off and remembered

- **WHEN** the reader turns it off and restarts the app
- **THEN** it is still off, and closing the window quits the app

### Requirement: The tray follows the interface language

The desktop app SHALL show the tray menu in the interface language, and SHALL update it when the language changes.

#### Scenario: French

- **WHEN** the interface language is French
- **THEN** the tray menu offers « Afficher BookaLLM » and « Quitter BookaLLM »

### Requirement: The checkbox is usable without a mouse

The system SHALL make the checkbox reachable and operable by keyboard alone, with a visible label, in English and French.

#### Scenario: Keyboard only

- **WHEN** a reader uses only the keyboard
- **THEN** they can reach the checkbox and turn it on and off
