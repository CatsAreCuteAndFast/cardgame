# rewrites an 8-bit RGB png (like chrome's screenshot of grain-texture.html) as 8-bit greyscale, a third of the size.
# usage: python art/tiles/ember-orange/grey-png.py editor/grain.png
import struct, sys, zlib

path = sys.argv[1]
data = open(path, "rb").read()
pos, idat, ihdr = 8, b"", None
while pos < len(data):
    length, kind = struct.unpack(">I4s", data[pos : pos + 8])
    body = data[pos + 8 : pos + 8 + length]
    if kind == b"IHDR":
        ihdr = struct.unpack(">IIBBBBB", body)
    elif kind == b"IDAT":
        idat += body
    pos += 12 + length
width, height, depth, colour, _, _, interlace = ihdr
assert depth == 8 and colour == 2 and interlace == 0, "expected 8-bit RGB without interlacing"

raw, stride, prev, out = zlib.decompress(idat), width * 3, bytearray(width * 3), bytearray()
for y in range(height):
    start = y * (stride + 1)
    kind, row = raw[start], bytearray(raw[start + 1 : start + 1 + stride])
    for i in range(stride):
        a = row[i - 3] if i >= 3 else 0
        b = prev[i]
        c = prev[i - 3] if i >= 3 else 0
        if kind == 1:
            row[i] = (row[i] + a) & 255
        elif kind == 2:
            row[i] = (row[i] + b) & 255
        elif kind == 3:
            row[i] = (row[i] + (a + b) // 2) & 255
        elif kind == 4:
            p = a + b - c
            pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
            row[i] = (row[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
    out.append(0)
    out += row[1::3]  # the grain is grey, so green holds the value
    prev = row


def chunk(kind, body):
    return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))


png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
png += chunk(b"IDAT", zlib.compress(bytes(out), 9)) + chunk(b"IEND", b"")
open(path, "wb").write(png)
