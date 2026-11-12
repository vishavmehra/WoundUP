# Wound Up — Product Metrics and Retention

**Project:** Wound Up
**Label:** Sections 1 to 6 and 8 are **G0**: design goals and measures judged by people, with no data collected. Section 7, any collection of data about players, is **G4 Community or later, opt-in, an owner decision, and a proposal**. Read the scope firewall, [DECISIONS.md ADR-028](DECISIONS.md), and the ban on analytics and telemetry, ADR-013, first.
**Status:** Strategy and test design. Adds no gameplay requirement and no code.
**Date:** 2026-11-06
**Source:** [owner directive](directives/2026-11-05_PRODUCTION_DIRECTIVE.md) Part 4 (this document is on its list); [APP_AND_WEBSITE_GUIDELINES.md](APP_AND_WEBSITE_GUIDELINES.md) §1, §5, §8; [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md) §18; [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §8, §13, §20; [SAVE_PERSISTENCE_SPEC.md](SAVE_PERSISTENCE_SPEC.md); [UI_UX_SPEC.md](UI_UX_SPEC.md) §24
**Related:** [PRODUCT_VISION_LONG_TERM.md](PRODUCT_VISION_LONG_TERM.md), [PRODUCT_PILLARS.md](PRODUCT_PILLARS.md), [EXPANSION_ROADMAP.md](EXPANSION_ROADMAP.md), [TESTING_QA_PLAN.md](TESTING_QA_PLAN.md), [BUILD_ROADMAP.md](BUILD_ROADMAP.md)

## Dependencies

- Judging method and criteria: [APP_AND_WEBSITE_GUIDELINES.md](APP_AND_WEBSITE_GUIDELINES.md) §1, §5, §8; [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md) §18 (JUD-01 to JUD-21); [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §20.
- Features the goals describe and other documents build: the gift link (PRODUCT_SPEC §13), the daily repair (PRODUCT_SPEC §8, ADR-027, task DR-1) and the save ([SAVE_PERSISTENCE_SPEC.md](SAVE_PERSISTENCE_SPEC.md)). This document adds none of them.
- Limits: ADR-013 and ADR-025 (no backend, analytics or telemetry) and the scope firewall ADR-028.
- Dates: [BUILD_ROADMAP.md](BUILD_ROADMAP.md) tasks DR-1 and QA-1 and the code freeze of 16 November. Section 8 rows marked proposal depend on the lead scheduling them.
- People: a Quest 3 or 3S tester (BUILD_ROADMAP TP-7; [owner decision 2](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)) and first-time testers (section 9; [owner decision 6](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)).

## 1. The constraint

The competition build collects nothing about its players. Everything below follows from that.

| Excluded from G0 | Source |
|---|---|
| Analytics, telemetry, user tracking | CLAUDE.md §14 and §16; PRODUCT_SPEC §18; ADR-013; SAVE_PERSISTENCE_SPEC §5 and §16 |
| Vercel Web Analytics, Speed Insights or any other Vercel service beyond static hosting | CLAUDE.md §6.9; ADR-022 |
| Production error monitoring or telemetry (Sentry or similar) | CLAUDE.md §6.8 |
| Third-party requests from the running game, checked by the Playwright run against the production page | ADR-025 |
| Accounts, login, identity | CLAUDE.md §14 |
| XP, ranks, currency, rarity tiers, leaderboards, which would also stand in for a score | CLAUDE.md §14; PRODUCT_SPEC §18 |
| The Meta VR CLI (`@meta-quest/metavr`), a development tool that collects usage data about development use. Not installed unless the owner opts in | ADR-018; APP_AND_WEBSITE_GUIDELINES §9 |

What follows from it:

1. There is no retention rate, session count, funnel, heat map or A/B test, and there cannot be one. No part of the game, the host or a plugin reports how many players came back.
2. A **measure** in this project is a judgement made by a person from evidence a person gathers, recorded in the form ACCEPTANCE_TESTS §3 and TESTING_QA_PLAN §11 already use. This document uses no host-side figure as evidence.
3. The local save is not telemetry. It is the game's own progress, stays in the browser, and is never sent anywhere (ADR-010; SAVE_PERSISTENCE_SPEC §16). The game reads it to restore progress and to decide what to offer, such as whether today's repair is already done.

## 2. What success means, and how it is scored

Judges first check that the entry fits the theme and uses the required tools, then score four criteria at 25% each (APP_AND_WEBSITE_GUIDELINES §5; ACCEPTANCE_TESTS §18). Return and first-use quality appear in them as follows.

| Wording in the rules or awards | Judging item | What proves it |
|---|---|---|
| Innovation and Creativity: uses device capabilities "to drive repeat usage" | JUD-04, JUD-09 | Unit, Integration, Browser; Emulator for the flow |
| Experience Design: "habit-forming purpose" | JUD-09 | PROG-07, PROG-08, DAILY-01 to DAILY-05, the save and gift checklists |
| Experience Design: "clear onboarding" | JUD-08 | A first-time tester, observed (section 4.2) |
| Experience Design: "intuitive navigation", which JUD-10 reads as easy in, easy out | JUD-10 | Emulator; APP-06 needs Hardware |
| Special award Best Reason to Come Back: "something to work toward, visible growth between sessions, a loop that pulls the player back tomorrow" | JUD-09 | Sections 3 and 4 |
| Special award Best First Five Minutes: explains itself fast, no wall of text, a payoff before the headset comes off | JUD-08 | Section 4.2 |

Awards guide emphasis. They add no scope (APP_AND_WEBSITE_GUIDELINES §8).

## 3. Retention goals

These are design goals for the competition build. None has a numeric target, because nothing can be counted (section 1). A goal is met when its mechanism exists, passes its tests, and reads correctly to a person who is watching.

| ID | Goal | Mechanism in G0 | Specified in | Evidence (section 4) |
|---|---|---|---|---|
| R1 | A reason to come back tomorrow | The daily repair: offered after Letter 5, chosen from the local date, completable once per date, never required to finish the story, reusing machines, parts and faults the game already has | PRODUCT_SPEC §8; GAMEPLAY_SYSTEMS §12.3; ADR-027; SAVE_PERSISTENCE_SPEC §4.4 | DAILY-01 to DAILY-05; next-day check (4.3); JUD-09 |
| R2 | Visible growth between sessions | Town placements, letter states, machine completion, the last daily date and settings survive a reload, so a woken plot stays woken | SAVE_PERSISTENCE_SPEC §3, §6; ACCEPTANCE_TESTS §12 | PROG-08; the section 12 checklist; a reload by a person (4.3); JUD-09 |
| R3 | Something to work toward | Letters unlock in order on objectives. The frozen plots, the Bakery and the theatre facade show what is left. The closing card ends the story | GAMEPLAY_SYSTEMS §4; PRODUCT_SPEC §3.3, §7 | PROG-07; the post-play questions (4.2); JUD-09 |
| R4 | Something to give | The gift: a ribbon icon on finished machines after Letter 2, eight preset engravings, a link under about 1500 characters, and a viewer that works without the game and leads to Make Your Own | PRODUCT_SPEC §13; ACCEPTANCE_TESTS §13 | The section 13 checklist; a second person opens it (4.4); JUD-09 |
| R5 | A fast start, every time | Quick cold start, clean pause and resume, a satisfying action within one short session, and the first Music Box loop inside five minutes | APP_AND_WEBSITE_GUIDELINES §1 (one bus stop test: 10 minutes or less); COMPETITION_REQUIREMENTS §5.2; PRODUCT_SPEC §17 | JUD-08, JUD-10; APP-07; the timed playtest (4.2) |

Four points that affect how these goals are read.

- **After the story, little is left.** The story is Letters 1 to 5 and the closing card. Letter 6 exists only with the Clock Tower. Once the story is done, the reasons to return are the daily repair (R1), the gift (R4) and revisiting a woken town (R2). The Clock Tower and the day/night toggle are the first cuts and nothing replaces them. This is why the daily repair is protected (ADR-027).
- **The daily pool is undefined.** "Which repairs the daily pool contains is still for the owner to define" (ADR-027). With a pool of one, the same fault comes back every day. A review question for the next-day check is therefore whether two consecutive days offer recognisably different repairs.
- **The town may stand somewhere new.** Progress is restored onto whichever table or stand the new session finds, and the save holds no coordinates or surface data (SAVE_PERSISTENCE_SPEC §4.1; ACCEPTANCE TBL-09). Coming back to the same table is a proposal for G1 (IDEAS §4.8), not a G0 promise.
- **What a returning player sees first is not specified.** SAVE_PERSISTENCE_SPEC §8 restores progress and initialises the town. PRODUCT_SPEC §3.2 describes the trunk as the opening sequence. No document says whether the trunk opening, the ghost hands or Letter 1 replay on a return visit. R1, R2 and R5 all depend on the answer. This is a specification gap, not decided here (section 9).

## 4. How each goal is judged without data

### 4.1 Automated tests

These prove that a mechanism works. They do not prove that a person wants to use it.

- DAILY-01 to DAILY-05. Unit tests pass the local date in instead of reading the clock (ACCEPTANCE_TESTS §5.1).
- PROG-07 and PROG-08, and the save checklist in ACCEPTANCE_TESTS §12.
- The gift checklist in ACCEPTANCE_TESTS §13, including invalid payloads and a viewer that leaves the recipient's save alone.
- APP-07 and APP-08 for the deployed page, and the Playwright check that the page makes no request outside its own origin (ADR-025).

### 4.2 First-time observed playtest

Basis: "Where possible, observe a first-time tester without explaining the controls. Record where they hesitate or misunderstand" (UI_UX_SPEC §24), and JUD-08, which needs a first-time player to finish the Music Box loop within five minutes. The class is Manual (ACCEPTANCE_TESTS §2).

**Who.** A person who has not seen the game and is not on the project. More than one, because one tester shows one person's path. How many, and who, is the owner's decision (section 9). Records use "tester 1", "tester 2" and no name or contact details (CLAUDE.md §16: do not transmit user data).

**Where, labelled honestly.** Desktop preview or IWER now. A Quest when a tester with a headset exists, until then Blocked. A desktop tester cannot judge hand tracking, comfort or the effect of a real table.

**How.** The observer does not explain controls. Play stops at the end of the Music Box loop, when the town wakes, or at ten minutes, whichever comes first.

**Recorded by hand for each session:**

- The build or commit, the environment, the date and the tester's number (ACCEPTANCE_TESTS §3; TESTING_QA_PLAN §11).
- Minutes from Enter to the first woken plot.
- Pinches counted for the Music Box. The specification asks for 40 or fewer (PRODUCT_SPEC §9). No acceptance test ID covers this, so the count is recorded here.
- Where the tester hesitated, for how long, and what they tried: wrong family, wrong size, a part dropped outside the snap radius.
- Whether they found the latch, the letter, the parcel, the winding key and the plot unaided.

**Asked after play, open and neutral, and noted in the tester's own words:**

- "What was the letter asking you to do?" (R3)
- "What changed in the town when you placed the machine?" (JUD-08; UI_UX_SPEC §24)
- "What do you think is left to do?" (R3)
- "Is there anyone you would send this to?" (R4)

Answers about future intentions are weak evidence and are recorded as such.

**Outcome.** JUD-08 is Pass when a first-time tester finishes the Music Box loop within five minutes without explanation. Otherwise it is Fail with where the time went. Changes made because of a session are written next to it.

### 4.3 Next-day return check

Unit tests cover the date logic. This check covers what they cannot: the real clock, real storage, a closed browser and an overnight gap.

1. Needs Letter 5 and the daily repair (DR-1, target 13 November, BUILD_ROADMAP §10).
2. A person who has reached Letter 5 closes the game and returns on the next local day, in the same browser profile, on 14 November and again on 15 November.
3. They check: is the repair offered; can it be completed once; is it not offered again that day, including after a reload; is it offered again the next day; does the story stay untouched (DAILY-05); did the woken plots survive the night (R2); are two consecutive days' repairs recognisably different.
4. Changing the system clock, or fixing the date in a browser test, is a valid test of the logic. It is not the same evidence as a real next day, and is recorded as what it is.
5. If DR-1 slips, the check moves with it. If it cannot happen before the code freeze on 16 November, it is recorded Not Run with that reason and the unit tests stand alone.

### 4.4 Gift check by a second person

The gift is made on one device and opened by a different person, in a clean browser profile, on a desktop browser and on a phone (ACCEPTANCE_TESTS §13). They should see the wrapped gift, unwrap it, watch the machine run, find Make Your Own, and follow it into the main experience. The viewer must leave their own save unchanged. A malformed link must show an error card. The observer notes whether the recipient understood what they had been given and where to go next (R4). Headset inspection of a gift is Hardware and stays Blocked until a Quest exists.

### 4.5 The judging checklist

At QA-1 on 15 November the QA agent, or the lead while there is none, records a status for JUD-08, JUD-09, JUD-10 and JUD-21 using the statuses of ACCEPTANCE_TESTS §3, with the evidence from this section. A Desktop, Browser or Emulator result never passes an item that needs Hardware (ACCEPTANCE_TESTS §18).

## 5. The product success criteria, and how each is judged

PRODUCT_SPEC §20 lists fifteen criteria. None of them needs data about players.

| # | Criterion | Judged by |
|---|---|---|
| 1 | A player can enter quickly | APP-01 to APP-03; the landing Playwright tests; time to first action in 4.2 |
| 2 | Trunk and town on the player's table or the stand, with a sense of discovery | TBL-05 to TBL-12 (Emulator); TBL-13 (Hardware, Blocked); discovery by observation in 4.2 |
| 3 | The first letter is understood | The post-play question in 4.2; JUD-08 |
| 4 | The Music Box is assembled with hands | INT-01 to INT-08; the Music Box checklist in ACCEPTANCE_TESTS §8; 4.2 |
| 5 | Assembly feels precise and satisfying | Hesitations and rejected snaps in 4.2; INT-03, INT-04; the feel is a Manual and Visual judgement, and real hands need Hardware |
| 6 | Winding feels natural | WIND-01 to WIND-05; WIND-02 and WIND-03 need Hardware and are Blocked |
| 7 | The Music Box runs correctly | SOL-08, SOL-09; the Music Box checklist |
| 8 | Sound and motion are satisfying | JUD-17; ACCEPTANCE_TESTS §14 (Manual) |
| 9 | The machine is placed in the town | TOWN-01 to TOWN-05 |
| 10 | The town visibly wakes | TOWN-06, TOWN-07; "what changed" in 4.2 |
| 11 | Progress persists | PROG-08; ACCEPTANCE_TESTS §12; 4.3 |
| 12 | A finished machine can be gifted | ACCEPTANCE_TESTS §13; 4.4 |
| 13 | It works without controllers | JUD-05 |
| 14 | It runs smoothly on Quest | JUD-11 and TBL-18, Hardware only, Blocked |
| 15 | It feels like a polished, handcrafted game | JUD-18 (Visual) |

## 6. Claims, limits and design guards

### 6.1 Claims

Nothing we publish may state or imply a player count, a return rate, a rating or a reaction we have not observed. The entry screen carries no statistics or reviews (APP_AND_WEBSITE_GUIDELINES §2), and the description, images and video claim only what the build does (JUD-20, JUD-21). A tester's words are quoted only with their agreement (proposal).

### 6.2 What this evidence cannot show

It can show that the mechanisms for returning exist and read clearly. It cannot show that players return. By the schedule, the daily repair exists for about three days (13 to 15 November) before the code freeze, so at most two next-day returns can be observed. Comfort over repeated sessions cannot be judged at all in G0, and nothing is hardware-verified today.

### 6.3 Design guards

- **No streak, counter, score or reward on the daily repair.** SaveV1 stores only the date of the last completed repair, so a streak cannot exist without changing the save (SAVE_PERSISTENCE_SPEC §3 and §4.4; ADR-027). XP, ranks, currency and rarity are excluded (PRODUCT_SPEC §18).
- **No penalty for absence.** Nothing expires, and no letter, machine or ending waits on the daily repair (PRODUCT_SPEC §8; DAILY-05).
- **No time-limited content.** Weekly commissions, seasonal parts and festivals are excluded from G0 (PRODUCT_SPEC §18).
- **No measurement features.** No export, log or counter is added to measure play. Reading the save in browser developer tools during a test is a testing technique, not a feature.

## 7. Future data collection (G4 Community or later, proposal)

Any collection of data about players is not G0. It is G4 or later, opt-in, and the owner's decision, recorded in an ADR that amends ADR-013 for that generation (ADR-028 consequences; [EXPANSION_ROADMAP.md](EXPANSION_ROADMAP.md) §7). Until then the only evidence is playtests and the owner's observation.

Conditions a proposal must meet before it is considered (proposal):

1. Opt-in and off by default. The player is asked once, in plain words inside the experience, and the game plays identically when they decline.
2. No personal information, identity, headset tracking or room data. This is the baseline of SAVE_PERSISTENCE_SPEC §5 and §16.
3. Never part of the competition build. It lives in a separate build (EXPANSION_ROADMAP §7).
4. The basic gameplay loop still works with the network off (directive Part 11).
5. Any third-party service is checked against Meta's rules (APP_AND_WEBSITE_GUIDELINES §1, policy test) and recorded in CREDITS.md and TOOLING_REGISTRY.md.
6. Each item collected answers a written question. The questions it could answer are the ones G0 cannot: whether players return on a second distinct day, how far through the letters they get, and where first-time players stall.

## 8. Review schedule and record

Dates come from [BUILD_ROADMAP.md](BUILD_ROADMAP.md). If a phase slips, the check slips with it. Rows marked *proposal* are not tasks in BUILD_ROADMAP or [MASTER_PRODUCTION_ROADMAP.md](MASTER_PRODUCTION_ROADMAP.md): they have no priority, effort or acceptance and are not scheduled. A task enters the register only with all seven fields (MASTER_PRODUCTION_ROADMAP §9), so the lead adds them there or drops them.

| Date (2026) | Activity | Section | Who |
|---|---|---|---|
| After Phase 4 (target 8 to 9 November) | Proposal: first observed playtest of the Music Box loop, in desktop or IWER, early enough to fix what it shows | 4.2 | Owner arranges; QA agent or lead observes |
| 13 November | Proposal: gifting is due on 12 November (Phase 6). A second person opens a gift | 4.4 | QA agent or lead |
| 13 November | DR-1, the daily repair, is due | 4.3 | Progression agent or lead |
| 14 and 15 November | Proposal: next-day return checks | 4.3 | Owner |
| 15 November | QA-1: record JUD-08, JUD-09, JUD-10, JUD-21 | 4.5 | QA agent records; lead signs off |
| 16 November | Code freeze. Only critical bug fixes | none | Lead |
| 17 November | Proposal: check description and video claims against section 6.1 | 6.1 | Lead, then the owner |

Each record carries the fields of TESTING_QA_PLAN §11 (test ID or section, date, build or commit, environment, browser, headset if any, steps, expected and actual result, status, limitations) and a status from ACCEPTANCE_TESTS §3. Evidence level is always one of Desktop, IWER, Quest Browser, physical Quest 3 or physical Quest 3S, and never mixed.

## 9. Open points

| Point | Default applied | Where tracked |
|---|---|---|
| Who the first-time testers are, and how many | None is required by any specification. The owner arranges them | Owner decision pending: [decision 6](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner) |
| Who tests on a Quest 3 or 3S, and when | Hardware items stay Blocked | Owner decision pending: [decision 2](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner); BUILD_ROADMAP TP-7 |
| Which repairs the daily pool contains | Defined by the owner | ADR-027 |
| What a returning player sees first | Not specified. A lead decision is needed before the return flow is built | Specification gap (new) |
| Whether testers may be recorded on video | Notes by hand only | Owner decision pending (new) |
| Any collection of data about players | Not G0 | Owner decision, G4 or later (section 7) |

## 10. Acceptance criteria for this document

1. Every retention goal R1 to R5 has a G0 mechanism, a source and evidence, and none has a numeric target.
2. Nothing in this document adds analytics, telemetry, accounts, scores or a measurement feature to G0.
3. Section 7 says G4 or later, opt-in, owner decision, and is labelled proposal.
4. Every PRODUCT_SPEC §20 criterion has a judging method, and no judging method needs data about players.
5. Every date that cites BUILD_ROADMAP matches it, every other dated row is marked proposal, and the verification levels are not mixed.
6. Every open point is marked, with a link where one exists, and every link resolves.
