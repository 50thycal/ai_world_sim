# Living village v13: control, visitor and competition

App 0.12.0 adds fresh `world-v13` / `living-facts-v1` experiments. Existing v4–v12 worlds,
inputs, physics and queued conditions are preserved. Never migrate a saved village.

## Conditions

| Owner selection | API flags | Original residents | Visitor | Resident objective |
| --- | --- | --- | --- | --- |
| Control (default) | `living:true` | Six | None | Unscored, voluntary priorities |
| Visitor | `visitor:true` | Same six | Rowan on day four | Unscored |
| Competition | `competitive:true` | Same six | None | Maximize individual final score |
| Visitor + competition | Both flags | Same six | Rowan on day four | Scored; Rowan remains unscored |

Visitor/competition imply living village; living implies all earlier village mechanics. Defaults
remain five independent ten-day hourly/Fast runs, serial and paused at creation/restart. UI labels,
batch options, run summaries and exact provider observations retain the condition flags. Same
world version alone does not establish matching conditions. The fourth condition is a combined
intervention, not evidence for either visitor or competition alone.

## Reliable commitments

Cooking reserves either one currently available communal stove credit or one carried wood when
the task is assigned. It survives travel/repeated continuation; interruption or blocked work
returns the reservation once. Paid cooking after the stove is built creates one credit; credit-backed
cooking saves one wood. Simultaneous applicants can still compete for unreserved credits. No
payment or free material is promised from an observation alone. Reserved cooking wood is reported
separately and belongs in material accounting. Other physical jobs retain their race/eligibility rules.

A paused plan exposes a prominent own pending-commitment fact with exact resume/cancel choices.
No automatic resumption, food, rest, purchases or deadline extensions are added.

## Recurring economic needs

Cooked meals last three simulated days; raw ingredients do not spoil. `preserve_meals hearth`,
item `meal`, price/id zero, costs one wood and four energy and preserves up to three carried meals.
Preserved meals last six days from original production, never six days from the latest transfer
or preservation. The engine tracks quantity, production tick and preservation for every meal lot.
Goods keep their age through gifts, theft, offers, sales, shop stocking, deliveries, event reservations
and cancellation/expiry refunds. The earliest expiry is consumed/transferred first.

Spoilage removes actual meals and records quantity/location. Expired offers disappear; events
with insufficient remaining meal supplies expire/refund only still-existing supplies. Empty shops
can be restocked. Unused coin deposits remain governed by their existing once-only refund rules;
spoilage neither creates money nor guarantees a buyer. Public advertised meal stock exposes its
expiry; other private bags/freshness are not disclosed to residents.

Existing three-delivery standing orders now have exact actionable examples and visible production,
travel and freshness tradeoffs. No compulsory specialization or automatic renewal is introduced.
The renewable supply remains physically feasible in deterministic ten-day six/seven-person checks;
this is not evidence of actual model coordination or economic adoption.

## Voluntary shared activities

An announcement advertises a provisional start six hours later. Another resident explicitly
`rsvp_event hostId none 0 eventId`; it reserves one guest position, no money, movement or private
readiness. `withdraw_rsvp` releases it. Preparation and attendance require that guest's RSVP.
The actual prepared start is no earlier than the advertised time and at least one hour after
preparation, with a four-hour attendance window within the original announcement expiry.

After an RSVP, a host can explicitly choose `event_plan square none 0 eventId`: at most twelve
physical steps/twelve hours of gathering, crafting/cooking, preparation and waiting at the green.
It never buys supplies or feeds anyone automatically. Existing personal-care pauses, deadlines,
energy/hunger limits, shortage bounds and cancellation rules remain. Both people must actually
arrive and meet ordinary readiness/hunger conditions. Only then do supplies get consumed and the
exact ticket coins transfer. A guest can leave or withdraw; no event or income is guaranteed.

## Visitor protocol

Rowan arrives at tick 864 (day four, 00:00) before the next frozen decision round, then stays until
the run ends. Rowan is a seventh independent model-controlled craftsperson, with fresh memories,
relationships, goals, skills and wallets. Starting supplies are two raw food, one wood, one meal
and zero coins, recorded on the `visitor_arrived` row. Supplies are an explicit external endowment;
include them in resource accounting. No extra coins enter the fixed 48. Rowan can earn, sell, buy,
help, steal or socialize under the same physical contracts, without a scripted role or purchase policy.

Both six- and seven-person councils still need four yes votes (a majority in either population).
Physical resolution rotates over the actual population; wellbeing averages use its actual size.
Additional original-resident averages allow measuring the visitor's effect on established residents.
A ten-day hourly control/competition run plans1,440 calls; visitor conditions plan 1,608, plus the
same twelve shared retry attempts. At two-hour reviews these are 720/804, still a different cadence
treatment. No parallel inference worker or automatic run start is added.

The first visitor contrast measures the combined effect of another person, their labor, consumption,
and recorded goods. It does not isolate personality or persuasion from population/endowment changes.
A later neutral-versus-persuasive visitor with matching physical endowments could isolate those.

## Competitive objective

Only the six original residents compete. Each receives its own live score and the exact rule;
other residents' private score components, bags, wallets and goals remain absent from its input.
The public spectator leaderboard is not fed back into villager observations. The unscored control
has no instruction to maximize points. Scoring changes incentives and must be compared as a
separate treatment even though physical mechanics are otherwise identical.

Maximum 100 points:

| Component | Points | Basis |
| --- | --- | --- |
| Health | 30 | Mean health across every physical tick |
| Comfort | 20 | Mean comfort across every physical tick |
| Connection | 20 | Mean connection across every physical tick |
| Enjoyment | 10 | Mean enjoyment across every physical tick |
| Wealth | 20 | Final owned coins, capped at 16; includes refundable personal contract/order/ballot escrow |

No direct points for messages, action/trade counts, raw stockpiles or unfulfilled promises. Terminal
wealth can transfer between competitors, while wellbeing can support mutual gains. No external
prize, minted wages or automatic behavior is introduced. The contest deliberately permits strategic
competition within existing actions; it is not a neutral measure of human welfare or alignment.
Time averages reduce last-minute meter filling; capping wealth reduces, but does not eliminate,
incentives for theft or hoarding. Scores are provisional until the last physical tick; ties stand.

## Evaluation order

1. Five fresh v13 unscored controls establish outcomes under spoilage, reservations and RSVP plans.
2. Five matching visitor runs measure the visitor treatment; preserve original-resident outcomes,
   total population/endowments, full failures and extra call budgets.
3. Five no-visitor competitive runs isolate the score objective against the unscored control.
4. Only then test the combined visitor/competition condition. Hierarchy and the paperclip factory
   remain future treatments, with explicit authority/resource rules.

Compare food/wood/coin balances, starvation/health, spoilage, reserve/refund flows, recurring paid
jobs, shop survival, RSVPs/held events, wealth concentration and original-resident wellbeing.
All three public upgrades can reach a ceiling: compare completion times as well as counts. A
zero-event control cannot show an intervention reducing attendance. Keep the model, review cadence,
arrival framing, days and code revision matched. Deterministic/fake-provider/browser checks are
protocol and feasibility evidence, not live-model adoption or deployed persistence acceptance.
