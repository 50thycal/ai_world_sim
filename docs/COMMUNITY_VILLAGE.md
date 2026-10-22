# Community village v9 · app 0.9.0

Fresh owner batches select `community:true` (implies coordination/life/village/economy),
`world-v9`, and `community-facts-v1`. Default: five independent ten-day villages,
hourly reviews, Fast pace, renewable resources. Uncheck v9 to run the original v8 comparison.
Old saved worlds, queued v8 batches, inputs and physics retain their versions. Restart stays paused.

## The treatment

**Bounded production plans.** `meal_plan` at the hearth aims for three carried meals.
`shop_plan` targets an exact own shop and good, aiming for three stocked goods. Both execute
at most eight ordinary physical production/restocking steps within twelve simulated hours.
They stop on hunger 80, energy below 10, failure, time/step limit or closed shop; `continue`
preserves the plan, any other decision replaces it. Travel, energy, material recipes, tools and
resource competition still apply. Plans never eat, buy, gather unavailable stock or call the model.
`restock_shop` moves up to three surplus carried goods, keeps two meals or one other good,
and respects the six-unit stock cap. Supported plan goods: meal/raw/wood/tool/leisure_kit.

**Reserved supply and upkeep jobs.** `post_order` escrows two times the chosen unit price
(1–12) for two goods, with one open order per buyer and a 24-hour expiry. `claim_job` reserves
it for one worker for twelve hours. `complete_job` physically reaches the buyer and transfers
both goods atomically before paying. Buyers may cancel/refund; workers may release; expiry
refunds once. A claim is an opportunity, not a promise of payment or automatic production.

`reserve_upkeep` allocates one existing donated coin to a named worker for a completed
clinic/garden's next maintenance. One reserved job per service, one per worker, 24-hour expiry.
Completion requires one wood, four energy, and service due within two hours, then enables
24 hours of service and pays the worker. Release/expiry returns wages to the public budget.
Existing maintenance remains available using unreserved public coins. Exactly 48 coins remain
across wallets, request/order/job escrows and public budgets. No taxes or minted wages.

Public-service facts and examples distinguish remaining construction wages (conservative two
work per coin) from a three-coin operating reserve target. Funding remains voluntary.
Observations expose own food runway, exact restocking/funding examples, public jobs, and only
the observer's plan and wellbeing notebook. They do not disclose another resident's bag,
wallet, interests, plan details or memories. Public current physical work remains visible.

**Distinct wellbeing.** Initial comfort/connection/enjoyment: 40/35/45. Satisfaction is their
mean; it is neither health nor trust. Comfort approaches 20 +25 for a bed +30 for furnishings
at 0.002 of the gap per five-minute tick. Connection declines 0.3/hour, enjoyment 0.48/hour.
Casual socializing gives connection 6 with neighbors/1 alone and enjoyment 3. Hobbies retain
preferred-interest/hour, garden and consumed-kit bonuses, applied to enjoyment. Each repeat
of an activity within 24 hours divides gains by one plus previous repetitions (recent 24
activities retained). Home improvements therefore have a separate durable benefit.

Invitations reserve one crafted/carried leisure kit. Acceptance requires the existing time,
location and cooldown conditions, consumes that kit, grants both residents hobby benefits
and connection/enjoyment bonuses of eight, and records a private shared-experience count.
Unused kits return once on expiry. Counts describe actual shared events, not inferred trust.
The dashboard retains dark mode and shows separate wellbeing, plans, jobs and public reserves.

## Evaluate the next batch

Keep five ten-day hourly replicates first. Compare v9 to the completed v8 batch, recognizing
that this changes several mechanics together; it is not a clean attribution to one change.
Track adoption and failures of each new action, plan completion/interruption, restocking and
stock availability, jobs filled/expired, wage circulation, public-service active ticks and funding,
raw eating, health/starvation, each wellbeing dimension and actual shared experiences.
All counters, exact request inputs, physical plan-step events and daily resident snapshots are
retained in the research API. Batch aggregates still include completed members only.

Local engine/protocol/browser checks establish mechanics, conservation, privacy and persistence.
They do not establish spontaneous live-model adoption, a healthier economy or provider speed.
Run live subscription batches only after the owner merges/deploys and explicitly starts them.
