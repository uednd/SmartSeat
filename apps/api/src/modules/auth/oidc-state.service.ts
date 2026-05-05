import { createHash } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, jwtVerify } from 'jose';

import { ApiErrorCode } from '@smartseat/contracts';

import { getConfigString } from '../../common/config/config-reader.js';
import { PrismaService } from '../../common/database/prisma.service.js';
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
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async signState(input: { nonce: string; redirectUri: string }): Promise<string> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OIDC_STATE_TTL_SECONDS * 1000);
    const state = await new SignJWT({
      purpose: OIDC_STATE_PURPOSE,
      nonce: input.nonce,
      redirect_uri: input.redirectUri
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.getSecret());

    await this.prisma.oidcAuthState.create({
      data: {
        stateHash: this.hashState(state),
        expiresAt
      }
    });

    return state;
  }

  async consumeState(
    state: string,
    input: {
      expectedRedirectUri: string;
      now?: Date;
    }
  ): Promise<OidcStateClaims> {
    const claims = await this.verifyStateSignature(state);

    if (claims.redirect_uri !== input.expectedRedirectUri) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'OIDC state is invalid.'
      );
    }

    const consumedAt = input.now ?? new Date();
    const result = await this.prisma.oidcAuthState.updateMany({
      where: {
        stateHash: this.hashState(state),
        consumedAt: null,
        expiresAt: {
          gt: consumedAt
        }
      },
      data: {
        consumedAt
      }
    });

    if (result.count !== 1) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'OIDC state is invalid.'
      );
    }

    return claims;
  }

  private async verifyStateSignature(state: string): Promise<OidcStateClaims> {
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

  private hashState(state: string): string {
    return createHash('sha256').update(state).digest('hex');
  }
}
