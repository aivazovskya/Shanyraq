'use client';

import { useEffect, useRef, ReactNode } from 'react';

let openDialogs = 0;
let originalOverflow = '';

/** Native modality supplies focus containment and makes the background inert. */
export function Dialog({ children, labelledBy, onClose, wide = false, variant = 'panel', closeOnEscape = true, closeOnBackdrop = false }: {
  children: ReactNode; labelledBy: string; onClose: () => void; wide?: boolean;
  variant?: 'panel' | 'drawer' | 'image'; closeOnEscape?: boolean; closeOnBackdrop?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    if (openDialogs++ === 0) originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      if (--openDialogs === 0) document.body.style.overflow = originalOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialogRef} aria-labelledby={labelledBy}
    onCancel={(event) => { event.preventDefault(); if (closeOnEscape) close.current(); }}
    onClick={(event) => {
      if (!closeOnBackdrop || event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close.current();
    }}
    className={`app-dialog overscroll-contain p-0 shadow-2xl backdrop:bg-slate-950/60 ${
      variant === 'drawer' ? 'm-0 ml-auto h-dvh max-h-none w-full max-w-md overflow-hidden rounded-l-2xl border-0 bg-white' :
      variant === 'image' ? 'm-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto rounded-2xl border-0 bg-slate-950 text-white' :
      `m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] ${wide ? 'max-w-3xl' : 'max-w-2xl'} overflow-y-auto rounded-2xl border border-slate-200 bg-white`
    }`}>
    {children}
  </dialog>;
}
