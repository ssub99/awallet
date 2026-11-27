import type { TagStatus } from '@/components/ui/tag';
import type { TimelineListItem } from '@/utils/timeline-from-calendar';

export interface TimelineItemTag {
  label: string;
  status: TagStatus;
}

/**
 * 기록 행 태그 (할부·결산·선납·환불·정기). monthly-expense-timeline 행과 동일 규칙.
 */
export function getTimelineItemTags(
  item: Pick<
    TimelineListItem,
    'isInstallment' | 'isRecurring' | 'isPrepaid' | 'isRefunded' | 'isSettled'
  >,
): TimelineItemTag[] {
  const tags: TimelineItemTag[] = [];

  if (item.isInstallment && item.isSettled) {
    tags.push({ label: '할부·결산', status: 'negative' });
  }
  if (item.isInstallment && item.isPrepaid && !item.isSettled) {
    tags.push({ label: '할부·선결제', status: 'positive' });
  }
  if (item.isInstallment && !item.isPrepaid && !item.isSettled) {
    tags.push({
      label: item.isRefunded ? '할부·환불' : '할부',
      status: 'negative',
    });
  }
  if (!item.isInstallment && item.isSettled) {
    tags.push({
      label: item.isRecurring ? '정기·결산' : '일반·결산',
      status: 'normal',
    });
  }
  if (!item.isInstallment && item.isPrepaid && !item.isSettled) {
    tags.push({ label: '선납', status: 'positive' });
  }
  if (!item.isInstallment && item.isRefunded && !item.isSettled) {
    tags.push({
      label: item.isRecurring ? '정기·환불' : '일반·환불',
      status: 'normal',
    });
  }
  if (
    !item.isInstallment &&
    item.isRecurring &&
    !item.isPrepaid &&
    !item.isRefunded &&
    !item.isSettled
  ) {
    tags.push({ label: '정기', status: 'normal' });
  }

  return tags;
}
