// An org's competitions. This page used to BE the leaderboard, silently picking whichever
// competition looked active; now that an org can run several, it lists them and each has its own
// board.
import { useGetOrg, fmtInt, fmtDate } from "@server/client";

export default function OrgPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const { data, isLoading } = useGetOrg(slug);

  if (isLoading) return <div className="spinner">Loading…</div>;
  if (data?.status !== 200) return <div className="empty">That organization doesn&rsquo;t exist.</div>;

  const { org, competitions, entrantCounts } = data.data;
  const now = Math.floor(Date.now() / 1000);
  const live = competitions.filter((c) => c.isActive && c.endAt >= now);
  const past = competitions.filter((c) => !(c.isActive && c.endAt >= now));

  const Row = ({ c, i }: { c: (typeof competitions)[number]; i: number }) => (
    <li key={c.id}>
      <a href={`/orgs/${slug}/c/${c.id}`}>{c.name}</a>{" "}
      <span className="small muted">
        {fmtDate(c.startAt)} → {fmtDate(c.endAt)} · {fmtInt(entrantCounts[i] ?? 0)} entrant
        {entrantCounts[i] === 1 ? "" : "s"}
      </span>
    </li>
  );

  return (
    <>
      <h1>{org.name}</h1>

      <h2>Running now</h2>
      {live.length === 0 ? (
        <div className="empty">No competition is running.</div>
      ) : (
        <div className="panel">
          <ul className="plain">
            {live.map((c) => (
              <Row key={c.id} c={c} i={competitions.indexOf(c)} />
            ))}
          </ul>
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2>Finished</h2>
          <div className="panel">
            <ul className="plain">
              {past.map((c) => (
                <Row key={c.id} c={c} i={competitions.indexOf(c)} />
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
