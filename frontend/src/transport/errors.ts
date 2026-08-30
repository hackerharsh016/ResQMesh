export class NoTransportAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoTransportAvailableError';
  }
}

export class PayloadTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayloadTooLargeError';
  }
}

export class DecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecodeError';
  }
}

export class UnknownMessageTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownMessageTypeError';
  }
}

export class TransportSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransportSendError';
  }
}

export class TransportBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransportBusyError';
  }
}
