<template>
  <view class="page">
    <view class="card">
      <text class="eyebrow">OIDC</text>
      <text class="title">正在完成登录</text>
      <text class="body">{{ message }}</text>
      <button v-if="canRetry" class="secondary-button" @click="goLogin">返回登录页</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { ref } from 'vue';

import { mapApiErrorToMessage } from '../../api/errors';
import { routeToCurrentUserHome } from '../../router/guards';
import { LOGIN_ROUTE } from '../../router/routes';
import { authStore } from '../../stores/auth';

const message = ref('正在校验授权回调参数。');
const canRetry = ref(false);

onLoad((query: Record<string, string | undefined> = {}) => {
  void completeLogin(query.code, query.state);
});

async function completeLogin(code: string | undefined, state: string | undefined): Promise<void> {
  if (code === undefined || state === undefined) {
    message.value = 'OIDC 回调缺少 code 或 state。';
    canRetry.value = true;
    return;
  }

  try {
    await authStore.completeOidcLogin(code, state);
    message.value = '登录成功，正在进入对应页面。';
    await routeToCurrentUserHome();
  } catch (error) {
    message.value = mapApiErrorToMessage(error);
    canRetry.value = true;
  }
}

function goLogin(): void {
  uni.reLaunch({ url: LOGIN_ROUTE });
}
</script>

<style>
.page {
  min-height: 100vh;
  padding: 48rpx 32rpx;
  background: linear-gradient(180deg, #f7f9fc 0%, #e9f1f8 100%);
}

.card {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
  padding: 40rpx;
  border-radius: 28rpx;
  background: #ffffff;
  box-shadow: 0 18rpx 40rpx rgba(15, 23, 42, 0.08);
}

.eyebrow {
  font-size: 24rpx;
  font-weight: 700;
  letter-spacing: 4rpx;
  color: #496b8a;
}

.title {
  font-size: 42rpx;
  font-weight: 800;
  color: #10233d;
}

.body {
  font-size: 28rpx;
  line-height: 1.7;
  color: #44566c;
}

.secondary-button {
  margin: 0;
  border-radius: 999rpx;
  color: #1f5d8f;
  background: #eaf3fb;
}
</style>
