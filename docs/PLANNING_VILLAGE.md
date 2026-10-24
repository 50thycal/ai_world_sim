# Goals, resilient work and shared events

App 0.11.0 adds two fresh, separately labeled treatments. Saved worlds and queued batches retain
their exact original versions, inputs and physics. No production run is started, reset or migrated
by this change.

| Treatment | Creation flag | Recorded input | Default owner setup |
| --- | --- | --- | --- |
| v11: goals and resilient work | `planning:true` | `planning-facts-v1` | Five ten-day hourly/Fast runs |
| v12: v11 plus shared-event supply loop | `sharedEvents:true` | `planning-events-facts-v1` | Separate unchecked option |

Both imply the earlier village treatments and require Renewable village. Hourly review still
uses six model decisions per simulated hour; plans execute recorded physical steps without extra
model calls. Fast changes display waiting, not simulation physics or inference latency.

## Why these changes

The completed v10 batch `7b9aeec6-ff72-47aa-9104-39a07a2d8d1d` contained five ten-day runs,
7,200 applied decisions and 1,200 completed rounds, with no missing inputs, failures or retries.
Review covered 21,991 retained scientific rows. No resident starved. Compared with the preceding
v9 batch, blocked actions fell from 215 to 48 and invalid hobby-item choices fell from 111 to zero;
home installations rose from 14 to 28 and ten kits were used. These are descriptive comparisons,
not isolated causal estimates.

Economic and collective activity remained weak: only one shop, eight purchases, three paid jobs,
no new public upgrade completions and no shared activities. Of 1,491 hobby proposals, 1,057 were
made with enjoyment already at least 95. Exact project contribution/construction/hiring examples
were absent from all 7,200 inputs while hobby examples were readily available. One upkeep plan
failed on a depleted wood site and correctly refunded its coin, but lost the rest of its sequence.
The stated reason also confused service maintenance with personal healing. These observations
motivate balanced guidance, persistent goals, bounded shortage handling and a distinct event loop.

## v11 rules

Residents may set or clear one private goal lasting 24 simulated hours: install a bed/furnishing,
complete a public upgrade, or observe an active clinic/garden. Goals persist through food, rest
and unrelated choices, but never execute work. Completion means the target was observed fulfilled;
it does not establish that the goal owner built or funded it. Goal events stay out of other
residents' memories. The spectator/research view intentionally retains full scientific evidence.

Exact voluntary choices appear once in grouped survival, commitments, home/projects, exchange
and leisure menus. Home guidance explains gradual comfort benefits and public projects explain
future resource savings. Maintenance explicitly restores zero personal health; recovery requires
its separate meal-backed action. Examples guide availability, not a compulsory priority order.

Meals, rest, recovery and explicit `post_order` pause an existing physical plan. `resume_plan`,
or `continue` when no personal-care task remains and safety limits permit, explicitly resumes it.
Setting/clearing a goal preserves the plan. Other work replaces it using the existing refund rules.
Hunger at least 80 or energy below 10 pauses work without selecting food or rest automatically.
The original deadlines, step limits and escrow obligations never extend.

An internal gather failure caused by an empty renewable site may retain the plan and wait until
the public regeneration clock permits another attempt. At most three shortages fit within the
original step/deadline budget; retries can still lose a race to other gatherers. The failure remains
a blocked event with recovery metadata. Unknown failures, exhausted limits and expiry stop the
plan and refund remaining wages once. No goods, health or coins are invented.

## v12 rules

A resident can announce one public event before acquiring supplies: music, games or walking
needs one leisure kit; a shared meal needs two cooked meals. A zero-to-twelve-coin ticket is an
explicit offer. The announcement expires after 24 hours and does not itself authorize purchases.

The host may craft/cook or explicitly hire a supplier through the existing two-item supply job.
That job reserves the host's existing coins and pays only on physical delivery. `prepare_event`
separately reserves one kit or two meals, protecting them from ordinary personal consumption.
The event opens one hour later with a four-hour attendance window, within its original expiry.

A guest explicitly chooses the exact host, event ID and price. Both must actually be at the green
and at least four hours since their last leisure; meals require both hunger levels at least 40.
Successful participation consumes the reserved supplies, transfers the ticket from guest to host,
and gives both connection/enjoyment subject to repetition and caps. A shared kit supplies both
bonuses without consuming additional carried kits. Only one guest completes each event.
Failure spends no ticket or supplies; cancellation/expiry returns unused supplies once.

Event listings disclose only advertised intentions, terms and reservations, never private readiness,
inventories or wallets. Exactly 48 coins include every existing public budget and escrow. Reserved
meals remain host-owned in food-inequality accounting. Event supply consumption, ticket transfers,
announcements, preparations, completions and returns are separate saved counters.

## Evaluation

Run five fresh v11 ten-day hourly/Fast replicates first. Compare all members, including paused or
failed outcomes, with retained v10 evidence. Measure project choices and completions (and their
timing), installations, goals adopted/observed/expired, paused/resumed/expired plans, shortage
recovery, blocked attempts, paid jobs, shops, trades, survival and the three wellbeing components.
Goals alone and repeated maximum-enjoyment hobbies are not evidence of a productive economy.

Then run five fresh v12 replicates with otherwise matching settings. Follow each event from
announcement through explicit purchases, producer delivery, preparation, guest attendance, payment
or refund. Separate increased economic circulation from merely announcing unfulfilled events.
Preserve exact inputs, version labels, every started run and failed attempt. Longer 20-day runs
can test durability after the ten-day replicates establish adoption; avoid mixing duration changes
into the first comparison.

Local deterministic and fake-adapter checks establish contracts, conservation, privacy, bounded
recovery, persistence and UI behavior. They do not establish spontaneous live-model adoption,
provider speed, deployed persistence or improved village outcomes.
