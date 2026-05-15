export interface BrandHeaderProps {
  readonly brandName: string;
  readonly settingsLabel: string;
  readonly renameLabel: string;
  readonly deleteLabel: string;
  readonly onRename: () => void;
  readonly onDelete: () => void;
}
