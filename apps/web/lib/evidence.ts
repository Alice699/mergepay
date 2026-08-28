export const verifiedEvidence = [
  {
    label: "Merged PR payout",
    detail: "1,000,000 kelvin released to the committed beneficiary",
    signature:
      "Fu9AhK9o5HgQuQCucCFitQSmKswGMkhWiEL1fh3znkoRk1Z8V9UsRJiz8AHz9msHxMGHPTHFeimA1pWZBupZCVm",
    tone: "positive",
  },
  {
    label: "Open PR protection",
    detail: "Callback completed and escrow remained locked",
    signature:
      "2TtNKtrzTuc9JnhnojQU1z6dFsBx8jwBg7ZL55KDsXhUNUiSwxzbV53MJybG6KNhjkwRmutDrS2eULVF2BdfuXbM",
    tone: "neutral",
  },
  {
    label: "Early refund guard",
    detail: "Refund rejected before the workflow deadline",
    signature:
      "2rPkxQ1qwPgp5ANpTuMRu7KAt4cQjS9uM792UmWkkLtbVyeW5T1Fam2J5EtJ9u1NhuKp7vho8HGAQgNCSjAAv8ez",
    tone: "neutral",
  },
  {
    label: "Expired bounty refund",
    detail: "1,000,000 kelvin returned after the deadline",
    signature:
      "2oitQdyDKtWrUBWbm2dfxZPJcRp6NidXomPQnKYMg7ghHauqEZ6WohNrXAZZELMZsjk6vvURxTJuV8eMZi8TqxRb",
    tone: "warning",
  },
] as const;
