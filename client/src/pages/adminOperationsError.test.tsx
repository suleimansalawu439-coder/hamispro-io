import React from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryNotice } from "./AdminOperationsPage";

describe("owner operations query failure notices", () => {
  it.each(["Ads data", "Source monitoring", "Activity data", "Settings data"])("renders a visible %s notice with retry", label => {
    const onRetry = vi.fn();
    const element = QueryNotice({ label, message: "Temporary backend failure", onRetry });
    type NoticeElementProps = { children?: React.ReactNode; onClick?: () => void };
    const children = React.Children.toArray(element.props.children) as Array<React.ReactElement<NoticeElementProps>>;
    const retryButton = children.find(child => child.type === "button");
    expect(element.props.role).toBe("alert");
    expect(children.some(child => child.props.children === "Temporary backend failure")).toBe(true);
    expect(retryButton?.props.children).toBe("Retry");
    retryButton?.props.onClick?.();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
