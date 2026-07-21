export class NotImplementedError extends Error {
  constructor(providerName: string, methodName: string) {
    super(`Method "${methodName}" is not implemented yet for integration provider "${providerName}".`);
    this.name = 'NotImplementedError';
    Object.setPrototypeOf(this, NotImplementedError.prototype);
  }
}
