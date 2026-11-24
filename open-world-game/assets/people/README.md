# Real human models (Microsoft Rocketbox, MIT licence)

Source: https://github.com/microsoft/Microsoft-Rocketbox — see LICENSE-Rocketbox.md.

- `av/*.glb` — 27 rigged avatars (12 everyday adults + police, medics, firefighters, soldiers, security,
  business, sports), PBR materials (colour, normal, roughness from the specular map), 7k-15k triangles each.
- `anims.glb` — 19 motion clips on the same skeleton (walk, run, idle, look around, sit, talk, phone, wave,
  crouch, nervous), rotation tracks at 20 fps.

Rebuilt with `tools/people/` (rbxcopy.py picks + converts textures, convert.html/convert.cjs turn FBX into GLB).
Not yet wired into the game: proof-of-concept renders only.
