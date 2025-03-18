import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { cacheService } from "./cacheService";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;
    const source = url.split('/').pop() as 'btcmap' | 'blink' | 'bitcoinjungle';

    try {
      // Initialize cache service if not already initialized
      if (!cacheService.db) {
        await cacheService.init();
      }

      // Check if we have cached data and if it's still fresh
      if (!await cacheService.isCacheStale()) {
        const cachedData = await cacheService.getData(source);
        if (cachedData && cachedData.length > 0) {
          console.log(`Using cached ${source} data:`, cachedData.length, 'items');
          return cachedData;
        }
      }

      // If cache is stale or empty, fetch from API
      const res = await fetch(url, {
        credentials: "include",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      const data = await res.json();

      // Update cache with new data
      await cacheService.syncData(source, data);

      return data;
    } catch (error) {
      console.error(`Error fetching ${source} data:`, error);

      // If offline or API error, try to return cached data as fallback
      const cachedData = await cacheService.getData(source);
      if (cachedData && cachedData.length > 0) {
        console.log(`Falling back to cached ${source} data:`, cachedData.length, 'items');
        return cachedData;
      }

      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});