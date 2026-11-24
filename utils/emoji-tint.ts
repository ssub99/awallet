import { EMOJI_TINT_COLORS } from '@/constants/emoji-tint-colors';

/**
 * 이모지 배경의 옅은 정도 = 기존 회색 배경(`Fill/Normal` = coolNeutral 500 · 알파 0.1)과 같은 알파.
 * 이모지 대표색을 이 알파로 깔아, 어떤 색이든 같은 정도의 옅은 배경이 된다.
 */
export const EMOJI_TINT_ALPHA = 0.1;

/** 표 조회 키 — 변형 선택자(FE0F)와 피부색 수식자를 뗀다 (scripts/generate-emoji-tint-colors.mjs와 동일 규칙) */
function normalizeEmojiKey(emoji: string): string {
  return emoji.replace(/️/g, '').replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '');
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 이모지 대표색의 옅은 배경색.
 * 표에 없거나 대표색이 없는(흰색 위주) 이모지는 `fallback`(기본 회색 배경)을 돌려준다.
 */
export function getEmojiTintBackground(emoji: string, fallback: string): string {
  const hex = EMOJI_TINT_COLORS[normalizeEmojiKey(emoji)];
  return hex ? hexToRgba(hex, EMOJI_TINT_ALPHA) : fallback;
}
