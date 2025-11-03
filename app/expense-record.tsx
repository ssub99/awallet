/**
 * Expense Record Screen
 * 
 * Allows users to create or edit an expense record.
 * Supports both create and edit modes.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { CalendarDaySelect } from '@/components/ui/calendar-day-select';
import { DatePicker } from '@/components/ui/date-picker';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { ModalBottomsheet } from '@/components/ui/modal-bottomsheet';
import { ModalPopup } from '@/components/ui/modal-popup';
import PrepaymentModal from '@/components/ui/prepayment-modal';
import { Radio } from '@/components/ui/radio';
import { Selectbox } from '@/components/ui/selectbox';
import { Switch } from '@/components/ui/switch';
import { Toast } from '@/components/ui/toast';
import { Colors, Typography } from '@/constants/theme';
import { useAppData } from '@/contexts/app-data-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { triggerChallengeNotifications } from '@/utils/challenge-utils';
import { getCustomMonthInfo } from '@/utils/custom-month';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, InteractionManager, Keyboard, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

interface ExpenseRecordProps {
  mode?: 'create' | 'edit';
  editData?: any;
}

/**
 * 해당 월의 실제 일자 계산 (월말 처리)
 * 예: 2월 31일 → 2월 28일 (마지막 날)
 */
function getActualDayForMonth(year: number, month: number, desiredDay: number): number {
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  return Math.min(desiredDay, lastDayOfMonth);
}

/**
 * 요일 계산 함수
 */
function getDayOfWeekLabel(year: number, month: number, day: number): string {
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const date = new Date(year, month - 1, day);
  return weekdays[date.getDay()];
}

// ===== 삭제 기능 유틸리티 함수들 =====

/**
 * 개발 환경에서만 로그 출력
 */
const debugLog = (message: string, data?: any) => {
  if (__DEV__) {
    console.log(`🔍 [DEBUG] ${message}`, data || '');
  }
};

/**
 * 날짜 형식 변환 유틸리티
 */
const formatDateKey = (date: string): string => date.replace(/\./g, '-');

/**
 * 정기 기록 기간 계산 유틸리티
 */
const calcPeriod = (editData: any, totalMonths: number) => {
  // 정기기록 또는 할부 기록의 실제 원본 시작일은 ID(timestamp)를 기준으로 계산
  // 정기 기록: recurringId, 할부 기록: installmentId
  const idToUse = editData.isRecurring ? editData.recurringId : editData.installmentId;
  
  if (!idToUse) {
    // ID가 없으면 편집 날짜를 기준으로 계산 (에러 케이스)
    const editDate = new Date(editData.date || '');
    const editYear = editDate.getFullYear();
    const editMonth = editDate.getMonth() + 1;
    
    return {
      startYear: editYear,
      startMonth: editMonth,
      editYear,
      editMonth,
      totalMonths: totalMonths,
      originalStartDate: editDate,
      originalStartYear: editYear,
      originalStartMonth: editMonth
    };
  }
  
  // ID(timestamp)에서 최초 생성 날짜 계산
  const originalStartDate = new Date(Number(idToUse));
  const originalStartYear = originalStartDate.getFullYear();
  const originalStartMonth = originalStartDate.getMonth() + 1;
  
  const editDate = new Date(editData.date || '');
  const editYear = editDate.getFullYear();
  const editMonth = editDate.getMonth() + 1;
  
  // "오늘만 삭제"의 경우 편집 시도 일자를 새로운 시작일로 설정
  // 다른 경우에는 원본 시작일을 유지
  const startYear = originalStartYear;
  const startMonth = originalStartMonth;
  
  return { 
    startYear, 
    startMonth, 
    editYear, 
    editMonth, 
    totalMonths: totalMonths,
    originalStartDate,
    originalStartYear,
    originalStartMonth
  };
};

/**
 * 정기 기록의 마지막 날짜 계산
 */
const calcEndDate = (startYear: number, startMonth: number, totalMonths: number) => {
  const actualEndYear = startYear + Math.floor((startMonth + totalMonths - 2) / 12);
  const actualEndMonth = ((startMonth + totalMonths - 2) % 12) + 1;
  return { actualEndYear, actualEndMonth };
};

/**
 * 요일 계산 유틸리티
 */
const getWeekdayLabel = (date: Date): string => {
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return weekdays[date.getDay()];
};

/**
 * 날짜 비교 유틸리티
 */
const isSameDate = (recordDate: string, currentDate: Date): boolean => {
  const recordDateKey = formatDateKey(recordDate);
  const currentDateKey = currentDate.toISOString().split('T')[0];
  return recordDateKey === currentDateKey;
};

/**
 * 미래 날짜 확인 유틸리티
 */
const isFutureDate = (recordDate: string, currentDate: Date): boolean => {
  const recordDateObj = new Date(recordDate);
  return recordDateObj >= currentDate;
};

/**
 * 삭제 옵션별 기록 필터링
 */
const shouldDelete = (
  record: any, 
  deleteOption: 'all' | 'today' | 'future', 
  currentDate: Date,
  startYear: number,
  startMonth: number,
  editYear?: number,
  editMonth?: number,
  editDay?: number
): boolean => {
  switch (deleteOption) {
    case 'all':
      return true;
    case 'today':
      // 편집하려는 날짜와 비교 (editYear, editMonth, editDay가 있으면 사용)
      if (editYear && editMonth && editDay) {
        // 로컬 시간대로 편집 날짜 생성 (시간대 문제 방지)
        const editDate = new Date(editYear, editMonth - 1, editDay, 12, 0, 0); // 정오로 설정하여 시간대 문제 방지
        const result = isSameDate(record.date, editDate);
        
        
        
        return result;
      } else {
        const result = isSameDate(record.date, currentDate);
        
        
        
        return result;
      }
    case 'future':
      // 편집 중인 날짜가 있으면 그 날짜를 기준으로, 없으면 현재 날짜를 기준으로
      const baseYear = editYear || currentDate.getFullYear();
      const baseMonth = editMonth || (currentDate.getMonth() + 1);
      const baseDay = editDay || currentDate.getDate();
      
      const isFirstData = baseYear === startYear && baseMonth === startMonth;
      
      if (isFirstData) {
        return true; // 첫 번째 데이터에서는 전체 삭제와 동일
      } else {
        // 편집 중인 날짜를 문자열로 변환하여 비교 (YYYY-MM-DD 형식)
        const editDateKey = `${baseYear}-${String(baseMonth).padStart(2, '0')}-${String(baseDay).padStart(2, '0')}`;
        const recordDateKey = formatDateKey(record.date);
        const shouldDeleteRecord = recordDateKey >= editDateKey;
        
        
        
        return shouldDeleteRecord;
      }
    default:
      return false;
  }
};

// 상수 정의
const NAVIGATION_DELAY = 100; // ms
const DATE_FORMAT = 'YYYY-MM-DD';

/**
 * 정기 기록의 기간을 계산하는 함수
 */
function getRecurringPeriod(startDate: string, months: number): string {
  const [year, month, day] = startDate.split('.').map(Number);
  const start = new Date(year, month - 1, day);
  // ✅ 수정: months - 1을 빼서 정확한 개월 수 계산
  const end = new Date(year, month - 1 + months - 1, day);
  
  const startStr = `${String(start.getFullYear()).slice(-2)}/${String(start.getMonth() + 1).padStart(2, '0')}`;
  const endStr = `${String(end.getFullYear()).slice(-2)}/${String(end.getMonth() + 1).padStart(2, '0')}`;
  
  return `${startStr} - ${endStr}`;
}

export default function ExpenseRecordScreen({ mode = 'create', editData }: ExpenseRecordProps = {}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useAppData();
  const params = useLocalSearchParams<{ 
    category?: string; 
    selectedDate?: string;
    calendarYear?: string;
    calendarMonth?: string;
  }>();
  const scrollViewRef = useRef<ScrollView>(null);

  // Form state
  const today = new Date();
  const formattedToday = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
  
  // 선택된 날짜가 있으면 해당 날짜를 사용, 없으면 오늘 날짜 사용
  const getInitialDate = () => {
    if (params.selectedDate) {

      // "2025-01-15" 형식을 "2025.01.15" 형식으로 변환
      return params.selectedDate.replace(/-/g, '.');
    }
    return formattedToday;
  };
  
  const [category, setCategory] = useState<string>(params.category || '');
  
  // 카테고리 state 변경 감지
  useEffect(() => {
    // 카테고리 변경 시 필요한 로직이 있다면 여기에 추가
  }, [category]);
  const [amount, setAmount] = useState<string>('');
  
  // 금액 입력 시 처리하는 함수 (Input 컴포넌트에서 이미 포맷팅됨)
  const handleAmountChange = (text: string) => {
    // Input 컴포넌트에서 이미 콤마 포맷팅이 적용되어 있으므로 그대로 사용
    setAmount(text);
  };
  const [date, setDate] = useState<string>(getInitialDate());
  
  // date state 변경 감지
  useEffect(() => {
    // 날짜 변경 시 필요한 로직이 있다면 여기에 추가
  }, [date]);
  const [memo, setMemo] = useState<string>('');
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  // 정기 기록과 할부 기록 모두에서 사용하는 기간 개월수 (상호 배타적)
  const [totalMonths, setTotalMonths] = useState<number>(2); // 2개월~12개월
  const [isInstallment, setIsInstallment] = useState<boolean>(false); // 할부
  const [weekendOption, setWeekendOption] = useState<'weekend' | 'friday' | 'monday'>('weekend');
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [monthStartDay, setMonthStartDay] = useState(1);
  const [showDayPicker, setShowDayPicker] = useState<boolean>(false);
  const [tempSelectedDate, setTempSelectedDate] = useState<string>(date.replace(/\./g, '-'));
  const isOpeningDatePickerRef = useRef<boolean>(false);
  const [selectedDay, setSelectedDay] = useState<number>(() => {
    // 수정 모드이고 editData가 있으면 해당 날짜의 일자 사용
    if (mode === 'edit' && editData?.date) {
      const editDate = new Date(editData.date);
      return editDate.getDate();
    }
    
    // 캘린더에서 선택한 날짜가 있으면 해당 날짜의 일자 사용
    if (params.selectedDate) {
      const selectedDateObj = new Date(params.selectedDate);
      return selectedDateObj.getDate();
    }
    
    // 기본값은 오늘 일자
    return new Date().getDate();
  });
  const [showAmountAlert, setShowAmountAlert] = useState<boolean>(false);
  const [showCategoryAlert, setShowCategoryAlert] = useState<boolean>(false);
  const [showWeekendConfirm, setShowWeekendConfirm] = useState<boolean>(false);
  const [showPeriodPicker, setShowPeriodPicker] = useState<boolean>(false);
  // showPeriodNativePicker는 더 이상 사용하지 않음 (Selectbox로 대체)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [showRecurringDeleteConfirm, setShowRecurringDeleteConfirm] = useState<boolean>(false);
  const [showNoChangesModal, setShowNoChangesModal] = useState<boolean>(false);
  const [showEditConfirmModal, setShowEditConfirmModal] = useState<boolean>(false);
  const [editConfirmMessage, setEditConfirmMessage] = useState<string>('');
  const [showRefundEditConfirmModal, setShowRefundEditConfirmModal] = useState<boolean>(false);
  const [refundEditConfirmMessage, setRefundEditConfirmMessage] = useState<string>('');
  const [showRecurringToast, setShowRecurringToast] = useState<boolean>(false);
  const [recurringToastMessage, setRecurringToastMessage] = useState<string>('');
  const [showCategoryToast, setShowCategoryToast] = useState<boolean>(false);
  const [categoryToastMessage, setCategoryToastMessage] = useState<string>('');
  
  // 정기 기록 삭제 옵션 모달
  const [showRecurringDeleteOptions, setShowRecurringDeleteOptions] = useState<boolean>(false);
  const [deleteOption, setDeleteOption] = useState<'all' | 'today' | 'future'>('all');
  
  // 할부 기록 환불 처리 옵션 모달
  const [showRefundOptions, setShowRefundOptions] = useState<boolean>(false);
  const [refundOption, setRefundOption] = useState<'all' | 'today' | 'future'>('all');
  
  // 환불 처리 복구 모달
  const [showRefundRestore, setShowRefundRestore] = useState<boolean>(false);
  // 선결제 모달
  const [showPrepaymentModal, setShowPrepaymentModal] = useState<boolean>(false);
  
  // 토스트 state 변경 감지
  useEffect(() => {
    // 토스트 표시 시 필요한 로직이 있다면 여기에 추가
  }, [showRecurringToast]);
  
  // 정기 기록 수정 옵션
  const [editOption, setEditOption] = useState<'all' | 'today'>('all'); // 'all': 전체 수정, 'today': 오늘만 수정
  
  // 실제 존재하는 기록 개수 (삭제된 기록 제외)
  const [actualRecordCount, setActualRecordCount] = useState<number>(0);
  // 실제 존재하는 기록의 총 금액 (할부 기록 삭제 시 정확한 금액 계산용)
  const [actualTotalAmount, setActualTotalAmount] = useState<number>(0);
  // 할부 기록 "오늘 포함 이후" 금액 (실제 기록 기준)
  const [actualFutureAmount, setActualFutureAmount] = useState<number>(0);
  
  // Keyboard height tracking
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  // Section/Input position tracking
  // Remove amount auto-scroll states per request
  const [memoSectionY, setMemoSectionY] = useState(0);
  
  // 월 시작일 로드
  useEffect(() => {
    const loadMonthStart = async () => {
      const startDay = await loadMonthStartDay();
      setMonthStartDay(startDay);
    };
    loadMonthStart();
  }, []);
  
  // 실제 존재하는 기록 개수 계산 (삭제된 기록 제외)
  useEffect(() => {
    const calculateActualRecordCount = async () => {
      if (mode === 'edit' && (editData?.isRecurring || editData?.isInstallment)) {
        try {
          const storedData = await AsyncStorage.getItem('calendarData');
          if (!storedData) return;
          
          const calendarData = JSON.parse(storedData);
          const idToUse = editData.isRecurring ? editData.recurringId : editData.installmentId;
          if (!idToUse) return;
          
          let actualCount = 0;
          let totalAmount = 0;
          let futureAmount = 0;
          
          // 편집 날짜 기준으로 future 계산
          const editDate = new Date(editData.date || '');
          const editYear = editDate.getFullYear();
          const editMonth = editDate.getMonth() + 1;
          const editDay = editDate.getDate();
          
          // 시작일 계산
          const { startYear, startMonth } = calcPeriod(editData, totalMonths);
          
          Object.keys(calendarData).forEach(dateKey => {
            if (calendarData[dateKey].records) {
              const relatedRecords = calendarData[dateKey].records.filter(
                (r: any) => {
                  if (editData.isRecurring) {
                    return r.recurringId === idToUse && !r.isDeleted;
                  } else {
                    return r.installmentId === idToUse && !r.isDeleted;
                  }
                }
              );
              actualCount += relatedRecords.length;
              // 금액 합산
              relatedRecords.forEach((record: any) => {
                totalAmount += record.amount || 0;
                
                // future 금액 계산 (할부 기록만 - 삭제 옵션이나 환불 옵션이 'future'일 때)
                if (editData.isInstallment && (deleteOption === 'future' || refundOption === 'future')) {
                  const shouldDeleteRecord = shouldDelete(record, 'future', new Date(), startYear, startMonth, editYear, editMonth, editDay);
                  if (shouldDeleteRecord) {
                    futureAmount += record.amount || 0;
                  }
                }
              });
            }
          });
          
          setActualRecordCount(actualCount);
          setActualTotalAmount(totalAmount);
          setActualFutureAmount(futureAmount);
        } catch (error) {
        }
      }
    };
    
    calculateActualRecordCount();
  }, [mode, editData, deleteOption, refundOption, totalMonths]);

  // Edit mode: Initialize with edit data
  useEffect(() => {
    if (mode === 'edit' && editData) {

      setCategory(editData.category || '');
      // 금액에 콤마 포맷팅 적용
      const initialAmount = editData.amount?.toString() || '';
      if (initialAmount && !isNaN(Number(initialAmount))) {
        setAmount(Number(initialAmount).toLocaleString());
      } else {
        setAmount(initialAmount);
      }
      // 날짜 형식을 점(.) 구분자로 통일
      const editDate = editData.date || formattedToday;
      const normalizedDate = editDate.replace(/-/g, '.');

      setDate(normalizedDate);

      // selectedDay도 함께 업데이트
      if (editData.date) {
        const editDateObj = new Date(editData.date);
        const day = editDateObj.getDate();
        const year = editDateObj.getFullYear();
        const month = editDateObj.getMonth() + 1;
        const dayOfWeek = editDateObj.getDay();
        const dayOfWeekLabel = getDayOfWeekLabel(year, month, day);

        setSelectedDay(day);
      }
      setMemo(editData.memo || '');
      setIsRecurring(editData.isRecurring || false);
      // 정기 기록 개월수 설정
      let finalRecurringMonths = editData.totalMonths || 2;
      // 할부 기록 개월수 설정 (installmentMonths 우선, 없으면 totalMonths 사용)
      let finalInstallmentMonths = editData.installmentMonths || editData.totalMonths || 2;

      setTotalMonths(editData.isRecurring ? finalRecurringMonths : (editData.isInstallment ? finalInstallmentMonths : 2));
      
      // 정기 기록: totalMonths가 없는 경우, recurringId로 관련 기록들을 찾아서 개월수 추론
      if (editData.isRecurring && !editData.totalMonths && editData.recurringId) {
        const inferRecurringMonths = async () => {
          try {
            const storedData = await AsyncStorage.getItem('calendarData');
            const calendarData = storedData ? JSON.parse(storedData) : {};
            
            // 같은 recurringId를 가진 모든 기록 찾기
            let relatedRecordsCount = 0;
            Object.keys(calendarData).forEach(dateKey => {
              if (calendarData[dateKey].records) {
                const relatedRecords = calendarData[dateKey].records.filter(
                  (r: any) => r.recurringId === editData.recurringId
                );
                relatedRecordsCount += relatedRecords.length;
              }
            });
            
            if (relatedRecordsCount > 0) {
              setTotalMonths(relatedRecordsCount);
            }
          } catch (error) {
          }
        };
        
        inferRecurringMonths();
      }
      
      // 할부 기록: installmentMonths가 없는 경우, installmentId로 관련 기록들을 찾아서 개월수 추론
      if (editData.isInstallment && !editData.installmentMonths && editData.installmentId) {
        const inferInstallmentMonths = async () => {
          try {
            const storedData = await AsyncStorage.getItem('calendarData');
            const calendarData = storedData ? JSON.parse(storedData) : {};
            
            // 같은 installmentId를 가진 모든 기록 찾기
            let relatedRecordsCount = 0;
            Object.keys(calendarData).forEach(dateKey => {
              if (calendarData[dateKey].records) {
                const relatedRecords = calendarData[dateKey].records.filter(
                  (r: any) => r.installmentId === editData.installmentId
                );
                relatedRecordsCount += relatedRecords.length;
              }
            });
            
            if (relatedRecordsCount > 0) {
              setTotalMonths(relatedRecordsCount);
            }
          } catch (error) {
          }
        };
        
        inferInstallmentMonths();
      }
      // 할부 기록 여부 설정
      setIsInstallment(editData.isInstallment === true);

      setWeekendOption(editData.weekendOption || 'weekend');
      
      // 환불 처리된 기록인데 refundedAt이 없으면 AsyncStorage에서 찾아서 업데이트
      if (editData.isRefunded && !editData.refundedAt) {
        const ensureRefundedAt = async () => {
          try {
            const storedData = await AsyncStorage.getItem('calendarData');
            const calendarData = storedData ? JSON.parse(storedData) : {};
            
            // editData의 timestamp나 installmentId로 기록 찾기
            const findRecord = (record: any) => {
              if (editData.timestamp && record.timestamp === editData.timestamp) {
                return true;
              }
              if (editData.isInstallment && editData.installmentId && 
                  record.isInstallment && record.installmentId === editData.installmentId &&
                  record.date === editData.date) {
                return true;
              }
              return false;
            };
            
            // 모든 날짜 데이터에서 기록 찾기
            for (const dateKey of Object.keys(calendarData)) {
              if (calendarData[dateKey].records) {
                const foundRecord = calendarData[dateKey].records.find(findRecord);
                if (foundRecord && foundRecord.isRefunded) {
                  // refundedAt이 없으면 현재 날짜로 추가
                  if (!foundRecord.refundedAt) {
                    foundRecord.refundedAt = new Date().toISOString();
                    await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));
                    // editData도 업데이트 (화면에 반영되도록)
                    editData.refundedAt = foundRecord.refundedAt;
                  }
                  break;
                }
              }
            }
          } catch (error) {
          }
        };
        
        ensureRefundedAt();
      }
      
      // Parse date for day selection
      if (editData.date) {
        const dateParts = editData.date.split('.');
        if (dateParts.length === 3) {
          setSelectedDay(parseInt(dateParts[2]));
        }
      }
    }
  }, [mode, editData, formattedToday]);
  
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );
    
    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  // Update category when returning from category selection screen
  useFocusEffect(
    useCallback(() => {
      const updateCategory = async () => {

        // AsyncStorage에서 선택된 카테고리 확인 (카테고리 선택 화면에서 돌아온 경우)
        try {

          const selectedCategoryFromStorage = await AsyncStorage.getItem('selectedCategory');

          if (selectedCategoryFromStorage) {

            setCategory(selectedCategoryFromStorage);
            // 사용 후 AsyncStorage에서 제거
            await AsyncStorage.removeItem('selectedCategory');

          } else if (params.category) {
            // URL 파라미터에서 카테고리 설정 (초기 로드 시)

            setCategory(params.category);
          }
        } catch (error) {

          // 에러 발생 시 URL 파라미터 사용
          if (params.category) {
            setCategory(params.category);
          }
        }
      };
      
      updateCategory();
    }, [params.category])
  );
  
  // Check if selected date is weekend
  const isWeekend = useCallback(() => {
    // Parse date format "2025.09.28" to Date object
    const parts = date.split('.');
    if (parts.length !== 3) return false;
    
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
    const day = parseInt(parts[2], 10);
    
    const dateObj = new Date(year, month, day);
    const dayOfWeek = dateObj.getDay();
    
    return dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
  }, [date]);

  // 정기 기록/할부 기록 전체 수정 (기존 데이터 삭제 후 새로 생성)
  const handleMultipleRecordsBulkUpdate = async (
    calendarData: any, 
    editData: any, 
    newRecord: any, 
    actualDateKey: string, 
    monthlyAmount: number,
    expenseAmount: number
  ) => {

    // 1. ID 필수 체크: 할부/정기 기록 전체 수정은 반드시 ID가 있어야 함
    const idToUse = editData.isRecurring ? editData.recurringId : editData.installmentId;
    
    if (!idToUse) {
      throw new Error('할부/정기 기록 전체 수정은 ID가 필요합니다.');
    }
    
    // 2. 최초 생성 날짜 찾기 (삭제 전에 찾아야 함)
    // ID(timestamp)에서 직접 최초 생성 날짜 계산
    // installmentId/recurringId는 timestamp이므로, 이를 Date로 변환하면 최초 생성 날짜를 알 수 있음
    let originalDate = actualDateKey;
    
    if (idToUse) {
      // ID(timestamp)에서 최초 생성 날짜 계산
      const originalStartDate = new Date(Number(idToUse));
      const year = originalStartDate.getFullYear();
      const month = String(originalStartDate.getMonth() + 1).padStart(2, '0');
      const day = String(originalStartDate.getDate()).padStart(2, '0');
      originalDate = `${year}-${month}-${day}`;
      
      
    } else {
      // ID가 없으면 actualDateKey 사용 (에러 케이스지만 안전장치)
    }
    
    

    // 3. 할부 기록 전체 수정 시 사용자가 입력한 금액을 새로운 총액으로 사용
    // 기존 기록들의 총액을 계산하지 않고, 사용자가 입력한 expenseAmount를 총액으로 사용
    
    // 4. 기존 정기/할부 기록들 모두 삭제 (같은 ID를 가진 기록만)
    let deletedRecordsCount = 0;
    
    Object.keys(calendarData).forEach(dateKey => {
      if (calendarData[dateKey].records) {
        const relatedRecords = calendarData[dateKey].records.filter(
          (r: any) => {
            if (editData.isRecurring) {
              return r.recurringId === idToUse;
            } else {
              // 할부 기록: 같은 installmentId만 삭제
              return r.installmentId === idToUse;
            }
          }
        );
        
        if (relatedRecords.length > 0) {

          // 관련 기록들 삭제 (완전 삭제)
          calendarData[dateKey].records = calendarData[dateKey].records.filter(
            (r: any) => {
              if (editData.isRecurring) {
                return r.recurringId !== idToUse;
              } else {
                // 할부 기록: 같은 installmentId만 삭제
                return r.installmentId !== idToUse;
              }
            }
          );
          
          deletedRecordsCount += relatedRecords.length;
          
          // 총액에서 차감
          relatedRecords.forEach((record: any) => {
            if (record.type === 'expense') {
              calendarData[dateKey].totalExpense = Math.max(0, 
                (calendarData[dateKey].totalExpense || 0) - (record.amount || 0)
              );
            } else if (record.type === 'income') {
              calendarData[dateKey].totalIncome = Math.max(0, 
                (calendarData[dateKey].totalIncome || 0) - (record.amount || 0)
              );
            }
          });
          
          // 빈 날짜 데이터 정리
          if (calendarData[dateKey].records.length === 0) {
            delete calendarData[dateKey];
          }
        }
      }
    });
    
    
    
    // 5. 기존 ID 유지 (새로 생성하지 않음)
    // 같은 ID를 가진 기록들을 삭제했으므로, 같은 ID로 재생성
    const newRecurringId = editData.isRecurring ? idToUse : undefined;
    const newInstallmentId = editData.isInstallment ? idToUse : undefined;
    
    // 할부 기록 시 첫 번째 기록(원본)에는 나머지 금액 추가
    let firstRecordAmount = monthlyAmount;
    if (isInstallment) {
      // 전체 수정 시에는 사용자가 입력한 expenseAmount를 새로운 총액으로 사용
      // 할부 기록 수정 화면의 금액 필드는 월별 금액이므로, 총액으로 변환 필요
      // 하지만 전체 수정 시에는 사용자가 입력한 값이 총액인지 월별 금액인지 명확하지 않음
      // 따라서 사용자가 입력한 금액을 총액으로 간주하고 재할부
      const totalAmountToUse = expenseAmount * totalMonths;
      
      // 새로운 총액을 기준으로 재할부
      const baseAmount = Math.floor(totalAmountToUse / totalMonths);
      const remainder = totalAmountToUse - (baseAmount * totalMonths);
      firstRecordAmount = baseAmount + remainder; // 원본 기록에는 나머지 금액 추가
      monthlyAmount = baseAmount; // 나머지 기록을 위한 기본 할부 금액
      
      
    }
    
    
    
    // 전체 수정 시에도 첫 번째 기록은 원본 timestamp 유지 (할부 기록 그룹 유지)
    const firstRecordTimestamp = editData.timestamp || new Date().getTime();
    
    const updatedRecord = {
      ...newRecord,
      recurringId: newRecurringId,
      installmentId: newInstallmentId,
      timestamp: firstRecordTimestamp, // 원본 timestamp 유지
      amount: firstRecordAmount,
    };
    
    // 미래 기록들 생성 (최초 생성 날짜 기준으로 전체 재생성)
    if (isRecurring || isInstallment) {
      // 최초 생성 날짜의 년월 + 수정한 일자로 재생성
      const originalDateFormatted = originalDate.replace(/-/g, '.');
      const [originalYear, originalMonth, originalDay] = originalDateFormatted.split('.').map(Number);
      
      // 수정한 날짜에서 일자 추출
      const currentDateFormatted = actualDateKey.replace(/-/g, '.');
      const [currentYear, currentMonth, newDay] = currentDateFormatted.split('.').map(Number);

      

      // 시작 인덱스: 0부터 시작 (최초 생성 날짜부터 전체 재생성)
      let startIndex = 0;
      let createdRecordsCount = 0;

      for (let i = startIndex; i < totalMonths; i++) {
        let futureMonth = originalMonth + i;
        let futureYear = originalYear;
        
        while (futureMonth > 12) {
          futureMonth -= 12;
          futureYear += 1;
        }
        
        const actualDay = getActualDayForMonth(futureYear, futureMonth, newDay);
        let futureDate = `${futureYear}.${String(futureMonth).padStart(2, '0')}.${String(actualDay).padStart(2, '0')}`;
        
        // 주말 조정
        const futureDateObj = new Date(futureYear, futureMonth - 1, actualDay);
        const futureDayOfWeek = futureDateObj.getDay();
        
        if ((futureDayOfWeek === 0 || futureDayOfWeek === 6) && weekendOption !== 'weekend') {
          const adjustedDate = getAdjustedWeekendDate(futureDate, weekendOption);
          futureDate = adjustedDate;
        }
        
        const futureDateKey = futureDate.replace(/\./g, '-');
        
        if (!calendarData[futureDateKey]) {
          calendarData[futureDateKey] = {
            totalExpense: 0,
            totalIncome: 0,
            records: [],
          };
        }
        
        // 할부 기록과 정기 기록 구분하여 금액 계산
        let futureMonthlyAmount = monthlyAmount;
        if (isInstallment && i === 0) {
          // 할부 기록 첫 번째 기록: 이미 firstRecordAmount로 설정됨 (updatedRecord에 포함)
          futureMonthlyAmount = firstRecordAmount;
        } else if (isInstallment) {
          // 할부 기록 나머지 기록: 기본 할부 금액 사용 (이미 monthlyAmount에 baseAmount로 설정됨)
          futureMonthlyAmount = monthlyAmount;
        } else {
          // 정기 기록: 동일 금액
          futureMonthlyAmount = monthlyAmount;
        }
        
        // 첫 번째 기록(i=0)도 원본 timestamp 사용, 나머지는 새 timestamp
        const recordTimestamp = i === 0 
          ? firstRecordTimestamp 
          : firstRecordTimestamp + i; // 할부 기록들은 순차적으로 증가
        
        const futureRecord = {
          ...updatedRecord,
          date: futureDate,
          amount: futureMonthlyAmount,
          timestamp: recordTimestamp,
          isAutoGenerated: i > 0, // 첫 번째 기록은 원본이므로 false
          isInstallment: isInstallment ? true : undefined, // 할부 여부 저장
          totalMonths: isRecurring ? totalMonths : undefined, // 정기 기록 개월 수 저장
          installmentMonths: isInstallment ? totalMonths : undefined, // 할부 기록 개월 수 저장
          originalInstallment: isInstallment && i === 0 ? true : undefined, // 첫 번째만 원본으로 표시
        };
        
        calendarData[futureDateKey].records.push(futureRecord);
        calendarData[futureDateKey].totalExpense = (calendarData[futureDateKey].totalExpense || 0) + futureMonthlyAmount;
        
        createdRecordsCount++;
        
        
      }
      
      
    }

  };

  // 정기/할부 기록 오늘만 수정 (완전 삭제 후 ID 유지하여 재생성)
  const handleSingleRecordUpdate = async (
    calendarData: any, 
    editData: any, 
    newRecord: any, 
    actualDateKey: string, 
    monthlyAmount: number
  ) => {
    
    const originalDateKey = editData.date ? editData.date.replace(/\./g, '-') : actualDateKey;
    const isDateChanged = originalDateKey !== actualDateKey;
    
    
    
    // 기존 데이터 완전 삭제
    
    
    // 할부 기록의 경우 installmentId로도 찾을 수 있도록 함
    let foundRecord: any = null;
    let foundDateKey: string | null = null;
    let foundRecordIndex: number = -1;
    
    // 먼저 originalDateKey에서 찾기 시도
    if (calendarData[originalDateKey] && calendarData[originalDateKey].records) {
      const recordIndex = calendarData[originalDateKey].records.findIndex(
        (r: any) => {
          // timestamp로 우선 찾기
          if (r.timestamp === editData.timestamp) return true;
          // 할부 기록의 경우 installmentId도 확인
          if (editData.isInstallment && editData.installmentId && r.installmentId === editData.installmentId && r.date === editData.date) return true;
          // 정기 기록의 경우 recurringId도 확인
          if (editData.isRecurring && editData.recurringId && r.recurringId === editData.recurringId && r.date === editData.date) return true;
          return false;
        }
      );
      
      if (recordIndex !== -1) {
        foundRecord = calendarData[originalDateKey].records[recordIndex];
        foundDateKey = originalDateKey;
        foundRecordIndex = recordIndex;
      }
    }
    
    // originalDateKey에서 못 찾은 경우, 모든 날짜에서 찾기 (날짜가 이미 변경된 경우)
    if (!foundRecord && (editData.isInstallment || editData.isRecurring)) {
      const idToUse = editData.isInstallment ? editData.installmentId : editData.recurringId;
      if (idToUse) {
        Object.keys(calendarData).forEach(dateKey => {
          if (calendarData[dateKey].records) {
            const recordIndex = calendarData[dateKey].records.findIndex(
              (r: any) => {
                if (editData.isInstallment) {
                  return r.installmentId === idToUse && r.timestamp === editData.timestamp;
                } else {
                  return r.recurringId === idToUse && r.timestamp === editData.timestamp;
                }
              }
            );
            if (recordIndex !== -1) {
              foundRecord = calendarData[dateKey].records[recordIndex];
              foundDateKey = dateKey;
              foundRecordIndex = recordIndex;
            }
          }
        });
      }
    }
    
    if (foundRecord && foundDateKey !== null && foundRecordIndex !== -1) {
      
      // 기록 완전 삭제
      calendarData[foundDateKey].records.splice(foundRecordIndex, 1);
      
      // 기존 날짜의 총액에서 차감
      if (foundRecord.type === 'expense') {
        calendarData[foundDateKey].totalExpense = Math.max(0, 
          (calendarData[foundDateKey].totalExpense || 0) - (foundRecord.amount || 0)
        );
      }
      
      // 빈 날짜 데이터 정리
      if (calendarData[foundDateKey].records.length === 0) {
        delete calendarData[foundDateKey];
      }
    } else {
    }
    
    // 새 위치에 기록 재생성 (ID 유지)
    

    // 할부 기록 수정 시에는 기존 금액 그대로 사용 (재할부 방지)
    const finalAmount = (editData.isInstallment && editData.originalInstallment) 
      ? editData.amount  // 할부 기록은 기존 금액 유지
      : monthlyAmount;    // 일반 기록은 새 금액 사용

    // actualDateKey를 date 형식으로 변환 (2025-11-11 -> 2025.11.11)
    const actualDate = actualDateKey.replace(/-/g, '.');

    // 새 위치에 데이터 구조 생성 (날짜 데이터가 없으면 초기화)
    if (!calendarData[actualDateKey]) {
      calendarData[actualDateKey] = {
        totalExpense: 0,
        totalIncome: 0,
        records: [],
      };
    }

    const updatedRecord = {
      ...newRecord,
      date: actualDate, // 날짜 변경 시 실제 날짜로 업데이트
      recurringId: editData.isRecurring ? editData.recurringId : undefined,
      installmentId: editData.isInstallment ? editData.installmentId : undefined,
      timestamp: editData.timestamp, // 기존 timestamp 유지
      amount: finalAmount, // 할부 기록 수정 시 기존 금액 사용
    };

    calendarData[actualDateKey].records.push(updatedRecord);
    calendarData[actualDateKey].totalExpense = (calendarData[actualDateKey].totalExpense || 0) + finalAmount;
    
    
  };

  const handleCategoryPress = () => {
    // 원래 정기 기록 또는 할부 기록으로 생성된 데이터는 카테고리 변경 불가
    if (mode === 'edit' && (editData?.isRecurring || editData?.isInstallment)) {
      setCategoryToastMessage('변경할 수 없습니다. 새로 생성해 주세요.');
      setShowCategoryToast(true);
      return;
    }
    
    // 키패드가 열려있으면 닫기
    Keyboard.dismiss();
    
    // 카테고리 선택 화면으로 이동 (현재 선택된 카테고리 전달)
    router.push({
      pathname: '/expense-category',
      params: { 
        selectedCategory: category,
        fromEdit: 'true'
      },
    });
  };

  const handleDatePress = () => {
    // 키패드가 열려있으면 닫기
    Keyboard.dismiss();
    
    setTempSelectedDate(date.replace(/\./g, '-'));
    setShowDatePicker(true);
  };

  const handleDatePickerClose = () => {
    setShowDatePicker(false);
  };
  
  const handleDateConfirm = () => {
    if (tempSelectedDate) {
      const formattedDate = tempSelectedDate.replace(/-/g, '.');
      setDate(formattedDate);
    }
    setShowDatePicker(false);
  };

  // amount auto-scroll removed per request
  
  // amount auto-scroll removed per request

  const handleMemoFocus = () => {
    // 메모 섹션 위치로 스크롤 (하단 버튼 제외)
    // 기기 화면 높이에 비례하여 스크롤 오프셋 계산
    // 아이폰 13 미니(812pt)에서 216px이 최적 → 약 26.6%
    setTimeout(() => {
      if (memoSectionY > 0) {
        const windowHeight = Dimensions.get('window').height;
        const scrollOffset = windowHeight * 0.266; // 화면 높이의 26.6%
        scrollViewRef.current?.scrollTo({ 
          y: memoSectionY - scrollOffset, 
          animated: true 
        });
      }
    }, 350);
  };

  // 변경사항이 있는지 확인하는 함수
  const hasChanges = () => {
    if (mode !== 'edit' || !editData) {
      return true; // 새로 생성하는 경우는 항상 변경사항이 있음
    }

    // 현재 입력된 값들
    const currentAmount = parseFloat(amount.replace(/,/g, ''));
    const originalAmount = parseFloat(editData.amount?.toString() || '0');
    
    // 날짜 비교 (실제 날짜 값으로 비교)
    const currentDate = date;
    const originalDate = editData.date ? editData.date.replace(/-/g, '.') : '';
    
    // 날짜 변경 감지를 위한 디버깅 로그

    // 변경사항 확인
    const categoryChanged = category !== editData.category;
    const amountChanged = currentAmount !== originalAmount;
    const dateChanged = currentDate !== originalDate;
    const memoChanged = memo !== (editData.memo || '');
    const recurringChanged = isRecurring !== (editData.isRecurring || false);
    const totalMonthsChanged = totalMonths !== (editData.totalMonths || 2);
    const installmentChanged = isInstallment !== (editData.isInstallment || false);
    const weekendOptionChanged = weekendOption !== (editData.weekendOption || 'weekend');

    return categoryChanged || amountChanged || dateChanged || memoChanged || 
           recurringChanged || totalMonthsChanged || installmentChanged || weekendOptionChanged;
  };

  const handleConfirm = async () => {
    // 필수값 검증
    if (!category) {
      setShowCategoryAlert(true);
      return;
    }
    
    const isRefundedRecord = mode === 'edit' && !!editData?.isRefunded;
    
    // 금액 필수 검증: 환불된 기록은 0원/미입력 허용
    if (!isRefundedRecord) {
      if (!amount || amount === '0' || amount.trim() === '') {
        setShowAmountAlert(true);
        return;
      }
    }
    
    // 수정 모드에서 변경사항이 없으면 모달 표시
    // 환불 기록: 저장 전에 환불 전용 모달 표시
    if (isRefundedRecord) {
      setRefundEditConfirmMessage('현재 데이터만 변경 됩니다.\n진행하시겠어요?');
      setShowRefundEditConfirmModal(true);
      return;
    }

    // 정기/할부 기록 수정모드에서 확인 모달 표시 (환불 기록은 제외)
    if (!isRefundedRecord && mode === 'edit' && (editData?.isRecurring || editData?.isInstallment)) {
      const isInstallmentRecord = editData.isInstallment && editData.originalInstallment;
      const recordType = isInstallmentRecord ? '할부' : '정기';
      
      let message = '';
      if (editOption === 'all') {
        message = '매달 마다 자동으로 기록되는\n데이터 모두를 수정하시겠어요?';
      } else {
        message = '매달 마다 자동으로 기록되는 데이터 중\n오늘 데이터만 수정하시겠어요?';
      }
      
      setEditConfirmMessage(message);
      setShowEditConfirmModal(true);
      return;
    }
    
    if (mode === 'edit' && !hasChanges()) {
      setShowNoChangesModal(true);
      return;
    }
    
    // 정기 지출 또는 할부 옵션 + 주말인 경우 확인 모달 표시 ('관계없이 주말 기록' 제외)
    if ((isRecurring || isInstallment) && isWeekend() && weekendOption !== 'weekend') {
      setShowWeekendConfirm(true);
      return;
    }
    
    // 실제 저장 진행
    await saveExpenseRecord();
  };
  
  const saveExpenseRecord = async () => {

    try {
      const storedData = await AsyncStorage.getItem('calendarData');
      const calendarData = storedData ? JSON.parse(storedData) : {};
      
      const isRefundedRecordForSave = mode === 'edit' && !!editData?.isRefunded;
      const expenseAmount = parseFloat(amount.replace(/,/g, ''));

      // 1. 실제 저장될 날짜 계산 (주말 옵션 적용)
      let actualDate = date;
      
      // 주말 체크
      const parts = date.split('.');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const dateObj = new Date(year, month, day);
      const dayOfWeek = dateObj.getDay();
      const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;

      if ((isRecurring || isInstallment) && isWeekendDay && weekendOption !== 'weekend') {
        actualDate = getAdjustedWeekendDate(date, weekendOption);

      } else if ((isRecurring || isInstallment) && isWeekendDay && weekendOption === 'weekend') {

      }
      
      const actualDateKey = actualDate.replace(/\./g, '-');

      // 환불된 기록은 금액/상태를 유지한 채 날짜만 이동
      if (isRefundedRecordForSave && mode === 'edit' && editData?.timestamp) {
        const originalDateKey = (editData.date || date).replace(/\./g, '-');
        const ts = editData.timestamp;
        if (!calendarData[actualDateKey]) {
          calendarData[actualDateKey] = { totalExpense: 0, totalIncome: 0, records: [] };
        }
        // 원본 위치에서 레코드 찾아 이동
        if (calendarData[originalDateKey]?.records) {
          const idx = calendarData[originalDateKey].records.findIndex((r: any) => r.timestamp === ts);
          if (idx !== -1) {
            const rec = calendarData[originalDateKey].records[idx];
            // 날짜 문자열 업데이트(YYYY.MM.DD)
            rec.date = actualDate;
            // 환불 상태/금액/백업 값 유지
            rec.isRefunded = true;
            rec.amount = 0;
            // 원본에서 제거
            calendarData[originalDateKey].records.splice(idx, 1);
            // 원본 날짜키가 비면 정리
            if (calendarData[originalDateKey].records.length === 0) {
              delete calendarData[originalDateKey];
            }
            // 대상 날짜키에 추가
            calendarData[actualDateKey].records.push(rec);
            await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));
            await refresh();
            return;
          }
        }
      }

      // 2. 날짜에 데이터 구조 생성
      if (!calendarData[actualDateKey]) {
        calendarData[actualDateKey] = {
          totalExpense: 0,
          totalIncome: 0,
          records: [],
        };
      }
      
      // 3. 새 기록 추가
      // 오늘만 수정 모드에서는 기존 timestamp와 recurringId 유지
      const newTimestamp = (mode === 'edit' && editData && editOption === 'today') 
        ? editData.timestamp 
        : new Date().getTime();
      // 정기 기록 전용 ID
      const recurringId = isRecurring 
        ? ((mode === 'edit' && editData && editOption === 'today') 
          ? editData.recurringId 
          : newTimestamp.toString())
        : undefined;

      // 할부 기록 전용 ID
      const installmentId = isInstallment 
        ? ((mode === 'edit' && editData && editOption === 'today') 
          ? editData.installmentId
          : newTimestamp.toString())
        : undefined;

      // 할부 옵션이 켜져 있으면 월별 금액 계산 (정기 옵션과 무관하게)
      let monthlyAmount: number;
      if (isInstallment) {
        // 수정 모드이고 할부 기록인 경우: 기존 금액 그대로 사용 (재할부 방지)
        if (mode === 'edit' && (editData?.isRecurring || editData?.isInstallment) && editData?.isInstallment) {
          monthlyAmount = parseFloat(amount.replace(/,/g, ''));

        } else {
          // 생성 모드: 할부 계산
          const baseAmount = Math.floor(expenseAmount / totalMonths);  // 소수점 제거하여 정수로 계산
          const remainder = expenseAmount - (baseAmount * totalMonths);  // 나머지 금액 계산
          monthlyAmount = baseAmount + remainder;  // 원본 기록에는 나머지 금액 추가
        }
      } else {
        monthlyAmount = expenseAmount;
      }

      const newRecord = {
        type: 'expense' as const,
        amount: monthlyAmount,
        category,
        memo,
        date: actualDate,
        timestamp: newTimestamp,
        isRecurring,
        weekendOption: (isRecurring || isInstallment) ? weekendOption : undefined,
        recurringId: isRecurring ? recurringId : undefined, // 정기 기록 전용
        installmentId: isInstallment ? installmentId : undefined, // 할부 기록 전용
        isAutoGenerated: false, // 원본 기록은 자동생성이 아님
        isInstallment: isInstallment ? true : undefined, // 할부 여부 저장
        totalMonths: isRecurring ? totalMonths : undefined, // 정기 기록 개월 수 저장
        installmentMonths: isInstallment ? totalMonths : undefined, // 할부 기록 개월 수 저장
        originalInstallment: isInstallment ? true : undefined, // 최초 생성 시 할부 설정 저장
      };

      if (mode === 'edit' && editData) {
        // Edit mode: 정기 기록 또는 할부 기록 수정 정책에 따른 처리
        if (editData.isRecurring || editData.isInstallment) {
          // 정기 기록 또는 할부 기록 수정
          if (editOption === 'all') {
            // 전체 수정: 기존 데이터 삭제 후 새로 생성
            await handleMultipleRecordsBulkUpdate(calendarData, editData, newRecord, actualDateKey, monthlyAmount, expenseAmount);
          } else {
            // 오늘만 수정: 해당 건만 수정 (부모/자식 관계 유지)
            // 할부 기록 수정 시에는 기존 금액을 사용하여 재할부 방지
            const singleUpdateAmount = (editData.isInstallment && editData.originalInstallment) 
              ? editData.amount  // 할부 기록은 기존 금액 사용
              : monthlyAmount;    // 일반 기록은 새 금액 사용

            await handleSingleRecordUpdate(calendarData, editData, newRecord, actualDateKey, singleUpdateAmount);
          }
        } else {
          // 일반 기록 수정 (기존 로직)
          const originalDateKey = editData.date ? editData.date.replace(/\./g, '-') : actualDateKey;

          // 기존 위치에서 기록 삭제 (날짜 변경 여부와 상관없이)
          if (calendarData[originalDateKey] && calendarData[originalDateKey].records) {
            // actualRecordIndex가 있으면 직접 사용, 없으면 timestamp로 찾기
            let originalRecordIndex = -1;
            
            if (editData.actualRecordIndex !== undefined && editData.actualRecordIndex !== null) {
              // actualRecordIndex 사용 (타임라인에서 전달받은 정확한 인덱스)
              originalRecordIndex = editData.actualRecordIndex;

            } else {
              // timestamp로 찾기 (legacy 호환)
              originalRecordIndex = calendarData[originalDateKey].records.findIndex(
                (r: any) => r.timestamp === editData.timestamp
              );

            }
            
            if (originalRecordIndex !== -1 && originalRecordIndex < calendarData[originalDateKey].records.length) {
              const originalRecord = calendarData[originalDateKey].records[originalRecordIndex];

              calendarData[originalDateKey].records.splice(originalRecordIndex, 1);
              
              // 기존 날짜의 총액에서 차감
              if (originalRecord.type === 'expense') {
                calendarData[originalDateKey].totalExpense = Math.max(0, 
                  (calendarData[originalDateKey].totalExpense || 0) - (originalRecord.amount || 0)
                );
              } else if (originalRecord.type === 'income') {
                calendarData[originalDateKey].totalIncome = Math.max(0, 
                  (calendarData[originalDateKey].totalIncome || 0) - (originalRecord.amount || 0)
                );
              }
              
              // 빈 날짜 데이터 정리
              if (calendarData[originalDateKey].records.length === 0) {
                delete calendarData[originalDateKey];
              }

            } else {

            }
          }
          
          // 새 위치에 기록 추가 (날짜 데이터가 없으면 초기화)
          if (!calendarData[actualDateKey]) {
            calendarData[actualDateKey] = {
              totalExpense: 0,
              totalIncome: 0,
              records: [],
            };

          }
          
          calendarData[actualDateKey].records.push({
            ...newRecord,
            timestamp: editData.timestamp, // Keep original timestamp
          });
          calendarData[actualDateKey].totalExpense = (calendarData[actualDateKey].totalExpense || 0) + monthlyAmount;

        }
      } else {
        // Create mode: Add new record
        calendarData[actualDateKey].records.push(newRecord);
        calendarData[actualDateKey].totalExpense = (calendarData[actualDateKey].totalExpense || 0) + monthlyAmount;

      }

      // 4. 정기 지출 또는 할부 옵션인 경우 다음 달들에도 기록 생성 (생성 모드에서만)
      if ((isRecurring || isInstallment) && mode !== 'edit') {

      // 정기 지출 또는 할부 옵션 시 월별 금액 계산 (미래 기록용)
      let futureMonthlyAmount: number;
      if (isInstallment) {
        futureMonthlyAmount = Math.floor(expenseAmount / totalMonths);  // 소수점 제거하여 정수로 계산
      } else {
        futureMonthlyAmount = expenseAmount;
      }
        
        
        
        // 원래 선택한 날짜를 기준으로 다음 달 계산
        const [yearNum, monthNum, dayNum] = date.split('.').map(Number);
        
        
        for (let i = 1; i < totalMonths; i++) {
          let futureMonth = monthNum + i;
          let futureYear = yearNum;
          
          // 월이 12를 넘으면 연도 증가
          while (futureMonth > 12) {
            futureMonth -= 12;
            futureYear += 1;
          }
          
          // 월말 처리: 해당 월의 실제 일자 계산
          const actualDay = getActualDayForMonth(futureYear, futureMonth, dayNum);
          
          // 미래 날짜 생성
          let futureDate = `${futureYear}.${String(futureMonth).padStart(2, '0')}.${String(actualDay).padStart(2, '0')}`;
          
          // 주말이면 조정 (단, 'weekend' 옵션이 아닐 때만)
          const futureDateObj = new Date(futureYear, futureMonth - 1, actualDay);
          const futureDayOfWeek = futureDateObj.getDay();
          
          if ((futureDayOfWeek === 0 || futureDayOfWeek === 6) && weekendOption !== 'weekend') {
            futureDate = getAdjustedWeekendDate(futureDate, weekendOption);
          }
          
          const futureDateKey = futureDate.replace(/\./g, '-');
          
          // 미래 날짜에 데이터 구조 생성
          if (!calendarData[futureDateKey]) {
            calendarData[futureDateKey] = {
              totalExpense: 0,
              totalIncome: 0,
              records: [],
            };
          }
          
          // 미래 기록 추가 (자동생성 표시)
          calendarData[futureDateKey].records.push({
            ...newRecord,
            amount: futureMonthlyAmount,
            date: futureDate,
            timestamp: newTimestamp + i,
            recurringId: isRecurring ? recurringId : undefined, // 정기 기록만
            installmentId: isInstallment ? installmentId : undefined, // 할부 기록만
            isAutoGenerated: true,
            isInstallment: isInstallment, // 할부 여부 저장
            totalMonths: isRecurring ? totalMonths : undefined, // 정기 기록 개월 수 저장
            installmentMonths: isInstallment ? totalMonths : undefined, // 할부 개월 수 저장
            originalInstallment: isInstallment, // 최초 생성 시 할부 설정 저장
          });
          
          calendarData[futureDateKey].totalExpense = (calendarData[futureDateKey].totalExpense || 0) + futureMonthlyAmount;
        }

      }

      // 6. AsyncStorage에 저장
      await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));
      
      // 6-0. 캘린더 데이터 컨텍스트 갱신 (캘린더 UI 업데이트를 위해 필수)
      await refresh();

      // 6-1. 챌린지 알림 트리거 (비동기이지만 대기하지 않음)
      if (category) {
        const recordDateObj = new Date(actualDateKey);
        triggerChallengeNotifications(category, recordDateObj).catch(error => {

        });
      }
      
      // 7. 홈으로 이동
      // 오늘만 수정 모드에서는 날짜 변경 여부에 따라 이동
      // 전체 수정 모드에서는 최초 생성 날짜로 이동
      let targetDateKey = actualDateKey;
      if (mode === 'edit' && editData && editOption === 'today') {
        // 오늘만 수정: 날짜가 변경된 경우 변경된 날짜로 이동, 변경되지 않은 경우 원래 날짜로 이동
        const originalDateKey = editData.date ? editData.date.replace(/\./g, '-') : actualDateKey;
        const isDateChanged = originalDateKey !== actualDateKey;
        
        if (isDateChanged) {
          // 날짜가 변경된 경우: 변경된 날짜로 이동하여 사용자가 변경사항을 확인할 수 있도록 함
          targetDateKey = actualDateKey;
          
        } else {
          // 날짜가 변경되지 않은 경우: 원래 날짜로 이동
          targetDateKey = originalDateKey;
          
        }
      } else if (mode === 'edit' && editData && editOption === 'all') {
        // 전체 수정: 최초 생성 날짜로 이동
        targetDateKey = actualDateKey;

      } else {
        // 생성 모드: 생성된 날짜로 이동
        targetDateKey = actualDateKey;

      }
      
      // 🔧 수정: 실제 저장된 날짜가 속한 커스텀 월로 이동
      // 날짜 문자열을 로컬 타임존으로 파싱
      const [yearNum, monthNum, dayNum] = targetDateKey.split('-').map(Number);
      const savedDate = new Date(yearNum, monthNum - 1, dayNum);
      
      // 월 시작일 로드
      const currentMonthStartDay = await loadMonthStartDay();
      
      
      
      // 실제 날짜가 속한 커스텀 월 계산
      const customMonthInfo = getCustomMonthInfo(savedDate, currentMonthStartDay);
      const targetYear = customMonthInfo.year;
      const targetMonth = customMonthInfo.month;
      
      
      
      const [, , targetDay] = targetDateKey.split('-').map(Number);

      // Stack 정리: 카테고리, 소비기록 모두 제거하고 홈으로
      router.back(); // expense-record 제거
      router.back(); // expense-category 제거
      
      // params를 전달하기 위해 replace 사용
      setTimeout(() => {
        router.replace({
          pathname: '/(tabs)/home',
          params: {
            targetYear: targetYear.toString(),
            targetMonth: targetMonth.toString(),
            targetDay: targetDay.toString(),
            targetDate: targetDateKey,
            periodType: 'month',
          },
        });
      }, 100);
    } catch (error) {

    }
  };
  
  // 주말 날짜를 금요일 또는 월요일로 조정하는 함수
  const getAdjustedWeekendDate = (dateString: string, option: 'friday' | 'monday'): string => {
    const [year, month, day] = dateString.split('.').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay();
    
    if (dayOfWeek === 0) {
      // 일요일
      if (option === 'friday') {
        // 금주 금요일 = -2일
        dateObj.setDate(dateObj.getDate() - 2);
      } else {
        // 차주 월요일 = +1일
        dateObj.setDate(dateObj.getDate() + 1);
      }
    } else if (dayOfWeek === 6) {
      // 토요일
      if (option === 'friday') {
        // 금주 금요일 = -1일
        dateObj.setDate(dateObj.getDate() - 1);
      } else {
        // 차주 월요일 = +2일
        dateObj.setDate(dateObj.getDate() + 2);
      }
    }
    
    const adjustedYear = dateObj.getFullYear();
    const adjustedMonth = String(dateObj.getMonth() + 1).padStart(2, '0');
    const adjustedDay = String(dateObj.getDate()).padStart(2, '0');
    
    return `${adjustedYear}.${adjustedMonth}.${adjustedDay}`;
  };

  const handleBack = () => {
    router.back();
  };

  const handleDeleteConfirm = async () => {
    if (mode !== 'edit' || !editData) {

      return;
    }

    try {

      const storedData = await AsyncStorage.getItem('calendarData');
      const calendarData = storedData ? JSON.parse(storedData) : {};
      
      // 삭제할 기록의 날짜 키 생성
      const recordDate = editData.date || date;
      const dateKey = recordDate.replace(/\./g, '-');

      if (calendarData[dateKey] && calendarData[dateKey].records) {
        // 해당 날짜의 기록들에서 삭제할 기록 찾기
        const recordIndex = calendarData[dateKey].records.findIndex(
          (r: any) => r.timestamp === editData.timestamp
        );
        
        if (recordIndex !== -1) {
          const recordToDelete = calendarData[dateKey].records[recordIndex];

          // 기록 삭제 (완전 삭제)
          calendarData[dateKey].records.splice(recordIndex, 1);
          
          // 총 지출액에서 해당 금액 차감
          if (recordToDelete.type === 'expense') {
            calendarData[dateKey].totalExpense = Math.max(0, 
              (calendarData[dateKey].totalExpense || 0) - (recordToDelete.amount || 0)
            );
          } else if (recordToDelete.type === 'income') {
            calendarData[dateKey].totalIncome = Math.max(0, 
              (calendarData[dateKey].totalIncome || 0) - (recordToDelete.amount || 0)
            );
          }
          
          // 정기 지출인 경우 관련된 모든 기록 삭제
          if (recordToDelete.isRecurring && recordToDelete.recurringId) {

            // 모든 날짜에서 같은 recurringId를 가진 기록들 찾아서 삭제
            Object.keys(calendarData).forEach(key => {
              if (calendarData[key].records) {
                const relatedRecords = calendarData[key].records.filter(
                  (r: any) => r.recurringId === recordToDelete.recurringId
                );
                
                if (relatedRecords.length > 0) {

                  // 관련 기록들 삭제
                  calendarData[key].records = calendarData[key].records.filter(
                    (r: any) => r.recurringId !== recordToDelete.recurringId
                  );
                  
                  // 총액에서 차감
                  relatedRecords.forEach((relatedRecord: any) => {
                    if (relatedRecord.type === 'expense') {
                      calendarData[key].totalExpense = Math.max(0, 
                        (calendarData[key].totalExpense || 0) - (relatedRecord.amount || 0)
                      );
                    } else if (relatedRecord.type === 'income') {
                      calendarData[key].totalIncome = Math.max(0,
                        (calendarData[key].totalIncome || 0) - (relatedRecord.amount || 0)
                      );
                    }
                  });
                }
              }
            });
          }
          
          // 할부 기록인 경우 관련된 모든 기록 삭제
          if (recordToDelete.isInstallment && recordToDelete.installmentId) {
            const installmentIdToDelete = recordToDelete.installmentId;

            // 모든 날짜에서 같은 installmentId를 가진 기록들 찾아서 삭제
            Object.keys(calendarData).forEach(key => {
              if (calendarData[key].records) {
                const relatedRecords = calendarData[key].records.filter(
                  (r: any) => r.installmentId === installmentIdToDelete
                );
                
                if (relatedRecords.length > 0) {

                  // 관련 기록들 삭제
                  calendarData[key].records = calendarData[key].records.filter(
                    (r: any) => r.installmentId !== installmentIdToDelete
                  );
                  
                  // 총액에서 차감
                  relatedRecords.forEach((relatedRecord: any) => {
                    if (relatedRecord.type === 'expense') {
                      calendarData[key].totalExpense = Math.max(0, 
                        (calendarData[key].totalExpense || 0) - (relatedRecord.amount || 0)
                      );
                    } else if (relatedRecord.type === 'income') {
                      calendarData[key].totalIncome = Math.max(0, 
                        (calendarData[key].totalIncome || 0) - (relatedRecord.amount || 0)
                      );
                    }
                  });
                }
              }
            });
          }
          
          // 빈 날짜 데이터 정리
          if (calendarData[dateKey].records.length === 0) {
            delete calendarData[dateKey];

          }
          
          // AsyncStorage에 저장
          await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));
          debugLog('✅ [삭제] 삭제 완료 및 저장');
          
          // 모달 닫기
          setShowDeleteConfirm(false);
          setShowRecurringDeleteConfirm(false);
          
          // 타임라인에서 왔으면 타임라인으로, 아니면 홈으로 이동
          if (params.calendarYear && params.calendarMonth) {
            // 타임라인으로 복귀
            
            router.back();
            
            setTimeout(() => {
              router.replace({
                pathname: '/monthly-expense-timeline',
                params: {
                  year: params.calendarYear,
                  month: params.calendarMonth,
                  tab: 'timeline'
                },
              });
            }, NAVIGATION_DELAY);
          } else {
            // 홈으로 이동
            const [targetYear, targetMonth, targetDay] = dateKey.split('-').map(Number);
            
            router.back();
            
            setTimeout(() => {
              router.replace({
                pathname: '/(tabs)/home',
                params: {
                  targetYear: targetYear.toString(),
                  targetMonth: targetMonth.toString(),
                  targetDay: targetDay.toString(),
                  targetDate: dateKey,
                  periodType: 'month',
                },
              });
            }, NAVIGATION_DELAY);
          }
        } else {

        }
      } else {

      }
    } catch (error) {

    }
  };

  // 할부 기록 환불 처리 옵션별 처리
  const handleMultipleRecordsRefund = async () => {
    if (mode !== 'edit' || !editData || !editData.isInstallment) {
      return;
    }

    try {
      
      const storedData = await AsyncStorage.getItem('calendarData');
      const calendarData = storedData ? JSON.parse(storedData) : {};
      
      // 할부 기록 ID 확인
      const installmentId = editData.installmentId;
      if (!installmentId) {
        return;
      }

      // 할부 기록의 시작일 정보 계산
      const { startYear, startMonth, editYear, editMonth } = calcPeriod(editData, totalMonths);

      // 환불할 기록들 찾기
      const recordsToRefund: {dateKey: string, record: any}[] = [];
      
      Object.keys(calendarData).forEach(dateKey => {
        if (calendarData[dateKey].records) {
          const relatedRecords = calendarData[dateKey].records.filter(
            (r: any) => r.installmentId === installmentId
          );
          
          relatedRecords.forEach((record: any) => {
            const currentDate = new Date();
            
            // 편집하려는 날짜의 일(day) 정보 추출
            const editDate = new Date(editData.date || '');
            const editDay = editDate.getDate();
            
            // 유틸리티 함수 사용 (편집 중인 날짜 정보 전달)
            const shouldRefundRecord = shouldDelete(record, refundOption, currentDate, startYear, startMonth, editYear, editMonth, editDay);
            
            if (shouldRefundRecord) {
              recordsToRefund.push({ dateKey, record });
            }
          });
        }
      });

      

      // 기록들 환불 처리 (삭제와 달리 기록은 유지하되 금액을 0으로 변경)
      recordsToRefund.forEach(({ dateKey, record }) => {
        const recordIndex = calendarData[dateKey].records.findIndex(
          (r: any) => r.timestamp === record.timestamp
        );
        
        if (recordIndex !== -1) {
          const originalAmount = record.amount || 0;
          
          // 복구를 위해 환불 전 금액 백업 (최초 환불 시 한 번만 저장)
          if (typeof calendarData[dateKey].records[recordIndex].originalAmountBeforeRefund !== 'number') {
            calendarData[dateKey].records[recordIndex].originalAmountBeforeRefund = originalAmount;
          }

          // 기록 환불 처리 (isRefunded 플래그 추가, 금액을 0으로 변경)
          calendarData[dateKey].records[recordIndex].isRefunded = true;
          calendarData[dateKey].records[recordIndex].refundedAt = new Date().toISOString();
          calendarData[dateKey].records[recordIndex].amount = 0;
          
          
          
          // 총액에서 차감 (캘린더에 표시되지 않도록)
          if (record.type === 'expense') {
            calendarData[dateKey].totalExpense = Math.max(0, 
              (calendarData[dateKey].totalExpense || 0) - originalAmount
            );
          } else if (record.type === 'income') {
            calendarData[dateKey].totalIncome = Math.max(0, 
              (calendarData[dateKey].totalIncome || 0) - originalAmount
            );
          }
          
          // 환불된 기록은 타임라인에 표시되어야 하므로 날짜 데이터를 삭제하지 않음
          // 날짜 데이터가 없으면 생성 (환불된 기록만 있어도 표시되도록)
          if (!calendarData[dateKey]) {
            calendarData[dateKey] = {
              totalExpense: 0,
              totalIncome: 0,
              records: [],
            };
          }
          
          // 환불된 기록이 있으면 날짜 데이터는 유지해야 함
          // (캘린더에는 표시되지 않지만 타임라인에는 표시됨)
        }
      });

      // AsyncStorage에 저장 전 확인 - 환불된 기록이 있는 날짜 데이터가 유지되는지 확인
      const refundedDateKeys = recordsToRefund.map(({ dateKey }) => dateKey);
      refundedDateKeys.forEach(dateKey => {
        if (calendarData[dateKey]) {
          const refundedRecords = calendarData[dateKey].records.filter((r: any) => r.isRefunded);
        }
      });
      
      // AsyncStorage에 저장
      await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));
      
      // 저장 후 확인
      const savedData = await AsyncStorage.getItem('calendarData');
      if (savedData) {
        const savedCalendarData = JSON.parse(savedData);
        refundedDateKeys.forEach(dateKey => {
          if (savedCalendarData[dateKey]) {
            const refundedRecords = savedCalendarData[dateKey].records.filter((r: any) => r.isRefunded);
          } else {
          }
        });
      }
      
      // 캘린더 데이터 컨텍스트 갱신 (캘린더 UI 업데이트를 위해 필수)
      await refresh();
      
      
      
      // 모달 닫기
      setShowRefundOptions(false);
      
      // 타임라인에서 왔으면 타임라인으로, 아니면 홈으로 이동
      if (params.calendarYear && params.calendarMonth) {
        // 타임라인으로 복귀
        
        router.back();
        
        setTimeout(() => {
          router.replace({
            pathname: '/monthly-expense-timeline',
            params: {
              year: params.calendarYear,
              month: params.calendarMonth,
              tab: 'timeline'
            },
          });
        }, NAVIGATION_DELAY);
      } else {
        // 홈으로 이동
        const recordDate = editData.date || date;
        const dateKey = formatDateKey(recordDate);
        const [targetYear, targetMonth, targetDay] = dateKey.split('-').map(Number);
        
        router.back();
        
        setTimeout(() => {
          router.replace({
            pathname: '/(tabs)/home',
            params: {
              targetYear: targetYear.toString(),
              targetMonth: targetMonth.toString(),
              targetDay: targetDay.toString(),
              targetDate: dateKey,
              periodType: 'month',
            },
          });
        }, NAVIGATION_DELAY);
      }
      
    } catch (error) {
    }
  };

  // 환불 처리 복구 로직
  const handleRefundRestore = async () => {
    if (mode !== 'edit' || !editData || !editData.isInstallment || !editData.isRefunded) {
      return;
    }

    try {
      
      const storedData = await AsyncStorage.getItem('calendarData');
      const calendarData = storedData ? JSON.parse(storedData) : {};
      
      // 할부 기록 ID 확인
      const installmentId = editData.installmentId;
      if (!installmentId) {
        return;
      }

      // 할부 기록의 모든 기록 찾기
      const allInstallmentRecords: {dateKey: string, record: any}[] = [];
      
      Object.keys(calendarData).forEach(dateKey => {
        if (calendarData[dateKey].records) {
          const relatedRecords = calendarData[dateKey].records.filter(
            (r: any) => r.installmentId === installmentId
          );
          
          relatedRecords.forEach((record: any) => {
            allInstallmentRecords.push({ dateKey, record });
          });
        }
      });

      

      // 환불되지 않은 기록 중 첫 번째 기록의 금액 확인
      // 할부 기록의 총 금액 계산을 위해 사용
      const nonRefundedRecords = allInstallmentRecords.filter(
        ({ record }) => !record.isRefunded && record.amount > 0
      );
      
      // 환불된 기록 찾기
      const refundedRecords = allInstallmentRecords.filter(
        ({ record }) => record.isRefunded
      );

      

      if (refundedRecords.length === 0) {
        return;
      }

      // 할부 기록의 원본 금액 계산 로직 개선
      let monthlyAmount = 0;
      let totalMonthsInGroup = 0; // 실제 그룹 내 총 개월수
      let maxAmountInGroup = 0; // 최대 금액 (잔여 금액이 포함된 첫 달 금액)
      
      // 모든 할부 기록의 금액을 수집 (0원인 환불 기록 제외)
      const amountsInGroup = allInstallmentRecords
        .filter(({ record }) => record.amount > 0)
        .map(({ record }) => record.amount);
      
      if (amountsInGroup.length > 0) {
        // 최빈값(가장 많이 나타나는 금액)을 월별 기본 금액으로 간주
        const amountCounts: {[key: number]: number} = {};
        amountsInGroup.forEach(amount => {
          amountCounts[amount] = (amountCounts[amount] || 0) + 1;
        });
        
        let maxCount = 0;
        let mostFrequentAmount = 0;
        for (const amountStr in amountCounts) {
          const amount = Number(amountStr);
          if (amountCounts[amount] > maxCount) {
            maxCount = amountCounts[amount];
            mostFrequentAmount = amount;
          }
        }
        monthlyAmount = mostFrequentAmount;
        
        // 최대 금액 (잔여 금액이 포함된 첫 달 금액)
        maxAmountInGroup = Math.max(...amountsInGroup);
        
        
        
        // totalMonths를 실제 그룹 내 기록 수로 업데이트
        totalMonthsInGroup = allInstallmentRecords.length;
        
      } else {
        // 모든 기록이 0원인 경우 (모두 환불된 경우)
        // editData의 amount를 월별 금액으로 가정 (이전 로직 유지)
        const baseAmount = editData.amount || 0;
        monthlyAmount = Number(baseAmount.toString().replace(/,/g, ''));
        maxAmountInGroup = monthlyAmount;
        totalMonthsInGroup = totalMonths; // 이 경우 totalMonths state 사용
        
      }

      // 첫 번째 기록에는 나머지 금액 포함 (할부 기록 생성 로직 참고)
      const baseAmount = monthlyAmount;
      const remainder = (totalMonthsInGroup > 0 && monthlyAmount > 0 && amountsInGroup.length > 0) ? (maxAmountInGroup - monthlyAmount) : 0; // 실제 잔여 금액 계산

      

      // 전체 할부 기록을 timestamp로 정렬하여 첫 번째 기록 찾기
      const sortedAllRecords = [...allInstallmentRecords].sort((a, b) => (a.record.timestamp || 0) - (b.record.timestamp || 0));
      const firstRecordInGroup = sortedAllRecords[0];
      const firstTimestamp = firstRecordInGroup?.record.timestamp || 0;
      
      
      
      // 환불된 기록들 복구 (timestamp 순서대로)
      const sortedRefundedRecords = refundedRecords.sort((a, b) => (a.record.timestamp || 0) - (b.record.timestamp || 0));
      
      sortedRefundedRecords.forEach(({ dateKey, record }, index) => {
        
        
        const recordIndex = calendarData[dateKey].records.findIndex(
          (r: any) => r.timestamp === record.timestamp
        );
        
        if (recordIndex !== -1) {
          // 전체 할부 기록 그룹에서 첫 번째 기록(가장 오래된 timestamp)인지 확인
          // 첫 번째 기록이면 나머지 금액 포함, 아니면 baseAmount만
          const isFirstRecordInGroup = (record.timestamp || 0) === firstTimestamp;
          const backupAmount = calendarData[dateKey].records[recordIndex].originalAmountBeforeRefund;
          const restoredAmount = (typeof backupAmount === 'number' && backupAmount >= 0)
            ? backupAmount
            : (isFirstRecordInGroup ? baseAmount + remainder : baseAmount);
          
          // 기록 복구 (isRefunded 플래그 제거, 금액 복구)
          calendarData[dateKey].records[recordIndex].isRefunded = false;
          delete calendarData[dateKey].records[recordIndex].refundedAt;
          calendarData[dateKey].records[recordIndex].amount = restoredAmount;
          
          
          
          // 총액 복구
          if (record.type === 'expense') {
            calendarData[dateKey].totalExpense = (calendarData[dateKey].totalExpense || 0) + restoredAmount;
          } else if (record.type === 'income') {
            calendarData[dateKey].totalIncome = (calendarData[dateKey].totalIncome || 0) + restoredAmount;
          }
        }
      });

      // AsyncStorage에 저장
      await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));
      
      // 캘린더 데이터 컨텍스트 갱신
      await refresh();
      
      
      
      // 모달 닫기
      setShowRefundRestore(false);
      
      // 화면 새로고침을 위해 editData 업데이트
      // 실제로는 router.replace나 refresh를 통해 화면을 새로고침해야 함
      // 하지만 현재 화면이 수정 모드이므로, 화면을 다시 로드하거나 
      // editData를 다시 가져와야 함
      
      // 타임라인에서 왔으면 타임라인으로, 아니면 홈으로 이동
      if (params.calendarYear && params.calendarMonth) {
        // 타임라인으로 복귀
        
        router.back();
        
        setTimeout(() => {
          router.replace({
            pathname: '/monthly-expense-timeline',
            params: {
              year: params.calendarYear,
              month: params.calendarMonth,
              tab: 'timeline'
            },
          });
        }, NAVIGATION_DELAY);
      } else {
        // 홈으로 이동
        const recordDate = editData.date || date;
        const dateKey = formatDateKey(recordDate);
        const [targetYear, targetMonth, targetDay] = dateKey.split('-').map(Number);
        
        router.back();
        
        setTimeout(() => {
          router.replace({
            pathname: '/(tabs)/home',
            params: {
              targetYear: targetYear.toString(),
              targetMonth: targetMonth.toString(),
              targetDay: targetDay.toString(),
              targetDate: dateKey,
              periodType: 'month',
            },
          });
        }, NAVIGATION_DELAY);
      }
      
    } catch (error) {
    }
  };

  // 정기/할부 기록 삭제 옵션별 처리
  const handleMultipleRecordsDelete = async () => {
    if (mode !== 'edit' || !editData || (!editData.isRecurring && !editData.isInstallment)) {

      return;
    }

    try {
      
      const storedData = await AsyncStorage.getItem('calendarData');
      const calendarData = storedData ? JSON.parse(storedData) : {};
      
      // 정기 기록 또는 할부 기록 ID 확인
      const idToUse = editData.isRecurring ? editData.recurringId : editData.installmentId;
      if (!idToUse) {

        return;
      }

      // 정기 기록/할부 기록의 시작일 정보 계산
      const { startYear, startMonth, editYear, editMonth } = calcPeriod(editData, totalMonths);

      // 삭제할 기록들 찾기
      const recordsToDelete: {dateKey: string, record: any}[] = [];
      
      Object.keys(calendarData).forEach(dateKey => {
        if (calendarData[dateKey].records) {
          const relatedRecords = calendarData[dateKey].records.filter(
            (r: any) => {
              if (editData.isRecurring) {
                return r.recurringId === idToUse;
              } else {
                // 할부 기록: 같은 installmentId만 삭제
                return r.installmentId === idToUse;
              }
            }
          );
          
          relatedRecords.forEach((record: any) => {
            const currentDate = new Date();
            
            // 편집하려는 날짜의 일(day) 정보 추출
            const editDate = new Date(editData.date || '');
            const editDay = editDate.getDate();
            
            // 유틸리티 함수 사용 (편집 중인 날짜 정보 전달)
            const shouldDeleteRecord = shouldDelete(record, deleteOption, currentDate, startYear, startMonth, editYear, editMonth, editDay);
            
            if (shouldDeleteRecord) {
              recordsToDelete.push({ dateKey, record });
            }
          });
        }
      });

      

      // 기록들 삭제
      recordsToDelete.forEach(({ dateKey, record }) => {
        const recordIndex = calendarData[dateKey].records.findIndex(
          (r: any) => r.timestamp === record.timestamp
        );
        
        if (recordIndex !== -1) {
          // 기록 삭제 (isDeleted 플래그 추가)
          calendarData[dateKey].records[recordIndex].isDeleted = true;
          calendarData[dateKey].records[recordIndex].deletedAt = new Date().toISOString();
          
          // 총액에서 차감
          if (record.type === 'expense') {
            calendarData[dateKey].totalExpense = Math.max(0, 
              (calendarData[dateKey].totalExpense || 0) - (record.amount || 0)
            );
          } else if (record.type === 'income') {
            calendarData[dateKey].totalIncome = Math.max(0, 
              (calendarData[dateKey].totalIncome || 0) - (record.amount || 0)
            );
          }
          
          // 빈 날짜 데이터 정리 (삭제된 기록만 있는 경우)
          const activeRecords = calendarData[dateKey].records.filter((r: any) => !r.isDeleted);
          if (activeRecords.length === 0) {
            delete calendarData[dateKey];
          }
        }
      });

      // AsyncStorage에 저장
      await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));
      
      // 캘린더 데이터 컨텍스트 갱신 (캘린더 UI 업데이트를 위해 필수)
      await refresh();
      
      
      // 모달 닫기
      setShowRecurringDeleteOptions(false);
      
      // 타임라인에서 왔으면 타임라인으로, 아니면 홈으로 이동
      if (params.calendarYear && params.calendarMonth) {
        // 타임라인으로 복귀
        
        router.back();
        
        setTimeout(() => {
          router.replace({
            pathname: '/monthly-expense-timeline',
            params: {
              year: params.calendarYear,
              month: params.calendarMonth,
              tab: 'timeline'
            },
          });
        }, NAVIGATION_DELAY);
      } else {
        // 홈으로 이동
        const recordDate = editData.date || date;
        const dateKey = formatDateKey(recordDate);
        const [targetYear, targetMonth, targetDay] = dateKey.split('-').map(Number);
        
        router.back();
        
        setTimeout(() => {
          router.replace({
            pathname: '/(tabs)/home',
            params: {
              targetYear: targetYear.toString(),
              targetMonth: targetMonth.toString(),
              targetDay: targetDay.toString(),
              targetDate: dateKey,
              periodType: 'month',
            },
          });
        }, NAVIGATION_DELAY);
      }
      
    } catch (error) {

    }
  };

  // 환불 처리날짜 포맷 함수
  const formatRefundDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      const year = String(date.getFullYear()).slice(-2);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}/${month}/${day}`;
    } catch (error) {
      return '';
    }
  };

  // 카테고리 이모지 찾기
  const getCategoryEmoji = (label: string) => {
    const categories: Record<string, string> = {
      '식비': '🍚',
      '배달음식': '🛵',
      '카페/편의점/간식': '☕️',
      '교통비': '🚊',
      '주거비': '🏠',
      '공과금': '📎',
      '통신비': '☎️',
      '쇼핑': '🛍️',
      '미용': '💇🏻‍♂️',
      '운동/헬스': '💪',
      '구독 서비스': '📌',
      '영화': '🎬',
      '취미': '👨🏻‍💻',
      '여행': '🧳',
      '모임/술': '🍺',
      '경조사/선물': '🎁',
      '차량': '🚘',
      '대출/이자': '🏦',
      '보험': '🔖',
      '적금': '💵',
      '투자': '📈',
      '세금': '⚖️',
      '기타': '📝',
    };
    return categories[label] || '';
  };

  // 할부 기록 환불 옵션별 기간 계산
  const getRefundPeriod = () => {
    if (!editData?.isInstallment) return '';
    
    switch (refundOption) {
      case 'all':
        // 전체 환불 - 할부 기록 원본 시작일 계산 필요
        const { startYear: allStartYear, startMonth: allStartMonth, totalMonths: allTotalMonths } = calcPeriod(editData, totalMonths);
        const { actualEndYear: allActualEndYear, actualEndMonth: allActualEndMonth } = calcEndDate(allStartYear, allStartMonth, allTotalMonths);
        const allStartPeriod = `${String(allStartYear).slice(-2)}/${String(allStartMonth).padStart(2, '0')}`;
        const allEndPeriod = `${String(allActualEndYear).slice(-2)}/${String(allActualEndMonth).padStart(2, '0')}`;
        return `기간 : ${allStartPeriod} - ${allEndPeriod}`;
      case 'today':
        // 오늘만 환불 - 편집하려는 날짜만 표시
        const editDate = new Date(editData.date || '');
        const editYear = editDate.getFullYear();
        const editMonth = editDate.getMonth() + 1;
        const editDay = editDate.getDate();
        const weekday = getWeekdayLabel(editDate);
        return `기간 : ${editYear}/${String(editMonth).padStart(2, '0')}/${String(editDay).padStart(2, '0')}(${weekday})`;
      case 'future':
        // 오늘 이후 환불 - 할부 기록 원본 시작일 계산 필요
        const { startYear: futureStartYear, startMonth: futureStartMonth, editYear: futureEditYear, editMonth: futureEditMonth, totalMonths: futureTotalMonths } = calcPeriod(editData, totalMonths);
        const { actualEndYear: futureActualEndYear, actualEndMonth: futureActualEndMonth } = calcEndDate(futureStartYear, futureStartMonth, futureTotalMonths);
        
        // 첫 번째 데이터(할부 기록 시작일)인지 확인
        const isFirstData = futureEditYear === futureStartYear && futureEditMonth === futureStartMonth;
        
        if (isFirstData) {
          // 첫 번째 데이터에서는 전체 환불과 동일
          const futureStartPeriod = `${String(futureStartYear).slice(-2)}/${String(futureStartMonth).padStart(2, '0')}`;
          const futureEndPeriod = `${String(futureActualEndYear).slice(-2)}/${String(futureActualEndMonth).padStart(2, '0')}`;
          return `기간 : ${futureStartPeriod} - ${futureEndPeriod}`;
        } else {
          // 나머지 데이터에서는 현재 편집 중인 날짜부터 할부 기록의 실제 마지막까지
          const refundStartPeriod = `${String(futureEditYear).slice(-2)}/${String(futureEditMonth).padStart(2, '0')}`;
          const futureEndPeriod = `${String(futureActualEndYear).slice(-2)}/${String(futureActualEndMonth).padStart(2, '0')}`;
          
          return `기간 : ${refundStartPeriod} - ${futureEndPeriod}`;
        }
      default:
        // 기본값 - 전체 환불과 동일
        const { startYear: defaultStartYear, startMonth: defaultStartMonth, totalMonths: defaultTotalMonths } = calcPeriod(editData, totalMonths);
        const { actualEndYear: defaultActualEndYear, actualEndMonth: defaultActualEndMonth } = calcEndDate(defaultStartYear, defaultStartMonth, defaultTotalMonths);
        const defaultStartPeriod = `${String(defaultStartYear).slice(-2)}/${String(defaultStartMonth).padStart(2, '0')}`;
        const defaultEndPeriod = `${String(defaultActualEndYear).slice(-2)}/${String(defaultActualEndMonth).padStart(2, '0')}`;
        return `기간 : ${defaultStartPeriod} - ${defaultEndPeriod}`;
    }
  };

  // 할부 기록 환불 옵션별 금액 계산
  const getRefundAmount = () => {
    if (!editData?.isInstallment || !amount) return '0원';
    
    const baseAmount = Number(amount.replace(/,/g, ''));
    if (isNaN(baseAmount)) return '0원';
    
    switch (refundOption) {
      case 'all':
        // 전체 기간의 금액 합산 - 실제 존재하는 기록만 계산
        if (actualTotalAmount > 0) {
          return `${actualTotalAmount.toLocaleString()}원`;
        } else {
          // 계산 중에는 실제 금액 대기
          return '계산 중...';
        }
      case 'today':
        // 오늘 날짜의 금액만
        return `${baseAmount.toLocaleString()}원`;
      case 'future':
        // 오늘 이후의 금액 합산
        if (actualFutureAmount > 0) {
          return `${actualFutureAmount.toLocaleString()}원`;
        } else {
          // 계산 중에는 실제 금액 대기
          return '계산 중...';
        }
      default:
        return '0원';
    }
  };

  // 정기 기록 삭제 옵션별 기간 계산
  const getDeletePeriod = () => {
    if (!editData?.isRecurring) return '';
    
    switch (deleteOption) {
      case 'all':
        // 전체 삭제 - 정기기록 원본 시작일 계산 필요
        const { startYear: allStartYear, startMonth: allStartMonth, totalMonths: allTotalMonths } = calcPeriod(editData, totalMonths);
        const { actualEndYear: allActualEndYear, actualEndMonth: allActualEndMonth } = calcEndDate(allStartYear, allStartMonth, allTotalMonths);
        const allStartPeriod = `${String(allStartYear).slice(-2)}/${String(allStartMonth).padStart(2, '0')}`;
        const allEndPeriod = `${String(allActualEndYear).slice(-2)}/${String(allActualEndMonth).padStart(2, '0')}`;
        return `기간 : ${allStartPeriod} - ${allEndPeriod}`;
      case 'today':
        // 오늘만 삭제 - 편집하려는 날짜만 표시
        const editDate = new Date(editData.date || '');
        const editYear = editDate.getFullYear();
        const editMonth = editDate.getMonth() + 1;
        const editDay = editDate.getDate();
        const weekday = getWeekdayLabel(editDate);
        return `기간 : ${editYear}/${String(editMonth).padStart(2, '0')}/${String(editDay).padStart(2, '0')}(${weekday})`;
      case 'future':
        // 오늘 이후 삭제 - 정기기록 원본 시작일 계산 필요
        const { startYear: futureStartYear, startMonth: futureStartMonth, editYear: futureEditYear, editMonth: futureEditMonth, totalMonths: futureTotalMonths } = calcPeriod(editData, totalMonths);
        const { actualEndYear: futureActualEndYear, actualEndMonth: futureActualEndMonth } = calcEndDate(futureStartYear, futureStartMonth, futureTotalMonths);
        
        // 첫 번째 데이터(정기 기록 시작일)인지 확인
        const isFirstData = futureEditYear === futureStartYear && futureEditMonth === futureStartMonth;
        
        if (isFirstData) {
          // 첫 번째 데이터에서는 전체 삭제와 동일
          const futureStartPeriod = `${String(futureStartYear).slice(-2)}/${String(futureStartMonth).padStart(2, '0')}`;
          const futureEndPeriod = `${String(futureActualEndYear).slice(-2)}/${String(futureActualEndMonth).padStart(2, '0')}`;
          return `기간 : ${futureStartPeriod} - ${futureEndPeriod}`;
        } else {
          // 나머지 데이터에서는 현재 편집 중인 날짜부터 정기 기록의 실제 마지막까지
          const deleteStartPeriod = `${String(futureEditYear).slice(-2)}/${String(futureEditMonth).padStart(2, '0')}`;
          const futureEndPeriod = `${String(futureActualEndYear).slice(-2)}/${String(futureActualEndMonth).padStart(2, '0')}`;
          
          return `기간 : ${deleteStartPeriod} - ${futureEndPeriod}`;
        }
      default:
        // 기본값 - 전체 삭제와 동일
        const { startYear: defaultStartYear, startMonth: defaultStartMonth, totalMonths: defaultTotalMonths } = calcPeriod(editData, totalMonths);
        const { actualEndYear: defaultActualEndYear, actualEndMonth: defaultActualEndMonth } = calcEndDate(defaultStartYear, defaultStartMonth, defaultTotalMonths);
        const defaultStartPeriod = `${String(defaultStartYear).slice(-2)}/${String(defaultStartMonth).padStart(2, '0')}`;
        const defaultEndPeriod = `${String(defaultActualEndYear).slice(-2)}/${String(defaultActualEndMonth).padStart(2, '0')}`;
        return `기간 : ${defaultStartPeriod} - ${defaultEndPeriod}`;
    }
  };

  // 정기 기록 삭제 옵션별 금액 계산
  const getDeleteAmount = () => {
    if ((!editData?.isRecurring && !editData?.isInstallment) || !amount) return '0원';
    
    const baseAmount = Number(amount.replace(/,/g, ''));
    if (isNaN(baseAmount)) return '0원';
    
    switch (deleteOption) {
      case 'all':
        // 전체 기간의 금액 합산 - 실제 존재하는 기록만 계산
        if (editData.isInstallment) {
          // 할부 기록: 실제 기록들의 금액 합산 사용 (각 기록 금액이 다를 수 있음)
          // 계산이 완료되지 않았으면 기다림
          if (actualTotalAmount > 0) {
            return `${actualTotalAmount.toLocaleString()}원`;
          } else {
            // 계산 중에는 실제 금액 대기
            return '계산 중...';
          }
        } else {
          // 정기 기록: 개수 * 금액
          const { startYear: allStartYear, startMonth: allStartMonth, totalMonths: allTotalMonths } = calcPeriod(editData, totalMonths);
          const recordCount = actualRecordCount > 0 ? actualRecordCount : allTotalMonths;
          return `${(baseAmount * recordCount).toLocaleString()}원`;
        }
      case 'today':
        // 오늘 날짜의 금액만 - 정기기록 원본 시작일 계산 불필요
        return `${baseAmount.toLocaleString()}원`;
      case 'future':
        // 오늘 이후의 금액 합산
        if (editData.isInstallment) {
          // 할부 기록: 실제 기록들의 금액 합산 사용
          // 계산이 완료되지 않았으면 기다림
          if (actualFutureAmount > 0) {
            return `${actualFutureAmount.toLocaleString()}원`;
          } else {
            // 계산 중에는 실제 금액 대기
            return '계산 중...';
          }
        } else {
          // 정기 기록: 계산
          const { startYear: futureStartYear, startMonth: futureStartMonth, editYear: futureEditYear, editMonth: futureEditMonth, totalMonths: futureTotalMonths } = calcPeriod(editData, totalMonths);
          
          // 첫 번째 데이터(정기 기록 시작일)인지 확인
          const isFirstData = futureEditYear === futureStartYear && futureEditMonth === futureStartMonth;
          
          if (isFirstData) {
            // 첫 번째 데이터에서는 전체 삭제와 동일 (실제 기록 개수 사용)
            const recordCount = actualRecordCount > 0 ? actualRecordCount : futureTotalMonths;
            return `${(baseAmount * recordCount).toLocaleString()}원`;
          } else {
            // 나머지 데이터에서는 현재 편집 중인 날짜부터 정기 기록의 실제 마지막까지 계산
            let futureMonths = 0;
            
            // 유틸리티 함수 사용
            const { actualEndYear, actualEndMonth } = calcEndDate(futureStartYear, futureStartMonth, futureTotalMonths);
            
            // 현재 편집 중인 날짜부터 정기 기록의 실제 마지막까지 계산
            for (let year = futureStartYear; year <= actualEndYear; year++) {
              const startM = (year === futureStartYear) ? futureStartMonth : 1;
              const endM = (year === actualEndYear) ? actualEndMonth : 12;
              
              
              for (let month = startM; month <= endM; month++) {
                // 현재 편집 중인 날짜부터 정기 기록의 실제 마지막까지 포함
                const isFutureMonth = year > futureEditYear || (year === futureEditYear && month >= futureEditMonth);
                if (isFutureMonth) {
                  futureMonths++;
                } else {
                }
              }
            }
            
            const totalAmount = baseAmount * futureMonths;
            
            return `${totalAmount.toLocaleString()}원`;
          }
        }
      default:
        return `${baseAmount.toLocaleString()}원`;
    }
  };

  const categoryDisplay = category ? `${getCategoryEmoji(category)} ${category}` : '';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.staticWhite }]} edges={['top']}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      <TopNavigation
        type="sub"
        title={mode === 'edit' ? '소비내역 수정' : '소비 기록'}
        showLeftIcon
        onLeftIconPress={handleBack}
      />

      <View style={[styles.content, { backgroundColor: colors.fill }]}>
        <ScrollView 
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent, 
            { paddingBottom: keyboardHeight > 0 ? keyboardHeight + 16 - insets.bottom : 16 }
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
            {/* 소비 정보 - 수정 모드에서만 표시 */}
            {mode === 'edit' && (
              <View style={[styles.section, { paddingTop: 24 }]}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
                    소비 정보
                  </Text>
                  <Pressable onPress={() => {
                    // 통합 삭제 모달만 사용 (유형과 무관하게 동일 플로우)
                    setShowDeleteConfirm(true);
                  }}>
                    <Text style={[styles.deleteText, { color: colors.statusNegative }]}>
                      삭제
                    </Text>
                  </Pressable>
                </View>
                
                <View style={[styles.expenseInfoCard, { backgroundColor: colors.staticWhite }]}>
                  <View style={styles.expenseInfoContent}>
                    <View style={styles.expenseInfoLeft}>
                      <View style={styles.expenseInfoTop}>
                        <Text style={[styles.expenseCategory, { color: colors.text }]}>
                          {categoryDisplay || '카테고리'}
                        </Text>
                      </View>
                      <View style={styles.expenseInfoBottom}>
                        <Text style={[styles.expenseDate, { color: colors.textAssistive }]}>
                          {date || '날짜'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.expenseInfoRight}>
                      <View style={styles.expenseInfoTop}>
                        <Text 
                          style={[styles.expenseAmount, { color: colors.text }]}
                          adjustsFontSizeToFit={true}
                          numberOfLines={1}
                          minimumFontScale={0.5}
                        >
                          {amount && !isNaN(Number(amount.replace(/,/g, ''))) ? `${Number(amount.replace(/,/g, '')).toLocaleString()}원` : '0원'}
                        </Text>
                      </View>
                      <View style={styles.expenseInfoBottom}>
                        <Text style={[styles.expenseMemo, { color: colors.textAssistive }]}>
                          {memo || '메모 없음'}
                        </Text>
                      </View>
                    </View>
                  </View>
                  
                  {/* 할부 기록인 경우 선결제/환불 처리 UI */}
                  {editData?.isInstallment && (
                    <>
                      <View style={[styles.expenseInfoDivider, { backgroundColor: colors.border }]} />
                      <View style={styles.prepaymentRefundRow}>
                        {editData?.isRefunded ? (
                          // 환불 처리된 경우: 환불 처리날짜와 복구 버튼 표시
                          <>
                            <Text style={[styles.prepaymentRefundLabel, { color: colors.textAssistive }]}>
                              환불 처리날짜 : {editData?.refundedAt 
                                ? formatRefundDate(editData.refundedAt)
                                : formatRefundDate(new Date().toISOString())
                              }
                            </Text>
                            <Pressable 
                              style={styles.prepaymentRefundButton}
                              onPress={() => {
                                // 환불 처리 복구 모달 열기
                                setShowRefundRestore(true);
                              }}
                            >
                              <Text style={[styles.prepaymentRefundText, { color: colors.textAssistive }]}>
                                환불 처리 복구
                              </Text>
                            </Pressable>
                          </>
                        ) : (
                          // 일반 할부 기록인 경우: 선결제/환불 처리 버튼 표시
                          <>
                            <Text style={[styles.prepaymentRefundLabel, { color: colors.textAssistive }]}>
                              선결제·환불 미적용
                            </Text>
                            <View style={styles.prepaymentRefundActions}>
                              <Pressable 
                                style={[styles.prepaymentRefundButton, { marginLeft: 0 }]}
                                onPress={() => {
                                  // 선결제 모달 열기
                                  setShowPrepaymentModal(true);
                                }}
                              >
                                <Text style={[styles.prepaymentRefundText, { color: colors.textAssistive }]}>
                                  선결제 처리
                                </Text>
                              </Pressable>
                              <Pressable 
                                style={styles.prepaymentRefundButton}
                                onPress={() => {
                                  // 환불 처리 모달 열기
                                  setShowRefundOptions(true);
                                }}
                              >
                                <Text style={[styles.prepaymentRefundText, { color: colors.textAssistive }]}>
                                  환불 처리
                                </Text>
                              </Pressable>
                            </View>
                          </>
                        )}
                      </View>
                    </>
                  )}
                </View>
              </View>
            )}

            {/* 카테고리 */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
                카테고리 <Text style={{ color: '#EF5252' }}>*</Text>
              </Text>
              <Input
                value={categoryDisplay}
                placeholder="카테고리 선택"
                showRightArrow={true}
                buttonMode={true}
                disabled={mode === 'edit' && (editData?.isRecurring || editData?.isInstallment)}
                onPress={handleCategoryPress}
                style={styles.categoryInput}
              />
            </View>

            {/* 날짜 */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
                  날짜 <Text style={{ color: '#EF5252' }}>*</Text>
                </Text>
                {(isRecurring || isInstallment) && (
                  <Text style={[styles.currentYearMonth, { color: colors.textAssistive }]}>
                    {mode === 'edit' && (editData?.isRecurring || editData?.isInstallment) && (editData?.recurringId || editData?.installmentId) ? (
                      // 수정 모드: 최초 생성년월 표시 (recurringId/installmentId는 timestamp)
                      (() => {
                        const idToUse = editData.isRecurring ? editData.recurringId : editData.installmentId;
                        const originalDate = new Date(Number(idToUse));
                        const originalYear = originalDate.getFullYear();
                        const originalMonth = String(originalDate.getMonth() + 1).padStart(2, '0');
                        return `최초 생성년월 : ${originalYear}/${originalMonth}`;
                      })()
                    ) : (
                      // 생성 모드: 선택한 날짜의 년월 표시
                      (() => {
                        const [selectedYear, selectedMonth] = date.split('.').map(Number);
                        return `선택한 생성년월 : ${selectedYear}/${String(selectedMonth).padStart(2, '0')}`;
                      })()
                    )}
                  </Text>
                )}
              </View>
              {(isRecurring || isInstallment) ? (
                <View style={[styles.recurringDateContainer, { backgroundColor: colors.staticWhite, borderColor: colors.border }]}>
                  <View style={styles.recurringDateLeft}>
                    <Text style={[styles.recurringDateLabel, { color: colors.text }]}>
                      생성일 기준 매달
                    </Text>
                  </View>
                  <View style={styles.recurringDateRight}>
                    <Pressable
                      style={styles.dayPickerButton}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowDayPicker(true);
                      }}
                    >
                      <Text style={[styles.dayPickerText, { color: colors.textAssistive }]}>
                        {(() => {
                          // 정기 지출 수정 모드: 실제 저장된 날짜 기준으로 요일 표시
                          if (mode === 'edit' && editData?.isRecurring && date) {
                            const [year, month, day] = date.split('.').map(Number);
                            const dateObj = new Date(year, month - 1, day);
                            const actualDayOfWeek = dateObj.getDay();
                            const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
                            const actualDayOfWeekLabel = weekdays[actualDayOfWeek];

                            return `${day}일(${actualDayOfWeekLabel})`;
                          }
                          
                          // 일반 모드: selectedDay 기준으로 요일 계산
                          const today = new Date();
                          const year = today.getFullYear();
                          const month = today.getMonth() + 1;
                          
                          const dateObj = new Date(year, month - 1, selectedDay);
                          const actualDayOfWeek = dateObj.getDay();
                          const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
                          const actualDayOfWeekLabel = weekdays[actualDayOfWeek];
                          
                          return `${selectedDay}일(${actualDayOfWeekLabel})`;
                        })()}
                      </Text>
                      <Icon name="arrowRight" variant="line" size={24} color={colors.staticBlack} />
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Input
                  variant="line"
                  icon="calendarMonth"
                  value={(() => {
                    if (!date) return '';
                    const [year, month, day] = date.split('.').map(d => parseInt(d, 10));
                    if (isNaN(year) || isNaN(month) || isNaN(day)) return date;
                    
                    // 실제 날짜의 요일 계산 (수정하려는 날짜 기준)
                    const dateObj = new Date(year, month - 1, day);
                    const actualDayOfWeek = dateObj.getDay();
                    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
                    const actualDayOfWeekLabel = weekdays[actualDayOfWeek];
                    
                    // 날짜 입력 필드 요일 계산
                    
                    return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}(${actualDayOfWeekLabel})`;
                  })()}
                  editable={false}
                  placeholder="날짜 선택"
                  onPress={handleDatePress}
                />
              )}
            </View>

            {/* 금액 */}
            <View 
              style={styles.section}
            >
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
                  금액 <Text style={{ color: '#EF5252' }}>*</Text>
                </Text>
              </View>
              
              {/* 정기 지출 ON 또는 할부 옵션 ON 시 기간 설정과 금액 입력 필드를 한 행에 배치 */}
              {(isRecurring || isInstallment) && (
                <View style={styles.recurringAmountRow}>
                  {/* 기간 설정 */}
                  <Selectbox
                    disabled={mode === 'edit' && (editData?.isRecurring || editData?.isInstallment)}
                    options={[
                      { label: '2개월', value: '2' },
                      { label: '3개월', value: '3' },
                      { label: '4개월', value: '4' },
                      { label: '5개월', value: '5' },
                      { label: '6개월', value: '6' },
                      { label: '12개월', value: '12' },
                    ]}
                    value={totalMonths.toString()}
                    placeholder="개월수 선택"
                    title="개월 수 선택"
                    onPress={() => {
                      // 정기 기록 또는 할부 기록 수정 모드에서는 개월수 변경 불가
                      const isDisabled = mode === 'edit' && (editData?.isRecurring || editData?.isInstallment);

                      if (isDisabled) {
                        if (__DEV__) {
                        }
                        setRecurringToastMessage('변경할 수 없습니다. 새로 생성해 주세요.');
                        setShowRecurringToast(true);
                      }
                      // Selectbox의 자체 모달을 사용하므로 추가 동작 불필요
                    }}
                    onValueChange={(value) => {
                      if (mode !== 'edit' || !(editData?.isRecurring || editData?.isInstallment)) {
                        if (__DEV__) {
                        }
                        setTotalMonths(parseInt(value, 10));
                      }
                    }}
                    style={styles.periodSelectInput}
                  />
                  
                  {/* 통합 금액 입력 필드 */}
                  <Input
                    variant="line"
                    inputType="number"
                    unit="원"
                    value={amount || '0'}
                    onChangeText={handleAmountChange}
                    keyboardType="numeric"
                    placeholder="0"
                    textAlign="right"
                    disabled={mode === 'edit' && (editData?.isRecurring || editData?.isInstallment)}
                    onPress={() => {
                      // 정기 기록 또는 할부 기록 수정 모드에서는 금액 변경 불가
                      const isDisabled = mode === 'edit' && (editData?.isRecurring || editData?.isInstallment);

                      if (isDisabled) {
                        setRecurringToastMessage('변경할 수 없습니다. 새로 생성해 주세요.');
                        setShowRecurringToast(true);
                        return;
                      }

                    }}
                    style={styles.installmentAmountInput}
                  />
                </View>
              )}
              
              {/* 메인 금액 입력 필드 (정기 지출 OFF이고 할부 옵션 OFF일 때만 표시) */}
              {!isRecurring && !isInstallment && (
                <View>
                <Input
                  variant="line"
                  inputType="number"
                  unit="원"
                  value={amount || '0'}
                  onChangeText={handleAmountChange}
                  keyboardType="numeric"
                  placeholder="0"
                  textAlign="right"
                  
                />
                </View>
              )}
            </View>

          {/* 소비 형태 */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
              소비 형태
            </Text>
            <View style={[styles.card, { backgroundColor: colors.staticWhite }]}>
              {/* 정기 지출 여부 */}
              <View style={styles.recurringSection}>
                <View style={styles.recurringTitleRow}>
                  <Text style={[styles.switchLabel, { color: colors.text }]}>
                    정기 지출 여부
                  </Text>
                  <Pressable
                    onPress={() => {
                      // 정기/할부 기록 수정 모드에서 disabled된 토글 클릭 시 토스트 표시
                      const isDisabled = mode === 'edit' && (editData?.isRecurring || editData?.isInstallment);
                      if (isDisabled && editData?.isRecurring) {
                        setRecurringToastMessage('정기 지출로 생성된 내역은 해제할 수 없습니다.');
                        setShowRecurringToast(true);
                        return;
                      }
                      if (isDisabled && editData?.isInstallment) {
                        setRecurringToastMessage('할부 기록이므로 사용할 수 없습니다.');
                        setShowRecurringToast(true);
                        return;
                      }
                    }}
                  >
                    <Switch
                      value={isRecurring}
                      onValueChange={(value) => {
                        // disabled 상태가 아니면 정상 동작
                        setIsRecurring(value);
                        if (!value) {
                          // 정기 지출 OFF 시 관련 상태 초기화
                          setTotalMonths(2);
                        } else {
                          // 정기 지출 ON 시 할부 옵션 끄기 (상호 배타적)
                          setIsInstallment(false);
                          // 정기 지출 ON 시 선택한 날짜의 일자로 selectedDay 설정
                          if (params.selectedDate) {
                            const selectedDateObj = new Date(params.selectedDate);
                            setSelectedDay(selectedDateObj.getDate());
                            
                          }
                        }
                      }}
                      disabled={mode === 'edit' && (editData?.isRecurring || editData?.isInstallment)}
                    />
                  </Pressable>
                </View>
                <Text style={[styles.recurringCaption, { color: colors.textAssistive }]}>
                  현재 월 기준 1년간 매달 같은 날에 기록합니다.
                </Text>
              </View>

              {/* Divider */}
              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* 할부 여부 */}
              <View style={styles.recurringSection}>
                <View style={styles.recurringTitleRow}>
                  <Text style={[styles.switchLabel, { color: colors.text }]}>
                    할부 여부
                  </Text>
                  <Pressable
                    onPress={() => {
                      // 정기/할부 기록 수정 모드에서 disabled된 토글 클릭 시 토스트 표시
                      const isDisabled = mode === 'edit' && (editData?.isRecurring || editData?.isInstallment);
                      if (isDisabled && editData?.isRecurring) {
                        setRecurringToastMessage('변경할 수 없습니다. 새로 생성해 주세요.');
                        setShowRecurringToast(true);
                        return;
                      }
                      if (isDisabled && editData?.isInstallment) {
                        setRecurringToastMessage('할부를 해제할 수 없습니다. 새로 생성해 주세요.');
                        setShowRecurringToast(true);
                        return;
                      }
                    }}
                  >
                    <Switch
                      value={isInstallment}
                      onValueChange={(value) => {
                        // disabled 상태가 아니면 정상 동작
                        setIsInstallment(value);
                        if (value) {
                          // 할부 옵션 ON 시 정기 옵션 끄기 (상호 배타적)
                          setIsRecurring(false);
                          // 할부 옵션 ON 시 선택한 날짜의 일자로 selectedDay 설정
                          if (params.selectedDate) {
                            const selectedDateObj = new Date(params.selectedDate);
                            setSelectedDay(selectedDateObj.getDate());
                          }
                        } else {
                          // 할부 옵션 OFF 시 관련 상태 초기화
                          setTotalMonths(2);
                        }
                      }}
                      disabled={mode === 'edit' && (editData?.isRecurring || editData?.isInstallment)}
                    />
                  </Pressable>
                </View>
                <Text style={[styles.recurringCaption, { color: colors.textAssistive }]}>
                  할부 기간동안 해당 소비금액을 자동 기록합니다.
                </Text>
              </View>

            </View>
          </View>

          {/* 기록일이 주말인 경우 (정기 지출 ON 또는 할부 옵션 ON이면 항상 표시) */}
          {(isRecurring || isInstallment) && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
                기록일이 주말인 경우
              </Text>
              <View style={[styles.card, { backgroundColor: colors.staticWhite }]}>
                {/* 관계없이 주말 기록 */}
                <Pressable 
                  style={styles.radioRow}
                  onPress={() => setWeekendOption('weekend')}
                >
                  <Text style={styles.weekendOptionText}>관계없이 주말 기록</Text>
                  <Radio
                    checked={weekendOption === 'weekend'}
                    onPress={() => setWeekendOption('weekend')}
                    label={false}
                  />
                </Pressable>

                {/* Divider */}
                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                {/* 금주 금요일 기록 */}
                <Pressable 
                  style={styles.radioRow}
                  onPress={() => setWeekendOption('friday')}
                >
                  <Text style={styles.weekendOptionText}>금주 금요일 기록</Text>
                  <Radio
                    checked={weekendOption === 'friday'}
                    onPress={() => setWeekendOption('friday')}
                    label={false}
                  />
                </Pressable>

                {/* Divider */}
                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                {/* 차주 월요일 기록 */}
                <Pressable 
                  style={styles.radioRow}
                  onPress={() => setWeekendOption('monday')}
                >
                  <Text style={styles.weekendOptionText}>차주 월요일 기록</Text>
                  <Radio
                    checked={weekendOption === 'monday'}
                    onPress={() => setWeekendOption('monday')}
                    label={false}
                  />
                </Pressable>
              </View>
            </View>
          )}

          {/* 메모 */}
          <View 
            style={styles.section}
            onLayout={(event) => {
              const layout = event.nativeEvent.layout;
              setMemoSectionY(layout.y);
            }}
          >
            <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
              메모
            </Text>
            <Input
              variant="area"
              value={memo}
              onChangeText={setMemo}
              placeholder="메모를 입력해 주세요.(최대 20자)"
              maxLength={20}
              multiline
              onFocus={handleMemoFocus}
            />
          </View>
          </ScrollView>
        </View>

        {/* 정기 기록 수정 시 기간 표기 및 수정 옵션 */}
        {mode === 'edit' && isRecurring && (
          <View style={[{ backgroundColor: '#ededed' }]}>
            <View style={styles.recurringSection}>
              <View style={styles.recurringTitleRow}>
                <Text style={[styles.switchLabel, { color: colors.text, fontSize: 14, fontWeight: '700' }]}>
                  기간 : {(() => {
                    if (editData?.isRecurring && editData?.recurringId) {
                      // 정기기록의 실제 원본 시작일 사용
                      const originalStartDate = new Date(Number(editData.recurringId));
                      const originalStartDateStr = `${originalStartDate.getFullYear()}.${String(originalStartDate.getMonth() + 1).padStart(2, '0')}.${String(originalStartDate.getDate()).padStart(2, '0')}`;
                      
                      return getRecurringPeriod(originalStartDateStr, totalMonths);
                    } else {
                      // 신규 생성 시에는 현재 선택된 날짜 사용
                      
                      return getRecurringPeriod(date, totalMonths);
                    }
                  })()}
                </Text>
                <View style={styles.regularityEditRadioGroup}>
                  <View style={styles.regularityEditRadio}>
                    <Radio
                      checked={editOption === 'all'}
                      onPress={() => setEditOption('all')}
                      label="전체 수정"
                    />
                  </View>
                  <View style={styles.regularityEditRadio}>
                    <Radio
                      checked={editOption === 'today'}
                      onPress={() => setEditOption('today')}
                      label="오늘만 수정"
                    />
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* 할부 기록 수정 시 기간 표기 및 수정 옵션 */}
        {/* 환불 처리된 할부 기록에서는 하단 기간 영역을 표시하지 않음 */}
        {mode === 'edit' && isInstallment && !editData?.isRefunded && (
          <View style={[{ backgroundColor: '#ededed' }]}>
            <View style={styles.recurringSection}>
              <View style={styles.recurringTitleRow}>
                <Text style={[styles.switchLabel, { color: colors.text, fontSize: 14, fontWeight: '700' }]}>
                  기간 : {(() => {
                    if (editData?.isInstallment && editData?.installmentId) {
                      // 할부기록의 실제 원본 시작일 사용
                      const originalStartDate = new Date(Number(editData.installmentId));
                      const originalStartDateStr = `${originalStartDate.getFullYear()}.${String(originalStartDate.getMonth() + 1).padStart(2, '0')}.${String(originalStartDate.getDate()).padStart(2, '0')}`;
                      
                      return getRecurringPeriod(originalStartDateStr, totalMonths);
                    } else {
                      // 신규 생성 시에는 현재 선택된 날짜 사용
                      
                      return getRecurringPeriod(date, totalMonths);
                    }
                  })()}
                </Text>
                <View style={styles.regularityEditRadioGroup}>
                  <View style={styles.regularityEditRadio}>
                    <Radio
                      checked={editOption === 'all'}
                      onPress={() => setEditOption('all')}
                      label="전체 수정"
                    />
                  </View>
                  <View style={styles.regularityEditRadio}>
                    <Radio
                      checked={editOption === 'today'}
                      onPress={() => setEditOption('today')}
                      label="오늘만 수정"
                    />
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* 하단 스티키 버튼 */}
        <View style={[
          styles.bottomButtonContainer, 
          { 
            backgroundColor: colors.staticWhite,
            paddingBottom: 16 + insets.bottom 
          }
        ]}>
          <Button onPress={handleConfirm}>
            {mode === 'edit' ? '저장' : '확인'}
          </Button>
        </View>

      

      {/* 카테고리 미선택 얼럿 */}
      <PrepaymentModal
        visible={showPrepaymentModal}
        categoryLabel={categoryDisplay ?? ''}
        amountText={(amount ? `${amount}원` : (editData?.amount ? `${Number(editData.amount).toLocaleString()}원` : ''))}
        periodText={`기간 : ${date}`}
        selectedDateLabel={date}
        onOpenDatePicker={() => {
          setTempSelectedDate(date.replace(/\./g, '-'));
          if (isOpeningDatePickerRef.current) return;
          isOpeningDatePickerRef.current = true;
          InteractionManager.runAfterInteractions(() => {
            requestAnimationFrame(() => {
              setShowDatePicker(true);
              // 약간의 시간 후 플래그 해제
              setTimeout(() => {
                isOpeningDatePickerRef.current = false;
              }, 100);
            });
          });
        }}
        onConfirm={() => {
          // TODO: 선결제 처리 확정 로직 연동
          setShowPrepaymentModal(false);
        }}
        onCancel={() => setShowPrepaymentModal(false)}
      />

      {/* 날짜 선택 바텀시트 (팝업 위에 보이도록 모달 순서상 뒤로 이동) */}
      {showDatePicker && (
        <ModalBottomsheet
          visible={true}
          title="소비 기록일 선택"
          onClose={handleDatePickerClose}
          closeOnBackdrop={true}
          contentStyle={styles.dateBottomsheetContent}
        >
        <CalendarDaySelect
          selectedDate={tempSelectedDate}
          onDayPress={(dateString) => {
            setTempSelectedDate(dateString);
          }}
          monthStartDay={monthStartDay}
        />
          
          <View style={styles.dateButtonArea}>
            <Pressable
              style={[styles.dateButton, { backgroundColor: colors.primary }]}
              onPress={handleDateConfirm}
            >
              <Text style={[styles.dateButtonText, { color: colors.staticWhite }]}>
                확인
              </Text>
            </Pressable>
          </View>
        </ModalBottomsheet>
      )}

      {/* 카테고리 미선택 얼럿 */}
      <ModalPopup
        visible={showCategoryAlert}
        onConfirm={() => setShowCategoryAlert(false)}
        confirmText="확인"
      >
        <Text style={[styles.alertText, { color: colors.text }]}>
          카테고리를 선택해 주세요.
        </Text>
      </ModalPopup>

      {/* 금액 미입력 얼럿 */}
      <ModalPopup
        visible={showAmountAlert}
        onConfirm={() => setShowAmountAlert(false)}
        confirmText="확인"
      >
        <Text style={[styles.alertText, { color: colors.text }]}>
          금액을 입력해 주세요.
        </Text>
      </ModalPopup>

      {/* 정기 지출 주말 확인 모달 */}
      <ModalPopup
        visible={showWeekendConfirm}
        title="정기 기록 주말여부 안내"
        onConfirm={async () => {
          setShowWeekendConfirm(false);
          await saveExpenseRecord();
        }}
        onCancel={() => setShowWeekendConfirm(false)}
        confirmText="확인"
        cancelText="취소"
      >
        <Text style={[styles.weekendConfirmText, { color: colors.textNeutral }]}>
          지정하신 날짜가 주말에 해당 됩니다.{'\n'}
          선택하신 옵션에 따라{'\n'}
          {`'${weekendOption === 'friday' ? '금주 금요일 기록' : weekendOption === 'monday' ? '차주 월요일 기록' : '관계없이 주말 기록'}'에 기록됩니다.`}{'\n'}
          진행하시겠어요?
        </Text>
      </ModalPopup>

      {/* 기간 선택은 이제 Selectbox를 사용하므로 DatePicker 제거됨 */}

      {/* 일반 삭제 확인 모달 */}
      <ModalPopup
        visible={showDeleteConfirm}
        title="소비내역 삭제"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        confirmText="삭제"
        cancelText="취소"
      >
        <Text style={[styles.deleteConfirmText, { color: colors.textNeutral }]}>
          이 소비내역을 삭제하시겠어요?{'\n'}
          삭제된 내역은 복구할 수 없습니다.
        </Text>
      </ModalPopup>

      {/* 정기 기록 삭제 확인 모달 */}
      <ModalPopup
        visible={showRecurringDeleteConfirm}
        title="소비 기록 안내"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowRecurringDeleteConfirm(false)}
        confirmText="확인"
        cancelText="취소"
      >
        <Text style={[styles.deleteConfirmText, { color: colors.textNeutral }]}>
          매달 마다 자동으로{'\n'}
          기록된 내역이 모두 삭제 됩니다.
        </Text>
      </ModalPopup>

      {/* 정기 기록 삭제 옵션 모달 */}
      <ModalPopup
        visible={showRecurringDeleteOptions}
        title="정기 지출 내역 삭제 안내"
        onConfirm={handleMultipleRecordsDelete}
        onCancel={() => setShowRecurringDeleteOptions(false)}
        confirmText="확인"
        cancelText="취소"
      >
        <View style={styles.deleteOptionsContainer}>
          <Text style={[styles.deleteOptionsDescription, { color: colors.textNeutral }]}>
            선택하신 사항에 따라{'\n'}정기 기록 내역이 삭제 됩니다.
          </Text>
          
          {/* 정기 기록 정보 카드 */}
          <View style={[styles.recurringInfoCard, { backgroundColor: colors.fill }]}>
            <View style={styles.recurringInfoRow}>
              <Text style={[styles.recurringCategory, { color: colors.text }]}>
                {categoryDisplay || '카테고리'}
              </Text>
              <Text style={[styles.recurringAmount, { color: colors.text }]}>
                {getDeleteAmount()}
              </Text>
            </View>
            <View style={styles.recurringPeriodRow}>
              <Text style={[styles.recurringPeriod, { color: colors.textAssistive }]}>
                {getDeletePeriod()}
              </Text>
            </View>
          </View>
          
          {/* 삭제 옵션들 */}
          <View style={[styles.deleteOptionsList, { backgroundColor: colors.fill }]}>
            {/* 전체 삭제 */}
            <Pressable 
              style={styles.deleteOptionItem}
              onPress={() => setDeleteOption('all')}
            >
              <View style={styles.deleteOptionContent}>
                <Text style={[styles.deleteOptionTitle, { color: colors.text }]}>
                  전체 삭제
                </Text>
                <Text style={[styles.deleteOptionDescription, { color: colors.textAssistive }]}>
                  정기 기록을 모두 삭제합니다.
                </Text>
              </View>
              <Radio
                checked={deleteOption === 'all'}
                onPress={() => setDeleteOption('all')}
              />
            </Pressable>
            
            <View style={[styles.deleteOptionDivider, { backgroundColor: colors.border }]} />
            
            {/* 오늘만 삭제 */}
            <Pressable 
              style={styles.deleteOptionItem}
              onPress={() => setDeleteOption('today')}
            >
              <View style={styles.deleteOptionContent}>
                <Text style={[styles.deleteOptionTitle, { color: colors.text }]}>
                  오늘만 삭제
                </Text>
                <Text style={[styles.deleteOptionDescription, { color: colors.textAssistive }]}>
                  해당 날짜만 삭제합니다.
                </Text>
              </View>
              <Radio
                checked={deleteOption === 'today'}
                onPress={() => setDeleteOption('today')}
              />
            </Pressable>
            
            <View style={[styles.deleteOptionDivider, { backgroundColor: colors.border }]} />
            
            {/* 오늘 이후 삭제 */}
            <Pressable 
              style={styles.deleteOptionItem}
              onPress={() => setDeleteOption('future')}
            >
              <View style={styles.deleteOptionContent}>
                <Text style={[styles.deleteOptionTitle, { color: colors.text }]}>
                  오늘을 포함한 이후의 기록 삭제
                </Text>
                <Text style={[styles.deleteOptionDescription, { color: colors.textAssistive }]}>
                  이전 기록은 유지하고 삭제합니다.
                </Text>
              </View>
              <Radio
                checked={deleteOption === 'future'}
                onPress={() => setDeleteOption('future')}
              />
            </Pressable>
          </View>
        </View>
      </ModalPopup>

      {/* 할부 기록 환불 처리 옵션 모달 */}
      <ModalPopup
        visible={showRefundOptions}
        title="할부 기록 환불 반영 안내"
        onConfirm={handleMultipleRecordsRefund}
        onCancel={() => setShowRefundOptions(false)}
        confirmText="확인"
        cancelText="취소"
      >
        <View style={styles.deleteOptionsContainer}>
          <Text style={[styles.deleteOptionsDescription, { color: colors.textNeutral }]}>
            선택하신 사항에 따라{'\n'}할부 기록 내역이 반영 됩니다.
          </Text>
          
          {/* 할부 기록 정보 카드 */}
          <View style={[styles.recurringInfoCard, { backgroundColor: colors.fill }]}>
            <View style={styles.recurringInfoRow}>
              <Text style={[styles.recurringCategory, { color: colors.text }]}>
                {categoryDisplay || '카테고리'}
              </Text>
              <Text style={[styles.recurringAmount, { color: colors.text }]}>
                {getRefundAmount()}
              </Text>
            </View>
            <View style={styles.recurringPeriodRow}>
              <Text style={[styles.recurringPeriod, { color: colors.textAssistive }]}>
                {getRefundPeriod()}
              </Text>
            </View>
          </View>
          
          {/* 환불 옵션들 */}
          <View style={[styles.deleteOptionsList, { backgroundColor: colors.fill }]}>
            {/* 전체 환불 */}
            <Pressable 
              style={styles.deleteOptionItem}
              onPress={() => setRefundOption('all')}
            >
              <View style={styles.deleteOptionContent}>
                <Text style={[styles.deleteOptionTitle, { color: colors.text }]}>
                  전체 환불
                </Text>
                <Text style={[styles.deleteOptionDescription, { color: colors.textAssistive }]}>
                  할부 기록을 모두 환불합니다.
                </Text>
              </View>
              <Radio
                checked={refundOption === 'all'}
                onPress={() => setRefundOption('all')}
              />
            </Pressable>
            
            <View style={[styles.deleteOptionDivider, { backgroundColor: colors.border }]} />
            
            {/* 오늘만 환불 */}
            <Pressable 
              style={styles.deleteOptionItem}
              onPress={() => setRefundOption('today')}
            >
              <View style={styles.deleteOptionContent}>
                <Text style={[styles.deleteOptionTitle, { color: colors.text }]}>
                  오늘만 환불
                </Text>
                <Text style={[styles.deleteOptionDescription, { color: colors.textAssistive }]}>
                  해당 날짜만 환불합니다.
                </Text>
              </View>
              <Radio
                checked={refundOption === 'today'}
                onPress={() => setRefundOption('today')}
              />
            </Pressable>
            
            <View style={[styles.deleteOptionDivider, { backgroundColor: colors.border }]} />
            
            {/* 오늘 포함한 이후의 기록 환불 */}
            <Pressable 
              style={styles.deleteOptionItem}
              onPress={() => setRefundOption('future')}
            >
              <View style={styles.deleteOptionContent}>
                <Text style={[styles.deleteOptionTitle, { color: colors.text }]}>
                  오늘 포함한 이후의 기록 환불
                </Text>
                <Text style={[styles.deleteOptionDescription, { color: colors.textAssistive }]}>
                  이전 기록은 유지하고 환불합니다.
                </Text>
              </View>
              <Radio
                checked={refundOption === 'future'}
                onPress={() => setRefundOption('future')}
              />
            </Pressable>
          </View>
        </View>
      </ModalPopup>

      {/* 환불 처리 복구 모달 */}
      <ModalPopup
        visible={showRefundRestore}
        title="환불 처리 복구 안내"
        onConfirm={handleRefundRestore}
        onCancel={() => setShowRefundRestore(false)}
        confirmText="확인"
        cancelText="취소"
      >
        <Text style={[styles.deleteConfirmText, { color: colors.textNeutral }]}>
          환불 처리된 해당 기록을{'\n'}
          최초 할부 기록일로 복구가 진행됩니다.
        </Text>
      </ModalPopup>

      {/* 변경사항 없음 모달 */}
      <ModalPopup
        visible={showNoChangesModal}
        onConfirm={() => setShowNoChangesModal(false)}
        confirmText="확인"
      >
        <Text style={[styles.alertText, { color: colors.text }]}>
          변경된 내용이 없습니다.
        </Text>
      </ModalPopup>

      {/* 정기 지출 해제 불가 토스트 */}
      <Toast
        visible={showRecurringToast}
        message={recurringToastMessage}
        onHide={() => setShowRecurringToast(false)}
      />

      {/* 카테고리 변경 불가 토스트 */}
      <Toast
        visible={showCategoryToast}
        message={categoryToastMessage}
        onHide={() => setShowCategoryToast(false)}
      />

      {/* 정기/할부 기록 수정 확인 모달 */}
      <ModalPopup
        visible={showEditConfirmModal}
        title="소비 기록 안내"
        onConfirm={async () => {
          setShowEditConfirmModal(false);
          await saveExpenseRecord();
        }}
        onCancel={() => setShowEditConfirmModal(false)}
        confirmText="확인"
        cancelText="취소"
      >
        <Text style={[styles.alertText, { color: colors.text }]}>
          {editConfirmMessage}
        </Text>
      </ModalPopup>

      {/* 환불 기록 저장 확인 모달 */}
      <ModalPopup
        visible={showRefundEditConfirmModal}
        title="소비 기록 안내"
        onConfirm={async () => {
          setShowRefundEditConfirmModal(false);
          await saveExpenseRecord();
        }}
        onCancel={() => setShowRefundEditConfirmModal(false)}
        confirmText="확인"
        cancelText="취소"
      >
        <Text style={[styles.alertText, { color: colors.text }]}>
          {refundEditConfirmMessage}
        </Text>
      </ModalPopup>

      {/* 일자 선택 네이티브 피커 */}
      <DatePicker
        visible={showDayPicker}
        onClose={() => setShowDayPicker(false)}
        title="일자 선택"
        dayOptions={Array.from({ length: 31 }, (_, i) => {
          const day = i + 1;
          
          // 수정 모드: 실제 저장된 데이터의 년월 기준으로 요일 계산
          let year, month;
          if (mode === 'edit' && editData?.date) {
            const normalizedDate = editData.date.replace(/-/g, '.');
            const [editYear, editMonth] = normalizedDate.split('.').map(Number);
            year = editYear;
            month = editMonth;
          } else {
            // 생성 모드: 현재 년월 기준
            const today = new Date();
            year = today.getFullYear();
            month = today.getMonth() + 1;
          }
          
          // 해당 년월의 날짜로 요일 계산
          const dateObj = new Date(year, month - 1, day);
          const actualDayOfWeek = dateObj.getDay();
          const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
          const actualDayOfWeekLabel = weekdays[actualDayOfWeek];
          
          return {
            label: `${day}일(${actualDayOfWeekLabel})`,
            value: day,
          };
        })}
        selectedDay={selectedDay}
        onDayChange={(day) => {
          setSelectedDay(day);
          // 선택한 일자로 날짜 업데이트
          // 오늘만 수정 모드: 실제 저장된 날짜의 년월 기준으로 일자만 변경
          let year, month;
          if (mode === 'edit' && editData?.date) {
            // 수정 모드: 실제 저장된 날짜의 년월 사용 (주말 조정 반영된 날짜)
            const normalizedDate = editData.date.replace(/-/g, '.');
            const [editYear, editMonth] = normalizedDate.split('.').map(Number);
            year = editYear;
            month = editMonth;

          } else {
            // 생성 모드: 현재 년월 사용
            const today = new Date();
            year = today.getFullYear();
            month = today.getMonth() + 1;
          }
          const actualDay = getActualDayForMonth(year, month, day);
          const newDate = `${year}.${String(month).padStart(2, '0')}.${String(actualDay).padStart(2, '0')}`;

          setDate(newDate);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    gap: 0,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 32,
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    ...Typography.body1.l.bold,
  },
  currentYearMonth: {
    ...Typography.body2.r.regular,
  },
  categoryInput: {
    // Input 컴포넌트가 자체 스타일을 가지고 있으므로 추가 스타일 불필요
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  recurringSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  recurringTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  switchLabel: {
    ...Typography.body1.l.regular,
  },
  recurringCaption: {
    ...Typography.body2.r.regular,
    marginTop: 0,
  },
  divider: {
    height: 1,
    alignSelf: 'stretch',
    marginHorizontal: 16,
  },
  radioRow: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weekendOptionText: {
    fontSize: 16,
    fontFamily: 'Pretendard',
    fontWeight: '400',
    lineHeight: 24,
    color: '#222222',
  },
  amountInput: {
    flex: 1,
  },
  pickerModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  pickerModalContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  headerButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    minWidth: 60,
  },
  cancelButton: {
    fontSize: 17,
    fontFamily: 'Pretendard',
    fontWeight: '400',
  },
  pickerTitle: {
    fontSize: 17,
    fontFamily: 'Pretendard',
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  doneButton: {
    fontSize: 17,
    fontFamily: 'Pretendard',
    fontWeight: '600',
    textAlign: 'right',
  },
  pickerRow: {
    flexDirection: 'row',
    width: '100%',
  },
  picker: {
    width: '100%',
    height: 216,
  },
  dateBottomsheetContent: {
    padding: 0,
  },
  dateButtonArea: {
    padding: 16,
  },
  dateButton: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateButtonText: {
    ...Typography.body1.l.medium,
  },
  bottomButtonContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  alertText: {
    ...Typography.body1.l.regular,
    textAlign: 'center',
  },
  weekendConfirmText: {
    ...Typography.body1.l.regular,
    textAlign: 'center',
    lineHeight: 24,
  },
  // 새로운 스타일들
  installmentButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  installmentText: {
    ...Typography.body2.r.medium,
    fontSize: 14,
  },
  recurringAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recurringAmountContainer: {
    gap: 12,
  },
  periodSelectRow: {
    marginTop: 12,
  },
  periodSelectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
    height: 48,
    width: 100,
  },
  periodSelectText: {
    ...Typography.body1.l.medium,
  },
  periodSelectInput: {
    width: 100,
    height: 48,
  },
  installmentAmountInput: {
    flex: 1,
    minWidth: 200,
  },
  recurringAmountInput: {
    width: '100%',
  },
  installmentAmountContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(54, 100, 206, 0.05)',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  installmentAmountLabel: {
    ...Typography.body2.r.medium,
  },
  installmentAmountValue: {
    ...Typography.body1.l.bold,
    fontSize: 16,
  },
  // 정기 지출 날짜 선택 스타일
  recurringDateContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    height: 48,
  },
  recurringDateLeft: {
    flex: 1,
  },
  recurringDateLabel: {
    ...Typography.body1.l.regular,
  },
  recurringDateRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayPickerText: {
    ...Typography.body1.l.regular,
  },
  // 소비 정보 카드 스타일
  deleteText: {
    ...Typography.body1.l.regular,
    textDecorationLine: 'underline',
  },
  expenseInfoCard: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  expenseInfoContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  expenseInfoLeft: {
    flex: 0.55,
  },
  expenseInfoRight: {
    flex: 0.45,
    alignItems: 'flex-end',
  },
  expenseInfoTop: {
    marginBottom: 8,
  },
  expenseInfoBottom: {
    // No additional styles needed
  },
  expenseInfoDivider: {
    height: 1,
    width: '100%',
    // opacity 제거 - colors.border에 이미 투명도가 포함되어 있음 (rgba(144,146,158,0.16))
  },
  prepaymentRefundRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prepaymentRefundLabel: {
    ...Typography.body1.l.regular,
  },
  prepaymentRefundActions: {
    flexDirection: 'row',
  },
  prepaymentRefundButton: {
    paddingVertical: 0,
    marginLeft: 12,
  },
  prepaymentRefundText: {
    ...Typography.body1.l.regular,
    textDecorationLine: 'underline',
  },
  expenseCategory: {
    ...Typography.body1.l.bold,
    fontSize: 21,
    lineHeight: 31.5,
  },
  expenseDate: {
    ...Typography.body2.r.regular,
  },
  expenseAmount: {
    ...Typography.body1.l.bold,
    fontSize: 21,
    lineHeight: 31.5,
  },
  expenseMemo: {
    ...Typography.body2.r.regular,
    textAlign: 'right',
  },
  deleteConfirmText: {
    ...Typography.body1.l.regular,
    textAlign: 'center',
    lineHeight: 24,
  },
  // 정기 기록 수정 옵션 스타일
  regularityEditOptions: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    height: 48,
    justifyContent: 'center',
  },
  regularityEditHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: '100%',
  },
  regularityPeriodText: {
    ...Typography.body2.r.bold,
    fontSize: 14,
    lineHeight: 21,
  },
  regularityEditRadioGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  regularityEditRadio: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // 정기 기록 삭제 옵션 모달 스타일
  deleteOptionsContainer: {
    gap: 16,
  },
  deleteOptionsDescription: {
    ...Typography.body1.l.regular,
    textAlign: 'center',
    lineHeight: 24,
  },
  recurringInfoCard: {
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  recurringInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recurringCategory: {
    ...Typography.body1.l.bold,
    fontSize: 16,
    lineHeight: 24,
  },
  recurringAmount: {
    ...Typography.body1.l.bold,
    fontSize: 16,
    lineHeight: 24,
  },
  recurringPeriodRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  recurringPeriod: {
    ...Typography.body2.r.regular,
    fontSize: 14,
    lineHeight: 21,
  },
  deleteOptionsList: {
    borderRadius: 16,
    padding: 0,
    overflow: 'hidden',
  },
  deleteOptionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  deleteOptionContent: {
    flex: 1,
    gap: 4,
  },
  deleteOptionTitle: {
    ...Typography.body1.l.medium,
    fontSize: 16,
    lineHeight: 24,
  },
  deleteOptionDescription: {
    ...Typography.body1.l.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  deleteOptionDivider: {
    height: 1,
    marginHorizontal: 20,
  },
});

