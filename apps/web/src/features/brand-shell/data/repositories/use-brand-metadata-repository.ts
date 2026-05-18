'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { BrandMetadata } from '@sfx/domain';
import { brandMetadataQueryKey } from '../../constants';
import { mapToBrandMetadata } from '../mapper/map-to-brand-metadata';
import { fetchBrandMetadata } from '../remote/fetch-brand-metadata';
import {
  updateBrandMetadata,
  type UpdateBrandMetadataInput,
} from '../remote/update-brand-metadata';
import type { BrandMetadataDataModel } from '../model/brand-metadata-data-model';

export interface UseBrandMetadataRepositoryReturn {
  readonly metadataQuery: UseQueryResult<BrandMetadata>;
  readonly updateMutation: UseMutationResult<
    BrandMetadata,
    unknown,
    Omit<UpdateBrandMetadataInput, 'brandId'>,
    unknown
  >;
}

export function useBrandMetadataRepository(input: {
  readonly brandId: string;
}): UseBrandMetadataRepositoryReturn {
  const queryClient = useQueryClient();
  const queryKey = brandMetadataQueryKey(input.brandId);

  const metadataQuery = useQuery({
    queryKey,
    queryFn: () => fetchBrandMetadata({ brandId: input.brandId }),
    select: (data: BrandMetadataDataModel): BrandMetadata => mapToBrandMetadata(data),
    retry: false,
  });

  const updateMutation = useMutation<
    BrandMetadata,
    unknown,
    Omit<UpdateBrandMetadataInput, 'brandId'>
  >({
    mutationFn: async (mutationInput) =>
      mapToBrandMetadata(
        await updateBrandMetadata({ ...mutationInput, brandId: input.brandId }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return { metadataQuery, updateMutation };
}
