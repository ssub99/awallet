/**
 * 네이티브 스플래시를 첫 실화면(온보딩/홈) 페인트 직전까지 유지.
 * 부트스트랩은 showApp 만으로 hide 하지 않고, 여기 release 를 기다린다.
 */

type Listener = () => void;

let released = false;
const listeners = new Set<Listener>();

export function releaseFirstScreenSplash(): void {
  if (released) {
    return;
  }
  released = true;
  for (const listener of [...listeners]) {
    listener();
  }
  listeners.clear();
}

export function onFirstScreenSplashRelease(listener: Listener): () => void {
  if (released) {
    listener();
    return () => undefined;
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
