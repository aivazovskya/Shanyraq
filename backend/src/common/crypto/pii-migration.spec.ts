import { encryptExistingIin } from './pii-migration.helper';
import { encryptPii, hashIin, decryptPii } from './pii-crypto.helper';

describe('encrypt-existing-iin migration script', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      PII_ENCRYPTION_KEY: 'oe3FdI9y3WTxUngovENTYMvTbjf+mhQOZ85a3elnVJU=',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('идемпотентно шифрует открытые ИИН и вычисляет iinHash', async () => {
    const mockUsers = [
      { id: 'user-1', iin: '850101300111', iinHash: null },
      { id: 'user-2', iin: '880315350222', iinHash: null },
      {
        id: 'user-3',
        iin: encryptPii('920620300444'),
        iinHash: hashIin('920620300444'),
      },
    ];

    const updatedRecords: Record<string, any> = {};

    const prismaMock: any = {
      user: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve(mockUsers)),
        update: jest.fn().mockImplementation((args: any) => {
          updatedRecords[args.where.id] = args.data;
          return Promise.resolve({ id: args.where.id, ...args.data });
        }),
      },
      $disconnect: jest.fn().mockResolvedValue(undefined),
    };

    // 1. Первый прогон миграции
    const result1 = await encryptExistingIin(prismaMock);

    expect(result1.total).toBe(3);
    expect(result1.encrypted).toBe(2);
    expect(result1.skipped).toBe(1); // user-3 уже зашифрован

    // Проверяем, что user-1 и user-2 зашифрованы и имеют iinHash
    expect(updatedRecords['user-1']).toBeDefined();
    expect(updatedRecords['user-1'].iin).toMatch(/^v1:/);
    expect(decryptPii(updatedRecords['user-1'].iin)).toBe('850101300111');
    expect(updatedRecords['user-1'].iinHash).toBe(hashIin('850101300111'));

    expect(updatedRecords['user-2']).toBeDefined();
    expect(updatedRecords['user-2'].iin).toMatch(/^v1:/);
    expect(decryptPii(updatedRecords['user-2'].iin)).toBe('880315350222');
    expect(updatedRecords['user-2'].iinHash).toBe(hashIin('880315350222'));

    // 2. Второй прогон (проверка идемпотентности)
    const migratedUsers = [
      { id: 'user-1', iin: updatedRecords['user-1'].iin, iinHash: updatedRecords['user-1'].iinHash },
      { id: 'user-2', iin: updatedRecords['user-2'].iin, iinHash: updatedRecords['user-2'].iinHash },
      { id: 'user-3', iin: mockUsers[2].iin, iinHash: mockUsers[2].iinHash },
    ];

    prismaMock.user.findMany.mockResolvedValue(migratedUsers);
    prismaMock.user.update.mockClear();

    const result2 = await encryptExistingIin(prismaMock);

    expect(result2.total).toBe(3);
    expect(result2.encrypted).toBe(0);
    expect(result2.skipped).toBe(3);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('довычисляет iinHash, если значение уже зашифровано, но хеш отсутствует', async () => {
    const encryptedIin = encryptPii('950202400567')!;
    const mockUsers = [
      { id: 'user-legacy-enc', iin: encryptedIin, iinHash: null },
    ];

    const prismaMock: any = {
      user: {
        findMany: jest.fn().mockResolvedValue(mockUsers),
        update: jest.fn().mockResolvedValue({ id: 'user-legacy-enc' }),
      },
      $disconnect: jest.fn().mockResolvedValue(undefined),
    };

    const res = await encryptExistingIin(prismaMock);

    expect(res.total).toBe(1);
    expect(res.encrypted).toBe(1);
    expect(res.skipped).toBe(0);

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-legacy-enc' },
      data: { iinHash: hashIin('950202400567') },
    });
  });
});
