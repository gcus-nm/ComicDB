import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ComicDB — 同人誌コレクション",
    short_name: "ComicDB",
    description: "イベントで集めた同人誌を管理する個人蔵書DB",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f0e8",
    theme_color: "#8f2f22",
    lang: "ja",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
