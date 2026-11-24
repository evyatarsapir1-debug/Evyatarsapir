# Real human models (Microsoft Rocketbox, MIT licence)

Source: https://github.com/microsoft/Microsoft-Rocketbox — see LICENSE-Rocketbox.md.

- `web/av/<name>.js` + `web/av/<name>/` (textures) — 27 rigged avatars (12 everyday adults + police, medics, firefighters, soldiers, security,
  business, sports), PBR materials (colour, normal, roughness from the specular map), 7k-15k triangles each.
- `web/anims.js` — 19 motion clips on the same skeleton (walk, run, idle, look around, sit, talk, phone, wave,
  crouch, nervous), rotation tracks at 20 fps.

Rebuilt with `tools/people/` (rbxcopy.py picks + converts textures, convert.html/convert.cjs turn FBX into GLB).
In the game: js/npc/realPeople.js draws the pedestrians near the camera with these models (textures 512 px for phones).
Pipeline: rbxcopy.py -> convert.html/convert.cjs (FBX -> GLB, 512 px textures) -> glb2json.py (GLB -> glTF JSON + images), then wrapped as ES modules (export default ...) because hosted pages may block fetch.
