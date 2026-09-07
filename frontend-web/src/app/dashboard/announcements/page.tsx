'use client';

import React, { useState } from 'react';
import {
  Bell,
  Send,
  AlertTriangle,
  Calendar,
  User,
  CheckCircle2,
  Megaphone,
} from 'lucide-react';

interface AnnouncementItem {
  id: string;
  title: string;
  content: string;
  isUrgent: boolean;
  author: {
    firstName: string;
    lastName: string;
    role: string;
  };
  createdAt: string;
}

export default function AnnouncementsPage() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([
    {
      id: 'ANN-01',
      title: 'Плановая промывка отопительной системы ЖК',
      content:
        'Уважаемые жильцы! 15 октября с 09:00 до 18:00 будет производиться опрессовка системы отопления. Просим проверить краны Маевского и убедиться в герметичности радиаторов.',
      isUrgent: true,
      author: {
        firstName: 'Алихан',
        lastName: 'Бокейханов',
        role: 'Управляющая компания',
      },
      createdAt: 'Сегодня, 10:15',
    },
    {
      id: 'ANN-02',
      title: 'Идет электронное голосование ОСС: смета расходов на 2026 год',
      content:
        'Напоминаем, что до 15 октября проходит голосование по утверждению тарифа ОСИ. Примите участие в мобильном приложении Shanyraq.',
      isUrgent: false,
      author: {
        firstName: 'Нурсултан',
        lastName: 'Касымов',
        role: 'Председатель ОСИ',
      },
      createdAt: '01 октября 2026',
    },
    {
      id: 'ANN-03',
      title: 'Установка доводчиков на входные двери Блока Б',
      content:
        'Завершены работы по установке новых морозостойких гидравлических доводчиков на дверях 3 и 4 подъездов.',
      isUrgent: false,
      author: {
        firstName: 'Айгерим',
        lastName: 'Серикова',
        role: 'Диспетчерская служба',
      },
      createdAt: '28 сентября 2026',
    },
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsSubmitting(true);

    setTimeout(() => {
      const newItem: AnnouncementItem = {
        id: `ANN-${Date.now()}`,
        title,
        content,
        isUrgent,
        author: {
          firstName: 'Алихан',
          lastName: 'Бокейханов',
          role: 'Управляющая компания',
        },
        createdAt: 'Только что',
      };

      setAnnouncements([newItem, ...announcements]);
      setTitle('');
      setContent('');
      setIsUrgent(false);
      setIsSubmitting(false);
      setSuccessMessage('Новость успешно опубликована и разослана жильцам ЖК!');

      setTimeout(() => setSuccessMessage(null), 4000);
    }, 600);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Новости и оповещения жилого комплекса
          </h1>
          <p className="text-sm text-slate-500">
            Публикация официальных объявлений ОСИ/УК и отправка экстренных Push-уведомлений
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Announcements Feed */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Лента объявлений ЖК</h2>
            <span className="text-xs text-slate-500">Всего публикаций: {announcements.length}</span>
          </div>

          <div className="space-y-3">
            {announcements.map((item) => (
              <div
                key={item.id}
                className={`bg-white rounded-2xl border p-5 shadow-sm transition ${
                  item.isUrgent ? 'border-red-200 bg-red-50/20' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {item.isUrgent && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 animate-pulse">
                          <AlertTriangle className="w-3 h-3" /> Экстренное
                        </span>
                      )}
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {item.createdAt}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mt-1.5">{item.title}</h3>
                  </div>
                </div>

                <p className="text-xs text-slate-700 mt-2 leading-relaxed whitespace-pre-line">
                  {item.content}
                </p>

                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="flex items-center gap-1 font-medium">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    {item.author.firstName} {item.author.lastName} ({item.author.role})
                  </span>
                  <span className="text-emerald-700 font-medium">Доставлено жителям</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Col: Publication Form */}
        <div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm sticky top-6">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-base mb-4">
              <Megaphone className="w-5 h-5 text-sky-600" />
              <span>Создать объявление</span>
            </div>

            {successMessage && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Заголовок объявления *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: Плановые гидравлические испытания"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Текст сообщения *
                </label>
                <textarea
                  rows={5}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Подробное описание ситуации, даты и инструкции для жителей..."
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-sky-500 resize-none"
                />
              </div>

              <div className="pt-1">
                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-200 bg-amber-50/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isUrgent}
                    onChange={(e) => setIsUrgent(e.target.checked)}
                    className="mt-0.5 rounded text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-amber-900 block">
                      Экстренное оповещение (Push)
                    </span>
                    <span className="text-[11px] text-amber-700 block mt-0.5">
                      Мгновенно отправить громкое Push-уведомление всем жильцам (аварии, отключения)
                    </span>
                  </div>
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <span>Отправка...</span>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Опубликовать новость</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
