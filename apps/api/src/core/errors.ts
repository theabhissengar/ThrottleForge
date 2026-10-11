export class InvalidPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPolicyError';
  }
}
