# RPC

`MergePayRpcClient` wraps the official Rialo SDK for account, balance, config-prefix,
health, signature-status, send, and confirmation calls. It also keeps a raw transport
escape hatch for transaction inspection because the DevNet response uses camelCase
transaction fields that the SDK's typed transaction mapper does not currently consume.

Network configuration is injected by `MergePayClientOptions`; the package does not use
mock accounts or fabricate transaction status.
