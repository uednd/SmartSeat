import { Injectable } from '@nestjs/common';

export interface PasswordAuthIdentity {
  username: string;
}

export class PasswordAuthInvalidCredentialsError extends Error {
  constructor(message = 'Invalid username or password.') {
    super(message);
    this.name = 'PasswordAuthInvalidCredentialsError';
  }
}

@Injectable()
export class MockPasswordAuthProvider {
  async authenticate(username: string, password: string): Promise<PasswordAuthIdentity> {
    if (typeof username !== 'string' || username.trim().length === 0) {
      throw new PasswordAuthInvalidCredentialsError('Username is required.');
    }

    if (typeof password !== 'string' || password.trim().length === 0) {
      throw new PasswordAuthInvalidCredentialsError('Password is required.');
    }

    return { username: username.trim() };
  }
}
