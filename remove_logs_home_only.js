#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 홈 파일만 처리
const targetFile = 'app/(tabs)/home.tsx';

function removeLogsFromHome() {
  try {
    const fullPath = path.join(__dirname, targetFile);
    
    // 파일이 존재하는지 확인
    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️ 파일을 찾을 수 없습니다: ${targetFile}`);
      return;
    }

    console.log(`📖 ${targetFile} 파일 읽는 중...`);
    const content = fs.readFileSync(fullPath, 'utf8');
    let modifiedContent = content;
    let removedCount = 0;

    console.log('🔍 로그 패턴 찾는 중...');

    // 1. 단일 줄 console.log 제거 (안전한 패턴만)
    const singleLineLogRegex = /^\s*console\.log\([^)]*\);\s*$/gm;
    const singleLineMatches = modifiedContent.match(singleLineLogRegex);
    if (singleLineMatches) {
      console.log(`📝 단일 줄 로그 ${singleLineMatches.length}개 발견`);
      removedCount += singleLineMatches.length;
      modifiedContent = modifiedContent.replace(singleLineLogRegex, '');
    }

    // 2. 여러 줄에 걸친 console.log 제거 (객체 구조)
    const multiLineLogRegex = /^\s*console\.log\(\s*\{[\s\S]*?\}\s*\);\s*$/gm;
    const multiLineMatches = modifiedContent.match(multiLineLogRegex);
    if (multiLineMatches) {
      console.log(`📝 여러 줄 로그 ${multiLineMatches.length}개 발견`);
      removedCount += multiLineMatches.length;
      modifiedContent = modifiedContent.replace(multiLineLogRegex, '');
    }

    // 3. console.error 중 개발용 디버그 에러만 제거 (조심스럽게)
    const debugErrorRegex = /^\s*console\.error\(['"](Failed to load settings|Failed to save lastViewType|데이터 로드 실패)['"]/gm;
    const debugErrorMatches = modifiedContent.match(debugErrorRegex);
    if (debugErrorMatches) {
      console.log(`📝 디버그 에러 로그 ${debugErrorMatches.length}개 발견`);
      removedCount += debugErrorMatches.length;
      modifiedContent = modifiedContent.replace(debugErrorRegex, '');
    }

    // 4. 빈 줄 정리 (연속된 빈 줄을 하나로)
    modifiedContent = modifiedContent.replace(/\n\s*\n\s*\n/g, '\n\n');

    // 변경사항이 있으면 파일에 저장
    if (removedCount > 0) {
      console.log(`💾 ${targetFile} 파일에 변경사항 저장 중...`);
      fs.writeFileSync(fullPath, modifiedContent, 'utf8');
      console.log(`✅ ${targetFile}: ${removedCount}개의 로그 제거 완료`);
    } else {
      console.log(`ℹ️ ${targetFile}: 제거할 로그 없음`);
    }

    // 변경 전후 비교
    const originalLines = content.split('\n').length;
    const modifiedLines = modifiedContent.split('\n').length;
    console.log(`📊 변경 전: ${originalLines}줄 → 변경 후: ${modifiedLines}줄`);

  } catch (error) {
    console.error(`❌ ${targetFile} 처리 중 오류:`, error.message);
  }
}

// 메인 실행
console.log('🚀 홈 파일 로그 제거 시작...\n');
removeLogsFromHome();
console.log('\n✅ 홈 파일 로그 제거 완료!');
console.log('📝 변경사항을 확인하고 테스트해보세요.');

