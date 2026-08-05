#!/usr/bin/env node
/**
 * Expo Go AsyncStorage(devPublishedAppNotices) → static/app-notices.json 일회성 병합.
 * 사용: node scripts/migrate-dev-notices-to-static.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const NOTICES_FILE = path.join(ROOT, 'static/app-notices.json');
const STORAGE_KEY = 'devPublishedAppNotices';
const SIM_ROOT = path.join(os.homedir(), 'Library/Developer/CoreSimulator/Devices');

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

function parseNoticeList(raw) {
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [];
    return list.map(parseNotice).filter(Boolean);
  } catch {
    return [];
  }
}

async function readStaticNotices() {
  try {
    const raw = await fs.readFile(NOTICES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed != null && typeof parsed === 'object' && Array.isArray(parsed.notices)) {
      return parsed.notices.map(parseNotice).filter(Boolean);
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') {
      throw error;
    }
  }
  return [];
}

async function walk(dir, visit) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, visit);
      continue;
    }
    await visit(fullPath);
  }
}

async function collectExpoGoNotices() {
  const collected = [];

  await walk(SIM_ROOT, async (filePath) => {
    if (!filePath.endsWith('/RCTAsyncLocalStorage/manifest.json')) return;
    if (!filePath.includes('/ExponentExperienceData/')) return;
    if (!filePath.includes('/awallet/')) return;

    let manifestRaw;
    try {
      manifestRaw = await fs.readFile(filePath, 'utf8');
    } catch {
      return;
    }

    let manifest;
    try {
      manifest = JSON.parse(manifestRaw);
    } catch {
      return;
    }

    const hashFile = manifest[STORAGE_KEY];
    if (typeof hashFile !== 'string' || hashFile.length === 0) return;

    const storageDir = path.dirname(filePath);
    const valuePath = path.join(storageDir, hashFile);
    let valueRaw;
    try {
      valueRaw = await fs.readFile(valuePath, 'utf8');
    } catch {
      return;
    }

    const notices = parseNoticeList(valueRaw);
    if (notices.length > 0) {
      collected.push({ source: valuePath, notices });
    }
  });

  return collected;
}

async function main() {
  const staticNotices = await readStaticNotices();
  const expoSources = await collectExpoGoNotices();

  const byId = new Map(staticNotices.map((notice) => [notice.id, notice]));
  let imported = 0;

  for (const source of expoSources) {
    for (const notice of source.notices) {
      if (!byId.has(notice.id)) {
        imported += 1;
      }
      byId.set(notice.id, notice);
    }
    console.log(`[migrate] ${source.source} → ${source.notices.length}건`);
  }

  const merged = [...byId.values()].sort((a, b) => b.publishedAt - a.publishedAt);
  await fs.mkdir(path.dirname(NOTICES_FILE), { recursive: true });
  await fs.writeFile(NOTICES_FILE, `${JSON.stringify({ notices: merged }, null, 2)}\n`, 'utf8');

  console.log(
    `[migrate] static/app-notices.json ${merged.length}건 (신규 ${imported}건, Expo Go 소스 ${expoSources.length}개)`,
  );
}

main().catch((error) => {
  console.error('[migrate] failed:', error);
  process.exit(1);
});
