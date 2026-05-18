import type { BrandGuidelinesVersion } from '@sfx/domain';

export type BrandGuidelinesHistoryDetailStatus =
  | 'loading'
  | 'ready'
  | 'denied'
  | 'not-found'
  | 'error';

export type BrandGuidelinesHistoryDetailSectionUIModel =
  | {
      readonly key: 'voice';
      readonly title: string;
      readonly data: BrandGuidelinesVersion['snapshot']['voice'];
    }
  | {
      readonly key: 'visual';
      readonly title: string;
      readonly data: BrandGuidelinesVersion['snapshot']['visual'];
    }
  | {
      readonly key: 'dosAndDonts';
      readonly title: string;
      readonly data: BrandGuidelinesVersion['snapshot']['dosAndDonts'];
    }
  | {
      readonly key: 'metadata';
      readonly title: string;
      readonly data: BrandGuidelinesVersion['snapshot']['metadata'];
    };

export interface BrandGuidelinesHistoryDetailFeedbackUIModel {
  readonly title: string;
  readonly message: string;
}

export interface BrandGuidelinesHistoryDetailBannerUIModel {
  readonly message: string;
}

export interface BrandGuidelinesHistoryDetailBackLinkUIModel {
  readonly label: string;
  readonly href: string;
}

export interface BrandGuidelinesHistoryDetailPageUIModel {
  readonly status: BrandGuidelinesHistoryDetailStatus;
  readonly title: string;
  readonly banner: BrandGuidelinesHistoryDetailBannerUIModel;
  readonly sections: readonly BrandGuidelinesHistoryDetailSectionUIModel[];
  readonly backToCurrent: BrandGuidelinesHistoryDetailBackLinkUIModel;
  readonly denied: BrandGuidelinesHistoryDetailFeedbackUIModel;
  readonly notFound: BrandGuidelinesHistoryDetailFeedbackUIModel;
  readonly error: BrandGuidelinesHistoryDetailFeedbackUIModel;
  readonly readOnlyAriaSuffix: string;
  readonly emptyValuePlaceholder: string;
}

export interface BrandGuidelinesHistoryDetailPageProps {
  readonly brandId: string;
  readonly versionId: string;
}
