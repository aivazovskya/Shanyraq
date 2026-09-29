import {
  checkIinHashDuplicates,
  formatDuplicateReport,
} from './iin-duplicates-checker.helper';

describe('iin-duplicates-checker.helper', () => {
  it('возвращает hasDuplicates: false, если в БД нет записей с одинаковым iinHash', async () => {
    const mockPrisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'user-1',
            tenantId: 'tenant-1',
            role: 'RESIDENT_OWNER',
            iinHash: 'hash-aaa-111',
            createdAt: new Date('2026-01-01'),
          },
          {
            id: 'user-2',
            tenantId: 'tenant-2',
            role: 'RESIDENT_OWNER',
            iinHash: 'hash-bbb-222',
            createdAt: new Date('2026-01-02'),
          },
        ]),
      },
    };

    const result = await checkIinHashDuplicates(mockPrisma as any);
    expect(result.hasDuplicates).toBe(false);
    expect(result.totalUsersWithHash).toBe(2);
    expect(result.duplicateGroupsCount).toBe(0);
    expect(result.groups).toHaveLength(0);

    const report = formatDuplicateReport(result);
    expect(report).toContain('✅ No duplicate iinHash records found.');
  });

  it('возвращает hasDuplicates: true и группирует записи при наличии дубликатов iinHash', async () => {
    const mockPrisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'user-1',
            tenantId: 'tenant-1',
            role: 'RESIDENT_OWNER',
            iinHash: 'duplicate-hash-123',
            createdAt: new Date('2026-01-01'),
          },
          {
            id: 'user-2',
            tenantId: 'tenant-2',
            role: 'RESIDENT_OWNER',
            iinHash: 'duplicate-hash-123',
            createdAt: new Date('2026-01-02'),
          },
          {
            id: 'user-3',
            tenantId: 'tenant-1',
            role: 'HOA_ADMIN',
            iinHash: 'unique-hash-456',
            createdAt: new Date('2026-01-03'),
          },
        ]),
      },
    };

    const result = await checkIinHashDuplicates(mockPrisma as any);
    expect(result.hasDuplicates).toBe(true);
    expect(result.totalUsersWithHash).toBe(3);
    expect(result.duplicateGroupsCount).toBe(1);
    expect(result.groups[0].count).toBe(2);
    expect(result.groups[0].users.map((u) => u.id)).toEqual(['user-1', 'user-2']);

    const report = formatDuplicateReport(result);
    expect(report).toContain('❌ FOUND 1 GROUP(S) OF DUPLICATE iinHash RECORDS!');
    expect(report).toContain('user-1');
    expect(report).toContain('user-2');
    expect(report).toContain('tenant-1');
    expect(report).toContain('tenant-2');
  });

  it('СТРОГО НЕ печатает значения ИИН в отчёте', async () => {
    const rawIin = '900101300123';
    const mockPrisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'user-dup-1',
            tenantId: 'tenant-alpha',
            role: 'RESIDENT_OWNER',
            iinHash: 'some-hash-val',
            createdAt: new Date('2026-01-01'),
          },
          {
            id: 'user-dup-2',
            tenantId: 'tenant-beta',
            role: 'RESIDENT_OWNER',
            iinHash: 'some-hash-val',
            createdAt: new Date('2026-01-02'),
          },
        ]),
      },
    };

    const result = await checkIinHashDuplicates(mockPrisma as any);
    const report = formatDuplicateReport(result);

    expect(report).not.toContain(rawIin);
    expect(report).toContain('IIN values are strictly masked and never displayed');
    expect(report).toContain('user-dup-1');
    expect(report).toContain('user-dup-2');
  });
});
