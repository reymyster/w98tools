import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only auto-cleans when globals are injected by its own
// framework preset; doing it here keeps each test's DOM isolated regardless.
afterEach(() => {
  cleanup();
});
