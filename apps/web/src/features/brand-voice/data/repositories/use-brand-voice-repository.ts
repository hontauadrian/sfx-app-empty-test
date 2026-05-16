import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { brandVoiceQueryKey } from '../../constants';
import { fetchBrandVoice } from '../remote/fetch-brand-voice';
import {
  mapToBrandVoice,
  type BrandVoice,
} from '../mapper/map-to-brand-voice';
import type { BrandVoiceDataModel } from '../model/brand-voice-data-model';

export function useBrandVoiceRepository(
  brandId: string | null,
): UseQueryResult<BrandVoice> {
  return useQuery({
    queryKey: brandId ? brandVoiceQueryKey(brandId) : ['brand-voice', '__noop__'],
    queryFn: () => fetchBrandVoice(brandId as string),
    select: (data: BrandVoiceDataModel) => mapToBrandVoice(data),
    enabled: brandId !== null && brandId.length > 0,
  });
}
