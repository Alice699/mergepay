const stages = [
  { number: "01", scope: "ONCHAIN", title: "Create", copy: "Lock the PR revision, payout policy, reward, and deadline." },
  { number: "02", scope: "ESCROW", title: "Fund", copy: "Approve the contributor wallet, then deposit the exact reward." },
  { number: "03", scope: "REX", title: "Verify", copy: "Rialo checks the locked PR, CI, and review policy." },
  { number: "04", scope: "CALLBACK", title: "Settle", copy: "Pay on unanimous policy proof or refund after expiry." },
] as const;

export function WorkflowLifecycle() {
  return (
    <ol className="lifecycle">
      {stages.map((stage) => (
        <li key={stage.number}>
          <span className="lifecycle__number mono">{stage.number}</span>
          <div className="lifecycle__content">
            <span className="lifecycle__scope mono">{stage.scope}</span>
            <h3>{stage.title}</h3>
            <p>{stage.copy}</p>
          </div>
          <span aria-hidden="true" className="lifecycle__marker" />
        </li>
      ))}
    </ol>
  );
}
