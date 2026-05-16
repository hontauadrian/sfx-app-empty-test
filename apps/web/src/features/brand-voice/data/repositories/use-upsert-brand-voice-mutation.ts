import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { brandVoiceQueryKey } from '../../constants';
import {
  upsertBrandVoice,
  type UpsertBrandVoiceInput,
} from '../remote/upsert-brand-voice';
import {
  mapToBrandVoice,
  type BrandVoice,
} from '../mapper/map-to-brand-voice';

export function useUpsertBrandVoiceMutation(
  brandId: string,
): UseMutationResult<BrandVoice, Error, UpsertBrandVoiceInput['payload']> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpsertBrandVoiceInput['payload']): Promise<BrandVoice> => {
      const data = await upsertBrandVoice({ brandId, payload });
      return mapToBrandVoice(data);
    },
    onSettled: (): void => {
      void queryClient.invalidateQueries({
        queryKey: brandVoiceQueryKey(brandId),
        exact: true,
      });
    },
  });
}
