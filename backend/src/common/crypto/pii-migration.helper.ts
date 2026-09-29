import { PrismaClient } from '@prisma/client';
import {
  encryptPii,
  hashIin,
  decryptPii,
  validatePiiCryptoConfig,
} from './pii-crypto.helper';

export interface MigrationResult {
  total: number;
  encrypted: number;
  skipped: number;
}

/**
 * Идемпотентная миграция существующих ИИН в зашифрованный формат (v1:iv:tag:ciphertext)
 * и вычисление детерминированного HMAC-SHA256 хеша (iinHash) для поиска.
 */
export async function encryptExistingIin(prismaClient?: PrismaClient): Promise<MigrationResult> {
  validatePiiCryptoConfig();

  const prisma = prismaClient || new PrismaClient();
  let encrypted = 0;
  let skipped = 0;

  try {
    const usersWithIin = await prisma.user.findMany({
      where: {
        iin: {
          not: null,
        },
      },
      select: {
        id: true,
        iin: true,
        iinHash: true,
      },
    });

    const total = usersWithIin.length;

    for (const user of usersWithIin) {
      if (!user.iin) {
        skipped++;
        continue;
      }

      const isAlreadyEncrypted = user.iin.startsWith('v1:');

      if (isAlreadyEncrypted && user.iinHash) {
        // Уже зашифрован и хеширован — пропускаем (идемпотентность)
        skipped++;
        continue;
      }

      if (isAlreadyEncrypted && !user.iinHash) {
        // Зашифрован, но нет хеша — расшифровываем и вычисляем хеш
        const plainIin = decryptPii(user.iin);
        const computedHash = plainIin ? hashIin(plainIin) : null;
        await prisma.user.update({
          where: { id: user.id },
          data: { iinHash: computedHash },
        });
        encrypted++;
        continue;
      }

      // Открытый текст — шифруем и вычисляем хеш
      const encryptedIin = encryptPii(user.iin);
      const computedHash = hashIin(user.iin);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          iin: encryptedIin,
          iinHash: computedHash,
        },
      });
      encrypted++;
    }

    return { total, encrypted, skipped };
  } finally {
    if (!prismaClient) {
      await prisma.$disconnect();
    }
  }
}
