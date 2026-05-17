import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KJ Cargo Ops",
    short_name: "Cargo Ops",
    description: "KJ 화물기 출도착 모니터링 및 업무 기록",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#07152b",
    theme_color: "#07152b",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
