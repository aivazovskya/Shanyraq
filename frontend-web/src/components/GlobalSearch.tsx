'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Search, Loader2, X, User, ClipboardList, CreditCard } from 'lucide-react';
import { apiRequest, getStoredSession } from '@/lib/api';

interface ResidentResult {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  unitNumber: string;
}

interface RequestResult {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

interface AccountResult {
  id: string;
  accountNumber: string;
  unitNumber: string;
  balance: number;
}

interface SearchResponse {
  residents: ResidentResult[];
  requests: RequestResult[];
  accounts: AccountResult[];
}

export function GlobalSearch() {
  const { t } = useTranslation();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResponse>({
    residents: [],
    requests: [],
    accounts: [],
  });
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [needsScope, setNeedsScope] = useState(false);
  const [error, setError] = useState(false);
  const requestId = useRef(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Determine active tenantId
  useEffect(() => {
    const session = getStoredSession();
    if (!session || !session.user) return;

    if (session.user.tenantId) {
      setTenantId(session.user.tenantId);
    } else if (session.user.role === 'SUPERADMIN') {
      setNeedsScope(true);
      apiRequest<{ id: string; name: string }[]>('/properties/tenants')
        .then((tenants) => {
          setTenants(tenants || []);
        })
        .catch(() => setError(true));
    }
  }, []);

  useEffect(() => () => {
    requestId.current++;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
  }, []);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const executeSearch = useCallback(
    async (searchQuery: string) => {
      const id = ++requestId.current;
      const trimmed = searchQuery.trim();
      if (trimmed.length < 2 || !tenantId) {
        setResults({ residents: [], requests: [], accounts: [] });
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(false);
      try {
        const data = await apiRequest<SearchResponse>(
          `/search/tenants/${tenantId}?q=${encodeURIComponent(trimmed)}`,
        );
        if (data && id === requestId.current) {
          setResults(data);
        }
      } catch {
        if (id === requestId.current) {
          setResults({ residents: [], requests: [], accounts: [] });
          setError(true);
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [tenantId],
  );

  // Debounced input change (300ms)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    requestId.current++;
    setQuery(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (val.trim().length >= 2) {
      setIsOpen(true);
      setLoading(true);
      debounceTimerRef.current = setTimeout(() => {
        executeSearch(val);
      }, 300);
    } else {
      setLoading(false);
      setResults({ residents: [], requests: [], accounts: [] });
    }
  };

  const handleClear = () => {
    requestId.current++;
    setLoading(false);
    setError(false);
    setQuery('');
    setResults({ residents: [], requests: [], accounts: [] });
    setIsOpen(false);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    inputRef.current?.focus();
  };

  const handleSelect = (category: 'residents' | 'requests' | 'finance') => {
    const trimmed = query.trim();
    setIsOpen(false);
    router.push(`/dashboard/${category}?q=${encodeURIComponent(trimmed)}`);
  };

  const hasResults =
    results.residents.length > 0 ||
    results.requests.length > 0 ||
    results.accounts.length > 0;

  const isQueryValid = query.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative w-full" onKeyDown={(event) => { if (event.key === 'Escape') { setIsOpen(false); inputRef.current?.focus(); } }}>
      {needsScope && <select aria-label={t('shell.searchScope')} value={tenantId || ''}
        className="mb-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
        onChange={(event) => { requestId.current++; if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); setTenantId(event.target.value || null); setQuery(''); setResults({ residents: [], requests: [], accounts: [] }); setIsOpen(false); setLoading(false); setError(false); }}>
        <option value="">{t('shell.searchScope')}</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
      </select>}
      {needsScope && !tenantId && error && <div role="alert" className="mb-2 text-xs text-red-700"><p>{t('shell.searchError')}</p><button onClick={() => {
        setError(false);
        apiRequest<{ id: string; name: string }[]>('/properties/tenants').then((items) => setTenants(items || [])).catch(() => setError(true));
      }} className="mt-1 underline">{t('common.refresh')}</button></div>}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          aria-label={t('globalSearch.placeholder')}
          aria-expanded={isOpen && isQueryValid}
          aria-controls="global-search-results"
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            if (isQueryValid && (hasResults || !loading)) {
              setIsOpen(true);
            }
          }}
          placeholder={needsScope && !tenantId ? t('shell.searchScope') : t('globalSearch.placeholder')}
          disabled={needsScope && !tenantId}
          className="w-full bg-slate-50 hover:bg-slate-100 focus:bg-white text-xs text-slate-900 pl-9 pr-8 py-2 rounded-lg border border-slate-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all outline-none"
        />
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600 absolute right-2.5" />
        ) : query ? (
          <button
            aria-label={t('shell.clearSearch')}
            onClick={handleClear}
            className="absolute right-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>

      {/* Popover Dropdown */}
      {isOpen && isQueryValid && (
        <div id="global-search-results" aria-live="polite" className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
              <span>{t('globalSearch.searching')}</span>
            </div>
          ) : error ? (
            <div className="p-4 text-sm text-slate-600"><p>{t('shell.searchError')}</p><button className="mt-2 font-semibold text-sky-700" onClick={() => executeSearch(query)}>{t('common.refresh')}</button></div>
          ) : !hasResults ? (
            <div className="p-4 text-center text-xs text-slate-500">
              {t('globalSearch.noResults')}
            </div>
          ) : (
            <div className="py-2 divide-y divide-slate-100">
              {/* Residents Section */}
              {results.residents.length > 0 && (
                <div className="p-2">
                  <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3 h-3 text-sky-600" />
                    {t('globalSearch.residents')}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {results.residents.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => handleSelect('residents')}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-50 flex items-center justify-between text-xs text-slate-700 transition group"
                      >
                        <div className="truncate">
                          <span className="font-medium text-slate-900 group-hover:text-sky-600">
                            {r.firstName} {r.lastName}
                          </span>
                          <span className="text-slate-400 ml-2">{r.phone}</span>
                        </div>
                        {r.unitNumber && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-50 text-sky-700 border border-sky-200 shrink-0">
                            {t('globalSearch.unitPrefix')} {r.unitNumber}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Requests Section */}
              {results.requests.length > 0 && (
                <div className="p-2">
                  <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <ClipboardList className="w-3 h-3 text-amber-600" />
                    {t('globalSearch.requests')}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {results.requests.map((req) => (
                      <button
                        key={req.id}
                        onClick={() => handleSelect('requests')}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-50 flex items-center justify-between text-xs text-slate-700 transition group"
                      >
                        <div className="truncate font-medium text-slate-900 group-hover:text-amber-600">
                          {req.title}
                        </div>
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0 font-mono">
                          {req.status}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Accounts Section (only renders if non-empty, matching decision #3) */}
              {results.accounts.length > 0 && (
                <div className="p-2">
                  <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CreditCard className="w-3 h-3 text-emerald-600" />
                    {t('globalSearch.accounts')}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {results.accounts.map((acc) => (
                      <button
                        key={acc.id}
                        onClick={() => handleSelect('finance')}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-50 flex items-center justify-between text-xs text-slate-700 transition group"
                      >
                        <div className="truncate">
                          <span className="font-medium text-slate-900 group-hover:text-emerald-600">
                            {acc.accountNumber}
                          </span>
                          {acc.unitNumber && (
                            <span className="text-slate-400 ml-2">
                              ({t('globalSearch.unitPrefix')} {acc.unitNumber})
                            </span>
                          )}
                        </div>
                        <span
                          className={`ml-2 text-[11px] font-semibold shrink-0 ${
                            acc.balance < 0 ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          {acc.balance} ₸
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
