# M6 — Formal Model + No-Leak Property — Design Spec

> Path B support: a small formal model of role-gated read-first context federation, plus an executable no-leak property. Gives the empirical result (Path A) formal backing and answers "can a principal ever read beyond policy?" with evidence, not assertion.

- **Date:** 2026-06-04
- **Status:** Draft for review
- **Parent:** `2026-06-04-gcp-research-migration-design.md` (milestone M6)
- **Thesis-critical:** NO (supporting; strengthens rigor)
- **Depends on:** M1 (the access model must be stable)

## 1. Goal

A documented formal model (nodes, roles, capabilities, access policy, query, federation) and an executable property test demonstrating **no-leak**: under any policy and any principal, a query never returns context the policy does not permit.

## 2. Current State (relevant slice)

- No formal model and no property-based tests exist. The access model lives in code: `AccessPolicyDescriptor` + `authorizeKnowledgeNodeAccess` (default-deny on missing policy; `readableByRoles` + `requiredCapabilities` enforcement), with M1 adding structured provenance and `parentRole` inheritance.
- Existing tests are example-based unit tests (vitest), not randomized properties.

## 3. Scope

**In:**
- A concise **formal model document** (in `context/` or `docs/`): the state (graphs, nodes, roles with inheritance, capabilities, policies), the query operation, the authorization predicate, and the federation composition — enough to state the no-leak theorem precisely.
- An **executable no-leak property** (property-based testing, e.g. fast-check): generate random graphs/policies/principals/queries; assert that any `ok` response targets a node whose policy admits the principal, and any policy-excluded node yields `denied`/`empty-result` (per `denialMode`), never content.
- A property for **role inheritance soundness** (effective capabilities never exceed the union of the chain).

**Out:**
- A fully mechanized proof (Coq/TLA+/Lean) unless a target venue demands it (= parent §11 Q5).
- Modeling delegation (M2) unless delegation is in the paper.

## 4. Design

- The property test exercises the **real** core+server authorization path (not a re-implementation), so the property validates shipped code.
- Generators cover: empty policy (default-deny), role-only, capability-only, both, multi-level `parentRole`, and federated multi-peer resolution (a principal authorized at one node, not another).
- The model document maps each formal element to its code symbol so reviewers can trace model ↔ implementation.

## 5. Work Breakdown

1. Write the formal model document; state the no-leak property precisely.
2. Add property-based generators for graphs/policies/principals/queries.
3. Implement the no-leak property against the real authorization path.
4. Implement the role-inheritance soundness property.

## 6. Acceptance Criteria

- The no-leak property passes over a large randomized input space; any counterexample is either fixed in code or documented as a known limitation.
- The role-inheritance soundness property passes.
- The model document cross-references implementation symbols and is cited from the article.

## 7. Test Plan

- Property tests run in CI (bounded iterations) with a seeded reproduction path for any failure; a heavier nightly/manual run with more iterations.

## 8. Risks

- A discovered leak counterexample is good news for the paper but may force a code fix in M1's authorization path — budget for iteration.
- Property generators that are too narrow give false confidence — review coverage of the input space.

## 9. Open Questions

- How heavy a formalism do the target venues expect — property-test-backed model vs a full mechanized proof? (= parent §11 Q5.)

## Links
- Parent roadmap: `2026-06-04-gcp-research-migration-design.md`
- Prev: M5
