import { describe, expect, it } from 'vitest';
import type { VoiceEditNavigationTarget, VoiceEditPageProps } from '../types';

describe('voice-edit types', () => {
  it('accepts the three navigation target states', () => {
    const targets: VoiceEditNavigationTarget[] = ['cancel', 'saved', null];
    expect(targets).toHaveLength(3);
  });

  it('VoiceEditPageProps requires a brandId', () => {
    const props: VoiceEditPageProps = { brandId: 'b' };
    expect(props.brandId).toBe('b');
  });
});
