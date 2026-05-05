<template>
  <view class="page">
    <view class="hero">
      <text class="eyebrow">SmartSeat</text>
      <text class="title">统一登录入口</text>
      <text class="subtitle">学生和管理员共用同一个入口，登录后由后端返回角色路由。</text>
    </view>

    <view class="card">
      <view v-if="authStore.state.loading || modeLoading" class="state-block">
        <text class="state-title">加载中</text>
        <text class="state-body">正在读取当前登录模式。</text>
      </view>

      <view v-else-if="errorMessage" class="state-block error">
        <text class="state-title">无法读取登录模式</text>
        <text class="state-body">{{ errorMessage }}</text>
        <button class="secondary-button" @click="loadLoginMode">重新加载</button>
      </view>

      <view v-else-if="loginMode === AuthMode.WECHAT" class="mode-panel">
        <text class="mode-title">微信登录模式</text>
        <text class="mode-body">点击后调用微信小程序登录能力，提交 wx.login code 到后端。</text>
        <button
          class="primary-button"
          :loading="authStore.state.loading"
          @click="handleWechatLogin"
        >
          微信一键登录
        </button>
      </view>

      <view v-else-if="loginMode === AuthMode.OIDC" class="mode-panel">
        <text class="mode-title">OIDC 登录模式</text>
        <text class="mode-body"
          >通过学校或机构身份源登录。小程序体验版会获取授权地址并提供复制。</text
        >
        <button class="primary-button" :loading="authStore.state.loading" @click="handleOidcStart">
          获取 OIDC 登录地址
        </button>
        <view v-if="oidcAuthorizationUrl" class="oidc-url">
          <text class="oidc-label">授权地址</text>
          <text class="oidc-text">{{ oidcAuthorizationUrl }}</text>
          <button class="secondary-button" @click="copyOidcUrl">复制授权地址</button>
        </view>
      </view>

      <view v-else class="state-block empty">
        <text class="state-title">暂无可用登录模式</text>
        <text class="state-body">请稍后刷新，或联系管理员检查后端登录配置。</text>
        <button class="secondary-button" @click="loadLoginMode">刷新</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { AuthMode } from '@smartseat/contracts';
import { ref } from 'vue';

import { mapApiErrorToMessage } from '../../api/errors';
import { routeToCurrentUserHome } from '../../router/guards';
import { authStore } from '../../stores/auth';
import { copyText, showErrorToast } from '../../utils/feedback';

const loginMode = ref<AuthMode | undefined>(undefined);
const modeLoading = ref(false);
const errorMessage = ref<string | undefined>(undefined);
const oidcAuthorizationUrl = ref<string | undefined>(undefined);

onLoad(() => {
  void loadLoginMode();
});

async function loadLoginMode(): Promise<void> {
  modeLoading.value = true;
  errorMessage.value = undefined;
  oidcAuthorizationUrl.value = undefined;

  try {
    const response = await authStore.getLoginMode();
    loginMode.value = response.auth_mode;
  } catch (error) {
    errorMessage.value = mapApiErrorToMessage(error);
  } finally {
    modeLoading.value = false;
  }
}

function requestWechatCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success(result) {
        if (typeof result.code === 'string' && result.code.length > 0) {
          resolve(result.code);
          return;
        }

        reject(new Error('微信登录未返回 code，请重试'));
      },
      fail(error) {
        reject(new Error(error.errMsg || '微信登录失败'));
      }
    });
  });
}

async function handleWechatLogin(): Promise<void> {
  try {
    const code = await requestWechatCode();
    await authStore.loginWechat(code);
    await routeToCurrentUserHome();
  } catch (error) {
    showErrorToast(mapApiErrorToMessage(error));
  }
}

async function handleOidcStart(): Promise<void> {
  try {
    const response = await authStore.startOidc();
    oidcAuthorizationUrl.value = response.authorization_url;

    if (typeof window !== 'undefined') {
      window.location.href = response.authorization_url;
      return;
    }

    copyText(response.authorization_url, 'OIDC 地址已复制');
  } catch (error) {
    showErrorToast(mapApiErrorToMessage(error));
  }
}

function copyOidcUrl(): void {
  if (oidcAuthorizationUrl.value === undefined) {
    return;
  }

  copyText(oidcAuthorizationUrl.value, 'OIDC 地址已复制');
}
</script>

<style>
.page {
  min-height: 100vh;
  padding: 48rpx 32rpx;
  background: linear-gradient(155deg, #edf6f1 0%, #f8f2df 48%, #edf2fa 100%);
}

.hero,
.card,
.mode-panel,
.state-block,
.oidc-url {
  display: flex;
  flex-direction: column;
}

.hero {
  gap: 16rpx;
  margin-bottom: 28rpx;
}

.eyebrow {
  font-size: 24rpx;
  font-weight: 700;
  letter-spacing: 5rpx;
  color: #496153;
}

.title {
  font-size: 52rpx;
  font-weight: 800;
  color: #10251a;
}

.subtitle,
.mode-body,
.state-body,
.oidc-text {
  font-size: 28rpx;
  line-height: 1.7;
  color: #52645a;
}

.card {
  gap: 28rpx;
  padding: 36rpx;
  border: 2rpx solid rgba(32, 77, 52, 0.1);
  border-radius: 32rpx;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 24rpx 56rpx rgba(26, 56, 39, 0.12);
}

.mode-panel,
.state-block {
  gap: 22rpx;
}

.mode-title,
.state-title {
  font-size: 34rpx;
  font-weight: 800;
  color: #183927;
}

.primary-button,
.secondary-button {
  margin: 0;
  border-radius: 999rpx;
  font-size: 30rpx;
}

.primary-button {
  color: #ffffff;
  background: #1f6b43;
}

.secondary-button {
  color: #1f5d8f;
  background: #eaf3fb;
}

.error {
  color: #8f2f22;
}

.empty {
  color: #5d6470;
}

.oidc-url {
  gap: 14rpx;
  padding: 24rpx;
  border-radius: 22rpx;
  background: #f4f8fb;
}

.oidc-label {
  font-size: 24rpx;
  font-weight: 700;
  color: #4c657b;
}

.oidc-text {
  word-break: break-all;
}
</style>
