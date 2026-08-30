export class BlePermissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlePermissionDeniedError';
  }
}
