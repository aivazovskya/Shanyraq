import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { assertUserBelongsToTenant } from '../../common/guards/tenant.guard';

export interface UserContext {
  id?: string;
  tenantId?: string | null;
  role?: UserRole;
}

export interface ResidentSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  unitNumber: string;
}

export interface RequestSearchResult {
  id: string;
  title: string;
  status: string;
  createdAt: Date | string;
}

export interface AccountSearchResult {
  id: string;
  accountNumber: string;
  unitNumber: string;
  balance: number;
}

export interface GlobalSearchResult {
  residents: ResidentSearchResult[];
  requests: RequestSearchResult[];
  accounts: AccountSearchResult[];
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    tenantId: string,
    user: UserContext,
    q: string,
  ): Promise<GlobalSearchResult> {
    assertUserBelongsToTenant(user, tenantId, 'поиска');

    const term = q?.trim() || '';
    if (term.length < 2) {
      return { residents: [], requests: [], accounts: [] };
    }

    // 1. Residents: verified residents of the tenant whose firstName/lastName/phone contains q (insensitive), capped take: 5
    const residentsPromise = this.prisma.user.findMany({
      where: {
        ownerships: {
          some: {
            isVerified: true,
            unit: {
              building: {
                tenantId,
              },
            },
          },
        },
        OR: [
          { firstName: { contains: term, mode: 'insensitive' as const } },
          { lastName: { contains: term, mode: 'insensitive' as const } },
          { phone: { contains: term, mode: 'insensitive' as const } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        ownerships: {
          where: {
            isVerified: true,
            unit: {
              building: {
                tenantId,
              },
            },
          },
          select: {
            unit: {
              select: {
                unitNumber: true,
              },
            },
          },
          take: 1,
        },
      },
      take: 5,
    });

    // 2. Requests: serviceRequest rows for the tenant whose title/description contains q (insensitive), capped take: 5, newest first
    const requestsPromise = this.prisma.serviceRequest.findMany({
      where: {
        tenantId,
        OR: [
          { title: { contains: term, mode: 'insensitive' as const } },
          { description: { contains: term, mode: 'insensitive' as const } },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // 3. Accounts: only queried when user.role is SUPERADMIN, HOA_ADMIN, or HOA_CHAIRMAN (decision #3)
    const canViewAccounts =
      user.role === UserRole.SUPERADMIN ||
      user.role === UserRole.HOA_ADMIN ||
      user.role === UserRole.HOA_CHAIRMAN;

    const accountsPromise = canViewAccounts
      ? this.prisma.personalAccount.findMany({
          where: {
            unit: {
              building: {
                tenantId,
              },
            },
            OR: [
              { accountNumber: { contains: term, mode: 'insensitive' as const } },
              { unit: { unitNumber: { contains: term, mode: 'insensitive' as const } } },
            ],
          },
          select: {
            id: true,
            accountNumber: true,
            balance: true,
            unit: {
              select: {
                unitNumber: true,
              },
            },
          },
          take: 5,
        })
      : Promise.resolve([]);

    const [residentsData, requestsData, accountsData] = await Promise.all([
      residentsPromise,
      requestsPromise,
      accountsPromise,
    ]);

    return {
      residents: residentsData.map((r) => ({
        id: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        phone: r.phone,
        unitNumber: r.ownerships[0]?.unit?.unitNumber ?? '',
      })),
      requests: requestsData.map((req) => ({
        id: req.id,
        title: req.title,
        status: req.status,
        createdAt: req.createdAt,
      })),
      accounts: accountsData.map((acc) => ({
        id: acc.id,
        accountNumber: acc.accountNumber,
        unitNumber: acc.unit?.unitNumber ?? '',
        balance: acc.balance,
      })),
    };
  }
}
