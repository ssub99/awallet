#!/usr/bin/env node

const fs = require('fs');

// 매우 안전한 디버깅 로그 패턴만 매칭
// 오직 이모지 + 대괄호 패턴의 console.log만 제거
const DEBUG_PATTERN = /^\s*console\.log\(['"`][🔒📥💰📅📊📆🔗🔧✅❌⚠️🔄⬅️🗑️💾🔍📆👋📝📋][^'"`]*\['[^']*'\][^'"`]*['"`][^)]*\);\s*$/gm;

function removeDebugLogs(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let modified = false;
    let removedCount = 0;
    
    const newLines = lines.map((line, index) => {
      // 매우 엄격한 조건: 이모지 + 대괄호 패턴만
      if (line.includes('console.log') && 
          line.includes('[') && 
          line.includes(']') &&
          /[🔒📥💰📅📊📆🔗🔧✅❌⚠️🔄⬅️🗑️💾🔍📆👋📝📋]/.test(line)) {
        
        console.log(`  📍 Line ${index + 1}: ${line.trim().substring(0, 60)}...`);
        removedCount++;
        modified = true;
        return ''; // 빈 줄로 교체
      }
      return line;
    });
    
    if (modified) {
      // 연속된 빈 줄 정리
      const cleanedContent = newLines
        .join('\n')
        .replace(/\n\s*\n\s*\n/g, '\n\n');
      
      // 백업 생성
      fs.writeFileSync(filePath + '.backup', content, 'utf8');
      
      // 수정된 내용 저장
      fs.writeFileSync(filePath, cleanedContent, 'utf8');
      
      console.log(`✅ ${filePath}: ${removedCount}개 디버깅 로그 제거됨`);
      return { success: true, removed: removedCount };
    }
    
    return { success: true, removed: 0 };
  } catch (error) {
    console.error(`❌ ${filePath} 처리 실패:`, error.message);
    return { success: false, error: error.message };
  }
}

// 메인 실행
console.log('🛡️ 안전한 디버깅 로그 제거 시작...\n');

const files = [
  'app/monthly-expense-timeline.tsx',
  'app/expense-category.tsx', 
  'app/income-record.tsx'
];

let totalRemoved = 0;
let successCount = 0;

files.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`\n🔍 처리 중: ${file}`);
    const result = removeDebugLogs(file);
    if (result.success) {
      successCount++;
      totalRemoved += result.removed || 0;
    }
  } else {
    console.log(`⚠️ 파일이 존재하지 않음: ${file}`);
  }
});

console.log(`\n📊 결과:`);
console.log(`✅ 성공: ${successCount}개 파일`);
console.log(`🗑️ 제거된 로그: ${totalRemoved}개`);
console.log(`\n💾 백업 파일들이 생성되었습니다 (.backup 확장자)`);
console.log('✨ 안전한 디버깅 로그 제거 완료!');
