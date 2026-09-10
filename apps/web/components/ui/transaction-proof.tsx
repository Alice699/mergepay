import { ExternalLink } from "lucide-react";
import { CopyValue } from "@/components/ui/copy-value";
import { getRialoScanTransactionUrl } from "@/lib/rialo-scan";

export function TransactionProof({ signature }: Readonly<{ signature: string }>) {
  return (
    <div className="transaction-proof">
      <CopyValue value={signature} />
      <a
        aria-label="Open transaction in Rialo Scan"
        className="transaction-proof__link"
        href={getRialoScanTransactionUrl(signature)}
        rel="noreferrer noopener"
        target="_blank"
        title="Open in Rialo Scan"
      >
        <ExternalLink aria-hidden="true" size={13} strokeWidth={1.9} />
        <span>Scan</span>
      </a>
    </div>
  );
}
