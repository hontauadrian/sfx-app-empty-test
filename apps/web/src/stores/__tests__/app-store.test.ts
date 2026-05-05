import { afterEach, describe, expect, it } from "vitest";

import { useAppStore } from "../app-store";

const initialState = useAppStore.getState();

describe("useAppStore", () => {
  afterEach(() => {
    useAppStore.setState(initialState, true);
  });

  it("starts with the sidebar open", () => {
    expect(useAppStore.getState().isSidebarOpen).toBe(true);
  });

  it("toggleSidebar flips isSidebarOpen", () => {
    useAppStore.getState().toggleSidebar();
    expect(useAppStore.getState().isSidebarOpen).toBe(false);
    useAppStore.getState().toggleSidebar();
    expect(useAppStore.getState().isSidebarOpen).toBe(true);
  });

  it("setSidebarOpen sets isSidebarOpen to the given value", () => {
    useAppStore.getState().setSidebarOpen(false);
    expect(useAppStore.getState().isSidebarOpen).toBe(false);
    useAppStore.getState().setSidebarOpen(true);
    expect(useAppStore.getState().isSidebarOpen).toBe(true);
  });
});
