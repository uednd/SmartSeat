import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, jwtVerify } from 'jose';
import { ApiErrorCode, type UserRole } from '@smartseat/contracts';

import { getConfigNumber, getConfigString } from '../../common/config/config-reader.js';
import { AppHttpException } from '../../common/errors/app-http.exception.js';

export interface TokenClaims {
  user_id: string;
  roles: UserRole[];
}

export interface SignedToken {
  token: string;
  token_type: 'Bearer';
  expires_at: string;
}

export interface SignTokenOptions {
  ttlSeconds?: number;
}

@Injectable()
export class TokenService {
  constructor(private readonly configService: ConfigService) {}

  async signUserToken(claims: TokenClaims, options: SignTokenOptions = {}): Promise<SignedToken> {
    const ttlSeconds =
      options.ttlSeconds ?? getConfigNumber(this.configService, 'AUTH_TOKEN_TTL_SECONDS');
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const token = await new SignJWT({
      roles: claims.roles
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.user_id)
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(this.getSecret());

    return {
      token,
      token_type: 'Bearer',
      expires_at: expiresAt.toISOString()
    };
  }

  async verifyToken(token: string): Promise<TokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.getSecret(), {
        algorithms: ['HS256']
      });

      if (typeof payload.sub !== 'string') {
        throw new Error('Token subject is missing.');
      }

      if (
        !Array.isArray(payload.roles) ||
        !payload.roles.every((role) => typeof role === 'string')
      ) {
        throw new Error('Token roles are missing.');
      }

      return {
        user_id: payload.sub,
        roles: payload.roles as UserRole[]
      };
    } catch {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        ApiErrorCode.AUTH_INVALID_TOKEN,
        'Authentication token is invalid.'
      );
    }
  }

  private getSecret(): Uint8Array {
    return new TextEncoder().encode(getConfigString(this.configService, 'AUTH_TOKEN_SECRET'));
  }
}
