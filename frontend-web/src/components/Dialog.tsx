'use client';

import { useEffect, useRef, ReactNode } from 'react';

/** Native modality supplies focus containment and makes the background inert. */
export function Dialog({ children, labelledBy, onClose }: { children: ReactNode; labelledBy: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      previousFocus?.focus();
    };
  }, []);

  return <dialog ref={dialogRef} aria-labelledby={labelledBy}
    onCancel={(event) => { event.preventDefault(); close.current(); }}
    className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-950/50">
    {children}
  </dialog>;
}
