export interface DosAndDontDataModel {
  readonly id: string;
  readonly brandId: string;
  readonly type: string;
  readonly category: string;
  readonly title: string;
  readonly body: string;
  readonly suggestedCorrection: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
