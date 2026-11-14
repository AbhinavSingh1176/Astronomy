#!/usr/bin/env python3
"""
OWLT catalogue build.  Turns the public source catalogues into the compact files the
site loads from data/catalog/.  Re-run only when a source catalogue changes.

    python3 tools/build_catalog.py <src-dir>

<src-dir> must contain (download URLs are in docs/DATA.md):
    hyg/hyg.csv                HYG v4.1                     CC BY-SA 4.0
    ngc/NGC.csv                OpenNGC                      CC BY-SA 4.0
    oec/systems.xml.gz         Open Exoplanet Catalogue     MIT
    cel/con.lines.json, cel/con.json, cel/messier.json      d3-celestial, BSD-3
    ne/land.json, ne/places.json                            Natural Earth, public domain
"""
import csv, gzip, json, math, os, re, struct, sys, unicodedata, zlib
import xml.etree.ElementTree as ET

SRC = sys.argv[1] if len(sys.argv) > 1 else 'src'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'catalog')
os.makedirs(OUT, exist_ok=True)
LY_PER_PC = 3.2615637769

def fnum(x):
    try:
        v = float(x)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None

def slug(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

def dump(name, obj):
    p = os.path.join(OUT, name)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    print(f"  {name:<24}{os.path.getsize(p)/1024:8.1f} KB")

def dumpbin(name, buf):
    with open(os.path.join(OUT, name), 'wb') as f:
        f.write(buf)
    print(f"  {name:<24}{len(buf)/1024:8.1f} KB")

# ───────────── cosmology (flat ΛCDM, Planck 2018) — same model as js/astro.js ─────────────
H0, OM, OR_ = 67.4, 0.315, 9.2e-5
OL = 1.0 - OM - OR_
C_KMS = 299792.458

def E(z):
    return math.sqrt(OR_*(1+z)**4 + OM*(1+z)**3 + OL)

def comoving_mly(z, n=400):
    if z <= 0: return 0.0
    u1 = math.log1p(z); h = u1/n; s = 0.0
    for i in range(n+1):
        zz = math.expm1(i*h)
        s += (1 if i in (0, n) else 4 if i % 2 else 2)*(1+zz)/E(zz)
    return (C_KMS/H0)*s*h/3*LY_PER_PC

# ───────────────────────── 1. stars (HYG v4.1) ─────────────────────────
print("stars · HYG v4.1")
GREEK = {'Alp':'α','Bet':'β','Gam':'γ','Del':'δ','Eps':'ε','Zet':'ζ','Eta':'η','The':'θ','Iot':'ι','Kap':'κ',
         'Lam':'λ','Mu':'μ','Nu':'ν','Xi':'ξ','Omi':'ο','Pi':'π','Rho':'ρ','Sig':'σ','Tau':'τ','Ups':'υ',
         'Phi':'φ','Chi':'χ','Psi':'ψ','Ome':'ω'}
SUP = str.maketrans('0123456789', '⁰¹²³⁴⁵⁶⁷⁸⁹')
GFULL = {'Alp':'Alpha','Bet':'Beta','Gam':'Gamma','Del':'Delta','Eps':'Epsilon','Zet':'Zeta','Eta':'Eta','The':'Theta','Iot':'Iota',
         'Kap':'Kappa','Lam':'Lambda','Mu':'Mu','Nu':'Nu','Xi':'Xi','Omi':'Omicron','Pi':'Pi','Rho':'Rho','Sig':'Sigma','Tau':'Tau',
         'Ups':'Upsilon','Phi':'Phi','Chi':'Chi','Psi':'Psi','Ome':'Omega'}
GEN = dict(x.split(':') for x in ('And:Andromedae,Ant:Antliae,Aps:Apodis,Aqr:Aquarii,Aql:Aquilae,Ara:Arae,Ari:Arietis,Aur:Aurigae,Boo:Bootis,'
  'Cae:Caeli,Cam:Camelopardalis,Cnc:Cancri,CVn:Canum Venaticorum,CMa:Canis Majoris,CMi:Canis Minoris,Cap:Capricorni,Car:Carinae,'
  'Cas:Cassiopeiae,Cen:Centauri,Cep:Cephei,Cet:Ceti,Cha:Chamaeleontis,Cir:Circini,Col:Columbae,Com:Comae Berenices,CrA:Coronae Australis,'
  'CrB:Coronae Borealis,Crv:Corvi,Crt:Crateris,Cru:Crucis,Cyg:Cygni,Del:Delphini,Dor:Doradus,Dra:Draconis,Equ:Equulei,Eri:Eridani,'
  'For:Fornacis,Gem:Geminorum,Gru:Gruis,Her:Herculis,Hor:Horologii,Hya:Hydrae,Hyi:Hydri,Ind:Indi,Lac:Lacertae,Leo:Leonis,'
  'LMi:Leonis Minoris,Lep:Leporis,Lib:Librae,Lup:Lupi,Lyn:Lyncis,Lyr:Lyrae,Men:Mensae,Mic:Microscopii,Mon:Monocerotis,Mus:Muscae,'
  'Nor:Normae,Oct:Octantis,Oph:Ophiuchi,Ori:Orionis,Pav:Pavonis,Peg:Pegasi,Per:Persei,Phe:Phoenicis,Pic:Pictoris,Psc:Piscium,'
  'PsA:Piscis Austrini,Pup:Puppis,Pyx:Pyxidis,Ret:Reticuli,Sge:Sagittae,Sgr:Sagittarii,Sco:Scorpii,Scl:Sculptoris,Sct:Scuti,'
  'Ser:Serpentis,Sex:Sextantis,Tau:Tauri,Tel:Telescopii,Tri:Trianguli,TrA:Trianguli Australis,Tuc:Tucanae,UMa:Ursae Majoris,'
  'UMi:Ursae Minoris,Vel:Velorum,Vir:Virginis,Vol:Volantis,Vul:Vulpeculae').split(','))
def bayer_full(b, con):
    part = b.split('-')
    return f"{GFULL.get(part[0], part[0])}{'' if len(part) == 1 else ' ' + part[1]} {GEN.get(con, con)}
def bayer_label(b, con):
    part = b.split('-')
    return f"{GREEK.get(part[0], part[0])}{'' if len(part) == 1 else part[1].translate(SUP)} {con}"

stars = []
with open(os.path.join(SRC, 'hyg/hyg.csv'), newline='', encoding='utf-8') as f:
    for r in csv.DictReader(f):
        if r['id'] == '0': continue
        ra, dec, mag = fnum(r['ra']), fnum(r['dec']), fnum(r['mag'])
        if ra is None or dec is None or mag is None: continue
        dist = fnum(r['dist']); ci = fnum(r['ci'])
        stars.append(dict(ra=ra*15.0, dec=dec, mag=mag, ci=0.65 if ci is None else max(-0.4, min(2.0, ci)),
                          ly=(dist*LY_PER_PC if dist and 0 < dist < 99999 else None), am=fnum(r['absmag']),
                          proper=r['proper'].strip(), bayer=r['bayer'].strip(), flam=r['flam'].strip(),
                          con=r['con'].strip(), sp=r['spect'].strip(), hip=r['hip'].strip(), hd=r['hd'].strip(),
                          lum=fnum(r['lum'])))

# 1a. the sky from Earth, V <= 7.5:  [ra u16][dec i16][mag i16 ×100][B−V i16 ×1000]
sky = sorted((s for s in stars if s['mag'] <= 7.5), key=lambda s: s['mag'])
buf = bytearray()
for s in sky:
    buf += struct.pack('<Hhhh', int(round(s['ra']/360*65535)) & 0xFFFF, int(round(s['dec']/90*32767)),
                       int(round(s['mag']*100)), int(round(s['ci']*1000)))
dumpbin('sky.bin', buf)

# 1b. stars in three dimensions, d <= 2000 ly:  [ra u16][dec i16][dist u16, log scale][absmag i8 ×8][B−V i8 ×60]
DMAX = 2100.0
loc = sorted((s for s in stars if s['ly'] and s['ly'] <= 2000 and s['am'] is not None), key=lambda s: s['ly'])
buf = bytearray()
for s in loc:
    u = int(round(65535*math.log(max(1.0, s['ly']))/math.log(DMAX)))
    buf += struct.pack('<HhHbb', int(round(s['ra']/360*65535)) & 0xFFFF, int(round(s['dec']/90*32767)), u,
                       max(-128, min(127, int(round(s['am']*8)))), max(-128, min(127, int(round(s['ci']*60)))))
dumpbin('local.bin', buf)

# 1c. the named-star table: every star with a proper name or a Bayer letter
tab = []; seen = set()
for s in sorted(stars, key=lambda s: s['mag']):
    if not (s['proper'] or s['bayer']): continue
    des = bayer_label(s['bayer'], s['con']) if s['bayer'] else (f"{s['flam']} {s['con']}" if s['flam'] else '')
    sl = slug(s['proper']) if s['proper'] else slug(s['bayer'].replace('-', '') + '-' + s['con'])
    while sl in seen: sl += '-b'
    seen.add(sl)
    lum = s['lum']
    full = ' / '.join(x for x in (bayer_full(s['bayer'], s['con']) if s['bayer'] else '', f"{s['flam']} {GEN.get(s['con'], s['con'])}" if s['flam'] else '') if x)
    tab.append([sl, s['proper'] or des, des if s['proper'] else '', full, s['con'], round(s['ra'], 4), round(s['dec'], 4),
                round(s['ly'], 2) if s['ly'] else None, s['mag'], s['am'], s['sp'][:10],
                None if lum is None else (round(lum, 3) if lum < 10 else round(lum)),
                ('HIP ' + s['hip']) if s['hip'] else (('HD ' + s['hd']) if s['hd'] else ''), round(s['ci'], 2)])
dump('stars.json', {'cols': ['slug', 'name', 'des', 'full', 'con', 'ra', 'dec', 'ly', 'mag', 'absmag', 'sp', 'lum', 'id', 'bv'], 'rows': tab})
print(f"  sky {len(sky)} · 3-D {len(loc)} · table {len(tab)} · proper names {sum(1 for s in stars if s['proper'])}")

# ───────────────────────── 2. galaxies (OpenNGC) ─────────────────────────
print("galaxies · OpenNGC")
def hms(s):
    h, m, sec = s.split(':'); return (float(h) + float(m)/60 + float(sec)/3600)*15
def dms(s):
    sg = -1 if s.strip().startswith('-') else 1
    d, m, sec = s.replace('+', '').replace('-', '').split(':')
    return sg*(float(d) + float(m)/60 + float(sec)/3600)
def sep(ra1, d1, ra2, d2):
    a1, a2, b1, b2 = map(math.radians, (ra1, ra2, d1, d2))
    c = math.sin(b1)*math.sin(b2) + math.cos(b1)*math.cos(b2)*math.cos(a1-a2)
    return math.degrees(math.acos(max(-1, min(1, c))))

# Redshift-independent distances (Mly) for nearby galaxies, where velocity says nothing about distance.
NEAR = {'NGC0224':2.537,'NGC0221':2.49,'NGC0205':2.69,'NGC0598':2.73,'NGC0147':2.53,'NGC0185':2.05,'NGC6822':1.63,
 'IC0010':2.2,'IC1613':2.38,'NGC3109':4.34,'NGC0055':6.5,'NGC0300':6.07,'NGC0253':11.4,'NGC0247':11.1,'NGC7793':12.7,
 'NGC3031':11.8,'NGC3034':11.5,'NGC2403':10.4,'NGC2976':11.6,'NGC3077':12.5,'IC2574':13.1,'NGC4236':14.5,
 'NGC5128':12.4,'NGC4945':11.7,'NGC5236':14.7,'NGC5253':11.4,'NGC5102':12.1,'NGC1313':13.6,'IC0342':10.7,
 'NGC1569':10.96,'NGC6946':25.2,'NGC5457':20.9,'NGC5194':28.0,'NGC5195':28.0,'NGC4736':16.0,'NGC4826':17.3,
 'NGC4258':24.7,'NGC4594':31.1,'NGC3368':31.0,'NGC3351':32.6,'NGC3379':36.6,'NGC3623':35.0,'NGC3627':36.0,
 'NGC0628':32.0,'NGC1068':47.0,'NGC2903':30.0,'NGC0891':32.0,'NGC7331':47.0,'NGC5055':29.3,'NGC1365':56.0,
 'NGC1316':62.0,'NGC1399':66.0,'NGC4472':55.9,'NGC4486':53.5,'NGC4374':60.0,'NGC4406':52.0,'NGC4649':56.7,
 'NGC0292':0.200,'NGC4449':13.1,'NGC4214':9.6,'NGC2366':10.9,'NGC1705':16.6,'NGC0404':10.0,'NGC4395':14.3}
# Rich clusters: members get the cluster distance, so "fingers of god" (velocity smearing) collapse.
CLUSTERS = [  # name, ra, dec, radius°, cz_min, cz_max, z_cluster
 ('Virgo Cluster',187.70,12.39,7.0,-900,2800,0.0038), ('Fornax Cluster',54.62,-35.45,3.0,500,2400,0.0046),
 ('Coma Cluster',194.95,27.98,1.8,4000,10500,0.0231), ('Perseus Cluster',49.95,41.51,1.6,2500,8500,0.0179),
 ('Hydra Cluster',159.17,-27.52,1.4,2000,5500,0.0126), ('Centaurus Cluster',192.20,-41.31,1.6,1800,6000,0.0114),
 ('Leo Cluster',176.15,19.84,1.3,4500,8500,0.0220), ('Hercules Cluster',241.30,17.75,1.2,8500,13500,0.0366),
 ('Norma Cluster',243.59,-60.87,1.4,2500,7500,0.0157), ('Antlia Cluster',157.51,-35.32,1.2,1500,4500,0.0087)]
VIRGO_MLY, FORNAX_MLY = 53.8, 65.0
TYPES = [('E', 0), ('S0', 1), ('SB', 3), ('SA', 2), ('S', 2), ('I', 4)]

gal = []; nflag = dict(near=0, cluster=0, hubble=0, dropped=0)
with open(os.path.join(SRC, 'ngc/NGC.csv'), newline='', encoding='utf-8') as f:
    for r in csv.DictReader(f, delimiter=';'):
        if r['Type'] not in ('G', 'GPair', 'GTrpl', 'GGroup') or not r['RA'] or not r['Dec']: continue
        ra, dec = hms(r['RA']), dms(r['Dec'])
        z = fnum(r['Redshift']); cz = z*C_KMS if z is not None else None
        name = r['Name']; d = None; flag = 0; cl = ''
        if name in NEAR:
            d, flag = NEAR[name], 1; nflag['near'] += 1
        elif cz is not None:
            for cn, cra, cdec, rad, lo, hi, zc in CLUSTERS:
                if lo <= cz <= hi and sep(ra, dec, cra, cdec) <= rad:
                    base = VIRGO_MLY if cn.startswith('Virgo') else FORNAX_MLY if cn.startswith('Fornax') else comoving_mly(zc)
                    h = (zlib.crc32(name.encode()) % 2001)/1000.0 - 1.0      # deterministic ±1
                    d = base*(1 + 0.045*h); flag = 2; cl = cn; nflag['cluster'] += 1
                    break
            if d is None:
                if cz < 350: nflag['dropped'] += 1; continue               # peculiar motion dominates
                d = comoving_mly(z); flag = 3; nflag['hubble'] += 1
        else:
            nflag['dropped'] += 1; continue
        hub = r['Hubble'].strip(); t = 5
        for k, v in TYPES:
            if hub.startswith(k): t = v; break
        maj, mnr = fnum(r['MajAx']), fnum(r['MinAx'])
        gal.append(dict(name=name, ra=ra, dec=dec, d=d, flag=flag, t=t, mag=fnum(r['V-Mag']) or fnum(r['B-Mag']), maj=maj, mnr=mnr,
                        z=z, hub=hub, common=r['Common names'].split(',')[0].strip(), m=r['M'].strip(), con=r['Const'], cl=cl,
                        pa=fnum(r['PosAng'])))
gal.sort(key=lambda g: g['d'])
buf = bytearray()
for g in gal:   # [ra u16][dec i16][dist f32 Mly][type u8][mag u8 ×10][log10 size u8][flag u8][axis ratio u8][position angle u8]
    size_kly = (g['maj']/60*math.pi/180*g['d']*1000) if g['maj'] else 0   # physical major axis, thousand ly
    ls = max(1, min(255, int(round(40*math.log10(max(1.0, size_kly)))))) if size_kly else 0
    ratio = (g['mnr']/g['maj']) if (g['maj'] and g['mnr']) else 0.7
    buf += struct.pack('<HhfBBBBBB', int(round(g['ra']/360*65535)) & 0xFFFF, int(round(g['dec']/90*32767)), g['d'],
                       g['t'], max(0, min(255, int(round((g['mag'] or 25.5)*10)))), ls, g['flag'],
                       max(20, min(255, int(round(ratio*255)))), int(round(((g['pa'] or 0) % 180)/180*255)))
dumpbin('galaxies.bin', buf)
def gdes(n):
    return ('NGC ' + n[3:].lstrip('0')) if n.startswith('NGC') else ('IC ' + n[2:].lstrip('0'))
named = []; seen = set()
for i, g in enumerate(gal):
    if g['common'] or g['m'] or (g['mag'] is not None and g['mag'] <= 12.6):
        des = gdes(g['name']); sl = slug(g['common'] or des)
        if sl in seen: sl = slug(des)
        seen.add(sl)
        named.append([sl, i, des, g['common'], ('M' + g['m'].lstrip('0')) if g['m'] else '', g['hub'], g['con'],
                      round(g['ra'], 3), round(g['dec'], 3), round(g['d'], 2), g['z'], g['mag'], g['maj'], g['flag'], g['cl']])
dump('galaxies.json', {'cols': ['slug','i','des','name','m','hubble','con','ra','dec','mly','z','mag','majArcmin','dflag','cluster'],
                       'count': len(gal), 'rows': named})
print(f"  placed {len(gal)} · {nflag} · table {len(named)}")

# ───────────────────────── 3. Messier objects ─────────────────────────
print("deep sky · Messier (d3-celestial)")
MDIST = {1:6500,2:37500,3:33900,4:7200,5:24500,6:1600,7:980,8:4100,9:25800,10:14300,11:6200,12:15700,13:22200,14:30300,
 15:33600,16:7000,17:5500,18:4900,19:28700,20:5200,21:4250,22:10600,23:2150,24:10000,25:2000,26:5000,27:1360,28:17900,
 29:4000,30:27100,34:1500,35:2800,36:4100,37:4500,38:4200,39:825,40:510,41:2300,42:1344,43:1300,44:577,45:444,46:5400,
 47:1600,48:1500,50:3200,52:5000,53:58000,54:87400,55:17600,56:32900,57:2300,62:22200,67:2700,68:33600,69:29700,
 70:29400,71:13000,72:54570,73:2500,75:67500,76:2500,78:1350,79:42000,80:32600,92:26700,93:3600,97:2030,103:10000,107:20900}
TY = {'gg':'Galaxy','g':'Galaxy','sg':'Spiral galaxy','ig':'Irregular galaxy','gc':'Globular cluster','oc':'Open cluster',
      'pn':'Planetary nebula','dn':'Diffuse nebula','bn':'Bright nebula','snr':'Supernova remnant','en':'Emission nebula',
      'rn':'Reflection nebula','ga':'Galaxy','cg':'Cluster with nebulosity','s':'Spiral galaxy','e':'Elliptical galaxy',
      'i':'Irregular galaxy','ds':'Double star','sfr':'Star cloud','as':'Asterism','pos':'Star cloud'}
dso = []
for ft in json.load(open(os.path.join(SRC, 'cel/messier.json'), encoding='utf-8'))['features']:
    p = ft['properties']; ra, dec = ft['geometry']['coordinates']
    n = int(p['name'][1:])
    dso.append(dict(id=p['name'], des=p.get('desig', ''), name=p.get('alt', ''), type=TY.get(p.get('type', ''), p.get('type', '')),
                    mag=p.get('mag'), ra=round(ra % 360, 3), dec=round(dec, 3), size=p.get('dim', ''), ly=MDIST.get(n)))
dso.sort(key=lambda o: int(o['id'][1:]))
dump('messier.json', dso)
print(f"  messier {len(dso)} · with a Milky Way distance {sum(1 for o in dso if o['ly'])}")

# ───────────────────────── 4. exoplanets (Open Exoplanet Catalogue) ─────────────────────────
print("exoplanets · Open Exoplanet Catalogue")
def kop(teff):
    """Kopparapu et al. 2014 (ApJL 787, L29) effective-flux limits for a 1 Earth-mass planet."""
    T = max(2600.0, min(7200.0, teff)) - 5780.0
    def s(s0, a, b, c, d): return s0 + a*T + b*T*T + c*T**3 + d*T**4
    return dict(rv=s(1.776, 2.136e-4, 2.533e-8, -1.332e-11, -3.097e-15),   # recent Venus        (optimistic inner edge)
                rg=s(1.107, 1.332e-4, 1.580e-8, -8.308e-12, -1.931e-15),   # runaway greenhouse  (conservative inner)
                mg=s(0.356, 6.171e-5, 1.698e-9, -3.198e-12, -5.575e-16),   # maximum greenhouse  (conservative outer)
                em=s(0.320, 5.547e-5, 1.526e-9, -2.874e-12, -5.011e-16))   # early Mars          (optimistic outer edge)
def sex(s, hours):
    p = s.split()
    if len(p) < 3: return None
    sg = -1 if p[0].startswith('-') else 1
    v = abs(float(p[0])) + float(p[1])/60 + float(p[2])/3600
    return v*15 if hours else sg*v
def tx(el, tag):
    e = el.find(tag); return e.text.strip() if e is not None and e.text else ''

root = ET.parse(gzip.open(os.path.join(SRC, 'oec/systems.xml.gz'))).getroot()
exo = []; nhz = [0, 0]
for sysm in root.iter('system'):
    try:
        ra, dec = sex(tx(sysm, 'rightascension'), True), sex(tx(sysm, 'declination'), False)
    except ValueError:
        ra = dec = None
    dpc = fnum(tx(sysm, 'distance'))
    for st in sysm.iter('star'):
        teff, rs, ms, sp = fnum(tx(st, 'temperature')), fnum(tx(st, 'radius')), fnum(tx(st, 'mass')), tx(st, 'spectraltype')
        L = None
        if teff and rs: L = rs*rs*(teff/5772.0)**4
        elif ms: L = ms**3.5 if ms > 0.43 else 0.23*ms**2.3
        for pl in st.findall('planet'):
            a = fnum(tx(pl, 'semimajoraxis')); per = fnum(tx(pl, 'period'))
            rj, mj = fnum(tx(pl, 'radius')), fnum(tx(pl, 'mass'))
            if a is None and per and ms: a = (ms*(per/365.25)**2)**(1/3)       # Kepler's third law
            rE = rj*11.209 if rj else None; mE = mj*317.83 if mj else None
            teq = hz = None
            if L and a and a > 0:
                teq = 278.5*(0.7**0.25)*(L**0.25)/math.sqrt(a)                  # Bond albedo 0.3
                if teff:
                    k = kop(teff); S = L/(a*a)
                    hz = 2 if k['mg'] <= S <= k['rg'] else 1 if k['em'] <= S <= k['rv'] else 0
            rocky = 1 if ((rE is not None and rE < 1.8) or (rE is None and mE is not None and mE < 6)) else 0
            if hz: nhz[0] += 1; nhz[1] += rocky
            yr = tx(pl, 'discoveryyear')
            exo.append([tx(pl, 'name'), tx(st, 'name'), None if ra is None else round(ra, 3), None if dec is None else round(dec, 3),
                        round(dpc*LY_PER_PC, 1) if dpc else None, round(a, 4) if a else None, round(per, 3) if per else None,
                        round(rE, 2) if rE else None, round(mE, 2) if mE else None, round(teq) if teq else None, hz, rocky,
                        sp[:8], round(teff) if teff else None, int(float(yr)) if yr else None, tx(pl, 'discoverymethod'),
                        round(L, 5) if L else None])
exo.sort(key=lambda e: (e[4] is None, e[4] or 0))
dump('exoplanets.json', {'cols': ['name','host','ra','dec','ly','a','period','rE','mE','teq','hz','rocky','sp','teff','year','method','lum'],
                         'rows': exo})
print(f"  planets {len(exo)} · in a habitable zone {nhz[0]} (rocky {nhz[1]}) · with position and distance "
      f"{sum(1 for e in exo if e[2] is not None and e[4])}")

# ───────────────────────── 5. constellations ─────────────────────────
print("constellations · d3-celestial")
lines = json.load(open(os.path.join(SRC, 'cel/con.lines.json'), encoding='utf-8'))
meta = {f['id']: f['properties'] for f in json.load(open(os.path.join(SRC, 'cel/con.json'), encoding='utf-8'))['features']}
cons = []
for ft in lines['features']:
    segs = [[round(v, 2) for pt in ln for v in ((pt[0] + 360) % 360, pt[1])] for ln in ft['geometry']['coordinates']]
    m = meta.get(ft['id'], {}); disp = m.get('display') or [None, None]
    cons.append([ft['id'], m.get('name', ft['id']), segs, None if disp[0] is None else round((disp[0] + 360) % 360, 2), disp[1]])
dump('constellations.json', cons)

# ───────────────────────── 6. Earth raster + cities ─────────────────────────
print("earth · Natural Earth")
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
W, H, SS = 2048, 1024, 2
def px(lon, lat, s=1): return ((lon + 180)/360*W*s, (90 - lat)/180*H*s)
land = json.load(open(os.path.join(SRC, 'ne/land.json'), encoding='utf-8'))
mask = Image.new('L', (W*SS, H*SS), 0); dm = ImageDraw.Draw(mask)
coast = Image.new('L', (W*SS, H*SS), 0); dc = ImageDraw.Draw(coast)
for ft in land['features']:
    g = ft['geometry']; parts = g['coordinates'] if g['type'] == 'Polygon' else [r for mp in g['coordinates'] for r in mp]
    for ring in parts:
        pts = [px(c[0], c[1], SS) for c in ring]
        if len(pts) > 2:
            dm.polygon(pts, fill=255); dc.line(pts + [pts[0]], fill=255, width=3)
mask = mask.resize((W, H), Image.LANCZOS)
coast = coast.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.5))
coast = Image.fromarray(np.clip(np.asarray(coast, np.float32)*1.9, 0, 255).astype(np.uint8))
places = json.load(open(os.path.join(SRC, 'ne/places.json'), encoding='utf-8'))
cities = sorted(((f['geometry']['coordinates'][0], f['geometry']['coordinates'][1], int(f['properties'].get('pop_max') or 0),
                  f['properties'].get('name', ''), f['properties'].get('adm0name', '')) for f in places['features']
                 if (f['properties'].get('pop_max') or 0) >= 40000), key=lambda c: -c[2])
big = Image.new('L', (W, H), 0); dl = ImageDraw.Draw(big)
for lon, lat, pop, _, _ in cities:
    x, y = px(lon, lat); t = max(0.0, min(1.0, (math.log10(pop) - 4.0)/4.0))**2.1
    rad = 0.55 + t*5.5; dl.ellipse([x - rad, y - rad, x + rad, y + rad], fill=int(28 + t*227))
core = np.asarray(big.filter(ImageFilter.GaussianBlur(0.45)), np.float32)
halo = np.asarray(big.filter(ImageFilter.GaussianBlur(3.2)), np.float32)
lm = np.asarray(mask.filter(ImageFilter.GaussianBlur(1.2)), np.float32)/255.0
lights = (np.clip(core + halo*0.42, 0, 255)*np.clip(lm*1.25, 0, 1)).astype(np.uint8)
p = os.path.join(OUT, 'earth.png')
Image.merge('RGB', (mask, coast, Image.fromarray(lights))).save(p, 'PNG', optimize=True, compress_level=9)
print(f"  {'earth.png':<24}{os.path.getsize(p)/1024:8.1f} KB   (R land · G coastline · B city lights)")
dump('cities.json', [[round(c[0], 2), round(c[1], 2), c[2], c[3], c[4]] for c in cities[:600]])
print(f"  cities lit {len(cities)}")

# ───────────────────────── checks ─────────────────────────
print("checks")
byname = {s['proper']: s for s in stars if s['proper']}
for n, want in (('Sirius', 8.6), ('Vega', 25.0), ('Altair', 16.7), ('Proxima Centauri', 4.2465), ('Betelgeuse', 500)):
    print(f"  {n:<18} {byname[n]['ly']:8.2f} ly   (expect ~{want})")
print(f"  comoving D(z=1)    {comoving_mly(1.0)/1000:6.2f} Gly   (expect ~11.1)")
k = kop(5780); print(f"  Sun habitable zone {math.sqrt(1/k['rg']):.3f}–{math.sqrt(1/k['mg']):.3f} AU   (expect 0.950–1.676)")
m31 = next(g for g in gal if g['name'] == 'NGC0224'); print(f"  M31                RA {m31['ra']:.2f} Dec {m31['dec']:.2f}  {m31['d']} Mly  b/a {m31['mnr']/m31['maj']:.2f}  PA {m31['pa']}")
for cn in ('Virgo Cluster', 'Coma Cluster', 'Perseus Cluster'):
    mem = [g for g in gal if g['cl'] == cn]
    print(f"  {cn:<18} {len(mem):4d} members at {sum(g['d'] for g in mem)/max(1, len(mem)):6.1f} Mly")
print("  stars:", [(t[0], t[3]) for t in tab[:5]])
