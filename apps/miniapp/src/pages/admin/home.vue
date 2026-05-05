<template>
  <view class="page">
    <view v-if="authStore.state.loading" class="card state-card">
      <text class="state-title">加载中</text>
      <text class="state-body">正在校验管理员登录态。</text>
    </view>

    <view v-else class="card">
      <text class="eyebrow">Admin</text>
      <text class="title">管理员入口占位页</text>
      <text class="body">
        当前账号已通过后端角色路由进入管理员页面。MINI-03
        会在此基础上接入看板、维护、异常和管理操作。
      </text>
      <view class="info-row">
        <text class="info-label">显示名</text>
        <text class="info-value">{{
          authStore.state.user?.display_name || authStore.state.user?.anonymous_name || '-'
        }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">角色</text>
        <text class="info-value">{{ authStore.state.role || '-' }}</text>
      </view>
      <button class="secondary-button" @click="goProfile">我的 / 退出登录</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';
import { UserRole } from '@smartseat/contracts';

import { guardProtectedPage } from '../../router/guards';
import { PROFILE_ROUTE } from '../../router/routes';
import { authStore } from '../../stores/auth';

onShow(() => {
  void guardProtectedPage({
    allowedRole: UserRole.ADMIN
  });
});

function goProfile(): void {
  uni.navigateTo({ url: PROFILE_ROUTE });
}
</script>

<style>
.page {
  min-height: 100vh;
  padding: 48rpx 32rpx;
  background: linear-gradient(155deg, #eef2f8 0%, #f8efe5 100%);
}

.card {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
  padding: 40rpx;
  border-radius: 30rpx;
  background: #ffffff;
  box-shadow: 0 20rpx 46rpx rgba(36, 48, 76, 0.1);
}

.eyebrow {
  font-size: 24rpx;
  font-weight: 700;
  letter-spacing: 4rpx;
  color: #506a98;
}

.title,
.state-title {
  font-size: 42rpx;
  font-weight: 800;
  color: #16223d;
}

.body,
.state-body {
  font-size: 28rpx;
  line-height: 1.7;
  color: #4f596d;
}

.info-row {
  display: flex;
  justify-content: space-between;
  gap: 24rpx;
  padding: 22rpx 0;
  border-top: 1rpx solid #edf0f5;
}

.info-label,
.info-value {
  font-size: 28rpx;
  color: #454e60;
}

.info-value {
  font-weight: 700;
}

.secondary-button {
  margin: 0;
  border-radius: 999rpx;
  color: #244f8f;
  background: #eaf1fb;
}
</style>
