/**
 * Data backup/restore screen
 * Figma: [Awallet]Mypage_databackup
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Icon } from '@/components/ui/icon';
import { ThemeColors } from '@/constants/theme-colors';
import { Typography } from '@/constants/typography';
import { useAppData } from '@/contexts/app-data-context';
import { useLoading } from '@/contexts/loading-context';
import { useToast } from '@/contexts/toast-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { logEvent } from '@/utils/analytics';
import { refreshWidgetWithCurrentMonth } from '@/utils/widget-data-sync';
import { resetAppData } from '@/utils/reset-app-data';
import { useRouter } from 'expo-router';

/** 확장자 검사용 (백업 모듈은 버튼 탭 시 동적 로드하여 OTA 진입 크래시 방지) */
const BACKUP_FILE_EXTENSION = '.awbak';
const XLSX_FILE_EXTENSION = '.xlsx';
import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ModalPopup } from '@/components/ui/modal-popup';

const EMAIL_SUBJECT_BACKUP = '[AWallet] 데이터 백업';
const EMAIL_BODY_BACKUP = 'AWallet 데이터 백업 파일이 첨부되어 있습니다.';
const SHARE_DIALOG_TITLE = '데이터 백업 파일 보내기';
type EventStatus = 'success' | 'fail';

function logBackupStatus(status: EventStatus): void {
  void logEvent('backup', { status });
}

function logRestoreStatus(status: EventStatus): void {
  void logEvent('restore', { status });
}

/**
 * 백업 파일을 시스템 공유 시트로 연다.
 * - Sharing/MailComposer는 네이티브 모듈이므로 화면 로드 시 크래시 방지를 위해 동적 로드.
 * - Expo Go 등 네이티브 모듈이 없으면 onUnavailable로 안내.
 */
async function openShareOrMail(
  filePath: string,
  mimeType: string,
  onUnavailable?: (title: string, message: string) => void,
): Promise<void> {
  const fallbackMessage =
    '공유 기능을 사용할 수 없습니다. 개발 빌드(실기기)에서 이용해 주세요.';

  try {
    const Sharing = await import('expo-sharing');
    const MailComposer = await import('expo-mail-composer');

    const isAvailableAsync = Sharing.isAvailableAsync ?? Sharing.default?.isAvailableAsync;
    const shareAsync = Sharing.shareAsync ?? Sharing.default?.shareAsync;
    if (typeof isAvailableAsync !== 'function' || typeof shareAsync !== 'function') {
      onUnavailable?.('공유/이메일 사용 불가', fallbackMessage);
      return;
    }

    const sharingAvailable = await isAvailableAsync();
    if (sharingAvailable) {
      await shareAsync(filePath, {
        mimeType: Platform.OS === 'android' ? mimeType : undefined,
        dialogTitle: Platform.OS === 'android' ? SHARE_DIALOG_TITLE : undefined,
      });
      return;
    }

    const mailIsAvailable = MailComposer.isAvailableAsync ?? MailComposer.default?.isAvailableAsync;
    const composeAsync = MailComposer.composeAsync ?? MailComposer.default?.composeAsync;
    if (typeof mailIsAvailable !== 'function' || typeof composeAsync !== 'function') {
      onUnavailable?.('공유/이메일 사용 불가', fallbackMessage);
      return;
    }

    const mailAvailable = await mailIsAvailable();
    if (!mailAvailable) {
      onUnavailable?.(
        '공유/이메일 사용 불가',
        '이 기기에서 파일을 보낼 수 없습니다. 메일 앱이 설정되어 있는지 확인해 주세요.',
      );
      return;
    }
    await composeAsync({
      subject: EMAIL_SUBJECT_BACKUP,
      body: EMAIL_BODY_BACKUP,
      attachments: [filePath],
    });
  } catch (err) {
    console.error('[data-backup] openShareOrMail:', err);
    onUnavailable?.('공유/이메일 사용 불가', fallbackMessage);
  }
}

const RESET_CONFIRM_MESSAGE =
  '전체 데이터를 초기화 하시겠어요?\n생성된 데이터가 모두 초기화 되고\n초기 상태로 설정 됩니다.';

/** 엑셀파일 백업/복원 유의사항 (Figma 시안 문구, 항목별 배열) */
const EXCEL_BACKUP_NOTICE_ITEMS = [
  '카테고리의 종류는 편의대로 커스텀하여 적용이 가능합니다. (단, 백업 기록과 에이월렛의 카테고리가 일치하도록 편집되어야 함.)',
  '엑셀파일(.xlsx)로 백업/복원 시 서비스 내의 카테고리와 일치하도록 해야 정상적으로 복원 됩니다.',
  '공백이 존재하거나 항목들의 데이터 형식이 일치하지 않으면 복원이 진행되지 않습니다. 정확하게 입력해야만 복원이 진행되오니 내역을 꼼꼼히 확인해 주세요.',
  '시트 또는 데이터에 특수문자는 허용하지 않으니 유의하시어 작성하시길 권장드립니다.',
  '엑셀파일(.xlsx)로 백업/복원하는 경우 정기/할부 및 정산 기능을 적용할 수 없음을 안내드립니다. 정확하게 일치하는 복원을 원하시는 경우 전용파일(.awbak)을 이용하시는 것을 권장드립니다.',
];

export default function DataBackupScreen() {
  const colorScheme = useColorScheme();
  const colors = ThemeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const { setLoading } = useLoading();
  const { showToast } = useToast();
  const { refresh } = useAppData();

  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);

  const openBackupShare = useCallback(
    async (
      filePath: string,
      mimeType: string,
      onUnavailable?: (title: string, message: string) => void,
    ) => {
      await openShareOrMail(filePath, mimeType, onUnavailable);
    },
    [],
  );

  const handleBackupExcel = useCallback(async () => {
    setLoading(true);
    try {
      const { writeExcelToFile } = await import('@/utils/backup');
      const path = await writeExcelToFile();
      await openBackupShare(
        path,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        (_title, message) => {
          showToast(message);
        },
      );
      logBackupStatus('success');
    } catch (error) {
      console.error('[data-backup] 엑셀 백업/공유 오류:', error);
      logBackupStatus('fail');
      showToast('백업이 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }, [setLoading, openBackupShare, showToast]);

  const handleBackupDedicated = useCallback(async () => {
    setLoading(true);
    try {
      const { writeBackupToFile } = await import('@/utils/backup');
      const path = await writeBackupToFile();
      await openBackupShare(path, 'application/octet-stream', (_title, message) => {
        showToast(message);
      });
      logBackupStatus('success');
    } catch (error) {
      console.error('[data-backup] 전용파일 백업/공유 오류:', error);
      logBackupStatus('fail');
      showToast('백업이 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }, [setLoading, openBackupShare, showToast]);

  const handleFullReset = useCallback(() => {
    setShowResetConfirmModal(true);
  }, []);

  const runResetAndClose = useCallback(async () => {
    setShowResetConfirmModal(false);
    setLoading(true);
    try {
      await resetAppData();
      await refresh();
      await refreshWidgetWithCurrentMonth().catch(() => {});
      showToast('정상적으로 초기화가 완료 되었습니다.');
    } catch (error) {
      console.error('[data-backup] 전체 초기화 오류:', error);
      showToast('초기화 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }, [setLoading, refresh, showToast]);

  const handleRestore = useCallback(async () => {
    try {
      const DocumentPicker = await import('expo-document-picker');
      const getDocumentAsync = DocumentPicker.getDocumentAsync ?? DocumentPicker.default?.getDocumentAsync;
      if (typeof getDocumentAsync !== 'function') {
        showToast('문서 선택 기능을 사용할 수 없습니다. 개발 빌드(실기기)에서 이용해 주세요.');
        return;
      }
      const result = await getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/octet-stream',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const { uri, name } = result.assets[0];
      const lower = (name ?? uri).toLowerCase();
      if (!lower.endsWith(XLSX_FILE_EXTENSION) && !lower.endsWith(BACKUP_FILE_EXTENSION)) {
        showToast('.xlsx와 .awbak 외 확장자는 지원하지 않습니다.');
        return;
      }

      setLoading(true);
      try {
        const { restoreFromFile } = await import('@/utils/backup');
        await restoreFromFile(uri);
        await refresh();
        await refreshWidgetWithCurrentMonth().catch(() => {});
        logRestoreStatus('success');
        showToast('정상적으로 복원이 되었습니다.');
      } catch (error) {
        console.error('[data-backup] 복원 오류:', error);
        logRestoreStatus('fail');
        const errMsg = error instanceof Error ? error.message : '';
        const isValidationError = errMsg === 'RESTORE_VALIDATION_FAILED';
        const isVersionTooNew = errMsg === 'BACKUP_VERSION_TOO_NEW';
        const message = isValidationError
          ? '파일을 다시 확인해 주세요.'
          : isVersionTooNew
            ? '최신버전으로 업데이트 후 재시도 해주세요.'
            : '오류가 발생했습니다. 다시 시도해 주세요.';
        showToast(message);
      } finally {
        setLoading(false);
      }
    } catch (pickError) {
      console.error('[data-backup] 파일 선택 오류:', pickError);
      logRestoreStatus('fail');
      const isNativeModuleMissing =
        pickError instanceof Error &&
        (pickError.message.includes('Cannot find native module') ||
          pickError.message.includes('is not a function'));
      showToast(
        isNativeModuleMissing
          ? '문서 선택 기능을 사용할 수 없습니다. 개발 빌드(실기기)에서 이용해 주세요.'
          : '파일을 선택할 수 없습니다. 다시 시도해 주세요.',
      );
    }
  }, [setLoading, refresh, showToast]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <TopNavigation
        type="sub"
        title="데이터 백업/복원"
        showLeftIcon
        onLeftIconPress={() => router.back()}
      />

      <View style={[styles.background, { backgroundColor: colors.fill }]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
        >
          {/* 백업/복원 + 유의사항: 두 섹션 간 gap 16 */}
          <View style={styles.backupNoticeGroup}>
            {/* Section: 백업/복원 */}
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                백업/복원
              </Text>
              <View style={[styles.card, { backgroundColor: colors.background }]}>
                <Pressable
                  style={styles.menuRow}
                  onPress={handleBackupDedicated}
                  accessibilityRole="button"
                  accessibilityLabel="데이터 백업하기 전용파일"
                >
                  <Text style={[styles.menuLabel, { color: colors.text }]}>
                    데이터 백업하기(전용파일)
                  </Text>
                  <Icon name="arrowRight" size={24} color={colors.text} />
                </Pressable>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <Pressable
                  style={styles.menuRow}
                  onPress={handleBackupExcel}
                  accessibilityRole="button"
                  accessibilityLabel="데이터 백업하기 엑셀파일"
                >
                  <Text style={[styles.menuLabel, { color: colors.text }]}>
                    데이터 백업하기(엑셀파일)
                  </Text>
                  <Icon name="arrowRight" size={24} color={colors.text} />
                </Pressable>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <Pressable
                  style={styles.menuRow}
                  onPress={handleRestore}
                  accessibilityRole="button"
                  accessibilityLabel="데이터 복원하기"
                >
                  <Text style={[styles.menuLabel, { color: colors.text }]}>
                    데이터 복원하기
                  </Text>
                  <Icon name="arrowRight" size={24} color={colors.text} />
                </Pressable>
              </View>
            </View>

            {/* Section: 엑셀파일 백업/복원 유의사항 */}
            <View style={styles.sectionBlock}>
            <View style={[styles.card, { backgroundColor: colors.background }]}>
              <View style={styles.noticeBlock}>
                <Text
                  style={[styles.noticeTitle, { color: colors.text }]}
                  accessibilityRole="header"
                >
                  엑셀파일(.xlsx) 백업/복원 유의사항
                </Text>
                <View style={styles.noticeList}>
                  {EXCEL_BACKUP_NOTICE_ITEMS.map((item, index) => (
                    <View key={index} style={styles.noticeItem}>
                      <Text style={[styles.noticeBullet, { color: colors.textNeutral }]}>•</Text>
                      <Text style={[styles.noticeBody, { color: colors.textNeutral }]}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>
          </View>

          {/* Section: 기타 */}
          <View style={styles.sectionBlock}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>기타</Text>
            <View style={[styles.card, { backgroundColor: colors.background }]}>
              <Pressable
                style={styles.menuRow}
                onPress={handleFullReset}
                accessibilityRole="button"
                accessibilityLabel="전체 초기화"
              >
                <Text style={[styles.menuLabel, { color: colors.text }]}>
                  전체 초기화
                </Text>
                <Icon name="arrowRight" size={24} color={colors.text} />
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>

      {/* 전체 초기화 확인 */}
      <ModalPopup
        visible={showResetConfirmModal}
        title="전체 초기화 안내"
        message={RESET_CONFIRM_MESSAGE}
        cancelText="취소"
        onCancel={() => setShowResetConfirmModal(false)}
        confirmText="확인"
        onConfirm={runResetAndClose}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    flex: 1,
    paddingHorizontal: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 24,
    paddingBottom: 24,
    gap: 32,
  },
  sectionBlock: {
    gap: 0,
  },
  sectionTitle: {
    ...Typography.body1.l.bold,
    marginBottom: 8,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  menuLabel: {
    ...Typography.body1.l.regular,
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
  backupNoticeGroup: {
    gap: 16,
  },
  noticeBlock: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 8,
  },
  noticeTitle: {
    ...Typography.body2.r.bold,
  },
  noticeList: {
    gap: 4,
  },
  noticeItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  noticeBullet: {
    ...Typography.body2.r.regular,
    lineHeight: 21,
  },
  noticeBody: {
    ...Typography.body2.r.regular,
    lineHeight: 21,
    flex: 1,
  },
});
