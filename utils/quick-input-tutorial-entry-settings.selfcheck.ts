/**
 * ponytail: 체험하기 펼침 기본값·직렬화 계약 자가검증.
 * 실행: npx tsx utils/quick-input-tutorial-entry-settings.selfcheck.ts
 */
import assert from 'node:assert/strict';
import { QUICK_INPUT_TUTORIAL_ENTRY_EXPANDED_DEFAULT } from './quick-input-tutorial-entry-settings';

assert.equal(QUICK_INPUT_TUTORIAL_ENTRY_EXPANDED_DEFAULT, true);

function parseStored(raw: string | null): boolean {
  if (raw === null) return QUICK_INPUT_TUTORIAL_ENTRY_EXPANDED_DEFAULT;
  try {
    return JSON.parse(raw) === true;
  } catch {
    return QUICK_INPUT_TUTORIAL_ENTRY_EXPANDED_DEFAULT;
  }
}

assert.equal(parseStored(null), true);
assert.equal(parseStored('true'), true);
assert.equal(parseStored('false'), false);
assert.equal(parseStored('nope'), true);

console.log('quick-input-tutorial-entry-settings.selfcheck: ok');
