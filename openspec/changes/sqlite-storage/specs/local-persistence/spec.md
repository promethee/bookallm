# Spec Delta

## ADDED Requirements

### Requirement: The desktop app keeps its library in a SQLite database file

The desktop app SHALL store its library (the registry records, each book's stored text and chunks, and the vectors for every embedding model) in a SQLite database file in the app's data folder, and every other requirement of this capability SHALL hold for it: books and vectors survive a restart, a book and its record are saved together, a chapter's vectors are saved together or not at all, removing a book removes its content and all its vectors but never the reader's file, and storage problems are reported plainly. The browser build, which cannot open such a file, SHALL keep using the webview's storage.

#### Scenario: Stored in a file

- **WHEN** a book is imported and indexed in the desktop app
- **THEN** its record, text and vectors are in the SQLite database file in the app's data folder, not in the webview's storage

#### Scenario: Survives a restart

- **WHEN** the desktop app is closed and opened again after a book was indexed
- **THEN** the book is still the active book and is not indexed again

#### Scenario: Removal

- **WHEN** a book is deleted in the desktop app
- **THEN** its record, text and vectors are no longer in the database file, and the reader's EPUB file is unchanged

#### Scenario: Browser build

- **WHEN** the interface runs in a browser rather than the desktop app
- **THEN** the library is kept in the webview's storage, as before
