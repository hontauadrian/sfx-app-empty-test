import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, type BaseSyntheticEvent, type ReactNode } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';

vi.mock('../use-company-info', () => ({
  useCompanyInfo: vi.fn(),
}));

vi.mock('@/features/presentation/localization', async () => {
  const actual = await vi.importActual<typeof import('@/features/presentation/localization')>(
    '@/features/presentation/localization',
  );
  return {
    ...actual,
    useTranslations: vi.fn(),
  };
});

import { useTranslations } from '@/features/presentation/localization';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import { useCompanyInfo } from '../use-company-info';
import { mapToCompanyInfoPageUIModel } from '../map-to-company-info-page-ui-model';
import { CompanyInfoPage } from '../index';
import type { CompanyInfoFormValues, UseCompanyInfoReturn } from '../types';

const useCompanyInfoMock = vi.mocked(useCompanyInfo);
const useTranslationsMock = vi.mocked(useTranslations);

function emptyDefaults(): CompanyInfoFormValues {
  return {
    legalName: '',
    tradingName: null,
    taxId: null,
    registrationNumber: null,
    companyName: null,
    industry: null,
    foundedYear: null,
    teamSize: null,
    missionStatement: null,
    visionStatement: null,
    coreValues: [],
    certifications: [],
    email: null,
    phone: null,
    website: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    postalCode: null,
    country: null,
  };
}

function harness(args: {
  status: 'loading' | 'denied' | 'ready';
  isPending?: boolean;
  hasRecord?: boolean;
  initialValues?: Partial<CompanyInfoFormValues>;
  forcedError?: { name: keyof CompanyInfoFormValues; message: string };
}): { hook: UseCompanyInfoReturn; handleSubmit: ReturnType<typeof vi.fn> } {
  const form: UseFormReturn<CompanyInfoFormValues> = (function createForm(): UseFormReturn<CompanyInfoFormValues> {
    let hookHandle: UseFormReturn<CompanyInfoFormValues> | undefined;
    const TestComponent = (): null => {
      hookHandle = useForm<CompanyInfoFormValues>({
        defaultValues: { ...emptyDefaults(), ...args.initialValues },
      });
      return null;
    };
    render(<TestComponent />);
    if (!hookHandle) throw new Error('form not initialized');
    return hookHandle;
  })();
  if (args.forcedError) {
    form.setError(args.forcedError.name, { type: 'server', message: args.forcedError.message });
  }

  const uiModel = mapToCompanyInfoPageUIModel({
    translations: enCommon,
    record: args.hasRecord ? null : null,
    isLoading: args.status === 'loading',
    isDenied: args.status === 'denied',
    isPending: args.isPending ?? false,
  });

  const handleSubmit = vi.fn(async (_event?: BaseSyntheticEvent): Promise<void> => undefined);
  return {
    hook: { uiModel, form, handleSubmit: handleSubmit as unknown as UseCompanyInfoReturn['handleSubmit'] },
    handleSubmit,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

beforeEach(() => {
  useCompanyInfoMock.mockReset();
  useTranslationsMock.mockReturnValue(enCommon);
});

describe('CompanyInfoPage', () => {
  it('renders a skeleton main when status is loading', () => {
    const { hook } = harness({ status: 'loading' });
    useCompanyInfoMock.mockReturnValue(hook);

    render(<CompanyInfoPage />);
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button', { name: enCommon.adminCompanyInfo.cta.create })).toBeNull();
  });

  it('renders the denied surface with the back link when status is denied', () => {
    const { hook } = harness({ status: 'denied' });
    useCompanyInfoMock.mockReturnValue(hook);
    render(<CompanyInfoPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(enCommon.admin.denied.title);
    const backLink = screen.getByRole('link', { name: enCommon.admin.denied.backToHome });
    expect(backLink).toHaveAttribute('href', '/');
  });

  it('renders the form with a labelled input for each field in ready empty state', () => {
    const { hook } = harness({ status: 'ready' });
    useCompanyInfoMock.mockReturnValue(hook);
    render(<CompanyInfoPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(enCommon.adminCompanyInfo.pageTitle);
    expect(screen.getByLabelText(/Legal name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Website/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: enCommon.adminCompanyInfo.cta.create })).toBeInTheDocument();
  });

  it('prefills inputs from the form defaults', () => {
    const { hook } = harness({
      status: 'ready',
      initialValues: { legalName: 'Acme Holdings SRL', email: 'contact@acme.test' },
    });
    useCompanyInfoMock.mockReturnValue(hook);
    render(<CompanyInfoPage />);
    const legalName = screen.getByLabelText(/Legal name/) as HTMLInputElement;
    const email = screen.getByLabelText(/Email/) as HTMLInputElement;
    expect(legalName.value).toBe('Acme Holdings SRL');
    expect(email.value).toBe('contact@acme.test');
  });

  it('renders the saving label and disables submit while pending', () => {
    const { hook } = harness({ status: 'ready', isPending: true });
    useCompanyInfoMock.mockReturnValue(hook);
    render(<CompanyInfoPage />);
    const submit = screen.getByRole('button', { name: enCommon.adminCompanyInfo.cta.saving });
    expect(submit).toBeDisabled();
  });

  it('renders a per-field error message and binds it via aria-describedby', () => {
    function ErrorHarness(): ReactNode {
      const form = useForm<CompanyInfoFormValues>({ defaultValues: emptyDefaults() });
      useEffect(() => {
        form.setError('legalName', { type: 'server', message: 'Legal name is required' });
      }, [form]);
      const uiModel = mapToCompanyInfoPageUIModel({
        translations: enCommon,
        record: null,
        isLoading: false,
        isDenied: false,
        isPending: false,
      });
      const handleSubmit = (async () => undefined) as unknown as UseCompanyInfoReturn['handleSubmit'];
      useCompanyInfoMock.mockReturnValue({ uiModel, form, handleSubmit });
      return <CompanyInfoPage />;
    }

    render(<ErrorHarness />);
    const input = screen.getByLabelText(/Legal name/) as HTMLInputElement;
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toBe('legalName-error');
    expect(screen.getByRole('alert')).toHaveTextContent('Legal name is required');
  });

  it('invokes handleSubmit when the submit button is clicked', async () => {
    const { hook, handleSubmit } = harness({ status: 'ready' });
    useCompanyInfoMock.mockReturnValue(hook);
    render(<CompanyInfoPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: enCommon.adminCompanyInfo.cta.create }));
    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });

  it('renders a View history link that points to /admin/company-info/history', () => {
    const { hook } = harness({ status: 'ready' });
    useCompanyInfoMock.mockReturnValue(hook);
    render(<CompanyInfoPage />);
    const link = screen.getByRole('link', {
      name: enCommon.adminCompanyInfo.history.viewHistoryCta,
    });
    expect(link).toHaveAttribute('href', '/admin/company-info/history');
  });

  it('exposes a section heading per UIModel section', () => {
    const { hook } = harness({ status: 'ready' });
    useCompanyInfoMock.mockReturnValue(hook);
    render(<CompanyInfoPage />);
    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(4);
    expect(groups[0]).toHaveTextContent(enCommon.adminCompanyInfo.sections.legalRegistration);
    expect(groups[1]).toHaveTextContent(enCommon.adminCompanyInfo.sections.identity);
    expect(groups[2]).toHaveTextContent(enCommon.adminCompanyInfo.sections.keyFacts);
    expect(groups[3]).toHaveTextContent(enCommon.adminCompanyInfo.sections.contact);
  });

  it('renders a numeric input for foundedYear with the schema bounds as min/max', () => {
    const { hook } = harness({ status: 'ready' });
    useCompanyInfoMock.mockReturnValue(hook);
    render(<CompanyInfoPage />);
    const input = screen.getByLabelText(/Founded year/) as HTMLInputElement;
    expect(input.type).toBe('number');
    expect(input.getAttribute('min')).toBe('1800');
    expect(input.getAttribute('max')).toBe('2027');
    expect(input.getAttribute('inputmode')).toBe('numeric');
  });

  it('renders a numeric input for teamSize with the schema bounds as min/max', () => {
    const { hook } = harness({ status: 'ready' });
    useCompanyInfoMock.mockReturnValue(hook);
    render(<CompanyInfoPage />);
    const input = screen.getByLabelText(/Team size/) as HTMLInputElement;
    expect(input.type).toBe('number');
    expect(input.getAttribute('min')).toBe('0');
    expect(input.getAttribute('max')).toBe('1000000');
  });

  it('renders a textarea for the mission statement', () => {
    const { hook } = harness({ status: 'ready' });
    useCompanyInfoMock.mockReturnValue(hook);
    render(<CompanyInfoPage />);
    const textarea = screen.getByLabelText(/Mission statement/) as HTMLTextAreaElement;
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea.getAttribute('rows')).toBe('4');
    expect(textarea.getAttribute('maxlength')).toBe('4000');
  });

  it('renders Add buttons for core values + certifications and adds a row on click', async () => {
    const { hook } = harness({ status: 'ready' });
    useCompanyInfoMock.mockReturnValue(hook);
    render(<CompanyInfoPage />);
    const user = userEvent.setup();

    const addCore = screen.getByRole('button', { name: enCommon.adminCompanyInfo.cta.addCoreValue });
    const addCert = screen.getByRole('button', { name: enCommon.adminCompanyInfo.cta.addCertification });

    expect(addCore).toBeInTheDocument();
    expect(addCert).toBeInTheDocument();

    await user.click(addCore);
    expect(hook.form.getValues('coreValues')).toEqual(['']);

    await user.click(addCert);
    expect(hook.form.getValues('certifications')).toEqual(['']);
  });

  it('removes the targeted row when Remove is clicked', async () => {
    const { hook } = harness({
      status: 'ready',
      initialValues: { coreValues: ['Integrity', 'Craft'] },
    });
    useCompanyInfoMock.mockReturnValue(hook);
    render(<CompanyInfoPage />);
    const user = userEvent.setup();

    expect(screen.getByLabelText('Core values 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Core values 2')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: `${enCommon.adminCompanyInfo.cta.removeCoreValue} 1` }),
    );

    expect(hook.form.getValues('coreValues')).toEqual(['Craft']);
  });

  it('renders per-item array errors with role=alert', () => {
    function ErrorHarness(): ReactNode {
      const form = useForm<CompanyInfoFormValues>({
        defaultValues: { ...emptyDefaults(), coreValues: ['Integrity', 'XX'] },
      });
      useEffect(() => {
        form.setError('coreValues.1', { type: 'max', message: 'Each core value must be 200 characters or fewer' });
      }, [form]);
      const uiModel = mapToCompanyInfoPageUIModel({
        translations: enCommon,
        record: null,
        isLoading: false,
        isDenied: false,
        isPending: false,
      });
      const handleSubmit = (async () => undefined) as unknown as UseCompanyInfoReturn['handleSubmit'];
      useCompanyInfoMock.mockReturnValue({ uiModel, form, handleSubmit });
      return <CompanyInfoPage />;
    }

    render(<ErrorHarness />);
    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((node) => node.textContent === 'Each core value must be 200 characters or fewer')).toBe(true);
  });

  it('renders the top-level array error above the list', () => {
    function ErrorHarness(): ReactNode {
      const form = useForm<CompanyInfoFormValues>({
        defaultValues: { ...emptyDefaults(), coreValues: [] },
      });
      useEffect(() => {
        form.setError('coreValues', { type: 'max', message: 'Core values list cannot exceed 32 items' });
      }, [form]);
      const uiModel = mapToCompanyInfoPageUIModel({
        translations: enCommon,
        record: null,
        isLoading: false,
        isDenied: false,
        isPending: false,
      });
      const handleSubmit = (async () => undefined) as unknown as UseCompanyInfoReturn['handleSubmit'];
      useCompanyInfoMock.mockReturnValue({ uiModel, form, handleSubmit });
      return <CompanyInfoPage />;
    }

    render(<ErrorHarness />);
    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((node) => node.textContent === 'Core values list cannot exceed 32 items')).toBe(true);
  });
});
