import { useListOrgs, useGetMe } from "@server/client";

export default function Home() {
  const { data } = useListOrgs();
  const orgs = data?.status === 200 ? data.data : [];
  const { data: meData } = useGetMe();
  const me = meData?.status === 200 ? meData.data : undefined;

  return (
    <>
      <h1>LinkedIn posting challenge</h1>
      <p className="lede">
        Companies run friendly LinkedIn posting competitions. Participants install a browser
        extension that privately syncs their own follower count, posts, and post analytics — then a
        live leaderboard scores everyone by the rules the company sets.
      </p>

      {me?.orgSlug && (
        <p>
          <a className="btn" href={`/orgs/${me.orgSlug}`}>
            Go to your leaderboard
          </a>{" "}
          {me.memberId != null && (
            <a className="btn ghost" href={`/orgs/${me.orgSlug}/members/${me.memberId}`}>
              My standing
            </a>
          )}
        </p>
      )}

      <h2>Leaderboards</h2>
      {orgs.length === 0 ? (
        <div className="empty">No organizations yet. Be the first to create one.</div>
      ) : (
        <div className="panel">
          <ul className="plain">
            {orgs.map((org) => (
              <li key={org.slug}>
                <a href={`/orgs/${org.slug}`}>{org.name}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
