import type { DosAndDontCategory, DosAndDontType } from '@sfx/validation';
import type { DosAndDontDataModel } from '../model/dos-and-dont-data-model';

export interface DosAndDont {
  readonly id: string;
  readonly brandId: string;
  readonly type: DosAndDontType;
  readonly category: DosAndDontCategory;
  readonly title: string;
  readonly body: string;
  readonly suggestedCorrection: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function mapToDosAndDont(data: DosAndDontDataModel): DosAndDont {
  return {
    id: data.id,
    brandId: data.brandId,
    type: data.type as DosAndDontType,
    category: data.category as DosAndDontCategory,
    title: data.title,
    body: data.body,
    suggestedCorrection: data.suggestedCorrection,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  };
}
