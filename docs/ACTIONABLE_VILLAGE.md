# Actionable village v10 · app 0.10.0

## Why this treatment exists

The completed five-run v9 batch `76bc73cd-6894-48f3-a21c-76a250722a61` had
7,200 applied decisions, no recorded provider failures, no starvation and one raw-food meal.
Survival improved, but three villages opened no shop and no prepared invitation was accepted.
111 of 215 blocked outcomes were hobby field errors: agents used `item: leisure_kit` where
`item: none` was required. V9's condensed leisure description omitted those exact hobby fields.
Some villagers repeatedly socialized despite almost zero enjoyment; public services could remain
inactive despite donated budgets. These are observed outcomes, not proof of a single causal mechanism.

Read-only evidence: https://village-production-4258.up.railway.app/api/research/batches/76bc73cd-6894-48f3-a21c-76a250722a61

## Fresh versions and defaults

`agency:true` implies community/coordination/life/village/economy and Renewable village. It selects
`world-v10` with `actionable-facts-v1`. Owner UI defaults to v10; uncheck the v10 option for the v9
comparison. Five serial ten-day villages, hourly reviews, Fast pace and the existing renewable
food/fuel rates remain default. Old saved worlds and queued batches retain their rules and inputs.
No saved run is migrated, resumed, reset, replaced or pruned by this feature.

## Clear, truthful leisure choices

Each observation includes exact valid choices for music, games and walking: `item: none`, `price: 0`,
`offerId: 0`. A carried kit is consumed automatically. Available hobby examples respect the four-hour
cooldown. `currentFacts.activityChoices` shows estimated connection/enjoyment gains after repetition
and caps, plus kit consumption and energy benefit. Engine and preview share the same repetition
calculation; hobby base includes interest/hour, active garden and carried kit. Estimates describe
acting at observation time, before travel/work decay; conditions can change before completion.

`currentFacts.lastActionResult` contains only the observing resident's latest physical outcome,
including blocked actions. Rejected hobby choices receive an exact corrected choice and a reminder
that valid fields do not bypass cooldown or location rules. There is no silent normalization or
scripted substitution for a model decision. V9 hobby physics and its historical inputs remain unchanged.

## Reasons to exchange and one-unit home orders

Own needs explain the benefits of prepared meals, fuel, tools, kits, beds and furnishings, available
crafting costs and affordable example orders. Suggested prices are examples, not forced valuations.
Agents can choose a shop purchase, self-production, public purchase order or another activity.
Public demand consists only of explicitly posted orders; other residents' private bags, wallets,
preferences, feedback and plans are never disclosed or inferred as a public need.

In v10, `post_order` also accepts bed/furnishing. These home orders reserve ONE unit price for ONE
item (1–12 coins). All earlier supply goods still reserve TWO unit prices for TWO goods. Existing
claim, physical delivery, cancellation and expiry rules apply. Correct production examples help a
reserved worker prepare missing goods; payment occurs only after full delivery. Home installation
still requires the resident's separate voluntary `furnish` action. No new materials or coins appear.

## Voluntary upkeep plans

`upkeep_plan`, target clinic/garden, item wood, price/offerId zero, reserves one donated public coin
using the existing upkeep reservation. One plan per resident, one reservation per service. It may:

1. Gather wood through the ordinary physical gather action if the resident lacks one wood.
2. Travel to the service site.
3. Wait there until maintenance is due within two hours.
4. Complete the exact reserved job, consuming one wood and four energy, restoring 24 hours of
   service and transferring the reserved coin to the worker.

The plan authorizes at most eight physical steps over 24 simulated hours. No extra model calls,
automatic buying/eating, free resources or skipped physics are introduced. Hourly reviews continue.
`continue` preserves the plan; any other choice interrupts it. Hunger at 80, energy below 10,
failed work, reservation expiry or a competing renewal ends the plan. Long waits may therefore
need interruption for personal needs; a reservation is not a guarantee of payment.

Unused reservation funds return to the public budget exactly once on cancellation/interruption.
If another worker renews service first, the plan stops and refunds its unspent wage. Completed
maintenance is never paid twice. Refund details are retained on plan outcomes/last-plan state;
normal job expiry keeps its existing permanent outcome. All wallets, request/order/job escrows
and public budgets still sum to 48 coins. No forced labor, tax or minted wages.

## Review the next batch

Track blocked hobby choices, successful kit use and shared activities; purchases, home orders and
wage circulation; upkeep plans completed/released and actual service-active ticks. Keep starvation,
raw eating, physical materials and the 48-coin invariant alongside wellbeing. A lower v9/v10
satisfaction level than v8 is not evidence of worse welfare: v9 changed the metric's meaning.
V10 changes multiple observation/mechanic details together, so compare the whole treatment and do
not attribute differences solely to one feature. Mock-provider and browser checks demonstrate engine
correctness, not spontaneous live adoption or a more successful economy.
