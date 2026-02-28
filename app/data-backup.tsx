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
import { refreshWidgetWithCurrentMonth } from '@/utils/widget-data-sync';
import {
  BACKUP_FILE_EXTENSION,
  restoreFromFile,
  writeBackupToFile,
  writeExcelToFile,
  XLSX_FILE_EXTENSION,
} from '@/utils/backup';
import { resetAppData } from '@/utils/reset-app-data';
import * as DocumentPicker from 'expo-document-picker';
import * as MailComposer from 'expo-mail-composer';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ModalPopup } from '@/components/ui/modal-popup';

const EMAIL_SUBJECT_BACKUP = '[AWallet] 데이터 백업';
const EMAIL_BODY_BACKUP = 'AWallet 데이터 백업 파일이 첨부되어 있습니다.';
const SHARE_DIALOG_TITLE = '데이터 백업 파일 보내기';

/**
 * 백업 파일을 시스템 공유 시트로 연다.
 * - 기본 메일 앱이면 해당 앱, 써드파티 메일 앱을 기본으로 설정해 두었으면 그 앱으로 전달된다.
 * - 공유 불가 시(시뮬레이터 등) 메일 컴포저로 폴백한다.
 * - 공유/메일 모두 불가 시 onUnavailable 호출.
 */
async function openShareOrMail(
  filePath: string,
  mimeType: string,
  onUnavailable?: (title: string, message: string) => void,
): Promise<void> {
  const sharingAvailable = await Sharing.isAvailableAsync();
  if (sharingAvailable) {
    await Sharing.shareAsync(filePath, {
      mimeType: Platform.OS === 'android' ? mimeType : undefined,
      dialogTitle: Platform.OS === 'android' ? SHARE_DIALOG_TITLE : undefined,
    });
    return;
  }

  const mailAvailable = await MailComposer.isAvailableAsync();
  if (!mailAvailable) {
    onUnavailable?.(
      '공유/이메일 사용 불가',
      '이 기기에서 파일을 보낼 수 없습니다. 메일 앱이 설정되어 있는지 확인해 주세요.',
    );
    return;
  }
  await MailComposer.composeAsync({
    subject: EMAIL_SUBJECT_BACKUP,
    body: EMAIL_BODY_BACKUP,
    attachments: [filePath],
  });
}

const RESET_CONFIRM_MESSAGE =
  '전체 데이터를 초기화 하시겠어요?\n생성된 데이터가 모두 초기화 되고\n초기 상태로 설정 됩니다.';

export default function DataBackupScreen() {
  const colorScheme = useColorScheme();
  const colors = ThemeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const { setLoading } = useLoading();
  const { showToast } = useToast();
  const { refresh } = useAppData();

  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [showResetErrorModal, setShowResetErrorModal] = useState(false);
  const [showBackupErrorModal, setShowBackupErrorModal] = useState(false);
  const [backupErrorTitle, setBackupErrorTitle] = useState('');
  const [backupErrorMessage, setBackupErrorMessage] = useState('');

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
      const path = await writeExcelToFile();
      await openBackupShare(
        path,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        (title, message) => {
          setBackupErrorTitle(title);
          setBackupErrorMessage(message);
          setShowBackupErrorModal(true);
        },
      );
    } catch (error) {
      console.error('[data-backup] 엑셀 백업/공유 오류:', error);
      setBackupErrorTitle('백업 실패');
      setBackupErrorMessage('엑셀 파일 백업 또는 보내기 열기에 실패했습니다. 다시 시도해 주세요.');
      setShowBackupErrorModal(true);
    } finally {
      setLoading(false);
    }
  }, [setLoading, openBackupShare]);

  const handleBackupDedicated = useCallback(async () => {
    setLoading(true);
    try {
      const path = await writeBackupToFile();
      await openBackupShare(path, 'application/octet-stream', (title, message) => {
        setBackupErrorTitle(title);
        setBackupErrorMessage(message);
        setShowBackupErrorModal(true);
      });
    } catch (error) {
      console.error('[data-backup] 전용파일 백업/공유 오류:', error);
      setBackupErrorTitle('백업 실패');
      setBackupErrorMessage('전용 파일 백업 또는 보내기 열기에 실패했습니다. 다시 시도해 주세요.');
      setShowBackupErrorModal(true);
    } finally {
      setLoading(false);
    }
  }, [setLoading, openBackupShare]);

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
      setShowResetErrorModal(true);
    } finally {
      setLoading(false);
    }
  }, [setLoading, refresh, showToast]);

  const handleRestore = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
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
        setBackupErrorTitle('복원 실패');
        setBackupErrorMessage(
          '지원하는 형식은 엑셀(.xlsx)과 전용 백업(.awbak) 파일입니다.',
        );
        setShowBackupErrorModal(true);
        return;
      }

      setLoading(true);
      try {
        await restoreFromFile(uri);
        await refresh();
        await refreshWidgetWithCurrentMonth().catch(() => {});
        showToast('정상적으로 복원이 되었습니다.');
      } catch (error) {
        console.error('[data-backup] 복원 오류:', error);
        setBackupErrorTitle('복원 실패');
        setBackupErrorMessage(
          error instanceof Error ? error.message : '복원 중 오류가 발생했습니다. 다시 시도해 주세요.',
        );
        setShowBackupErrorModal(true);
      } finally {
        setLoading(false);
      }
    } catch (pickError) {
      console.error('[data-backup] 파일 선택 오류:', pickError);
      setBackupErrorTitle('복원 실패');
      setBackupErrorMessage('파일을 선택할 수 없습니다. 다시 시도해 주세요.');
      setShowBackupErrorModal(true);
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
        >
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

      {/* 전체 초기화 실패 */}
      <ModalPopup
        visible={showResetErrorModal}
        title="초기화 실패"
        message="초기화 중 오류가 발생했습니다. 다시 시도해 주세요."
        confirmText="확인"
        onConfirm={() => setShowResetErrorModal(false)}
      />

      {/* 백업/복원 실패 · 공유·이메일 불가 */}
      <ModalPopup
        visible={showBackupErrorModal}
        title={backupErrorTitle}
        message={backupErrorMessage}
        confirmText="확인"
        onConfirm={() => setShowBackupErrorModal(false)}
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
});
