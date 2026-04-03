import { QueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/apiBase";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let message = text;
    try {
      const json = JSON.parse(text);
      message = json.error || json.message || text;
    } catch {
      // use raw text
    }
    const error: Error & { status?: number } = new Error(message);
    error.status = res.status;
    throw error;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown
): Promise<Response> {
  const res = await fetch(apiUrl(url), {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn =
  <T>(options: { on401?: UnauthorizedBehavior } = {}) =>
  async ({ queryKey }: { queryKey: readonly unknown[] }): Promise<T | null> => {
    const path = queryKey[0] as string;
    const res = await fetch(apiUrl(path), { credentials: "include" });
    if (res.status === 401 && options.on401 === "returnNull") {
      return null;
    }
    await throwIfResNotOk(res);
    return res.json() as Promise<T>;
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn(),
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
