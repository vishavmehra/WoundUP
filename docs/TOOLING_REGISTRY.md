

# Wound Up — Tooling and Agent Registry

**Project:** Wound Up  
**Status:** Audit registry — verification required  
**Purpose:** Track development tools, MCP servers, skills, agents, and external services that may support the project.

---

## 1. Purpose

This document defines the tooling ecosystem for Wound Up.

The project may use AI coding agents, specialised skills, MCP servers, design tools, browser automation, documentation tools, and asset creation software.

However, installing every available tool is not the objective.

The objective is to select a small, reliable set of tools that improves:

- Development speed.
- Code quality.
- Context management.
- Parallel implementation.
- Testing.
- Debugging.
- 3D asset quality.
- Documentation.
- Release reliability.

Every tool must be evaluated before adoption.

## 2. Important Rule: Verify Before Use

The tools listed in this document are candidates supplied for investigation.

Their presence in this registry does not mean they are:

- Installed.
- Available.
- Compatible.
- Free.
- Safe.
- Maintained.
- Necessary.

The tooling audit agent must verify the actual state of each tool.

Never report a tool as installed or working without checking it.

## 3. Tool Status

Use these statuses:

| Status | Meaning |
|---|---|
| Not checked | No investigation performed |
| Available | Tool or repository is accessible |
| Installed | Tool is installed in the intended environment |
| Verified | Tool was tested successfully |
| Approved | Selected for project use |
| Rejected | Not suitable for the project |
| Deferred | Potentially useful later |
| Blocked | Cannot be used due to an unresolved issue |

## 4. Evaluation Criteria

Evaluate each candidate using:

1. **Purpose:** What problem does it solve?
2. **Compatibility:** Does it work with Claude Code and the project stack?
3. **Maintenance:** Is it actively maintained?
4. **Security:** Does it require risky permissions?
5. **Licensing:** Are its licence terms acceptable?
6. **Cost:** Does it require payment or usage credits?
7. **Performance:** Does it consume significant system resources?
8. **Overlap:** Does another tool already provide the same capability?
9. **Integration:** Can it be used without major setup?
10. **Value:** Does it materially improve Wound Up?

Do not adopt a tool simply because it is popular.

## 5. Core Development Tools

| Tool | Intended purpose | Priority | Initial recommendation |
|---|---|---|---|
| Claude Code | Main coding agent | Critical | Use |
| Git | Version control | Critical | Use |
| GitHub | Repository and collaboration | Critical | Use |
| Node.js | Runtime and tooling | Critical | Use |
| TypeScript | Application implementation | Critical | Use |
| IWSDK | WebXR framework | Critical | Use |
| Three.js | 3D rendering | Critical | Use |
| Blender | Hero 3D modelling and asset production | Critical | Use |
| Vitest | Unit testing | High | Use |
| Playwright | Browser automation | High | Use |
| Context7 | Current library documentation | High | Evaluate |
| Chrome DevTools MCP | Browser debugging | High | Evaluate |

The project must verify exact versions and APIs before implementation.

## 6. Coding and Agent Skills

### 6.1 Caveman

**Purpose:** Potentially simplify agent instructions and reduce unnecessary token usage.

**Recommendation:** Evaluate.

Do not sacrifice implementation clarity or technical precision for shorter prompts.

### 6.2 PonyTail

**Purpose:** Candidate agent or development workflow tool.

**Recommendation:** Inspect actual capabilities, maintenance, and integration before deciding.

### 6.3 Impeccable

**Purpose:** UI and visual design improvement.

**Recommendation:** Evaluate for UI polish.

Use it to improve the existing visual direction rather than replacing the established Tockton art style.

### 6.4 Taste

**Purpose:** Candidate design and frontend quality skill.

**Recommendation:** Evaluate for overlap with Impeccable and existing UI workflow.

### 6.5 Emil Kowalski Skill

**Purpose:** Animation and interaction design guidance.

**Recommendation:** Evaluate for subtle interface animations and transitions.

Do not introduce unnecessary UI animation into spatial gameplay.

### 6.6 Superpowers

**Purpose:** Structured software development workflows.

**Recommendation:** Evaluate.

Use only workflows that improve planning, implementation, testing, or review.

### 6.7 Andrej Karpathy Skills

**Purpose:** Candidate programming and AI development guidance.

**Recommendation:** Inspect individual skills and retain only relevant ones.

### 6.8 sickn33/agentic-awesome-skills

**Purpose:** Collection of agentic development skills.

**Recommendation:** Audit individual skills rather than installing the entire collection blindly.

### 6.9 alirezarezvani/claude-skills

**Purpose:** Collection of Claude development and productivity skills.

**Recommendation:** Inspect overlap, licence, and project relevance.

### 6.10 shanraisshan/claude-code-best-practice

**Purpose:** Claude Code workflow and best-practice guidance.

**Recommendation:** Evaluate for agent organisation, context management, and project instructions.

Avoid duplicating equivalent instructions across multiple skill systems.

## 7. Planning and Project Management Tools

| Tool | Intended purpose | Recommendation |
|---|---|---|
| OthmanAdi planning-with-files | File-based planning | Evaluate |
| Task Observer | Task progress visibility | Evaluate |
| Gstack | Development workflow support | Evaluate |
| Beads | Task and dependency tracking | Evaluate |
| Hallmark | Candidate project workflow tool | Inspect |
| RTK | Candidate developer productivity tool | Inspect |
| CCUsage | Claude usage monitoring | Evaluate |
| Claude HUD | Claude Code status visibility | Evaluate |
| Claude Code Setup | Environment setup assistance | Evaluate |

The project already has detailed documentation.

Do not introduce a second planning system unless it provides a clear benefit.

## 8. Codebase Understanding and Memory

### 8.1 Graphify

**Purpose:** Codebase relationship and graph exploration.

**Recommendation:** Evaluate after the repository contains enough implementation to analyse.

### 8.2 Codegraph

**Purpose:** Code relationship visualisation.

**Recommendation:** Compare with Graphify.

Select one if they overlap.

### 8.3 Understand Anything

**Purpose:** Codebase understanding and navigation.

**Recommendation:** Evaluate for agent onboarding.

### 8.4 Archify

**Purpose:** Architecture understanding and documentation.

**Recommendation:** Evaluate for architecture review.

### 8.5 Company Brain

**Purpose:** Knowledge organisation.

**Recommendation:** Likely unnecessary unless it provides a simple local workflow.

### 8.6 Claude-mem

**Purpose:** Persistent agent memory.

**Recommendation:** Evaluate carefully.

Project documentation should remain the authoritative source of truth.

### 8.7 Mem0

**Purpose:** Memory infrastructure.

**Recommendation:** Not required for the shipped application. Evaluate only if it materially helps development.

### 8.8 mempalace

**Purpose:** Candidate memory and context management.

**Recommendation:** Compare with Claude-mem and existing documentation.

### 8.9 Cognee

**Purpose:** Knowledge graph and memory infrastructure.

**Recommendation:** Not required for the shipped game. Avoid adding unnecessary infrastructure.

### 8.10 Agent Memory

**Purpose:** Persistent agent context.

**Recommendation:** Inspect implementation and overlap.

### 8.11 Codebase Memory MCP

**Purpose:** Repository context and code relationship retrieval.

**Recommendation:** Evaluate once the codebase becomes substantial.

Do not let an external memory system override the current source code or approved specifications.

## 9. Research and Knowledge Tools

| Tool | Intended purpose | Recommendation |
|---|---|---|
| Scroll World | Research or content exploration | Inspect |
| Open Research | Research support | Inspect |
| Haystack | Retrieval and search infrastructure | Not required for gameplay |
| Unlimited OCR | Text extraction | Optional |
| Prompt Master | Prompt development | Optional |
| Anatomy | Asset or technical reference support | Inspect exact product |
| Diagram Design | Diagram creation | Evaluate |
| Draw.io | Architecture and flow diagrams | Optional |

Wound Up does not require a retrieval-augmented generation system, vector database, or LLM inference service.

Do not add these systems to the game merely because they are available.

## 10. Design and Asset Tools

### 10.1 Blender

**Status target:** Required and approved.

Blender is the primary tool for major hero assets.

Use it for:

- Trunk.
- Town buildings.
- Bakery.
- Windmill.
- Music Box casing.
- Carousel.
- Clock Tower.
- Theatre facade.
- Gift packaging.
- Character figures.

Maintain source `.blend` files.

Export optimised GLB/glTF assets for the application.

### 10.2 Figma MCP

**Purpose:** Design exploration and editable UI/design artefacts.

**Recommendation:** Evaluate.

Use it for UI layouts or design systems where it materially improves the result.

Do not make Figma a required runtime dependency.

### 10.3 GSAP Skills

**Purpose:** Animation workflow guidance.

**Recommendation:** Inspect.

Do not introduce GSAP automatically. Use the simplest animation approach compatible with IWSDK and Three.js.

### 10.4 Artlist MCP

**Purpose:** Music and sound asset workflow.

**Recommendation:** Evaluate licensing, pricing, export rights, and competition usage restrictions.

No copyrighted or unlicensed audio should be included.

### 10.5 Image and Model Generation Tools

Any generated asset must be reviewed for:

- Visual quality.
- Geometry.
- UVs.
- Materials.
- Polygon count.
- Scale.
- Pivots.
- Licence and usage rights.
- Compatibility with the art direction.

Do not ship raw, unoptimised generated assets.

## 11. Browser Testing and Debugging

### 11.1 Playwright

**Purpose:** Browser end-to-end testing.

**Recommendation:** Approved candidate.

Use it for:

- Landing page.
- Desktop fallback.
- Progression.
- Save/load.
- Gift viewer.
- Production smoke tests.

It does not replace headset testing.

### 11.2 Chrome DevTools MCP

**Purpose:** Browser debugging.

**Recommendation:** Evaluate.

Use for:

- Console errors.
- Network failures.
- Asset loading.
- Performance inspection.
- Runtime debugging.

### 11.3 Context7

**Purpose:** Current documentation retrieval.

**Recommendation:** Approved candidate.

Use it to verify current APIs for:

- IWSDK.
- Three.js.
- TypeScript.
- WebXR.
- Browser APIs.
- Relevant libraries.

Documentation retrieval must not replace checking the actual installed package version.

### 11.4 Sentry MCP

**Purpose:** Error monitoring.

**Recommendation:** Not required by default.

The competition product intentionally avoids analytics and telemetry.

Do not introduce external error reporting without explicit approval and a privacy review.

## 12. Infrastructure and External Services

| Tool | Intended purpose | Initial decision |
|---|---|---|
| Supabase MCP | Database/backend integration | Not required |
| Vercel MCP | Deployment integration | Deployment integration for the chosen host (Vercel, owner decision 2026-11-05) |
| Cloudflare Security Skill | Security review | Evaluate |
| n8n | Workflow automation | Not required |
| OmniRoute | Model or API routing | Not required |
| DeerFlow | Agent workflow infrastructure | Not required |
| Oh My Open Agent | Agent framework/workflow | Inspect |
| Headroom | Context or performance optimisation | Inspect |
| Open Knowledge | Knowledge infrastructure | Inspect |
| Strix | Security tooling | Evaluate only if relevant |

The shipped game must not depend on these services.

Do not create a backend, database, API gateway, or model-routing service unless the approved product requirements change.

## 13. Additional Tools and Repositories

The following require identification and verification before adoption:

- Claude Code Setup.
- Task Observer.
- Gstack.
- Hallmark.
- RTK.
- PonyTail.
- Scroll World.
- Anatomy.
- Founder skills.
- sickn33 agentic-awesome-skills.
- alirezarezvani claude-skills.
- shanraisshan claude-code-best-practice.
- OthmanAdi planning-with-files.
- Understand Anything.
- Archify.
- Codegraph.
- Agent Memory.
- Company Brain.
- Open Research.
- Diagram Design.
- DeerFlow.
- Oh My Open Agent.

For each, record the exact repository or product URL before evaluating it.

Do not assume a tool name uniquely identifies a particular project.

## 14. Security and Permission Review

Before installing an MCP server, skill, or agent:

1. Identify the source repository.
2. Inspect its README and installation instructions.
3. Inspect scripts and executable files.
4. Check requested permissions.
5. Check network access.
6. Check filesystem access.
7. Check environment variable access.
8. Check licence.
9. Check maintenance activity.
10. Check whether it modifies project files automatically.

Never expose:

- API keys.
- Access tokens.
- Private SSH keys.
- Personal credentials.
- Local environment secrets.

Avoid running untrusted installation scripts without inspecting them.

## 15. Cost Policy

The project should prioritise:

- Existing subscriptions.
- Free tools.
- Open-source tools.
- Local development.
- Existing hardware.

No paid service, API, subscription, or usage credit should be activated without explicit approval.

Record any cost before adoption.

## 16. Recommended Initial Tool Stack

The initial recommended stack is deliberately small.

| Area | Recommended tool |
|---|---|
| Main coding agent | Claude Code |
| Version control | Git |
| Repository | GitHub |
| Runtime | Node.js |
| Language | TypeScript |
| WebXR framework | IWSDK |
| 3D engine | Three.js |
| Hero modelling | Blender |
| Unit tests | Vitest |
| Browser tests | Playwright |
| Documentation lookup | Context7 |
| Browser debugging | Chrome DevTools |
| Design diagrams | Draw.io or Figma, if useful |

Other tools should be added only when a specific project requirement justifies them.

## 17. Tool Audit Table

Maintain this table as the audit progresses.

**Audit of 2026-11-05 (M0).** "Verified" means the tool was run or called successfully in this project; "Installed" means it is present in the environment but was not exercised; "Not checked" means nobody looked.

| Tool | Available | Installed | Verified | Cost checked | Decision |
|---|---|---|---|---|---|
| Claude Code (VS Code extension) | Yes | Yes | Yes (running this build) | Plan usage | In use |
| Node 24.18.1 / npm 11.16 / git 2.55 | Yes | Yes | Yes | Free | In use (engines range allows Node >=24) |
| GitHub CLI `gh` | Yes | Yes (two accounts on this machine) | Yes: this repository pushes as `vishavmehra` through a repo-local credential helper, so the machine-wide active account is untouched. That token lacks the `workflow` scope until the owner runs `gh auth refresh -h github.com -u vishavmehra -s workflow` | Free | In use (owner approved pushing on 2026-11-05) |
| IWSDK 1.1.0-rc.2 (`@iwsdk/core`, `cli`, `vite-plugin-dev`) | Yes (npm) | Yes (project dependency) | Yes: scaffolder, typings, clean install, headless dev runtime, emulated Quest 3 AR session, emulated hand grab/release, screenshots, console log | Free (MIT) | In use, pinned (ADR-016) |
| Blender 5.2.1 LTS | Yes | Yes (`C:\Program Files\Blender Foundation\Blender 5.2`) | Yes, headless CLI: glTF export and Cycles devices (OPTIX, CUDA, CPU) probed, draft GLBs exported and loaded in the runtime | Free (GPL) | Primary asset tool. Blender MCP server is registered but its add-on is not running (connection refused on localhost:9876), so work uses the CLI (`blender --background --python`) |
| Vitest 5.1.0 | Yes | Yes (devDependency) | Yes: 10 unit tests pass | Free | In use |
| ESLint 10 + typescript-eslint 8 | Yes | Yes (devDependency) | Yes: `npm run lint` passes | Free | In use (ADR-018) |
| Playwright `@playwright/test` ^1.64.1 | Yes | Yes (devDependency); Chromium builds 1234 and 1248 cached | Yes: 3 browser tests pass against the production build served under `/wound-up/` | Free | Adopted for browser journeys |
| Playwright MCP / Chrome DevTools MCP | Yes | Yes (two Chrome DevTools registrations: its own plugin and ECC) | Not exercised (the IWSDK CLI and Playwright scripts covered the needs) | Free | Use for network/performance checks when needed |
| Impeccable 4.1.1 (skill) | Yes | Yes | Yes: `context.mjs` ran; used for the landing page | Free (Apache-2.0) | In use for UI work |
| Emil Kowalski design skill, Taste (`design-taste-frontend`), frontend-design, Superpowers, Caveman, PonyTail, Karpathy guidelines, planning-with-files, Prompt Master, Task Observer, Gstack, ECC, Graphify, Archify, Diagram Design, Hallmark, Scroll World, Anatomy, GSAP skills, agentic-awesome-skills, alirezarezvani skills | Yes | Yes (listed by the harness) | Not exercised, except Caveman, PonyTail and Superpowers which load through session hooks | Free | Use one at a time when a task needs it; do not stack overlapping workflow skills |
| claude-mem | Yes | Yes | Yes: `work_state_write` used as the task ledger | Free tier (a paid tier is advertised) | In use |
| Codegraph MCP | Yes | Yes (server) | No: the project has no `.codegraph/` index, so it was skipped | Free | Idle until the owner runs `codegraph init` |
| Codebase Memory MCP, Agent Memory MCP | Yes | Yes (servers connected) | Not exercised | Free | Idle |
| Vercel MCP and Vercel CLI 65 | Yes | Yes (CLI through `npx`, logged in as `vishavmehra`) | Yes: both reach team `vishav-mehras-projects`; project `wound-up` created through the MCP, deployed through the CLI. The MCP cannot upload a build practically (files travel as base64 through the conversation) | Free tier (Hobby) | Chosen host (ADR-022) |
| GitHub MCP, Draw.io MCP, PDF viewer | Yes | Yes | Not exercised | Free | Idle |
| RTK 0.45.0 | Yes | Yes (WinGet), active through a Claude Code hook | Yes: Bash commands in this environment run as `rtk <command>`, which compresses output (and buffers it, so interactive CLIs such as `vercel login` must run in a real terminal window) | Free | In use |
| ccusage, Headroom | Yes | Yes (npm global, pip) | Not exercised; compatibility with this Claude Code setup is not verified | Free | Not used yet; the "verify compatibility" rule in CLAUDE.md §6.4 still applies |
| Context7, Figma MCP, Sentry MCP, Supabase MCP, Render MCP, Artlist MCP | Registered | n/a | No: each requires OAuth that this session cannot perform | Account-dependent | Not needed for M0. Use iwsdk.dev, the installed typings and the generated starter docs instead of Context7. Artlist assets need a licence check before use |
| `@meta-quest/metavr`, `@iwsdk/reference`, IWSDK-generated agent skills and MCP settings | Yes (starter output) | No, excluded on purpose | n/a | Telemetry / heavy download / needs owner approval | Rejected for now (ADR-018) |
| Mem0, Cognee, MemPalace, Beads, Understand Anything, Company Brain, Open Knowledge, OmniRoute, DeerFlow, Unlimited OCR, OpenResearch, Haystack, n8n, Strix CLI | Not checked | Not checked | Not checked | Not checked | Pending; none is required for M0 |

Update this table only with verified information.

## 18. Tool Adoption Procedure

For each candidate:

1. Discover its exact identity.
2. Read its documentation.
3. Inspect its repository.
4. Check maintenance and licence.
5. Review permissions.
6. Check cost.
7. Compare against existing tools.
8. Test in isolation.
9. Record the outcome.
10. Approve or reject.

Avoid installing multiple overlapping tools at the same time.

## 19. Tooling Audit Deliverable

The tooling audit agent must produce:

- Exact tool identity and URL.
- Purpose.
- Availability.
- Installation status.
- Compatibility.
- Version.
- Licence.
- Cost.
- Security concerns.
- Overlap with other tools.
- Recommended use.
- Final decision.

The result must be based on actual inspection, not assumptions.

## 20. Final Rule

The tool ecosystem exists to accelerate the creation of Wound Up.

It must not become a separate project.

Prefer a small number of reliable tools over a large collection of partially configured agents and MCP servers.

The application, documentation, tests, and actual source code remain the authoritative project assets.

