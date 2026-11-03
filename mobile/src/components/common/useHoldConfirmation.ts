import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { createHoldConfirmation } from '../../utils/hold-confirmation';

export function useHoldConfirmation({ disabled, loading, duration, onConfirmed }: {
  disabled: boolean; loading: boolean; duration: number; onConfirmed: () => void | Promise<void>;
}) {
  const [isHolding, setIsHolding] = useState(false);
  const [failed, setFailed] = useState(false);
  const current = useRef({ disabled, loading, onConfirmed });
  current.current = { disabled, loading, onConfirmed };
  const control = useRef<ReturnType<typeof createHoldConfirmation> | null>(null);
  useEffect(() => {
    setIsHolding(false);
    const next = createHoldConfirmation({
      duration,
      canConfirm: () => !current.current.disabled && !current.current.loading && AppState.currentState === 'active',
      onHolding: setIsHolding,
      onConfirm: () => current.current.onConfirmed(),
      onError: () => setFailed(true),
    });
    control.current = next;
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') next.cancel(); });
    return () => { next.dispose(); subscription.remove(); if (control.current === next) control.current = null; };
  }, [duration]);
  useEffect(() => { if (disabled || loading) control.current?.cancel(); }, [disabled, loading]);
  return {
    isHolding, failed,
    startHold: () => { setFailed(false); control.current?.start(); },
    cancelHold: () => control.current?.cancel(),
  };
}
