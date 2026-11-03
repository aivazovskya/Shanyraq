import { PropertiesApi } from '../src/api/properties';
import { AuthApi } from '../src/api/auth';

/** Read-only property search. Claims and access changes stay blocked. */
export function registerPropertyFixtures() {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('pinStatus') === 'error') {
    AuthApi.getPinStatus = async () => { throw new Error('Демо: статус PIN недоступен'); };
  }
  const complexes = [
    { id: 'demo-tenant', name: 'ЖК Shanyraq', city: 'Астана', address: 'Демонстрационный адрес, 42', buildingsCount: 1 },
    { id: 'demo-empty-complex', name: 'ЖК Новый квартал', city: 'Астана', address: 'Демонстрационный адрес, 17', buildingsCount: 0 },
  ];
  PropertiesApi.searchTenants = async query => complexes.filter(item => !query || (item.name + ' ' + item.address).toLowerCase().includes(query.toLowerCase()));
  PropertiesApi.getTenantStructure = async id => {
    const complex = complexes.find(item => item.id === id);
    if (!complex) throw new Error('Демо: комплекс не найден');
    return { tenantId: complex.id, tenantName: complex.name, city: complex.city, address: complex.address,
      buildings: id === 'demo-empty-complex' ? [] : [{ id: 'demo-building', blockName: 'Блок A', floorsCount: 12, entrancesCount: 2, units: [
        { id: 'demo-unit-43', unitNumber: '43', floor: 5, entrance: 2, type: 'APARTMENT', area: 74 },
        { id: 'demo-unit-44', unitNumber: '44', floor: 5, entrance: 2, type: 'APARTMENT', area: 62 },
        { id: 'demo-unit-45', unitNumber: '45', floor: 5, entrance: 2, type: 'APARTMENT', area: 81.5 },
      ] }],
    };
  };
}
