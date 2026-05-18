import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@sfx/database';
import type {
  GuidelineSearchGroup,
  GuidelineSearchItem,
  GuidelineSearchRepository,
  GuidelineSearchRequest,
  GuidelineSearchResult,
  GuidelineSearchSection,
} from '@sfx/domain';
import { BRAND_GUIDELINES_PRISMA_CLIENT } from './brand-guidelines.tokens';

const FRAGMENT_RADIUS = 100;
const FRAGMENT_MAX = 200;

interface DmmfModelMap {
  readonly modelMap?: Record<string, unknown>;
}

interface PrismaClientWithDmmf extends PrismaClient {
  readonly _dmmf?: DmmfModelMap;
}

function buildFragment(value: string, query: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.length <= FRAGMENT_MAX) return trimmed;
  const lowerValue = trimmed.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const hitIndex = lowerQuery ? lowerValue.indexOf(lowerQuery) : -1;
  if (hitIndex < 0) {
    return `${trimmed.slice(0, FRAGMENT_MAX - 1)}…`;
  }
  const start = Math.max(0, hitIndex - FRAGMENT_RADIUS);
  const end = Math.min(trimmed.length, hitIndex + lowerQuery.length + FRAGMENT_RADIUS);
  let slice = trimmed.slice(start, end);
  if (start > 0) slice = `…${slice}`;
  if (end < trimmed.length) slice = `${slice}…`;
  if (slice.length > FRAGMENT_MAX) {
    slice = slice.slice(0, FRAGMENT_MAX - 1) + '…';
  }
  return slice;
}

@Injectable()
export class GuidelineSearchPrismaRepository implements GuidelineSearchRepository {
  constructor(
    @Inject(BRAND_GUIDELINES_PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  async searchByBrand(input: GuidelineSearchRequest): Promise<GuidelineSearchResult> {
    const query = input.query.trim();
    if (query.length === 0) {
      return { query: '', brandId: input.brandId, groups: [] };
    }

    const groups: GuidelineSearchGroup[] = [];

    const dosDontsGroup = await this.searchDosDonts(input.brandId, query);
    if (dosDontsGroup.items.length > 0) groups.push(dosDontsGroup);

    const metadataGroup = await this.searchMetadata(input.brandId, query);
    if (metadataGroup.items.length > 0) groups.push(metadataGroup);

    const voiceGroup = await this.searchVoiceIfPresent(input.brandId, query);
    if (voiceGroup && voiceGroup.items.length > 0) groups.push(voiceGroup);

    const visualGroup = await this.searchVisualIfPresent(input.brandId, query);
    if (visualGroup && visualGroup.items.length > 0) groups.push(visualGroup);

    return { query, brandId: input.brandId, groups };
  }

  private async searchDosDonts(brandId: string, query: string): Promise<GuidelineSearchGroup> {
    const rows = await this.prisma.dosDontsEntry.findMany({
      where: {
        brandId,
        OR: [
          { ruleText: { contains: query, mode: 'insensitive' } },
          { exampleText: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const items: GuidelineSearchItem[] = rows.map((row) => {
      const ruleHit = row.ruleText.toLowerCase().includes(query.toLowerCase());
      const matchedFieldKey = ruleHit
        ? 'admin.brandGuidelines.dosAndDonts.fields.ruleText.label'
        : 'admin.brandGuidelines.dosAndDonts.fields.exampleText.label';
      const fragmentSource = ruleHit ? row.ruleText : row.exampleText ?? '';
      return {
        id: row.id,
        sectionTitleKey: 'admin.brandGuidelines.dosAndDonts.sectionTitle',
        matchedFieldKey,
        fragment: buildFragment(fragmentSource, query),
        href: `/admin/brand-guidelines/${brandId}?section=dosAndDonts#entry-${row.id}`,
      };
    });
    return this.group('dos-and-donts', items);
  }

  private async searchMetadata(brandId: string, query: string): Promise<GuidelineSearchGroup> {
    const row = await this.prisma.brandMetadata.findUnique({ where: { brandId } });
    if (!row) return this.group('metadata', []);
    const needle = query.toLowerCase();
    const matchedTag = row.tags.find((tag) => tag.toLowerCase().includes(needle));
    if (!matchedTag) return this.group('metadata', []);
    const fragment = buildFragment(row.tags.join(', '), query);
    const item: GuidelineSearchItem = {
      id: 'brand-metadata',
      sectionTitleKey: 'admin.brandGuidelines.metadata.sectionTitle',
      matchedFieldKey: 'admin.brandGuidelines.metadata.tagsLabel',
      fragment,
      href: `/admin/brand-guidelines/${brandId}?section=metadata`,
    };
    return this.group('metadata', [item]);
  }

  private async searchVoiceIfPresent(
    brandId: string,
    query: string,
  ): Promise<GuidelineSearchGroup | null> {
    if (!this.modelExists('BrandVoice')) return null;
    return this.searchSingletonByQuery(
      'brandVoice',
      brandId,
      query,
      'voice',
      'admin.brandGuidelines.voice.sectionTitle',
      'brandVoice',
    );
  }

  private async searchVisualIfPresent(
    brandId: string,
    query: string,
  ): Promise<GuidelineSearchGroup | null> {
    if (!this.modelExists('VisualIdentity')) return null;
    return this.searchSingletonByQuery(
      'visualIdentity',
      brandId,
      query,
      'visual',
      'admin.brandGuidelines.visual.sectionTitle',
      'visualIdentity',
    );
  }

  private async searchSingletonByQuery(
    delegateKey: string,
    brandId: string,
    query: string,
    section: GuidelineSearchSection,
    sectionTitleKey: string,
    deepLinkSection: string,
  ): Promise<GuidelineSearchGroup> {
    try {
      const client = this.prisma as unknown as Record<
        string,
        { findUnique?: (args: { where: { brandId: string } }) => Promise<Record<string, unknown> | null> }
      >;
      const delegate = client[delegateKey];
      if (!delegate?.findUnique) return this.group(section, []);
      const row = await delegate.findUnique({ where: { brandId } });
      if (!row) return this.group(section, []);
      const needle = query.toLowerCase();
      let matchedFieldKey: string | null = null;
      let fragmentSource = '';
      for (const [fieldName, value] of Object.entries(row)) {
        if (typeof value !== 'string') continue;
        if (value.toLowerCase().includes(needle)) {
          matchedFieldKey = `admin.brandGuidelines.${deepLinkSection}.fields.${fieldName}.label`;
          fragmentSource = value;
          break;
        }
      }
      if (!matchedFieldKey) return this.group(section, []);
      const item: GuidelineSearchItem = {
        id: `${deepLinkSection}-${brandId}`,
        sectionTitleKey,
        matchedFieldKey,
        fragment: buildFragment(fragmentSource, query),
        href: `/admin/brand-guidelines/${brandId}?section=${deepLinkSection}`,
      };
      return this.group(section, [item]);
    } catch {
      return this.group(section, []);
    }
  }

  private modelExists(modelName: string): boolean {
    const dmmf = (this.prisma as PrismaClientWithDmmf)._dmmf;
    if (!dmmf?.modelMap) return false;
    return Boolean(dmmf.modelMap[modelName]);
  }

  private group(
    section: GuidelineSearchSection,
    items: readonly GuidelineSearchItem[],
  ): GuidelineSearchGroup {
    return { section, items };
  }
}
