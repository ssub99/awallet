// OS 강제 다크 모드 영향 방지를 위해 항상 'light' 반환
export function useColorScheme(): 'light' {
  return 'light';
}
