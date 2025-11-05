import React from 'react';
import { CalendarDaySelect } from '@/components/ui/calendar-day-select';

interface BasicCalendarDaySelectProps {
  selectedDate?: string | null;
  onDayPress: (dateString: string) => void;
  monthStartDay: number;
}

// 기본형 캘린더: 선결제 전용 옵션/검증 없이 날짜만 선택
export function BasicCalendarDaySelect({
  selectedDate,
  onDayPress,
  monthStartDay,
}: BasicCalendarDaySelectProps) {
  return (
    <CalendarDaySelect
      selectedDate={selectedDate ?? undefined}
      // 월 변경이 선택된 날짜에 의해 다시 되돌아가지 않도록 자동 센터링 비활성화
      autoCenterOnSelectedDate={false}
      // 기본형: 과거 날짜 선택 제한 없음, 검증 콜백 없음
      onDayPress={onDayPress}
      monthStartDay={monthStartDay}
    />
  );
}

export default BasicCalendarDaySelect;


