export const verifiedEvidence = [
  {
    label: "Merged PR payout",
    detail: "1,000,000 kelvin released to the committed beneficiary",
    signature:
      "5Rd8NV93C31nXBBubv4pqUszW9DCtgAjKTTrGPXsXEsLJfYVpopNH6SjeaYuyWz6khV6Vns51kpVzKWAGZoHJoCb",
    tone: "positive",
  },
  {
    label: "Open PR protection",
    detail: "Callback completed; inconclusive report kept escrow locked",
    signature:
      "bsZiH8vP4gqe1SVgtvC798ynQfjG237o1smPMfgNuo9TxctLLHhHy5qj23W4W5MhCTYxhwWr729GdZ6EcyFJoMy",
    tone: "neutral",
  },
  {
    label: "Early refund guard",
    detail: "Refund rejected before the workflow deadline",
    signature:
      "4Y9ovp4FadFBe7PSNdCMU8qaYjg7bB3kS6xRTgEAeezrUjkMHMBxNPiR1mMPqmCXNEsdisAUwZzhQyX6EADUbmCM",
    tone: "neutral",
  },
  {
    label: "Expired bounty refund",
    detail: "1,000,000 kelvin returned after the deadline",
    signature:
      "3Y5U5H5FJd9RDnCQuZKN4CcFAzrmCRri34PVJSe7Z1mFWSDR9E5Q3ukX9jWj1FLqRs6QtscmBnMGCJvyk29ggWRw",
    tone: "warning",
  },
] as const;
