'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { BrandVoice, UpsertBrandVoiceInput } from '@sfx/domain';
import { brandVoiceQueryKey } from '../../constants';
import { fetchBrandVoice } from '../remote/fetch-brand-voice';
import { updateBrandVoice } from '../remote/update-brand-voice';
import {
  mapToBrandVoice,
  mapToBrandVoiceOrNull,
} from '../mapper/map-to-brand-voice';
import type { BrandVoiceDataModel } from '../model/brand-voice-data-model';

export interface UseBrandVoiceRepositoryReturn {
  readonly voiceQuery: UseQueryResult<BrandVoice | null>;
  readonly updateMutation: UseMutationResult<
    BrandVoice,
    unknown,
    UpsertBrandVoiceInput,
    unknown
  >;
}

export function useBrandVoiceRepository(brandId: string): UseBrandVoiceRepositoryReturn {
  const queryClient = useQueryClient();

  const voiceQuery = useQuery({
    queryKey: brandVoiceQueryKey(brandId),
    queryFn: () => fetchBrandVoice(brandId),
    select: (data: BrandVoiceDataModel | null): BrandVoice | null =>
      mapToBrandVoiceOrNull(data),
    retry: false,
  });

  const updateMutation = useMutation<BrandVoice, unknown, UpsertBrandVoiceInput>({
    mutationFn: async (input: UpsertBrandVoiceInput): Promise<BrandVoice> => {
      const dto = await updateBrandVoice(brandId, input);
      return mapToBrandVoice(dto);
    },
    onSuccess: (saved: BrandVoice): void => {
      queryClient.setQueryData(brandVoiceQueryKey(brandId), saved);
      void queryClient.invalidateQueries({
        queryKey: brandVoiceQueryKey(brandId),
        refetchType: 'none',
      });
    },
  });

  return { voiceQuery, updateMutation };
}
