import { describe, expect, it, vi } from "vitest";
import { getDashboardMetricsFromDb, listSystemSettings, setSystemSetting } from "./db";

function createMetricsDb(filtered: boolean) {
  const whereArgs: unknown[][] = [];
  const results = [
    [{ count: 12 }],
    [{ count: 8 }],
    [{ count: 4 }],
    [{ count: filtered ? 2 : 5 }],
    [{ count: filtered ? 2 : 6 }],
    [{ count: filtered ? 1 : 4 }],
    [{ count: filtered ? 1 : 2 }],
    [{ count: filtered ? 3 : 7 }],
    [{ count: filtered ? 1 : 3 }],
    [{ count: filtered ? 1 : 2 }],
    [{ estimatedRevenueCents: 125 }],
    [{ browser: "Chrome", count: filtered ? 2 : 5 }],
    [{ device: "Desktop", count: filtered ? 3 : 6 }],
    [{ path: "/ai-guides", count: filtered ? 4 : 9 }],
    [{ eventType: "pageview", count: filtered ? 2 : 5 }],
    [
      { day: "2026-08-12", eventType: "pageview", count: filtered ? 2 : 5 },
      { day: "2026-08-12", eventType: "article_read", count: filtered ? 3 : 7 },
      { day: "2026-08-12", eventType: "ad_view", count: filtered ? 1 : 4 },
      { day: "2026-08-12", eventType: "ad_click", count: filtered ? 1 : 2 },
    ],
  ];

  const select = vi.fn(() => {
    const index = select.mock.calls.length - 1;
    const chain: Record<string, any> = {
      from: vi.fn(() => chain),
      where: vi.fn((...args: unknown[]) => {
        whereArgs.push(args);
        return chain;
      }),
      groupBy: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(results[index]).then(resolve, reject),
    };
    return chain;
  });

  return { db: { select } as any, whereArgs };
}

describe("dashboard metrics date ranges", () => {
  it("changes event totals and daily trends for a selected range", async () => {
    const allTimeDb = createMetricsDb(false);
    const selectedRangeDb = createMetricsDb(true);

    const allTime = await getDashboardMetricsFromDb(allTimeDb.db, undefined);
    const selectedRange = await getDashboardMetricsFromDb(selectedRangeDb.db, 7);

    expect(allTime.totalPageviews).toBe(5);
    expect(selectedRange.totalPageviews).toBe(2);
    expect(allTime.uniqueSessions).toBe(6);
    expect(selectedRange.uniqueSessions).toBe(2);
    expect(allTime.totalArticleReads).toBe(7);
    expect(selectedRange.totalArticleReads).toBe(3);
    expect(allTime.daily).toEqual([{ date: "2026-08-12", pageviews: 5, reads: 7, adViews: 4, adClicks: 2 }]);
    expect(selectedRange.daily).toEqual([{ date: "2026-08-12", pageviews: 2, reads: 3, adViews: 1, adClicks: 1 }]);
    expect(allTimeDb.whereArgs[0]).toHaveLength(1);
    expect(selectedRangeDb.whereArgs[0]).toHaveLength(1);
  });
});

describe("owner theme system settings persistence", () => {
  it("saves owner.theme and owner.accentColor and reloads the stored values", async () => {
    const rows: Array<{ key: string; value: string }> = [];
    const db = {
      select: vi.fn(() => ({ from: vi.fn(async () => rows.map(row => ({ ...row }))) })),
      insert: vi.fn(() => ({
        values: vi.fn((entry: { key: string; value: string }) => {
          const handler = async () => {
            const existing = rows.find(row => row.key === entry.key);
            if (existing) existing.value = entry.value;
            else rows.push({ ...entry });
          };
          return {
            onDuplicateKeyUpdate: vi.fn(handler),
            onConflictDoUpdate: vi.fn(handler),
          };
        }),
      })),
    } as any;

    const defaults = await listSystemSettings(db);
    expect(defaults.find(setting => setting.key === "owner.theme")?.value).toBe("dark");
    expect(defaults.find(setting => setting.key === "owner.accentColor")?.value).toBe("#d6ff56");

    await setSystemSetting("owner.theme", "light", db);
    await setSystemSetting("owner.accentColor", "#8b5cf6", db);

    const reloaded = await listSystemSettings(db);
    expect(reloaded.find(setting => setting.key === "owner.theme")?.value).toBe("light");
    expect(reloaded.find(setting => setting.key === "owner.accentColor")?.value).toBe("#8b5cf6");
    expect(db.insert).toHaveBeenCalledTimes(2);
  });
});
