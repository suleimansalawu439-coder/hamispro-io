import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ActivityView, AdsView, SettingsView, SourcesView } from "./AdminOperationsPage";

function expectFailureNotice(markup: string, label: string, message: string) {
  expect(markup).toContain(`role="alert"`);
  expect(markup).toContain(`${label} unavailable.`);
  expect(markup).toContain(message);
  expect(markup).toContain(">Retry</button>");
}

describe("owner view failure branches", () => {
  it("renders the Ads branch error notice and retry control", () => {
    const markup = renderToStaticMarkup(React.createElement(AdsView, { placements: [], onUpdate: vi.fn(), isUpdating: false, error: "Ads query failed", onRetry: vi.fn() }));
    expectFailureNotice(markup, "Ads data", "Ads query failed");
  });

  it("renders the Sources/Runs branch error notice and retry control", () => {
    vi.stubGlobal("location", { pathname: "/" });
    const markup = renderToStaticMarkup(React.createElement(SourcesView, { sources: [], runs: [], error: "Sources query failed · Runs query failed", onRetry: vi.fn() }));
    expectFailureNotice(markup, "Source monitoring", "Runs query failed");
  });

  it("renders the Activity branch error notice and retry control", () => {
    const markup = renderToStaticMarkup(React.createElement(ActivityView, { logs: [], error: "Audit query failed", onRetry: vi.fn() }));
    expectFailureNotice(markup, "Activity data", "Audit query failed");
  });

  it("renders the Settings branch error notice and retry control", () => {
    const markup = renderToStaticMarkup(React.createElement(SettingsView, { settings: [], onSave: vi.fn(), isSaving: false, error: "Settings query failed", onRetry: vi.fn(), theme: "light", onToggleTheme: vi.fn(), accentColor: "#d6ff56", onAccentChange: vi.fn() }));
    expectFailureNotice(markup, "Settings data", "Settings query failed");
  });

  it("renders the persisted dark-mode and accent controls", () => {
    const markup = renderToStaticMarkup(React.createElement(SettingsView, { settings: [], onSave: vi.fn(), isSaving: false, theme: "dark", onToggleTheme: vi.fn(), accentColor: "#9ce8ff", onAccentChange: vi.fn(), onRetry: vi.fn() }));
    expect(markup).toContain("Dark mode");
    expect(markup).toContain("#9ce8ff");
    expect(markup).toContain("aria-pressed=\"true\"");
  });
});
