# Penalty Wahala - design

Date: 8 Oct 2026. Status: approved in conversation section by section; this
document awaits the owner's review before an implementation plan is written.

## 1. Why it exists

Two jobs, both named by the owner:

- **Growth.** Every match ends in a link worth sending. People who open a
  challenge from WhatsApp or X meet Soccerwizard through it.
- **Retention.** A daily keeper and a streak give existing readers a reason to
  come back every day.

It is a free game with no stakes. Nothing inside it is a bet, a booking code
or a price.

Success looks like: challenge links opened from WhatsApp and X, those visitors
clicking through to the predictions, and players returning for the daily
keeper on consecutive days. The tracking in section 6 measures exactly these.

## 2. Scope

**Release 1 (this spec):** the 1v1 challenge link, the daily Wizard Keeper
with a streak, the tips card into Soccerwizard, sharing to WhatsApp and X.

**Release 2 (not in this spec):** a club fan-war weekly table, built only if
release 1 shows people playing.

**Never:** accounts for the game, coins, tournaments, stakes of any kind.

## 3. How a match plays

### The goal and the keeper

The goal is six spots: left, middle and right, each low or high. A keeper
dives to one spot.

### Taking a shot

1. Tap a spot to aim. A power bar starts to sweep.
2. Flick up on the ball to strike. The flick stops the bar; a lazy flick
   (short or slow swipe) stops it lower. The swipe only times the shot - it
   never sets direction, so a cheap phone or a laggy screen cannot send the
   ball somewhere the player did not aim.
3. Where the bar stops decides the strike:
   - **Green zone:** on target at full pace.
   - **Over the top:** a high shot sails over; a low shot hits the bar. Both
     miss whatever the keeper does.
   - **Weak:** on target but slow.
4. The keeper's dive decides the rest:
   - Same spot as the shot: saved.
   - A neighbouring spot (one step left/right, or the other height in the
     same column): saves a weak shot only.
   - Anywhere else: goal.

Exact zone widths and the bar's speed are tuning values in `lib/penalty.js`,
set during the build by play-testing on a phone, not fixed here.

### Saving

Tap the spot to dive to. The shot then comes. No timing; it is a guess.

### The 1v1 challenge

1. The challenger plays a full match against the computer: five shots (each
   with a spot and a power result) and five dives. Their five shots and five
   dives are stored on the server.
2. They get a link, `/p/<id>`, and share it.
3. The friend opens it and plays the other half. Kicks alternate like a real
   shootout: the friend shoots against the challenger's stored dive, then dives
   against the challenger's stored shot, and so on.
4. Level after five each: sudden death, one kick each, using further stored
   picks. The challenger stores three extra shots and three extra dives for
   this when they play. Still level after three rounds: a draw.
5. Both see the final score. The challenger sees "Ada beat you 4-3" the next
   time they open the game on the same device.

A challenge expires 24 hours after it is created if the friend has not
started it. A started challenge can be finished after that.

### The daily Wizard Keeper

- Shooting only: five shots, about 30 seconds.
- Everyone faces the same keeper on the same day. The dives are derived on the
  server from a secret key and the Lagos date, and change at Lagos midnight.
- Result: the score out of five, "better than N% of players today", the
  streak, and a share line such as `Wizard Keeper 8 Oct: ⚽⚽❌⚽⚽ 4/5`.
- One counted go per device per Lagos day. A second go is allowed for fun but
  is not counted and does not move the streak.

The streak counts consecutive Lagos days with a counted go, kept on the
device.

### After any match

A card: "The wizard's real picks today", showing today's pick of the day
(teams, tip, percentage) from the site's own payload, and a button "See all
predictions" to the home page.

## 4. Architecture

A separate page on the existing site. The main app (`public/index.html`) is
not changed except for the entry points in release step 2.

### Files

| File | Job |
| --- | --- |
| `public/penalty.html` | The game page: inline SVG pitch, keeper, ball; one script; dark and gold. Under 100KB. |
| `lib/penalty.js` | The rules as pure functions: power zones, the save rule, scoring, sudden death, daily dives from a key and a date. Used by the API and the tests. |
| `api/penalty.js` | One API file for every game call (below). |
| `api/p.js` | Server-rendered challenge page for `/p/<id>`, with WhatsApp and X preview tags, following `api/s.js`. |
| `sql/penalty.sql` | The two tables. |
| `vercel.json` | Clean URL for `/penalty`, rewrite for `/p/:id`. |

### Tables (Supabase, through PostgREST like the rest)

`penalty_matches`

- `id`: six characters from an unambiguous alphabet.
- `created_at`, `expires_at` (created + 24h).
- `challenger_name`, `challenger_device`.
- `challenger_shots`, `challenger_dives`: eight each (five plus three for
  sudden death), stored as JSON. Never returned to the friend before the
  matching kick has been played.
- `friend_name`, `friend_device`, `friend_kicks`: the kicks as played, in order.
- `result`: null until finished, then the score and the winner.

`penalty_daily`

- `day` (Lagos date), `score` (0-5), `n` (count). One row per day and score.
  This is all "better than N%" needs. No names, no devices.

Row-level security on, no policies, server key only - the same rule as the
existing tables.

### API (`api/penalty.js`)

- `POST create`: the challenger's finished match vs the computer. Validates
  every field, stores it, returns the id and the challenger's own score.
- `GET match?id=`: public state of a challenge - names, kicks played so far,
  result. Never any unplayed pick.
- `POST kick`: the friend's next kick (a shot or a dive, in turn order). The
  server judges it against the stored pick and returns the outcome; for a dive
  it also reveals the stored shot that was just taken. Refuses a kick out of
  turn, a repeat, or one on an expired unstarted match.
- `POST daily`: one shot against today's keeper. The server judges it. On the
  fifth shot it records the score once per device per day and returns the
  percentage.

The friend's half is about ten small calls, each hidden behind the kick
animation.

### Identity

No sign-in. A nickname typed once and kept on the device (trimmed, at most 16
characters, letters, numbers and spaces). An anonymous random device id in
local storage, used for the one-a-day rule and to show the challenger their
result.

### Limits

The site's existing rate limiter (`rlHit`) caps match creation and kicks per
IP, so the tables cannot be flooded.

## 5. Sharing and the funnel

### The challenge link

- Server-rendered so the preview reads "Tobi scored 4/5. Can you beat him?"
  with a card image (pitch, score, the wizard keeper, dark and gold). Tags for
  both WhatsApp (Open Graph) and X (`summary_large_image`).
- Opening it goes straight to "Tobi challenges you", asks for a nickname once,
  then kick-off. No menu, no sign-in.
- Expired and unstarted: "This challenge ran out" and a button to start one.
- Finished: shows the final score to anyone who opens it.
- The card image is drawn on the server, the same way the site's share card is.

### Share buttons after a match

- Two equal buttons: **WhatsApp** and **X**. Then Copy link and the system
  Share sheet.
- X opens a ready post ending "via @SoccerWizardhq".
- Wording:
  - Won a challenge: "I beat you 4-3 on Penalty Wahala 😤 Your turn: <link>"
  - New challenge: "I scored 4/5. Bet you can't save it: <link>"
  - Daily: "Wizard Keeper 8 Oct: ⚽⚽❌⚽⚽ 4/5 via @SoccerWizardhq <link>"

### Into Soccerwizard and back

- The tips card after every match (section 3).
- Release step 2 adds a "Penalty Wahala" item to the site menu and one line
  under Your slips.

## 6. Tracking

Vercel Analytics events: challenge created, challenge opened, challenge
finished, daily played, tips card clicked, share tapped (with the channel:
WhatsApp, X, copy, system).

## 7. Errors

- **Connection drops mid-match:** each kick is stored as it is played;
  reopening the link resumes at the next kick.
- **Server slow or down:** "Can't reach the pitch, try again" with a retry
  button. A result is never invented.
- **Bad or expired link:** a clear page with "Start your own challenge".
- **Nicknames:** cleaned as above and always rendered as text, never as HTML.
- **Reduced motion:** kicks resolve without the swoops; the power bar still
  works.

## 8. Testing

- `lib/penalty.js`: power zones, the save rule (same spot, neighbour, weak),
  scoring, sudden death, the draw after three extra rounds, daily dives the
  same for one Lagos date and different the next.
- `api/penalty.js`: an unplayed pick is never returned early; a kick cannot be
  played twice or out of turn; an expired unstarted match refuses; the daily
  score counts once per device per day; the rate limits hold.
- A headless browser plays a full challenge from both sides and one daily go,
  at 360px and laptop width, before the owner sees it.

## 9. Rollout

1. **Hidden:** live at `/penalty` with no link from the site. The owner and a
   few friends play it.
2. **Live:** after the owner's yes, the menu item and the Your slips line go
   in, and it is announced on X.
3. **Release 2:** the fan-war table, if release 1 is played.

### Needs the owner's yes before the build goes live

- A new Vercel environment variable: the secret key for the daily keeper's
  dives.
- Running `sql/penalty.sql` in Supabase.
