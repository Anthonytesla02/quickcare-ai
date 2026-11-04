import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PharmEmerg — Pocket Clinical Coach" },
      { name: "description", content: "Mobile-first pharmacy emergency and trauma training simulator." },
      { property: "og:title", content: "PharmEmerg — Pocket Clinical Coach" },
      { property: "og:description", content: "Mobile-first pharmacy emergency and trauma training simulator." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/play" });
  },
});
