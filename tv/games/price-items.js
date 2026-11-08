/* Guess the Cost item list.
 * Format: { n: name, p: price in US dollars, e: emoji, c: category, note: optional fun fact shown on reveal }
 * Prices are approximate US list prices at launch / time of writing — street prices move,
 * so fix anything that looks off and add your own (dealer gear is where this gets funny).
 */
var PRICE_ITEMS = [
  { n: 'Samsung 32" F6000F TV (the one you\'re looking at)', p: 180, e: '📺', c: 'TVs', note: 'Yes, this exact TV.' },
  { n: 'LG C5 65" OLED TV (launch price)', p: 2700, e: '📺', c: 'TVs' },
  { n: 'Apple TV 4K (128GB, Wi-Fi + Ethernet)', p: 149, e: '🍎', c: 'Streaming' },
  { n: 'NVIDIA Shield TV Pro', p: 200, e: '🟩', c: 'Streaming' },
  { n: 'Roku Ultra', p: 100, e: '🟪', c: 'Streaming' },
  { n: 'Amazon Fire TV Stick 4K Max', p: 60, e: '🔥', c: 'Streaming' },
  { n: 'Google TV Streamer', p: 100, e: '🟦', c: 'Streaming' },
  { n: 'Sonos Arc Ultra soundbar', p: 999, e: '🔊', c: 'Audio' },
  { n: 'Sonos Sub 4', p: 799, e: '🔈', c: 'Audio' },
  { n: 'Sonos Ace headphones', p: 449, e: '🎧', c: 'Audio' },
  { n: 'Sony WH-1000XM6 headphones', p: 450, e: '🎧', c: 'Audio' },
  { n: 'Apple HomePod (2nd gen)', p: 299, e: '🔊', c: 'Audio' },
  { n: 'Apple HomePod mini', p: 99, e: '🔵', c: 'Audio' },
  { n: 'Amazon Echo Dot (5th gen)', p: 50, e: '🔵', c: 'Smart Home' },
  { n: 'AirPods Pro 2', p: 249, e: '🎧', c: 'Audio' },
  { n: 'Apple AirTag (single)', p: 29, e: '📍', c: 'Gadgets' },
  { n: 'UniFi Dream Machine Pro', p: 379, e: '🛜', c: 'Networking' },
  { n: 'UniFi U7 Pro access point', p: 189, e: '📡', c: 'Networking' },
  { n: 'UniFi G5 Bullet camera', p: 129, e: '📷', c: 'Networking' },
  { n: 'UniFi G4 Doorbell Pro', p: 299, e: '🔔', c: 'Networking' },
  { n: 'Ring Video Doorbell Pro 2', p: 250, e: '🔔', c: 'Smart Home' },
  { n: 'Google Nest Doorbell (wired, 2nd gen)', p: 180, e: '🔔', c: 'Smart Home' },
  { n: 'Google Nest Thermostat', p: 130, e: '🌡️', c: 'Smart Home' },
  { n: 'ecobee Smart Thermostat Premium', p: 250, e: '🌡️', c: 'Smart Home' },
  { n: 'Apple Vision Pro', p: 3499, e: '🥽', c: 'Gadgets', note: 'Per face.' },
  { n: 'Meta Quest 3 (512GB)', p: 499, e: '🥽', c: 'Gadgets' },
  { n: 'Steam Deck OLED (512GB)', p: 549, e: '🎮', c: 'Gaming' }

  /* Add dealer gear here — this is where it gets funny. Examples of the format:
  ,{ n: 'Savant Pro Remote', p: 0, e: '🎛️', c: 'Pro AV', note: 'Ask your dealer 😉' }
  ,{ n: 'Lutron Palladiom keypad (single gang)', p: 0, e: '🔘', c: 'Pro AV' }
  ,{ n: '1000 ft box of Cat6', p: 0, e: '🧵', c: 'Pro AV' }
  ,{ n: 'Middle Atlantic 45RU rack', p: 0, e: '🗄️', c: 'Pro AV' }
  */
];
