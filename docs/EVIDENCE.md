# DevNet Evidence

Runtime-proven review candidate: `2WtSUhTyNfVsC7rDv5iWw3HBCkzCc9ymE1RLmQMvGShU`

Hardened deployment (metadata verified; fresh runtime proof pending):
`4VWR2cKxy5gGjcm74i36T2DKH9xPzHqKoydgaL9Q4Z6F`

Artifact for the fully tested, pre-hardening deployment:

- Historical pre-reorganization path:
  `target/rialo-build/mergepay-rialo-riscv/mergepay_rialo.polkavm`
- Size: `195954` bytes (matches the deployed program's executable data length)
- SHA-256: `8F1156B3AEF1F2AE5A72B7D77E039F69FB6DBFC6D3D26F4703BDF81A8CB5D7A2`

Current hardened artifact and deployment record:

- Path:
  `programs/mergepay-rialo/target/rialo-build/mergepay-rialo-riscv/mergepay_rialo.polkavm`
- Size: `196167` bytes
- SHA-256: `BBA5032C634A76AE835A2A01517B936BD13E64F4AF05AF4DD83542611BF030B5`
- Deployed slot: `4467228`
- Onchain data length: `196215` bytes; executable data length: `196167` bytes
- Fresh payout, no-payout, and refund proof is still pending for this new program.

All signatures below were inspected with `rialo -n devnet client transaction`.

## Merged PR payout

Fixture: `microsoft/vscode#332677`

| Step | Signature | Result |
| --- | --- | --- |
| Create | `46AgT7FuWteP9PeBoWWj9wnkAzkSKxY31pgUgMBRHXgp4UUAgJFaVCnwtWtuZqnNpjyNSJ6BJuomFzY5NDKXTyx2` | Success |
| Fund | `3y8DxEgRF6xH6i115aMXDtTxB2YBJrfj2E3sGFf5u8KwyRJ11bykmqjhZXNyQZipyVmBV1xad9QorwshPBFWEefb` | Success |
| Check | `4MinWv7WpvEDiRDdEhxWjPvDcdtVa8cRtZSuBVXBW1YYaZyjsyvQyVpxsWywD3wJr54aKu1tmiQp3kuyP6ktzxPH` | REX scheduled |
| Callback | `2cRZMgzcWGexo7QxDpqyhGTxSeD74m17F2jSb79tbL7jsm4Mw5UDGNgGb9s5NgMXDmjrYDpfbXsdXNDAs2jQZp31` | `1,000,000` kelvin released |
| Status | `4YNPeFPqDPmGWVVuvMuKVXbhJwdDQdDPtYfvi9d91YAT6Fgqijtfs6yYheYDATXm1jnonG5MNTeWcMVHzz3nombh` | funded/merged/paid |

Workflow PDA: `AD3KcYtt3kMZPwzmkwBbS7PRiwugCkAC1vnZwFzWuf3F`

- Beneficiary: `0.999995 RLO` → `1.000995 RLO`.
- PDA: `0.00285832 RLO` → `0.00185832 RLO`.
- Final state: `funded=true, merged=true, paid=true, refunded=false, checks=1`.

## Open PR no-payout

Fixture at test time: `microsoft/vscode#333137`; live endpoint returned HTTP `404`.

| Step | Signature | Result |
| --- | --- | --- |
| Create | `2NC1Tf7qFReEEJ8N18Z2FQ4oo8SxQfwqj8xWvY8w5dKZ5hwo6AjcRGNfE4oJ2hQMq2q31HahRo5QaWBnCkVVWjt` | Success |
| Fund | `4kg8burLYc3oXtM89iNVbeadAqGgGucsR2h5X88tyw48cNN51Ps1M9jTEQtjkh8MNvq15mNwD8TUZKhd3UnYkBK4` | Success |
| Check | `3EGunARQ8XiRyDFJLtq2vjnEX8RfK5wco9SUH35RwuPgdS7yseTJDw6kxFp2BRvBj9ZPPbobvG1rJihCmoK8MhhG` | REX scheduled |
| Callback | `5HXHyRZzNrwKXqwUBr8QksPaS2j554bwpBNZ1474hpEUqjbjZnAbVhF3BSh4XYTMXo6kUuShecDWzu7V6BivzwjD` | Escrow remains locked |
| Status | `wmduhSmnPiPUBzmfr6jAJGYFy5buFD2odgphApb3sFSwYw4LXxsj1vJxzXWmnqA8hnjxaBQ3ioEW5YTptmK6Azk` | not merged/not paid |

Workflow PDA: `FE6dyWXUy8eLZVPP49cwFE42ZrRuCfREykynSegobvrL`

- Beneficiary stayed `1.000995 RLO`.
- PDA stayed `0.00285832 RLO`.
- Final state: `funded=true, merged=false, paid=false, refunded=false, checks=1`.

## Deadline refund

Workflow PDA: `DJKMjogh1HNX3G3uc5XQn3YLy2hFgFwL6mWmT1bYi5sK`

| Step | Signature | Result |
| --- | --- | --- |
| Create | `57Co7KcFArrKzFN6KqEHeG3Lt3iPrSqNAn37FoXWfk3NuK9CUEH4wXiEXqi3T3YJ2kyGyp7kRt5SVjcWnXQwwkkC` | Success |
| Fund | `4pydro5Ccjo2LfY9gnKKJqD5vXpHASmfn2tXMgNusW3aUENumMfZVhq3uuFQiHVLjZBZzKUy7ZWtP57gahto6Vgy` | Success |
| Early refund | `kXE35BYoBLuf7XRJyQGrqRHt8TjzsYdtYVgu2kGse5BNPxo7eMs1pTVAuR7K6Q2Ah8GXzG9uvNS9NKuXom3NGGd` | Rejected: `InvalidArgument` |
| Valid refund | `4u39R99pqFhMBfHaBDFDQjXD19cQBWAbTH9y2mLLBdbgkxjRAGGVkX2tRs43fhYEV8MFAFBNP1vQATkob42V61vU` | `1,000,000` kelvin refunded |
| Status | `5hQVhGkzRdfE8oQZ8LHhsg7rfNgTcsuLabwbSy9oXv2KB4d4BT44hP4rpQBuVVcvdk29qbPkxTg19kiBzNFY48U3` | refunded |

- Sponsor: `0.88643584 RLO` → `0.88743084 RLO`, exactly `+995,000` kelvin net of fee.
- PDA: `0.00285832 RLO` → `0.00185832 RLO`.
- Final state: `funded=true, merged=false, paid=false, refunded=true, checks=0`.

## HTTP feasibility spike

The full GitHub PR response failed with `Response size exceeds maximum of 12987 bytes`.
The compact endpoint then proved both response branches:

- Full-response callback:
  `5nbisigzboFMPVJseadDVMwE62SMsokEXjhMyGGMrbQVpzSA1eym2Zizpi54nZ2DzhQkQ28BVQTFC7DfrLBxRFV1`
- Compact merged callback:
  `546miEGfbJUSxz2WKvqYtNvFuFXuzV7KFCAfCjmSxiC5hs7CRTWp35Tib6ds5KcKt3Hox64HMNBu9kddt4KLirv3`
- Compact open callback:
  `2f2MQSb2WBh8ooLxQo4J6RuZ7iSUv8XE6Rf6nThfMx13PbWWVmMPciUBQhZaJPWswT77U3mt3pneaCir6LhiaFTm`

## Verification commands

```bash
rialo -n devnet client program show 2WtSUhTyNfVsC7rDv5iWw3HBCkzCc9ymE1RLmQMvGShU
rialo -n devnet client transaction REPLACE_WITH_SIGNATURE
rialo -n devnet --json client get-workflow-lineage REPLACE_WITH_CHECK_SIGNATURE
rialo -n devnet client account REPLACE_WITH_WORKFLOW_PDA
```
