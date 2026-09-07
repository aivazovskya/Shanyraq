'use client';

import React, { useState } from 'react';
import {
  UserCheck,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  ExternalLink,
  ShieldCheck,
  Percent,
} from 'lucide-react';

interface VerificationItem {
  id: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    iin?: string;
  };
  unit: {
    id: string;
    unitNumber: string;
    area: number;
    building: {
      blockName: string;
    };
  };
  ownershipType: string;
  sharePercent: number;
  verificationDoc?: string;
  createdAt: string;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export default function VerificationsPage() {
  const [filter, setFilter] = useState('ALL');
  const [editingShareId, setEditingShareId] = useState<string | null>(null);
  const [approvedShares, setApprovedShares] = useState<Record<string, number>>({
    'VER-01': 100.0,
    'VER-02': 50.0,
    'VER-03': 100.0,
  });

  const [items, setItems] = useState<VerificationItem[]>([
    {
      id: 'VER-01',
      user: {
        id: 'usr-101',
        firstName: 'Бауыржан',
        lastName: 'Омаров',
        phone: '+7 701 444-55-66',
        iin: '900515300123',
      },
      unit: {
        id: 'unit-105',
        unitNumber: '105',
        area: 74.2,
        building: { blockName: 'Блок А (Подъезд 2)' },
      },
      ownershipType: 'OWNER',
      sharePercent: 100.0,
      verificationDoc: 'https://storage.shanyraq.kz/docs/spravka_egov_105.pdf',
      createdAt: 'Сегодня, 11:30',
      status: 'PENDING',
    },
    {
      id: 'VER-02',
      user: {
        id: 'usr-102',
        firstName: 'Алия',
        lastName: 'Смагулова',
        phone: '+7 702 333-22-11',
        iin: '931120400567',
      },
      unit: {
        id: 'unit-106',
        unitNumber: '106',
        area: 112.5,
        building: { blockName: 'Блок А (Подъезд 2)' },
      },
      ownershipType: 'OWNER',
      sharePercent: 50.0,
      verificationDoc: 'https://storage.shanyraq.kz/docs/dogovor_kupli_prodazhi_106.pdf',
      createdAt: 'Вчера, 16:45',
      status: 'PENDING',
    },
    {
      id: 'VER-03',
      user: {
        id: 'usr-103',
        firstName: 'Тимур',
        lastName: 'Алиев',
        phone: '+7 705 111-99-88',
      },
      unit: {
        id: 'unit-210',
        unitNumber: '210',
        area: 45.0,
        building: { blockName: 'Блок Б (Подъезд 3)' },
      },
      ownershipType: 'TENANT',
      sharePercent: 0.0,
      verificationDoc: 'https://storage.shanyraq.kz/docs/dogovor_arendy_210.pdf',
      createdAt: '05 октября 2026',
      status: 'PENDING',
    },
  ]);

  const handleApprove = (id: string) => {
    const finalShare = approvedShares[id] ?? 100.0;
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: 'APPROVED', sharePercent: finalShare } : item,
      ),
    );
  };

  const handleReject = (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'REJECTED' } : item)),
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Верификация прав собственности и владения
          </h1>
          <p className="text-sm text-slate-500">
            Проверка правоустанавливающих документов жильцов для допуска к голосованиям ОСС и СКУД
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 text-xs font-semibold border border-amber-200 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> На рассмотрении:{' '}
            {items.filter((i) => i.status === 'PENDING').length}
          </span>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" />
        <div className="text-xs text-sky-900 leading-relaxed">
          <strong>Юридическая безопасность ОСС:</strong> Право голоса на общих собраниях имеют
          исключительно подтвержденные собственники с верифицированной долей владения (в соответствии со ст.
          42-1 Закона РК «О жилищных отношениях»). Перед одобрением сверьте долю владения с прикрепленной выпиской eGov.
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Очередь заявок жильцов
          </h2>
          <span className="text-xs text-slate-500">ЖК «Шаңырақ Премиум»</span>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4">Житель</th>
              <th className="py-3 px-4">Объект / Площадь</th>
              <th className="py-3 px-4">Статус владения</th>
              <th className="py-3 px-4">Доля (%)</th>
              <th className="py-3 px-4">Документ</th>
              <th className="py-3 px-4">Дата подачи</th>
              <th className="py-3 px-4 text-right">Решение УК</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50/80 transition">
                <td className="py-3.5 px-4">
                  <div className="font-bold text-slate-900">
                    {item.user.firstName} {item.user.lastName}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">{item.user.phone}</div>
                  {item.user.iin && (
                    <div className="text-[10px] text-slate-500">ИИН: {item.user.iin}</div>
                  )}
                </td>

                <td className="py-3.5 px-4">
                  <div className="font-bold text-slate-900">
                    Кв. {item.unit.unitNumber}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {item.unit.building.blockName} • {item.unit.area} м²
                  </div>
                </td>

                <td className="py-3.5 px-4">
                  {item.ownershipType === 'OWNER' ? (
                    <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                      Собственник
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-medium">
                      Арендатор
                    </span>
                  )}
                </td>

                <td className="py-3.5 px-4">
                  {item.status === 'PENDING' ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={approvedShares[item.id] ?? item.sharePercent}
                        onChange={(e) =>
                          setApprovedShares({
                            ...approvedShares,
                            [item.id]: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-16 px-2 py-1 border border-slate-300 rounded text-center font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                      />
                      <span className="font-semibold text-slate-500">%</span>
                    </div>
                  ) : (
                    <span className="font-bold text-slate-900">{item.sharePercent}%</span>
                  )}
                </td>

                <td className="py-3.5 px-4">
                  {item.verificationDoc ? (
                    <a
                      href={item.verificationDoc}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-700 font-semibold hover:underline"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Выписка eGov</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-slate-400">Не прикреплен</span>
                  )}
                </td>

                <td className="py-3.5 px-4 text-slate-500">{item.createdAt}</td>

                <td className="py-3.5 px-4 text-right">
                  {item.status === 'PENDING' && (
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleApprove(item.id)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs shadow-sm transition flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Подтвердить
                      </button>
                      <button
                        onClick={() => handleReject(item.id)}
                        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg font-semibold text-xs transition flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Отклонить
                      </button>
                    </div>
                  )}
                  {item.status === 'APPROVED' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 font-semibold text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Подтверждено
                    </span>
                  )}
                  {item.status === 'REJECTED' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-100 text-red-800 font-semibold text-xs">
                      <XCircle className="w-3.5 h-3.5" /> Отклонено
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
