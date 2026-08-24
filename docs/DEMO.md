# Khairiyat — Demo

The build exists to serve this script. If a feature doesn't appear here, it is optional.

## Opening (20 seconds, no slides)

> "My mother lives alone in Patiala. I live in Bangalore. For the next ninety days I am
> not allowed to travel to her.
>
> Normally that gap gets papered over by somebody driving down on Sunday and looking in
> the pill box. Take that away and the family is flying blind. Every pill reminder app
> ever built notifies the person who already forgot — and nobody else ever finds out.
> Medication adherence isn't a reminder problem. It's a visibility problem, and a
> gathering ban is what makes that undeniable."

Do not explain the architecture. Show the tap.

**On the challenge statement:** do not claim the app was built for the pandemic — a
judge will check the commit history. Claim the opposite and it lands harder: the
constraint did not change the design, it removed the fallback the design was quietly
competing with. The one thing it genuinely added is Beat 6. `docs/PRODUCT.md` opens
with the four-line mapping if anyone asks for it.

## Beat 1 — The tap (the hero)

Hold up a real pill box with a Khairiyat sticker on it. Tap the phone against it with
the app fully closed.

The app launches, the ring fills, the haptic fires, the time appears in large numerals.

> "That's the whole interaction for my mother. No app to open, no password, no menu.
> She taps her phone against the box she's already holding."

**Fallback if NFC fails:** open the app, scan the QR on the same sticker, same result.
Say it as a designed feature — *"the same token, two ways to read it"* — not as a save.

## Beat 2 — The other side of the country

Hold up the second phone (the caregiver account, mirrored or held to the audience). The
dose that was just confirmed is already there. Live.

> "That's my brother's phone. He didn't refresh anything."

## Beat 2b — The phone that was never open

Only run this if a dose is already sitting unconfirmed and the sweep is due. Do not
stall the room waiting for it; if it has not arrived by the end of Beat 3, drop it and
say the line under **Expected questions** instead.

The alert arrives on the caregiver's lock screen with the app closed.

> "Realtime only works if someone is looking. This one nobody was looking at. An hour
> after a dose goes unconfirmed, the family gets told — the phone that already forgot
> is never the phone we notify."

**One phone only:** the sweep runs server-side every fifteen minutes, so the alert lands
on whichever device is signed in as a caregiver. Switch accounts before the beat, not
during it.

## Beat 3 — The state nobody else models

Point at an unconfirmed dose on the dashboard.

> "Notice what this does *not* say. It doesn't say she missed her dose — we don't know
> that. She may have taken it and not tapped. So it says there's no confirmation, and it
> hands it to a human."

Tap it. Show the three outcomes and the Call button. Tap **Couldn't reach her**.

> "Every other adherence app guesses, gets it wrong, and trains the family to ignore it.
> We treat uncertainty as a real state — and over weeks that tells us whether she forgets
> pills or just forgets to tap. Those are different problems."

This is the beat that wins the technical argument. Do not rush it.

## Beat 4 — What the data becomes

Open member detail. Read the drift sentence out loud:

> "The evening dose has moved forty minutes later over the last three weeks."

Then the refill runway:

> "And she has four days of Amlodipine left. In India, running out is a bigger cause of
> missed doses than forgetting is. Nobody in the family knew either of these things."

## Beat 5 — Simple Mode (10 seconds)

Switch the first phone to the parent's view.

> "And this is everything my mother ever sees. Today's doses. Nothing else to get lost
> in."

## Beat 6 — The thing the ban actually took away (20 seconds)

Back on the caregiver dashboard. Point at the check-in card.

> "Every dose on this screen is confirmed. She is, by this app's own measure, doing
> fine. And nobody in this family has spoken to her in six days.
>
> Doses were never the point. They were a proxy for someone paying attention, and the
> proxy held up as long as you could turn up on a Sunday. For ninety days you can't. So
> the app counts the call, because the call is now the visit."

Tap **Call Sunita**. The card resets to zero days.

> "It's a phone call. That's the whole feature. It just needed something to notice."

## Close

> "The sticker is a twenty-five rupee NTAG. That's the product we'd ship — Khairiyat
> pill box tags, in the box, with the app free. React Native, so iOS is a build target,
> not a rewrite."

## Expected questions

**"Isn't this just another medication reminder app?"**
Every other one closes the loop with the person who forgot. Ours closes it with the
family. The reminder is the commodity; the routing and the shared record are the product.

**"What if she takes the pill and doesn't tap?"**
That's the `unconfirmed` state you just saw — we never assert a miss. And because we
track resolution outcomes separately, we learn the difference between a missed dose and a
missed tap, which nothing else does.

**"What if her phone has no signal when she taps?"**
The tap is written to the phone with the time it happened and replayed when signal comes
back — and the server records it against the moment of the tap, not the moment of the
sync. Otherwise a dose taken at 08:05 and synced at six in the evening lands in the
evening window and quietly corrupts the drift number. Losing a tap is the worst failure
this product has: she took the pill and her family is told nothing.

**"Does anyone actually get told, or do they have to open the app?"**
A sweep runs server-side every fifteen minutes and pushes to the caregivers' devices —
never the care recipient's. Realtime covers the case where someone is already watching;
push covers the case that matters more, where nobody is.

**"What if her phone has no NFC?"**
QR on the same sticker, in-app scanner. Same token, same code path. And the big button in
Simple Mode always works.

**"Why would an elderly person install an app at all?"**
One-time setup by the family, zero-time use by the parent. After that first install she
never opens it herself — the tag launches it.

**"What's actually hard here?"**
Modelling uncertainty instead of guessing, and deriving behavioural signal — drift and
runway — from nothing but tap timestamps. The dashboard is the easy part.

**"How is this a business?"**
Physical tags are a consumable SKU with a natural attach rate to pharmacies and
diagnostic chains. The app is the free surface; the sticker is the product.

**"What's next?"**
iOS, caregiver rotation for larger families, and pharmacy refill integration triggered by
the runway number.

## Do not say

- Anything about WhatsApp. It is not in the build.
- "AI-powered". Nothing here needs an LLM and claiming one invites a question you'd lose.
- Any feature on the WON'T list in `docs/PRODUCT.md`.
