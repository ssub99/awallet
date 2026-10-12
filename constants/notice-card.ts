import type { IconName } from '@/components/ui/icon';

export interface NoticeCardContent {
  id: string;
  icon: IconName;
  title: string;
  description: string;
  /** 노출 시작일 (YYYY-MM-DD, 기기 로컬 날짜, 포함) */
  startDate: string;
  /** 노출 종료일 (YYYY-MM-DD, 기기 로컬 날짜, 포함) */
  endDate: string;
}

/** 홈 상단 안내 카드. 노출할 내용이 없으면 null */
export const NOTICE_CARD: NoticeCardContent | null = {
  id: 'record-inbox-receive',
  icon: 'notification',
  title: '문자/알림 수신 기능 업데이트',
  description: '보다 더 간편하게 기록을 생성해 보세요!',
  startDate: '2026-10-12',
  endDate: '2026-10-20',
};
