"""Download JPL Horizons state vectors used to validate and fit the model.

    python3 tests/fetch_horizons.py            # everything
    python3 tests/fetch_horizons.py 606 401    # just Titan and Phobos
    python3 tests/fetch_horizons.py --dense 601 602   # 12,000 random times, for fitting Saturn's and Uranus's moons
    python3 tests/fetch_horizons.py --wide 701 702   # the same over 1600-2400, all Horizons has for Uranus's moons
    python3 tests/fetch_horizons.py --fixture  # rebuild the fixture entries of the bodies fetched

Writes tests/horizons-full/<NAIF id>.json: rows of [JD(TDB), x, y, z, vx, vy, vz] in km and km/s,
ICRF (J2000 equatorial), geometric, every 37 days over 1800-2050. With --dense: at 12,000 random
times over the same span (a fixed seed per body), into tests/horizons-dense/. Any regular grid
aliases: on it a term of period P cannot be told from one of period 1 / (1/P + k/step), and a fit
picks up the wrong one, right at the samples and wrong between them. Random times do not alias.
With --wide: 12,000 random times over 1600-2400 into tests/horizons-wide/ (Uranus's moons, whose
longitudes carry terms of centuries that 250 years cannot pin down).
Planets are heliocentric, moons relative to their planet.
tests/fixtures/horizons.json is every 10th row of the 37-day files (positions only); --fixture
rewrites the entries of the bodies found in tests/horizons-full/ and keeps the others.
Standard library only.
"""
import os, random, uuid
import urllib.request, urllib.parse, json, sys, re
def vectors(cmd, center, start, stop, step):
    q = {'format':'json','COMMAND':f"'{cmd}'",'CENTER':f"'{center}'",'EPHEM_TYPE':'VECTORS','REF_PLANE':'FRAME','REF_SYSTEM':'ICRF',
         'VEC_TABLE':'2','OUT_UNITS':'KM-S','CSV_FORMAT':'YES','OBJ_DATA':'NO','START_TIME':f"'{start}'",'STOP_TIME':f"'{stop}'",'STEP_SIZE':f"'{step}'"}
    url = 'https://ssd.jpl.nasa.gov/api/horizons.api?' + urllib.parse.urlencode(q)
    r = json.load(urllib.request.urlopen(url, timeout=120))['result']
    if '$$SOE' not in r: raise SystemExit(r[:2000])
    body = r.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()
    out = []
    for line in body:
        f = [x.strip() for x in line.split(',')]
        out.append([float(f[0])] + [float(x) for x in f[2:8]])   # JD(TDB), x,y,z,vx,vy,vz
    return out
def vectors_at(cmd, center, jds):
    """the same rows at the given JD(TDB) epochs, through the batch-file API (a URL cannot hold them)"""
    out = []
    for i in range(0, len(jds), 2000):
        lines = ["!$$SOF", f"COMMAND='{cmd}'", f"CENTER='{center}'", "EPHEM_TYPE='VECTORS'", "REF_PLANE='FRAME'", "REF_SYSTEM='ICRF'",
                 "VEC_TABLE='2'", "OUT_UNITS='KM-S'", "CSV_FORMAT='YES'", "OBJ_DATA='NO'", "TLIST_TYPE='JD'", "TIME_TYPE='TDB'", "TLIST="]
        lines += [f"'{t:.6f}'" for t in jds[i:i + 2000]]
        b = uuid.uuid4().hex
        data = (f'--{b}\r\nContent-Disposition: form-data; name="format"\r\n\r\njson\r\n--{b}\r\nContent-Disposition: form-data; '
                f'name="input"; filename="in.txt"\r\nContent-Type: text/plain\r\n\r\n' + '\n'.join(lines) + f'\n\r\n--{b}--\r\n').encode()
        req = urllib.request.Request('https://ssd.jpl.nasa.gov/api/horizons_file.api', data=data,
                                     headers={'Content-Type': f'multipart/form-data; boundary={b}'})
        r = json.load(urllib.request.urlopen(req, timeout=300))['result']
        if '$$SOE' not in r: raise SystemExit(r[:2000])
        for line in r.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines():
            f = [x.strip() for x in line.split(',')]
            out.append([float(f[0])] + [float(x) for x in f[2:8]])
    return out
jobs = {k:(k,'500@10') for k in ['199','299','399','499','599','699','799','899','999']}
jobs.update({'301':('301','500@399'),'501':('501','500@599'),'502':('502','500@599'),'503':('503','500@599'),'504':('504','500@599'),
             '606':('606','500@699'),'401':('401','500@499'),'402':('402','500@499'),
             **{k:(k,'500@699') for k in ['601','602','603','604','605','608']},
             **{k:(k,'500@799') for k in ['701','702','703','704','705']},
             '801':('801','500@899'),'901':('901','500@999')})
HERE = os.path.dirname(os.path.abspath(__file__))
NAMES = {'199':'Mercury','299':'Venus','399':'Earth','499':'Mars','599':'Jupiter','699':'Saturn','799':'Uranus','899':'Neptune',
         '999':'Pluto','301':'Moon','501':'Io','502':'Europa','503':'Ganymede','504':'Callisto','401':'Phobos','402':'Deimos',
         '601':'Mimas','602':'Enceladus','603':'Tethys','604':'Dione','605':'Rhea','606':'Titan','608':'Iapetus',
         '701':'Ariel','702':'Umbriel','703':'Titania','704':'Oberon','705':'Miranda','801':'Triton','901':'Charon'}
CENTRES = {'10':'Sun','399':'Earth','499':'Mars','599':'Jupiter','699':'Saturn','799':'Uranus','899':'Neptune','999':'Pluto'}
args = sys.argv[1:]
if '--fixture' in args:
    path = os.path.join(HERE, 'fixtures', 'horizons.json')
    fx = json.load(open(path))
    for f in sorted(os.listdir(os.path.join(HERE, 'horizons-full'))):
        k = f[:-5]
        rows = json.load(open(os.path.join(HERE, 'horizons-full', f)))[::10]
        fx['bodies'][NAMES[k]] = {'center': CENTRES[jobs[k][1].split('@')[1]], 'rows': [[r[0]] + [round(x, 1) for x in r[1:4]] for r in rows]}
        print('fixture', NAMES[k], len(rows))
    json.dump(fx, open(path, 'w'), separators=(',', ':'))
    raise SystemExit
dense, wide = '--dense' in args, '--wide' in args
OUT = os.path.join(HERE, 'horizons-wide' if wide else 'horizons-dense' if dense else 'horizons-full')
os.makedirs(OUT, exist_ok=True)
which = [a for a in args if not a.startswith('--')] or list(jobs)
for k in which:
    cmd, c = jobs[k]
    if dense or wide:
        rng = random.Random(int(k))
        lo, hi = (2305460.5, 2597620.5) if wide else (2378498.5, 2470169.5)   # 1600-01-14 .. 2399-12-11, 1800-01-03 .. 2050-12-31
        data = vectors_at(cmd, c, sorted(rng.uniform(lo, hi) for _ in range(12000)))
    else:
        data = vectors(cmd, c, '1800-01-03', '2050-12-31', '37 d')
    json.dump(data, open(os.path.join(OUT, f'{k}.json'), 'w'))
    print(k, len(data), data[0][0], data[-1][0])
