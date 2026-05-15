import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { NewBrandPage } from '..';

const useNewBrandMock = vi.fn();

vi.mock('../use-new-brand', () => ({
  useNewBrand: (): unknown => useNewBrandMock(),
}));

const baseModel = {
  title: 'Create brand',
  nameLabel: 'Brand name',
  namePlaceholder: 'Acme',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'A short summary',
  submitLabel: 'Submit',
  cancelLabel: 'Cancel',
  isSubmitting: false,
  serverErrorLabel: null,
  nameRequiredError: 'Brand name is required',
  nameTooLongError: 'Brand name must be at most 120 characters',
  descriptionTooLongError: 'Description must be at most 2000 characters',
};

describe('NewBrandPage', () => {
  beforeEach(() => {
    useNewBrandMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the form labels and submit button', () => {
    (useNewBrandMock as Mock).mockReturnValue({
      uiModel: baseModel,
      handleSubmit: vi.fn(),
      handleCancel: vi.fn(),
    });

    render(<NewBrandPage />);
    expect(screen.getByRole('heading', { name: 'Create brand' })).toBeInTheDocument();
    expect(screen.getByLabelText('Brand name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });

  it('shows the name-required error when submit is attempted with an empty name', async () => {
    const handleSubmit = vi.fn();
    (useNewBrandMock as Mock).mockReturnValue({
      uiModel: baseModel,
      handleSubmit,
      handleCancel: vi.fn(),
    });
    const user = userEvent.setup();
    render(<NewBrandPage />);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Brand name is required')).toBeInTheDocument();
  });

  it('invokes handleSubmit with trimmed values for a valid form', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);
    (useNewBrandMock as Mock).mockReturnValue({
      uiModel: baseModel,
      handleSubmit,
      handleCancel: vi.fn(),
    });
    const user = userEvent.setup();
    render(<NewBrandPage />);
    await user.type(screen.getByLabelText('Brand name'), '  Acme Brand  ');
    await user.type(screen.getByLabelText('Description'), '  desc  ');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(handleSubmit).toHaveBeenCalledWith({ name: 'Acme Brand', description: 'desc' });
  });

  it('renders the server error when the mutation fails', () => {
    (useNewBrandMock as Mock).mockReturnValue({
      uiModel: { ...baseModel, serverErrorLabel: 'boom' },
      handleSubmit: vi.fn(),
      handleCancel: vi.fn(),
    });
    render(<NewBrandPage />);
    expect(screen.getByText('boom')).toBeInTheDocument();
  });
});
