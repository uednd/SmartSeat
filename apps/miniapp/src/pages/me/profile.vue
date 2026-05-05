<template>
  <view class="page">
    <view v-if="authStore.state.loading" class="card">
      <text class="title">加载中</text>
      <text class="body">正在刷新账号信息。</text>
    </view>

    <view v-else class="card">
      <text class="eyebrow">Me</text>
      <text class="title">我的账号</text>

      <view v-if="authStore.state.user" class="profile-block">
        <view class="info-row">
          <text class="info-label">显示名</text>
          <text class="info-value">{{
            authStore.state.user.display_name || authStore.state.user.anonymous_name
          }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">匿名名</text>
          <text class="info-value">{{ authStore.state.user.anonymous_name }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">当前角色</text>
          <text class="info-value">{{ authStore.state.role }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">登录模式</text>
          <text class="info-value">{{ authStore.state.auth_mode || '-' }}</text>
        </view>
      </view>

      <view v-else class="empty-block">
        <text class="body">暂无本地账号信息，请重新登录。</text>
      </view>

      <button class="secondary-button" @click="goBack">返回</button>
      <button class="danger-button" @click="logout">退出登录</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';

import { guardProtectedPage } from '../../router/guards';
import { LOGIN_ROUTE } from '../../router/routes';
import { authStore } from '../../stores/auth';

onShow(() => {
  void guardProtectedPage();
});

function goBack(): void {
  const pages = getCurrentPages();

  if (pages.length > 1) {
    uni.navigateBack();
    return;
  }

  uni.reLaunch({ url: '/pages/index/index' });
}

function logout(): void {
  authStore.logout();
  uni.reLaunch({ url: LOGIN_ROUTE });
}
</script>

<style>
.page {
  min-height: 100vh;
  padding: 48rpx 32rpx;
  background: linear-gradient(180deg, #f5f7fa 0%, #eef3f6 100%);
}

.card,
.profile-block,
.empty-block {
  display: flex;
  flex-direction: column;
}

.card {
  gap: 24rpx;
  padding: 40rpx;
  border-radius: 30rpx;
  background: #ffffff;
  box-shadow: 0 18rpx 40rpx rgba(15, 23, 42, 0.08);
}

.profile-block,
.empty-block {
  gap: 12rpx;
}

.eyebrow {
  font-size: 24rpx;
  font-weight: 700;
  letter-spacing: 4rpx;
  color: #5a6c80;
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

.info-row {
  display: flex;
  justify-content: space-between;
  gap: 24rpx;
  padding: 22rpx 0;
  border-top: 1rpx solid #edf1f5;
}

.info-label,
.info-value {
  font-size: 28rpx;
  color: #44566c;
}

.info-value {
  max-width: 420rpx;
  font-weight: 700;
  text-align: right;
}

.secondary-button,
.danger-button {
  margin: 0;
  border-radius: 999rpx;
}

.secondary-button {
  color: #1f5d8f;
  background: #eaf3fb;
}

.danger-button {
  color: #ffffff;
  background: #ad3b32;
}
</style>
