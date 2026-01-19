import { Icon } from '@/components/ui/icon';
import { AtomicColors } from '@/constants/atomic-colors';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type CustomKeypadOperator = 'add' | 'sub' | 'mul' | 'div';

type KeyType =
  | 'digit'
  | 'operator'
  | 'equal'
  | 'clear'
  | 'delete'
  | 'confirm';

export interface ExpressionToken {
  type: 'number' | 'operator';
  value: string;
}

interface KeyDefinition {
  type: KeyType;
  label: string;
  value?: string;
  compact?: boolean;
}

export interface CustomKeypadProps {
  value?: string;
  onValueChange?: (value: string) => void;
  onConfirm?: (value: string) => void;
  onOperatorChange?: (operator: CustomKeypadOperator | null) => void;
  onExpressionChange?: (tokens: ExpressionToken[]) => void;
}

const OPERATOR_ORDER: CustomKeypadOperator[] = ['add', 'sub', 'mul', 'div'];

const KEY_ROWS: KeyDefinition[][] = [
  [
    { type: 'digit', label: '1', value: '1' },
    { type: 'digit', label: '2', value: '2' },
    { type: 'digit', label: '3', value: '3' },
    { type: 'operator', label: '연산', compact: true },
  ],
  [
    { type: 'digit', label: '4', value: '4' },
    { type: 'digit', label: '5', value: '5' },
    { type: 'digit', label: '6', value: '6' },
    { type: 'equal', label: '계산', compact: true },
  ],
  [
    { type: 'digit', label: '7', value: '7' },
    { type: 'digit', label: '8', value: '8' },
    { type: 'digit', label: '9', value: '9' },
    { type: 'clear', label: 'AC', compact: true },
  ],
  [
    { type: 'digit', label: '00', value: '00' },
    { type: 'digit', label: '0', value: '0' },
    { type: 'delete', label: '삭제' },
    { type: 'confirm', label: '확인', compact: true },
  ],
];

const stripNonDigits = (input: string) => input.replace(/\D/g, '');

const formatNumber = (raw: string) => {
  if (!raw) return '';
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return '';
  return numeric.toLocaleString();
};

const normalizeNumberString = (value: string) => {
  if (!value) return '';
  const normalized = value.replace(/^0+(?=\d)/, '');
  return normalized === '' ? '0' : normalized;
};

const getNextOperator = (current: CustomKeypadOperator | null): CustomKeypadOperator => {
  if (!current) return OPERATOR_ORDER[0];
  const index = OPERATOR_ORDER.indexOf(current);
  return OPERATOR_ORDER[(index + 1) % OPERATOR_ORDER.length];
};

const formatResultNumber = (result: number) => {
  const resultString = result.toString();
  if (!resultString.includes('.')) {
    return resultString;
  }

  return resultString.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
};

const getLastNumberValue = (tokens: ExpressionToken[]) => {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (token.type === 'number') {
      return token.value;
    }
  }
  return '';
};

const getLastOperatorValue = (tokens: ExpressionToken[]) => {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (token.type === 'operator') {
      return token.value as CustomKeypadOperator;
    }
  }
  return null;
};

const evaluateTokens = (tokens: ExpressionToken[]) => {
  if (tokens.length < 3 || tokens[tokens.length - 1]?.type !== 'number') {
    return getLastNumberValue(tokens);
  }

  const first = Number(tokens[0]?.value ?? '');
  if (!Number.isFinite(first)) {
    return '';
  }

  let result = first;
  for (let index = 1; index < tokens.length - 1; index += 2) {
    const operatorToken = tokens[index];
    const numberToken = tokens[index + 1];
    if (operatorToken?.type !== 'operator' || numberToken?.type !== 'number') {
      break;
    }

    const nextNumber = Number(numberToken.value);
    if (!Number.isFinite(nextNumber)) {
      break;
    }

    switch (operatorToken.value) {
      case 'add':
        result += nextNumber;
        break;
      case 'sub':
        result -= nextNumber;
        break;
      case 'mul':
        result *= nextNumber;
        break;
      case 'div':
        result = nextNumber === 0 ? result : result / nextNumber;
        break;
      default:
        break;
    }
  }

  return formatResultNumber(result);
};

export function CustomKeypad({
  value,
  onValueChange,
  onConfirm,
  onOperatorChange,
  onExpressionChange,
}: CustomKeypadProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;

  const [tokens, setTokens] = useState<ExpressionToken[]>([]);
  const [operatorSelection, setOperatorSelection] = useState<CustomKeypadOperator | null>(null);
  const deleteIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokensRef = useRef<ExpressionToken[]>([]);
  const operatorSelectionRef = useRef<CustomKeypadOperator | null>(null);

  useEffect(() => {
    if (value === undefined) return;
    if (tokens.length > 1) return;

    const nextValue = stripNonDigits(value);
    const nextTokens = nextValue ? [{ type: 'number', value: nextValue }] : [];
    const isSame =
      tokens.length === nextTokens.length &&
      tokens[0]?.type === nextTokens[0]?.type &&
      tokens[0]?.value === nextTokens[0]?.value;

    if (isSame) return;

    setTokens(nextTokens);
    onExpressionChange?.(nextTokens);
    onOperatorChange?.(null);
  }, [onExpressionChange, onOperatorChange, tokens, value]);

  useEffect(() => {
    return () => {
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
        deleteTimeoutRef.current = null;
      }
      if (deleteIntervalRef.current) {
        clearInterval(deleteIntervalRef.current);
        deleteIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    tokensRef.current = tokens;
    operatorSelectionRef.current = operatorSelection;
  }, [operatorSelection, tokens]);

  const emitState = useCallback(
    (nextTokens: ExpressionToken[], nextOperatorSelection: CustomKeypadOperator | null) => {
      setTokens(nextTokens);
      setOperatorSelection(nextOperatorSelection);
      onExpressionChange?.(nextTokens);
      const lastNumber = getLastNumberValue(nextTokens);
      onValueChange?.(formatNumber(lastNumber));
      onOperatorChange?.(getLastOperatorValue(nextTokens));
    },
    [onExpressionChange, onOperatorChange, onValueChange]
  );

  const handleDigitPress = useCallback(
    (digit: string) => {
      const lastToken = tokens[tokens.length - 1];
      if (!lastToken || lastToken.type === 'operator') {
        const nextNumber = normalizeNumberString(
          digit === '0' || digit === '00' ? '0' : digit
        );
        emitState([...tokens, { type: 'number', value: nextNumber }], null);
        return;
      }

      const nextValue = normalizeNumberString(
        lastToken.value === '0' && digit !== '0' && digit !== '00'
          ? digit
          : lastToken.value + digit
      );
      const nextTokens = [...tokens.slice(0, -1), { type: 'number', value: nextValue }];
      emitState(nextTokens, null);
    },
    [emitState, tokens]
  );

  const handleOperatorPress = useCallback(() => {
    const hasNumber = tokens.some((token) => token.type === 'number');
    if (!hasNumber) return;

    const lastToken = tokens[tokens.length - 1];
    const baseOperator =
      lastToken?.type === 'operator' ? getLastOperatorValue(tokens) ?? operatorSelection : null;
    const nextOperator = getNextOperator(baseOperator);

    if (lastToken?.type === 'operator') {
      const nextTokens = [...tokens.slice(0, -1), { type: 'operator', value: nextOperator }];
      emitState(nextTokens, nextOperator);
      return;
    }

    emitState([...tokens, { type: 'operator', value: nextOperator }], nextOperator);
  }, [emitState, operatorSelection, tokens]);

  const handleClear = useCallback(() => {
    emitState([], null);
  }, [emitState]);

  const handleDelete = useCallback(() => {
    if (tokens.length === 0) return;
    const lastToken = tokens[tokens.length - 1];
    if (lastToken.type === 'operator') {
      emitState(tokens.slice(0, -1), null);
      return;
    }

    const nextValue = lastToken.value.slice(0, -1);
    if (!nextValue) {
      emitState(tokens.slice(0, -1), operatorSelection);
      return;
    }

    const nextTokens = [...tokens.slice(0, -1), { type: 'number', value: nextValue }];
    emitState(nextTokens, operatorSelection);
  }, [emitState, operatorSelection, tokens]);

  const handleDeleteWithRefs = useCallback(() => {
    const currentTokens = tokensRef.current;
    if (currentTokens.length === 0) return;

    const lastToken = currentTokens[currentTokens.length - 1];
    if (lastToken.type === 'operator') {
      emitState(currentTokens.slice(0, -1), null);
      return;
    }

    const nextValue = lastToken.value.slice(0, -1);
    if (!nextValue) {
      emitState(currentTokens.slice(0, -1), operatorSelectionRef.current);
      return;
    }

    const nextTokens = [...currentTokens.slice(0, -1), { type: 'number', value: nextValue }];
    emitState(nextTokens, operatorSelectionRef.current);
  }, [emitState]);

  const handleEqual = useCallback(() => {
    const isComplete =
      tokens.length >= 3 &&
      tokens[tokens.length - 1]?.type === 'number' &&
      tokens.some((token) => token.type === 'operator');
    if (!isComplete) return;

    const result = evaluateTokens(tokens);
    const nextTokens = result ? [{ type: 'number', value: result }] : [];
    emitState(nextTokens, null);
  }, [emitState, tokens]);

  const handleConfirm = useCallback(() => {
    const lastNumber = getLastNumberValue(tokens);
    onConfirm?.(formatNumber(lastNumber));
  }, [onConfirm, tokens]);

  const handleDeletePressIn = useCallback(() => {
    if (deleteTimeoutRef.current) {
      clearTimeout(deleteTimeoutRef.current);
    }
    if (deleteIntervalRef.current) {
      clearInterval(deleteIntervalRef.current);
    }
    deleteTimeoutRef.current = setTimeout(() => {
      deleteIntervalRef.current = setInterval(() => {
        handleDeleteWithRefs();
      }, 120);
    }, 250);
  }, [handleDeleteWithRefs]);

  const handleDeletePressOut = useCallback(() => {
    if (deleteTimeoutRef.current) {
      clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = null;
    }
    if (deleteIntervalRef.current) {
      clearInterval(deleteIntervalRef.current);
      deleteIntervalRef.current = null;
    }
  }, []);

  const renderKeyContent = (key: KeyDefinition) => {
    switch (key.type) {
      case 'digit':
        return <Text style={[styles.numberText, { color: colors.textNeutral }]}>{key.label}</Text>;
      case 'operator':
        return <Icon name="operation" size={24} color={colors.textStrong} />;
      case 'equal':
        return <Icon name="operationEqual" size={24} color={colors.textStrong} />;
      case 'clear':
        return <Text style={[styles.clearText, { color: colors.text }]}>{key.label}</Text>;
      case 'delete':
        return <Icon name="keypadDelete" size={24} color={colors.textStrong} />;
      case 'confirm':
        return <Text style={[styles.confirmText, { color: colors.staticWhite }]}>{key.label}</Text>;
      default:
        return null;
    }
  };

  const handleKeyPress = (key: KeyDefinition) => {
    switch (key.type) {
      case 'digit':
        if (key.value) {
          handleDigitPress(key.value);
        }
        break;
      case 'operator':
        handleOperatorPress();
        break;
      case 'equal':
        handleEqual();
        break;
      case 'clear':
        handleClear();
        break;
      case 'delete':
        handleDelete();
        break;
      case 'confirm':
        handleConfirm();
        break;
      default:
        break;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.keypadSection}>
        {KEY_ROWS.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} style={styles.row}>
            {row.map((key, keyIndex) => {
              const isConfirm = key.type === 'confirm';
              const isAction = key.type === 'operator' || key.type === 'equal' || key.type === 'clear';
              const isDelete = key.type === 'delete';
              const isDigit = key.type === 'digit';
              const buttonStyle = [
                styles.keyButton,
                key.compact && styles.keyButtonCompact,
                (isAction || isDelete) && styles.keyButtonAction,
                isConfirm && { backgroundColor: colors.primary },
              ];
              return (
                <Pressable
                  key={`key-${rowIndex}-${keyIndex}`}
                  style={({ pressed }) => [
                    ...buttonStyle,
                    pressed && (isDigit ? styles.keyButtonDigitPressed : styles.keyButtonPressed),
                  ]}
                  onPress={key.type === 'delete' ? handleDelete : () => handleKeyPress(key)}
                  onPressIn={key.type === 'delete' ? handleDeletePressIn : undefined}
                  onPressOut={key.type === 'delete' ? handleDeletePressOut : undefined}
                  onTouchCancel={key.type === 'delete' ? handleDeletePressOut : undefined}
                  onTouchEnd={key.type === 'delete' ? handleDeletePressOut : undefined}
                  accessibilityRole="button"
                  accessibilityLabel={key.label}
                >
                  {renderKeyContent(key)}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.homeIndicator}>
        <View style={styles.homeIndicatorLine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  keypadSection: {
    paddingHorizontal: 8,
    paddingTop: 16,
    rowGap: 8,
  },
  row: {
    flexDirection: 'row',
    columnGap: 8,
  },
  keyButton: {
    width: 84,
    height: 48,
    borderRadius: 8,
    backgroundColor: AtomicColors.common[0],
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyButtonCompact: {
    width: 83,
  },
  keyButtonAction: {
    backgroundColor: AtomicColors.coolNeutral[50],
  },
  keyButtonPressed: {
    opacity: 0.7,
  },
  keyButtonDigitPressed: {
    backgroundColor: AtomicColors.coolNeutral[100],
  },
  numberText: {
    ...Typography.headline3.m.regular,
  },
  clearText: {
    ...Typography.headline4.r.regular,
  },
  confirmText: {
    ...Typography.button1.l.bold,
  },
  homeIndicator: {
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeIndicatorLine: {
    width: 135,
    height: 1,
    backgroundColor: AtomicColors.neutral[100],
  },
});
