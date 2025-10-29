/**
 * Expense Record Screen
 * 
 * Allows users to create or edit an expense record.
 * Supports both create and edit modes.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { CalendarDaySelect } from '@/components/ui/calendar-day-select';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { ModalBottomsheet } from '@/components/ui/modal-bottomsheet';
import { ModalPopup } from '@/components/ui/modal-popup';
import { Radio } from '@/components/ui/radio';
import { Selectbox } from '@/components/ui/selectbox';
import { Switch } from '@/components/ui/switch';
import { Toast } from '@/components/ui/toast';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { triggerChallengeNotifications } from '@/utils/challenge-utils';
import { getCustomMonthInfo } from '@/utils/custom-month';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
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
const calcPeriod = (editData: any, recurringMonths: number) => {
  // 정기기록의 실제 원본 시작일은 recurringId(timestamp)를 기준으로 계산
  const originalStartDate = new Date(Number(editData.recurringId));
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
    totalMonths: recurringMonths,
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
        
        debugLog('🔍 [삭제필터] 오늘만 삭제 비교:', {
          recordDate: record.date,
          editDate: editDate.toISOString(),
          editYear,
          editMonth,
          editDay,
          result
        });
        
        return result;
      } else {
        const result = isSameDate(record.date, currentDate);
        
        debugLog('🔍 [삭제필터] 오늘만 삭제 비교 (현재날짜):', {
          recordDate: record.date,
          currentDate: currentDate.toISOString(),
          result
        });
        
        return result;
      }
    case 'future':
      // record.date는 "2025.11.20" 형식이므로 올바르게 파싱
      const recordDateStr = record.date.replace(/\./g, '-');
      const recordDate = new Date(recordDateStr);
      
      // 편집 중인 날짜가 있으면 그 날짜를 기준으로, 없으면 현재 날짜를 기준으로
      const baseYear = editYear || currentDate.getFullYear();
      const baseMonth = editMonth || (currentDate.getMonth() + 1);
      
      const isFirstData = baseYear === startYear && baseMonth === startMonth;
      
      if (isFirstData) {
        debugLog('🔍 [삭제필터] 첫 번째 데이터 - 전체 삭제:', {
          recordDate: record.date,
          baseYear,
          baseMonth,
          startYear,
          startMonth
        });
        return true; // 첫 번째 데이터에서는 전체 삭제와 동일
      } else {
        // 편집 중인 날짜 이후의 기록만 삭제
        const editDate = new Date(baseYear, baseMonth - 1, 1);
        const shouldDelete = recordDate >= editDate;
        
        debugLog('🔍 [삭제필터] 날짜 비교:', {
          recordDate: record.date,
          recordDateStr,
          recordDateISO: recordDate.toISOString(),
          baseYear,
          baseMonth,
          editDate: editDate.toISOString(),
          shouldDelete
        });
        
        return shouldDelete;
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
  const [recurringMonths, setRecurringMonths] = useState<number>(2); // 2개월~12개월
  const [isAmountSplit, setIsAmountSplit] = useState<boolean>(false); // 금액 분할하기
  const [weekendOption, setWeekendOption] = useState<'weekend' | 'friday' | 'monday'>('weekend');
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [monthStartDay, setMonthStartDay] = useState(1);
  const [showDayPicker, setShowDayPicker] = useState<boolean>(false);
  const [tempSelectedDate, setTempSelectedDate] = useState<string>(date.replace(/\./g, '-'));
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
  const [showPeriodNativePicker, setShowPeriodNativePicker] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [showRecurringDeleteConfirm, setShowRecurringDeleteConfirm] = useState<boolean>(false);
  const [showNoChangesModal, setShowNoChangesModal] = useState<boolean>(false);
  const [showEditConfirmModal, setShowEditConfirmModal] = useState<boolean>(false);
  const [editConfirmMessage, setEditConfirmMessage] = useState<string>('');
  const [showRecurringToast, setShowRecurringToast] = useState<boolean>(false);
  const [recurringToastMessage, setRecurringToastMessage] = useState<string>('');
  const [showCategoryToast, setShowCategoryToast] = useState<boolean>(false);
  const [categoryToastMessage, setCategoryToastMessage] = useState<string>('');
  
  // 정기 기록 삭제 옵션 모달
  const [showRecurringDeleteOptions, setShowRecurringDeleteOptions] = useState<boolean>(false);
  const [deleteOption, setDeleteOption] = useState<'all' | 'today' | 'future'>('all');
  
  // 토스트 state 변경 감지
  useEffect(() => {
    // 토스트 표시 시 필요한 로직이 있다면 여기에 추가
  }, [showRecurringToast]);
  
  // 정기 기록 수정 옵션
  const [editOption, setEditOption] = useState<'all' | 'today'>('all'); // 'all': 전체 수정, 'today': 오늘만 수정
  
  // 실제 존재하는 기록 개수 (삭제된 기록 제외)
  const [actualRecordCount, setActualRecordCount] = useState<number>(0);
  
  // Keyboard height tracking
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  // Section/Input position tracking
  // Remove amount auto-scroll states per request
  const [memoSectionY, setMemoSectionY] = useState(0);
  
  // 월 시작일 로드
  useEffect(() => {
    const loadMonthStart = async () => {
      const startDay = await loadMonthStartDay();
      debugLog('📅 [월시작일] 로드된 월 시작일:', { startDay });
      setMonthStartDay(startDay);
    };
    loadMonthStart();
  }, []);
  
  // 실제 존재하는 기록 개수 계산 (삭제된 기록 제외)
  useEffect(() => {
    const calculateActualRecordCount = async () => {
      if (mode === 'edit' && editData?.isRecurring && editData?.recurringId) {
        try {
          const storedData = await AsyncStorage.getItem('calendarData');
          if (!storedData) return;
          
          const calendarData = JSON.parse(storedData);
          const recurringId = editData.recurringId;
          let actualCount = 0;
          
          Object.keys(calendarData).forEach(dateKey => {
            if (calendarData[dateKey].records) {
              const relatedRecords = calendarData[dateKey].records.filter(
                (r: any) => r.recurringId === recurringId && !r.isDeleted
              );
              actualCount += relatedRecords.length;
            }
          });
          
          debugLog('🔍 [실제기록개수] 계산:', {
            recurringId,
            actualCount
          });
          
          setActualRecordCount(actualCount);
        } catch (error) {
          debugLog('❌ [실제기록개수] 계산 실패:', error);
        }
      }
    };
    
    calculateActualRecordCount();
  }, [mode, editData, deleteOption]);

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
      // 정기 기록 개월수 설정 (정기 기록이든 분할 기록이든 모두 설정)
      let finalRecurringMonths = editData.recurringMonths || 2;

      setRecurringMonths(finalRecurringMonths);
      
      // recurringMonths가 없는 경우, recurringId로 관련 기록들을 찾아서 개월수 추론
      if (editData.isRecurring && !editData.recurringMonths && editData.recurringId) {
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

              setRecurringMonths(relatedRecordsCount);
            }
          } catch (error) {

          }
        };
        
        inferRecurringMonths();
      }
      // 정기 기록의 경우 originalAmountSplit 값이 있으면 그것을 사용, 없으면 isAmountSplit 사용
      // isAmountSplit이 undefined인 경우 금액을 통해 분할 기록인지 판단
      let amountSplitValue = false;
      if (editData.isRecurring) {
        if (editData.originalAmountSplit !== undefined) {
          amountSplitValue = editData.originalAmountSplit;
        } else if (editData.isAmountSplit === true) {
          amountSplitValue = true;
        } else {
          // 금액을 통해 분할 기록인지 판단
          const currentAmount = Number(editData.amount);
          const months = editData.recurringMonths || 2;
          // 분할 기록의 경우 현재 금액이 월별 분할 금액이므로, 
          // 이를 개월 수로 곱했을 때 원래 금액이 나와야 함
          // 하지만 정확한 원래 금액을 알 수 없으므로, 
          // 현재 금액이 월별 분할 금액처럼 보이는지 확인
          const isLikelySplit = months > 1 && currentAmount > 0;
          amountSplitValue = isLikelySplit;

        }
      } else {
        amountSplitValue = editData.isAmountSplit === true;
      }
      setIsAmountSplit(amountSplitValue);

      setWeekendOption(editData.weekendOption || 'weekend');
      
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

  // 정기 기록 전체 수정 (기존 데이터 삭제 후 새로 생성)
  const handleRecurringBulkUpdate = async (
    calendarData: any, 
    editData: any, 
    newRecord: any, 
    actualDateKey: string, 
    monthlyAmount: number,
    expenseAmount: number
  ) => {
    debugLog('🔄 [전체수정] 시작:', {
      editDataDate: editData.date,
      actualDateKey,
      monthlyAmount,
      expenseAmount,
      recurringId: editData.recurringId
    });

    // 1. 최초 생성 날짜 찾기 (삭제 전에 찾아야 함)
    const recurringId = editData.recurringId;
    let originalDate = actualDateKey;
    if (recurringId) {
      Object.keys(calendarData).forEach(dateKey => {
        if (calendarData[dateKey].records) {
          const relatedRecords = calendarData[dateKey].records.filter(
            (r: any) => r.recurringId === recurringId
          );
          if (relatedRecords.length > 0) {
            // 가장 오래된 날짜 찾기 (실제 날짜 기준)
            const currentDateKey = dateKey;
            const currentDate = new Date(currentDateKey);
            const originalDateObj = new Date(originalDate);
            
            if (currentDate < originalDateObj) {
              originalDate = dateKey;
            }
          }
        }
      });
    }
    
    debugLog('🔄 [전체수정] 최초 생성 날짜 찾기 완료:', { originalDate });

    // 2. 기존 정기 기록들 모두 삭제
    if (recurringId) {
      let deletedRecordsCount = 0;
      Object.keys(calendarData).forEach(dateKey => {
        if (calendarData[dateKey].records) {
          const relatedRecords = calendarData[dateKey].records.filter(
            (r: any) => r.recurringId === recurringId
          );
          
          if (relatedRecords.length > 0) {
            debugLog('🗑️ [전체수정] 삭제할 기록 발견:', {
              dateKey,
              relatedRecordsCount: relatedRecords.length,
              records: relatedRecords.map((r: any) => ({ date: r.date, amount: r.amount }))
            });

            // 관련 기록들 삭제 (완전 삭제)
            calendarData[dateKey].records = calendarData[dateKey].records.filter(
              (r: any) => r.recurringId !== recurringId
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
      
      debugLog('🗑️ [전체수정] 삭제 완료:', { deletedRecordsCount });
    }
    
    // 3. 기존 recurringId 유지 (새로 생성하지 않음)
    const newRecurringId = editData.recurringId; // 기존 ID 유지
    
    // 분할 기록 시 첫 번째 기록(원본)에는 나머지 금액 추가
    let firstRecordAmount = monthlyAmount;
    if (isRecurring && isAmountSplit) {
      // 전체 수정 시에는 원래 총 금액을 계산해서 분할
      const originalTotalAmount = monthlyAmount * recurringMonths;
      const baseAmount = Math.floor(originalTotalAmount / recurringMonths);
      const remainder = originalTotalAmount - (baseAmount * recurringMonths);
      firstRecordAmount = baseAmount + remainder; // 원본 기록에는 나머지 금액 추가
    }
    
    debugLog('🔄 [전체수정] 새 기록 생성:', {
      newRecurringId,
      firstRecordAmount,
      isAmountSplit,
      recurringMonths
    });
    
    const updatedRecord = {
      ...newRecord,
      recurringId: newRecurringId,
      timestamp: new Date().getTime(),
      amount: firstRecordAmount,
    };
    
    // 미래 기록들 생성 (최초 생성 날짜 기준으로 전체 재생성)
    if (isRecurring) {
      // 최초 생성 날짜의 년월 + 수정한 일자로 재생성
      const originalDateFormatted = originalDate.replace(/-/g, '.');
      const [originalYear, originalMonth, originalDay] = originalDateFormatted.split('.').map(Number);
      
      // 수정한 날짜에서 일자 추출
      const currentDateFormatted = actualDateKey.replace(/-/g, '.');
      const [currentYear, currentMonth, newDay] = currentDateFormatted.split('.').map(Number);

      debugLog('🔄 [전체수정] 미래 기록 생성 시작:', {
        originalDateFormatted,
        originalYear,
        originalMonth,
        originalDay,
        currentDateFormatted,
        currentYear,
        currentMonth,
        newDay,
        recurringMonths
      });

      // 시작 인덱스: 0부터 시작 (최초 생성 날짜부터 전체 재생성)
      let startIndex = 0;
      let createdRecordsCount = 0;

      for (let i = startIndex; i < recurringMonths; i++) {
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
          debugLog('📅 [전체수정] 주말 조정:', {
            originalDate: futureDate,
            adjustedDate,
            weekendOption
          });
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
        
        const futureMonthlyAmount = monthlyAmount; // 이미 분할된 금액이므로 그대로 사용
        
        const futureRecord = {
          ...updatedRecord,
          date: futureDate,
          amount: futureMonthlyAmount,
          isAutoGenerated: true,
          recurringMonths: recurringMonths, // 정기 기록 개월 수 저장
        };
        
        calendarData[futureDateKey].records.push(futureRecord);
        calendarData[futureDateKey].totalExpense = (calendarData[futureDateKey].totalExpense || 0) + futureMonthlyAmount;
        
        createdRecordsCount++;
        
        debugLog('📝 [전체수정] 미래 기록 생성:', {
          index: i,
          futureDate,
          futureDateKey,
          futureMonthlyAmount,
          isAutoGenerated: true
        });
      }
      
      debugLog('✅ [전체수정] 미래 기록 생성 완료:', { createdRecordsCount });
    }

  };

  // 정기 기록 오늘만 수정 (완전 삭제 후 ID 유지하여 재생성)
  const handleRecurringSingleUpdate = async (
    calendarData: any, 
    editData: any, 
    newRecord: any, 
    actualDateKey: string, 
    monthlyAmount: number
  ) => {
    debugLog('🔍 [오늘만수정] 시작:', {
      originalDateKey: editData.date ? editData.date.replace(/\./g, '-') : actualDateKey,
      actualDateKey,
      monthlyAmount,
      editDataAmount: editData.amount,
      editDataIsAmountSplit: editData.isAmountSplit,
      editDataOriginalAmountSplit: editData.originalAmountSplit,
      editDataRecurringId: editData.recurringId,
      editDataTimestamp: editData.timestamp
    });
    
    const originalDateKey = editData.date ? editData.date.replace(/\./g, '-') : actualDateKey;
    const isDateChanged = originalDateKey !== actualDateKey;
    
    debugLog('🔍 [오늘만수정] 날짜 변경 확인:', {
      originalDateKey,
      actualDateKey,
      isDateChanged
    });
    
    // 기존 데이터 완전 삭제
    debugLog('🗑️ [오늘만수정] 기존 데이터 완전 삭제 시작');
    
    if (calendarData[originalDateKey] && calendarData[originalDateKey].records) {
      const originalRecordIndex = calendarData[originalDateKey].records.findIndex(
        (r: any) => r.timestamp === editData.timestamp
      );
      if (originalRecordIndex !== -1) {
        const originalRecord = calendarData[originalDateKey].records[originalRecordIndex];
        debugLog('🗑️ [오늘만수정] 기존 기록 완전 삭제:', {
          originalDateKey,
          originalRecordIndex,
          originalRecord: { date: originalRecord.date, amount: originalRecord.amount }
        });
        
        // 기록 완전 삭제
        calendarData[originalDateKey].records.splice(originalRecordIndex, 1);
        
        // 기존 날짜의 총액에서 차감
        if (originalRecord.type === 'expense') {
          calendarData[originalDateKey].totalExpense = Math.max(0, 
            (calendarData[originalDateKey].totalExpense || 0) - (originalRecord.amount || 0)
          );
        }
        
        // 빈 날짜 데이터 정리
        if (calendarData[originalDateKey].records.length === 0) {
          delete calendarData[originalDateKey];
        }
      }
    }
    
    // 새 위치에 기록 재생성 (ID 유지)
    debugLog('📝 [오늘만수정] 새 위치에 기록 재생성:', {
      actualDateKey,
      monthlyAmount,
      isAmountSplit: editData.isAmountSplit,
      originalAmountSplit: editData.originalAmountSplit
    });

    // 분할 기록 수정 시에는 기존 금액 그대로 사용 (재분할 방지)
    const finalAmount = (editData.isAmountSplit && editData.originalAmountSplit) 
      ? editData.amount  // 분할 기록은 기존 금액 유지
      : monthlyAmount;    // 일반 기록은 새 금액 사용

    const updatedRecord = {
      ...newRecord,
      recurringId: editData.recurringId, // 기존 recurringId 유지
      timestamp: editData.timestamp, // 기존 timestamp 유지
      amount: finalAmount, // 분할 기록 수정 시 기존 금액 사용
    };

    calendarData[actualDateKey].records.push(updatedRecord);
    calendarData[actualDateKey].totalExpense = (calendarData[actualDateKey].totalExpense || 0) + finalAmount;
    
    debugLog('✅ [오늘만수정] 완전 삭제 후 재생성 완료:', {
      actualDateKey,
      finalAmount,
      recurringId: editData.recurringId,
      timestamp: editData.timestamp
    });
  };

  const handleCategoryPress = () => {
    // 원래 정기 기록으로 생성된 데이터는 카테고리 변경 불가
    if (mode === 'edit' && editData?.isRecurring) {
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
    const recurringMonthsChanged = recurringMonths !== (editData.recurringMonths || 2);
    const amountSplitChanged = isAmountSplit !== (editData.isAmountSplit || false);
    const weekendOptionChanged = weekendOption !== (editData.weekendOption || 'weekend');

    return categoryChanged || amountChanged || dateChanged || memoChanged || 
           recurringChanged || recurringMonthsChanged || amountSplitChanged || weekendOptionChanged;
  };

  const handleConfirm = async () => {
    // 필수값 검증
    if (!category) {
      setShowCategoryAlert(true);
      return;
    }
    
    if (!amount || amount === '0' || amount.trim() === '') {
      setShowAmountAlert(true);
      return;
    }
    
    // 수정 모드에서 변경사항이 없으면 모달 표시
    // 정기/분할 기록 수정모드에서 확인 모달 표시 (hasChanges 체크 전에 실행)
    if (mode === 'edit' && editData?.isRecurring) {
      const isSplitRecord = editData.isAmountSplit && editData.originalAmountSplit;
      const recordType = isSplitRecord ? '분할' : '정기';
      
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
    
    // 정기 지출 + 주말인 경우 확인 모달 표시 ('관계없이 주말 기록' 제외)
    if (isRecurring && isWeekend() && weekendOption !== 'weekend') {
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

      if (isRecurring && isWeekendDay && weekendOption !== 'weekend') {
        actualDate = getAdjustedWeekendDate(date, weekendOption);

      } else if (isRecurring && isWeekendDay && weekendOption === 'weekend') {

      }
      
      const actualDateKey = actualDate.replace(/\./g, '-');

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
      const recurringId = isRecurring 
        ? ((mode === 'edit' && editData && editOption === 'today') 
          ? editData.recurringId 
          : newTimestamp.toString())
        : undefined;

      // 정기 지출 시 월별 금액 계산
      let monthlyAmount: number;
      if (isRecurring && isAmountSplit) {
        // 수정 모드이고 분할 기록인 경우: 기존 금액 그대로 사용 (재분할 방지)
        if (mode === 'edit' && editData?.isRecurring && editData?.isAmountSplit) {
          monthlyAmount = parseFloat(amount.replace(/,/g, ''));

        } else {
          // 생성 모드: 분할 계산
          const baseAmount = Math.floor(expenseAmount / recurringMonths);  // 소수점 제거하여 정수로 계산
          const remainder = expenseAmount - (baseAmount * recurringMonths);  // 나머지 금액 계산
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
        weekendOption: isRecurring ? weekendOption : undefined,
        recurringId: isRecurring ? recurringId : undefined, // 원본 기록에도 recurringId 저장
        isAutoGenerated: false, // 원본 기록은 자동생성이 아님
        isAmountSplit: isRecurring ? isAmountSplit : undefined, // 분할 여부 저장
        recurringMonths: isRecurring ? recurringMonths : undefined, // 정기 기록 개월 수 저장
        splitMonths: isRecurring && isAmountSplit ? recurringMonths : undefined, // 분할 개월 수 저장
        originalAmountSplit: isRecurring ? isAmountSplit : undefined, // 최초 생성 시 금액 분할 설정 저장
      };

      if (mode === 'edit' && editData) {
        // Edit mode: 정기 기록 수정 정책에 따른 처리
        if (editData.isRecurring) {
          // 정기 기록 수정
          if (editOption === 'all') {
            // 전체 수정: 기존 데이터 삭제 후 새로 생성
            await handleRecurringBulkUpdate(calendarData, editData, newRecord, actualDateKey, monthlyAmount, expenseAmount);
          } else {
            // 오늘만 수정: 해당 건만 수정 (부모/자식 관계 유지)
            // 분할 기록 수정 시에는 기존 금액을 사용하여 재분할 방지
            const singleUpdateAmount = (editData.isAmountSplit && editData.originalAmountSplit) 
              ? editData.amount  // 분할 기록은 기존 금액 사용
              : monthlyAmount;    // 일반 기록은 새 금액 사용

            await handleRecurringSingleUpdate(calendarData, editData, newRecord, actualDateKey, singleUpdateAmount);
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

      // 4. 정기 지출인 경우 다음 달들에도 기록 생성 (생성 모드에서만)
      if (isRecurring && mode !== 'edit') {

      // 정기 지출 시 월별 금액 계산 (미래 기록용)
      let futureMonthlyAmount: number;
      if (isAmountSplit) {
        futureMonthlyAmount = Math.floor(expenseAmount / recurringMonths);  // 소수점 제거하여 정수로 계산
      } else {
        futureMonthlyAmount = expenseAmount;
      }
        
        console.log('💰 [저장] 월별 금액:', futureMonthlyAmount, isAmountSplit ? '(분할)' : '(동일)');
        
        // 원래 선택한 날짜를 기준으로 다음 달 계산
        const [yearNum, monthNum, dayNum] = date.split('.').map(Number);
        console.log('📅 [저장] 기준 날짜:', date, '(원래 선택한 날짜)');
        
        for (let i = 1; i < recurringMonths; i++) {
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
            recurringId: recurringId,
            isAutoGenerated: true,
            isAmountSplit: isAmountSplit, // 분할 여부 저장
            recurringMonths: recurringMonths, // 정기 기록 개월 수 저장
            splitMonths: isAmountSplit ? recurringMonths : undefined, // 분할 개월 수 저장
            originalAmountSplit: isAmountSplit, // 최초 생성 시 금액 분할 설정 저장
          });
          
          calendarData[futureDateKey].totalExpense = (calendarData[futureDateKey].totalExpense || 0) + futureMonthlyAmount;
        }

      }

      // 6. AsyncStorage에 저장
      await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));

      // 6-1. 챌린지 알림 트리거 (비동기이지만 대기하지 않음)
      if (category) {
        const recordDateObj = new Date(actualDateKey);
        triggerChallengeNotifications(category, recordDateObj).catch(error => {

        });
      }
      
      // 7. 홈으로 이동
      // 오늘만 수정 모드에서는 원래 날짜로 이동, 전체 수정 모드에서는 최초 생성 날짜로 이동
      let targetDateKey = actualDateKey;
      if (mode === 'edit' && editData && editOption === 'today') {
        // 오늘만 수정: 원래 날짜로 이동 (수정된 날짜가 아닌)
        const originalDateKey = editData.date ? editData.date.replace(/\./g, '-') : actualDateKey;
        targetDateKey = originalDateKey;
        console.log('🏠 [이동] 오늘만 수정 - 원래 날짜로 이동:', targetDateKey, '(수정된 날짜:', actualDateKey, ')');
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
      
      debugLog('📅 [월시작일] 저장 후 이동 시 월 시작일:', {
        targetDateKey,
        currentMonthStartDay,
        savedDate: savedDate.toISOString()
      });
      
      // 실제 날짜가 속한 커스텀 월 계산
      const customMonthInfo = getCustomMonthInfo(savedDate, currentMonthStartDay);
      const targetYear = customMonthInfo.year;
      const targetMonth = customMonthInfo.month;
      
      debugLog('🏠 [이동] 실제 날짜가 속한 커스텀 월 계산:', {
        savedDate: targetDateKey,
        monthStartDay: currentMonthStartDay,
        targetYear,
        targetMonth,
        customMonthRange: {
          start: customMonthInfo.startDate.toISOString().split('T')[0],
          end: customMonthInfo.endDate.toISOString().split('T')[0]
        }
      });
      
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
            debugLog('📊 [이동] 타임라인 화면으로 이동:', { 
              year: params.calendarYear, 
              month: params.calendarMonth 
            });
            
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
            debugLog('🏠 [이동] 홈 화면으로 이동:', { targetYear, targetMonth, targetDay });
            
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

  // 정기 기록 삭제 옵션별 처리
  const handleRecurringDeleteWithOption = async () => {
    if (mode !== 'edit' || !editData || !editData.isRecurring) {

      return;
    }

    try {
      debugLog('🗑️ [정기삭제] 삭제 옵션:', deleteOption);
      
      const storedData = await AsyncStorage.getItem('calendarData');
      const calendarData = storedData ? JSON.parse(storedData) : {};
      
      const recurringId = editData.recurringId;
      if (!recurringId) {

        return;
      }

      // 정기 기록의 시작일 정보 계산
      const { startYear, startMonth, editYear, editMonth } = calcPeriod(editData, recurringMonths);

      // 삭제할 기록들 찾기
      const recordsToDelete: {dateKey: string, record: any}[] = [];
      
      Object.keys(calendarData).forEach(dateKey => {
        if (calendarData[dateKey].records) {
          const relatedRecords = calendarData[dateKey].records.filter(
            (r: any) => r.recurringId === recurringId
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

      debugLog('🗑️ [정기삭제] 삭제할 기록 수:', recordsToDelete.length);

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
      debugLog('✅ [정기삭제] 삭제 완료 및 저장');
      
      // 모달 닫기
      setShowRecurringDeleteOptions(false);
      
      // 타임라인에서 왔으면 타임라인으로, 아니면 홈으로 이동
      if (params.calendarYear && params.calendarMonth) {
        // 타임라인으로 복귀
        debugLog('📊 [이동] 타임라인 화면으로 이동:', { 
          year: params.calendarYear, 
          month: params.calendarMonth 
        });
        
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

  // 정기 기록 삭제 옵션별 기간 계산
  const getDeletePeriod = () => {
    if (!editData?.isRecurring) return '';
    
    switch (deleteOption) {
      case 'all':
        // 전체 삭제 - 정기기록 원본 시작일 계산 필요
        const { startYear: allStartYear, startMonth: allStartMonth, totalMonths: allTotalMonths } = calcPeriod(editData, recurringMonths);
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
        const { startYear: futureStartYear, startMonth: futureStartMonth, editYear: futureEditYear, editMonth: futureEditMonth, totalMonths: futureTotalMonths } = calcPeriod(editData, recurringMonths);
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
          
          debugLog('📅 [오늘이후삭제] 기간 계산:', {
            editYear: futureEditYear,
            editMonth: futureEditMonth,
            deleteStartPeriod,
            actualEndYear: futureActualEndYear,
            actualEndMonth: futureActualEndMonth,
            actualEndPeriod: futureEndPeriod,
            result: `기간 : ${deleteStartPeriod} - ${futureEndPeriod}`
          });
          
          return `기간 : ${deleteStartPeriod} - ${futureEndPeriod}`;
        }
      default:
        // 기본값 - 전체 삭제와 동일
        const { startYear: defaultStartYear, startMonth: defaultStartMonth, totalMonths: defaultTotalMonths } = calcPeriod(editData, recurringMonths);
        const { actualEndYear: defaultActualEndYear, actualEndMonth: defaultActualEndMonth } = calcEndDate(defaultStartYear, defaultStartMonth, defaultTotalMonths);
        const defaultStartPeriod = `${String(defaultStartYear).slice(-2)}/${String(defaultStartMonth).padStart(2, '0')}`;
        const defaultEndPeriod = `${String(defaultActualEndYear).slice(-2)}/${String(defaultActualEndMonth).padStart(2, '0')}`;
        return `기간 : ${defaultStartPeriod} - ${defaultEndPeriod}`;
    }
  };

  // 정기 기록 삭제 옵션별 금액 계산
  const getDeleteAmount = () => {
    if (!editData?.isRecurring || !amount) return '0원';
    
    const baseAmount = Number(amount.replace(/,/g, ''));
    if (isNaN(baseAmount)) return '0원';
    
    switch (deleteOption) {
      case 'all':
        // 전체 기간의 금액 합산 - 실제 존재하는 기록만 계산
        const { startYear: allStartYear, startMonth: allStartMonth, totalMonths: allTotalMonths } = calcPeriod(editData, recurringMonths);
        
        // 실제 존재하는 기록의 개수 사용 (삭제된 기록 제외)
        const recordCount = actualRecordCount > 0 ? actualRecordCount : allTotalMonths;
        return `${(baseAmount * recordCount).toLocaleString()}원`;
      case 'today':
        // 오늘 날짜의 금액만 - 정기기록 원본 시작일 계산 불필요
        return `${baseAmount.toLocaleString()}원`;
      case 'future':
        // 오늘 이후의 금액 합산
        const { startYear: futureStartYear, startMonth: futureStartMonth, editYear: futureEditYear, editMonth: futureEditMonth, totalMonths: futureTotalMonths } = calcPeriod(editData, recurringMonths);
        
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
          
          debugLog('🔍 [오늘이후삭제] 금액 계산 시작:', {
            originalStartYear: futureStartYear,
            originalStartMonth: futureStartMonth,
            totalMonths: futureTotalMonths,
            actualEndYear,
            actualEndMonth,
            currentEditYear: futureEditYear,
            currentEditMonth: futureEditMonth,
            baseAmount
          });
          
          // 현재 편집 중인 날짜부터 정기 기록의 실제 마지막까지 계산
          for (let year = futureStartYear; year <= actualEndYear; year++) {
            const startM = (year === futureStartYear) ? futureStartMonth : 1;
            const endM = (year === actualEndYear) ? actualEndMonth : 12;
            
            debugLog(`🔍 [오늘이후삭제] ${year}년 처리:`, {
              startM,
              endM,
              editYear: futureEditYear,
              editMonth: futureEditMonth
            });
            
            for (let month = startM; month <= endM; month++) {
              // 현재 편집 중인 날짜부터 정기 기록의 실제 마지막까지 포함
              const isFutureMonth = year > futureEditYear || (year === futureEditYear && month >= futureEditMonth);
              if (isFutureMonth) {
                futureMonths++;
                debugLog(`✅ [오늘이후삭제] 포함된 월: ${year}/${month} (${futureMonths}번째)`);
              } else {
                debugLog(`❌ [오늘이후삭제] 제외된 월: ${year}/${month} (편집일 이전)`);
              }
            }
          }
          
          const totalAmount = baseAmount * futureMonths;
          debugLog('💰 [오늘이후삭제] 최종 계산:', {
            futureMonths,
            baseAmount,
            totalAmount,
            result: `${totalAmount.toLocaleString()}원`
          });
          
          return `${totalAmount.toLocaleString()}원`;
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
                    // 정기 기록인지 확인하여 적절한 모달 표시
                    if (mode === 'edit' && editData?.isRecurring) {
                      setShowRecurringDeleteOptions(true);
                    } else {
                      setShowDeleteConfirm(true);
                    }
                  }}>
                    <Text style={[styles.deleteText, { color: colors.textAssistive }]}>
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
                disabled={mode === 'edit' && editData?.isRecurring}
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
                {isRecurring && (
                  <Text style={[styles.currentYearMonth, { color: colors.textAssistive }]}>
                    {mode === 'edit' && editData?.isRecurring && editData?.recurringId ? (
                      // 수정 모드: 최초 생성년월 표시 (recurringId는 timestamp)
                      (() => {
                        const originalDate = new Date(Number(editData.recurringId));
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
              {isRecurring ? (
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
                {isRecurring && (
                  <Checkbox
                    checked={isAmountSplit}
                    onPress={() => {
                      // 정기 기록 수정 모드에서는 금액 분할 설정 변경 불가
                      // originalAmountSplit이 없으면 isRecurring이 true인 경우로 판단
                      const isRecurringRecord = mode === 'edit' && editData?.isRecurring;
                      if (isRecurringRecord) {
                        setRecurringToastMessage('변경할 수 없습니다. 새로 생성해 주세요.');
                        setShowRecurringToast(true);
                        return;
                      }
                      setIsAmountSplit(!isAmountSplit);
                    }}
                    label="금액 분할하기"
                    disabled={mode === 'edit' && editData?.isRecurring}
                  />
                )}
              </View>
              
              {/* 정기 지출 ON 시 기간 설정과 금액 입력 필드를 한 행에 배치 */}
              {isRecurring && (
                <View style={styles.recurringAmountRow}>
                  {/* 기간 설정 */}
                  <Selectbox
                    disabled={mode === 'edit' && editData?.isRecurring}
                    options={[
                      { label: '2개월', value: '2' },
                      { label: '3개월', value: '3' },
                      { label: '4개월', value: '4' },
                      { label: '5개월', value: '5' },
                      { label: '6개월', value: '6' },
                      { label: '12개월', value: '12' },
                    ]}
                    value={recurringMonths.toString()}
                    placeholder="개월수 선택"
                    onPress={() => {
                      // 정기 기록 수정 모드에서는 개월수 변경 불가
                      const isDisabled = mode === 'edit' && editData?.isRecurring;

                      if (isDisabled) {

                        setRecurringToastMessage('변경할 수 없습니다. 새로 생성해 주세요.');
                        setShowRecurringToast(true);
                        return;
                      }

                      Keyboard.dismiss();
                      setShowPeriodNativePicker(true);
                    }}
                    onValueChange={(value) => {
                      if (mode !== 'edit' || !editData?.isRecurring) {
                        setRecurringMonths(parseInt(value, 10));
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
                    disabled={mode === 'edit' && editData?.isRecurring}
                    onPress={() => {
                      // 정기 기록 수정 모드에서는 금액 변경 불가 (정기 기록과 분할 기록 모두)
                      const isDisabled = mode === 'edit' && editData?.isRecurring;

                      if (isDisabled) {

                        setRecurringToastMessage('변경할 수 없습니다. 새로 생성해 주세요.');
                        setShowRecurringToast(true);
                        return;
                      }

                    }}
                    style={styles.splitAmountInput}
                  />
                </View>
              )}
              
              {/* 메인 금액 입력 필드 (정기 지출 OFF일 때만 표시) */}
              {!isRecurring && (
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
                  <Switch
                    value={isRecurring}
                    onValueChange={(value) => {

                      // 원래 정기 기록으로 생성된 데이터는 스위치 비활성화
                      if (mode === 'edit' && editData?.isRecurring) {

                        setRecurringToastMessage('정기 지출로 생성된 내역은 해제할 수 없습니다.');
                        setShowRecurringToast(true);
                        return;
                      }

                      setIsRecurring(value);
                      if (!value) {
                        // 정기 지출 OFF 시 관련 상태 초기화
                      setIsAmountSplit(false);
                      setRecurringMonths(2);
                    } else {
                      // 정기 지출 ON 시 선택한 날짜의 일자로 selectedDay 설정
                      if (params.selectedDate) {
                        const selectedDateObj = new Date(params.selectedDate);
                        setSelectedDay(selectedDateObj.getDate());
                        console.log('🔍 [Switch] 정기 지출 ON - selectedDay 설정:', selectedDateObj.getDate());
                      }
                    }
                  }}
                  disabled={mode === 'edit' && editData?.isRecurring}
                />
                </View>
                <Text style={[styles.recurringCaption, { color: colors.textAssistive }]}>
                  현재 월 기준 1년간 매달 같은 날에 기록합니다.
                </Text>
              </View>

              {/* Divider */}
              <View style={[styles.divider, { backgroundColor: colors.border }]} />

            </View>
          </View>

          {/* 기록일이 주말인 경우 (정기 지출 ON이면 항상 표시) */}
          {isRecurring && (
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
                      
                      debugLog('🔍 [기간표시] 정기기록 원본 시작일 계산:', {
                        recurringId: editData.recurringId,
                        originalStartDate: originalStartDate.toISOString(),
                        originalStartDateStr,
                        recurringMonths,
                        editDataDate: editData.date
                      });
                      
                      return getRecurringPeriod(originalStartDateStr, recurringMonths);
                    } else {
                      // 신규 생성 시에는 현재 선택된 날짜 사용
                      debugLog('🔍 [기간표시] 신규 생성 - 현재 날짜 사용:', {
                        currentDate: date,
                        recurringMonths
                      });
                      return getRecurringPeriod(date, recurringMonths);
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

      {/* 날짜 선택 바텀시트 */}
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

      {/* 기간 선택 네이티브 피커 */}
      <DatePicker
        visible={showPeriodNativePicker}
        onClose={() => setShowPeriodNativePicker(false)}
        title="기간 선택"
        dayOptions={Array.from({ length: 11 }, (_, i) => {
          const month = i + 2;
          return {
            label: `${month}개월`,
            value: month,
          };
        })}
        selectedDay={recurringMonths}
        onDayChange={(month) => {
          setRecurringMonths(month);
          setShowPeriodNativePicker(false);
        }}
      />

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
        title="정기 지출 기록 안내"
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
        onConfirm={handleRecurringDeleteWithOption}
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

      {/* 정기/분할 기록 수정 확인 모달 */}
      <ModalPopup
        visible={showEditConfirmModal}
        title="정기 지출 기록 안내"
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
    width: '100%',
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
  amountSplitButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  amountSplitText: {
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
  splitAmountInput: {
    flex: 1,
    minWidth: 200,
  },
  recurringAmountInput: {
    width: '100%',
  },
  splitAmountContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(54, 100, 206, 0.05)',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  splitAmountLabel: {
    ...Typography.body2.r.medium,
  },
  splitAmountValue: {
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

