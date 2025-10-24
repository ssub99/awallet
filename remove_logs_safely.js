#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 로그 제거할 파일들의 경로
const targetFiles = [
  'app/(tabs)/home.tsx',
  'app/monthly-expense-timeline.tsx',
  'app/challenge-edit.tsx',
  'app/challenge-create.tsx',
  'app/expense-record.tsx',
  'app/income-record.tsx',
  'app/income-edit.tsx',
  'app/_layout.tsx',
  'app/expense-category.tsx',
  'app/month-start-day.tsx',
  'components/ui/icon.tsx',
  'components/ui/switch.tsx',
  'components/ui/calendar-main.tsx',
  'components/ui/modal-popup.tsx',
  'utils/storage-cache.ts',
  'utils/notification-scheduler.ts',
  'utils/custom-month.ts',
  'utils/challenge-utils.ts',
  'hooks/use-month-start.ts',
  'hooks/use-notifications.ts',
  'hooks/use-week-start.ts',
  'app/(dev-tabs)/components.tsx',
  'app/(dev-tabs)/icons.tsx',
  'app/(tabs)/mypage.tsx',
  'app/expense-edit.tsx.backup'
];

// 안전한 로그 제거 함수
function removeLogsSafely(filePath) {
  try {
    const fullPath = path.join(__dirname, filePath);
    
    // 파일이 존재하는지 확인
    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️ 파일을 찾을 수 없습니다: ${filePath}`);
      return;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    let modifiedContent = content;
    let removedCount = 0;

    // 1. 단일 줄 console.log 제거
    const singleLineLogRegex = /^\s*console\.(log|warn|info|debug)\([^)]*\);\s*$/gm;
    const singleLineMatches = modifiedContent.match(singleLineLogRegex);
    if (singleLineMatches) {
      removedCount += singleLineMatches.length;
      modifiedContent = modifiedContent.replace(singleLineLogRegex, '');
    }

    // 2. 여러 줄에 걸친 console.log 제거 (객체나 복잡한 구조)
    const multiLineLogRegex = /^\s*console\.(log|warn|info|debug)\(\s*\{[\s\S]*?\}\s*\);\s*$/gm;
    const multiLineMatches = modifiedContent.match(multiLineLogRegex);
    if (multiLineMatches) {
      removedCount += multiLineMatches.length;
      modifiedContent = modifiedContent.replace(multiLineLogRegex, '');
    }

    // 3. console.error는 실제 에러 처리에 필요할 수 있으므로 제외
    // 단, 개발용 디버그 에러만 제거
    const debugErrorRegex = /^\s*console\.error\([^)]*['"](Failed to|Error|실패|오류)['"][^)]*\);\s*$/gm;
    const debugErrorMatches = modifiedContent.match(debugErrorRegex);
    if (debugErrorMatches) {
      removedCount += debugErrorMatches.length;
      modifiedContent = modifiedContent.replace(debugErrorRegex, '');
    }

    // 4. 빈 줄 정리 (연속된 빈 줄을 하나로)
    modifiedContent = modifiedContent.replace(/\n\s*\n\s*\n/g, '\n\n');

    // 변경사항이 있으면 파일에 저장
    if (removedCount > 0) {
      fs.writeFileSync(fullPath, modifiedContent, 'utf8');
      console.log(`✅ ${filePath}: ${removedCount}개의 로그 제거 완료`);
    } else {
      console.log(`ℹ️ ${filePath}: 제거할 로그 없음`);
    }

  } catch (error) {
    console.error(`❌ ${filePath} 처리 중 오류:`, error.message);
  }
}

// 메인 실행
console.log('🚀 안전한 로그 제거 시작...\n');

targetFiles.forEach(file => {
  removeLogsSafely(file);
});

console.log('\n✅ 로그 제거 완료!');
console.log('📝 변경사항을 확인하고 테스트해보세요.');

