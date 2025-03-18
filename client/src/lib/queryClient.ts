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
    const endpointType = url.split('/').pop();

    try {
      // Initialize cache service if not already initialized
      if (!cacheService.db) {
        await cacheService.init();
      }

      // Special handling for combined merchants endpoint
      if (url === '/api/merchants') {
        if (!await cacheService.isCacheStale()) {
          const btcMapData = await cacheService.getData('btcmap');
          const blinkData = await cacheService.getData('blink');
          const bitcoinJungleData = await cacheService.getData('bitcoinjungle');

          if (btcMapData?.length > 0 || blinkData?.length > 0 || bitcoinJungleData?.length > 0) {
            console.log('Using cached merchants data');
            return {
              btcmap: btcMapData || [],
              blink: blinkData || [],
              bitcoinjungle: bitcoinJungleData || []
            };
          }
        }
      } else if (!await cacheService.isCacheStale()) {
        // Handle individual endpoint caches
        const source = endpointType as 'btcmap' | 'blink' | 'bitcoinjungle';
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

      // Handle caching based on endpoint
      if (url === '/api/merchants') {
        // Cache each data set separately
        await Promise.all([
          cacheService.syncData('btcmap', data.btcmap),
          cacheService.syncData('blink', data.blink),
          cacheService.syncData('bitcoinjungle', data.bitcoinjungle)
        ]);
      } else {
        const source = endpointType as 'btcmap' | 'blink' | 'bitcoinjungle';
        await cacheService.syncData(source, data);
      }

      return data;
    } catch (error) {
      console.error(`Error fetching ${endpointType} data:`, error);

      // If offline or API error, try to return cached data as fallback
      if (url === '/api/merchants') {
        const btcMapData = await cacheService.getData('btcmap');
        const blinkData = await cacheService.getData('blink');
        const bitcoinJungleData = await cacheService.getData('bitcoinjungle');

        if (btcMapData?.length > 0 || blinkData?.length > 0 || bitcoinJungleData?.length > 0) {
          console.log('Falling back to cached merchants data');
          return {
            btcmap: btcMapData || [],
            blink: blinkData || [],
            bitcoinjungle: bitcoinJungleData || []
          };
        }
      } else {
        const source = endpointType as 'btcmap' | 'blink' | 'bitcoinjungle';
        const cachedData = await cacheService.getData(source);
        if (cachedData && cachedData.length > 0) {
          console.log(`Falling back to cached ${source} data:`, cachedData.length, 'items');
          return cachedData;
        }
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