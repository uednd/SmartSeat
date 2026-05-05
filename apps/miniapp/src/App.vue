<script setup lang="ts">
import { onHide, onLaunch, onShow } from '@dcloudio/uni-app';

onLaunch(() => {
  console.log('SmartSeat miniapp scaffold launched');
});

onShow(() => {
  console.log('SmartSeat miniapp scaffold visible');
});

onHide(() => {
  console.log('SmartSeat miniapp scaffold hidden');
});
</script>
