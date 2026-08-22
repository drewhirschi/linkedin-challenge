// Root layout: the sidebar shell that stays mounted across soft navigations. Plain <a> links let
// TanStack Router swap only the page leaf, so the React Query cache survives navigation.
//
// The information architecture is the manifest's three questions: "How is everyone doing?"
// (Leaderboard), "How am I doing?" (My results), "How does this work?" (How scoring works) —
// plus Admin for the people running the challenge and System for the product operator.
import { Component, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { useGetMe, useLogout, useStopImpersonation } from "@linkedin-challenge/client/react-query";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";

function NavLink({ href, pathname }: { href: string; pathname: string }) {
  // Prefix-match so /admin/challenges lights "Challenge setup"; exact-match "/" and "/admin" so
  // Leaderboard and Overview don't stay lit for every child underneath them.
  const active =
    href === "/" || href === "/admin" ? pathname === href : pathname.startsWith(href);
  return (
    <a className={active ? "nav-link active" : "nav-link"} href={href}>
      {label(href)}
    </a>
  );
}

const LABELS: Record<string, string> = {
  "/": "Leaderboard",
  "/me": "My results",
  "/challenges": "Challenges",
  "/rules": "How scoring works",
  "/admin": "Overview",
  "/admin/challenges": "Challenge setup",
  "/admin/invites": "Invites",
  "/system": "All organizations",
};
const label = (href: string) => LABELS[href] ?? href;

// The active tab must track the URL across soft navigations, and only the app shell's TanStack
// Router knows about those — window.location would paint once at mount and never move. But
// not-found.tsx boots OUTSIDE the router (its URL is never in the shell's route tree), where
// useLocation throws. So the live reader sits in its own component and this boundary catches the
// no-router case, falling back to the boot-time pathname — always accurate there, since a
// not-found document is only ever a hard load.
function RouterPathname({ children }: { children: (pathname: string) => ReactNode }) {
  return children(useLocation({ select: (l) => l.pathname }));
}

class PathnameProvider extends Component<
  { children: (pathname: string) => ReactNode },
  { outsideRouter: boolean }
> {
  state = { outsideRouter: false };
  static getDerivedStateFromError() {
    return { outsideRouter: true };
  }
  render() {
    if (this.state.outsideRouter) {
      return this.props.children(window.location.pathname);
    }
    return <RouterPathname>{this.props.children}</RouterPathname>;
  }
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
        <PathnameProvider>
          {(pathname) => (
            <>
              <NavLink href="/" pathname={pathname} />
              <NavLink href="/me" pathname={pathname} />
              <NavLink href="/challenges" pathname={pathname} />
              <NavLink href="/rules" pathname={pathname} />

              {me.isAdmin && (
                <>
                  <div className="nav-section">Admin</div>
                  <NavLink href="/admin" pathname={pathname} />
                  <NavLink href="/admin/challenges" pathname={pathname} />
                  <NavLink href="/admin/invites" pathname={pathname} />
                </>
              )}

              {me.isSystemAdmin && (
                <>
                  <div className="nav-section">System</div>
                  <NavLink href="/system" pathname={pathname} />
                </>
              )}
            </>
          )}
        </PathnameProvider>
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
      <NuqsAdapter>
        <div className="shell">
          <Sidebar />
          <main>{children}</main>
        </div>
      </NuqsAdapter>
    </>
  );
}
