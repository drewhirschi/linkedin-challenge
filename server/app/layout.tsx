// Root layout: the sidebar shell that stays mounted across soft navigations. Plain <a> links let
// TanStack Router swap only the page leaf, so the React Query cache survives navigation.
//
// The information architecture is the manifest's three questions: "How is everyone doing?"
// (Leaderboard), "How am I doing?" (My results), "How does this work?" (How scoring works) —
// plus Admin for the people running the challenge and System for the product operator.
import type { ReactNode } from "react";
import { useGetMe, useLogout, useStopImpersonation } from "@linkedin-challenge/client/react-query";

function NavLink({ href, label }: { href: string; label: string }) {
  const active =
    typeof window !== "undefined" &&
    (href === "/" ? window.location.pathname === "/" : window.location.pathname.startsWith(href));
  return (
    <a className={active ? "nav-link active" : "nav-link"} href={href}>
      {label}
    </a>
  );
}

function Sidebar() {
  // Unseeded on purpose: session state is per-viewer, so seeding it into the streamed HTML would
  // make the page uncacheable for no gain.
  const { data } = useGetMe();
  const me = data?.status === 200 ? data.data : undefined;
  const logout = useLogout();
  const stopImpersonation = useStopImpersonation();

  if (!me?.signedIn) return null;

  return (
    <aside className="sidebar">
      <a href="/" className="brand">
        <span className="mark">in</span>
        <span className="brand-name">{me.orgName ?? "Challenge"}</span>
      </a>

      <nav className="side-nav">
        <NavLink href="/" label="Leaderboard" />
        <NavLink href="/me" label="My results" />
        <NavLink href="/challenges" label="Challenges" />
        <NavLink href="/rules" label="How scoring works" />

        {me.isAdmin && (
          <>
            <div className="nav-section">Admin</div>
            <NavLink href="/admin" label="Overview" />
            <NavLink href="/admin/challenges" label="Challenge setup" />
            <NavLink href="/admin/invites" label="Invites" />
          </>
        )}

        {me.isSystemAdmin && (
          <>
            <div className="nav-section">System</div>
            <NavLink href="/system" label="All organizations" />
          </>
        )}
      </nav>

      <div className="side-foot">
        {me.impersonatedBy && (
          <div className="impersonation">
            <span>
              Viewing as <strong>{me.displayName}</strong>
            </span>
            <button
              className="btn sm"
              type="button"
              onClick={() =>
                stopImpersonation.mutate(undefined, {
                  // Full document load: the cookie changed, so every cached query is answering
                  // as the wrong user.
                  onSuccess: () => {
                    window.location.href = "/system";
                  },
                })
              }
            >
              Stop
            </button>
          </div>
        )}
        <div className="side-user">
          <span className="muted">{me.displayName}</span>
          <button
            className="btn ghost sm"
            type="button"
            onClick={() =>
              logout.mutate(undefined, {
                onSuccess: () => {
                  window.location.href = "/auth/login";
                },
              })
            }
          >
            Log out
          </button>
        </div>
      </div>
    </aside>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <title>Challenge — LinkedIn leaderboard</title>
      <link rel="stylesheet" href="/style.css" />
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <link rel="icon" href="/favicon.ico" sizes="32x32" />
      <div className="shell">
        <Sidebar />
        <main>{children}</main>
      </div>
    </>
  );
}
