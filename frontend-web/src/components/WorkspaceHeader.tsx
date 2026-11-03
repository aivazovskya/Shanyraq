import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function WorkspaceHeader({ title, description, eyebrow, icon: Icon, actions }: {
  title: string; description: string; eyebrow?: string; icon: LucideIcon; actions?: ReactNode;
}) {
  return <header className="workspace-hero rounded-3xl border border-white p-5 sm:p-7">
    <div className="flex flex-col items-start justify-between gap-5 xl:flex-row">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white bg-white/80 text-sky-700 shadow-sm sm:flex"><Icon size={24} aria-hidden="true" /></span>
        <div className="min-w-0">
          {eyebrow && <p className="mb-2 text-xs font-semibold text-sky-700">{eyebrow}</p>}
          <h1 className="page-title text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:max-w-[48%]">{actions}</div>}
    </div>
  </header>;
}
