<template>
  <view class="page shell-page">
    <view class="card shell-card">
      <text class="eyebrow">SmartSeat</text>
      <text class="title">正在进入小程序</text>
      <text class="body">系统会校验本地 token，并根据后端返回的角色进入学生或管理员页面。</text>
      <view class="loading-row">
        <view class="spinner" />
        <text class="loading-text">正在检查登录状态</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';

import { routeFromLaunch } from '../../router/guards';

onShow(() => {
  void routeFromLaunch();
});
</script>

<style>
.page {
  min-height: 100vh;
  padding: 48rpx 32rpx;
  background: linear-gradient(180deg, #f5f7fa 0%, #e7edf5 100%);
}

.card {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding: 40rpx;
  border-radius: 24rpx;
  background: #ffffff;
  box-shadow: 0 18rpx 40rpx rgba(15, 23, 42, 0.08);
}

.eyebrow {
  font-size: 24rpx;
  font-weight: 600;
  letter-spacing: 4rpx;
  text-transform: uppercase;
  color: #4f6b8a;
}

.title {
  font-size: 42rpx;
  font-weight: 700;
  color: #10233d;
}

.body {
  font-size: 28rpx;
  line-height: 1.7;
  color: #44566c;
}

.loading-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 16rpx;
}

.spinner {
  width: 28rpx;
  height: 28rpx;
  border: 4rpx solid #d4e2f2;
  border-top-color: #1f5d8f;
  border-radius: 999rpx;
}

.loading-text {
  font-size: 26rpx;
  color: #59708a;
}
</style>
