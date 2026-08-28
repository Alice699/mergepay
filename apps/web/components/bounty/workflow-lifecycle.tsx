const stages = [
  { number: "01", scope: "ONCHAIN", title: "Create", copy: "Commit the PR, beneficiary, amount, and deadline." },
  { number: "02", scope: "ESCROW", title: "Fund", copy: "Lock the exact bounty amount in the workflow PDA." },
  { number: "03", scope: "REX", title: "Verify", copy: "Rialo checks GitHub’s compact merge endpoint." },
  { number: "04", scope: "CALLBACK", title: "Settle", copy: "Pay on unanimous merge proof or refund after expiry." },
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
