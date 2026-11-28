/** 반복 기록 복사 — 첫 기록의 원본 값으로 오늘부터 새 기록을 만든다 */

import { RecurringRecordForm } from '@/components/recurring/recurring-record-form';

export default function RecurringRecordCopyScreen() {
  return <RecurringRecordForm mode="copy" />;
}
