import { useInfiniteQuery } from '@tanstack/react-query';

import { api } from './api';

type Meta = { current_page: number; last_page: number };

/** A paginated officer list (`{<field>: [...], meta}`, 50 per page) with "Load more". */
export function usePaged<T>(key: unknown[], path: string, field: string) {
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) =>
      api<Record<string, T[]> & { meta: Meta }>(pageParam > 1 ? `${path}${path.includes('?') ? '&' : '?'}page=${pageParam}` : path),
    initialPageParam: 1,
    getNextPageParam: last => (last.meta && last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined),
  });
  return { ...q, items: q.data?.pages.flatMap(p => p[field]) ?? [] };
}
