

# Wound Up — Save and Persistence Specification

**Project:** Wound Up  
**Status:** Implementation specification  
**Depends on:** `PRODUCT_SPEC.md`, `GAMEPLAY_SYSTEMS.md`, `DATA_AND_BLUEPRINT_SPEC.md`, `TECHNICAL_ARCHITECTURE.md`

---

## 1. Purpose

This document defines how Wound Up stores and restores player progress.

The competition version uses local browser storage.

There is no account system, cloud save, remote database, or synchronisation service.

Persistence must be reliable, versioned, validated, and tolerant of storage failures.

## 2. Storage Strategy

Use browser `localStorage`.

Storage key:

```text
woundup.save
```

The saved value is JSON.

All persistence code should be isolated behind a dedicated save service.

Gameplay systems must not independently write arbitrary values into localStorage.

## 3. Save Data

The first version uses:

```ts
type SaveV1 = {
  version: 1;

  townPlaced: boolean;

  letters: Record<string, LetterStatus>;

  machines: {
    blueprintId: string;
    built: boolean;
    placed: boolean;
    plotId?: string;
  }[];

  dailyDone: boolean;

  settings: {
    easySnap: boolean;
    gazeMode: boolean;
    xrayHint: boolean;
    night: boolean;
  };
};
```

The exact type names may be adjusted to match the codebase, but the persisted fields and semantics must remain consistent with the product specification.

## 4. Persisted Data Rules

### 4.1 Town State

`townPlaced` indicates whether the initial town has been placed in the player's environment or fallback presentation space.

It must not store headset tracking coordinates as permanent world truth.

On a fresh session, the application may need to place or reposition the town again.

### 4.2 Letters

Letter states must use a controlled set of values.

Recommended type:

```ts
type LetterStatus =
  | "locked"
  | "available"
  | "accepted"
  | "completed";
```

Do not store arbitrary strings.

The implementation must preserve the intended progression order.

### 4.3 Machines

Each machine record stores:

- Blueprint ID.
- Whether it has been built.
- Whether it has been placed.
- Optional plot ID.

The save must not store Three.js objects, scene graphs, materials, geometries, or runtime references.

### 4.4 Daily Repair

`dailyDone` records whether the current daily repair has been completed.

The daily repair seed must be derived using the local date as specified in the gameplay design.

Do not create a backend to manage daily repairs.

### 4.5 Settings

Persist the supported player settings:

- Easy Snap.
- Gaze Mode.
- X-ray hint preference.
- Night mode.

Settings must be validated and defaulted if missing.

## 5. Data That Must Not Be Persisted

Do not persist:

- Hand-tracking joints.
- Current controller poses.
- Headset transforms.
- Temporary animation state.
- Active particle systems.
- Audio playback position.
- Three.js object references.
- Temporary interaction targets.
- Open UI panels.
- Unfinished frame-level simulation state.
- Temporary solver objects.
- Debug information.
- Personal information.
- Analytics or telemetry.

A machine's assembly should be restored from its stable blueprint and saved progression representation, not from serialised runtime objects.

## 6. Save Triggers

Save after meaningful progression changes.

Required triggers:

1. Letter accepted.
2. Letter completed.
3. Machine successfully built.
4. Machine successfully placed.
5. Town placement state updated.
6. Daily repair completed.
7. Player settings changed.

Do not save every render frame.

Do not repeatedly write unchanged data.

## 7. Save Process

The save service should:

1. Construct a plain data object.
2. Validate the object.
3. Set the current schema version.
4. Serialise to JSON.
5. Write to localStorage.
6. Handle storage errors.
7. Report success or failure to the application.

Example interface:

```ts
interface SaveService {
  load(): SaveLoadResult;
  save(data: SaveV1): SaveResult;
  reset(): SaveResult;
}
```

The implementation may use different names if the architecture requires it.

## 8. Load Process

At application startup:

1. Read the storage key.
2. Handle missing data.
3. Parse JSON safely.
4. Validate the schema.
5. Check the version.
6. Apply migration if supported.
7. Validate referenced machine and letter IDs.
8. Restore progression.
9. Apply saved settings.
10. Initialise the town and machine systems.

Never trust stored JSON blindly.

## 9. Validation

The application must handle:

- Missing fields.
- Incorrect field types.
- Unknown letter IDs.
- Unknown blueprint IDs.
- Invalid plot IDs.
- Invalid state values.
- Malformed JSON.
- Unsupported save versions.
- Unexpected arrays or objects.
- Storage access errors.

Invalid or unknown entries should be handled safely.

Do not allow malformed save data to crash the application.

If a record cannot be restored safely, use a documented fallback or fresh state.

## 10. Versioning and Migration

The current schema version is:

```ts
version: 1
```

Future schema changes must increment the version.

Migration should be explicit.

Example:

```ts
function migrateSave(
  data: unknown
): SaveLoadResult {
  // Validate and migrate known versions.
}
```

Rules:

- Never silently reinterpret an unknown version.
- Preserve compatible player progress.
- Do not assume future fields exist.
- Keep migration logic separate from gameplay logic.
- Test every supported migration.

If the save version is newer than the application understands, fail safely and explain that the saved data is incompatible.

## 11. Storage Failure

Browser storage may fail because of:

- Private browsing restrictions.
- Storage quota.
- Browser configuration.
- Security restrictions.
- Corrupted data.
- Browser-specific behaviour.

If saving fails:

1. Continue the current session using in-memory state.
2. Do not crash.
3. Show a subtle save warning when appropriate.
4. Do not claim progress was permanently saved.
5. Retry only after a meaningful future state change or deliberate retry.

Provide a safe default state if loading fails.

## 12. Reset Progress

Restarting progress must require confirmation.

The player must not accidentally erase progress through a single ambiguous interaction.

Required behaviour:

1. Player selects Restart.
2. Confirmation appears.
3. Player confirms with a second deliberate action.
4. Save key is cleared.
5. Application returns to a fresh progression state.

The UI must make the destructive action understandable.

## 13. Gift Data Is Separate

Gift links are not save files.

The gift system serialises one finished machine into a compact URL payload.

Gift data must be:

- Independently validated.
- Restricted to supported blueprints.
- Restricted to supported part identifiers.
- Rejected if the machine fails solver validation.
- Loaded in a read-only gift viewer.

Gift payloads must not overwrite the recipient's save.

The gift viewer must not automatically add a machine to the recipient's town.

## 14. Persistence and Session Recovery

If the application is suspended:

- Preserve already saved progression.
- Do not assume the current in-progress assembly was saved.
- Resume safely.
- Reinitialise transient tracking state.
- Restore supported settings.
- Avoid sudden machine animation or energy consumption.

Do not depend on the browser always delivering a final shutdown event.

## 15. Testing Requirements

Test:

1. Fresh install creates valid default state.
2. Save and reload preserve letter progression.
3. Built machines are restored correctly.
4. Placed machines remain placed.
5. Settings survive reload.
6. Daily completion survives reload.
7. Malformed JSON is handled safely.
8. Unknown blueprint IDs are rejected safely.
9. Unknown letter IDs are rejected safely.
10. Unsupported save versions are handled.
11. Storage exceptions do not crash gameplay.
12. Reset requires confirmation.
13. Gift data does not modify local save.
14. No frame-by-frame writes occur.

## 16. Privacy

The persistence system must not collect or transmit personal information.

No account, identity, email, location, or headset tracking information is required for local progression.

No analytics or telemetry should be added.

