import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MY LIFE PLANNER – Smart Calendar & Habit Tracker",
    short_name: "Life Planner",
    description: "Lịch thông minh & theo dõi thói quen",
    start_url: "/calendar",
    display: "standalone",
    background_color: "#f4f4f1",
    theme_color: "#2a78d6",
    lang: "vi",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
