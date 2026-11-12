# crumbz

**where are we eating today?**

A little food diary that turns a pile of saved Google Maps spots into today's plan, then keeps a stamped passport of the places you actually went.

Built for the Vibe Coding Challenge with the **Foodie** persona in mind: someone who has saved hundreds of interesting spots but never figures out how to actually go.

---

## The problem

The spreadsheet has 4,922 saved places. 2,199 of them are food spots, and 607 are on a "Want to go" list that never gets shorter. More saving doesn't help. What's missing is a decision: *which one, today?* And once you've been, there's nowhere to remember what you thought.

## What it does

1. **Landing page.** A *today's special* with a theme for each day of the week (taco tuesday, noodle wednesday, saturday brunch…): a want-to-go spot near home that fits the theme, the same all day, with an "another one" button. Below it are the cities your saves live in; tap one to plan a day there.
   **Plan my day for me** asks how you want to roam: *keep it in one city* (picks a nearby city with enough saves to cover breakfast through dinner, so every stop is in the same place) or *hop around nearby* (spots within 10 miles, across a few cities). Either way you can swap any stop or shuffle again.
2. **A short quiz where you can pick more than one answer.** What are the food plans today (morning coffee, lunch, a sweet treat, dinner, drinks, or the whole day)? Where will you be (around home and/or any number of cities)? How far from home? Somewhere new or old favorites? Any cravings for lunch or dinner? The craving options only show cuisines that actually exist for your answers, with counts.
3. **Your day.** Results are split into the parts of the day you picked, each with three options from your own saves (Google Maps and Yelp links included) and a "show 3 more" button. Tap "add to my day" on one per section and the itinerary bar at the top fills in. Save the day to your passport. If a section has too few matches, it loosens the filters and tells you which ones.
4. **I went!** Rate it (going back / fine / not for me), write down what you ordered and a note to future you. *Thunk*, it gets stamped.
5. **Pinchy & the starfish.** Pinchy the crab scuttles along the bottom of the screen (sometimes toward your cursor) and reacts to what you pick ("dessert is a food group 🍡"), cheers when you stamp a spot, and chats when you click him. The starfish in the logo climbs out when you arrive, follows you around, hops onto whatever you pick, and swims back to the logo when you go idle. Hand-drawn waves roll along the bottom of every screen, swell when your mouse gets close, and splash when you pick something. Pinchy and the starfish can be hidden from the footer, and everything holds still for anyone with reduced motion turned on.
6. **My passport.** Every visit is a stamp with its city, date, rating and note. Saved days show up as little tickets you can check off stop by stop. There's also a saved-for-later tab, and a search to stamp places you went before using the app.

Notes and stamps are saved in your browser (localStorage), so each person who opens the site gets their own passport.

## Run it

No build step and no dependencies. Open `index.html` in a browser, or:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Put it online (GitHub Pages)

1. Push this folder to a GitHub repo.
2. In the repo, go to **Settings → Pages → Build and deployment**, set **Source: Deploy from a branch**, then **Branch: `main` / root**, and save.
3. After about a minute the site is live at `https://<your-username>.github.io/<repo-name>/`.

## Updating the data

`data/spots.js` is generated from the spreadsheet:

```bash
pip install openpyxl
python3 scripts/build_data.py data/maps.xlsx data/spots.js
```

The script keeps only food spots (Restaurant / Bar, Cafe / Bakery / Dessert), drops anything saved on a kids' list or mislabeled as food, and guesses cuisine tags from each name with keyword rules (about two-thirds of spots get a tag).

## Project structure

```
index.html            all four screens (landing, quiz, day plan, passport) + visit dialog
style.css             coastal matcha: #002A00 green, matcha text, coral buttons + panels, chartreuse selections; Fraunces + Zen Maru Gothic
buddies.js            pinchy the crab (walking, speech bubbles, quiz reactions), the wandering logo starfish, the tide
assets/               starfish + crab drawings
app.js                quiz logic, per-meal filtering, day itinerary, visits/notes, passport
data/spots.js         2,199 food spots (generated)
data/maps.xlsx        the original spreadsheet
scripts/build_data.py spreadsheet → spots.js
```

## Demo notes

**What I left out on purpose**
- A real map. The data has no coordinates, so a map would mean geocoding 2,000+ addresses. Google Maps links get you there in one tap.
- Ratings, photos, hours and prices. That would need the Yelp or Google Places APIs (keys, a backend, cost). The Yelp link covers it for now.
- Accounts and sync. localStorage keeps it a static site anyone can open.
- Everything for the Busy Mom persona: the ~2,600 non-food places (parks, beaches, kids' activities), plus food spots that were only saved on kids' lists and a few stores, farms and attractions Google mislabeled as food. That's a different app.

**With another hour**
- Geocode addresses, then add "near me right now" using the phone's location instead of distance from home.
- "Open now" filtering via Google Places.
- Export and import your passport so notes move between devices.
- Order each day's stops by distance so the route makes sense, and add a share link for a planned day.
