# Party TV 🎉🕹️

Turns a Samsung Tizen TV (built and tested for the 32" **UN32F6000F**) into a party console.
The TV is the screen. Everyone's phone is the controller: scan the QR code and you're in. Nothing to install on phones.

---

## What's inside

### Party games (up to 8 players)

| Game | Players | How it plays |
|---|---|---|
| ⚡ **Trivia Blitz** | 1–8 | Question on the TV, 4 colored answers on every phone. Faster right answers score more. |
| 💸 **Guess the Cost** | 1–8 | An AV / smart-home item appears and everyone bids. Closest without going over wins; within 1% is a Perfect Bid. |
| 🎨 **Doodle Dash** | 2–8 | One player draws on their phone and it shows live on the TV. Everyone else types guesses. |
| 🏍️ **Light Cycles** | 1–8 | Neon Tron bikes, steered with a d-pad. Last rider alive wins the round. |
| 🥚 **Egg Heist** | 1–8 | Joystick + DASH. Grab eggs, bring them home, rob other nests, dash into carriers. |

### 🕹️ Retro Console
- Game Boy, Game Boy Color and Game Boy Advance emulation (EmulatorJS with the Gambatte and mGBA cores).
- Phones become Game Boy controllers: d-pad, A/B, Start/Select, and L/R for GBA, with multi-touch so you can hold a direction and press A at the same time.
- **Free play** mode: every phone's controller works at once.
- **Room Plays** mode: everyone votes every 3 seconds and the most popular button gets pressed, Twitch-Plays-Pokémon style, on your couch.
- Games, in-game saves and save states are stored **on the TV**. You can import your old cart save and download saves back to a phone.
- Two free homebrew games are included, so it works out of the box: **µCity** (a GBC city builder) and **Libbet and the Magic Floor** (a GB puzzle game).

**Extras everywhere:** the first player to join gets 👑 and picks games from their phone (or use the TV remote). Everyone gets emoji reactions that float up the TV. A phone that drops can rejoin and keep its score.

---

## What you need
- The Samsung TV, a computer (Windows/Mac/Linux), and phones, all on the **same Wi-Fi**.
- A free **GitHub** account (hosts the files) and a free **Samsung account** (signs the TV app).

---

## Install

### Step 1 — Put the files on GitHub
1. Sign in at github.com → **New repository** → name it `party-tv` → **Public** → Create.
2. On the empty repo page click **uploading an existing file**. Unzip `party-tv.zip` on your computer and drag **everything inside the `party-tv` folder** (the `controller` and `tv` folders plus `index.html`, `package.json`, `README.md`, `THIRD_PARTY.md`, `.nojekyll`) into the page → **Commit changes**.
   - `.nojekyll` is a hidden file. If your computer hides it, skip it; things still work.
3. Repo **Settings → Pages** → Source: *Deploy from a branch* → Branch `main`, folder `/ (root)` → **Save**.
4. Wait a minute, then open `https://YOURNAME.github.io/party-tv/controller/` on your phone. You should see the "Join the party" screen.

### Step 2 — Tell the TV app where the phone page lives
In the repo, open `tv/config.js` → pencil icon → set:
```js
controllerUrl: 'https://YOURNAME.github.io/party-tv/controller/'
```
(lowercase username) → **Commit changes**.

### Step 3 — Put Developer Mode on the TV
1. Find your computer's IP address (Windows: `ipconfig`; Mac: System Settings → Network).
2. On the TV open **Apps**, then type **1 2 3 4 5** on the remote (use the on-screen number pad if your remote has no numbers).
3. Developer mode **On** → Host PC IP = your computer's IP → **OK** → turn the TV fully off and on (unplug it for 10 seconds if it won't restart).

### Step 4 — Install the app on the TV (choose one)

**Option A — TizenBrew (easiest, no Samsung developer tools)**
1. On your computer, download **TizenBrew Installer** from `github.com/reisxd/TizenBrewInstaller/releases` and run it.
2. Click **Install TizenBrew**. This TV runs Tizen 9, so it will ask you to sign in with your Samsung account to make a certificate. Follow the prompts.
3. On the TV, open **TizenBrew** → **Module Manager** → add a module from GitHub: `YOURNAME/party-tv` (the module screen shows the exact format it expects).
4. Launch **Party TV** from TizenBrew.

**Option B — Tizen Studio (classic sideload, works offline once installed)**
1. Install **Tizen Studio** with the **Samsung TV Extension** (Package Manager → Extension SDK).
2. **Tools → Certificate Manager → +** → **Samsung** certificate → TV → sign in with your Samsung account. When it asks for the device, the TV must be connected (step 3), so it can read the TV's DUID.
3. **Tools → Device Manager** → **Remote Device Manager** → **+** → enter the TV's IP → connect.
4. **File → Import → Tizen → Tizen Project** → pick the `tv` folder (it already contains `config.xml` and `icon.png`).
5. Right-click the project → **Run As → Tizen Web Application**. **Party TV** appears in the TV's apps from then on.
   - With Option B, edit `tv/config.js` **before** importing, since the app runs from the copy on the TV.

### Step 5 — Play
Open Party TV → phones scan the QR code (same Wi-Fi) → type a name → pick a game.

---

## Using it

### Lobby
- **TV remote:** ◀ ▶ ▲ ▼ to choose a game, **OK** to start. **BACK** cancels a game, or exits the app from the lobby.
- **👑 player:** the first phone to join picks games from their phone.
- **Reactions:** tap the emoji row on your phone between rounds.

### Retro Console
**Open it:** pick 🕹️ **Retro Console**. The TV shows your game library, and every phone gets the library too.

**Add a game (from a cart you own)**
1. Dump the cart with a cartridge reader, e.g. **GB Operator** (Epilogue) or **GBxCart RW** (insideGadgets). They plug into a computer by USB and save the game (`.gb`, `.gbc`, `.gba`) **and** its save file (`.sav`).
2. Put the game file on your phone (AirDrop, iCloud Drive, Google Drive, email to yourself).
3. Phone: **➕ Add a game from this phone** → pick the file. A progress bar shows while it sends, and it's stored on the TV.
   - Zip files must be unzipped first. 40 MB max, and every GB/GBC/GBA game fits.

**Bring your old save across** (e.g. your original FireRed or Gold save)
- Phone: tap the game → **⬆ Import save** → pick the `.sav` from your cart dump. It loads the next time you start the game. Choose **Continue** at the title screen.

**Play**
- Phone: tap the game → **▶ Play**, or highlight it with the remote and press **OK**.

| Phone controller | Does |
|---|---|
| D-pad (slide your thumb, diagonals work) | Move |
| A / B, START / SELECT, L / R (GBA) | Same as the real buttons, hold to keep pressed |
| ⏩ Turbo | Fast-forward on/off (great for grinding and text) |
| 💾 Save / 📂 Load | Save state / load state (one slot per game, stored on the TV) |
| 🗳 Vote / 🎮 Free (👑 only) | Switch between Room Plays and Free play |
| ⏏ Exit (👑 only) | Save and go back to the library |

| TV remote while playing | Does |
|---|---|
| Arrows / OK | D-pad / A |
| Red / Green / Yellow (if your remote has them) | B / Start / Select |
| BACK | Opens the TV menu: Resume, Save state, Load state, Turbo, Mode, Save & exit |

**Room Plays (vote mode):** every phone taps the button it wants. Every 3 seconds the TV presses the winner (ties are random). The tally shows on the right of the screen. Directions are held just long enough to walk one tile in Pokémon.

**Saves — how they're kept safe**
- In-game saves (saving in the game's menu) are copied to the TV's storage every 20 seconds and whenever you exit.
- Save states (💾) are separate snapshots: one per game, any moment. Handy before a big battle.
- **⬇ Download save** on a game sends its `.sav` to your phone as a backup. You can import it again later or load it back onto the real cart with your cart reader.
- Uninstalling the app or resetting the TV erases its storage, so download saves you care about first.

**What runs well on this TV**
- Game Boy and Game Boy Color (Red/Blue/Yellow, Gold/Silver/Crystal) should run at full speed.
- Game Boy Advance (Ruby/Sapphire/Emerald, FireRed/LeafGreen) is the heaviest. If it stutters, avoid Turbo and close and reopen the app.
- The first launch of each system downloads its emulator core (about 1 MB). After that it's cached on the TV.

---

## Try it on a laptop first (no TV needed)
1. Unzip, open a terminal in the `party-tv` folder, and run `python3 -m http.server 8000`.
2. TV: open `http://localhost:8000/tv/index.html?local=1`.
3. Phones: open the controller link the TV shows (or `http://localhost:8000/controller/?room=CODE&local=1`) in more browser tabs.
   - Keyboard in a controller tab: arrows = d-pad, X = A, Z = B, Enter = Start, Shift = Select, A/S = L/R.

`?local=1` connects the tabs to each other without the internet.

---

## Troubleshooting
| Problem | Fix |
|---|---|
| QR says "Set controllerUrl" | Step 2 isn't saved, or TizenBrew is using an old copy. Re-add the module or wait a few minutes (GitHub caches). |
| Phone says "No TV found with code" | Both the TV and the phone need internet for the first handshake. The TV's status pill should say **Ready for players**. |
| Phone joins but nothing happens | Phones and TV must be on the same network, not a guest network. On UniFi, turn off **Client Device Isolation** for that Wi-Fi. |
| Retro game stuck on "Loading…" | Wait for the first-time core download. If it still fails, the TV can't reach the `tv/retro/ejs` files: check the upload included that folder. |
| No sound in the retro console | Press any remote button once (some TVs need a button press before audio plays). |
| Upload stalls | Keep the phone screen on and the browser open until it finishes. |

---

## Customize
- **Trivia questions:** `tv/games/trivia-questions.js` (the first answer is the correct one).
- **Guess the Cost items:** `tv/games/price-items.js`. There's a template at the bottom for dealer gear.
- **Doodle words:** `WORDS` at the top of `tv/games/doodle.js`.
- **Room Plays speed:** `VOTE_MS` at the top of `tv/games/retro.js`.
- **New game:** add a line to `tv/games/catalog.js`, then write the file with `App.defineGame('id', function (api) { … })`. Games load only when picked, so the lobby stays light. Phone screens available: `choices`, `text`, `number`, `draw`, `dpad`, `stick`, `gamepad`, `wait`, `result`.

## How it connects
```
TV app ──┐                                   ┌── phones (web page on GitHub Pages)
         └── PeerJS free public matchmaking ─┘
             (handshake only — then TV ⇄ phones talk directly over your Wi-Fi with WebRTC)
```

## Credits and licenses
See `THIRD_PARTY.md` and `tv/retro/carts/CREDITS.md`. No commercial games are included. Only play games you own.
