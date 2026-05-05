import type { SmartSeatRoute } from './routes';

export interface NavigationDriver {
  reLaunch(route: SmartSeatRoute): void;
  redirectTo(route: SmartSeatRoute): void;
  navigateTo(route: SmartSeatRoute): void;
  navigateBack(): void;
  showToast(message: string): void;
}

export const uniNavigation: NavigationDriver = {
  reLaunch(route) {
    uni.reLaunch({ url: route });
  },
  redirectTo(route) {
    uni.redirectTo({ url: route });
  },
  navigateTo(route) {
    uni.navigateTo({ url: route });
  },
  navigateBack() {
    const pages = getCurrentPages();

    if (pages.length > 1) {
      uni.navigateBack();
      return;
    }

    uni.reLaunch({ url: '/pages/index/index' });
  },
  showToast(message) {
    uni.showToast({
      title: message,
      icon: 'none'
    });
  }
};
