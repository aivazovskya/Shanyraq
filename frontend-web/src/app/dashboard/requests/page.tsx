'use client';

import React, { useState } from 'react';
import {
  Wrench,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
  Star,
  UserCheck,
} from 'lucide-react';

export default function RequestsPage() {
  const [filterStatus, setFilterStatus] = useState('ALL');

  const sampleRequests = [
    {
      id: 'REQ-101',
      unit: 'Кв. 101 (Блок А)',
      resident: 'Арман Жумабаев (+7 701 555-01-01)',
      category: 'Сантехника',
      title: 'Слабый напор горячей воды в ванной',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      assignee: 'Азамат (Дежурный сантехник)',
      time: '25 минут назад',
      commentsCount: 2,
    },
    {
      id: 'REQ-102',
      unit: 'Кв. 42 (Блок А)',
      resident: 'Айбек Нурланов (+7 701 333-22-11)',
      category: 'Домофония / СКУД',
      title: 'Сбой связи домофонной панели подъезда 1',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      assignee: 'Мастер СКУД (Подрядчик)',
      time: '1 час назад',
      commentsCount: 1,
    },
    {
      id: 'REQ-103',
      unit: 'Кв. 205 (Блок Б)',
      resident: 'Мурат Искаков (+7 701 555-02-05)',
      category: 'Электрика',
      title: 'Не горит освещение на лестничной площадке 5 этажа',
      status: 'PENDING',
      priority: 'LOW',
      assignee: 'Не назначен',
      time: '2 часа назад',
      commentsCount: 0,
    },
    {
      id: 'REQ-100',
      unit: 'Кв. 102 (Блок А)',
      resident: 'Динара Ахметова (+7 701 555-01-02)',
      category: 'Сантехника',
      title: 'Замена шарового крана на стояке ХВС',
      status: 'CLOSED',
      priority: 'MEDIUM',
      assignee: 'Азамат (Дежурный сантехник)',
      time: 'Вчера',
      rating: 5,
      feedback: 'Мастер пришел вовремя, работу выполнил аккуратно!',
      commentsCount: 3,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Service Desk (Заявки жителей)</h1>
          <p className="text-sm text-slate-500">
            Прием обращений, контроль сроков исполнения (SLA) и координация мастеров
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Поиск по квартире, телефону, теме..."
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-sky-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          {['ALL', 'PENDING', 'IN_PROGRESS', 'CLOSED'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                filterStatus === status
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {status === 'ALL' && 'Все заявки'}
              {status === 'PENDING' && 'Новые'}
              {status === 'IN_PROGRESS' && 'В работе'}
              {status === 'CLOSED' && 'Завершенные'}
            </button>
          ))}
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4">№ Заявки</th>
              <th className="py-3 px-4">Объект / Житель</th>
              <th className="py-3 px-4">Тема и категория</th>
              <th className="py-3 px-4">Приоритет</th>
              <th className="py-3 px-4">Статус</th>
              <th className="py-3 px-4">Исполнитель</th>
              <th className="py-3 px-4 text-right">Действие</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {sampleRequests
              .filter((r) => filterStatus === 'ALL' || r.status === filterStatus)
              .map((req) => (
                <tr key={req.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{req.id}</td>
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-900">{req.unit}</div>
                    <div className="text-[11px] text-slate-400">{req.resident}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-medium text-slate-800">{req.title}</div>
                    <div className="text-[11px] text-sky-600 font-medium mt-0.5">{req.category}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    {req.priority === 'HIGH' && (
                      <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
                        Срочно
                      </span>
                    )}
                    {req.priority === 'MEDIUM' && (
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                        Средний
                      </span>
                    )}
                    {req.priority === 'LOW' && (
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                        Обычный
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    {req.status === 'PENDING' && (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                        <Clock className="w-3.5 h-3.5" /> Новая
                      </span>
                    )}
                    {req.status === 'IN_PROGRESS' && (
                      <span className="inline-flex items-center gap-1 text-sky-700 font-medium">
                        <Wrench className="w-3.5 h-3.5" /> В работе
                      </span>
                    )}
                    {req.status === 'CLOSED' && (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Выполнена
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="text-slate-900 font-medium">{req.assignee}</div>
                    {req.rating && (
                      <div className="flex items-center gap-1 text-amber-500 mt-0.5 font-bold">
                        <Star className="w-3 h-3 fill-amber-400" /> {req.rating}.0
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button className="px-3 py-1.5 border border-slate-300 hover:bg-slate-100 rounded-lg font-semibold text-slate-700 transition">
                      Управление
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
