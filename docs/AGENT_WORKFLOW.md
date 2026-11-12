# Wound Up — Agent Workflow

**Project:** Wound Up  
**Purpose:** Coordinate Claude Code and parallel development agents.  
**Internal completion deadline:** November 18, 2026 (IST)

## 1. Purpose

This document defines how the project should use Claude Code, subagents, skills, MCP servers, and external tools.

The goal is to increase development speed without sacrificing correctness, consistency, or token efficiency.

Parallel agents are useful only when their tasks are sufficiently independent and their file ownership is clear.

The lead agent remains responsible for architecture, integration, quality, and final decisions.

## 2. Operating principles

1. Read project documentation before making changes.
2. Inspect the existing repository before planning implementation.
3. Do not assume tools or MCP servers are installed.
4. Verify tool availability and compatibility.
5. Use parallel agents only for independent work.
6. Give every agent explicit scope and file ownership.
7. Avoid multiple agents editing the same files.
8. Require evidence before accepting completed work.
9. Run integration tests after merging agent work.
10. Keep context and token usage controlled.

## 3. Initial repository audit

Before implementation, the lead agent must:

1. Inspect repository structure.
2. Read `CLAUDE.md`.
3. Read all relevant documents in `docs/`.
4. Inspect package manifests and lockfiles.
5. Identify the actual IWSDK version.
6. Identify the current build and test commands.
7. Inspect installed MCP servers and skills.
8. Verify Blender availability and version.
9. Identify deployment configuration.
10. Record gaps between documentation and implementation.

Do not begin broad implementation while major architecture questions remain unresolved.

## 4. Tool and skill audit

The user has supplied a large list of tools, skills, MCP servers, repositories, and development utilities.

The lead agent must create and maintain `docs/TOOLING_REGISTRY.md`.

For every relevant tool, record:

- Name.
- Purpose.
- Whether installed or accessible.
- Version, where available.
- Whether it requires an account or licence.
- Whether it has a cost.
- Security or privacy implications.
- Project use case.
- Decision: Use, Optional, Defer, or Reject.
- Reason.

Do not install everything.

Do not spend days configuring infrastructure that does not improve the actual game.

Do not use paid services without approval.

Prefer existing tools and capabilities when they already solve the problem.

## 5. Suggested agent roles

These roles are logical responsibilities. Create only the agents that are useful for the current milestone.

The roster, names and folders are resolved in [AGENT_OWNERSHIP_MATRIX.md](AGENT_OWNERSHIP_MATRIX.md). The letters A to G below are role descriptions only: they map onto the Agent 0 to 4 roster of CLAUDE.md §10 and the asset production agents, and the directive's audit agents are called "audit A to F".

### Lead Agent — Architecture and Integration

Owns:

- Architecture.
- Shared interfaces.
- Repository health.
- Agent assignment.
- Integration.
- Code review.
- Release decisions.
- Documentation consistency.
- XR feature configuration and table placement (`iwsdk.config.json`, `src/placement.ts`, `src/stage.ts`).

The lead agent is the only authority for changing shared contracts.

### Agent A — IWSDK and Platform

Owns:

- IWSDK starter setup.
- Application bootstrap.
- XR lifecycle.
- Platform detection.
- Desktop fallback.
- Minimal interaction proof.

Must verify APIs against the installed IWSDK version. Table detection and anchoring stay with the Lead Agent.

### Agent B — Blender and Art Pipeline

Owns:

- Blender source files.
- Hero asset creation.
- GLB exports.
- Materials.
- Asset optimisation.
- Asset documentation.

Must follow `ART_ASSET_PIPELINE.md`.

### Agent C — Mechanical Solver

Owns:

- Pure TypeScript solver.
- Mechanical graph.
- Ratios.
- Runtime calculations.
- Validation.
- Unit tests.

Must not introduce rendering dependencies.

### Agent D — Assembly and Interaction

Owns:

- Part selection.
- Grab and release.
- Socket targeting.
- Snapping.
- Part removal.
- Interaction feedback.

Must follow `INTERACTION_SPEC.md`.

### Agent E — Town and Presentation

Owns:

- Town scene.
- Plots.
- Buildings.
- Frozen and awakened states.
- Machine presentation.
- Wake effects.

Must follow `PROJECT_BIBLE.md` and `UI_UX_SPEC.md`. Must build under the stage root and read its scale, never detect surfaces.

### Agent F — Progression and Persistence

Owns:

- Letters.
- Objectives.
- Progression.
- Save and load.
- Repair progression.
- Daily repair.
- Gift data flow where agreed.

Must follow the data contracts.

### Agent G — QA and Deployment

Owns:

- Test automation.
- Browser smoke tests.
- Build checks.
- Deployment validation.
- Acceptance test tracking.
- The final quality checklist for the judging criteria (`ACCEPTANCE_TESTS.md` §18); the Lead Agent signs it off.

Must distinguish desktop tests from hardware tests. Until Agent F or Agent G exists, the Lead Agent does its work.

## 6. File ownership

Before agents begin, define file ownership.

Example:

| Area | Owner |
|---|---|
| `src/app/` | Agent A |
| `iwsdk.config.json`, `src/placement.ts`, `src/stage.ts` | Lead Agent |
| `src/gameplay/solver/` | Agent C |
| `src/interaction/` | Agent D |
| `src/world/` | Agent E |
| `src/gameplay/progression/` | Agent F |
| `tests/` | Agent G, coordinated with subsystem owners |
| `blender/` | Agent B |
| Shared contracts | Lead Agent |

This is a starting allocation. Adjust it to the actual repository structure. Where it differs from [AGENT_OWNERSHIP_MATRIX.md](AGENT_OWNERSHIP_MATRIX.md), the matrix wins.

No agent may change shared interfaces without informing the lead agent.

## 7. Agent task format

Every task assigned to an agent must include:

1. Objective.
2. Context documents to read.
3. Exact scope.
4. Files it may edit.
5. Files it must not edit.
6. Dependencies.
7. Required tests.
8. Acceptance criteria.
9. Expected deliverables.
10. Required completion report.

Avoid vague prompts such as "build the interaction system".

Give agents a bounded, verifiable task.

## 8. Example task instruction

```text
You are Agent C, responsible for the mechanical solver.

Read:
- CLAUDE.md
- docs/TECHNICAL_ARCHITECTURE.md
- docs/DATA_AND_BLUEPRINT_SPEC.md
- docs/MECHANICAL_SOLVER_SPEC.md

Objective:
Implement the pure TypeScript mechanical solver.

Allowed ownership:
- src/gameplay/solver/
- tests/unit/solver/

Do not:
- Import Three.js or IWSDK.
- Edit shared blueprint contracts without approval.
- Modify rendering or interaction systems.
- Add unrelated dependencies.
- Change project scope.

Requirements:
- Implement the documented solver statuses.
- Implement shaft, mesh, belt, pin, and trigger behaviour.
- Implement missing-part and module-mismatch validation.
- Implement inconsistent-loop detection.
- Implement spring runtime.
- Add deterministic unit tests.

Before finishing:
- Run relevant tests.
- Run type checking.
- Report changed files.
- Report tests and results.
- List unresolved issues.
- Do not claim hardware verification.
```

## 9. Parallel execution strategy

Use parallelism when tasks have clear boundaries.

Good parallel tasks:

- Solver implementation and Blender asset creation.
- Documentation review and independent test planning.
- Asset pipeline and browser test setup.
- Separate machine asset creation after shared conventions are established.

Poor parallel tasks:

- Two agents modifying the same interaction controller.
- Two agents defining competing blueprint schemas.
- Multiple agents independently changing application bootstrap.
- Multiple agents changing package dependencies simultaneously.

If two tasks share an interface, define the interface first.

## 10. Integration protocol

When an agent completes a task:

1. Inspect its changes.
2. Review the diff.
3. Check ownership boundaries.
4. Run tests.
5. Run type checking.
6. Run the production build when appropriate.
7. Check for duplicated implementations.
8. Check documentation consistency.
9. Accept, request revision, or reject.
10. Update the project status.

Never merge work solely because an agent reports completion.

The checks that decide acceptance, for assets and for builds, are in [INTEGRATION_AND_RELEASE_GATES.md](INTEGRATION_AND_RELEASE_GATES.md).

## 11. Context and token efficiency

Claude Code context is a limited engineering resource.

Follow these rules:

- Read only documents relevant to the task.
- Use concise task briefs that reference source documents.
- Avoid pasting entire documentation sets into every agent prompt.
- Ask agents to inspect only the files they need.
- Use compact completion reports.
- Keep durable project decisions in documentation.
- Avoid repeatedly rediscovering the same facts.
- Do not let agents independently research already-resolved questions.
- Use repository search and targeted file reads.
- Avoid running duplicate test suites unnecessarily.

When an agent finishes, its report should be concise but verifiable.

## 12. Required completion report

Every agent must report:

```text
TASK:
STATUS:

FILES CREATED:
FILES MODIFIED:

IMPLEMENTATION SUMMARY:

TESTS RUN:
TEST RESULTS:

BUILD / TYPECHECK:
RESULT:

KNOWN LIMITATIONS:

OPEN QUESTIONS:

FOLLOW-UP REQUIRED:
```

Agents must not claim tests passed unless they actually ran them.

## 13. Tool ecosystem usage

Use the user's supplied tools strategically.

Examples of potentially useful categories:

- Codebase understanding and graph tools.
- Planning and task-management tools.
- Browser automation.
- Documentation retrieval.
- UI and visual design tools.
- Blender and 3D asset workflows.
- Git and repository review.
- Token/context monitoring.
- Security review.

The exact tools must be selected through the tooling audit.

Do not add a tool merely because it appears in the user's list.

Do not use a backend, analytics service, or external service in the shipped gameplay loop.

## 14. Escalation rules

Agents must stop and ask the lead agent when:

- A shared interface must change.
- An IWSDK API cannot be verified.
- A documented requirement appears impossible.
- A new dependency is required.
- A paid service is proposed.
- Scope must change.
- A security issue is discovered.
- A major performance risk appears.
- Two specifications conflict.

Do not silently resolve major conflicts by inventing new requirements.

## 15. Completion and handoff

A task is complete when:

- Implementation is present.
- Required tests pass.
- Type checking passes.
- Relevant build succeeds.
- Changes stay within ownership boundaries.
- Documentation is updated where necessary.
- Limitations are reported.

The lead agent then integrates the work and updates the project status.

## 16. Final principle

Parallel agents should increase throughput, not create parallel versions of the same architecture.

One shared product vision, one set of contracts, clear ownership, and a single integration authority are mandatory.

