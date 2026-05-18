import { describe, expect, it } from 'vitest';
import { common } from '../common';

describe('en/common translations', () => {
  it('provides nav labels in English', () => {
    expect(common.nav.home).toBe('Home');
    expect(common.nav.admin).toBe('Admin');
  });

  it('provides admin landing/subnav labels in English', () => {
    expect(common.admin.landing.title).toBe('Administration');
    expect(common.admin.subnav.companyInfo).toBe('Company Info');
  });

  it('provides admin denied labels in English', () => {
    expect(common.admin.denied.title).toBe('Access denied');
    expect(common.admin.denied.message.length).toBeGreaterThan(0);
    expect(common.admin.denied.backToHome).toBe('Back to Home');
  });

  it('provides admin tab labels in English', () => {
    expect(common.admin.tabs.companyInfo).toBe('Company Info');
    expect(common.admin.tabs.history).toBe('History');
  });

  it('provides adminCompanyInfo.history copy in English', () => {
    expect(common.adminCompanyInfo.history.pageTitle).toBe('Company Info — History');
    expect(common.adminCompanyInfo.history.viewHistoryCta).toBe('View history');
    expect(common.adminCompanyInfo.history.backToCurrent).toBe('Back to current');
    expect(common.adminCompanyInfo.history.columnHeaders.savedAt).toBe('Saved at');
    expect(common.adminCompanyInfo.history.columnHeaders.editor).toBe('Editor');
    expect(common.adminCompanyInfo.history.emptyState.title).toBe('No versions yet');
    expect(common.adminCompanyInfo.history.emptyState.message.length).toBeGreaterThan(0);
    expect(common.adminCompanyInfo.history.loadingLabel.length).toBeGreaterThan(0);
    expect(common.adminCompanyInfo.history.errorTitle.length).toBeGreaterThan(0);
    expect(common.adminCompanyInfo.history.errorMessage.length).toBeGreaterThan(0);
    expect(common.adminCompanyInfo.history.rowAriaLabelTemplate).toContain('{editor}');
    expect(common.adminCompanyInfo.history.rowAriaLabelTemplate).toContain('{timestamp}');
  });

  it('provides adminCompanyInfo.historyDetail copy in English', () => {
    expect(common.adminCompanyInfo.historyDetail.pageTitle).toBe('Company Info — Version');
    expect(common.adminCompanyInfo.historyDetail.bannerTemplate).toContain('{editor}');
    expect(common.adminCompanyInfo.historyDetail.bannerTemplate).toContain('{timestamp}');
    expect(common.adminCompanyInfo.historyDetail.backToCurrent).toBe('Back to current');
    expect(common.adminCompanyInfo.historyDetail.readOnlyAriaSuffix.length).toBeGreaterThan(0);
    expect(common.adminCompanyInfo.historyDetail.emptyValuePlaceholder).toBe('—');
    expect(common.adminCompanyInfo.historyDetail.notFoundTitle).toBe('Version not found');
    expect(common.adminCompanyInfo.historyDetail.notFoundMessage.length).toBeGreaterThan(0);
    expect(common.adminCompanyInfo.historyDetail.errorTitle.length).toBeGreaterThan(0);
    expect(common.adminCompanyInfo.historyDetail.errorMessage.length).toBeGreaterThan(0);
  });
});
