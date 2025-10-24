#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const targetFile = 'app/(tabs)/home.tsx';

function removeRemainingLogs() {
  try {
    const fullPath = path.join(__dirname, targetFile);
    const content = fs.readFileSync(fullPath, 'utf8');
    let modifiedContent = content;
    let removedCount = 0;

    console.log('🔍 남은 로그 패턴 찾는 중...');

    // 1. 여러 줄에 걸친 console.log 제거 (더 정확한 패턴)
    const multiLineLogRegex = /^\s*console\.log\(\s*\{[\s\S]*?\}\s*\);\s*$/gm;
    const multiLineMatches = modifiedContent.match(multiLineLogRegex);
    if (multiLineMatches) {
      console.log(`📝 여러 줄 로그 ${multiLineMatches.length}개 발견`);
      removedCount += multiLineMatches.length;
      modifiedContent = modifiedContent.replace(multiLineLogRegex, '');
    }

    // 2. 단일 줄 console.log 제거 (더 정확한 패턴)
    const singleLineLogRegex = /^\s*console\.log\([^)]*\);\s*$/gm;
    const singleLineMatches = modifiedContent.match(singleLineLogRegex);
    if (singleLineMatches) {
      console.log(`📝 단일 줄 로그 ${singleLineMatches.length}개 발견`);
      removedCount += singleLineMatches.length;
      modifiedContent = modifiedContent.replace(singleLineLogRegex, '');
    }

    // 3. 빈 줄 정리
    modifiedContent = modifiedContent.replace(/\n\s*\n\s*\n/g, '\n\n');

    if (removedCount > 0) {
      fs.writeFileSync(fullPath, modifiedContent, 'utf8');
      console.log(`✅ ${removedCount}개의 로그 제거 완료`);
    } else {
      console.log(`ℹ️ 제거할 로그 없음`);
    }

  } catch (error) {
    console.error(`❌ 오류:`, error.message);
  }
}

console.log('🚀 남은 로그 제거 시작...');
removeRemainingLogs();
console.log('✅ 완료!');

