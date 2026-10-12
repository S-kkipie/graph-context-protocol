# Empty-final-answer diagnostic (gemini-2.5-flash-lite)

| variant | scenario | arm | runs | success [95% CI] | empty answers | empty among failures |
| --- | --- | --- | --- | --- | --- | --- |
| docs/eval/swap/native | software-org | a2a-pep | 30 | 29/30 [83%-99%] | 0/30 | 0/1 |
| docs/eval/swap/native | software-org | gcp | 30 | 20/30 [49%-81%] | 10/30 | 10/10 |
| docs/eval/swap/native | supply-chain | a2a-pep | 30 | 30/30 [89%-100%] | 0/30 | 0/0 |
| docs/eval/swap/native | supply-chain | gcp | 30 | 20/30 [49%-81%] | 10/30 | 10/10 |
| docs/eval/swap/native | useful-forbidden | a2a-pep | 30 | 29/30 [83%-99%] | 1/30 | 1/1 |
| docs/eval/swap/native | useful-forbidden | gcp | 30 | 10/30 [19%-51%] | 19/30 | 19/20 |
| docs/eval/swap/swapped | software-org | a2a-pep | 30 | 25/30 [66%-93%] | 4/30 | 4/5 |
| docs/eval/swap/swapped | software-org | gcp | 30 | 28/30 [79%-98%] | 0/30 | 0/2 |
| docs/eval/swap/swapped | supply-chain | a2a-pep | 30 | 19/30 [46%-78%] | 11/30 | 11/11 |
| docs/eval/swap/swapped | supply-chain | gcp | 30 | 29/30 [83%-99%] | 1/30 | 1/1 |
| docs/eval/swap/swapped | useful-forbidden | a2a-pep | 30 | 17/30 [39%-73%] | 13/30 | 13/13 |
| docs/eval/swap/swapped | useful-forbidden | gcp | 30 | 22/30 [56%-86%] | 7/30 | 7/8 |
