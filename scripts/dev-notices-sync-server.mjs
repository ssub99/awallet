#!/usr/bin/env node
/**
 * __DEV__ 공지 static 업로드 sync 서버.
 *
 * - 저장 위치: static/app-notices.json (Vercel 배포와 동일)
 * - 기동: npm run start:ing (Metro와 함께) 또는 npm run dev:notices-sync
 * - Expo Go에서 공지 등록·저장 전에 반드시 켜 두어야 Mac의 JSON 파일에 반영됨
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const NOTICES_FILE = path.join(ROOT, 'static/app-notices.json');
const NOTICES_MEDIA_DIR = path.join(ROOT, 'static/notices');
const PORT = Number(process.env.DEV_NOTICES_SYNC_PORT ?? 8787);
const PUBLIC_BASE_URL = (
  process.env.DEV_NOTICES_PUBLIC_BASE_URL ??
  'https://awallet-git-ing-awallet-vercel-api.vercel.app'
).replace(/\/+$/, '');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}

function sendJson(res, status, body) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function sanitizeFilename(raw) {
  const base = path.basename(String(raw ?? '').trim());
  const safe = base.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe.length > 0 ? safe : 'media.bin';
}

function buildNoticeMediaFilename(noticeId, kind, index, filename) {
  const safeNoticeId = String(noticeId).replace(/[^a-zA-Z0-9_-]+/g, '-');
  const safeKind = kind === 'video' ? 'video' : 'image';
  return `${safeNoticeId}-${safeKind}-${index}-${sanitizeFilename(filename)}`;
}

async function readPayload() {
  try {
    const raw = await fs.readFile(NOTICES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed != null && typeof parsed === 'object' && Array.isArray(parsed.notices)) {
      return parsed;
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') {
      throw error;
    }
  }
  return { notices: [] };
}

async function writePayload(payload) {
  await fs.mkdir(path.dirname(NOTICES_FILE), { recursive: true });
  await fs.writeFile(NOTICES_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function parsePublishedAt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseNotice(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  const dateLabel = typeof value.dateLabel === 'string' ? value.dateLabel.trim() : '';
  const body = typeof value.body === 'string' ? value.body : '';
  const publishedAt = parsePublishedAt(value.publishedAt);
  if (!id || !title || !dateLabel || publishedAt == null) return null;

  const images = Array.isArray(value.images)
    ? value.images.filter((item) => typeof item === 'string' && item.trim().length > 0)
    : [];
  const videos = Array.isArray(value.videos)
    ? value.videos.filter((item) => typeof item === 'string' && item.trim().length > 0)
    : [];

  return {
    id,
    title,
    dateLabel,
    publishedAt,
    body,
    images,
    ...(videos.length > 0 ? { videos } : {}),
  };
}

function sortNotices(notices) {
  return [...notices].sort((a, b) => b.publishedAt - a.publishedAt);
}

function upsertNotice(notices, notice) {
  const next = notices.filter((item) => item.id !== notice.id);
  next.push(notice);
  return sortNotices(next);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) return null;
  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw.trim().length === 0) return null;
  return JSON.parse(raw);
}

async function saveNoticeMedia(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const noticeId = typeof body.noticeId === 'string' ? body.noticeId.trim() : '';
  const kind = body.kind === 'video' ? 'video' : body.kind === 'image' ? 'image' : '';
  const index = Number.isInteger(body.index) && body.index >= 0 ? body.index : null;
  const filename = typeof body.filename === 'string' ? body.filename : '';
  const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64.trim() : '';
  if (!noticeId || !kind || index == null || dataBase64.length === 0) {
    return null;
  }

  const storedName = buildNoticeMediaFilename(noticeId, kind, index, filename);
  await fs.mkdir(NOTICES_MEDIA_DIR, { recursive: true });
  const targetPath = path.join(NOTICES_MEDIA_DIR, storedName);
  await fs.writeFile(targetPath, Buffer.from(dataBase64, 'base64'));

  return {
    filename: storedName,
    url: `${PUBLIC_BASE_URL}/notices/${encodeURIComponent(storedName)}`,
  };
}

const server = http.createServer(async (req, res) => {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true, media: true });
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/app-notices.json' || url.pathname === '/')) {
      const payload = await readPayload();
      sendJson(res, 200, payload);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/notices/media') {
      const body = await readBody(req);
      const saved = await saveNoticeMedia(body);
      if (saved == null) {
        sendJson(res, 400, { error: 'invalid_media' });
        return;
      }
      sendJson(res, 200, saved);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/notices') {
      const body = await readBody(req);
      const notice = parseNotice(body);
      if (notice == null) {
        sendJson(res, 400, { error: 'invalid_notice' });
        return;
      }
      const payload = await readPayload();
      payload.notices = upsertNotice(
        payload.notices.map((item) => parseNotice(item)).filter(Boolean),
        notice,
      );
      await writePayload(payload);
      sendJson(res, 200, { ok: true, notice });
      return;
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/notices/')) {
      const noticeId = decodeURIComponent(url.pathname.slice('/notices/'.length));
      const payload = await readPayload();
      const before = payload.notices.length;
      payload.notices = payload.notices.filter((item) => parseNotice(item)?.id !== noticeId);
      if (payload.notices.length === before) {
        sendJson(res, 404, { error: 'not_found' });
        return;
      }
      await writePayload(payload);
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { error: 'not_found' });
  } catch (error) {
    console.error('[dev-notices-sync] request failed:', error);
    sendJson(res, 500, { error: 'internal_error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[dev-notices-sync] static/app-notices.json ← http://127.0.0.1:${PORT}/app-notices.json`);
  console.log(`[dev-notices-sync] media → static/notices/ (public base: ${PUBLIC_BASE_URL})`);
});
