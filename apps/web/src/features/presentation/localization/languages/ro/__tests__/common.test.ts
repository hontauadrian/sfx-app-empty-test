import { describe, expect, it } from 'vitest';
import { common } from '../common';

describe('ro/common translations', () => {
  it('provides nav labels in Romanian (no diacritics)', () => {
    expect(common.nav.home).toBe('Acasa');
    expect(common.nav.admin).toBe('Administrare');
  });

  it('provides admin landing/subnav labels in Romanian', () => {
    expect(common.admin.landing.title).toBe('Administrare');
    expect(common.admin.subnav.companyInfo.length).toBeGreaterThan(0);
  });

  it('provides admin denied labels in Romanian', () => {
    expect(common.admin.denied.title.length).toBeGreaterThan(0);
    expect(common.admin.denied.message.length).toBeGreaterThan(0);
    expect(common.admin.denied.backToHome.length).toBeGreaterThan(0);
  });

  it('provides admin tab labels in Romanian (no diacritics)', () => {
    expect(common.admin.tabs.companyInfo).toBe('Informatii companie');
    expect(common.admin.tabs.history).toBe('Istoric');
  });

  it('provides adminCompanyInfo.history copy in Romanian (no diacritics)', () => {
    expect(common.adminCompanyInfo.history.pageTitle.length).toBeGreaterThan(0);
    expect(common.adminCompanyInfo.history.viewHistoryCta).toBe('Vezi istoricul');
    expect(common.adminCompanyInfo.history.backToCurrent.length).toBeGreaterThan(0);
    expect(common.adminCompanyInfo.history.columnHeaders.savedAt).toBe('Salvat la');
    expect(common.adminCompanyInfo.history.columnHeaders.editor).toBe('Editor');
    expect(common.adminCompanyInfo.history.emptyState.title.length).toBeGreaterThan(0);
    expect(common.adminCompanyInfo.history.emptyState.message.length).toBeGreaterThan(0);
    expect(common.adminCompanyInfo.history.rowAriaLabelTemplate).toContain('{editor}');
    expect(common.adminCompanyInfo.history.rowAriaLabelTemplate).toContain('{timestamp}');
  });

  it('provides adminCompanyInfo.historyDetail copy in Romanian (no diacritics)', () => {
    expect(common.adminCompanyInfo.historyDetail.pageTitle.length).toBeGreaterThan(0);
    expect(common.adminCompanyInfo.historyDetail.bannerTemplate).toContain('{editor}');
    expect(common.adminCompanyInfo.historyDetail.bannerTemplate).toContain('{timestamp}');
    expect(common.adminCompanyInfo.historyDetail.backToCurrent.length).toBeGreaterThan(0);
    expect(common.adminCompanyInfo.historyDetail.emptyValuePlaceholder).toBe('—');
    expect(common.adminCompanyInfo.historyDetail.notFoundTitle.length).toBeGreaterThan(0);
    expect(common.adminCompanyInfo.historyDetail.notFoundMessage.length).toBeGreaterThan(0);
  });
});
