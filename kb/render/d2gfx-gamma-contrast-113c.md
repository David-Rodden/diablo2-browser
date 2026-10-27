# D2gfx Gamma / Contrast options (1.13c)

Ground truth: `samples/d2/D2gfx.dll` (ImageBase `0x6FA80000`), `samples/d2/D2Direct3D.dll` (`0x6F880000`),
`samples/d2/Fog.dll` (`0x6FF50000`).

- `D2gfx 0x6FA8AEE0` reads two registry values through `0x6FA87830` (key string `0x6FA8E52C`):
  - `"Contrast"` (`0x6FA8E538`), default `(renderMode == 4 /* Glide */) ? 0 : 100` (`sete al; dec eax; and eax, 0x64`),
    forwarded as option 11 via `[gfxInterface+0x30](11, contrast)`;
  - `"Gamma"` (`0x6FA8E524`), default `0x9B` (155), stored at `0x6FA90BEC`, then `[gfxInterface+0x58]()` applies it.
- D2Direct3D option handler `0x6F88A640`: option 11 is stored at `0x6F897E88`.
- D2Direct3D `0x6F88AE00`: when the device exposes gamma control, builds a 256-entry 16-bit ramp with
  `Fog #10198(double value = [0x6F897E88], 2, 256, 0xFFFF, buf)` (`0x6F88AE1E..0x6F88AE3A`), copies it to the
  G and B ramps and calls the gamma-control `SetGammaRamp` (`[vtbl+0x10]`, error string "Failed to set gamma ramp").
- `Fog #10198` = `0x6FF712C0` (curve generator; exact formula not transcribed here).
- D2Client exposes "Gamma" / "Contrast" sliders in the video options (strings at D2Client `0x6FB851C8` / `0x6FB851BC`).

Render-mode numbering (`0x6FA91258`, driver-name table `0x6FA90C18`, 7 × u32 string pointers):
0 none, 1 `D2Gdi.dll`, 2 none, 3 `D2DDraw.dll`, 4 `D2Glide.dll`, 5 none, 6 `D2Direct3D.dll`.
`D2gfx #10077` (`0x6FA8B2D0`) returns `renderMode >= 4` (hardware 3D: Glide / Direct3D).
