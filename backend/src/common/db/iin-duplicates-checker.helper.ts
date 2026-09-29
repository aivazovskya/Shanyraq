import { PrismaClient } from '@prisma/client';

export interface UserDuplicateInfo {
  id: string;
  tenantId: string | null;
  role: string;
  createdAt: Date;
}

export interface DuplicateGroup {
  groupIndex: number;
  count: number;
  users: UserDuplicateInfo[];
}

export interface CheckDuplicatesResult {
  hasDuplicates: boolean;
  totalUsersWithHash: number;
  duplicateGroupsCount: number;
  groups: DuplicateGroup[];
}

/**
 * Проверка базы данных на наличие дубликатов iinHash перед наложением ограничения @unique.
 * ВНИМАНИЕ: Строго запрещено возвращать или логировать значение самого ИИН (ПДн).
 */
export async function checkIinHashDuplicates(
  prisma: Pick<PrismaClient, 'user'>,
): Promise<CheckDuplicatesResult> {
  // Находим все записи, у которых iinHash задан и не пуст
  const usersWithHash = await prisma.user.findMany({
    where: {
      iinHash: {
        not: null,
      },
      NOT: {
        iinHash: '',
      },
    },
    select: {
      id: true,
      tenantId: true,
      role: true,
      iinHash: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  // Группируем пользователей в памяти по iinHash
  const groupsMap = new Map<string, UserDuplicateInfo[]>();

  for (const user of usersWithHash) {
    if (!user.iinHash) continue;
    const existing = groupsMap.get(user.iinHash) || [];
    existing.push({
      id: user.id,
      tenantId: user.tenantId,
      role: String(user.role),
      createdAt: user.createdAt,
    });
    groupsMap.set(user.iinHash, existing);
  }

  const groups: DuplicateGroup[] = [];
  let groupIndex = 1;

  for (const [, users] of groupsMap.entries()) {
    if (users.length > 1) {
      groups.push({
        groupIndex: groupIndex++,
        count: users.length,
        users,
      });
    }
  }

  return {
    hasDuplicates: groups.length > 0,
    totalUsersWithHash: usersWithHash.length,
    duplicateGroupsCount: groups.length,
    groups,
  };
}

/**
 * Формирование текстового отчета без раскрытия персональных данных.
 */
export function formatDuplicateReport(result: CheckDuplicatesResult): string {
  const lines: string[] = [];

  lines.push('=====================================================');
  lines.push('  PRE-MIGRATION CHECK: User.iinHash duplicates audit');
  lines.push('=====================================================');
  lines.push(`Total users with iinHash: ${result.totalUsersWithHash}`);

  if (!result.hasDuplicates) {
    lines.push('✅ No duplicate iinHash records found.');
    lines.push('Safe to apply migration 0_init / @unique constraint.');
    return lines.join('\n');
  }

  lines.push(`❌ FOUND ${result.duplicateGroupsCount} GROUP(S) OF DUPLICATE iinHash RECORDS!`);
  lines.push('Applying unique constraint now will fail.');
  lines.push('Please resolve conflicting users before applying database migrations.\n');

  for (const group of result.groups) {
    lines.push(`--- Duplicate Group #${group.groupIndex} (${group.count} accounts) ---`);
    for (const u of group.users) {
      lines.push(
        `  • User ID: ${u.id} | Tenant ID: ${u.tenantId || 'none'} | Role: ${u.role} | CreatedAt: ${u.createdAt.toISOString()}`,
      );
    }
  }

  lines.push('\n[SECURITY NOTE] IIN values are strictly masked and never displayed in this audit log.');
  return lines.join('\n');
}
