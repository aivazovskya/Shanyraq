'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  Search,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Home,
  ShieldCheck,
  AlertCircle,
  Layers,
} from 'lucide-react';
import { CabinetApi, ResidentProfile } from '@/lib/cabinet-api';

interface ComplexItem {
  id: string;
  name: string;
  address: string;
  city: string;
  buildingsCount: number;
}

interface UnitItem {
  id: string;
  unitNumber: string;
  floor: number;
  entrance: number;
  type: string;
  area: number;
}

interface BuildingItem {
  id: string;
  blockName: string;
  floorsCount: number;
  entrancesCount: number;
  units: UnitItem[];
}

export default function CabinetClaimUnitPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [profile, setProfile] = useState<ResidentProfile | null>(null);

  // Wizard Steps: 1 = Search Complex, 2 = Select Building & Unit, 3 = Ownership Type & Confirm
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Search complex
  const [searchQuery, setSearchQuery] = useState('');
  const [complexes, setComplexes] = useState<ComplexItem[]>([]);
  const [selectedComplex, setSelectedComplex] = useState<ComplexItem | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Step 2: Structure (buildings & units)
  const [buildings, setBuildings] = useState<BuildingItem[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingItem | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<UnitItem | null>(null);
  const [structureLoading, setStructureLoading] = useState(false);

  // Step 3: Ownership
  const [ownershipType, setOwnershipType] = useState<'OWNER' | 'TENANT'>('OWNER');
  const [sharePercent, setSharePercent] = useState('100');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial complexes load & profile load
  useEffect(() => {
    setSearchLoading(true);
    Promise.all([CabinetApi.getMe(), CabinetApi.searchTenants()])
      .then(([me, res]) => {
        setProfile(me);
        setComplexes(res || []);
      })
      .catch((e) => console.warn('Failed to load initial claim-unit data:', e))
      .finally(() => setSearchLoading(false));
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchLoading(true);
    try {
      const res = await CabinetApi.searchTenants(searchQuery.trim());
      setComplexes(res || []);
    } catch (e) {
      console.warn('Search complexes error:', e);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSelectComplex = async (complex: ComplexItem) => {
    setSelectedComplex(complex);
    setStructureLoading(true);
    try {
      const struct = await CabinetApi.getTenantStructure(complex.id);
      const bList = struct?.buildings || [];
      setBuildings(bList);
      if (bList.length > 0) {
        setSelectedBuilding(bList[0]);
      }
      setStep(2);
    } catch (e) {
      alert(t('cabinet.complexStructureLoadError'));
    } finally {
      setStructureLoading(false);
    }
  };

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnit) {
      setError(t('onboarding.selectUnitError') || 'Выберите квартиру');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await CabinetApi.claimOwnership({
        unitId: selectedUnit.id,
        ownershipType,
        sharePercent: parseInt(sharePercent, 10) || 100,
      });

      alert(t('onboarding.claimSentSuccess') || 'Заявка на привязку квартиры успешно отправлена!');
      router.push('/cabinet/profile');
    } catch (err: any) {
      setError(err?.message || 'Ошибка отправки заявки на привязку');
    } finally {
      setSubmitting(false);
    }
  };

  const existingUnitNumber = profile?.ownerships?.[0]?.unit?.unitNumber;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          {t('onboarding.claimTitle') || 'Привязать квартиру'}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {t('onboarding.claimSubtitle') ||
            'Выберите ваш жилой комплекс, подъезд и номер квартиры для отправки заявки на проверку'}
        </p>
      </div>

      {/* Notice if user already has an apartment */}
      {existingUnitNumber && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{t('cabinet.alreadyLinkedNotice', { number: existingUnitNumber })}</span>
          </div>
          <Link
            href="/cabinet"
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shrink-0 transition-colors"
          >
            {t('cabinet.returnToCabinet')}
          </Link>
        </div>
      )}

      {/* Stepper indicator */}
      <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        <span>{t('cabinet.claimStep', { current: step, total: 3 })}</span>
        <span>
          {step === 1
            ? t('cabinet.stepComplex')
            : step === 2
            ? t('cabinet.stepUnit')
            : t('cabinet.stepConfirm')}
        </span>
      </div>
      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div
          className="bg-emerald-600 h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${(step / 3) * 100}%` }}
        />
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* Step 1: Select Complex */}
      {step === 1 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            {t('onboarding.step1SelectComplex') || '1. Найдите ваш жилой комплекс'}
          </h2>

          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('onboarding.searchComplexPlaceholder') || 'Название ЖК или адрес...'}
                className="w-full py-2.5 px-3.5 pl-9 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>

            <button
              type="submit"
              disabled={searchLoading}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors"
            >
              {t('cabinet.searchBtn')}
            </button>
          </form>

          {searchLoading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {complexes.map((c) => (
                <div
                  key={c.id}
                  onClick={() => handleSelectComplex(c)}
                  className="py-3 px-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl cursor-pointer transition-colors flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center font-bold">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 transition-colors">
                        {c.name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {c.city}, {c.address}
                      </div>
                    </div>
                  </div>

                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Select Building & Unit */}
      {step === 2 && selectedComplex && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-[11px] text-slate-400">{t('cabinet.selectedComplexLabel')}</span>
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                {selectedComplex.name}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-xs text-emerald-600 hover:underline"
            >
              {t('cabinet.changeComplexBtn')}
            </button>
          </div>

          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            {t('onboarding.step2SelectUnit') || '2. Выберите блок и номер квартиры'}
          </h2>

          {/* Buildings tabs */}
          {buildings.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {buildings.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setSelectedBuilding(b);
                    setSelectedUnit(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                    selectedBuilding?.id === b.id
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {b.blockName}
                </button>
              ))}
            </div>
          )}

          {/* Units Grid */}
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-2">
              {t('cabinet.apartmentLabel')} ({selectedBuilding?.units?.length || 0}):
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-64 overflow-y-auto p-1">
              {selectedBuilding?.units?.map((u) => {
                const isSelected = selectedUnit?.id === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUnit(u)}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="text-xs font-bold">№ {u.unitNumber}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{u.area} м²</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100"
            >
              {t('cabinet.back')}
            </button>
            <button
              type="button"
              disabled={!selectedUnit}
              onClick={() => setStep(3)}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50"
            >
              {t('cabinet.continue')}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Ownership Type & Submit */}
      {step === 3 && selectedUnit && selectedComplex && (
        <form
          onSubmit={handleSubmitClaim}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4"
        >
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            {t('onboarding.step3OwnershipType') || '3. Подтверждение прав на квартиру'}
          </h2>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-xs space-y-1">
            <div>
              ЖК: <span className="font-bold text-slate-900 dark:text-white">{selectedComplex.name}</span>
            </div>
            <div>
              Блок / Подъезд:{' '}
              <span className="font-bold text-slate-900 dark:text-white">
                {selectedBuilding?.blockName}, {t('cabinet.entranceNum', { number: selectedUnit.entrance })}
              </span>
            </div>
            <div>
              {t('cabinet.apartmentLabel')}:{' '}
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                № {selectedUnit.unitNumber} ({selectedUnit.area} м², {t('cabinet.floorNum', { number: selectedUnit.floor })})
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t('onboarding.ownershipTypeLabel') || 'Тип владения'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOwnershipType('OWNER')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold text-center transition-all ${
                  ownershipType === 'OWNER'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                }`}
              >
                {t('cabinet.roleOwner')}
              </button>
              <button
                type="button"
                onClick={() => setOwnershipType('TENANT')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold text-center transition-all ${
                  ownershipType === 'TENANT'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                }`}
              >
                {t('cabinet.roleTenant')}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t('onboarding.sharePercentLabel') || 'Доля владения (%)'}
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={sharePercent}
              onChange={(e) => setSharePercent(e.target.value)}
              className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-xs font-mono"
              required
            />
          </div>

          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-xs">
            {t('onboarding.securityWarningNotice') ||
              'Заявка будет отправлена председателю ОСИ или администратору УК на проверку правоустанавливающих документов.'}
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100"
            >
              {t('cabinet.back')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-60 flex items-center gap-1.5"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>{t('onboarding.submitClaimBtn') || 'Отправить на проверку'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
