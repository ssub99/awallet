import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  logChallengeCreate,
  logChallengeDelete,
  type ChallengeCreationVariant,
  type ChallengeLifecycleAnalyticsPayload,
} from '@/utils/analytics';

const CHALLENGE_STORAGE_KEY = 'challengeData';

export interface ChallengeRecord {
  id: string;
  category: string;
  startDate: string; // YYYY.MM.DD
  endDate: string; // YYYY.MM.DD
  targetAmount: number;
  createdAt: number;
  recurringId: string;
  /**
   * Anchor date for recurring group (원본 생성 시점의 시작일을 유지)
   * - 새로 생성 시 startDate로 설정
   * - 월 시작일 변경에 따른 재생성 시에도 이 값을 그대로 유지
   */
  anchorStartDate?: string;
  isDeleted?: boolean;
  deletedAt?: string | null;
  // Optional legacy fields preserved for compatibility
  startMonth?: string;
  endMonth?: string | null;
  durationMonths?: number | null;
  status?: string;
  updatedAt?: number | null;
}

function deriveMonthFromDate(dateString: string): string {
  const [year, month] = dateString.split('.');
  return `${year}.${month}`;
}

function normalizeChallenge(record: ChallengeRecord): ChallengeRecord {
  return {
    ...record,
    anchorStartDate: record.anchorStartDate ?? record.startDate,
    isDeleted: record.isDeleted ?? false,
    deletedAt: record.deletedAt ?? null,
    startMonth: record.startMonth ?? deriveMonthFromDate(record.startDate),
    endMonth: record.endMonth ?? deriveMonthFromDate(record.endDate),
  };
}

function sortChallenges(challenges: ChallengeRecord[]): ChallengeRecord[] {
  return [...challenges].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** 생성 화면의 반복(2~12개월)과 동일: durationMonths > 1 이면 isrecurring */
function challengeDeletionVariantFromRecords(
  records: ChallengeRecord[],
): ChallengeCreationVariant {
  if (records.some((r) => typeof r.durationMonths === 'number' && r.durationMonths > 1)) {
    return 'isrecurring';
  }
  return 'general';
}

function challengeLifecyclePayloadFromRecords(
  records: ChallengeRecord[],
): ChallengeLifecycleAnalyticsPayload {
  if (records.length === 0) {
    return { is_recurring: false, duration_months: null };
  }
  const dm = records[0].durationMonths;
  const isRecurring = typeof dm === 'number' && dm > 1;
  return {
    is_recurring: isRecurring,
    duration_months: isRecurring && typeof dm === 'number' ? dm : null,
  };
}

async function loadLocalChallenges(): Promise<ChallengeRecord[]> {
  try {
    const stored = await AsyncStorage.getItem(CHALLENGE_STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return sortChallenges(parsed.map(normalizeChallenge));
  } catch (error) {
    console.error('[challenges] Failed to read local cache:', error);
    return [];
  }
}

async function saveLocalChallenges(challenges: ChallengeRecord[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CHALLENGE_STORAGE_KEY, JSON.stringify(sortChallenges(challenges)));
  } catch (error) {
    console.error('[challenges] Failed to persist local cache:', error);
  }
}

export async function createChallenges(records: ChallengeRecord[]): Promise<ChallengeRecord[]> {
  if (records.length === 0) {
    return [];
  }

  const existing = await loadLocalChallenges();
  const existingIds = new Set(records.map((record) => record.id));
  const merged = [
    ...existing.filter((challenge) => !existingIds.has(challenge.id)),
    ...records.map(normalizeChallenge),
  ];

  await saveLocalChallenges(merged);
  const variant = challengeDeletionVariantFromRecords(records);
  const lifecyclePayload = challengeLifecyclePayloadFromRecords(records);
  logChallengeCreate(variant, lifecyclePayload);
  return records;
}

export async function updateChallengesByRecurringId(
  recurringId: string,
  updates: Partial<
    Pick<
      ChallengeRecord,
      | 'category'
      | 'startDate'
      | 'endDate'
      | 'targetAmount'
      | 'createdAt'
      | 'isDeleted'
      | 'deletedAt'
      | 'startMonth'
      | 'endMonth'
      | 'durationMonths'
      | 'status'
      | 'updatedAt'
    >
  >,
): Promise<ChallengeRecord[]> {
  if (!recurringId) {
    return [];
  }

  const challenges = await loadLocalChallenges();
  const updatedChallenges = challenges.map((challenge) => {
    if (challenge.recurringId !== recurringId) {
      return challenge;
    }

    const next: ChallengeRecord = { ...challenge };

    if (updates.category !== undefined) {
      next.category = updates.category;
    }
    if (updates.startDate !== undefined) {
      next.startDate = updates.startDate;
      next.startMonth = updates.startMonth ?? deriveMonthFromDate(updates.startDate);
    } else if (updates.startMonth !== undefined) {
      next.startMonth = updates.startMonth;
    }
    if (updates.endDate !== undefined) {
      next.endDate = updates.endDate;
      next.endMonth = updates.endMonth ?? deriveMonthFromDate(updates.endDate);
    } else if (updates.endMonth !== undefined) {
      next.endMonth = updates.endMonth;
    }
    if (updates.targetAmount !== undefined) {
      next.targetAmount = updates.targetAmount;
    }
    if (updates.createdAt !== undefined) {
      next.createdAt = updates.createdAt;
    }
    if (updates.isDeleted !== undefined) {
      next.isDeleted = updates.isDeleted;
    }
    if (updates.deletedAt !== undefined) {
      next.deletedAt = updates.deletedAt ?? null;
    }
    if (updates.durationMonths !== undefined) {
      next.durationMonths = updates.durationMonths;
    }
    if (updates.status !== undefined) {
      next.status = updates.status;
    }

    const updatedAt = updates.updatedAt ?? Date.now();
    next.updatedAt = updatedAt;

    return next;
  });

  await saveLocalChallenges(updatedChallenges);
  return updatedChallenges.filter((challenge) => challenge.recurringId === recurringId);
}

export async function softDeleteChallengesByRecurringId(recurringId: string): Promise<void> {
  if (!recurringId) {
    return;
  }

  const challenges = await loadLocalChallenges();
  const group = challenges.filter(
    (challenge) => challenge.recurringId === recurringId && challenge.isDeleted !== true,
  );
  if (group.length === 0) {
    return;
  }

  const deletedAt = new Date().toISOString();
  await updateChallengesByRecurringId(recurringId, { isDeleted: true, deletedAt });
  logChallengeDelete(
    challengeDeletionVariantFromRecords(group),
    challengeLifecyclePayloadFromRecords(group),
  );
}

export async function hardDeleteChallengesByRecurringId(recurringId: string): Promise<void> {
  if (!recurringId) {
    return;
  }

  const challenges = await loadLocalChallenges();
  const toRemove = challenges.filter((challenge) => challenge.recurringId === recurringId);
  if (toRemove.length === 0) {
    return;
  }
  const variant = challengeDeletionVariantFromRecords(toRemove);
  const filtered = challenges.filter((challenge) => challenge.recurringId !== recurringId);
  await saveLocalChallenges(filtered);
  logChallengeDelete(variant, challengeLifecyclePayloadFromRecords(toRemove));
}

/**
 * 모든 챌린지에서 카테고리명을 변경합니다.
 */
export async function renameChallengeCategory(
  oldLabel: string,
  newLabel: string
): Promise<void> {
  const challenges = await loadLocalChallenges();
  let changed = false;
  const updated = challenges.map((challenge) => {
    if (challenge.category === oldLabel) {
      changed = true;
      return { ...challenge, category: newLabel };
    }
    return challenge;
  });
  if (changed) {
    await saveLocalChallenges(updated);
  }
}

/**
 * 특정 카테고리를 사용하는 챌린지를 모두 삭제합니다.
 */
export async function deleteChallengesByCategory(categoryLabel: string): Promise<void> {
  const challenges = await loadLocalChallenges();
  const removedRecords = challenges.filter((challenge) => challenge.category === categoryLabel);
  if (removedRecords.length === 0) {
    return;
  }
  const filtered = challenges.filter((challenge) => challenge.category !== categoryLabel);
  await saveLocalChallenges(filtered);
  logChallengeDelete(
    challengeDeletionVariantFromRecords(removedRecords),
    challengeLifecyclePayloadFromRecords(removedRecords),
  );
}

export async function getChallengeById(id: string): Promise<ChallengeRecord | null> {
  if (!id) {
    return null;
  }

  const challenges = await loadLocalChallenges();
  return challenges.find((challenge) => challenge.id === id) ?? null;
}

export async function getChallengesByRecurringId(recurringId: string): Promise<ChallengeRecord[]> {
  if (!recurringId) {
    return [];
  }

  const challenges = await loadLocalChallenges();
  return challenges.filter((challenge) => challenge.recurringId === recurringId);
}

export async function getChallengesByDateRange(
  startDate: string,
  endDate: string,
): Promise<ChallengeRecord[]> {
  if (!startDate || !endDate) {
    return [];
  }

  const challenges = await loadLocalChallenges();
  return challenges.filter(
    (challenge) =>
      !challenge.isDeleted &&
      challenge.startDate >= startDate &&
      challenge.startDate <= endDate,
  );
}

export async function getAllChallenges(): Promise<ChallengeRecord[]> {
  return loadLocalChallenges();
}

export async function clearAllChallenges(): Promise<void> {
  await AsyncStorage.removeItem(CHALLENGE_STORAGE_KEY);
}

