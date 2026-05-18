'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { Brand } from '@sfx/domain';
import { BRANDS_QUERY_KEY } from '../../constants';
import { mapToBrand, mapToBrandList } from '../mapper/map-to-brand';
import { createBrand } from '../remote/create-brand';
import { deleteBrand } from '../remote/delete-brand';
import { fetchBrands } from '../remote/fetch-brands';
import { renameBrand } from '../remote/rename-brand';
import type { BrandDataModel } from '../model/brand-data-model';

export interface UseBrandsRepositoryReturn {
  readonly brandsQuery: UseQueryResult<readonly Brand[]>;
  readonly createMutation: UseMutationResult<Brand, unknown, { readonly name: string }, unknown>;
  readonly renameMutation: UseMutationResult<
    Brand,
    unknown,
    { readonly id: string; readonly name: string },
    unknown
  >;
  readonly deleteMutation: UseMutationResult<void, unknown, { readonly id: string }, unknown>;
}

export function useBrandsRepository(): UseBrandsRepositoryReturn {
  const queryClient = useQueryClient();

  const brandsQuery = useQuery({
    queryKey: BRANDS_QUERY_KEY,
    queryFn: fetchBrands,
    select: (data: readonly BrandDataModel[]): readonly Brand[] => mapToBrandList(data),
    retry: false,
  });

  const createMutation = useMutation<Brand, unknown, { readonly name: string }>({
    mutationFn: async (input) => mapToBrand(await createBrand(input)),
    onSuccess: (saved) => {
      const previous =
        queryClient.getQueryData<readonly BrandDataModel[]>(BRANDS_QUERY_KEY) ?? [];
      queryClient.setQueryData<readonly BrandDataModel[]>(BRANDS_QUERY_KEY, [
        toDataModel(saved),
        ...previous,
      ]);
      void queryClient.invalidateQueries({ queryKey: BRANDS_QUERY_KEY, refetchType: 'none' });
    },
  });

  const renameMutation = useMutation<
    Brand,
    unknown,
    { readonly id: string; readonly name: string }
  >({
    mutationFn: async (input) => mapToBrand(await renameBrand(input)),
    onSuccess: (saved) => {
      const previous =
        queryClient.getQueryData<readonly BrandDataModel[]>(BRANDS_QUERY_KEY) ?? [];
      const next = previous.map((entry) =>
        entry.id === saved.id ? toDataModel(saved) : entry,
      );
      queryClient.setQueryData<readonly BrandDataModel[]>(BRANDS_QUERY_KEY, next);
      void queryClient.invalidateQueries({ queryKey: BRANDS_QUERY_KEY, refetchType: 'none' });
    },
  });

  const deleteMutation = useMutation<void, unknown, { readonly id: string }>({
    mutationFn: async (input) => {
      await deleteBrand(input);
    },
    onSuccess: (_void, input) => {
      const previous =
        queryClient.getQueryData<readonly BrandDataModel[]>(BRANDS_QUERY_KEY) ?? [];
      const next = previous.filter((entry) => entry.id !== input.id);
      queryClient.setQueryData<readonly BrandDataModel[]>(BRANDS_QUERY_KEY, next);
      void queryClient.invalidateQueries({ queryKey: BRANDS_QUERY_KEY, refetchType: 'none' });
    },
  });

  return { brandsQuery, createMutation, renameMutation, deleteMutation };
}

function toDataModel(brand: Brand): BrandDataModel {
  return {
    id: brand.id,
    name: brand.name,
    slug: brand.slug,
    ownerUserId: brand.ownerUserId,
    createdAt: brand.createdAt.toISOString(),
    updatedAt: brand.updatedAt.toISOString(),
    deletedAt: brand.deletedAt ? brand.deletedAt.toISOString() : null,
  };
}
