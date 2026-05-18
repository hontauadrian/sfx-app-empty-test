import { Inject, Injectable } from '@nestjs/common';
import type {
  CompanyInfo,
  CompanyInfoEditor,
  CompanyInfoRepository,
  CompanyInfoVersion,
  ListCompanyInfoVersionsInput,
  ListCompanyInfoVersionsResult,
  UpsertCompanyInfoInput,
} from '@sfx/domain';
import { Prisma, type PrismaClient } from '@sfx/database';
import { toCompanyInfo, toPrismaUpsertData } from '../mapper/company-info.mapper';
import {
  toCompanyInfoVersion,
  toVersionSnapshotJson,
} from '../mapper/company-info-version.mapper';
import { PRISMA_CLIENT } from './company-info.tokens';

type CompanyInfoTx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

@Injectable()
export class CompanyInfoPrismaRepository implements CompanyInfoRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async findSingleton(): Promise<CompanyInfo | null> {
    const row = await this.prisma.companyInfo.findFirst();
    return row ? toCompanyInfo(row) : null;
  }

  async upsertSingleton(
    input: UpsertCompanyInfoInput,
    editor: CompanyInfoEditor,
  ): Promise<CompanyInfo> {
    const data = toPrismaUpsertData(input);
    return this.prisma.$transaction(async (tx: CompanyInfoTx) => {
      const existing = await tx.companyInfo.findFirst();
      const row = existing
        ? await tx.companyInfo.update({ where: { id: existing.id }, data })
        : await tx.companyInfo.create({ data });
      const companyInfo = toCompanyInfo(row);
      await tx.companyInfoVersion.create({
        data: {
          companyInfoId: companyInfo.id,
          snapshot: toVersionSnapshotJson(companyInfo) as Prisma.InputJsonValue,
          editorUserId: editor.editorUserId,
          editorDisplayName: editor.editorDisplayName,
        },
      });
      return companyInfo;
    });
  }

  async listVersions(
    input: ListCompanyInfoVersionsInput,
  ): Promise<ListCompanyInfoVersionsResult> {
    const take = input.take;
    const cursorRow = input.cursor
      ? await this.prisma.companyInfoVersion.findUnique({ where: { id: input.cursor } })
      : null;
    if (input.cursor && !cursorRow) {
      // Unknown cursor: return empty page rather than 500. Mirrors
      // common cursor-pagination semantics (Linear, GitHub).
      return { items: [], nextCursor: null };
    }
    const rows = await this.prisma.companyInfoVersion.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursorRow
        ? {
            where: {
              OR: [
                { createdAt: { lt: cursorRow.createdAt } },
                {
                  createdAt: cursorRow.createdAt,
                  id: { lt: cursorRow.id },
                },
              ],
            },
          }
        : {}),
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      items: page.map(toCompanyInfoVersion),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async findVersionById(id: string): Promise<CompanyInfoVersion | null> {
    const row = await this.prisma.companyInfoVersion.findUnique({ where: { id } });
    return row ? toCompanyInfoVersion(row) : null;
  }
}
