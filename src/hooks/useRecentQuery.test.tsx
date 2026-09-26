// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useRecentQuery } from "./useRecentQuery";
import type { RecentClient, RecentResult } from "../lib/recentData";
const result = (name: string): RecentResult => ({
  hotspots: [],
  observations: [],
  fetchedAt: name,
  days: 7,
  limited: false,
  source: "live",
});
it("never replaces a new location with a late previous response", async () => {
  const pending: ((value: RecentResult) => void)[] = [];
  const client = {
    load: vi.fn(
      () => new Promise<RecentResult>((resolve) => pending.push(resolve)),
    ),
    resume: vi.fn(),
  } as unknown as RecentClient;
  const { result: state, rerender } = renderHook(
    ({ id }) =>
      useRecentQuery(
        client,
        { kind: "location", locationId: id, days: 7 },
        true,
        0,
      ),
    { initialProps: { id: "L1" } },
  );
  rerender({ id: "L2" });
  await act(async () => pending[1](result("new")));
  await act(async () => pending[0](result("old")));
  await waitFor(() => expect(state.current.data?.fetchedAt).toBe("new"));
});
it("retains the last result during a failed explicit refresh", async () => {
  const client = {
    load: vi
      .fn()
      .mockResolvedValueOnce(result("success"))
      .mockRejectedValueOnce(new Error("offline")),
    resume: vi.fn(),
  } as unknown as RecentClient;
  const { result: state, rerender } = renderHook(
    ({ revision }) =>
      useRecentQuery(
        client,
        { kind: "location", locationId: "L1", days: 7 },
        true,
        revision,
      ),
    { initialProps: { revision: 0 } },
  );
  await waitFor(() => expect(state.current.data?.fetchedAt).toBe("success"));
  rerender({ revision: 1 });
  await waitFor(() => expect(state.current.error).toBe("offline"));
  expect(state.current.data?.fetchedAt).toBe("success");
});

it("preserves a forced refresh when selecting another hotspot cancels its first attempt", async () => {
  const { useBirdSummaries } = await import("./useRecentQuery");
  const calls: {
    force?: boolean;
    signal?: AbortSignal;
    resolve: (value: RecentResult) => void;
  }[] = [];
  const client = {
    load: vi.fn((_query, options) => {
      if (!options.force) return Promise.resolve(result("old-cache"));
      return new Promise<RecentResult>((resolve) =>
        calls.push({ ...options, resolve }),
      );
    }),
    resume: vi.fn(),
  } as unknown as RecentClient;
  const { result: state, rerender } = renderHook(
    ({ revision, selected }: { revision: number; selected: string | null }) =>
      useBirdSummaries(client, ["L1", "L2"], selected, 7, true, revision),
    { initialProps: { revision: 0, selected: null as string | null } },
  );
  await waitFor(() =>
    expect(state.current.summaries.L1?.data?.fetchedAt).toBe("old-cache"),
  );
  rerender({ revision: 1, selected: null });
  await waitFor(() => expect(calls).toHaveLength(2));
  rerender({ revision: 1, selected: "L2" });
  await waitFor(() => expect(calls).toHaveLength(4));
  await act(async () => {
    calls[2].resolve(result("fresh"));
    calls[3].resolve(result("fresh"));
  });
  await waitFor(() =>
    expect(state.current.summaries.L1?.data?.fetchedAt).toBe("fresh"),
  );
});
