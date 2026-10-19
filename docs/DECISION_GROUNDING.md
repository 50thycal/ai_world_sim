# Current-state mismatch investigation — 2026-10-19

## Evidence inspected

Production served app 0.4.2, revision `ff6be320a671a7039a12355a2bcef6f1ce6e0358`.
Read-only retrieval did not pause, resume, reset or otherwise mutate any production run.

- Run: `d97b5a03-d477-4789-a9e0-f28e8a807a18`, world-v4, Renewable village,
  `gpt-5.6-luna`, ten days, introductions on, temperaments off.
- Report generated `2026-10-19T12:27:28.940Z`, tick 335 (Day 2, 03:55).
- All 503 scientific rows through record ID 11690 were retrieved with bounded pagination:
  168 requests and 168 saved decisions. The physical world was still running; these are a fixed
  evidence window, not final results. Recorded completed rounds/actions remain distinct from proposals.
- [Report](https://village-production-4258.up.railway.app/api/research/runs/d97b5a03-d477-4789-a9e0-f28e8a807a18)
  and [record pages](https://village-production-4258.up.railway.app/api/research/runs/d97b5a03-d477-4789-a9e0-f28e8a807a18/records).

## Observations

Eight explanations explicitly said hunger was below the eating threshold despite a recorded
current hunger above 40. This is a narrow, manually inspected language check, not a general measure
of decision quality. Delaying eating by itself is not an error: a resident may choose other work.

| Resident | Tick | Recorded hunger | Request UUID |
| --- | --- | --- | --- |
| Luma | 24 | 44.8 | `274dc883-6ff1-48ee-8065-13c9798a86a4` |
| Asha | 36 | 44.2 | `bd90eb9e-629b-4210-8a5f-0dc398703222` |
| Mira | 60 | 49.0 | `ea3da579-2fd3-4a17-94e9-4bb7ff88e33a` |
| Asha | 96 | 71.2 | `d22ebd10-c72b-422d-ac9d-fea90e08d356` |
| Asha | 108 | 76.6 | `c6237ab5-c620-41bf-8d26-5dfa13668a52` |
| Asha | 120 | 82.0 | `c863437d-3912-4c29-ac1a-03eb054e3c9c` |
| Luma | 228 | 56.6 | `eebd7488-ae46-431d-b733-79bbc9a689e6` |
| Fen | 312 | 45.4 | `d83571a6-34cb-4628-ad69-a696939163ad` |

For Asha at tick 108, the engine recorded hunger `76.60000000000028` and inventory
`{raw:1, wood:0, meal:6}`. She chose wood gathering while explaining that hunger was below
the eating threshold. At tick 120, with hunger 82 and six meals, she continued the task using
the same mistaken premise. At tick 132 she chose eating at hunger 87.4. Her health was 100,
with zero starving ticks, in the inspected report; do not describe this case as observed starvation.

Replay [frame 7187](https://village-production-4258.up.railway.app/api/research/runs/d97b5a03-d477-4789-a9e0-f28e8a807a18/frames/7187)
is tick 108. Recomputing the legacy observation from that frame produced a deep-equal match
to the exact saved request input, including hunger, inventory, tasks, history and rules.
The rule string correctly states that eating is blocked below 40. These facts do not indicate
a hunger reversal, stale physical snapshot, or missing meal in the engine's saved input.

## Diagnosis and limits

The confirmed defect is contradictory model output against its recorded current state.
The input construction also repeatedly includes prior stated explanations in `myRecentPlans`
and `currentTask.reason`. At tick 108 Asha receives her incorrect tick-96 explanation; at tick 120
the same claim is present in both recent plans and the current task. Long social history precedes
physical state in the serialized legacy observation.

Stale explanation feedback and low salience of current facts are plausible contributors. The
evidence does not prove which caused the first mistake, reveal private model reasoning, or prove
that changing the prompt eliminates it. Historical provider-side wire contents cannot be recovered;
the current adapter's code and disposable fake-transport test verify serialization, not an old
provider's internal state. No corrective inference, model change, or paid-provider test was made.

## Versioned mitigation

Only newly created v4 runs opt into `current-facts-v1`:

- Put engine-derived current hunger, inventory, eating eligibility and starvation threshold before
  social history. Eligibility uses the engine's existing minimum-hunger constant; reachable food
  only includes carried food and an adjacent pantry. Other bags and remote stock remain private.
- Remove prior rationales and task messages from the new decision input. Keep actual action history,
  factual progress and personally witnessed social events. Preserve all original explanations in
  saved plans, replay worlds and permanent decision records.
- Use explicit current-facts instructions. Save the input version and exact protocol before the
  request; send that same protocol through the adapter. No extra calls or new refusal/retry policy.
- Keep old observations and instructions for existing runs, even if a round is partly complete.

Residents retain every valid choice. They can defer eating, fail to coordinate and starve despite
renewable food. Resource regeneration, inventories, meal yield, hunger growth, damage, health floor,
hourly decision cadence, inference effort and recovery budgets are unchanged.

## Verification and next live check

- `npm run check` and all 78 tests pass, including an incident regression, threshold boundaries,
  privacy, SQLite restart/history preservation, and persisted-input versus real-adapter wire equality
  using a disposable fake transport. A valid wait remains a wait even when eating is possible.
- Existing ten-day renewable reference-policy feasibility still passes. A new idle-resident test
  confirms starvation damage occurs despite food remaining available. These are engine tests,
  not evidence of improved model behavior.
- No UI changes. CI also runs the existing desktop/phone acceptance suite.
- After deployment, evaluate a new Renewable village run using the same model and other settings.
  Check explanations against exact request facts and applied actions, especially near hunger 40/95;
  distinguish available-food starvation from genuine supply/processing/distribution shortages.
  Compare at matched simulated times and repeat before claiming a stable improvement.
- The pre-fix renewable condition and earlier finite-stock runs differ in ecology and initial
  endowments. Those comparisons cannot isolate this input treatment. Research reports expose
  `decisionInputVersion` (null for old runs) to identify the new condition.

Keep market, construction and personal-goal mechanics in subsequent changes after this check so
their behavioral effects are not confused with the input fix.
