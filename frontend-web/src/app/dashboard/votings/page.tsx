'use client';

import React, { useState } from 'react';
import {
  Vote,
  CheckCircle2,
  FileText,
  Calendar,
  ShieldCheck,
  Download,
  AlertCircle,
} from 'lucide-react';

export default function VotingsPage() {
  const [activeTab, setActiveTab] = useState('current');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Общие собрания собственников (ОСС)</h1>
          <p className="text-sm text-slate-500">
            Легитимный подсчет кворума и голосов с учетом долей полезной площади по Закону РК
          </p>
        </div>
        <button className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-xl shadow-sm transition">
          + Назначить новое собрание
        </button>
      </div>

      {/* Legal Banner */}
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" />
        <div className="text-xs text-sky-900 leading-relaxed">
          <strong>Соответствие законодательству РК:</strong> Подсчет голосов осуществляется строго в соответствии со статьями 42-1 и 42-2 Закона Республики Казахстан «О жилищных отношениях». Вес каждого голоса пропорционален площади квартиры к общей площади жилого комплекса (12 500 м²). Волеизъявление заверяется SMS-OTP кодом с фиксацией цифрового отпечатка (SHA-256).
        </div>
      </div>

      {/* Active Meeting Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-full">
                Активное голосование
              </span>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> 01 октября — 15 октября 2026 г.
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1">
              Годовое общее собрание: утверждение сметы расходов ОСИ и модернизация СКУД
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <button className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl transition flex items-center gap-2">
              <Download className="w-4 h-4" /> Промежуточный реестр
            </button>
            <button className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition flex items-center gap-2">
              <FileText className="w-4 h-4" /> Завершить и подписать протокол
            </button>
          </div>
        </div>

        {/* Quorum Stats Panel */}
        <div className="p-6 border-b border-slate-100 bg-white grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div className="text-xs text-slate-500">Общая площадь ЖК</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">12 500.0 м²</div>
            <div className="text-[11px] text-slate-400">140 жилых и коммерч. помещений</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div className="text-xs text-slate-500">Участвует в голосовании</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">6 850.0 м²</div>
            <div className="text-[11px] text-slate-500">78 квартир проголосовали</div>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
            <div className="text-xs text-emerald-800 font-medium">Текущий кворум</div>
            <div className="text-2xl font-black text-emerald-700 mt-0.5">54.8%</div>
            <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Порог &gt;50% успешно пройден
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div className="text-xs text-slate-500">Осталось времени</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">8 дней</div>
            <div className="text-[11px] text-slate-400">Автозакрытие 15.10 в 23:59</div>
          </div>
        </div>

        {/* Agenda Questions with detailed calculation */}
        <div className="p-6 space-y-6">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Вопросы повестки дня и предварительные итоги
          </h3>

          {/* Question 1 */}
          <div className="border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded">
                  Вопрос №1
                </span>
                <h4 className="text-base font-semibold text-slate-900 mt-1">
                  Утвердить тариф на управление и содержание общего имущества (ОСИ) в размере 110 тенге за 1 кв.м.
                </h4>
                <p className="text-xs text-slate-600 mt-1">
                  Тип решения: Простое большинство (&gt;50% голосов от участников кворума)
                </p>
              </div>
              <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-md">
                Решение принимается
              </span>
            </div>

            {/* Voting distribution bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-600 font-medium">
                <span>«ЗА»: 5 210 м² (76.1%)</span>
                <span>«ПРОТИВ»: 1 240 м² (18.1%)</span>
                <span>«ВОЗДЕРЖАЛИСЬ»: 400 м² (5.8%)</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                <div className="bg-emerald-500 h-full" style={{ width: '76.1%' }} title="ЗА"></div>
                <div className="bg-red-500 h-full" style={{ width: '18.1%' }} title="ПРОТИВ"></div>
                <div className="bg-slate-400 h-full" style={{ width: '5.8%' }} title="ВОЗДЕРЖАЛИСЬ"></div>
              </div>
            </div>
          </div>

          {/* Question 2 */}
          <div className="border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded">
                  Вопрос №2
                </span>
                <h4 className="text-base font-semibold text-slate-900 mt-1">
                  Утвердить установку автоматического шлагбаума Pal-ES со считыванием номеров и мобильным открытием.
                </h4>
                <p className="text-xs text-slate-600 mt-1">
                  Тип решения: Простое большинство из статьи текущего ремонта
                </p>
              </div>
              <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-md">
                Решение принимается
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-600 font-medium">
                <span>«ЗА»: 6 120 м² (89.3%)</span>
                <span>«ПРОТИВ»: 480 м² (7.0%)</span>
                <span>«ВОЗДЕРЖАЛИСЬ»: 250 м² (3.7%)</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                <div className="bg-emerald-500 h-full" style={{ width: '89.3%' }}></div>
                <div className="bg-red-500 h-full" style={{ width: '7.0%' }}></div>
                <div className="bg-slate-400 h-full" style={{ width: '3.7%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
