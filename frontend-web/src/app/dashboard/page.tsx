'use client';

import React from 'react';
import {
  Vote,
  Wrench,
  KeyRound,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  AlertTriangle,
  Building,
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Сводка по ЖК «Шаңырақ Премиум»</h1>
          <p className="text-sm text-slate-500">
            Актуальное состояние жилого фонда, собраний и диспетчерской службы
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/votings"
            className="inline-flex items-center px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-xl shadow-sm transition"
          >
            + Новое собрание ОСС
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Кворум ОСС
            </span>
            <div className="p-2 bg-sky-50 text-sky-600 rounded-xl">
              <Vote className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">54.8%</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Кворум состоялся (&gt;50%)</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Заявки в работе
            </span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Wrench className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">3</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500 font-medium">
              <Clock className="w-3.5 h-3.5" />
              <span>Среднее время ответа: 14 мин</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Проездов шлагбаума
            </span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <KeyRound className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">182</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-indigo-600 font-medium">
              <span>За сегодня (без сбоев)</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Жилой фонд
            </span>
            <div className="p-2 bg-slate-100 text-slate-600 rounded-xl">
              <Building className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">140 кв.</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500 font-medium">
              <span>12 500 м² суммарно</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Two Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Active ОСС Voting */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Текущее собрание ОСС</h2>
              <p className="text-xs text-slate-500">Электронное голосование собственников</p>
            </div>
            <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-full">
              Идет голосование (до 15 окт)
            </span>
          </div>

          <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <div className="font-semibold text-slate-800 text-sm">
              Годовое собрание: утверждение сметы расходов ОСИ и модернизация СКУД
            </div>
            <p className="text-xs text-slate-600">
              Повестка включает утверждение тарифа 110 тг/м² и установку автоматических шлагбаумов со считыванием госномеров.
            </p>

            {/* Quorum Progress Bar */}
            <div>
              <div className="flex justify-between text-xs font-medium text-slate-700 mb-1.5">
                <span>Прогресс кворума: 6 850 м² из 12 500 м²</span>
                <span className="font-bold text-sky-700">54.8% (Кворум набран!)</span>
              </div>
              <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden flex">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: '54.8%' }}
                ></div>
              </div>
              <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                <span>0%</span>
                <span className="font-semibold text-slate-600">Порог кворума: 50.0%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-slate-200/60 text-xs">
              <span className="text-slate-500">Проголосовало квартир: 78 из 140</span>
              <Link
                href="/dashboard/votings"
                className="text-sky-600 hover:text-sky-700 font-semibold inline-flex items-center gap-1"
              >
                Детали протокола <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Right Column: Pending Service Requests */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900">Срочные заявки</h2>
            <Link href="/dashboard/requests" className="text-xs text-sky-600 font-semibold hover:underline">
              Все заявки
            </Link>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/50">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-amber-900">Кв. 101 (Блок А)</span>
                <span className="text-red-700 font-medium bg-red-100 px-2 py-0.5 rounded">Срочно</span>
              </div>
              <p className="text-xs text-slate-700 mt-1 font-medium">
                Слабый напор горячей воды в ванной
              </p>
              <div className="text-[11px] text-slate-500 mt-1">
                Назначен: Дежурный сантехник • 25 мин назад
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">Кв. 42 (Блок А)</span>
                <span className="text-sky-700 font-medium bg-sky-100 px-2 py-0.5 rounded">В работе</span>
              </div>
              <p className="text-xs text-slate-700 mt-1 font-medium">
                Сбой связи домофонной панели подъезда 1
              </p>
              <div className="text-[11px] text-slate-500 mt-1">
                Назначен: Мастер СКУД • 1 час назад
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
