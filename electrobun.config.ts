import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Book of Toop",
    identifier: "com.bookoftoop.app",
    version: "2.0.0",
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    views: {
      mainview: {
        entrypoint: "src/mainview/index.ts",
      },
    },
    copy: {
      "src/mainview/index.html":   "views/mainview/index.html",
      "src/mainview/renderer.js":    "views/mainview/renderer.js",
      "src/mainview/jspdf.bundle.js": "views/mainview/jspdf.bundle.js",
      "src/mainview/renderer.css": "views/mainview/renderer.css",
      "src/mainview/tailwind.css": "views/mainview/tailwind.css",
    },
    mac: {
      bundleCEF: false,
      icons: "assets/icon.iconset",
    },
  },
} satisfies ElectrobunConfig;
