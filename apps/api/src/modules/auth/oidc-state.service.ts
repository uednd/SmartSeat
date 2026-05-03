import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, jwtVerify } from 'jose';

import { ApiErrorCode } from '@smartseat/contracts';

import { getConfigString } from '../../common/config/config-reader.js';
import { AppHttpException } from '../../common/errors/app-http.exception.js';

const OIDC_STATE_TTL_SECONDS = 300;
const OIDC_STATE_PURPOSE = 'oidc_authorize';

interface OidcStateClaims {
  purpose: typeof OIDC_STATE_PURPOSE;
  nonce: string;
  redirect_uri: string;
}

@Injectable()
export class OidcStateService {
  constructor(private readonly configService: ConfigService) {}

  async signState(input: { nonce: string; redirectUri: string }): Promise<string> {
    return await new SignJWT({
      purpose: OIDC_STATE_PURPOSE,
      nonce: input.nonce,
      redirect_uri: input.redirectUri
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${OIDC_STATE_TTL_SECONDS}s`)
      .sign(this.getSecret());
  }

  async verifyState(state: string): Promise<OidcStateClaims> {
    try {
      const { payload } = await jwtVerify(state, this.getSecret(), {
        algorithms: ['HS256']
      });

      if (
        payload.purpose !== OIDC_STATE_PURPOSE ||
        typeof payload.nonce !== 'string' ||
        payload.nonce.length === 0 ||
        typeof payload.redirect_uri !== 'string' ||
        payload.redirect_uri.length === 0
      ) {
        throw new Error('Invalid OIDC state claims.');
      }

      return {
        purpose: OIDC_STATE_PURPOSE,
        nonce: payload.nonce,
        redirect_uri: payload.redirect_uri
      };
    } catch {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'OIDC state is invalid.'
      );
    }
  }

  private getSecret(): Uint8Array {
    return new TextEncoder().encode(getConfigString(this.configService, 'AUTH_TOKEN_SECRET'));
  }
}
