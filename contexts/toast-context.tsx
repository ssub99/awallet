import { Toast } from '@/components/ui/toast';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

interface ToastContextValue {
  showToast: (message: string) => void;
  activeHostId: number | null;
  registerHost: () => number;
  unregisterHost: (hostId: number) => void;
  markToastHandledByHost: (hostId: number, toastKey: number) => void;
  message: string;
  visible: boolean;
  toastKey: number;
  toastTargetHostId: number | null;
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
  const [visible, setVisible] = useState<boolean>(false);
  const [toastKey, setToastKey] = useState<number>(0);
  const [activeHostId, setActiveHostId] = useState<number | null>(null);
  const [toastTargetHostId, setToastTargetHostId] = useState<number | null>(null);
  const [hostedToastKey, setHostedToastKey] = useState<number | null>(null);
  const hostIdRef = useRef(0);
  const hostStackRef = useRef<number[]>([]);

  const showToast = useCallback((nextMessage: string) => {
    setToastTargetHostId(activeHostId);
    setHostedToastKey(null);
    setMessage(nextMessage);
    setToastKey((prev) => prev + 1);
    setVisible(true);
  }, [activeHostId]);

  const hideToast = useCallback(() => {
    setVisible(false);
  }, []);

  const registerHost = useCallback(() => {
    hostIdRef.current += 1;
    const hostId = hostIdRef.current;
    hostStackRef.current = [...hostStackRef.current, hostId];
    setActiveHostId(hostId);
    return hostId;
  }, []);

  const unregisterHost = useCallback((hostId: number) => {
    hostStackRef.current = hostStackRef.current.filter((id) => id !== hostId);
    const nextActive = hostStackRef.current[hostStackRef.current.length - 1] ?? null;
    setActiveHostId(nextActive);
  }, []);

  const markToastHandledByHost = useCallback((hostId: number, handledToastKey: number) => {
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
        <Toast key={toastKey} visible={visible} message={message} onHide={hideToast} />
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
    message,
    visible,
    toastKey,
    toastTargetHostId,
    hideToast,
  } = useToast();
  const hostIdRef = useRef<number | null>(null);

  React.useEffect(() => {
    const hostId = registerHost();
    hostIdRef.current = hostId;
    return () => {
      unregisterHost(hostId);
    };
  }, [registerHost, unregisterHost]);

  const isActive = activeHostId === hostIdRef.current;
  const isTargetHost = toastTargetHostId === hostIdRef.current;

  React.useEffect(() => {
    if (isActive && isTargetHost && message && visible && hostIdRef.current !== null) {
      markToastHandledByHost(hostIdRef.current, toastKey);
    }
  }, [isActive, isTargetHost, markToastHandledByHost, message, toastKey, visible]);

  if (!isActive || !isTargetHost || !message) {
    return null;
  }

  return (
    <Toast key={toastKey} visible={visible} message={message} onHide={hideToast} />
  );
};
