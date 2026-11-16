# OWLT · one-way light time

A personal astronomy site organised by how long light takes to reach you. Everything you can see already happened; OWLT puts each thing at the moment its light set out, from the ground under your feet (nanoseconds) to the cosmic microwave background (13.8 billion years).

**Live at https://abhinavsingh1176.github.io/Astronomy/**

It is a static site: plain HTML, CSS and JavaScript, no build step and no server. A GitHub Actions job refreshes the outside data every six hours and republishes the site to GitHub Pages.

## The pages

| Page | What it is |
|---|---|
| `index.html` · **Today** | The light arriving now on one strip, Voyager 1's light-day, today's paper, tonight's sky, the next launch, space weather, news, a mission, a place, a slide and the picture of the day, your log, and your light-echo star (the star whose light set out when you were born). Sources and licences at the bottom. |
| `ladder.html` · **The Ladder** | One continuous zoom from Earth to the edge of the observable universe, every object at its real position for this moment where one is known. Fourteen rungs, a guided tour, search, close-up models for stars, planetary systems, galaxies, clusters, nebulae, black holes, pulsars and quasars. |
| `papers.html` · **Reading Room** | New papers broken down (the question, what they did, what they found, why it matters, what to read with care), the 37 papers that made the field, and a glossary. |
| `dispatch.html` · **Dispatch** | News by desk and by agency, a split-flap departures board of launches, recent launches, close approaches. |
| `deck.html` · **Flight Deck** | An analogue console of live quantities: clocks, dials, annunciators, a ground-track scope with day and night, the Deep Space Network, escaping probes, a geomagnetic chart recorder. |
| `sky.html` · **Observatory** | A planisphere of the sky above you for any time in the next day, and tonight's almanac: twilight, the Moon, planets in a dark sky, space-station passes, meteor showers, something to look at. |
| `gallery.html` · **Gallery** | A slide projector with seven trays, one for each phase of exploration from Friendship 7 to Artemis II: 81 pictures from the NASA Image and Video Library with NASA's own records, cycling every nine seconds. |
| `games.html` · **Games** | Three puzzles a day, the same for everyone: Starword (a five-letter space word in six tries), Constellation (name a star figure; each miss says how far and which way), Light Time (tune a dial to how long the light has been travelling). Streaks stay in your browser. |
| `atlas.html` · **Atlas** | Every place the site knows (7,289) as a searchable, sortable catalogue with a card for each. |
| `lost.html` · **The Lost** | Missions that failed, ended early, never flew or cost lives, from the official record. |
| `log.html` · **Ship Log** | What you have found and the rumours it points to, as a map. Kept in your browser only. |

Press `/` or Ctrl/Cmd-K anywhere to search everything.

## Run it on your computer

```
python3 -m http.server 8000
```

then open http://localhost:8000. (Opening the files directly from disk does not work: browsers stop pages on disk from reading their data files.)

## Put it on the web with GitHub Pages

1. Create an empty repository on GitHub (for example `owlt`), with no README.
2. From this folder:
   ```
   git remote add origin https://github.com/<you>/owlt.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**. (The run started by the push in step 2 finishes with a warning until this is set; nothing is published until then.)
4. **Actions → Refresh and publish → Run workflow** to fetch the first day's data and publish. After that it runs by itself every six hours (and on every push).

Optional, under **Settings → Secrets and variables → Actions**:

| Name | Kind | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | secret | Paper digests are written by Claude from each abstract and checked before they are kept (every number must appear in the abstract; no hype). Without it, digests are assembled from the abstract's own sentences and marked as automatic. Make the key at https://platform.claude.com under **Settings → API keys**; API use is billed to the Console account, separately from a Claude subscription. |
| `ANTHROPIC_WORKSPACE_ID` | variable | Only for a key that was not made inside a workspace: the workspace's ID (`wrkspc_…`) from the Console's **Workspaces** page. A key made inside a workspace needs nothing here; if the log says the request must include `anthropic-workspace-id`, this is what is missing. |
| `NASA_API_KEY` | secret | Used only when the APOD page itself cannot be read and the job falls back to api.nasa.gov. Without it the shared `DEMO_KEY` is used. Free at https://api.nasa.gov. |
| `DIGEST_MODEL` | variable | Model for digests. Default `claude-sonnet-5-5`. |
| `DIGESTS_PER_DAY` | variable | New digests a day. Default 3, maximum 10. |

## How the daily data works

`scripts/refresh.mjs` fetches arXiv, news (Spaceflight News API plus ESA, ESO, NASA, NOIRLab, Universe Today and Sky & Telescope), Launch Library 2, NOAA space weather, CelesTrak orbital elements, JPL close approaches, APOD, the Deep Space Network and, once a week, the Gallery's pictures from the NASA Image and Video Library. Each source is independent: one that fails keeps its last good file and is marked in `data/status.json`. Then `scripts/digest.mjs` writes the day's digests, `tools/build_index.mjs --strict` rebuilds search and the link graph, and `tests/data.test.mjs` checks every file before the commit and deploy.

To try the whole pipeline without the internet:

```
node tests/mock-server.mjs 9911 &
OWLT_MOCK=http://127.0.0.1:9911 node scripts/refresh.mjs
OWLT_MOCK=http://127.0.0.1:9911 ANTHROPIC_API_KEY=test node scripts/digest.mjs
```

The mock answers in each service's real format, fails one feed on purpose, and has the mock Claude break the digest rules on its first try so the retry path runs. Run it in a copy of the folder if you do not want the mock data in your working tree.

## Tests

```
node tests/astro.test.cjs     # ephemeris, cosmology, every computed value the pages print, against published figures
node tests/data.test.mjs      # every data file has the shape the pages expect
node tools/build_index.mjs --strict   # every link between pages, papers, terms and places resolves
node tools/build_games.mjs --check    # the Games' data matches the catalogues
python3 -m http.server 8765 & node tests/qa.mjs   # every page in Chromium at desktop and phone width (needs Playwright)
node tests/overlap.mjs                # no text overlaps other text, at five widths
node tests/games.mjs http://127.0.0.1:8765/   # plays the day's three puzzles, a win and a loss each
```

## Adding to it

Hand-written content lives in plain JSON:

- `data/papers/canon.json`: landmark papers (`one`, `q`, `how`, `found`, `why`, `since`, `terms`, `links`)
- `data/glossary.json`: terms used by the digests and the canon
- `data/lost.json`: the memorial archive
- `data/catalog/structures.json`: landmarks beyond the Solar System, from star clusters to the CMB
- `data/catalog/solar.json`: the Solar System's bodies and spacecraft
- `data/gallery-trays.json`: the Gallery's trays, each a list of NASA image ids with any corrections to NASA's dates or captions (the job fetches the rest)
- `data/starword.json`: Starword's answers, each with what you learn when you finish; guesses are checked against `data/words5.txt`

The Constellation and Light Time puzzles are built from the catalogues by `node tools/build_games.mjs`.

Links between things are ids like `obj:europa`, `canon:hubble-1929`, `term:redshift`, `lost:columbia`, `paper:2611-13257`. After editing, run `node tools/build_index.mjs --strict`: it fails if any link points nowhere.

The star, galaxy and exoplanet catalogues are built by `tools/build_catalog.py` from the sources in `docs/DATA.md`.

## Privacy

No analytics, no cookies, no accounts. The Observatory guesses your location from your time zone; if you ask it to use your device's location, the coordinates stay in your browser. The Ship Log, your Games streaks and the birth date for your light-echo star are kept in your browser's local storage and never leave it.

## Credits and licences

Data sources and their licences are listed in `docs/DATA.md` and at the bottom of the Today page. The derived star and galaxy catalogue files are CC BY-SA 4.0 because their sources are. three.js (MIT), satellite.js (MIT) and the four typefaces, including Courier Prime for the typed records (SIL Open Font License), are in `vendor/` and `fonts/` with their licence files. Starword's word list comes from SCOWL (`data/words5.LICENSE`). Choosing a licence for the site's own code is up to you; until you add one, the default is all rights reserved.
