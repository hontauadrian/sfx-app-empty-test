export type LanguageCode = 'en' | 'ro';

export interface NavTranslations {
  readonly home: string;
  readonly admin: string;
}

export interface AdminLandingTranslations {
  readonly title: string;
}

export interface AdminSubnavTranslations {
  readonly companyInfo: string;
}

export interface AdminDeniedTranslations {
  readonly title: string;
  readonly message: string;
  readonly backToHome: string;
}

export interface AdminTabsTranslations {
  readonly companyInfo: string;
  readonly history: string;
  readonly brandGuidelines: string;
}

export interface AdminTranslations {
  readonly landing: AdminLandingTranslations;
  readonly subnav: AdminSubnavTranslations;
  readonly denied: AdminDeniedTranslations;
  readonly tabs: AdminTabsTranslations;
}

export type CompanyInfoUpsertField =
  | 'legalName'
  | 'tradingName'
  | 'email'
  | 'phone'
  | 'website'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'postalCode'
  | 'country'
  | 'taxId'
  | 'registrationNumber'
  | 'companyName'
  | 'foundedYear'
  | 'teamSize'
  | 'industry'
  | 'missionStatement'
  | 'visionStatement'
  | 'coreValues'
  | 'certifications';

export interface CompanyInfoFieldCopy {
  readonly label: string;
  readonly placeholder: string;
}

export interface AdminCompanyInfoSectionsTranslations {
  readonly legalRegistration: string;
  readonly identity: string;
  readonly keyFacts: string;
  readonly contact: string;
}

export interface AdminCompanyInfoCtaTranslations {
  readonly create: string;
  readonly save: string;
  readonly saving: string;
  readonly addCoreValue: string;
  readonly addCertification: string;
  readonly removeCoreValue: string;
  readonly removeCertification: string;
}

export interface AdminCompanyInfoToastTranslations {
  readonly success: string;
  readonly unexpectedError: string;
  readonly authError: string;
}

export interface AdminCompanyInfoHistoryColumnHeadersTranslations {
  readonly savedAt: string;
  readonly editor: string;
}

export interface AdminCompanyInfoHistoryEmptyStateTranslations {
  readonly title: string;
  readonly message: string;
}

export interface AdminCompanyInfoHistoryTranslations {
  readonly pageTitle: string;
  readonly viewHistoryCta: string;
  readonly backToCurrent: string;
  readonly columnHeaders: AdminCompanyInfoHistoryColumnHeadersTranslations;
  readonly emptyState: AdminCompanyInfoHistoryEmptyStateTranslations;
  readonly loadingLabel: string;
  readonly errorTitle: string;
  readonly errorMessage: string;
  readonly rowAriaLabelTemplate: string;
}

export interface AdminCompanyInfoHistoryDetailTranslations {
  readonly pageTitle: string;
  readonly bannerTemplate: string;
  readonly backToCurrent: string;
  readonly readOnlyAriaSuffix: string;
  readonly emptyValuePlaceholder: string;
  readonly notFoundTitle: string;
  readonly notFoundMessage: string;
  readonly errorTitle: string;
  readonly errorMessage: string;
}

export interface AdminCompanyInfoTranslations {
  readonly pageTitle: string;
  readonly sections: AdminCompanyInfoSectionsTranslations;
  readonly fields: Readonly<Record<CompanyInfoUpsertField, CompanyInfoFieldCopy>>;
  readonly validation: Readonly<Record<CompanyInfoUpsertField, string>>;
  readonly cta: AdminCompanyInfoCtaTranslations;
  readonly toast: AdminCompanyInfoToastTranslations;
  readonly history: AdminCompanyInfoHistoryTranslations;
  readonly historyDetail: AdminCompanyInfoHistoryDetailTranslations;
}

export interface AdminBrandGuidelinesEmptyStateTranslations {
  readonly title: string;
  readonly message: string;
  readonly createCta: string;
}

export interface AdminBrandGuidelinesSelectorTranslations {
  readonly label: string;
  readonly placeholder: string;
  readonly createNew: string;
  readonly rename: string;
  readonly delete: string;
}

export interface AdminBrandGuidelinesCreateModalTranslations {
  readonly title: string;
  readonly nameLabel: string;
  readonly namePlaceholder: string;
  readonly submitCta: string;
  readonly submittingCta: string;
  readonly cancelCta: string;
}

export interface AdminBrandGuidelinesRenameTranslations {
  readonly title: string;
  readonly nameLabel: string;
  readonly submitCta: string;
  readonly submittingCta: string;
  readonly cancelCta: string;
}

export interface AdminBrandGuidelinesDeleteConfirmTranslations {
  readonly title: string;
  readonly bodyTemplate: string;
  readonly confirmCta: string;
  readonly confirmingCta: string;
  readonly cancelCta: string;
}

export interface AdminBrandGuidelinesValidationTranslations {
  readonly nameRequired: string;
  readonly nameTooLong: string;
}

export interface AdminBrandGuidelinesToastTranslations {
  readonly createSuccess: string;
  readonly renameSuccess: string;
  readonly deleteSuccess: string;
  readonly unexpectedError: string;
  readonly authError: string;
}

export interface AdminBrandGuidelinesPlaceholderTranslations {
  readonly title: string;
  readonly message: string;
}

export interface AdminBrandGuidelinesNotFoundTranslations {
  readonly title: string;
  readonly message: string;
  readonly backCta: string;
}

export interface AdminBrandGuidelinesDosDontsTypeOptionsTranslations {
  readonly do: string;
  readonly dont: string;
}

export interface AdminBrandGuidelinesDosDontsCategoryOptionsTranslations {
  readonly tone: string;
  readonly vocabulary: string;
  readonly visuals: string;
  readonly legal: string;
  readonly 'campaign-messaging': string;
}

export interface AdminBrandGuidelinesDosDontsFieldCopy {
  readonly label: string;
  readonly placeholder?: string;
}

export interface AdminBrandGuidelinesDosDontsFieldsTranslations {
  readonly type: AdminBrandGuidelinesDosDontsFieldCopy;
  readonly category: AdminBrandGuidelinesDosDontsFieldCopy;
  readonly ruleText: AdminBrandGuidelinesDosDontsFieldCopy;
  readonly exampleText: AdminBrandGuidelinesDosDontsFieldCopy;
}

export interface AdminBrandGuidelinesDosDontsValidationTranslations {
  readonly typeRequired: string;
  readonly categoryRequired: string;
  readonly categoryUnknown: string;
  readonly ruleTextRequired: string;
  readonly ruleTextTooLong: string;
  readonly exampleTextTooLong: string;
}

export interface AdminBrandGuidelinesDosDontsFiltersTranslations {
  readonly typeLabel: string;
  readonly categoryLabel: string;
  readonly allTypes: string;
  readonly allCategories: string;
}

export interface AdminBrandGuidelinesDosDontsCtaTranslations {
  readonly save: string;
  readonly saving: string;
  readonly cancel: string;
  readonly edit: string;
  readonly delete: string;
}

export interface AdminBrandGuidelinesDosDontsDeleteConfirmTranslations {
  readonly title: string;
  readonly bodyTemplate: string;
  readonly confirmCta: string;
  readonly confirmingCta: string;
  readonly cancelCta: string;
}

export interface AdminBrandGuidelinesDosDontsToastTranslations {
  readonly addSuccess: string;
  readonly updateSuccess: string;
  readonly deleteSuccess: string;
  readonly unexpectedError: string;
}

export interface AdminBrandGuidelinesDosDontsEmptyStateTranslations {
  readonly title: string;
  readonly message: string;
}

export interface AdminBrandGuidelinesDosDontsTranslations {
  readonly sectionTitle: string;
  readonly addCta: string;
  readonly addingCta: string;
  readonly emptyState: AdminBrandGuidelinesDosDontsEmptyStateTranslations;
  readonly typeOptions: AdminBrandGuidelinesDosDontsTypeOptionsTranslations;
  readonly categoryOptions: AdminBrandGuidelinesDosDontsCategoryOptionsTranslations;
  readonly filters: AdminBrandGuidelinesDosDontsFiltersTranslations;
  readonly fields: AdminBrandGuidelinesDosDontsFieldsTranslations;
  readonly validation: AdminBrandGuidelinesDosDontsValidationTranslations;
  readonly cta: AdminBrandGuidelinesDosDontsCtaTranslations;
  readonly deleteConfirm: AdminBrandGuidelinesDosDontsDeleteConfirmTranslations;
  readonly toast: AdminBrandGuidelinesDosDontsToastTranslations;
}

export interface AdminBrandGuidelinesMetadataValidationTranslations {
  readonly tagTooLong: string;
  readonly tooManyTags: string;
}

export interface AdminBrandGuidelinesMetadataCtaTranslations {
  readonly save: string;
  readonly saving: string;
}

export interface AdminBrandGuidelinesMetadataToastTranslations {
  readonly saveSuccess: string;
  readonly unexpectedError: string;
}

export interface AdminBrandGuidelinesMetadataTranslations {
  readonly sectionTitle: string;
  readonly owner: string;
  readonly lastUpdatedTemplate: string;
  readonly tagsLabel: string;
  readonly addTagPlaceholder: string;
  readonly removeTagAriaTemplate: string;
  readonly validation: AdminBrandGuidelinesMetadataValidationTranslations;
  readonly cta: AdminBrandGuidelinesMetadataCtaTranslations;
  readonly toast: AdminBrandGuidelinesMetadataToastTranslations;
}

export interface AdminBrandGuidelinesSearchSectionTitlesTranslations {
  readonly voice: string;
  readonly visual: string;
  readonly 'dos-and-donts': string;
  readonly metadata: string;
}

export interface AdminBrandGuidelinesSearchTranslations {
  readonly placeholder: string;
  readonly empty: string;
  readonly loadingAriaLabel: string;
  readonly resultAriaTemplate: string;
  readonly sectionTitles: AdminBrandGuidelinesSearchSectionTitlesTranslations;
}

export interface AdminBrandGuidelinesSubNavTranslations {
  readonly voice: string;
  readonly visual: string;
  readonly dosAndDonts: string;
  readonly metadata: string;
  readonly placeholderComingNextChunk: string;
  readonly unsavedChangesWarning: string;
}

export interface AdminBrandGuidelinesVoiceFieldCopy {
  readonly label: string;
  readonly placeholder?: string;
}

export interface AdminBrandGuidelinesVoiceFieldsTranslations {
  readonly tone: AdminBrandGuidelinesVoiceFieldCopy;
  readonly preferredVocabulary: AdminBrandGuidelinesVoiceFieldCopy;
  readonly restrictedVocabulary: AdminBrandGuidelinesVoiceFieldCopy;
  readonly messagingPillarTitle: AdminBrandGuidelinesVoiceFieldCopy;
  readonly messagingPillarDescription: AdminBrandGuidelinesVoiceFieldCopy;
  readonly writingStyleRules: AdminBrandGuidelinesVoiceFieldCopy;
  readonly audienceRulesAudience: AdminBrandGuidelinesVoiceFieldCopy;
  readonly audienceRulesRules: AdminBrandGuidelinesVoiceFieldCopy;
  readonly approvedExamplePhrase: AdminBrandGuidelinesVoiceFieldCopy;
  readonly rejectedExamplePhrase: AdminBrandGuidelinesVoiceFieldCopy;
  readonly rejectedExampleReason: AdminBrandGuidelinesVoiceFieldCopy;
}

export interface AdminBrandGuidelinesVoiceCtaTranslations {
  readonly save: string;
  readonly saving: string;
  readonly addPreferred: string;
  readonly removePreferred: string;
  readonly addRestricted: string;
  readonly removeRestricted: string;
  readonly addPillar: string;
  readonly removePillar: string;
  readonly addAudienceRule: string;
  readonly removeAudienceRule: string;
  readonly addApprovedExample: string;
  readonly removeApprovedExample: string;
  readonly addRejectedExample: string;
  readonly removeRejectedExample: string;
}

export interface AdminBrandGuidelinesVoiceSectionsTranslations {
  readonly tone: string;
  readonly preferredVocabulary: string;
  readonly restrictedVocabulary: string;
  readonly messagingPillars: string;
  readonly writingStyle: string;
  readonly audienceRules: string;
  readonly approvedExamples: string;
  readonly rejectedExamples: string;
}

export interface AdminBrandGuidelinesVoiceToastTranslations {
  readonly success: string;
  readonly error: string;
}

export interface AdminBrandGuidelinesVoiceTranslations {
  readonly pageTitle: string;
  readonly sections: AdminBrandGuidelinesVoiceSectionsTranslations;
  readonly fields: AdminBrandGuidelinesVoiceFieldsTranslations;
  readonly cta: AdminBrandGuidelinesVoiceCtaTranslations;
  readonly toast: AdminBrandGuidelinesVoiceToastTranslations;
}

export interface AdminBrandGuidelinesVisualFieldsTranslations {
  readonly logoUsage: AdminBrandGuidelinesVoiceFieldCopy;
  readonly paletteName: AdminBrandGuidelinesVoiceFieldCopy;
  readonly paletteHex: AdminBrandGuidelinesVoiceFieldCopy;
  readonly paletteUsage: AdminBrandGuidelinesVoiceFieldCopy;
  readonly typographyFont: AdminBrandGuidelinesVoiceFieldCopy;
  readonly typographyWeight: AdminBrandGuidelinesVoiceFieldCopy;
  readonly typographyContext: AdminBrandGuidelinesVoiceFieldCopy;
  readonly spacingGuidance: AdminBrandGuidelinesVoiceFieldCopy;
  readonly imageStyleGuidance: AdminBrandGuidelinesVoiceFieldCopy;
  readonly iconographyGuidance: AdminBrandGuidelinesVoiceFieldCopy;
  readonly usageRestrictions: AdminBrandGuidelinesVoiceFieldCopy;
}

export interface AdminBrandGuidelinesVisualCtaTranslations {
  readonly save: string;
  readonly saving: string;
  readonly addPaletteEntry: string;
  readonly removePaletteEntry: string;
  readonly addTypographyEntry: string;
  readonly removeTypographyEntry: string;
}

export interface AdminBrandGuidelinesVisualSectionsTranslations {
  readonly logo: string;
  readonly colorPalette: string;
  readonly typography: string;
  readonly spacing: string;
  readonly imageStyle: string;
  readonly iconography: string;
  readonly restrictions: string;
}

export interface AdminBrandGuidelinesVisualToastTranslations {
  readonly success: string;
  readonly error: string;
}

export interface AdminBrandGuidelinesVisualTranslations {
  readonly pageTitle: string;
  readonly sections: AdminBrandGuidelinesVisualSectionsTranslations;
  readonly fields: AdminBrandGuidelinesVisualFieldsTranslations;
  readonly cta: AdminBrandGuidelinesVisualCtaTranslations;
  readonly toast: AdminBrandGuidelinesVisualToastTranslations;
}

export interface AdminBrandGuidelinesHistoryColumnHeadersTranslations {
  readonly savedAt: string;
  readonly editor: string;
  readonly changeNote: string;
}

export interface AdminBrandGuidelinesHistoryEmptyStateTranslations {
  readonly title: string;
  readonly message: string;
}

export interface AdminBrandGuidelinesHistoryTranslations {
  readonly pageTitle: string;
  readonly viewHistoryCta: string;
  readonly backToCurrent: string;
  readonly columnHeaders: AdminBrandGuidelinesHistoryColumnHeadersTranslations;
  readonly emptyState: AdminBrandGuidelinesHistoryEmptyStateTranslations;
  readonly loadingLabel: string;
  readonly errorTitle: string;
  readonly errorMessage: string;
  readonly deniedTitle: string;
  readonly deniedMessage: string;
  readonly notFoundTitle: string;
  readonly notFoundMessage: string;
  readonly rowAriaLabelTemplate: string;
  readonly changeNoteLabel: string;
  readonly changeNotePlaceholder: string;
  readonly changeNotePlaceholderEmpty: string;
}

export interface AdminBrandGuidelinesHistoryDetailSectionTitlesTranslations {
  readonly voice: string;
  readonly visual: string;
  readonly dosAndDonts: string;
  readonly metadata: string;
}

export interface AdminBrandGuidelinesAuditLogColumnHeadersTranslations {
  readonly clientId: string;
  readonly endpoint: string;
  readonly versionId: string;
  readonly status: string;
  readonly requestTimestamp: string;
}

export interface AdminBrandGuidelinesAuditLogFiltersTranslations {
  readonly clientIdLabel: string;
  readonly clientIdPlaceholder: string;
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly applyCta: string;
  readonly clearCta: string;
}

export interface AdminBrandGuidelinesAuditLogEmptyStateTranslations {
  readonly title: string;
  readonly message: string;
}

export interface AdminBrandGuidelinesAuditLogTranslations {
  readonly pageTitle: string;
  readonly subtitle: string;
  readonly viewAuditLogCta: string;
  readonly backToCurrent: string;
  readonly columnHeaders: AdminBrandGuidelinesAuditLogColumnHeadersTranslations;
  readonly filters: AdminBrandGuidelinesAuditLogFiltersTranslations;
  readonly emptyState: AdminBrandGuidelinesAuditLogEmptyStateTranslations;
  readonly loadingLabel: string;
  readonly errorTitle: string;
  readonly errorMessage: string;
  readonly deniedTitle: string;
  readonly deniedMessage: string;
  readonly notFoundTitle: string;
  readonly notFoundMessage: string;
  readonly rowAriaLabelTemplate: string;
  readonly emptyValuePlaceholder: string;
}

export interface AdminBrandGuidelinesHistoryDetailTranslations {
  readonly pageTitle: string;
  readonly bannerTemplate: string;
  readonly bannerChangeNoteEmpty: string;
  readonly backToCurrent: string;
  readonly readOnlyAriaSuffix: string;
  readonly emptyValuePlaceholder: string;
  readonly notFoundTitle: string;
  readonly notFoundMessage: string;
  readonly deniedTitle: string;
  readonly deniedMessage: string;
  readonly errorTitle: string;
  readonly errorMessage: string;
  readonly sectionTitles: AdminBrandGuidelinesHistoryDetailSectionTitlesTranslations;
}

export interface AdminBrandGuidelinesTranslations {
  readonly pageTitle: string;
  readonly emptyState: AdminBrandGuidelinesEmptyStateTranslations;
  readonly selector: AdminBrandGuidelinesSelectorTranslations;
  readonly createModal: AdminBrandGuidelinesCreateModalTranslations;
  readonly rename: AdminBrandGuidelinesRenameTranslations;
  readonly deleteConfirm: AdminBrandGuidelinesDeleteConfirmTranslations;
  readonly validation: AdminBrandGuidelinesValidationTranslations;
  readonly toast: AdminBrandGuidelinesToastTranslations;
  readonly placeholderBody: AdminBrandGuidelinesPlaceholderTranslations;
  readonly notFound: AdminBrandGuidelinesNotFoundTranslations;
  // Chunk B + Chunk C + Chunk D additions. Marked optional so legacy unit-test
  // mocks (built before these chunks landed) keep type-checking. Runtime
  // language files always populate them — consumers must guard / non-null assert.
  readonly subNav?: AdminBrandGuidelinesSubNavTranslations;
  readonly voice?: AdminBrandGuidelinesVoiceTranslations;
  readonly visual?: AdminBrandGuidelinesVisualTranslations;
  readonly dosAndDonts?: AdminBrandGuidelinesDosDontsTranslations;
  readonly metadata?: AdminBrandGuidelinesMetadataTranslations;
  readonly search?: AdminBrandGuidelinesSearchTranslations;
  readonly history?: AdminBrandGuidelinesHistoryTranslations;
  readonly historyDetail?: AdminBrandGuidelinesHistoryDetailTranslations;
  readonly auditLog?: AdminBrandGuidelinesAuditLogTranslations;
}

export interface CommonTranslations {
  readonly appName: string;
  readonly loading: string;
  readonly error: string;
  readonly retry: string;
  readonly save: string;
  readonly cancel: string;
  readonly delete: string;
  readonly confirm: string;
  readonly search: string;
  readonly noResults: string;
  readonly healthStatus: string;
  readonly connected: string;
  readonly disconnected: string;
  readonly getStarted: string;
  readonly apiDocs: string;
  readonly logout: string;
  readonly pendingAccessTitle: string;
  readonly pendingAccessMessage: string;
  readonly nav: NavTranslations;
  readonly admin: AdminTranslations;
  readonly adminCompanyInfo: AdminCompanyInfoTranslations;
  readonly adminBrandGuidelines: AdminBrandGuidelinesTranslations;
}

export interface TranslationNamespaces {
  readonly common: CommonTranslations;
}

export type TranslationNamespace = keyof TranslationNamespaces;
