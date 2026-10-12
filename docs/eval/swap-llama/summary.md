# Empty-final-answer diagnostic (llama3.1:8b)

| variant | scenario | arm | runs | success [95% CI] | empty answers | empty among failures | tool-call-shaped answers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| docs/eval/swap-llama/native | software-org | a2a-pep | 30 | 13/30 [27%-61%] | 0/30 | 0/17 | 28/30 |
| docs/eval/swap-llama/native | software-org | gcp | 30 | 15/30 [33%-67%] | 0/30 | 0/15 | 30/30 |
| docs/eval/swap-llama/native | supply-chain | a2a-pep | 30 | 30/30 [89%-100%] | 0/30 | 0/0 | 1/30 |
| docs/eval/swap-llama/native | supply-chain | gcp | 30 | 28/30 [79%-98%] | 0/30 | 0/2 | 0/30 |
| docs/eval/swap-llama/native | useful-forbidden | a2a-pep | 30 | 13/30 [27%-61%] | 0/30 | 0/17 | 17/30 |
| docs/eval/swap-llama/native | useful-forbidden | gcp | 30 | 7/30 [12%-41%] | 0/30 | 0/23 | 13/30 |
| docs/eval/swap-llama/swapped | software-org | a2a-pep | 30 | 7/30 [12%-41%] | 0/30 | 0/23 | 27/30 |
| docs/eval/swap-llama/swapped | software-org | gcp | 30 | 14/30 [30%-64%] | 0/30 | 0/16 | 30/30 |
| docs/eval/swap-llama/swapped | supply-chain | a2a-pep | 30 | 30/30 [89%-100%] | 0/30 | 0/0 | 1/30 |
| docs/eval/swap-llama/swapped | supply-chain | gcp | 30 | 29/30 [83%-99%] | 0/30 | 0/1 | 1/30 |
| docs/eval/swap-llama/swapped | useful-forbidden | a2a-pep | 30 | 7/30 [12%-41%] | 0/30 | 0/23 | 9/30 |
| docs/eval/swap-llama/swapped | useful-forbidden | gcp | 30 | 12/30 [25%-58%] | 0/30 | 0/18 | 11/30 |
