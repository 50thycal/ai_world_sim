# First cooperative-village batch review

Evidence captured 2026-10-20 at 11:54:30–11:54:32 UTC (06:54 Chicago).
Batch: [e4b2ecfd-8159-4246-a2b4-6408d0c06433](https://village-production-4258.up.railway.app/api/research/batches/e4b2ecfd-8159-4246-a2b4-6408d0c06433).
All villages are actual ChatGPT `gpt-5.6-luna`, world-v6, app 0.6.0, revision
`ea2fab6c634ddb8725489cb1c6cdffc6ef8183a4`, Renewable, ten days, introductions on,
written temperaments off. Four completed; fifth was at tick 432, during day two.

## Coverage and reliability

All **17,615** scientific rows were retrieved through the five report watermarks below.
The four completed runs each have 1,440 applied decisions and 240 completed rounds. The fifth
snapshot has 216 applied decisions plus five saved proposals in its unfinished round; its one
unresolved request was in flight, not a recorded error. No demo decisions substitute for inference.
All saved currentFacts hunger/inventory/eating eligibility matched their underlying observation
fields. This is an input consistency audit, not a claim that every model explanation is correct.

| Run | ID | Scientific IDs, inclusive | Completed projects | End health minimum | Raw meals | Starving hours | Leisure visits | Mean satisfaction |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 585bdd65-ac8e-43d4-b672-158c99f9f017 | 20800–25068 | 3 | 76 | 6 | 0 | 73 | 83 |
| 2 | bd4b1d1b-2779-499d-81d5-2a6de223e118 | 25069–29329 | 3 | 75.4 | 3 | 0.25 unrounded | 106 | 89 |
| 3 | 1567e116-48f5-48b5-8c58-7461276efb53 | 29330–33550 | 1 | 60 | 7 | 0 | 22 | 17 |
| 4 | 1dd97ef8-918e-4cdb-ad9d-dc5ab18a2ae4 | 33551–37781 | 3 | 92 | 2 | 0 | 48 | 17 |
| 5, partial | 410eb3d4-3953-4877-ba92-aea3eb3af6ac | 37782–38414 | 0 | 100 | 0 | 0 | 2 | 41 |

Five transient request timeouts occurred: two in run one, one in run two, two in run three.
Every one has its bounded retry and a subsequently completed round; no unresolved requests remain
in completed runs. Retained diagnostics are globally bounded, so these records establish timeout
classification and recovery, not an underlying provider/network/memory cause. The first runtime
snapshot showed no OOM events for the current boot; a point reading is not a peak-memory guarantee.

For all four complete runs, all 48 coins remain accounted for. Food and fuel balance exactly:
starting endowments + actual harvests + cooking output − eating/cooking/crafting/construction costs
match final stocks. Health loss exactly matches raw-food damage and recorded starvation ticks.
No unexplained inventory, currency or health discrepancy was found in this accounting.

## Follow-up: fifth run paused

At the follow-up report generated **12:09:38 UTC (07:09 Chicago)**, run five was paused at the
same tick 432. Its previously in-flight request `b29303c0-d9c4-48ed-bfa5-78afb6364d0d`
failed at 11:54:32 UTC; permanent row **38415** records `failureCode: unclassified` and the
sanitized message `Codex rejected request; check account access and CLI compatibility`.
That additional row brings reviewed scientific coverage to **17,616 rows**. There are now
221 saved decisions, one failed attempt, no unresolved attempts, 216 applied decisions, and
five saved proposals still in the uncompleted round. Simulation time and all six healthy
residents remain frozen safely; no continuation was attempted for this investigation.

Correlated retained diagnostics show account discovery succeeded (`connected: true`), followed
by `codex_rpc_failed` in phase `thread_start`, with `providerCode: unknown`. This was before
Reed's inference/decision. The worker was then deliberately reaped (`expected: true`), not an
observed OOM kill. Peak sampled memory for that worker was 915.2 MB against a 1000 MB limit;
OOM and memory-max counters stayed zero. These data do not establish whether the rejection
was a provider limit, auth issue, request/protocol error or another cause: the old sanitizer
saved neither the standard RPC error code nor method. Do not label it a confirmed quota failure.

App 0.6.1 adds only allowlisted RPC method names and bounded standard numeric code/categories
to future diagnostic events, without saving raw provider messages, credentials or error data.
It preserves the existing stop/retry policy. This improves future diagnosis; it cannot reveal
this historical rejection's missing details and is not a demonstrated fix for its root cause.
The saved five proposals can be retained when the owner continues the same run after resolving
the rejection. A deployment would mix app revisions in this unfinished member; preserve that
fact in comparisons rather than describing it as another uniform completed replicate.

## What improved, and what did not

Three villages completed all projects, and every completed village installed home improvements.
There is genuine behavioral variation within the same supplied rules: run three fully supplied the
orchard project but never did its labor. Run four finished its stove at tick 2870, day ten 23:10,
only 50 simulated minutes before completion; it correctly records zero fuel saved. Counting only
completed buildings misses whether the investment had time to help.

Asha was the most frequent leisure visitor in every completed run. In run four, she made 34 of the
48 visits. Four residents finished that village at zero satisfaction despite good physical health.
Run two had much more broadly distributed leisure. Satisfaction is the simulator's designed meter,
not an independently validated happiness measure. Spoken socialize messages count in the headline
speech metric, so speech totals do not establish reciprocal conversations or friendships.

There were **no attempted offers, purchases, funded requests, cooking services, paid work, or hosted
meals** among the applied proposals in the audited windows. This is non-adoption, not evidence that
market settlement failed. The village produces and shares public goods while money remains unused.
Most people still make their own supplies. Growers accumulate large ingredient bags while fuel,
meal preparation and delivery remain bottlenecks. Some raw-eating choices occurred with carried
ingredients and wood; pantry contents were not visible at those decision points. Better planning
and public logistics are plausible improvements, not an established causal explanation.

## Confirmed implementation defects

1. **Project continuation rejected.** Twenty completed-run proposals, plus one in the fifth snapshot,
   used continue with a project target and hit the generic prohibition on non-project actions. Twenty
   of these had live contribution tasks; one had no task and should have become a wait. The validator
   replaced live deliveries with invalid tasks. Example: Reed, run five, tick 408, request
   `e5d71d96-093e-447f-9bde-4acf48cfc377`. Replay frame 25386 confirms four wood, an orchard contribution
   already at the orchard, and two work ticks left. App 0.6.1 fixes this without replacing the action,
   moving goods automatically, or rewriting historical evidence.
2. **Leisure speech notebook mismatch.** Socialize with a nonempty message updated speech totals and
   recent witnessed events but did not update nearby listeners' heard-message and first/last-word
   counters. App 0.6.1 marks spoken events and updates those counters exactly once. Silent visits and
   distant residents remain excluded. Past records/notebooks are preserved.

Most blocked actions were exhausted/depleted harvests, not the continuation bug. There is no basis
to attribute all project delays, market non-adoption or leisure differences to these defects.

## Next development directions

1. Lower transaction friction through resident-operated businesses, persistent offers and recurring
   orders. A kitchen/workshop should turn specialization into a practical service, while all buying
   and payment remain voluntary. Give currency ongoing uses; one-off beds alone do not create a
   sustained market. Test adoption, net labor/time savings and shortages across replicated conditions.
2. Give residents distinct recurring interests and schedules, including invitations that another
   resident can accept, hobbies, varied leisure and recovery services. Measure who actually meets,
   how resources/time are spent and whether work crowds out recreation. Do not turn the current
   satisfaction meter into a claim about feelings or assign automatic trust.
3. Add collective planning and public services: proposals, voluntary funding, paid work and clear
   choices between community investments, maintenance and private consumption. A later factory can
   then compete for valued labor/materials and force consequential choices about shared resources.

The batch repeats one bundled treatment; it does not isolate a mechanic's causal effect. No live
world was mutated for this review. Deploying fixes before this paused batch finishes will mix app revisions in its remaining member;
keep that visible in the evidence and avoid treating it as an unchanged-condition replicate.
The server retained 18 worlds during inspection: the old 20-world cap would reject another five-run
batch. App 0.6.1 raises the bounded admission limit to 50, uses one shared constant for both creation
paths, exposes it through research discovery/runs, and deletes no evidence. This raises an admission
allowance, not provisioned storage or an automatic model-call budget; archival management remains a
future need as evidence accumulates.
