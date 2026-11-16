# Where OWLT's numbers come from

Every number on the site is either **computed in the browser** from published methods, **built once** from a catalogue into `data/catalog/`, or **fetched every six hours** by `scripts/refresh.mjs` into `data/`. Each page says which, and fetched data always shows its age.

## Built once: the catalogues (`tools/build_catalog.py`)

Download these into one folder and run `python3 tools/build_catalog.py <folder>`. Only needed when a source catalogue changes.

| File in the folder | Source | Licence |
|---|---|---|
| `hyg/hyg.csv` | HYG database v4.1 (`hygdata_v41.csv`), David Nash — https://www.astronexus.com/projects/hyg, repository https://codeberg.org/astronexus/hyg | CC BY-SA 4.0 |
| `ngc/NGC.csv` | OpenNGC, Mattia Verga — https://github.com/mattiaverga/OpenNGC (`database_files/NGC.csv`) | CC BY-SA 4.0 |
| `oec/systems.xml.gz` | Open Exoplanet Catalogue, single-file copy — https://github.com/OpenExoplanetCatalogue/oec_gzip (`systems.xml.gz`) | MIT |
| `cel/con.lines.json`, `cel/con.json`, `cel/messier.json` | d3-celestial, Olaf Frohn — https://github.com/ofrohn/d3-celestial (`data/`) | BSD-3-Clause |
| `ne/land.json`, `ne/places.json` | Natural Earth 1:110m land and populated places — https://www.naturalearthdata.com/ (converted to GeoJSON) | Public domain |

**Share-alike.** Because HYG and OpenNGC are CC BY-SA 4.0, the derived files `data/catalog/sky.bin`, `local.bin`, `stars.json`, `galaxies.bin`, `galaxies.json` and `messier.json` are also CC BY-SA 4.0, credited to the sources above. The site's code is separate from this and is not covered by it.

What the build keeps:

- **sky.bin** — 25,791 stars to magnitude 7.5: position, apparent magnitude, colour. The sky as seen from Earth.
- **local.bin** — 102,604 stars within 2,000 light-years with a measured distance: position, distance (log-encoded), absolute magnitude, colour. The 3-D stars on the Ladder.
- **galaxies.bin** — 10,177 galaxies from OpenNGC with a distance: position, distance, type, magnitude, physical size, axis ratio, position angle. Distances are redshift-independent where OpenNGC has one, else the group's, else Hubble's law with H0 = 67.4.
- **stars.json** — every star with a proper name or Bayer letter (1,686), for labels, search and the Atlas.
- **exoplanets.json** — 5,370 planets with host, orbit, size, equilibrium temperature and a habitable-zone flag (Kopparapu et al. 2014 edges for the host's temperature and luminosity).
- **constellations.json**, **cities.json**, **earth.webp** (land, coastlines and city lights packed into three channels, lossless).

`solar.json`, `structures.json` (75 landmarks out to the edge of the observable universe), `data/papers/canon.json` (the landmark papers), `data/glossary.json` and `data/lost.json` are written by hand, each from the sources named inside them.

## Computed in the browser (`js/astro.js`, tested in `tests/astro.test.cjs`)

| Quantity | Method |
|---|---|
| Sun and Moon | Meeus, *Astronomical Algorithms* (2nd ed.), chapters 25 and 47; phases by root-finding on elongation |
| Planets and Pluto | JPL approximate Keplerian elements (Standish), 1800–2050 table |
| Galilean moons | Meeus chapter 44, low-accuracy theory |
| Earth's rotation | IAU 1982 GMST |
| Voyager 1 | Straight-line escape at 16.92 km/s pinned to NASA's instant for one light-day from Earth: 2026-11-18 10:16:07 UTC |
| Other escaping probes | Straight lines from published distances and speeds (marked ≈) |
| Cosmology | Flat ΛCDM, Planck 2018: H0 67.4 km/s/Mpc, Ωm 0.315, Ωr 9.2×10⁻⁵ |
| Milky Way spiral arms | Reid et al. 2019, ApJ 885, 131, log-spiral fits; Sun at 8.18 kpc (26,670 ly) |
| Star sizes | Luminosity from absolute magnitude, temperature from B−V (Ballesteros 2012) |
| ISS passes and ground track | SGP4 via satellite.js on CelesTrak elements, only when they are under a week old |

## Fetched every six hours (`scripts/refresh.mjs`)

| Output | Source | Terms |
|---|---|---|
| `data/papers/arxiv.json` | arXiv API — https://info.arxiv.org/help/api/ | Metadata CC0. One request per run, well under arXiv's one-request-per-three-seconds limit. "Thank you to arXiv for use of its open access interoperability." |
| `data/papers/digests.json` | `scripts/digest.mjs`, from the abstracts above | OWLT's own summaries, each linking to the paper |
| `data/news.json` | Spaceflight News API — https://api.spaceflightnewsapi.net/v4/docs/ — plus RSS from ESA, ESO, NASA, NOIRLab, Universe Today, Sky & Telescope | Headlines and short summaries, linked to the original |
| `data/launches.json` | Launch Library 2, The Space Devs — https://ll.thespacedevs.com/docs | Free tier (15 requests an hour); the job makes two per run |
| `data/spaceweather.json` | NOAA Space Weather Prediction Center — https://services.swpc.noaa.gov/ | US government work |
| `data/tle.json` | CelesTrak — https://celestrak.org/ | Public |
| `data/neo.json` | NASA/JPL SBDB close-approach API — https://ssd-api.jpl.nasa.gov/doc/cad.html | US government work |
| `data/apod.json` | NASA Astronomy Picture of the Day — https://science.nasa.gov/apod/ (read from the page, since NASA moved APOD there in 2026; the api.nasa.gov feed is used only when its answer passes the same checks) | Many APOD images are copyrighted; the site shows an image only when NASA lists no copyright holder, and links otherwise |
| `data/dsn.json` | NASA Deep Space Network Now — https://eyes.nasa.gov/dsn/ | US government work |
| `data/status.json` | The job itself | Which sources worked on the last run |

A source that fails keeps its last good file and is marked failed in `data/status.json`; the job only fails if every source fails. `tests/data.test.mjs` checks every file's shape before anything is deployed.

### The seed snapshots

Until the first scheduled run, `data/news.json`, `data/launches.json` and `data/apod.json` hold a snapshot taken by hand on 15–16 November 2026 from Spaceflight Now, NASA, ESO, rocketlaunch.live and APOD, and say so in their `source` field. Space weather, close approaches, orbital elements and the DSN start empty and say so on the page.
