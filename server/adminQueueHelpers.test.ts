import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueueDetailLoadError } from "../client/src/pages/AdminPage";
import { queueActionErrorText, queueDetailErrorText } from "../client/src/pages/adminQueueHelpers";

describe("review queue error helpers", () => {
  it("produces visible detail-load error copy", () => {
    expect(queueDetailErrorText("Request failed")).toBe("Could not load that signal. Request failed");
    expect(queueDetailErrorText(undefined)).toBe("");
  });

  it("returns the first actionable mutation error", () => {
    expect(queueActionErrorText([undefined, "Could not save", "Could not publish"])).toBe("Could not save");
    expect(queueActionErrorText([undefined, null])).toBe("");
  });

  it("renders selected-item fetch errors in the populated detail alert", () => {
    const html = renderToStaticMarkup(createElement(QueueDetailLoadError, { message: "Request failed" }));
    expect(html).toContain("Could not load that signal. Request failed");
    expect(html).toContain('role="alert"');
  });
});
