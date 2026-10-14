# Response to Reviewers

**Manuscript:** Read-First and Role-Gated Context Federation for Multi-Agent LLM Systems: A Controlled Multi-Model Comparison with Point-to-Point Messaging

We thank both reviewers for reports that identified real weaknesses. The most important was that the headline governance comparison measured the presence of features rather than the merit of a protocol. We addressed it by running the experiment the reviewers asked for, and the conclusion of the paper changed as a result. Section and table numbers below refer to the revised manuscript. Quoted reviewer text is abridged.

## Summary of what changed

| Change | Where |
|---|---|
| Instrumented A2A baseline (A2A+PEP) evaluated in the main comparison, 2,475 runs, 0 failed | Section V (methodology), Section VI-D, Table VI, Table I |
| Structural results reframed as a topology comparison, with an A2A hub column | Section VI-A, Table III, Section VI-B, Table IV |
| Integration-effort proxy added | Section VI-C, Table V, Limitation "Effort is a proxy" |
| Task success tabulated for all six models, 30 seeds each | Section VI-G, Table VII |
| Cause of the gemini-2.5-flash-lite gap identified by a controlled experiment | Section VI-H, Table VIII |
| Threat model and credential binding added | Section III-F, Table II |
| Semantic leakage scenario added (useful-forbidden) | Section VI-F |
| Revision-history language removed, duplicate heading merged, code availability added | Throughout, Section VII-D, "Code and Data Availability" |
| English proofreading pass | Throughout |

## Reviewer 1

**R1-1. The instrumented A2A baseline belongs in the main comparison, not in future work.**
Agreed. We implemented a third arm, `a2a-pep`: A2A servers behind a policy enforcement point that maps the bearer token to a principal, applies the same role and delegation policy, and writes an audit log. The three arms share one scenario definition and one injected model; only the interoperability layer differs. Results over 2,475 runs (Section VI-D, Table VI): GCP denied 443/443 unauthorized attempts, A2A+PEP denied 408/408, and base A2A executed 392/392. A2A+PEP ties GCP on containment, provenance and leakage. We therefore state in the paper that the earlier "1.00 versus 0.00" contrast was a statement about having a policy enforcement point and an audit sink, not about the protocol, and that the data show no governance outcome that GCP achieves and a correctly instrumented A2A cannot. What GCP offers instead is that gating, default deny, the delegation rule and the per-read record are part of the protocol and its server, whereas the A2A+PEP arm needed a token table, a wrapper around each node's executor and a convention for declaring the requested operation.

**R1-2. O(n²) versus O(n) is a topology result; O(1) tool prompt follows from exposing one generic tool.**
Agreed. Section VI-A now presents the result as a comparison of topologies and Table III adds an A2A-through-orchestrator column, which is also O(n). Section VI-B states that the O(1) tool-prompt and discovery figures follow from exposing a single query tool against one tool per peer. We also added a measure of integration effort (Section VI-C, Table V): a deterministic count of configuration entries and existing artifacts that must be edited to onboard participant n+1, for each arm and topology. It is a proxy and not a developer study; the paper says so in the Limitations.

**R1-3. Tabulate task success and the 30-seed results.**
Done. Table VII (Section VI-G) reports k/n success for the three scenarios whose criterion is the authorized task, for all six models and all three arms, with two-sided Fisher exact p-values against both baselines. Four of the six models show no difference between arms. The table also exposes two gaps that the earlier text did not show: gemini-2.5-flash-lite under GCP, and llama3.1:8b on software-org. The first was investigated (Section VI-H, Table VIII): in a 360-run experiment that swapped the tool descriptions between arms, the empty-answer pattern followed the wording of the description and not the protocol or the gate. The second did not reproduce on a rerun (15/30 versus 13/30, p = 0.80) and is reported as run-to-run variation. Token comparisons now cover all six models. We no longer state that success is equal across the board.

**R1-4. Explicit threat model and credential binding.**
Added as Section III-F. A query carries a bearer credential and not a role; the server resolves it to a principal through the authentication provider and the gate uses only that principal. Section III-F and Table II name six adversaries (instructed model, prompt-injected model, agent asserting another role, compromised agent or stolen credential, malicious node owner, colluding agents or out-of-band channels) and state for each what the gate does and what evidence exists. The supported property is limited to the first three with an uncompromised server and authentication provider. The remaining three are declared not mitigated or out of scope. We also replaced "proof" with a description of what the property-based tests establish (Section VI-J). Limitations: only the instructed-model adversary is exercised empirically.

**R1-5. The leakage scenarios do not discriminate; use a scenario where the confidential node is useful but forbidden, scored semantically.**
We added the useful-forbidden scenario (Section VI-F), in which the confidential node would help the task but the caller's role forbids it, and leakage is detected by patterns written for paraphrase as well as exact canary match. Section VI-I acknowledges that supply-chain is a tie and does not discriminate. The Limitations state that the semantic detector is a proxy.

**R1, language.**
The whole manuscript was proofread, including punctuation, consistency of terminology and tense, and the removal of stray typesetting errors.

## Reviewer 2

**R2-1.** We appreciate the comments on the fairness invariant and the forced-access scenario. Both are retained and described in Section V.

**R2-2.** See R1-1.

**R2-3.** See R1-2 for the topology reframing and the integration-effort proxy.

**R2-4. Success and cost parity rests on few seeds; the 30-seed Gemini results are not tabulated.**
See R1-3. All six models are reported with 30 seeds each (15 for qwen2.5:32b, whose duplicated seeds are removed by the aggregator). Table VII gives per-cell k/n and p-values and Table VI the pooled governance counts per scenario and model. Token ratios between GCP and A2A+PEP are reported for all six models.

**R2-5. The no-leak result is property-based testing, not a proof; there is no threat model.**
See R1-4. In addition, we found and documented a weakness in our own enforcement point: a caller that omits the operation declaration has its delegation executed and logged as a read. We added an opt-in hardening that denies undeclared requests and reran the delegation scenario (Section VII-D, Table IX): 165 distinct runs, containment 1.00, no delegation executed, results identical to the unhardened arm. The variant does not close a false declaration of "read".

**R2-6. Transport asymmetry; Table I asserted rather than demonstrated.**
The Limitations (Section VII-D) now state that the GCP arm hosts nodes in-process while both A2A arms use localhost HTTP servers, so wall-clock latency is not comparable and supports no claim; token counts are model tokens and are unaffected. We also state that the A2A+PEP arm is our own implementation, so equal outcomes show that the policy and not the protocol determines containment and do not show that every third-party gateway would be as complete. We did not evaluate MCP-based gated retrieval or Progent against GCP. Section III-E now states that the cells of Table I are derived from the cited specifications and not from experiments, that "not nat." means not a native primitive (achievable by extending the base protocol), and that policy layers such as Progent are not evaluated here. Demonstrating those cells experimentally remains open.

**R2-7. Revision-history language, duplicated Limitations heading, no code availability.**
All revision-history phrasing was removed or restated as method (for example, "run separately from the main sweep"). The two Limitations headings were merged into Section VII-D. A "Code and Data Availability" section was added. The repository URL is withheld in the anonymized copy.

## Limitations that remain

We would rather state these than leave them to be found:

- The A2A+PEP arm and the GCP arm are written by the same authors in the same codebase.
- Only the instructed-model adversary is evaluated; stolen credentials, malicious node owners and collusion are declared but not tested.
- The integration-effort measure is a configuration-surface proxy and not a study with developers.
- The explanation of the gemini-2.5-flash-lite gap is shown for one model; which feature of the wording matters is not isolated.
- Significance tests are exact but not corrected for multiplicity; only the large gaps would survive correction.
