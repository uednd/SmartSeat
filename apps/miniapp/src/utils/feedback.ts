export function showErrorToast(message: string): void {
  uni.showToast({
    title: message,
    icon: 'none'
  });
}

export function copyText(text: string, successMessage: string): void {
  uni.setClipboardData({
    data: text,
    success() {
      uni.showToast({
        title: successMessage,
        icon: 'none'
      });
    }
  });
}
