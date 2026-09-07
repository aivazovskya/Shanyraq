'use client';

import React, { useState } from 'react';
import {
  KeyRound,
  ShieldCheck,
  Video,
  Car,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCw,
} from 'lucide-react';

export default function AccessPage() {
  const [opening, setOpening] = useState(false);
  const [lastOpened, setLastOpened] = useState<string | null>(null);

  const handleOpenBarrier = () => {
    setOpening(true);
    setTimeout(() => {
      setOpening(false);
      setLastOpened(new Date().toLocaleTimeString('ru-RU'));
    }, 1200);
  };

  const sampleLogs = [
    {
      id: 'LOG-451',
      time: '13:38:12',
      point: 'Главный шлагбаум (Въезд)',
      action: 'Открытие через мобильное приложение',
      user: 'Арман Жумабаев (Кв. 101)',
      plate: '012 KZ 01',
      status: 'SUCCESS',
    },
    {
      id: 'LOG-450',
      time: '13:15:04',
      point: 'Главный шлагбаум (Въезд)',
      action: 'Гостевой код доступа',
      user: 'Гость кв. 42 (Руслан)',
      plate: '777 KZ 01',
      status: 'SUCCESS',
    },
    {
      id: 'LOG-449',
      time: '12:54:30',
      point: 'Главный шлагбаум (Въезд)',
      action: 'Ручное открытие с пульта охраны',
      user: 'Ерлан (Пост охраны)',
      plate: 'Курьер / Спецтранспорт',
      status: 'SUCCESS',
    },
    {
      id: 'LOG-448',
      time: '11:42:19',
      point: 'Главный шлагбаум (Въезд)',
      action: 'Мобильное приложение (Отказ)',
      user: 'Неподтвержденный профиль (+7 705 ***-**-99)',
      plate: '—',
      status: 'DENIED',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">СКУД, Шлагбаумы и Видеонаблюдение</h1>
          <p className="text-sm text-slate-500">
            Контроль доступа на придомовую территорию и журнал въездов автотранспорта
          </p>
        </div>
      </div>

      {/* Control cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Barrier Quick Action */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Шлагбаум — Въезд
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                Контроллер онлайн
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-2">
              Шлагбаум №1 (ул. Достык)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Оборудование: Pal-ES GSM/Cloud Relay. Задержка срабатывания: 0.6 сек.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <button
              onClick={handleOpenBarrier}
              disabled={opening}
              className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm text-white shadow-md flex items-center justify-center gap-2 transition ${
                opening
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95'
              }`}
            >
              {opening ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  Подача сигнала на реле...
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  Открыть шлагбаум вручную
                </>
              )}
            </button>
            {lastOpened && (
              <div className="text-center text-[11px] text-emerald-600 font-medium mt-2">
                ✓ Последнее открытие: {lastOpened}
              </div>
            )}
          </div>
        </div>

        {/* Video Camera Preview */}
        <div className="md:col-span-2 bg-slate-950 rounded-2xl p-4 shadow-sm text-white flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2 font-medium">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
              <span>LIVE • Камера №1 (Въездной шлагбаум и КПП)</span>
            </div>
            <span className="text-slate-400 font-mono">Dahua NVR • go2rtc WebRTC 1080p</span>
          </div>

          {/* Video Placeholder Area */}
          <div className="h-48 my-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-slate-500">
            <Video className="w-10 h-10 text-slate-600 mb-2" />
            <div className="text-xs font-medium text-slate-400">Трансляция видеопотока реального времени</div>
            <div className="text-[11px] text-slate-600">Шлюз: go2rtc (минимальная задержка 0.2с)</div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800">
            <span>Распознавание госномеров: активно</span>
            <span className="text-emerald-400 font-semibold">Система функционирует штатно</span>
          </div>
        </div>
      </div>

      {/* Access Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Неизменяемый журнал проездов и открытий (Audit Trail)
          </h2>
          <span className="text-xs text-slate-500">Последние 100 событий</span>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4">Время</th>
              <th className="py-3 px-4">Точка доступа</th>
              <th className="py-3 px-4">Пользователь / Квартира</th>
              <th className="py-3 px-4">Госномер авто</th>
              <th className="py-3 px-4">Тип действия</th>
              <th className="py-3 px-4 text-right">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {sampleLogs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50/80 transition">
                <td className="py-3 px-4 font-mono text-slate-500">{log.time}</td>
                <td className="py-3 px-4 font-semibold text-slate-900">{log.point}</td>
                <td className="py-3 px-4">{log.user}</td>
                <td className="py-3 px-4 font-mono font-bold text-slate-800">{log.plate}</td>
                <td className="py-3 px-4 text-slate-600">{log.action}</td>
                <td className="py-3 px-4 text-right">
                  {log.status === 'SUCCESS' ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                      Разрешено
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-semibold">
                      Отклонено
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
