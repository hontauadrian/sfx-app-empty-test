import { describe, expect, it } from 'vitest';
import type {
  EditVisualIdentityNavigationTarget,
  EditVisualIdentityPageProps,
} from '../types';

describe('edit-visual-identity types', () => {
  it('accepts the three navigation target states', () => {
    const targets: EditVisualIdentityNavigationTarget[] = ['cancel', 'saved', null];
    expect(targets).toHaveLength(3);
  });

  it('EditVisualIdentityPageProps requires a brandId', () => {
    const props: EditVisualIdentityPageProps = { brandId: 'b' };
    expect(props.brandId).toBe('b');
  });
});
