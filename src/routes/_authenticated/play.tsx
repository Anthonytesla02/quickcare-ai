import { createFileRoute } from "@tanstack/react-router";
import PharmApp from "@/pharm/PharmApp";

export const Route = createFileRoute("/_authenticated/play")({
  head: () => ({
    meta: [
      { title: "PharmEmerg — Emergency Case Training" },
      { name: "description", content: "Practice pharmacy emergency and trauma cases, get scored debriefs and track progress." },
      { property: "og:title", content: "PharmEmerg — Emergency Case Training" },
      { property: "og:description", content: "Practice pharmacy emergency and trauma cases with scored debriefs." },
    ],
  }),
  component: PlayPage,
});

function PlayPage() {
  const { user } = Route.useRouteContext();
  return <PharmApp key={user.id} userId={user.id} email={user.email ?? ""} />;
}
