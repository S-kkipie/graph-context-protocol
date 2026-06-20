# GCP vs A2A — empirical evaluation

- model: `openai/gpt-oss-120b:free`
- seeds per arm: 5
- generated: 2026-06-20T03-42-01-729Z
### software-org

| metric | gcp | a2a |
| --- | --- | --- |
| messages | 1.0 ± 0.0 | 1.0 ± 0.0 |
| connections | 1.0 ± 0.0 | 1.0 ± 0.0 |
| tokens | 678.4 ± 5.8 | 685.4 ± 3.4 |
| roundTrips | 1.0 ± 0.0 | 1.0 ± 0.0 |
| latencyMs | 6268.4 ± 482.3 | 5986.1 ± 1168.4 |
| successRate | 1.0 ± 0.0 | 1.0 ± 0.0 |
| pairwiseConnections (struct) | 2 | 2 |
| integrationEffort (struct) | 1 | 4 |
| leakageRate | 0 | 0 |
| provenanceCompleteness | 1 | 0 |

### supply-chain

| metric | gcp | a2a |
| --- | --- | --- |
| messages | 1.0 ± 0.0 | 1.4 ± 0.5 |
| connections | 1.0 ± 0.0 | 1.4 ± 0.5 |
| tokens | 707.6 ± 3.5 | 901.4 ± 229.2 |
| roundTrips | 1.0 ± 0.0 | 1.4 ± 0.5 |
| latencyMs | 6278.1 ± 1632.2 | 7718.0 ± 2678.3 |
| successRate | 1.0 ± 0.0 | 1.0 ± 0.0 |
| pairwiseConnections (struct) | 2 | 2 |
| integrationEffort (struct) | 1 | 4 |
| leakageRate | 0.5 | 1 |
| provenanceCompleteness | 1 | 0 |

### marketplace

| metric | gcp | a2a |
| --- | --- | --- |
| messages | 2.8 ± 0.7 | 2.8 ± 0.7 |
| connections | 2.8 ± 0.7 | 2.8 ± 0.7 |
| tokens | 2425.2 ± 1000.8 | 2431.1 ± 1082.4 |
| roundTrips | 2.8 ± 0.7 | 2.8 ± 0.7 |
| latencyMs | 12616.9 ± 3757.2 | 11940.9 ± 4304.0 |
| successRate | 0.3 ± 0.5 | 0.3 ± 0.5 |
| pairwiseConnections (struct) | 2 | 2 |
| integrationEffort (struct) | 1 | 4 |
| leakageRate | 0 | 0 |
| provenanceCompleteness | 1 | 0 |

### marketplace structural curve (pairwiseConnections)

| N | gcp | a2a |
| --- | --- | --- |
| 2 | 2 | 2 |
| 3 | 3 | 6 |
| 4 | 4 | 12 |
| 5 | 5 | 20 |
| 6 | 6 | 30 |
| 7 | 7 | 42 |
| 8 | 8 | 56 |
| 9 | 9 | 72 |
| 10 | 10 | 90 |
| 11 | 11 | 110 |
| 12 | 12 | 132 |
| 13 | 13 | 156 |
| 14 | 14 | 182 |
| 15 | 15 | 210 |
| 16 | 16 | 240 |
| 17 | 17 | 272 |
| 18 | 18 | 306 |
| 19 | 19 | 342 |
| 20 | 20 | 380 |
| 21 | 21 | 420 |
| 22 | 22 | 462 |
| 23 | 23 | 506 |
| 24 | 24 | 552 |
| 25 | 25 | 600 |
| 26 | 26 | 650 |
| 27 | 27 | 702 |
| 28 | 28 | 756 |
| 29 | 29 | 812 |
| 30 | 30 | 870 |
| 31 | 31 | 930 |
| 32 | 32 | 992 |
| 33 | 33 | 1056 |
| 34 | 34 | 1122 |
| 35 | 35 | 1190 |
| 36 | 36 | 1260 |
| 37 | 37 | 1332 |
| 38 | 38 | 1406 |
| 39 | 39 | 1482 |
| 40 | 40 | 1560 |
| 41 | 41 | 1640 |
| 42 | 42 | 1722 |
| 43 | 43 | 1806 |
| 44 | 44 | 1892 |
| 45 | 45 | 1980 |
| 46 | 46 | 2070 |
| 47 | 47 | 2162 |
| 48 | 48 | 2256 |
| 49 | 49 | 2352 |
| 50 | 50 | 2450 |
