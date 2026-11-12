# Wound Up — Blueprint Sharing Specification

**Project:** Wound Up
**Label:** Split by section. Section 2 records the G0 gift, which is G0-required and stays exactly as specified: one finished machine per link, untrusted input, no backend. Sharing beyond that, sections 3 to 9, is G4 Community, and needs G3 for user-made blueprints. Read the scope firewall in [DECISIONS.md](DECISIONS.md) ADR-028 first.
**Status:** Section 2 summarises approved specifications. Sections 3 to 9 are proposals, not approved and not scheduled. Accounts, cloud saves and any hosted service are owner decisions (section 11).
**Date:** 2026-11-06
**Source:** [directive](directives/2026-11-05_PRODUCTION_DIRECTIVE.md) Part 2 (pillar D), Part 10 (Generation 4), Part 11; PRODUCT_SPEC §13; GAMEPLAY_SYSTEMS §16; TECHNICAL_ARCHITECTURE §17; SAVE_PERSISTENCE_SPEC §13; DATA_AND_BLUEPRINT_SPEC §15, §16; ACCEPTANCE_TESTS §13; ADR-010, ADR-011, ADR-013; IDEAS §4.5
**Related:** [CREATIVE_SANDBOX_SPEC.md](CREATIVE_SANDBOX_SPEC.md), [WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md), [CROSS_WORLD_GAMEPLAY.md](CROSS_WORLD_GAMEPLAY.md), [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md), [WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md), [SAVE_PERSISTENCE_SPEC.md](SAVE_PERSISTENCE_SPEC.md), [DATA_AND_BLUEPRINT_SPEC.md](DATA_AND_BLUEPRINT_SPEC.md), [APP_AND_WEBSITE_GUIDELINES.md](APP_AND_WEBSITE_GUIDELINES.md), [IDEAS.md](IDEAS.md)

## 1. What the competition build needs from this document

Nothing new. The G0 gift is built as PRODUCT_SPEC §13, GAMEPLAY_SYSTEMS §16 and TECHNICAL_ARCHITECTURE §17 say. This document does not change a rule, a limit or a screen of it.

The one constraint is already in DATA_AND_BLUEPRINT_SPEC §16: the gift payload carries an explicit version, and the viewer rejects a version it does not know instead of reinterpreting it. Everything below must arrive as a new payload version, never as a different meaning of version 1. The final payload schema is still deferred until before gift implementation (DECISIONS §5).

A second point is a lead decision for that schema, not a change made here. [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md) §7 recommends that the G0 payload also name the blueprint `version` next to the blueprint id, which DATA_AND_BLUEPRINT_SPEC §16 allows "where compatibility requires it". It costs a few characters against the 1500-character target and is the only way an old link can be told from a changed blueprint. Adding it later would break every link already shared.

G0 must not add: whole-town gifting, accounts, cloud save, leaderboards, a gallery, or any server request (CLAUDE.md §14; ADR-013).

## 2. G0 baseline (specified, unchanged)

| Rule | Value | Source |
|---|---|---|
| What is shared | One finished machine plus one of eight preset engravings | PRODUCT_SPEC §13; GAMEPLAY_SYSTEMS §16.2 |
| Engravings | For you, Happy birthday, Thinking of you, Thank you, With love, Congratulations, Made this for you, Wind me up. No keyboard, no free text | PRODUCT_SPEC §13 |
| Availability | After Letter 2 (what "after" means is an open G0 question, [STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md) section 3.3) | PRODUCT_SPEC §13 |
| Encoding | JSON, `CompressionStream('deflate-raw')`, base64url, in the URL hash as `#g=<data>` | PRODUCT_SPEC §13; TECHNICAL_ARCHITECTURE §17; ADR-011 |
| Length | Target under 1500 characters | PRODUCT_SPEC §13; ACCEPTANCE_TESTS §13 |
| Sharing path | `navigator.share`, then the clipboard, then a visible URL | PRODUCT_SPEC §13 |
| Viewer checks | Rejects unknown blueprints, unknown parts, invalid configurations, failed solver results and malformed data, and shows an error card | PRODUCT_SPEC §13; DATA_AND_BLUEPRINT_SPEC §15 |
| Viewer behaviour | Works in ordinary browsers, re-runs the solver, never loads or writes the recipient's save, never adds the machine to the recipient's town, offers Make Your Own | TECHNICAL_ARCHITECTURE §17; SAVE_PERSISTENCE_SPEC §13; GAMEPLAY_SYSTEMS §16.4 |
| Backend | None. The hash fragment is not sent to the host in an HTTP request, so the link works on a static site | ADR-011, ADR-013 |
| Trust | Gift content is untrusted input; no unsafe deserialisation | CLAUDE.md §16 |

Acceptance for all of this is ACCEPTANCE_TESTS §13. Headset inspection of a gift needs hardware and stays Blocked until a tester exists.

## 3. Sharing tiers and labels

| Tier | What is shared | Transport | Label | Needs |
|---|---|---|---|---|
| 0 | One finished curated machine and an engraving | URL hash | G0-required | Nothing |
| 1 | One invention (a user blueprint) | URL hash, new payload version | G4, after G3 | [CREATIVE_SANDBOX_SPEC.md](CREATIVE_SANDBOX_SPEC.md) |
| 2 | A challenge or a solution | URL hash | G4 | Tier 1 |
| 3 | Curated gallery entries | Static files shipped with the app | G4, owner decision | Tier 1 and a curation process |
| 4 | Accounts, cloud saves, user-submitted gallery, leaderboards | A hosted service | G4 optional, owner decision, needs a new ADR | A backend |

## 4. The untrusted-input pipeline (proposal for payload versions 2 and later)

Every incoming payload is untrusted, whatever tier it belongs to (CLAUDE.md §16; DATA_AND_BLUEPRINT_SPEC §15: "Never trust URL data"). The viewer works in this order, cheapest check first, and any failure shows the error card and loads nothing:

1. **Length.** Reject a hash over a fixed cap before decoding anything.
2. **Alphabet.** Reject a payload that is not valid base64url.
3. **Inflate with an output cap.** Stream the decompression and abort the moment the output passes the cap, so a small payload cannot expand into a large one. The G0 pipeline uses `CompressionStream('deflate-raw')`; its counterpart is `DecompressionStream`. Its availability in Quest Browser is unverified and is covered by the gift tests.
4. **Parse.** `JSON.parse` of the capped text. Copy known fields into fresh plain objects; never merge parsed data into an existing object.
5. **Version and kind.** An unknown version or kind is an error (DATA_AND_BLUEPRINT_SPEC §16).
6. **Schema.** An allow-list of fields, types and ranges. Unknown fields are rejected, not ignored.
7. **Catalogue.** Every blueprint id, part id and attachment id exists in the shipped catalogue (PRODUCT_SPEC §13).
8. **Rebuild and solve.** Connections are rebuilt from the placements and the solver runs with node and iteration caps (MECHANICAL_SOLVER_SPEC §18). The payload carries no claimed result; the viewer computes it.
9. **Present.** Text on screen comes only from authored tables such as the engraving list, never from the payload, and never reaches the page as HTML.

A payload contains no URL, no asset path, no script and no personal data (CLAUDE.md §16; SAVE_PERSISTENCE_SPEC §16). Opening a link makes no network request beyond loading the app itself (ADR-025). Payloads are not secret and are not signed: with no server there is no key to hold, and a tampered payload is harmless because it is revalidated.

## 5. Invention links (G4 proposal, needs G3)

- One invention per link. The payload is a new version of the same transport, `#g=` or a sibling key, with the invention data of [CREATIVE_SANDBOX_SPEC.md](CREATIVE_SANDBOX_SPEC.md) section 5.
- The 1500-character target belongs to the G0 gift. Real inventions will be larger. Limits in the apps people paste links into are unverified, so the invention size cap is set after testing real sharing paths. Until then no number is fixed (Research).
- Compactness: start with plain part ids and let the compression handle repetition. Move to an id table only if measured sizes need it; ids themselves never change (ADR-033).
- The viewer is read-only like the G0 viewer. An explicit "Add to my workshop" action copies the invention into the player's saved inventions through the save service, after validating it again (SAVE_PERSISTENCE_SPEC §2, §13).

## 6. Challenges (G4 proposal)

A challenge is a target plus constraints: a `MachineTargets` object in the shape of DATA_AND_BLUEPRINT_SPEC §8, a list of allowed part ids, and a budget. Its title and goal text come from an authored table, not free text.

Because the solver is deterministic and pure (ADR-008), any client can check a claimed solution by running it. No server is needed to decide whether a solution works. A solved challenge is a local flag in the player's save. There is no authority, so there is no ranking: leaderboards are excluded from G0 (CLAUDE.md §14) and would need a server and a trust model, which is an owner decision (section 11).

## 7. Gallery (G4 proposal)

The no-backend option is a curated static gallery:

1. Someone sends an invention link through a channel the owner chooses.
2. The owner or a curator adds the entry to a folder in the repository.
3. CI runs the same validator on every entry, so a broken entry cannot ship.
4. The build serves the entries as static files and shows them in the same read-only viewer.

This keeps hosting static (ADR-022; CLAUDE.md §6.9), costs no service, and needs no moderation tooling. It does not scale to large volumes and needs a person to curate. A user-submitted gallery, search or likes need a hosted service (section 8).

## 8. Accounts, cloud saves and services (G4, owner decisions)

Nothing here is decided. The default is no accounts, no cloud save and no service. ADR-013 and REJ-002 stay in force until a new ADR replaces them for a named feature (directive Part 11: do not introduce a backend "unless a real future requirement justifies it").

| Option | What it would add | What it would need |
|---|---|---|
| A. None (default) | Link sharing and a static curated gallery only | Nothing |
| B. Hosted third-party backend | Cross-device saves, a user-submitted gallery | Explicit owner approval for any paid service (CLAUDE.md §15); a privacy and terms review; moderation of shared content; an ADR superseding ADR-013 for that feature |
| C. Own backend | Same as B, under the project's control | Everything in B plus hosting and operations. Vercel stays static-only (CLAUDE.md §6.9) |

Whatever is chosen is optional. The basic loop must work with no network service (directive Part 11), and the game must stay fully functional without an external backend (CLAUDE.md §16). Supabase, Render and similar are not introduced without a real requirement (directive Part 11; CLAUDE.md §6.9).

## 9. Not designed here

- Whole-town gifting: excluded from G0 (CLAUDE.md §14). No G4 design exists.
- Multi-machine gifts, custom message cards, gift history: IDEAS §4.5 (Proposed). The G0 gift remains one machine per link.
- Real-time cooperative building: a G5 item in directive Part 10 that needs a network service. See [CROSS_WORLD_GAMEPLAY.md](CROSS_WORLD_GAMEPLAY.md) section 8.
- Gifts that cross worlds: machine, part and letter ids are unique across the universe, so a payload needs no world field ([WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md) §7). The viewer rejects a blueprint it does not know (PRODUCT_SPEC §13) and loads only the assets one machine needs, not the town (WORLD_REGISTRY_AND_LOADING §3). The progression side is in [WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md) section 8.

## 10. Dependencies

| Needs | Status |
|---|---|
| G0 gift built, tested and deployed | G0, not started in code |
| Final payload schema with a version field | Deferred to before gift implementation (DECISIONS §5) |
| G3 invention data | [CREATIVE_SANDBOX_SPEC.md](CREATIVE_SANDBOX_SPEC.md) |
| `DecompressionStream` in Quest Browser | Unverified |
| A tester with a Quest for headset checks | Blocked ([PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) decision 2) |

## 11. Owner decisions pending

1. Whether G4 is wanted, and when. Default: not before the competition build is delivered and stable.
2. Accounts, cloud saves, user-submitted gallery: option A, B or C in section 8. Default: A.
3. Leaderboards or any ranking. Default: none.
4. A static curated gallery (section 7). Default: proposed but not approved.
5. The G0 points that touch gifting: the payload schema (before gift implementation), whether it names the blueprint version (section 1), and the Letter 2 gating.

## 12. Acceptance criteria

Document checks:

1. Section 2 changes no G0 gift rule and cites a specification for each row.
2. No section calls accounts, a gallery or ranking a competition requirement.
3. Every service or account point is marked as an owner decision.

Feature checks for G4 (proposal; added to ACCEPTANCE_TESTS.md only when G4 is scheduled). The G0 gift tests in ACCEPTANCE_TESTS §13 keep their own status. Nothing here is verified at any level.

| ID | Check | Level |
|---|---|---|
| SHR-01 | An oversize hash is rejected before any decoding | Desktop |
| SHR-02 | A decompression bomb stops at the output cap and memory stays bounded | Desktop |
| SHR-03 | An unknown version or kind shows the error card and loads nothing | Desktop |
| SHR-04 | An unknown blueprint, part or attachment id is rejected | Desktop |
| SHR-05 | Keys such as `__proto__` and `constructor` do not change any object (`({}).polluted` stays undefined) | Desktop |
| SHR-06 | An unknown extra field is rejected | Desktop |
| SHR-07 | A graph over the node or iteration cap stops with an error | Desktop |
| SHR-08 | Opening a link makes no request outside the app's origin and writes nothing to localStorage | Desktop (Playwright) |
| SHR-09 | On-screen text comes only from authored tables; a payload string never appears as markup | Desktop |
| SHR-10 | A challenge solution gives the same solver result on every client | Desktop |
| SHR-11 | CI fails if any gallery entry fails the validator | Desktop |
| SHR-12 | The G0 gift still works unchanged (ACCEPTANCE_TESTS §13) | Desktop, IWER |
| SHR-13 | A link made before a blueprint change shows the machine it was made from, or an error card, never a different machine (MECHANICAL_ENGINE_V2 rule C9) | Desktop |
