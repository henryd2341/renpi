"""Static TTF metadata and cmap coverage; does not start Ren'Py or render a UI."""
import ast
import json
from pathlib import Path
import re
import struct

project = Path(__file__).resolve().parents[2]
options = project / "authoring/shared/tutorial/options.rpy"
font_rel = re.search(r'font "(fonts/[^\"]+)"', options.read_text(encoding='utf-8')).group(1)
font = project / "authoring/shared/tutorial" / font_rel
b = font.read_bytes()
u16 = lambda off: struct.unpack_from('>H', b, off)[0]
u32 = lambda off: struct.unpack_from('>I', b, off)[0]
tables = {}
for i in range(u16(4)):
    off = 12 + 16*i
    tag = b[off:off+4].decode('ascii')
    tables[tag] = (u32(off+8), u32(off+12))
name = tables['name'][0]
strings = []
for i in range(u16(name+2)):
    off = name+6+i*12
    platform, enc, lang, nameid, length, offset = struct.unpack_from('>6H', b, off)
    if nameid in (0,1,2,4,5,13,14):
        raw = b[name+u16(name+4)+offset:name+u16(name+4)+offset+length]
        value = raw.decode('utf-16-be' if platform in (0,3) else 'latin-1', errors='replace')
        if (nameid,value) not in [(v['name_id'],v['value']) for v in strings]:
            strings.append({'name_id':nameid,'value':value})
cmap = tables['cmap'][0]
subtables = []
for i in range(u16(cmap+2)):
    off = cmap+4+i*8
    platform, enc, rel = struct.unpack_from('>2HI',b,off)
    sub = cmap+rel
    if platform in (0,3) and u16(sub) in (4,12):
        subtables.append(sub)
def has_glyph(cp):
    for sub in subtables:
        fmt = u16(sub)
        if fmt == 12:
            for i in range(u32(sub+12)):
                start,end,gid = struct.unpack_from('>3I',b,sub+16+12*i)
                if start <= cp <= end and gid + cp-start:
                    return True
        elif cp < 65536:
            n = u16(sub+6)//2
            ends = sub+14
            starts = ends+2*n+2
            deltas = starts+2*n
            ranges = deltas+2*n
            for i in range(n):
                start,end = u16(starts+2*i),u16(ends+2*i)
                if start <= cp <= end:
                    r = u16(ranges+2*i)
                    gid = ((cp+u16(deltas+2*i)) & 65535) if not r else u16(ranges+2*i+r+2*(cp-start))
                    if r and gid:
                        gid = (gid+u16(deltas+2*i)) & 65535
                    if gid:
                        return True
    return False
chars = set()
paths = list((project/'authoring/shared/tutorial').glob('*.rpy')) + [project/'authoring/checks/fixtures/check-boundary.rpy']
for p in paths:
    for value in re.findall(r'"(?:[^"\\]|\\.)*"', p.read_text(encoding='utf-8')):
        chars.update(ast.literal_eval(value))
missing = sorted(c for c in chars if ord(c)>32 and not has_glyph(ord(c)))
report = {'font': str(font.relative_to(project)), 'metadata': strings,
          'tested_unique_characters': len(chars), 'missing_glyphs': missing,
          'scope': 'static cmap only, NOT in-game rendering or packaging acceptance'}
(project/'authoring/checks/font-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
assert not missing, 'Source font lacks script characters'
