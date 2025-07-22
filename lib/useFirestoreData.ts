import { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, getDocs, query, orderBy, limit, where, DocumentData } from 'firebase/firestore';
import { db } from './firebase';

interface UseFirestoreDataOptions {
  collectionName: string;
  orderByField?: string;
  orderDirection?: 'asc' | 'desc';
  limitCount?: number;
  whereConditions?: Array<{ field: string; operator: any; value: any }>;
  dependencies?: any[];
  cacheKey?: string;
}

interface UseFirestoreDataReturn<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Simple in-memory cache
const cache = new Map<string, { data: any[]; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useFirestoreData<T = DocumentData>({
  collectionName,
  orderByField,
  orderDirection = 'desc',
  limitCount,
  whereConditions = [],
  dependencies = [],
  cacheKey
}: UseFirestoreDataOptions): UseFirestoreDataReturn<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cacheKeyValue = useMemo(() => {
    return cacheKey || `${collectionName}-${JSON.stringify(dependencies)}`;
  }, [cacheKey, collectionName, dependencies]);

  const fetchData = useCallback(async () => {
    try {
      // Check cache first
      const cached = cache.get(cacheKeyValue);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        setData(cached.data);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      let q: any = collection(db, collectionName);

      // Apply where conditions
      whereConditions.forEach(condition => {
        q = query(q, where(condition.field, condition.operator, condition.value));
      });

      // Apply ordering
      if (orderByField) {
        q = query(q, orderBy(orderByField, orderDirection));
      }

      // Apply limit
      if (limitCount) {
        q = query(q, limit(limitCount));
      }

      const snapshot = await getDocs(q);
      const result = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })) as T[];

      // Cache the result
      cache.set(cacheKeyValue, { data: result, timestamp: Date.now() });

      setData(result);
    } catch (err: any) {
      setError(err.message || 'Error fetching data');
      console.error('Firestore fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [collectionName, orderByField, orderDirection, limitCount, whereConditions, cacheKeyValue]);

  useEffect(() => {
    fetchData();
  }, [fetchData, ...dependencies]);

  const refetch = useCallback(async () => {
    // Clear cache for this key
    cache.delete(cacheKeyValue);
    await fetchData();
  }, [fetchData, cacheKeyValue]);

  return { data, loading, error, refetch };
}

// Utility function to clear cache
export const clearFirestoreCache = () => {
  cache.clear();
};

// Utility function to clear specific cache entry
export const clearFirestoreCacheEntry = (key: string) => {
  cache.delete(key);
}; 