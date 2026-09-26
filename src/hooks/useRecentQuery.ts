import { useEffect, useRef, useState } from "react";
import {
  buildQueryUrl,
  RecentClient,
  type RecentQuery,
  type RecentResult,
} from "../lib/recentData";
export type QueryState = {
  data?: RecentResult;
  loading: boolean;
  error?: string;
};

export function useRecentQuery(
  client: RecentClient,
  query: RecentQuery | null,
  enabled: boolean,
  revision: number,
): QueryState {
  const key = query ? buildQueryUrl(query) : "";
  const [state, setState] = useState<QueryState & { key: string }>({
    key,
    loading: enabled,
  });
  const lastRevision = useRef(revision);
  useEffect(() => {
    const controller = new AbortController();
    const force = revision !== lastRevision.current;
    lastRevision.current = revision;
    if (!query || !enabled) {
      setState({ key, loading: false });
      return;
    }
    const update = (next: Partial<QueryState>) => {
      if (!controller.signal.aborted)
        setState((previous) => ({
          ...(previous.key === key ? previous : { key, loading: true }),
          ...next,
        }));
    };
    update({ loading: true, error: undefined });
    if (force) client.resume();
    void client
      .load(query, {
        signal: controller.signal,
        force,
        onCached: (data) => update({ data }),
      })
      .then((data) => update({ data, loading: false }))
      .catch((error) => {
        if (!controller.signal.aborted)
          update({
            loading: false,
            error: error instanceof Error ? error.message : "查询失败，请重试",
          });
      });
    return () => controller.abort();
    // The canonical URL contains every query field; object identity must not restart requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key, enabled, revision]);
  return state.key === key ? state : { loading: enabled && Boolean(query) };
}

export function useBirdSummaries(
  client: RecentClient,
  ids: string[],
  selectedId: string | null,
  days: number,
  enabled: boolean,
  revision: number,
) {
  const [stored, setStored] = useState<{
    days: number;
    summaries: Record<string, QueryState>;
  }>({ days, summaries: {} });
  const summaries = stored.days === days ? stored.summaries : {};
  const [retry, setRetry] = useState({ id: "", revision: 0 });
  const lastRevision = useRef(revision);
  const lastRetry = useRef(0);
  const pendingRefresh = useRef(new Map<string, number>());
  const refreshEpoch = useRef(0);
  const idsKey = ids.join(",");
  useEffect(() => {
    const controller = new AbortController();
    const forceAll = revision !== lastRevision.current;
    const forceId = retry.revision !== lastRetry.current ? retry.id : "";
    lastRevision.current = revision;
    lastRetry.current = retry.revision;
    if (!enabled) {
      setStored({ days, summaries: {} });
      return;
    }
    if (forceAll || forceId) client.resume();
    if (forceAll || forceId) {
      const epoch = ++refreshEpoch.current;
      for (const id of forceAll ? ids : [forceId])
        pendingRefresh.current.set(id, epoch);
    }
    const ordered = [
      ...new Set([
        ...(selectedId && ids.includes(selectedId) ? [selectedId] : []),
        ...ids,
      ]),
    ];
    const update = (id: string, next: Partial<QueryState>) => {
      if (!controller.signal.aborted)
        setStored((previous) => {
          const items = previous.days === days ? previous.summaries : {};
          return {
            days,
            summaries: {
              ...items,
              [id]: { ...items[id], loading: false, ...next },
            },
          };
        });
    };
    for (const id of ordered) {
      const epoch = pendingRefresh.current.get(id);
      const finishRefresh = () => {
        if (
          !controller.signal.aborted &&
          pendingRefresh.current.get(id) === epoch
        )
          pendingRefresh.current.delete(id);
      };
      update(id, { loading: true, error: undefined });
      void client
        .load(
          { kind: "location", locationId: id, days },
          {
            signal: controller.signal,
            priority: id === selectedId,
            force: epoch !== undefined,
            onCached: (data) => update(id, { data }),
          },
        )
        .then((data) => {
          finishRefresh();
          update(id, { data, loading: false });
        })
        .catch((error) => {
          finishRefresh();
          if (!controller.signal.aborted)
            update(id, {
              loading: false,
              error: error instanceof Error ? error.message : "查询失败",
            });
        });
    }
    return () => controller.abort();
    // A workspace remount scopes summaries to the selected area, days and radius.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, idsKey, selectedId, days, enabled, revision, retry]);
  return {
    summaries,
    retry: (id: string) =>
      setRetry((previous) => ({ id, revision: previous.revision + 1 })),
  };
}
