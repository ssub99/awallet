import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLoading } from '@/contexts/loading-context';
import { loadMonthStartDay, monthStartEvent } from '@/hooks/use-month-start';

export interface DayDataRecord {
  [date: string]: any;
}

interface AppDataContextType {
  calendarData: DayDataRecord;
  monthStartDay: number;
  refresh: () => Promise<void>;
  isReady: boolean;
  dataVersion: number;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

export const useAppData = (): AppDataContextType => {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
};

export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setLoading } = useLoading();
  const [calendarData, setCalendarData] = useState<DayDataRecord>({});
  const [monthStartDay, setMonthStartDay] = useState<number>(1);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [dataVersion, setDataVersion] = useState<number>(0);

  const refresh = async () => {
    setLoading(true);
    try {
      const [storedData, msd] = await Promise.all([
        AsyncStorage.getItem('calendarData'),
        loadMonthStartDay(),
      ]);
      setCalendarData(storedData ? JSON.parse(storedData) : {});
      setMonthStartDay(msd);
      setIsReady(true);
      setDataVersion((v) => v + 1);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  useEffect(() => {
    const unsub = monthStartEvent.subscribe((day) => {
      setMonthStartDay(day);
      // 월 시작일이 바뀌면 버전만 증가(데이터는 그대로일 수 있음)
      setDataVersion((v) => v + 1);
    });
    return unsub;
  }, []);

  const value = useMemo(() => ({ calendarData, monthStartDay, refresh, isReady, dataVersion }), [calendarData, monthStartDay, isReady, dataVersion]);

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
};


