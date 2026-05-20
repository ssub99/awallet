/**
 * Expo Router search params: Android에서 동일 키가 string[]로 올 수 있음.
 */
export function getRouteParamString(
  value: string | string[] | undefined,
): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    return typeof first === 'string' ? first : undefined;
  }
  return undefined;
}

export function getRouteParamNumber(
  value: string | string[] | undefined,
): number | undefined {
  const raw = getRouteParamString(value);
  if (raw == null) {
    return undefined;
  }
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}
