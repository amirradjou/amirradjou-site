// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://amirradjou.com",
  trailingSlash: "never",
  build: {
    // Single page: inline the (small) stylesheet so the page is one request.
    inlineStylesheets: "always",
  },
});
