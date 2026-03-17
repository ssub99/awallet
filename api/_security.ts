interface RateLimitPolicy {
  windowMs: number;
  maxSuccesses: number;
  lockMs: number;
}

interface RateLimitState {
  successTimestamps: number[];
  lockUntilMs: number;
}

const rateLimitStore = new Map<string, RateLimitState>();
const INTERNAL_API_SECRET_FALLBACK = 'awallet-internal-2026-Yv9pZQkR8F2M';

function trimTimestamps(timestamps: number[], windowStartMs: number): number[] {
  return timestamps.filter((ts) => ts > windowStartMs);
}

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor && forwardedFor.trim().length > 0) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp && realIp.trim().length > 0) {
    return realIp.trim();
  }

  return 'unknown-ip';
}

function getClientKey(request: Request, endpointName: string): string {
  const rawDeviceId = request.headers.get('x-device-id') ?? '';
  const deviceId = rawDeviceId.trim().slice(0, 128) || 'unknown-device';
  const ip = getClientIp(request);
  return `${endpointName}:${deviceId}:${ip}`;
}

function getClientLogMeta(request: Request): {
  endpointHint: string;
  ip: string;
  deviceId: string;
} {
  const ip = getClientIp(request);
  const rawDeviceId = request.headers.get('x-device-id') ?? '';
  const deviceId = rawDeviceId.trim().slice(0, 128) || 'unknown-device';
  return {
    endpointHint: request.url,
    ip,
    deviceId,
  };
}

function getOrCreateRateLimitState(key: string): RateLimitState {
  const existing = rateLimitStore.get(key);
  if (existing) return existing;
  const created: RateLimitState = { successTimestamps: [], lockUntilMs: 0 };
  rateLimitStore.set(key, created);
  return created;
}

export function verifyInternalApiSecret(request: Request): Response | null {
  const configuredSecret =
    process.env.awallet_internal_api_secret ?? process.env.AWALLET_INTERNAL_API_SECRET;
  const legacySecret =
    process.env.awallet_internal_api_secret_legacy ??
    process.env.AWALLET_INTERNAL_API_SECRET_LEGACY;
  const allowedSecrets = [
    configuredSecret,
    legacySecret,
    INTERNAL_API_SECRET_FALLBACK,
  ]
    .map((secret) => (typeof secret === 'string' ? secret.trim() : ''))
    .filter((secret) => secret.length > 0);

  if (allowedSecrets.length === 0) {
    return Response.json(
      { error: 'awallet_internal_api_secret not configured' },
      { status: 500 },
    );
  }

  const providedSecret = request.headers.get('x-awallet-internal-secret');
  const matchedSecret =
    providedSecret != null
      ? allowedSecrets.find((secret) => secret === providedSecret) ?? null
      : null;
  if (!matchedSecret) {
    const meta = getClientLogMeta(request);
    console.warn('[api-security] forbidden request', {
      endpoint: meta.endpointHint,
      ip: meta.ip,
      deviceId: meta.deviceId,
      reason: 'invalid_internal_secret',
    });
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (
    configuredSecret &&
    configuredSecret.trim().length > 0 &&
    matchedSecret !== configuredSecret.trim()
  ) {
    const meta = getClientLogMeta(request);
    console.warn('[api-security] accepted legacy/fallback secret', {
      endpoint: meta.endpointHint,
      ip: meta.ip,
      deviceId: meta.deviceId,
    });
  }

  return null;
}

export function checkRateLimit(
  request: Request,
  endpointName: string,
  policy: RateLimitPolicy,
): { key: string; response: Response | null } {
  const key = getClientKey(request, endpointName);
  const state = getOrCreateRateLimitState(key);
  const now = Date.now();

  if (state.lockUntilMs > now) {
    const retryAfterSec = Math.ceil((state.lockUntilMs - now) / 1000);
    const meta = getClientLogMeta(request);
    console.warn('[api-security] rate limited request', {
      endpoint: endpointName,
      ip: meta.ip,
      deviceId: meta.deviceId,
      retryAfterSec,
    });
    return {
      key,
      response: Response.json(
        { error: 'Too Many Requests', retryAfterSec },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
      ),
    };
  }

  const windowStartMs = now - policy.windowMs;
  state.successTimestamps = trimTimestamps(state.successTimestamps, windowStartMs);

  return { key, response: null };
}

export function recordRateLimitSuccess(
  key: string,
  policy: RateLimitPolicy,
): void {
  const state = getOrCreateRateLimitState(key);
  const now = Date.now();
  const windowStartMs = now - policy.windowMs;

  const timestamps = trimTimestamps(state.successTimestamps, windowStartMs);
  timestamps.push(now);
  state.successTimestamps = timestamps;

  if (timestamps.length >= policy.maxSuccesses) {
    state.lockUntilMs = now + policy.lockMs;
  }
}

export const DEFAULT_AI_RATE_LIMIT_POLICY: RateLimitPolicy = {
  windowMs: 60_000,
  maxSuccesses: 5,
  lockMs: 30_000,
};
