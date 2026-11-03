export interface HoldClock {
  schedule: (callback: () => void, delay: number) => unknown;
  cancel: (handle: unknown) => void;
}

const clock: HoldClock = {
  schedule: (callback, delay) => setTimeout(callback, delay),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** One uninterrupted hold produces at most one request. Disposing cancels pending holds. */
export function createHoldConfirmation({ duration, canConfirm, onConfirm, onHolding, onError, timer = clock }: {
  duration: number; canConfirm: () => boolean; onConfirm: () => void | Promise<void>;
  onHolding: (holding: boolean) => void; onError: () => void; timer?: HoldClock;
}) {
  let handle: unknown = null;
  let disposed = false;
  let pending = false;
  const cancel = () => {
    if (handle !== null) timer.cancel(handle);
    handle = null;
    if (!disposed) onHolding(false);
  };
  return {
    start() {
      if (disposed || pending || handle !== null || !Number.isFinite(duration) || duration <= 0 || !canConfirm()) return;
      onHolding(true);
      handle = timer.schedule(() => {
        handle = null;
        if (disposed) return;
        onHolding(false);
        if (!canConfirm() || pending) return;
        pending = true;
        try {
          Promise.resolve(onConfirm()).catch(() => { if (!disposed) onError(); }).finally(() => { pending = false; });
        } catch {
          pending = false;
          if (!disposed) onError();
        }
      }, duration);
    },
    cancel,
    dispose() { disposed = true; cancel(); },
  };
}
