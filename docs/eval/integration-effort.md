# Integration-effort proxy (deterministic)

Declarations a deployer authors (one entry per endpoint, card, policy, credential, peer binding, ...).

## Onboarding participant n+1

| style | n | entries added | existing artifacts edited | new artifacts |
| --- | --- | --- | --- | --- |
| GCP (one server, one query tool) | 10 | 7 | 2 | 2 |
| GCP (one server, one query tool) | 50 | 7 | 2 | 2 |
| A2A base, mesh (one tool per peer) | 10 | 22 | 10 | 2 |
| A2A base, mesh (one tool per peer) | 50 | 102 | 50 | 2 |
| A2A base, registry (one send-task tool) | 10 | 4 | 1 | 2 |
| A2A base, registry (one send-task tool) | 50 | 4 | 1 | 2 |
| A2A+PEP, mesh | 10 | 27 | 11 | 2 |
| A2A+PEP, mesh | 50 | 107 | 51 | 2 |
| A2A+PEP, registry | 10 | 9 | 2 | 2 |
| A2A+PEP, registry | 50 | 9 | 2 | 2 |

## Changing which roles may read one node, and totals

| style | rule change (n=10) | artifacts holding a policy (n=10) | total declarations n=10 | n=50 |
| --- | --- | --- | --- | --- |
| GCP (one server, one query tool) | 1 entry in 1 artifact | 10 | 70 | 350 |
| A2A base, mesh (one tool per peer) | not expressible | 0 | 110 | 2550 |
| A2A base, registry (one send-task tool) | not expressible | 0 | 40 | 200 |
| A2A+PEP, mesh | 1 entry in 1 artifact | 10 | 160 | 2800 |
| A2A+PEP, registry | 1 entry in 1 artifact | 10 | 90 | 450 |

Enforcement layer written for the A2A+PEP arm: 151 source lines (policy-enforcement.ts, comments and blanks excluded).
