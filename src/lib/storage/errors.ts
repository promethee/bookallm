/** Thrown when a save fails because the device has no room left. */
export class StorageFullError extends Error {
  constructor() {
    super('There is no room left to save the book');
    this.name = 'StorageFullError';
  }
}
