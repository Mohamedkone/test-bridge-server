export class WebSocketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebSocketError';
  }
} 