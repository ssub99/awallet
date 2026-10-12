import { Toast } from '@/components/ui/toast';
import React, { createContext, useCallback, useContext, useId, useMemo, useRef, useState } from 'react';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastContextValue {
  showToast: (message: string, action?: ToastAction) => void;
  action: ToastAction | null;
  activeHostId: string | null;
  registerHost: (hostId: string) => void;
  unregisterHost: (hostId: string) => void;
  markToastHandledByHost: (hostId: string, toastKey: number) => void;
  message: string;
  visible: boolean;
  toastKey: number;
  toastTargetHostId: string | null;
  hideToast: () => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};

interface ToastProviderProps {
  children: React.ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [message, setMessage] = useState<string>('');
  const [action, setAction] = useState<ToastAction | null>(null);
  const [visible, setVisible] = useState<boolean>(false);
  const [toastKey, setToastKey] = useState<number>(0);
  const [activeHostId, setActiveHostId] = useState<string | null>(null);
  const [toastTargetHostId, setToastTargetHostId] = useState<string | null>(null);
  const [hostedToastKey, setHostedToastKey] = useState<number | null>(null);
  const hostStackRef = useRef<string[]>([]);

  const showToast = useCallback((nextMessage: string, nextAction?: ToastAction) => {
    setToastTargetHostId(activeHostId);
    setHostedToastKey(null);
    setMessage(nextMessage);
    setAction(nextAction ?? null);
    setToastKey((prev) => prev + 1);
    setVisible(true);
  }, [activeHostId]);

  const hideToast = useCallback(() => {
    setVisible(false);
  }, []);

  const registerHost = useCallback((hostId: string) => {
    hostStackRef.current = [...hostStackRef.current, hostId];
    setActiveHostId(hostId);
  }, []);

  const unregisterHost = useCallback((hostId: string) => {
    hostStackRef.current = hostStackRef.current.filter((id) => id !== hostId);
    const nextActive = hostStackRef.current[hostStackRef.current.length - 1] ?? null;
    setActiveHostId(nextActive);
  }, []);

  const markToastHandledByHost = useCallback((hostId: string, handledToastKey: number) => {
    setHostedToastKey((prev) => {
      if (hostId !== toastTargetHostId || prev === handledToastKey) {
        return prev;
      }
      return handledToastKey;
    });
  }, [toastTargetHostId]);

  const shouldRenderGlobalToast =
    activeHostId === null &&
    message &&
    (toastTargetHostId === null || hostedToastKey !== toastKey);

  const value = useMemo(
    () => ({
      showToast,
      action,
      activeHostId,
      registerHost,
      unregisterHost,
      markToastHandledByHost,
      message,
      visible,
      toastKey,
      toastTargetHostId,
      hideToast,
    }),
    [
      action,
      activeHostId,
      hideToast,
      markToastHandledByHost,
      message,
      registerHost,
      showToast,
      toastKey,
      toastTargetHostId,
      unregisterHost,
      visible,
    ],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {shouldRenderGlobalToast ? (
        <Toast
          key={toastKey}
          visible={visible}
          message={message}
          onHide={hideToast}
          actionLabel={action?.label}
          onActionPress={action?.onPress}
        />
      ) : null}
    </ToastContext.Provider>
  );
};

export const ToastHost: React.FC = () => {
  const {
    registerHost,
    unregisterHost,
    markToastHandledByHost,
    activeHostId,
    action,
    message,
    visible,
    toastKey,
    toastTargetHostId,
    hideToast,
  } = useToast();
  const hostId = useId();

  React.useEffect(() => {
    registerHost(hostId);
    return () => {
      unregisterHost(hostId);
    };
  }, [hostId, registerHost, unregisterHost]);

  const isActive = activeHostId === hostId;
  const isTargetHost = toastTargetHostId === hostId;

  React.useEffect(() => {
    if (isActive && isTargetHost && message && visible) {
      markToastHandledByHost(hostId, toastKey);
    }
  }, [hostId, isActive, isTargetHost, markToastHandledByHost, message, toastKey, visible]);

  if (!isActive || !isTargetHost || !message) {
    return null;
  }

  return (
    <Toast
      key={toastKey}
      visible={visible}
      message={message}
      onHide={hideToast}
      actionLabel={action?.label}
      onActionPress={action?.onPress}
    />
  );
};
