'use client';

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageOff, Loader2, X } from 'lucide-react';
import { Dialog } from './Dialog';

export function ImagePreview({ src, onClose }: { src: string; onClose: () => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  return <Dialog variant="image" labelledBy={titleId} onClose={onClose} closeOnBackdrop>
    <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
      <h2 id={titleId} className="text-sm font-semibold text-white">{t('common.imagePreview')}</h2>
      <button type="button" onClick={onClose} aria-label={t('common.close')}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white">
        <X size={20} aria-hidden="true" />
      </button>
    </div>
    <div className="relative flex min-h-40 items-center justify-center p-3 sm:p-6" aria-busy={state === 'loading'}>
      {state === 'loading' && <div role="status" className="absolute flex items-center gap-2 text-sm text-slate-300"><Loader2 size={20} className="animate-spin" />{t('common.loading')}</div>}
      {state === 'error' ? <div role="alert" className="flex flex-col items-center gap-3 py-10 text-sm text-slate-300"><ImageOff size={32} />{t('common.imageLoadError')}</div> :
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={t('common.imagePreview')} onLoad={() => setState('ready')} onError={() => setState('error')}
          className={`max-h-[calc(100dvh-10rem)] max-w-full rounded-lg object-contain ${state === 'loading' ? 'opacity-0' : ''}`} />}
    </div>
  </Dialog>;
}
