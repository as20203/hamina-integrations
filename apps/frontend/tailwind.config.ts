import config from "@repo/ui/tailwind.config";
import type { Config } from "tailwindcss";

export default {
  ...config,
  presets: [config],
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ts-shared/ui/src/**/*.{ts,tsx}"
  ]
} satisfies Config;
