// Participant sign-up: redeem an invite code into a real account. Everyone signs in to see
// anything, so this is where a participant gets the credentials they use on the web AND in the extension.
import { useJoinWithInvite } from "@server/client";
import { useState } from "react";

export default function Join() {
  const [inviteCode, setInviteCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ orgName: string; slug: string } | null>(null);
  const join = useJoinWithInvite();

  // No token to copy any more: the extension signs in with these same credentials.
  if (joined) {
    return (
      <>
        <h1>You&rsquo;re in — welcome to {joined.orgName}</h1>
        <div className="notice ok">
          Your account is ready. To start syncing, install the Challenge Sync extension and sign in
          with the email and password you just chose.
        </div>
        <p>
          <a className="btn" href={`/orgs/${joined.slug}`}>
            Go to the leaderboard
          </a>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Join a challenge</h1>
      <p className="lede">
        Got an invite code from your organizer? Redeem it here to create your account.
      </p>
      {error && <div className="notice err">{error}</div>}

      <div className="panel" style={{ maxWidth: 460 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            join.mutate(
              { data: { inviteCode, name, email, password } },
              {
                onSuccess: (res) => {
                  if (res.status === 200) {
                    setJoined({ orgName: res.data.orgName, slug: res.data.orgSlug });
                  } else {
                    setError(res.data?.error ?? "Something went wrong. Please try again.");
                  }
                },
                onError: () => setError("Something went wrong. Please try again."),
              },
            );
          }}
        >
          <div className="field">
            <span>Invite code</span>
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="AB12-CD34"
              required
            />
          </div>
          <div className="field">
            <span>Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <button type="submit" disabled={join.isPending}>
            {join.isPending ? "Joining…" : "Join"}
          </button>
        </form>
      </div>

      <p className="small muted">
        Already have an account? <a href="/auth/login">Log in</a>.
      </p>
    </>
  );
}
