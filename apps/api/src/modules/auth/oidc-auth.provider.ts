import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as oidcClient from 'openid-client';

import { getConfigString } from '../../common/config/config-reader.js';

export interface OidcRuntimeConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface OidcAuthorizeInput {
  config: OidcRuntimeConfig;
  state: string;
  nonce: string;
}

export interface OidcExchangeInput extends OidcAuthorizeInput {
  code: string;
}

export interface OidcIdentity {
  subject: string;
  externalUserNo?: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface OidcAuthProvider {
  buildAuthorizationUrl(input: OidcAuthorizeInput): Promise<string>;
  exchangeCode(input: OidcExchangeInput): Promise<OidcIdentity>;
}

export class OidcInvalidCodeError extends Error {
  constructor() {
    super('OIDC login code is invalid.');
    this.name = 'OidcInvalidCodeError';
  }
}

export class OidcMissingIdentityError extends Error {
  constructor() {
    super('OIDC provider did not return a stable user identity.');
    this.name = 'OidcMissingIdentityError';
  }
}

export class OidcProviderUnavailableError extends Error {
  constructor() {
    super('OIDC authentication provider is unavailable.');
    this.name = 'OidcProviderUnavailableError';
  }
}

@Injectable()
export class MockOidcAuthProvider implements OidcAuthProvider {
  async buildAuthorizationUrl(input: OidcAuthorizeInput): Promise<string> {
    const url = new URL('/mock/oidc/authorize', this.toBaseUrl(input.config.issuer));
    url.searchParams.set('client_id', input.config.clientId);
    url.searchParams.set('redirect_uri', input.config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('state', input.state);
    url.searchParams.set('nonce', input.nonce);
    return url.href;
  }

  async exchangeCode(input: OidcExchangeInput): Promise<OidcIdentity> {
    if (input.code === 'mock-oidc-code-error') {
      throw new OidcProviderUnavailableError();
    }

    if (input.code === 'mock-oidc-code-no-sub') {
      throw new OidcMissingIdentityError();
    }

    if (
      !input.code.startsWith('mock-oidc-code-') ||
      input.code.length <= 'mock-oidc-code-'.length
    ) {
      throw new OidcInvalidCodeError();
    }

    const mockId = input.code.slice('mock-oidc-code-'.length).replace(/[^a-zA-Z0-9_-]/g, '_');

    return {
      subject: `mock_subject_${mockId}`,
      externalUserNo: `mock_user_${mockId}`,
      displayName: `OIDC 测试用户 ${mockId}`,
      avatarUrl: `https://avatar.example.test/oidc/${mockId}.png`
    };
  }

  private toBaseUrl(issuer: string): string {
    return issuer.endsWith('/') ? issuer : `${issuer}/`;
  }
}

@Injectable()
export class RealOidcAuthProvider implements OidcAuthProvider {
  async buildAuthorizationUrl(input: OidcAuthorizeInput): Promise<string> {
    const config = await this.discover(input.config);
    return oidcClient.buildAuthorizationUrl(config, {
      redirect_uri: input.config.redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      state: input.state,
      nonce: input.nonce
    }).href;
  }

  async exchangeCode(input: OidcExchangeInput): Promise<OidcIdentity> {
    try {
      const config = await this.discover(input.config);
      const callbackUrl = new URL(input.config.redirectUri);
      callbackUrl.searchParams.set('code', input.code);
      callbackUrl.searchParams.set('state', input.state);

      const tokens = await oidcClient.authorizationCodeGrant(config, callbackUrl, {
        expectedState: input.state,
        expectedNonce: input.nonce,
        idTokenExpected: true
      });
      const claims = tokens.claims();

      if (claims === undefined || typeof claims.sub !== 'string' || claims.sub.length === 0) {
        throw new OidcMissingIdentityError();
      }

      const identity: OidcIdentity = {
        subject: claims.sub
      };

      if (typeof claims.preferred_username === 'string' && claims.preferred_username.length > 0) {
        identity.externalUserNo = claims.preferred_username;
      }

      if (typeof claims.name === 'string' && claims.name.length > 0) {
        identity.displayName = claims.name;
      }

      if (typeof claims.picture === 'string' && claims.picture.length > 0) {
        identity.avatarUrl = claims.picture;
      }

      return identity;
    } catch (error) {
      if (error instanceof OidcMissingIdentityError) {
        throw error;
      }

      if (error instanceof oidcClient.ResponseBodyError && error.status < 500) {
        throw new OidcInvalidCodeError();
      }

      throw new OidcProviderUnavailableError();
    }
  }

  private async discover(config: OidcRuntimeConfig): Promise<oidcClient.Configuration> {
    try {
      return await oidcClient.discovery(
        new URL(config.issuer),
        config.clientId,
        {
          redirect_uris: [config.redirectUri],
          response_types: ['code']
        },
        oidcClient.ClientSecretPost(config.clientSecret)
      );
    } catch {
      throw new OidcProviderUnavailableError();
    }
  }
}

@Injectable()
export class OidcAuthProviderSelector implements OidcAuthProvider {
  constructor(
    private readonly configService: ConfigService,
    private readonly mockProvider: MockOidcAuthProvider,
    private readonly realProvider: RealOidcAuthProvider
  ) {}

  async buildAuthorizationUrl(input: OidcAuthorizeInput): Promise<string> {
    return await this.getProvider().buildAuthorizationUrl(input);
  }

  async exchangeCode(input: OidcExchangeInput): Promise<OidcIdentity> {
    return await this.getProvider().exchangeCode(input);
  }

  private getProvider(): OidcAuthProvider {
    const providerMode = getConfigString(this.configService, 'OIDC_AUTH_PROVIDER_MODE');
    return providerMode === 'real' ? this.realProvider : this.mockProvider;
  }
}
