import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: false,
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "https://mail.google.com/mail/u/0/#inbox"
      }
    },
    setupFiles: ["./tests/setup.ts"],
    restoreMocks: true,
    clearMocks: true,
    include: ["tests/**/*.test.ts"]
  }
});
