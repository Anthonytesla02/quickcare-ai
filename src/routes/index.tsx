import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "QuickCare AI — Pocket Clinical Coach" },
      { name: "description", content: "Mobile-first pharmacy emergency and trauma training simulator." },
      { property: "og:title", content: "QuickCare AI — Pocket Clinical Coach" },
      { property: "og:description", content: "Mobile-first pharmacy emergency and trauma training simulator." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/play" });
  },
});
