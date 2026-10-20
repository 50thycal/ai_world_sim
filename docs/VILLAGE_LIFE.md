# Village life v7

This condition implements resident businesses, personal activities and collective services. It is a
new bundled experiment, not a migration of v6 or a causal test of any single feature. Every proposal
still comes from the resident's selected ChatGPT model; the engine never substitutes demo choices.

## Start and compare

Owner controls default to **Businesses, hobbies & council (v7)**, Renewable village, five serial runs
of ten days. Create a paused batch, then Play. `life:true` in the owner new-batch request implies
`village:true` and the economy. Old queued batches retain their saved options and world versions.
Disable v7 to repeat v6. The same six initial professions, renewable food/fuel rules, 48 coins,
hunger damage, hourly review cadence and request budget remain in place.

Do not start a new village to repair the old fifth run. After deployment, **Restart worker & resume
saved round** replaces Codex's connection and resumes that same saved run. At tick 432 it should
reuse the five saved proposals and request only Reed. The failed request remains recorded and its
replacement counts against the existing extra-attempt allowance. Authentication or exhausted budgets
can still prevent recovery. Startup, including after a deploy, always leaves the world paused.

## Businesses

A resident can open one shop for three days at a fixed unit price (1–12). Goods move one at a time
into a six-unit stock escrow. A customer chooses an exact shop and prepays three times that price
for **at most** three deliveries, one per 24 hours. Three-day closure can mean fewer than three
successful deliveries for a late customer; every unused coin returns. One open order per customer.
No automatic purchasing, restocking, delivery or household consumption occurs. The merchant must
choose to walk to the customer and deliver each unit. Order IDs differ from shop IDs; observations
provide the exact relevant IDs, price, item and next delivery time. Books are private to the customer
and merchant, while advertisements and stock are public. The spectator dashboard shows all books.

Orders can cover raw food, meals, wood, unused tools, beds, furnishings, leisure kits or care. Care
consumes a provider's meal and four energy, requires the customer to be fed (hunger below 60), injured
and at least four hours from previous care. It restores up to eight health, or twelve with a
maintained clinic. It does not reduce hunger. Care and clinic recovery share the same cooldown.

Cancellation, expiry or shop closure returns remaining payment once. Closure also returns seller
stock. End-of-run escrow remains saved; completion is not a cancellation. Donation budgets and all
other escrows are included in the 48-coin metric. Shop-held food still belongs to the merchant in
food inequality calculations. No credit or new coins are created.

## Personal lives

Residents have a saved preferred hobby (music, games or walking) and an evening leisure hour. These
are disclosed to that resident as optional goals. Hobbies take six work ticks after travel and
restore satisfaction/three energy, with a four-hour cooldown. Preferred activity/hour and a maintained
garden add enjoyment. Crafting a leisure kit costs one wood/four energy; the next hobby consumes it
for extra satisfaction, creating recurring demand that competes with cooking and construction fuel.

Invitations open at the green one hour after posting and last three hours. A guest explicitly accepts
or declines. Acceptance succeeds only during that window with the host nearby, both leisure-ready;
each receives a hobby benefit and social satisfaction. Declining is remembered for that guest.
Posting an invitation does not schedule a forced action for the host. Missed invitations remain in
scientific records. Satisfaction is a toy quality-of-life measure, not a claim about feelings.

## Collective choices

Residents may propose a community clinic or a leisure garden. Only one ballot is open at a time;
the proposer votes yes. Votes can change, and four of six yes votes at the 24-hour deadline approve
a proposal. Donation is voluntary. A failed ballot refunds pledges; an approved one commits them to
that project's saved public wage budget. There is no taxation, minted wage or compulsory work.

An approved service needs four donated wood and eight work. A work action uses four energy, adds
two work (three for the craftsperson), and earns one coin from the public budget. Completion enables
24 hours of service. Maintenance, when expired or within two hours of expiry, uses one wood/four
energy and earns one budget coin to renew 24 hours. Without funding or upkeep benefits stop. The
clinic allows a fed injured resident to consume one meal and six work ticks for up to six health;
the garden adds five satisfaction to hobbies. Funds remain saved while the service is inactive.

## Questions for the next five live runs

- Do residents open shops, authorize orders and successfully deliver, rather than merely discuss trade?
  Compare `shopsOpened`, `ordersPlaced`, `deliveries`, ordinary trades and spent/earned coins. Inspect
  blocked attempts, expired orders and unspent deposits, not just total money moved.
- Do hobbies and invitations spread beyond the cook? Inspect each resident's activity history,
  `hobbiesEnjoyed`, `invitationsAccepted/Declined/Missed`, `kitsUsed`, satisfaction, raw meals and
  starvation. A higher satisfaction score alone is not proof of reciprocal relationships.
- Do majorities fund and maintain shared services? Inspect `proposalsPassed/Rejected`, `civicCompleted`,
  `civicWages`, `maintenance`, public balances and `healthRestored`, alongside food/fuel use. A funded
  but unfinished project or an inactive clinic is a result worth reporting.

Use public research batch reports, bounded records and daily summaries. Report all five started
members including pauses; aggregate completed members only. Scripted demos and fake-provider tests
verify mechanics and conservation, not spontaneous model adoption. Additional provider latency,
limits, persistence after deployment and live behavior must be measured in actual runs.

## Pause incident boundary

The historical fifth v6 member (`410eb3d4-3953-4877-ba92-aea3eb3af6ac`) failed at `thread/start`, before
any Reed model turn, on request `b29303c0-d9c4-48ed-bfa5-78afb6364d0d`. Runtime logs confirm a generic
RPC rejection and no observed OOM kill. The old binary retained neither numeric RPC category nor
upstream detail; exact cause cannot be reconstructed. Railway metrics/logs did not establish one.

v0.7 classifies a narrow internal-error/startup signature as transient only for `thread/start`, using
standard internal-error code -32603 and recognized temporary messages. Existing two automatic
retries and twelve total extras apply, with teardown before retry, frozen inputs and linked failures.
Known auth/quota/rate-limit/memory/storage failures and unknown/invalid rejections pause. Raw provider
messages, credentials and filesystem paths never enter public diagnostics. Owner recovery is an
explicit fresh-connection retry; this release cannot retroactively prove that the original cause is fixed.
