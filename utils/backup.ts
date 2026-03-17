/**
 * AWallet 백업/복원
 *
 * - 전용 파일(.awbak): JSON (version, exportedAt, expenses, incomes)
 *   소비/입금 레코드 전체 필드를 포함해 서비스 기능을 온전히 백업·복원합니다.
 *   포함 항목: (1) 날짜 (2) 카테고리 (3) 수입/소비 (4) 금액 (5) 자산유형(신용/체크/현금)
 *   (6) 반복여부(일반/정기/할부) (7) 정산여부(선결제, 환불, 결산) (8) 주말옵션 (9) 메모
 *   및 관련 ID·원본금액·타임스탬프 등.
 *
 * - CSV: 날짜,카테고리,수입/소비,금액,유형,메모 (엑셀 양식 호환)
 * - XLSX: 년도별 시트('2025년', '2026년' 등), 동일 열 구조
 * - 암호화 없음. 파일은 사용자가 안전한 곳에 보관.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import {
  type Category,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from '@/constants/categories';
import { applySavedOrder, loadCategoryOrder, saveCategoryOrder } from '@/utils/category-order';
import { loadCategories, saveCategories } from '@/utils/categories';
import { getAllExpenses, replaceAllExpenses, type ExpenseRecord, type PaymentMethod } from '@/utils/expenses';
import { getAllIncomes, replaceAllIncomes, type IncomeRecord } from '@/utils/incomes';
import * as XLSX from 'xlsx-js-style';

const CALENDAR_DATA_KEY = 'calendarData';
const CONSUMPTION_REPORT_CACHE_PREFIXES = ['consumptionReport_', 'consumptionReportCtx_'] as const;
const CONSUMPTION_REPORT_RESET_AT_KEY = 'consumptionReportResetAt';

export const BACKUP_FILE_EXTENSION = '.awbak';
export const CSV_FILE_EXTENSION = '.csv';
export const XLSX_FILE_EXTENSION = '.xlsx';
const BACKUP_VERSION = 1;

/** 엑셀 복원 시 필수 항목 공백/형식 오류 시 throw되는 메시지 (화면에서 토스트 문구 분기용) */
export const RESTORE_VALIDATION_ERROR = 'RESTORE_VALIDATION_FAILED';
/** 백업 파일 버전이 앱보다 높을 때 throw (화면에서 토스트 문구 분기용) */
export const BACKUP_VERSION_TOO_NEW_ERROR = 'BACKUP_VERSION_TOO_NEW';

async function clearConsumptionReportCaches(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const reportKeys = allKeys.filter((key) =>
      CONSUMPTION_REPORT_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)),
    );
    if (reportKeys.length > 0) {
      await AsyncStorage.multiRemove(reportKeys);
    }
    await AsyncStorage.setItem(CONSUMPTION_REPORT_RESET_AT_KEY, String(Date.now()));
  } catch {
    // ignore cache cleanup failures during restore
  }
}

/** CSV 헤더 (양식: 날짜, 카테고리, 수입/소비, 금액, 유형, 메모) */
const CSV_HEADER = '날짜,카테고리,수입/소비,금액,유형,메모';
const CSV_TYPE_EXPENSE = '소비';
const CSV_TYPE_INCOME = '수입';
const CSV_PAYMENT_CREDIT = '신용';
const CSV_PAYMENT_DEBIT = '체크';
const CSV_PAYMENT_CASH = '현금';

export interface BackupPayload {
  version: number;
  exportedAt: string; // ISO 8601
  expenses: ExpenseRecord[];
  incomes: IncomeRecord[];
  /** 수입/소비 카테고리 설정 (복원 시 초기화된 카테고리를 덮어씀). 없으면 기존 .awbak 호환 */
  categoriesExpense?: Category[];
  categoriesIncome?: Category[];
}

/** recurringType undefined → null (JSON 저장 시) */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (_key === 'recurringType' && value === undefined) {
    return null;
  }
  return value;
}

/** recurringType null → undefined (JSON 파싱 시) */
function jsonReviver(_key: string, value: unknown): unknown {
  if (_key === 'recurringType' && value === null) {
    return undefined;
  }
  return value;
}

/**
 * 현재 저장된 소비/입금 데이터와 카테고리(수입·소비) 설정으로 백업 페이로드를 만듭니다.
 * 카테고리는 사용자가 설정한 표시 순서(드래그 편집 순서)대로 포함됩니다.
 */
export async function createBackupPayload(): Promise<BackupPayload> {
  const [
    expenses,
    incomes,
    categoriesExpenseRaw,
    categoriesIncomeRaw,
    orderExpense,
    orderIncome,
  ] = await Promise.all([
    getAllExpenses(),
    getAllIncomes(),
    loadCategories('expense'),
    loadCategories('income'),
    loadCategoryOrder('expense'),
    loadCategoryOrder('income'),
  ]);
  const categoriesExpense =
    orderExpense?.length ? applySavedOrder(categoriesExpenseRaw, orderExpense) : categoriesExpenseRaw;
  const categoriesIncome =
    orderIncome?.length ? applySavedOrder(categoriesIncomeRaw, orderIncome) : categoriesIncomeRaw;
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    expenses,
    incomes,
    categoriesExpense,
    categoriesIncome,
  };
}

/**
 * 백업 파일명 생성 (awallet-backup-YYYY-MM-DD.awbak)
 */
export function getBackupFileName(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `awallet-backup-${y}-${m}-${d}${BACKUP_FILE_EXTENSION}`;
}

/**
 * 백업 페이로드를 JSON 문자열로 직렬화합니다.
 */
export function serializeBackupPayload(payload: BackupPayload): string {
  return JSON.stringify(payload, jsonReplacer);
}

/** 카테고리 배열인지 검증 (옵션: 없어도 됨) */
function isCategoryArray(value: unknown): value is Category[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      typeof (item as Category).label === 'string' &&
      typeof (item as Category).emoji === 'string' &&
      ((item as Category).type === 'expense' || (item as Category).type === 'income'),
  );
}

/**
 * JSON 문자열을 백업 페이로드로 파싱합니다. 검증 실패 시 null.
 * categoriesExpense/categoriesIncome은 없으면 무시(기존 .awbak 호환).
 */
export function parseBackupPayload(json: string): BackupPayload | null {
  try {
    const raw = JSON.parse(json, jsonReviver) as unknown;
    if (
      raw &&
      typeof raw === 'object' &&
      'version' in raw &&
      typeof (raw as BackupPayload).version === 'number' &&
      'exportedAt' in raw &&
      typeof (raw as BackupPayload).exportedAt === 'string' &&
      Array.isArray((raw as BackupPayload).expenses) &&
      Array.isArray((raw as BackupPayload).incomes)
    ) {
      const payload = raw as BackupPayload;
      if (payload.categoriesExpense !== undefined && !isCategoryArray(payload.categoriesExpense)) return null;
      if (payload.categoriesIncome !== undefined && !isCategoryArray(payload.categoriesIncome)) return null;
      return payload;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * 앱 문서 디렉터리에 .awbak 백업 파일을 생성하고 해당 파일 경로를 반환합니다.
 * 반환된 경로로 공유(Share) 또는 복사할 수 있습니다.
 */
export async function writeBackupToFile(): Promise<string> {
  const payload = await createBackupPayload();
  const content = serializeBackupPayload(payload);
  const filename = getBackupFileName();
  const path = `${FileSystem.documentDirectory}${filename}`;

  await FileSystem.writeAsStringAsync(path, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return path;
}

/**
 * .awbak 파일 URI의 내용을 읽어 복원합니다.
 * 기존 소비/입금 데이터는 전체 교체됩니다.
 * @param fileUri - document picker 등으로 얻은 파일 URI
 * @throws 복원 실패 시(파일 읽기/파싱/검증 실패)
 */
export async function restoreFromBackupFile(fileUri: string): Promise<void> {
  const content = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const payload = parseBackupPayload(content);
  if (!payload) {
    throw new Error('유효하지 않은 백업 파일입니다.');
  }

  if (payload.version > BACKUP_VERSION) {
    throw new Error(BACKUP_VERSION_TOO_NEW_ERROR);
  }

  const expenses = Array.isArray(payload.expenses) ? payload.expenses : [];
  const incomes = Array.isArray(payload.incomes) ? payload.incomes : [];

  if (payload.categoriesExpense?.length) {
    await saveCategories('expense', payload.categoriesExpense);
    await saveCategoryOrder('expense', payload.categoriesExpense);
  }
  if (payload.categoriesIncome?.length) {
    await saveCategories('income', payload.categoriesIncome);
    await saveCategoryOrder('income', payload.categoriesIncome);
  }

  await Promise.all([
    replaceAllExpenses(expenses),
    replaceAllIncomes(incomes),
  ]);
  await clearConsumptionReportCaches();
}

// ---------- CSV (엑셀 양식 호환) ----------

function paymentMethodToCsv(pm: PaymentMethod | undefined): string {
  if (pm === 'debit') return CSV_PAYMENT_DEBIT;
  if (pm === 'cash') return CSV_PAYMENT_CASH;
  return CSV_PAYMENT_CREDIT;
}

function csvToPaymentMethod(value: string): PaymentMethod {
  const v = (value || '').trim();
  if (v === CSV_PAYMENT_DEBIT) return 'debit';
  if (v === CSV_PAYMENT_CASH) return 'cash';
  return 'credit';
}

/** YYYY.M.D 또는 YYYY.MM.DD → YYYY.MM.DD */
function normalizeDateFromCsv(dateStr: string): string {
  const parts = (dateStr || '').trim().split('.');
  if (parts.length !== 3) return dateStr.trim();
  const y = parts[0];
  const m = parts[1].padStart(2, '0');
  const d = parts[2].padStart(2, '0');
  return `${y}.${m}.${d}`;
}

function escapeCsvField(field: string): string {
  const s = String(field ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * CSV 한 줄 파싱 (쉼표 구분, 따옴표 필드 처리)
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let cell = '';
      i += 1;
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            cell += '"';
            i += 2;
          } else {
            i += 1;
            break;
          }
        } else {
          cell += line[i];
          i += 1;
        }
      }
      result.push(cell);
    } else {
      let end = line.indexOf(',', i);
      if (end === -1) end = line.length;
      result.push(line.slice(i, end).trim());
      i = end + 1;
    }
  }
  return result;
}

/**
 * CSV 내용을 파싱하여 expenses, incomes 배열로 변환합니다.
 * 헤더: 날짜,카테고리,수입/소비,금액,유형,메모
 */
export function parseCsvContent(content: string): { expenses: ExpenseRecord[]; incomes: IncomeRecord[] } | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;

  const header = parseCsvLine(lines[0].trim());
  const typeCol = header.findIndex((h) => h === '수입/소비' || h.includes('수입'));
  const dateCol = header.findIndex((h) => h === '날짜');
  const categoryCol = header.findIndex((h) => h === '카테고리');
  const amountCol = header.findIndex((h) => h === '금액');
  const paymentCol = header.findIndex((h) => h === '유형');
  const memoCol = header.findIndex((h) => h === '메모');

  if (dateCol < 0 || categoryCol < 0 || amountCol < 0 || typeCol < 0) return null;

  const expenses: ExpenseRecord[] = [];
  const incomes: IncomeRecord[] = [];
  const now = Date.now();

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const typeVal = (cells[typeCol] ?? '').trim();
    const dateStr = normalizeDateFromCsv(cells[dateCol] ?? '');
    const category = (cells[categoryCol] ?? '').trim();
    const amountStr = (cells[amountCol] ?? '').replace(/,/g, '').trim();
    const amount = Number(amountStr);
    const memo = memoCol >= 0 ? (cells[memoCol] ?? '').trim() : '';

    if (!dateStr || !category || Number.isNaN(amount) || amount < 0) continue;

    const timestamp = now + i;
    if (typeVal === CSV_TYPE_INCOME) {
      incomes.push({
        type: 'income',
        date: dateStr,
        category,
        amount,
        memo: memo || undefined,
        timestamp,
      });
    } else {
      const paymentMethod = paymentCol >= 0 ? csvToPaymentMethod(cells[paymentCol] ?? '') : 'credit';
      expenses.push({
        type: 'expense',
        date: dateStr,
        category,
        amount,
        memo: memo || undefined,
        timestamp,
        paymentMethod,
      });
    }
  }

  return { expenses, incomes };
}

/**
 * CSV 백업 파일을 생성하고 파일 경로를 반환합니다.
 * 포맷: 날짜,카테고리,수입/소비,금액,유형,메모 (엑셀 양식 호환)
 */
export async function writeCsvToFile(): Promise<string> {
  const [expenses, incomes] = await Promise.all([getAllExpenses(), getAllIncomes()]);
  const rows: string[] = [CSV_HEADER];

  for (const r of expenses) {
    if (r.isDeleted) continue;
    rows.push(
      [
        escapeCsvField(r.date),
        escapeCsvField(r.category),
        CSV_TYPE_EXPENSE,
        String(r.amount),
        escapeCsvField(paymentMethodToCsv(r.paymentMethod)),
        escapeCsvField(r.memo ?? ''),
      ].join(','),
    );
  }
  for (const r of incomes) {
    if (r.isDeleted) continue;
    rows.push(
      [
        escapeCsvField(r.date),
        escapeCsvField(r.category ?? ''),
        CSV_TYPE_INCOME,
        String(r.amount),
        CSV_PAYMENT_CASH,
        escapeCsvField(r.memo ?? ''),
      ].join(','),
    );
  }

  const content = '\uFEFF' + rows.join('\n');
  const filename = getCsvBackupFileName();
  const path = `${FileSystem.documentDirectory}${filename}`;

  await FileSystem.writeAsStringAsync(path, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return path;
}

/** CSV 백업 파일명: 수입/소비 내역 (시트 이름 대응) */
export function getCsvBackupFileName(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `수입소비내역-${y}-${m}-${d}${CSV_FILE_EXTENSION}`;
}

/** XLSX 시트용 헤더 라벨 (좌측 기록 테이블 + 빈 열 한 칸 + 우측 카테고리 참조 테이블) */
const XLSX_HEADER_LABELS = [
  '날짜',
  '카테고리',
  '수입/소비',
  '금액',
  '유형',
  '메모',
  '', // 메모와 카테고리 표 사이 한 칸 띄움
  '소비 카테고리',
  '수입 카테고리',
];

/** 엑셀 기본 폰트: 맑은 고딕 12 */
const XLSX_DEFAULT_FONT = { name: '맑은 고딕', sz: 12 };

/** 좌측 기록 테이블 헤더 스타일: 옅은 회색 배경 + 맑은 고딕 12 + 볼드 */
const XLSX_HEADER_CELL_STYLE = {
  fill: { patternType: 'solid' as const, fgColor: { rgb: 'FFE8E8E8' } },
  font: { ...XLSX_DEFAULT_FONT, bold: true },
};

/** 우측 카테고리 테이블 헤더 스타일: #FDF2D0 배경 + 가운데 정렬 */
const XLSX_CATEGORY_HEADER_STYLE = {
  fill: { patternType: 'solid' as const, fgColor: { rgb: 'FFFDF2D0' } },
  font: { ...XLSX_DEFAULT_FONT, bold: true },
  alignment: { horizontal: 'center' as const, vertical: 'center' as const },
};

/** 우측 카테고리 테이블 본문 셀 스타일: 배경 없음 + 가운데 정렬 */
const XLSX_CATEGORY_CELL_STYLE = {
  font: XLSX_DEFAULT_FONT,
  alignment: { horizontal: 'center' as const, vertical: 'center' as const },
};

/** G열(메모와 카테고리 표 사이 빈 칸): 텍스트·배경 없음 */
const XLSX_GAP_CELL_STYLE = { font: XLSX_DEFAULT_FONT };

/** 헤더 행(스타일 포함) — aoa_to_sheet에 넣을 첫 행 (9열: 데이터 6 + 빈칸 1 + 카테고리 2) */
function buildXlsxHeaderRow(): { v: string; t: string; s: object }[] {
  const dataLabels = XLSX_HEADER_LABELS.slice(0, 6);
  const gapAndCategoryLabels = XLSX_HEADER_LABELS.slice(6, 9);
  return [
    ...dataLabels.map((label) => ({ v: label, t: 's' as const, s: XLSX_HEADER_CELL_STYLE })),
    { v: gapAndCategoryLabels[0], t: 's' as const, s: XLSX_GAP_CELL_STYLE },
    { v: gapAndCategoryLabels[1], t: 's' as const, s: XLSX_CATEGORY_HEADER_STYLE },
    { v: gapAndCategoryLabels[2], t: 's' as const, s: XLSX_CATEGORY_HEADER_STYLE },
  ];
}

/** 엑셀 열 너비(문자 수): 기록 6열 + 빈칸 1 + 카테고리 2열 */
const XLSX_COL_WIDTHS = [
  { wch: 12 }, // 날짜
  { wch: 16 }, // 카테고리
  { wch: 10 }, // 수입/소비
  { wch: 12 }, // 금액
  { wch: 8 },  // 유형
  { wch: 24 }, // 메모
  { wch: 6 },  // 빈 칸 (메모와 카테고리 표 사이)
  { wch: 18 }, // 소비 카테고리
  { wch: 18 }, // 수입 카테고리
];

/** 날짜 열 서식 (yyyy.mm.dd) */
const XLSX_DATE_NUMFMT = 'yyyy.mm.dd';
/** 금액 열 서식 (천 단위 구분) */
const XLSX_ACCOUNTING_NUMFMT = '#,##0';

const EXCEL_EPOCH = new Date(1899, 11, 31).getTime();

/** YYYY.MM.DD 문자열을 엑셀 날짜 시리얼로 변환 */
function dateStringToExcelSerial(dateStr: string): number {
  const parts = (dateStr || '').trim().split('.');
  if (parts.length !== 3) return 0;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return 0;
  const t = new Date(y, m, d).getTime();
  return Math.round((t - EXCEL_EPOCH) / 86400000);
}

/** 엑셀 날짜 시리얼을 YYYY.MM.DD 문자열로 변환 */
function excelSerialToDateString(serial: number): string {
  const date = new Date(EXCEL_EPOCH + serial * 86400000);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

/**
 * 년도별 시트('2025년', '2026년' 등)로 XLSX 백업 파일을 생성하고 파일 경로를 반환합니다.
 */
export async function writeExcelToFile(): Promise<string> {
  const [expenses, incomes] = await Promise.all([getAllExpenses(), getAllIncomes()]);

  type RowSource = { date: string; type: 'expense' | 'income'; record: ExpenseRecord | IncomeRecord };
  const all: RowSource[] = [];
  for (const r of expenses) {
    if (r.isDeleted) continue;
    all.push({ date: r.date, type: 'expense', record: r });
  }
  for (const r of incomes) {
    if (r.isDeleted) continue;
    all.push({ date: r.date, type: 'income', record: r });
  }

  const yearToRows = new Map<number, (string | number)[][]>();
  for (const { date, type, record } of all) {
    const year = parseInt(date.slice(0, 4), 10);
    if (!yearToRows.has(year)) yearToRows.set(year, [buildXlsxHeaderRow()]);
    const rows = yearToRows.get(year)!;
    if (type === 'expense') {
      const e = record as ExpenseRecord;
      rows.push([
        e.date,
        e.category,
        CSV_TYPE_EXPENSE,
        e.amount,
        paymentMethodToCsv(e.paymentMethod),
        e.memo ?? '',
      ]);
    } else {
      const i = record as IncomeRecord;
      rows.push([
        i.date,
        i.category ?? '',
        CSV_TYPE_INCOME,
        i.amount,
        CSV_PAYMENT_CASH,
        i.memo ?? '',
      ]);
    }
  }

  let years = Array.from(yearToRows.keys()).sort((a, b) => b - a);
  if (years.length === 0) {
    const currentYear = new Date().getFullYear();
    yearToRows.set(currentYear, [buildXlsxHeaderRow()]);
    years = [currentYear];
  }
  const wb = XLSX.utils.book_new();
  const DATE_COL = 0;
  const AMOUNT_COL = 3;
  const DATA_COLS = 6;
  const COLS = 9; // 데이터 6 + 빈칸 1 + 카테고리 2
  const CATEGORY_COL_START = 7;
  const maxCategoryRows = Math.max(EXPENSE_CATEGORIES.length, INCOME_CATEGORIES.length);

  for (const year of years) {
    const rawRows = yearToRows.get(year)!;
    const extendedRows: (string | number | { v: string; t: string; s: object })[][] = [
      buildXlsxHeaderRow(),
    ];
    const maxRows = Math.max(rawRows.length - 1, maxCategoryRows);
    for (let i = 1; i <= maxRows; i++) {
      const dataRow = rawRows[i] as (string | number)[] | undefined;
      const dataCells = dataRow ? dataRow.slice(0, DATA_COLS) : Array(DATA_COLS).fill('');
      const expenseLabel = i <= EXPENSE_CATEGORIES.length ? EXPENSE_CATEGORIES[i - 1].label : '';
      const incomeLabel = i <= INCOME_CATEGORIES.length ? INCOME_CATEGORIES[i - 1].label : '';
      extendedRows.push([...dataCells, '', expenseLabel, incomeLabel]);
    }

    const ws = XLSX.utils.aoa_to_sheet(extendedRows);
    ws['!cols'] = XLSX_COL_WIDTHS;

    const dataCellFont = { font: XLSX_DEFAULT_FONT };

    for (let r = 1; r < extendedRows.length; r++) {
      for (let c = 0; c < DATA_COLS; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref]) ws[ref].s = { ...dataCellFont };
      }
      for (let c = CATEGORY_COL_START; c < COLS; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref]) ws[ref].s = XLSX_CATEGORY_CELL_STYLE;
      }
      const dateVal = extendedRows[r][DATE_COL];
      const dateSerial =
        typeof dateVal === 'string' ? dateStringToExcelSerial(dateVal) : Number(dateVal);
      if (Number.isFinite(dateSerial) && dateSerial > 0) {
        const ref = XLSX.utils.encode_cell({ r, c: DATE_COL });
        ws[ref] = { t: 'n', v: dateSerial, s: { numFmt: XLSX_DATE_NUMFMT, ...dataCellFont } };
      }
      const amountRef = XLSX.utils.encode_cell({ r, c: AMOUNT_COL });
      if (ws[amountRef]) ws[amountRef].s = { numFmt: XLSX_ACCOUNTING_NUMFMT, ...dataCellFont };
    }

    XLSX.utils.book_append_sheet(wb, ws, `${year}년`);
  }

  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const filename = getExcelBackupFileName();
  const path = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
}

export function getExcelBackupFileName(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}${XLSX_FILE_EXTENSION}`;
}

/** YYYY.MM.DD 형식 여부 확인 (필수 항목 검증용) */
const DATE_PATTERN = /^\d{4}\.\d{2}\.\d{2}$/;
function isValidDateString(s: string): boolean {
  return s.length > 0 && DATE_PATTERN.test(s);
}

/** 유형(소비) 허용 값: 공백 또는 신용/체크/현금 */
function isValidPaymentType(s: string): boolean {
  const v = s.trim();
  return v === '' || v === CSV_PAYMENT_CREDIT || v === CSV_PAYMENT_DEBIT || v === CSV_PAYMENT_CASH;
}

/**
 * XLSX 파일(base64)을 파싱하여 expenses, incomes 배열로 변환합니다.
 * 모든 시트를 합쳐서 복원합니다.
 * 필수 항목(수입/소비, 날짜, 카테고리, 금액, 유형)에 공백 또는 형식에 맞지 않는 데이터가 있으면 복원 중단을 위해 throw.
 */
export function parseXlsxContent(base64: string): { expenses: ExpenseRecord[]; incomes: IncomeRecord[] } | null {
  try {
    const wb = XLSX.read(base64, { type: 'base64', raw: true });
    const allExpenses: ExpenseRecord[] = [];
    const allIncomes: IncomeRecord[] = [];
    let timestampBase = Date.now();

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][];
      if (rows.length < 2) continue;

      const header = rows[0].map((c) => String(c ?? '').trim());
      const typeCol = header.findIndex((h) => h === '수입/소비' || h.includes('수입'));
      const dateCol = header.findIndex((h) => h === '날짜');
      const categoryCol = header.findIndex((h) => h === '카테고리');
      const amountCol = header.findIndex((h) => h === '금액');
      const paymentCol = header.findIndex((h) => h === '유형');
      const memoCol = header.findIndex((h) => h === '메모');
      if (dateCol < 0 || categoryCol < 0 || amountCol < 0 || typeCol < 0) continue;

      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i] ?? [];
        const get = (col: number) => (col >= 0 ? String(cells[col] ?? '').trim() : '');
        const getNum = (col: number) => (col >= 0 ? cells[col] : undefined);
        const typeVal = get(typeCol);
        const rawDate = getNum(dateCol);
        const dateStr =
          typeof rawDate === 'number' && Number.isFinite(rawDate)
            ? excelSerialToDateString(rawDate)
            : normalizeDateFromCsv(get(dateCol));
        const category = get(categoryCol);
        const rawAmount = getNum(amountCol);
        const amount =
          typeof rawAmount === 'number' && Number.isFinite(rawAmount)
            ? rawAmount
            : Number(get(amountCol).replace(/,/g, ''));
        const memo = memoCol >= 0 ? get(memoCol) : '';
        const paymentStr = paymentCol >= 0 ? get(paymentCol) : '';

        const rowEmpty =
          typeVal === '' && get(dateCol) === '' && category === '' && get(amountCol) === '' && paymentStr === '';
        if (rowEmpty) continue;

        const typeValid = typeVal === CSV_TYPE_INCOME || typeVal === CSV_TYPE_EXPENSE;
        const dateValid = isValidDateString(dateStr);
        const categoryValid = category.length > 0;
        const amountValid = Number.isFinite(amount) && amount >= 0;
        const paymentValid = typeVal !== CSV_TYPE_EXPENSE || isValidPaymentType(paymentStr);

        if (!typeValid || !dateValid || !categoryValid || !amountValid || !paymentValid) {
          throw new Error(RESTORE_VALIDATION_ERROR);
        }

        const timestamp = timestampBase++;
        if (typeVal === CSV_TYPE_INCOME) {
          allIncomes.push({
            type: 'income',
            date: dateStr,
            category,
            amount,
            memo: memo || undefined,
            timestamp,
          });
        } else {
          const paymentMethod = paymentCol >= 0 ? csvToPaymentMethod(get(paymentCol)) : 'credit';
          allExpenses.push({
            type: 'expense',
            date: dateStr,
            category,
            amount,
            memo: memo || undefined,
            timestamp,
            paymentMethod,
          });
        }
      }
    }

    if (allExpenses.length === 0 && allIncomes.length === 0) return null;
    return { expenses: allExpenses, incomes: allIncomes };
  } catch (err) {
    if (err instanceof Error && err.message === RESTORE_VALIDATION_ERROR) throw err;
    return null;
  }
}

/**
 * 백업 파일(.awbak), CSV, 또는 XLSX 파일을 읽어 복원합니다.
 * 확장자 또는 내용으로 포맷을 판별합니다.
 * @param fileUri - document picker 등으로 얻은 파일 URI
 */
export async function restoreFromFile(fileUri: string): Promise<void> {
  const lowerUri = fileUri.toLowerCase();
  if (lowerUri.endsWith(XLSX_FILE_EXTENSION)) {
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const parsed = parseXlsxContent(base64);
    if (parsed) {
      await Promise.all([
        replaceAllExpenses(parsed.expenses),
        replaceAllIncomes(parsed.incomes),
      ]);
      await AsyncStorage.removeItem(CALENDAR_DATA_KEY);
      await clearConsumptionReportCaches();
      return;
    }
    throw new Error(RESTORE_VALIDATION_ERROR);
  }

  const content = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const trimmed = content.trim();

  if (trimmed.startsWith('{')) {
    const payload = parseBackupPayload(trimmed);
    if (payload) {
      if (payload.version > BACKUP_VERSION) {
        throw new Error(BACKUP_VERSION_TOO_NEW_ERROR);
      }
      if (payload.categoriesExpense?.length) {
        await saveCategories('expense', payload.categoriesExpense);
        await saveCategoryOrder('expense', payload.categoriesExpense);
      }
      if (payload.categoriesIncome?.length) {
        await saveCategories('income', payload.categoriesIncome);
        await saveCategoryOrder('income', payload.categoriesIncome);
      }
      await Promise.all([
        replaceAllExpenses(Array.isArray(payload.expenses) ? payload.expenses : []),
        replaceAllIncomes(Array.isArray(payload.incomes) ? payload.incomes : []),
      ]);
      await AsyncStorage.removeItem(CALENDAR_DATA_KEY);
      await clearConsumptionReportCaches();
      return;
    }
  }

  const csv = parseCsvContent(trimmed);
  if (csv) {
    await Promise.all([
      replaceAllExpenses(csv.expenses),
      replaceAllIncomes(csv.incomes),
    ]);
    await AsyncStorage.removeItem(CALENDAR_DATA_KEY);
    await clearConsumptionReportCaches();
    return;
  }

  throw new Error('유효하지 않은 백업 파일입니다. .awbak, CSV, 또는 XLSX(날짜,카테고리,수입/소비,금액,유형,메모) 형식을 확인해 주세요.');
}
