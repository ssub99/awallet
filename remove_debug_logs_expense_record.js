#!/usr/bin/env node

/**
 * 정기 기록 디버깅 로그 제거 스크립트
 * 
 * 이 스크립트는 expense-record.tsx와 home.tsx에서 추가된 디버깅 로그들을 안전하게 제거합니다.
 * 기존 로직에 영향을 주지 않도록 주의깊게 작성되었습니다.
 */

const fs = require('fs');
const path = require('path');

// 제거할 로그 패턴들
const logPatterns = [
  // debugLog 함수 호출들
  {
    pattern: /debugLog\([^)]+\);?\s*/g,
    description: 'debugLog 함수 호출'
  },
  // console.log 디버깅 로그들 (특정 패턴만)
  {
    pattern: /console\.log\(`🔍 \[DEBUG\][^`]+`[^)]*\);?\s*/g,
    description: 'DEBUG 로그'
  },
  {
    pattern: /console\.log\(`📅 \[월시작일\][^`]+`[^)]*\);?\s*/g,
    description: '월시작일 로그'
  },
  {
    pattern: /console\.log\(`🔄 \[전체수정\][^`]+`[^)]*\);?\s*/g,
    description: '전체수정 로그'
  },
  {
    pattern: /console\.log\(`🗑️ \[전체수정\][^`]+`[^)]*\);?\s*/g,
    description: '전체수정 삭제 로그'
  },
  {
    pattern: /console\.log\(`📝 \[전체수정\][^`]+`[^)]*\);?\s*/g,
    description: '전체수정 생성 로그'
  },
  {
    pattern: /console\.log\(`✅ \[전체수정\][^`]+`[^)]*\);?\s*/g,
    description: '전체수정 완료 로그'
  },
  {
    pattern: /console\.log\(`🔍 \[오늘만수정\][^`]+`[^)]*\);?\s*/g,
    description: '오늘만수정 로그'
  },
  {
    pattern: /console\.log\(`📅 \[오늘만수정\][^`]+`[^)]*\);?\s*/g,
    description: '오늘만수정 날짜 로그'
  },
  {
    pattern: /console\.log\(`🗑️ \[오늘만수정\][^`]+`[^)]*\);?\s*/g,
    description: '오늘만수정 삭제 로그'
  },
  {
    pattern: /console\.log\(`📝 \[오늘만수정\][^`]+`[^)]*\);?\s*/g,
    description: '오늘만수정 업데이트 로그'
  },
  {
    pattern: /console\.log\(`💰 \[오늘만수정\][^`]+`[^)]*\);?\s*/g,
    description: '오늘만수정 금액 로그'
  },
  {
    pattern: /console\.log\(`🏠 \[이동\][^`]+`[^)]*\);?\s*/g,
    description: '이동 로그'
  },
  {
    pattern: /console\.log\(`📊 \[홈\][^`]+`[^)]*\);?\s*/g,
    description: '홈 데이터 로그'
  },
  {
    pattern: /console\.log\(`📅 \[홈\][^`]+`[^)]*\);?\s*/g,
    description: '홈 월시작일 로그'
  }
];

// 처리할 파일들
const filesToProcess = [
  'app/expense-record.tsx',
  'app/(tabs)/home.tsx'
];

function removeDebugLogs(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  파일을 찾을 수 없습니다: ${filePath}`);
      return false;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;
    let removedCount = 0;

    // 각 패턴에 대해 로그 제거
    logPatterns.forEach(({ pattern, description }) => {
      const matches = content.match(pattern);
      if (matches) {
        content = content.replace(pattern, '');
        removedCount += matches.length;
        console.log(`  ✅ ${description}: ${matches.length}개 제거`);
      }
    });

    // 빈 줄 정리 (연속된 빈 줄을 하나로)
    content = content.replace(/\n\s*\n\s*\n/g, '\n\n');

    // 변경사항이 있으면 파일 저장
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ ${filePath}: ${removedCount}개 로그 제거 완료`);
      return true;
    } else {
      console.log(`ℹ️  ${filePath}: 제거할 로그가 없습니다`);
      return false;
    }

  } catch (error) {
    console.error(`❌ ${filePath} 처리 중 오류:`, error.message);
    return false;
  }
}

function main() {
  console.log('🧹 정기 기록 디버깅 로그 제거 시작...\n');

  let processedFiles = 0;
  let successCount = 0;

  filesToProcess.forEach(filePath => {
    console.log(`📁 처리 중: ${filePath}`);
    if (removeDebugLogs(filePath)) {
      successCount++;
    }
    processedFiles++;
    console.log('');
  });

  console.log('📊 제거 완료 요약:');
  console.log(`  - 처리된 파일: ${processedFiles}개`);
  console.log(`  - 성공: ${successCount}개`);
  console.log(`  - 실패: ${processedFiles - successCount}개`);

  if (successCount > 0) {
    console.log('\n✅ 디버깅 로그 제거가 완료되었습니다.');
    console.log('💡 이제 앱을 다시 빌드하여 변경사항을 적용하세요.');
  } else {
    console.log('\nℹ️  제거할 디버깅 로그가 없습니다.');
  }
}

// 스크립트 실행
if (require.main === module) {
  main();
}

module.exports = { removeDebugLogs, logPatterns };
