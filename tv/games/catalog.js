/* Game catalog: only this small list loads at startup.
 * Each game's code (files) is fetched the first time someone picks it. */
App.registerGame({ id: 'trivia', name: 'Trivia Blitz', icon: '⚡', color: '#ffd43b', minPlayers: 1,
  tagline: 'Race to the right answer. Speed = points.', files: ['games/trivia-questions.js', 'games/trivia.js'] });
App.registerGame({ id: 'price', name: 'Guess the Cost', icon: '💸', color: '#51cf66', minPlayers: 1,
  tagline: 'AV gear edition. Don\'t go over!', files: ['games/price-items.js', 'games/price.js'] });
App.registerGame({ id: 'doodle', name: 'Doodle Dash', icon: '🎨', color: '#cc5de8', minPlayers: 2,
  tagline: 'Draw on your phone. Everyone guesses.', files: ['games/doodle.js'] });
App.registerGame({ id: 'cycles', name: 'Light Cycles', icon: '🏍️', color: '#22d3ee', minPlayers: 1,
  tagline: 'Leave a trail, trap your friends, survive.', files: ['games/cycles.js'] });
App.registerGame({ id: 'heist', name: 'Egg Heist', icon: '🥚', color: '#ff922b', minPlayers: 1,
  tagline: 'Steal eggs, defend your nest, dash to knock eggs loose.', files: ['games/egg-heist.js'] });
App.registerGame({ id: 'retro', name: 'Retro Console', icon: '🕹️', color: '#ff4d6d', minPlayers: 1,
  tagline: 'GB · GBC · GBA. Phones are the controllers.', files: ['games/retro.js'] });
