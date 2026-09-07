# DevNet Evidence

Runtime-proven review candidate: `6QHxmfBi9DEhrcdg65c87Hp9H5Ny3xSTCT4b9vaDTsFB`

Previous runtime candidate reset by DevNet: `4VWR2cKxy5gGjcm74i36T2DKH9xPzHqKoydgaL9Q4Z6F`

Historical pre-hardening review candidate:
`2WtSUhTyNfVsC7rDv5iWw3HBCkzCc9ymE1RLmQMvGShU`

Hardened deployment (metadata and fresh runtime proof verified):
`6QHxmfBi9DEhrcdg65c87Hp9H5Ny3xSTCT4b9vaDTsFB`

Marketplace ABI deployment (2026-09-07):
`6PWtFXUA21nTjALCFwsbmpQyzn4ifEHnbPy56MmF1etL`

The marketplace ABI is deployed and selected by the current client, but its claim
and settlement E2E flow is intentionally not marked runtime-proven yet. The E2E
handoff is: create open bounty → OAuth claim → sponsor approval → fund → merge or
refund.

Marketplace deployment metadata:

- Status: `deployed-awaiting-e2e`
- Artifact: `programs/mergepay-rialo/target/rialo-build/mergepay-rialo-riscv/mergepay_rialo.polkavm`
- Size: `212662` bytes
- SHA-256: `594EDFCA83CD548559E921C5EC681ECE2E3D8BC48D5988895AD3A8EDADE680AA`
- Deployed slot: `10198662`
- Onchain data length: `212710` bytes; executable data length: `212662` bytes
- Authority: `2RGascNSeBgUxpkk57zQzQSeBZoUBiuT1HSRtuKTatEo`
- Program balance after deployment: `1.48135248 RLO`
- REX component bundle: not included in the artifact; the deployment command skipped
  optional `rex_components.bin`.
- Deployment transaction range: first
  `2NWpti2vmDcZrjCu7C3xmQzp5akRi4ZbzmBxRqSRxkaatEbQthFNX5fv8QDgRxSGZpqQmMknL2Wki6kxDxvMsfSG`,
  final `4vYAZbbThrJCoDDS3ZdttYy3fhZW9L1J3t2AbsrVCza1iimeXNrg9U72dB1nMXsov1d6AcGcxe5rqYM4XTjJx6ui`.

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
- Deployed slot: `7138100`
- Onchain data length: `196215` bytes; executable data length: `196167` bytes
- Fresh payout, no-payout, early-refund rejection, and post-deadline refund proof is
  recorded below for this program.

All signatures below were inspected with `rialo -n devnet client transaction`.

## Current hardened runtime proof (2026-09-02)

All workflows in this section ran against the current deployment
`6QHxmfBi9DEhrcdg65c87Hp9H5Ny3xSTCT4b9vaDTsFB` after the DevNet reset. The merged
fixture returned HTTP `204` from GitHub's compact merge endpoint. The open fixture
completed a mixed/inconclusive REX report and correctly failed closed without payout.

### Merged PR payout

Fixture: `microsoft/vscode#332677`; workflow slug ends in `...0009`.

| Step | Signature | Result |
| --- | --- | --- |
| Create | `4iAcKRJFSgzmywkUqPE2Mmi1EaujGrg4NPt3dxpfognx2bESj56edHcyvy5qtJsh9NBvGChmT1dc9Adt8ZmfT9eH` | Success |
| Fund | `3dNpNEacX85sNT1USV6ft5z7Ewyu6aN2oHwR5h5BRvkhTzb8XoszGjt4LZKgVSfsiC4voFb6AZ3tvKX1fVkCWtty` | Success |
| Check | `5njvCt6ESqPsasd8C19oNAu6PffAS1ZdR9Wii8wWRetFzezhqQZyDPop8cWmnq48dBq3qjq9TEd5sAUzqgBmXwzF` | REX scheduled |
| Callback | `5Rd8NV93C31nXBBubv4pqUszW9DCtgAjKTTrGPXsXEsLJfYVpopNH6SjeaYuyWz6khV6Vns51kpVzKWAGZoHJoCb` | `1,000,000` kelvin released |
| Status | `4ZeejLn7DZR8Z6VCWV6LMqhr3uu9PLzfC9EaXGtnYtqTXAbPLPPU1su2VYHcFnFnruJT136tTP3DE68xhNFoe9Yw` | funded/merged/paid |

Workflow PDA: `8mQD6UHLuf3GxR64iwXVESWWZi3mhniM7stS24rtNSvU`.

- Callback log: `MergePay released 1000000 kelvin`.
- PDA after payout: `0.00185832 RLO`, retaining the rent reserve.

### Open PR fail-closed path

Fixture: `microsoft/vscode#333137`; workflow slug ends in `...000a`.

| Step | Signature | Result |
| --- | --- | --- |
| Create | `3yc1Y983uENhPBzrBsARtqwTArr4Ng42TgJghhjzeKG4cRzoBpskSSwZLvuC4SSBiSBqi2jsJC8XWvQSadAXhZKm` | Success |
| Fund | `ddPP3sSAAYT4tjH7zcHMj4f2qnbQuRpiMPPU6pD2vX6sqiaXXVEQ4WM67vTSWB6qgL7LfueZ7H7WtdZHhp5RVpE` | Success |
| Check | `4wxAzC9WkbLnGfWHmo81Wm63ZB1aZ4cuioK1CikbHM9m8a9bmEzqWhA41wT5NZZ83C8MPsaD4viECc61GwQuziD5` | REX scheduled |
| Callback | `bsZiH8vP4gqe1SVgtvC798ynQfjG237o1smPMfgNuo9TxctLLHhHy5qj23W4W5MhCTYxhwWr729GdZ6EcyFJoMy` | Mixed report; escrow locked |
| Status | `5U8Zy7Y7VW9hiRjWgDD9p5uNw3jeYHCMehmowCuPT4xiVWhiwBgMBribQGfDxendh5VDKx3QUi93hmhZQjTbpW26` | funded/not merged/not paid |

Workflow PDA: `FtNrhMgDGBWWeEpXn8eDpvWrmZge5gqi66coioTosK45`.

- Callback log: `MergePay REX report was not unanimous: 3/4 merged`.
- PDA after callback: `0.00285832 RLO`; no payout occurred.

### Deadline refund

Workflow slug ends in `...000c`; the deadline was deliberately set shortly in the
future, then the valid refund was sent after the clock passed it.

| Step | Signature | Result |
| --- | --- | --- |
| Create | `3hnWDf2AYFsEoj1irakAmVU4ibWVdX7T4txn5F3xXAiDvZAgXJ1iZFrojiZu2jLgmVpdig9t15g61vp7UnZw2Lcn` | Success |
| Fund | `54vUvZ9e4gmCdmAuTcVYXTHTAjVDL88hi12jBpS3C48FAM2UDqXLgCBWYa685YtGZo1LHQ4uL22yVdrCzva1TpcA` | Success |
| Valid refund | `3Y5U5H5FJd9RDnCQuZKN4CcFAzrmCRri34PVJSe7Z1mFWSDR9E5Q3ukX9jWj1FLqRs6QtscmBnMGCJvyk29ggWRw` | `1,000,000` kelvin returned |
| Status | `Uf6pF4bJ5pg2aANp4g5owSpyy1mzpfxLcbo8ErmAMNmrjAshbtzM7BEweDRhyykYHLGazMUGP7qZGPuxPWvRa1o` | funded/not merged/refunded |

Workflow PDA: `4v2pwkPnb7MgMFg37a8X7e8ueN3ZwsVwgL2V64HMxXqj`.

- Refund log: `MergePay refunded 1000000 kelvin to sponsor`.
- PDA after refund: `0.00185832 RLO`, retaining the rent reserve.

### Early refund rejection

Workflow slug ends in `...000d`; the refund was attempted before its deadline.

| Step | Signature | Result |
| --- | --- | --- |
| Early refund | `4Y9ovp4FadFBe7PSNdCMU8qaYjg7bB3kS6xRTgEAeezrUjkMHMBxNPiR1mMPqmCXNEsdisAUwZzhQyX6EADUbmCM` | Rejected: `InvalidArgument` |

The CLI reports the failed signature, while transaction metadata confirms
`InstructionError: InvalidArgument` and the workflow remains locked.

## Previous hardened runtime proof before reset (2026-08-29)

The records below were valid on the previous DevNet deployment and are retained for
historical review only. That program account no longer exists after the reset.

All workflows below ran against program
`4VWR2cKxy5gGjcm74i36T2DKH9xPzHqKoydgaL9Q4Z6F`. The merged fixture returned HTTP
`204` from GitHub's compact merge endpoint; the open fixture returned HTTP `404`.

### Merged PR payout

Fixture: `microsoft/vscode#332677`; workflow slug ends in `...0009`.

| Step | Signature | Result |
| --- | --- | --- |
| Create | `2vpgJYQLEkF8rtNsdrEHMbx2xx8mRoAKnhhkvSaVk9GLDHWcgvMgcc3e3viUo2aJFRFZadoJ8BMW9JFGhvNogw1N` | Success |
| Fund | `42qe8zwm1uRLLgVubHxkLeSQyqBfQhqURRp4zc3i2qyxxaKVBruFjp4xAyrWHWWtJEkmHmJzgqeCvEcpbShg678d` | Success |
| Check | `5zwpvatvJd3LcaxLYbUKpmKyY3LjzZ6jHzMW62PnHyVJsRGG7dMEhB5wBLWXLvfZ3eX7JChcbiSnnpkVkD5hCo6x` | REX scheduled |
| Callback | `Fu9AhK9o5HgQuQCucCFitQSmKswGMkhWiEL1fh3znkoRk1Z8V9UsRJiz8AHz9msHxMGHPTHFeimA1pWZBupZCVm` | `1,000,000` kelvin released |
| Status | `32CXqHPnFQvTvRDpNaxspAQwT2ssX8vZuzdhAcs7tJ3J5t4TcwYvmgxZJTmSXvDuEL443gHqYDVq95eAE29C8H1z` | funded/merged/paid |

Workflow PDA: `EJgmwWGUeXpB7b67qwz37PhYpewXawwSxjRk2ZHUvYUN`.

- Beneficiary: `0.999995 RLO` -> `1.001995 RLO`.
- PDA after payout: `0.00185832 RLO`, retaining the rent reserve.
- Callback lineage: root `5zwpvatv...` -> callback `Fu9AhK9o...`.
- Final state: `funded=true, merged=true, paid=true, refunded=false, checks=1`.

### Open PR no-payout

Fixture: `microsoft/vscode#333137`; workflow slug ends in `...000a`.

| Step | Signature | Result |
| --- | --- | --- |
| Create | `22gHsGGAr5Qpq5aGWfSYG8XYVoi9PrtdF3zrm9owg6LoSdQdbGVTWgPaFRFrU1PJsSsroxEjsxfsq5HTCWgNJ7vK` | Success |
| Fund | `2Coo7BvSnmMnfT9aTsK1KcYPN1rWJCDmtVEnH7zGzBHhPhCz1VoKt5vRMFHJzRuFAzGL1Eup5cotd8MDvvf3soU8` | Success |
| Check | `SgMkPcdL9xqT1e1AoYv34aM9L6Cj5oKbJGb3NV8D1SPVyiCsL89N9xXQpVCz52STstGU88nwofQnF6AYBhvxFmj` | REX scheduled |
| Callback | `2TtNKtrzTuc9JnhnojQU1z6dFsBx8jwBg7ZL55KDsXhUNUiSwxzbV53MJybG6KNhjkwRmutDrS2eULVF2BdfuXbM` | Escrow remains locked |
| Status | `2wxpS6uJSvjZRH5FcmmyP7hWVtzEJe3DwXVe3saDBWfQ83Cj2JKnv2XhyUiWJRojR7w4pTgTrAXRLHqdYig8ppRR` | not merged/not paid |

Workflow PDA: `C6bHH6SDwC6fFeHiLgqvNrMJbbx8yek72MdUZNSBwXLv`.

- Beneficiary remained `1.001995 RLO`.
- PDA remained `0.00285832 RLO`.
- Callback lineage: root `SgMkPcdL...` -> callback `2TtNKtrz...`.
- Final state: `funded=true, merged=false, paid=false, refunded=false, checks=1`.

### Deadline refund

Workflow slug ends in `...000c`; deadline was `1787941094399` ms and the post-deadline
clock sample was `1787941114755` ms.

| Step | Signature | Result |
| --- | --- | --- |
| Create | `2PQQxuz1RA65sUChuDyw6ZUcLccbnvzp9eDnVXJxu71E8VvFgEXpaDxtj1BRiWY3LNs9DkYdPQwoQCP9q4j5dQXg` | Success |
| Fund | `5uqdBj5CYi16kmUh1ozJ3t5UdvqVYncdZ8GcA7jRNr7ZN1vuK62VBa3t87DCaDLemBeNNypt8RL8PQnoyefQdRGt` | Success |
| Early refund | `2rPkxQ1qwPgp5ANpTuMRu7KAt4cQjS9uM792UmWkkLtbVyeW5T1Fam2J5EtJ9u1NhuKp7vho8HGAQgNCSjAAv8ez` | Rejected: `InvalidArgument` |
| Valid refund | `2oitQdyDKtWrUBWbm2dfxZPJcRp6NidXomPQnKYMg7ghHauqEZ6WohNrXAZZELMZsjk6vvURxTJuV8eMZi8TqxRb` | `1,000,000` kelvin refunded |
| Status | `3hUrurEmaw8WvqbaZeV79FxwVJuubEYJyLh5DgkLzoZsECRcFxXi7H3E71VPAnKE2mFdHQJxUnJfum59a2UE2v9r` | refunded |

Workflow PDA: `9BUGzXeuwXuXnfF65ptfe17wD8YPLWUSoUHDbhdAWyHe`.

- Early refund failed with `InstructionError: InvalidArgument`, before the deadline.
- Valid refund logged `MergePay refunded 1000000 kelvin to sponsor`.
- PDA after refund: `0.00185832 RLO`, retaining the rent reserve.
- Final state: `funded=true, merged=false, paid=false, refunded=true, checks=0`.

## Historical pre-hardening merged PR payout

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

## Historical pre-hardening open PR no-payout

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

## Historical pre-hardening deadline refund

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
rialo -n devnet client program show 6QHxmfBi9DEhrcdg65c87Hp9H5Ny3xSTCT4b9vaDTsFB
rialo -n devnet client transaction REPLACE_WITH_SIGNATURE
rialo -n devnet --json client get-workflow-lineage REPLACE_WITH_CHECK_SIGNATURE
rialo -n devnet client account REPLACE_WITH_WORKFLOW_PDA
```
