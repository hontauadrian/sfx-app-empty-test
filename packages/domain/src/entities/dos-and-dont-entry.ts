export type DosAndDontType = 'do' | 'dont';

export type DosAndDontCategory =
  | 'tone'
  | 'vocabulary'
  | 'visuals'
  | 'legal'
  | 'campaign-messaging';

export interface DosAndDontEntry {
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
