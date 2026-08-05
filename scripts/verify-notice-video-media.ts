/**
 * 공지 영상 타임라인 1초 스냅 회귀.
 * 사용: npx tsx scripts/verify-notice-video-media.ts
 */
import { verifyNoticeVideoTimeHelpers } from '../utils/notice-media';

verifyNoticeVideoTimeHelpers();
console.log('verify-notice-video-media: ok');
