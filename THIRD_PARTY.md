# Third-party software in Party TV

| Component | Where | License | Source |
|---|---|---|---|
| PeerJS 1.5.5 | `tv/lib`, `controller/lib` | MIT | https://github.com/peers/peerjs |
| qrcode-generator | `tv/lib/qrcode.js` | MIT | https://github.com/kazuhikoarase/qrcode-generator |
| EmulatorJS 4.2.3 | `tv/retro/ejs` (scripts concatenated into `emulator.min.js`; only change: the online update check is disabled) | GPL-3.0 (`tv/retro/ejs/LICENSE-EmulatorJS.txt`) | https://github.com/EmulatorJS/EmulatorJS |
| mGBA libretro core (GBA) | `tv/retro/ejs/cores/mgba-*.data` | MPL-2.0 | https://github.com/mgba-emu/mgba |
| Gambatte libretro core (GB/GBC) | `tv/retro/ejs/cores/gambatte-*.data` | GPL-2.0 | https://github.com/libretro/gambatte-libretro |
| µCity, Libbet | `tv/retro/carts` | GPL-3.0, zlib | see `tv/retro/carts/CREDITS.md` |
