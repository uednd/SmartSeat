import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getConfigString } from '../../common/config/config-reader.js';

export interface WeChatSession {
  openid: string;
  unionid?: string;
}

export interface WeChatAuthProvider {
  exchangeCode(code: string): Promise<WeChatSession>;
}

export class WeChatInvalidCodeError extends Error {
  constructor() {
    super('WeChat login code is invalid.');
    this.name = 'WeChatInvalidCodeError';
  }
}

export class WeChatProviderUnavailableError extends Error {
  constructor() {
    super('WeChat authentication provider is unavailable.');
    this.name = 'WeChatProviderUnavailableError';
  }
}

@Injectable()
export class MockWeChatAuthProvider implements WeChatAuthProvider {
  async exchangeCode(code: string): Promise<WeChatSession> {
    if (code === 'mock-code-error') {
      throw new WeChatProviderUnavailableError();
    }

    if (!code.startsWith('mock-code-') || code.length <= 'mock-code-'.length) {
      throw new WeChatInvalidCodeError();
    }

    const mockId = code.slice('mock-code-'.length).replace(/[^a-zA-Z0-9_-]/g, '_');

    return {
      openid: `mock_openid_${mockId}`,
      unionid: `mock_unionid_${mockId}`
    };
  }
}

interface WeChatCode2SessionResponse {
  openid?: unknown;
  unionid?: unknown;
  errcode?: unknown;
}

@Injectable()
export class RealWeChatAuthProvider implements WeChatAuthProvider {
  constructor(private readonly configService: ConfigService) {}

  async exchangeCode(code: string): Promise<WeChatSession> {
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.searchParams.set('appid', getConfigString(this.configService, 'WECHAT_APP_ID'));
    url.searchParams.set('secret', getConfigString(this.configService, 'WECHAT_APP_SECRET'));
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');

    let payload: WeChatCode2SessionResponse;

    try {
      const response = await fetch(url);
      payload = (await response.json()) as WeChatCode2SessionResponse;
    } catch {
      throw new WeChatProviderUnavailableError();
    }

    if (payload.errcode === -1) {
      throw new WeChatProviderUnavailableError();
    }

    if (payload.errcode !== undefined || typeof payload.openid !== 'string') {
      throw new WeChatInvalidCodeError();
    }

    const session: WeChatSession = {
      openid: payload.openid
    };

    if (typeof payload.unionid === 'string') {
      session.unionid = payload.unionid;
    }

    return session;
  }
}

@Injectable()
export class WeChatAuthProviderSelector implements WeChatAuthProvider {
  constructor(
    private readonly configService: ConfigService,
    private readonly mockProvider: MockWeChatAuthProvider,
    private readonly realProvider: RealWeChatAuthProvider
  ) {}

  async exchangeCode(code: string): Promise<WeChatSession> {
    const providerMode = getConfigString(this.configService, 'WECHAT_AUTH_PROVIDER_MODE');
    const provider = providerMode === 'real' ? this.realProvider : this.mockProvider;
    return await provider.exchangeCode(code);
  }
}
