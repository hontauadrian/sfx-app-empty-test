import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ContentCheckResultList } from '../index';
import type { ContentCheckResultGroup } from '../../../pages/content-check/types';

const groups: readonly ContentCheckResultGroup[] = [
  {
    key: 'tone',
    categoryLabel: 'Tone',
    rows: [
      {
        key: 'tone:do',
        type: 'do',
        typeLabel: 'Do',
        entries: [
          {
            id: '1',
            title: 'Be warm',
            body: 'Line one\nLine two',
            suggestedCorrection: 'Try this instead',
          },
        ],
      },
      {
        key: 'tone:dont',
        type: 'dont',
        typeLabel: "Don't",
        entries: [
          {
            id: '2',
            title: 'Avoid jargon',
            body: 'Plain language only.',
            suggestedCorrection: null,
          },
        ],
      },
    ],
  },
];

describe('ContentCheckResultList', () => {
  it('renders the section heading, the category, and both type sub-groups in order', () => {
    render(
      <ContentCheckResultList
        resultsTitle="Results"
        suggestedCorrectionLabel="Suggested correction"
        groups={groups}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Results' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tone' })).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 4 }).map((node) => node.textContent);
    expect(headings).toEqual(['Do', "Don't"]);
  });

  it('renders Suggested correction only for entries that have one', () => {
    render(
      <ContentCheckResultList
        resultsTitle="Results"
        suggestedCorrectionLabel="Suggested correction"
        groups={groups}
      />,
    );
    expect(screen.getAllByText('Suggested correction')).toHaveLength(1);
    expect(screen.getByText('Try this instead')).toBeInTheDocument();
  });

  it('preserves newlines in the entry body via whitespace-pre-wrap', () => {
    render(
      <ContentCheckResultList
        resultsTitle="Results"
        suggestedCorrectionLabel="Suggested correction"
        groups={groups}
      />,
    );
    const body = screen.getByText((_text, node) => {
      return node?.textContent === 'Line one\nLine two';
    });
    expect(body).toHaveClass('whitespace-pre-wrap');
  });

  it('renders one list item per entry', () => {
    render(
      <ContentCheckResultList
        resultsTitle="Results"
        suggestedCorrectionLabel="Suggested correction"
        groups={groups}
      />,
    );
    const lists = screen.getAllByRole('list');
    expect(lists).toHaveLength(2);
    const firstList = lists[0];
    const secondList = lists[1];
    if (!firstList || !secondList) throw new Error('Expected two lists');
    expect(within(firstList).getByText('Be warm')).toBeInTheDocument();
    expect(within(secondList).getByText('Avoid jargon')).toBeInTheDocument();
  });
});
