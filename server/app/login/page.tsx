import { useLogin } from "@server/client";
import { useState } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const login = useLogin();

  return (
    <>
      <h1>Log in</h1>
      {error && <div className="notice err">{error}</div>}

      <div className="panel" style={{ maxWidth: 460 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            login.mutate(
              { data: { email, password } },
              {
                onSuccess: (res) => {
                  if (res.status === 200) {
                    // Hard load: the session cookie is new, so every cached query is stale.
                    // Everyone lands on their org's leaderboard; admins get the dashboard link
                    // in the nav rather than a different destination.
                    window.location.href = res.data.orgSlug ? `/orgs/${res.data.orgSlug}` : "/";
                  } else {
                    setError("Invalid email or password.");
                  }
                },
                onError: () => setError("Invalid email or password."),
              },
            );
          }}
        >
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
              required
            />
          </div>
          <button type="submit" disabled={login.isPending}>
            {login.isPending ? "Signing in…" : "Log in"}
          </button>
        </form>
      </div>

      <p className="small muted">
        Have an invite code? <a href="/join">Join a challenge</a>.
        <br />
        Setting up a challenge for your company? <a href="/signup">Create an organization</a>.
      </p>
    </>
  );
}
