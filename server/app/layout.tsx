// Root layout — the chrome that stays mounted across soft navigations. Plain <a> links let
// TanStack Router swap only the page leaf, so the React Query cache survives navigation.
import type { ReactNode } from "react";
import { useGetMe, useLogout } from "@server/client";

function Nav() {
  // Unseeded on purpose: session state is per-viewer, so seeding it into the streamed HTML would
  // make the page uncacheable for no gain.
  const { data } = useGetMe();
  const me = data?.status === 200 ? data.data : undefined;
  const logout = useLogout();

  if (!me?.signedIn) {
    return <a href="/auth/login">Log in</a>;
  }

  return (
    <>
      {/* "My standing" used to be a single link, from when a member had exactly one leaderboard.
          A member can now be in several competitions, so their standings live on the home page —
          one row per competition — and there is no single URL to point at. */}
      <a href="/">Your challenges</a>
      {me.orgSlug && <a href={`/orgs/${me.orgSlug}`}>Organization</a>}
      {/* The dashboard is the only thing the admin role unlocks. */}
      {me.isAdmin && me.orgSlug && <a href={`/orgs/${me.orgSlug}/admin`}>Manage</a>}
      <span className="muted">{me.displayName}</span>
      <button
        className="btn ghost sm"
        type="button"
        onClick={() =>
          logout.mutate(undefined, {
            // Full document load, not a soft nav: the session cookie changed, so every cached
            // query is now answering as the wrong user.
            onSuccess: () => {
              window.location.href = "/auth/login";
            },
          })
        }
      >
        Log out
      </button>
    </>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <title>Challenge — LinkedIn leaderboard</title>
      <link rel="stylesheet" href="/style.css" />
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <link rel="icon" href="/favicon.ico" sizes="32x32" />
      <header className="site-header">
        <nav className="nav">
          <a href="/" className="brand">
            <span className="mark">in</span>
            <span>Challenge</span>
          </a>
          <span className="spacer" />
          <Nav />
        </nav>
      </header>
      <main>{children}</main>
    </>
  );
}
