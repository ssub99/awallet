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
import { getAllExpenses, replaceAllExpenses, type ExpenseRecord, type PaymentMethod } from '@/utils/expenses';
import { getAllIncomes, replaceAllIncomes, type IncomeRecord } from '@/utils/incomes';
import * as XLSX from 'xlsx-js-style';

const CALENDAR_DATA_KEY = 'calendarData';

export const BACKUP_FILE_EXTENSION = '.awbak';
export const CSV_FILE_EXTENSION = '.csv';
export const XLSX_FILE_EXTENSION = '.xlsx';
const BACKUP_VERSION = 1;

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
 * 현재 저장된 소비/입금 데이터로 백업 페이로드를 만듭니다.
 */
export async function createBackupPayload(): Promise<BackupPayload> {
  const [expenses, incomes] = await Promise.all([getAllExpenses(), getAllIncomes()]);
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    expenses,
    incomes,
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

/**
 * JSON 문자열을 백업 페이로드로 파싱합니다. 검증 실패 시 null.
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
      return raw as BackupPayload;
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
    throw new Error('이 백업 파일은 더 최신 앱 버전에서 만든 것입니다. 앱을 업데이트한 뒤 다시 시도해 주세요.');
  }

  const expenses = Array.isArray(payload.expenses) ? payload.expenses : [];
  const incomes = Array.isArray(payload.incomes) ? payload.incomes : [];

  await Promise.all([
    replaceAllExpenses(expenses),
    replaceAllIncomes(incomes),
  ]);
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

/** XLSX 시트용 헤더 라벨 */
const XLSX_HEADER_LABELS = ['날짜', '카테고리', '수입/소비', '금액', '유형', '메모'];

/** 엑셀 기본 폰트: 맑은 고딕 12 */
const XLSX_DEFAULT_FONT = { name: '맑은 고딕', sz: 12 };

/** 첫 행(헤더) 스타일: 옅은 회색 배경 + 맑은 고딕 12 + 볼드 */
const XLSX_HEADER_CELL_STYLE = {
  fill: { patternType: 'solid' as const, fgColor: { rgb: 'FFE8E8E8' } },
  font: { ...XLSX_DEFAULT_FONT, bold: true },
};

/** 헤더 행(스타일 포함) — aoa_to_sheet에 넣을 첫 행 */
function buildXlsxHeaderRow(): { v: string; t: string; s: object }[] {
  return XLSX_HEADER_LABELS.map((label) => ({
    v: label,
    t: 's',
    s: XLSX_HEADER_CELL_STYLE,
  }));
}

/** 엑셀 열 너비(문자 수): 카테고리 16, 메모 24 */
const XLSX_COL_WIDTHS = [
  { wch: 12 }, // 날짜
  { wch: 16 }, // 카테고리
  { wch: 10 }, // 수입/소비
  { wch: 12 }, // 금액
  { wch: 8 },  // 유형
  { wch: 24 }, // 메모
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
  const COLS = 6;

  for (const year of years) {
    const rows = yearToRows.get(year)!;
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = XLSX_COL_WIDTHS;

    const dataCellFont = { font: XLSX_DEFAULT_FONT };

    for (let r = 1; r < rows.length; r++) {
      for (let c = 0; c < COLS; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref]) ws[ref].s = { ...dataCellFont };
      }
      const dateVal = rows[r][DATE_COL];
      const dateSerial = typeof dateVal === 'string' ? dateStringToExcelSerial(dateVal) : Number(dateVal);
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

/**
 * XLSX 파일(base64)을 파싱하여 expenses, incomes 배열로 변환합니다.
 * 모든 시트를 합쳐서 복원합니다.
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
        if (!dateStr || !category || Number.isNaN(amount) || amount < 0) continue;

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
  } catch {
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
      return;
    }
    throw new Error('XLSX 파일 내용을 읽을 수 없습니다. 형식(날짜,카테고리,수입/소비,금액,유형,메모)을 확인해 주세요.');
  }

  const content = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const trimmed = content.trim();

  if (trimmed.startsWith('{')) {
    const payload = parseBackupPayload(trimmed);
    if (payload) {
      if (payload.version > BACKUP_VERSION) {
        throw new Error('이 백업 파일은 더 최신 앱 버전에서 만든 것입니다. 앱을 업데이트한 뒤 다시 시도해 주세요.');
      }
      await Promise.all([
        replaceAllExpenses(Array.isArray(payload.expenses) ? payload.expenses : []),
        replaceAllIncomes(Array.isArray(payload.incomes) ? payload.incomes : []),
      ]);
      await AsyncStorage.removeItem(CALENDAR_DATA_KEY);
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
    return;
  }

  throw new Error('유효하지 않은 백업 파일입니다. .awbak, CSV, 또는 XLSX(날짜,카테고리,수입/소비,금액,유형,메모) 형식을 확인해 주세요.');
}
