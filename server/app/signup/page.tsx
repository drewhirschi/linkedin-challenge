import { useSignup } from "@server/client";
import { useState } from "react";

export default function Signup() {
  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const signup = useSignup();

  return (
    <>
      <h1>Create an organization</h1>
      {error && <div className="notice err">{error}</div>}

      <div className="panel" style={{ maxWidth: 460 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            signup.mutate(
              { data: { orgName, name, email, password } },
              {
                onSuccess: (res) => {
                  if (res.status === 200) {
                    window.location.href = "/admin";
                  } else {
                    // The server distinguishes "email taken" from "password too short"; show its
                    // wording rather than inventing our own.
                    setError(res.data?.error ?? "Something went wrong. Please try again.");
                  }
                },
                onError: () => setError("Something went wrong. Please try again."),
              },
            );
          }}
        >
          <div className="field">
            <span>Organization name</span>
            <input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Inc"
              required
            />
          </div>
          <div className="field">
            <span>Your name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Drew Example"
              required
            />
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
          <button type="submit" disabled={signup.isPending}>
            {signup.isPending ? "Creating…" : "Create organization"}
          </button>
        </form>
      </div>

      <p className="small muted">
        Already have an account? <a href="/login">Log in</a>.
      </p>
    </>
  );
}
