# GLB -> glTF JSON (served as .json) + separate texture images (.jpg / .png), because the artifact host serves
# neither .glb nor .bin. Geometry / animation data goes into the JSON as a base64 data URI.
import json, struct, base64, os, sys

def convert(src, out_json, tex_dir_name):
    b = open(src, 'rb').read()
    assert b[:4] == b'glTF'
    jl = struct.unpack('<I', b[12:16])[0]; J = json.loads(b[20:20 + jl])
    o = 20 + jl; bl = struct.unpack('<I', b[o:o + 4])[0]; BIN = b[o + 8:o + 8 + bl]
    views = J['bufferViews']
    img_views = set()
    out_dir = os.path.join(os.path.dirname(out_json), tex_dir_name); os.makedirs(out_dir, exist_ok=True)
    for i, im in enumerate(J.get('images', [])):
        if 'bufferView' not in im: continue
        v = views[im['bufferView']]; data = BIN[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        ext = '.png' if im.get('mimeType') == 'image/png' else '.jpg'
        fn = f'{i}{ext}'; open(os.path.join(out_dir, fn), 'wb').write(data)
        img_views.add(im['bufferView']); del im['bufferView']; im['uri'] = f'{tex_dir_name}/{fn}'
    # compact the binary without the images
    remap, nb, newviews = {}, bytearray(), []
    for i, v in enumerate(views):
        if i in img_views: continue
        while len(nb) % 4: nb.append(0)
        data = BIN[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        nv = dict(v); nv['byteOffset'] = len(nb); nv['buffer'] = 0; nb += data
        remap[i] = len(newviews); newviews.append(nv)
    J['bufferViews'] = newviews
    for a in J.get('accessors', []):
        if 'bufferView' in a: a['bufferView'] = remap[a['bufferView']]
    J['buffers'] = [{'byteLength': len(nb), 'uri': 'data:application/octet-stream;base64,' + base64.b64encode(bytes(nb)).decode()}]
    open(out_json, 'w').write(json.dumps(J, separators=(',', ':')))
    return os.path.getsize(out_json), len(img_views)

if __name__ == '__main__':
    src_dir, dst_dir = sys.argv[1], sys.argv[2]
    for f in sorted(os.listdir(src_dir)):
        if not f.endswith('.glb'): continue
        n = f[:-4]; s, k = convert(os.path.join(src_dir, f), os.path.join(dst_dir, n + '.json'), n)
        print(n, s // 1024, 'KB json,', k, 'textures')
