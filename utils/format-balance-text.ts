/**
 * 잔액 표기 — 홈 캘린더 상태 카드용.
 * 0 → '0원', 음수 → '- N원', 양수 → 'N원'(부호 없음).
 */
export function formatBalanceText(amount: number): string {
  if (amount === 0) return '0원';
  if (amount < 0) return `- ${Math.abs(amount).toLocaleString()}원`;
  return `${amount.toLocaleString()}원`;
}

/**
 * 잔액 표기 — 홈 리스트뷰 요약용. 양수·음수 모두 부호를 붙인다.
 * 0 → '0원', 음수 → '- N원', 양수 → '+ N원'.
 */
export function formatSignedBalanceText(amount: number): string {
  if (amount === 0) return '0원';
  if (amount < 0) return `- ${Math.abs(amount).toLocaleString()}원`;
  return `+ ${amount.toLocaleString()}원`;
}
