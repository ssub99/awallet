#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// utils 폴더의 모든 파일 처리
const targetFiles = [
  'utils/storage-cache.ts',
  'utils/notification-scheduler.ts', 
  'utils/custom-month.ts',
  'utils/challenge-utils.ts'
];

function removeLogsFromFile(filePath) {
  try {
    const fullPath = path.join(__dirname, filePath);
    
    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️ 파일을 찾을 수 없습니다: ${filePath}`);
      return 0;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    let modifiedContent = content;
    let removedCount = 0;

    // 1. 단일 줄 console.log 제거
    const singleLineLogRegex = /^\s*console\.log\([^)]*\);\s*$/gm;
    const singleLineMatches = modifiedContent.match(singleLineLogRegex);
    if (singleLineMatches) {
      removedCount += singleLineMatches.length;
      modifiedContent = modifiedContent.replace(singleLineLogRegex, '');
    }

    // 2. 여러 줄에 걸친 console.log 제거 (객체 구조)
    const multiLineLogRegex = /^\s*console\.log\(\s*\{[\s\S]*?\}\s*\);\s*$/gm;
    const multiLineMatches = modifiedContent.match(multiLineLogRegex);
    if (multiLineMatches) {
      removedCount += multiLineMatches.length;
      modifiedContent = modifiedContent.replace(multiLineLogRegex, '');
    }

    // 3. console.error 제거
    const errorLogRegex = /^\s*console\.error\([^)]*\);\s*$/gm;
    const errorMatches = modifiedContent.match(errorLogRegex);
    if (errorMatches) {
      removedCount += errorMatches.length;
      modifiedContent = modifiedContent.replace(errorLogRegex, '');
    }

    // 4. 빈 줄 정리
    modifiedContent = modifiedContent.replace(/\n\s*\n\s*\n/g, '\n\n');

    if (removedCount > 0) {
      fs.writeFileSync(fullPath, modifiedContent, 'utf8');
      console.log(`✅ ${filePath}: ${removedCount}개 로그 제거 완료`);
    } else {
      console.log(`ℹ️ ${filePath}: 제거할 로그 없음`);
    }

    return removedCount;
  } catch (error) {
    console.error(`❌ ${filePath} 처리 중 오류:`, error.message);
    return 0;
  }
}

// 메인 실행
console.log('🚀 utils 폴더 로그 제거 시작...\n');

let totalRemoved = 0;
targetFiles.forEach(file => {
  totalRemoved += removeLogsFromFile(file);
});

console.log(`\n✅ utils 폴더 로그 제거 완료! 총 ${totalRemoved}개 제거`);
