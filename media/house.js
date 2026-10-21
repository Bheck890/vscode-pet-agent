// @ts-check
// The pet's houses: one per bag, each with rooms drawn behind the pet (wall,
// floor, and a window showing the season) and furniture you place yourself.
// Starter furniture unlocks by level; each themed bag brings a house, some
// furniture and a room theme, and sells the rest in its shop. The layout is
// saved in the extension so every window shows the same rooms. webview.js
// creates one instance; panels.js lists the houses, rooms and furniture.
(function (root) {
  'use strict';

  /**
   * One house per bag (src/bags.ts lists the same room ids). The first two
   * rooms come with the bag; the rest are sold in its shop. A room's `kind`
   * is what the pet does there: naps (bed), eats (food), plays (play), or
   * wanders and uses the furniture (living).
   */
  const HOUSES = [
    {
      id: 'starter',
      name: 'Cozy home',
      emoji: '🏡',
      window: 'square',
      rooms: [
        { id: 'living', name: 'Living room', kind: 'living' },
        { id: 'bedroom', name: 'Bedroom', kind: 'bed' },
        { id: 'kitchen', name: 'Kitchen', kind: 'food' },
        { id: 'yard', name: 'Yard', kind: 'play' },
      ],
    },
    {
      id: 'garden',
      name: 'Greenhouse cottage',
      emoji: '🌿',
      window: 'glass',
      rooms: [
        { id: 'greenhouse', name: 'Greenhouse', kind: 'living' },
        { id: 'shed', name: 'Potting shed', kind: 'bed' },
        { id: 'patch', name: 'Veg patch', kind: 'play' },
      ],
    },
    {
      id: 'ocean',
      name: 'Beach hut',
      emoji: '🛖',
      window: 'round',
      rooms: [
        { id: 'hut', name: 'Hut', kind: 'bed' },
        { id: 'deck', name: 'Deck', kind: 'play' },
        { id: 'rockpool', name: 'Rock pool', kind: 'living' },
      ],
    },
    {
      id: 'kitchen',
      name: 'Bakery',
      emoji: '🥐',
      window: 'square',
      rooms: [
        { id: 'shopfloor', name: 'Shop floor', kind: 'living' },
        { id: 'bakehouse', name: 'Kitchen', kind: 'food' },
        { id: 'loft', name: 'Loft', kind: 'bed' },
      ],
    },
    {
      id: 'music',
      name: 'Studio',
      emoji: '🎙️',
      window: 'round',
      rooms: [
        { id: 'booth', name: 'Recording booth', kind: 'living' },
        { id: 'stage', name: 'Stage', kind: 'play' },
        { id: 'greenroom', name: 'Green room', kind: 'bed' },
      ],
    },
    {
      id: 'sports',
      name: 'Clubhouse',
      emoji: '🏟️',
      window: 'square',
      rooms: [
        { id: 'lockers', name: 'Locker room', kind: 'living' },
        { id: 'pitch', name: 'Pitch', kind: 'play' },
        { id: 'canteen', name: 'Canteen', kind: 'food' },
      ],
    },
    {
      id: 'space',
      name: 'Moon base',
      emoji: '🌙',
      window: 'round',
      night: true,
      rooms: [
        { id: 'airlock', name: 'Airlock', kind: 'living' },
        { id: 'observatory', name: 'Observatory', kind: 'living' },
        { id: 'dome', name: 'Greenhouse dome', kind: 'play' },
        { id: 'bunks', name: 'Bunks', kind: 'bed' },
      ],
    },
    {
      id: 'spooky',
      name: 'Haunted manor',
      emoji: '🏚️',
      window: 'arch',
      night: true,
      rooms: [
        { id: 'hall', name: 'Great hall', kind: 'living' },
        { id: 'crypt', name: 'Crypt', kind: 'bed' },
        { id: 'attic', name: 'Attic', kind: 'play' },
      ],
    },
    {
      id: 'retro',
      name: 'Arcade',
      emoji: '👾',
      window: 'square',
      night: true,
      rooms: [
        { id: 'arcade', name: 'Arcade floor', kind: 'play' },
        { id: 'den', name: 'Den', kind: 'living' },
        { id: 'snackbar', name: 'Snack bar', kind: 'food' },
      ],
    },
    {
      id: 'farm',
      name: 'Farmhouse',
      emoji: '🐄',
      window: 'square',
      rooms: [
        { id: 'barn', name: 'Barn', kind: 'bed' },
        { id: 'farmkitchen', name: 'Farm kitchen', kind: 'food' },
        { id: 'field', name: 'Field', kind: 'play' },
      ],
    },
    {
      id: 'camping',
      name: 'Campsite',
      emoji: '⛺',
      window: 'glass',
      rooms: [
        { id: 'tent', name: 'Tent', kind: 'bed' },
        { id: 'campfire', name: 'Campfire', kind: 'food' },
        { id: 'lake', name: 'Lake', kind: 'play' },
      ],
    },
    {
      id: 'art',
      name: 'Studio loft',
      emoji: '🖼️',
      window: 'glass',
      rooms: [
        { id: 'studio', name: 'Studio', kind: 'living' },
        { id: 'gallery', name: 'Gallery', kind: 'living' },
        { id: 'attic', name: 'Attic', kind: 'bed' },
      ],
    },
    {
      id: 'lab',
      name: 'Laboratory',
      emoji: '🧪',
      window: 'round',
      rooms: [
        { id: 'lab', name: 'Lab', kind: 'living' },
        { id: 'library', name: 'Library', kind: 'living' },
        { id: 'dorm', name: 'Dorm', kind: 'bed' },
      ],
    },
    {
      id: 'winter',
      name: 'Ski lodge',
      emoji: '🏔️',
      window: 'square',
      rooms: [
        { id: 'lodge', name: 'Lodge', kind: 'living' },
        { id: 'cabin', name: 'Cabin', kind: 'bed' },
        { id: 'slope', name: 'Slope', kind: 'play' },
      ],
    },
    {
      id: 'jungle',
      name: 'Treehouse',
      emoji: '🌳',
      window: 'round',
      rooms: [
        { id: 'treehouse', name: 'Treehouse', kind: 'living' },
        { id: 'hammock', name: 'Hammock nook', kind: 'bed' },
        { id: 'river', name: 'River', kind: 'play' },
      ],
    },
    {
      id: 'castle',
      name: 'Castle',
      emoji: '🏰',
      window: 'arch',
      rooms: [
        { id: 'throne', name: 'Throne room', kind: 'living' },
        { id: 'tower', name: 'Tower', kind: 'bed' },
        { id: 'feast', name: 'Great hall', kind: 'food' },
        { id: 'courtyard', name: 'Courtyard', kind: 'play' },
      ],
    },
    {
      id: 'robots',
      name: 'Workshop',
      emoji: '🏭',
      window: 'square',
      rooms: [
        { id: 'workshop', name: 'Workshop', kind: 'living' },
        { id: 'charging', name: 'Charging bay', kind: 'bed' },
        { id: 'track', name: 'Test track', kind: 'play' },
      ],
    },
    {
      id: 'desert',
      name: 'Oasis palace',
      emoji: '🏜️',
      window: 'arch',
      rooms: [
        { id: 'oasis', name: 'Oasis', kind: 'play' },
        { id: 'bazaar', name: 'Bazaar', kind: 'food' },
        { id: 'palace', name: 'Palace', kind: 'bed' },
      ],
    },
    {
      id: 'sky',
      name: 'Cloud castle',
      emoji: '☁️',
      window: 'round',
      rooms: [
        { id: 'cloudhall', name: 'Cloud hall', kind: 'living' },
        { id: 'nest', name: 'Nest', kind: 'bed' },
        { id: 'balloon', name: 'Balloon deck', kind: 'play' },
      ],
    },
    {
      id: 'vault',
      name: 'Treasure vault',
      emoji: '💰',
      window: 'arch',
      night: true,
      rooms: [
        { id: 'vault', name: 'Vault', kind: 'living' },
        { id: 'hoard', name: "Dragon's hoard", kind: 'bed' },
        { id: 'trophies', name: 'Trophy room', kind: 'play' },
      ],
    },
  ];

  /** A piece from a bag's pack. `free` ones come with the bag; the rest are sold in its shop. */
  function piece(bag, id, emoji, name, place, free, extra) {
    return Object.assign({ id, emoji, name, place, bag, free }, extra);
  }

  /**
   * Starter furniture unlocks at `level` (everything is open with levels
   * switched off). `nap` pieces are beds, `eat` ones are food bowls.
   */
  const FURNITURE = [
    { id: 'bed', emoji: '🛏️', name: 'bed', level: 1, place: 'floor', nap: true },
    { id: 'plant', emoji: '🪴', name: 'house plant', level: 2, place: 'floor' },
    { id: 'bowl', emoji: '🥣', name: 'food bowl', level: 3, place: 'floor', eat: true },
    { id: 'clock', emoji: '🕰️', name: 'clock', level: 3, place: 'wall' },
    { id: 'painting', emoji: '🖼️', name: 'painting', level: 4, place: 'wall' },
    { id: 'books', emoji: '📚', name: 'bookshelf', level: 5, place: 'floor' },
    { id: 'sofa', emoji: '🛋️', name: 'sofa', level: 6, place: 'floor' },
    { id: 'tv', emoji: '📺', name: 'TV', level: 7, place: 'floor' },
    { id: 'lamp', emoji: '💡', name: 'lamp', level: 8, place: 'wall' },
    { id: 'chair', emoji: '🪑', name: 'chair', level: 9, place: 'floor' },
    { id: 'piano', emoji: '🎹', name: 'piano', level: 10, place: 'floor' },
    { id: 'fish', emoji: '🐠', name: 'fish tank', level: 12, place: 'floor' },
    { id: 'trophy', emoji: '🏆', name: 'trophy', level: 14, place: 'floor' },
    { id: 'telescope', emoji: '🔭', name: 'telescope', level: 16, place: 'floor' },
    { id: 'radio', emoji: '📻', name: 'radio', level: 18, place: 'floor' },
    { id: 'disco', emoji: '🪩', name: 'disco ball', level: 20, place: 'wall' },
    piece('garden', 'flowerpot', '🌼', 'flower pot', 'floor', true),
    piece('garden', 'ivy', '🌿', 'climbing ivy', 'wall', true),
    piece('garden', 'leafbed', '🍃', 'leaf bed', 'floor', true, { nap: true }),
    piece('garden', 'fountain', '⛲', 'fountain', 'floor', false),
    piece('garden', 'honeypot', '🍯', 'honey pot', 'floor', false, { eat: true }),
    piece('garden', 'sunflowers', '🌻', 'sunflowers', 'floor', false),
    piece('ocean', 'shellbed', '🐚', 'shell bed', 'floor', true, { nap: true }),
    piece('ocean', 'lifebuoy', '🛟', 'lifebuoy', 'wall', true),
    piece('ocean', 'coralreef', '🪸', 'coral reef', 'floor', true),
    piece('ocean', 'parasol', '🏖️', 'beach parasol', 'floor', false),
    piece('ocean', 'anchorsign', '⚓', 'anchor sign', 'wall', false),
    piece('ocean', 'clambowl', '🦪', 'clam bowl', 'floor', false, { eat: true }),
    piece('kitchen', 'stove', '🍳', 'stove', 'floor', true, { eat: true }),
    piece('kitchen', 'kettleshelf', '🫖', 'kettle shelf', 'wall', true),
    piece('kitchen', 'breadbin', '🍞', 'bread bin', 'floor', true),
    piece('kitchen', 'cakestand', '🎂', 'cake stand', 'floor', false),
    piece('kitchen', 'spicerack', '🧂', 'spice rack', 'wall', false),
    piece('kitchen', 'loafbed', '🥖', 'loaf bed', 'floor', false, { nap: true }),
    piece('music', 'speaker', '🔊', 'speaker', 'floor', true),
    piece('music', 'guitarposter', '🎸', 'guitar poster', 'wall', true),
    piece('music', 'saxstand', '🎷', 'sax stand', 'floor', true),
    piece('music', 'drumset', '🥁', 'drum set', 'floor', false),
    piece('music', 'goldrecord', '💿', 'gold record', 'wall', false),
    piece('music', 'amp', '📢', 'amp', 'floor', false),
    piece('sports', 'locker', '🗄️', 'locker', 'floor', true),
    piece('sports', 'pennant', '🚩', 'pennant', 'wall', true),
    piece('sports', 'ballrack', '🏀', 'ball rack', 'floor', true),
    piece('sports', 'goalnet', '🥅', 'goal net', 'floor', false),
    piece('sports', 'scoreboard', '🔢', 'scoreboard', 'wall', false),
    piece('sports', 'kitbag', '👟', 'kit bag', 'floor', false),
    piece('space', 'console', '🖥️', 'mission console', 'floor', true),
    piece('space', 'starmap', '🌌', 'star map', 'wall', true),
    piece('space', 'capsulebed', '🛸', 'sleep capsule', 'floor', true, { nap: true }),
    piece('space', 'rocketmodel', '🚀', 'rocket model', 'floor', false),
    piece('space', 'planetmobile', '🪐', 'planet mobile', 'wall', false),
    piece('space', 'foodpod', '🥫', 'food pod', 'floor', false, { eat: true }),
    piece('spooky', 'cauldronpot', '🫕', 'cauldron', 'floor', true, { eat: true }),
    piece('spooky', 'cobwebs', '🕸️', 'cobwebs', 'wall', true),
    piece('spooky', 'candelabra', '🕯️', 'candelabra', 'floor', true),
    piece('spooky', 'coffinbed', '⚰️', 'coffin bed', 'floor', false, { nap: true }),
    piece('spooky', 'portrait', '🖼️', 'haunted portrait', 'wall', false),
    piece('spooky', 'pumpkinlamp', '🎃', 'pumpkin lamp', 'floor', false),
    piece('retro', 'arcadecab', '👾', 'arcade cabinet', 'floor', true),
    piece('retro', 'tapewall', '📼', 'tape wall', 'wall', true),
    piece('retro', 'crttv', '📺', 'CRT telly', 'floor', true),
    piece('retro', 'pinball', '🎰', 'pinball machine', 'floor', false),
    piece('retro', 'neon', '🌈', 'neon sign', 'wall', false),
    piece('retro', 'beanbag', '🫘', 'bean bag', 'floor', false, { nap: true }),
    piece('farm', 'haybed', '🌾', 'hay bed', 'floor', true, { nap: true }),
    piece('farm', 'milkchurn', '🥛', 'milk churn', 'floor', true),
    piece('farm', 'trough', '🪣', 'feed trough', 'floor', true, { eat: true }),
    piece('farm', 'weathervane', '🐓', 'weathervane', 'wall', false),
    piece('farm', 'tractorshed', '🚜', 'tractor', 'floor', false),
    piece('farm', 'applecrate', '🍎', 'apple crate', 'floor', false),
    piece('camping', 'firepit', '🔥', 'fire pit', 'floor', true),
    piece('camping', 'tentbed', '⛺', 'tent bed', 'floor', true, { nap: true }),
    piece('camping', 'trailmap', '🗺️', 'trail map', 'wall', true),
    piece('camping', 'logbench', '🪵', 'log bench', 'floor', false),
    piece('camping', 'lanternhook', '🏮', 'lantern', 'wall', false),
    piece('camping', 'cooler', '🧊', 'cool box', 'floor', false, { eat: true }),
    piece('art', 'easel', '🎨', 'easel', 'floor', true),
    piece('art', 'gallerywall', '🖼️', 'gallery wall', 'wall', true),
    piece('art', 'potterywheel', '🏺', 'pottery wheel', 'floor', true),
    piece('art', 'statue', '🗿', 'statue', 'floor', false),
    piece('art', 'brushjar', '🖌️', 'brush jar', 'floor', false),
    piece('art', 'spotlight', '🔦', 'spotlight', 'wall', false),
    piece('lab', 'labbench', '🧪', 'lab bench', 'floor', true),
    piece('lab', 'periodic', '🧬', 'science poster', 'wall', true),
    piece('lab', 'scope', '🔬', 'microscope', 'floor', true),
    piece('lab', 'teslacoil', '⚡', 'tesla coil', 'floor', false),
    piece('lab', 'brainjar', '🧠', 'brain jar', 'floor', false),
    piece('lab', 'labcoat', '🥼', 'lab coat', 'wall', false),
    piece('winter', 'stovefire', '🔥', 'wood stove', 'floor', true),
    piece('winter', 'skisrack', '🎿', 'ski rack', 'wall', true),
    piece('winter', 'cocoapot', '☕', 'cocoa pot', 'floor', true, { eat: true }),
    piece('winter', 'snowmanstatue', '⛄', 'snowman', 'floor', false),
    piece('winter', 'quilt', '🛌', 'quilted bed', 'floor', false, { nap: true }),
    piece('winter', 'mittenline', '🧤', 'mitten line', 'wall', false),
    piece('jungle', 'hammockbed', '🌴', 'hammock', 'floor', true, { nap: true }),
    piece('jungle', 'bananabunch', '🍌', 'banana bunch', 'floor', true, { eat: true }),
    piece('jungle', 'drumbongo', '🪘', 'bongo drums', 'floor', true),
    piece('jungle', 'parrotperch', '🦜', 'parrot perch', 'wall', false),
    piece('jungle', 'waterfall', '💧', 'waterfall', 'wall', false),
    piece('jungle', 'tikitorch', '🔥', 'tiki torch', 'floor', false),
    piece('castle', 'thronechair', '👑', 'throne', 'floor', true),
    piece('castle', 'shieldwall', '🛡️', 'shield', 'wall', true),
    piece('castle', 'banquet', '🍖', 'banquet table', 'floor', true, { eat: true }),
    piece('castle', 'armour', '⚔️', 'suit of armour', 'floor', false),
    piece('castle', 'chandelier', '🕯️', 'chandelier', 'wall', false),
    piece('castle', 'fourposter', '🛏️', 'four-poster bed', 'floor', false, { nap: true }),
    piece('robots', 'charger', '🔋', 'charging pad', 'floor', true, { nap: true }),
    piece('robots', 'gearwall', '⚙️', 'gear wall', 'wall', true),
    piece('robots', 'workbench', '🛠️', 'workbench', 'floor', true),
    piece('robots', 'robotpal', '🤖', 'robot pal', 'floor', false),
    piece('robots', 'monitor', '🖥️', 'monitor', 'wall', false),
    piece('robots', 'oilcan', '🛢️', 'oil can', 'floor', false, { eat: true }),
    piece('desert', 'brasslamp', '🪔', 'brass lamp', 'floor', true),
    piece('desert', 'camelrug', '🐫', 'camel tapestry', 'wall', true),
    piece('desert', 'cactuspot', '🌵', 'potted cactus', 'floor', true),
    piece('desert', 'fruitbowl', '🍇', 'fruit bowl', 'floor', false, { eat: true }),
    piece('desert', 'silkbed', '🛏️', 'silk bed', 'floor', false, { nap: true }),
    piece('desert', 'sandtimer', '⏳', 'sand timer', 'floor', false),
    piece('sky', 'cloudbed', '☁️', 'cloud bed', 'floor', true, { nap: true }),
    piece('sky', 'windchimes', '🎐', 'wind chimes', 'wall', true),
    piece('sky', 'basket', '🧺', 'balloon basket', 'floor', true),
    piece('sky', 'rainbowarch', '🌈', 'rainbow', 'wall', false),
    piece('sky', 'kitewall', '🪁', 'kite', 'wall', false),
    piece('sky', 'teaset', '🍵', 'tea set', 'floor', false, { eat: true }),
    piece('vault', 'goldpile', '💰', 'pile of gold', 'floor', true, { nap: true }),
    piece('vault', 'jewelcase', '💎', 'jewel case', 'floor', true),
    piece('vault', 'crownwall', '👑', 'crown display', 'wall', true),
    piece('vault', 'safe', '🔐', 'safe', 'floor', false),
    piece('vault', 'goldmirror', '🪞', 'golden mirror', 'wall', false),
    piece('vault', 'goldplate', '🍽️', 'golden plates', 'floor', false, { eat: true }),
  ];

  function theme(bag, id, name, free, wall, trim, floor) {
    return { id, name, bag, free, wall, trim, floor };
  }

  /** Starter themes unlock by level; each bag gives its first and sells the others. */
  const THEMES = [
    { id: 'cozy', name: 'Cozy', level: 1, wall: '#3b3046', trim: '#4d3f5c', floor: '#5a4232' },
    { id: 'mint', name: 'Mint', level: 4, wall: '#2c4a44', trim: '#37605a', floor: '#6b5440' },
    { id: 'night', name: 'Night', level: 8, wall: '#1d2240', trim: '#2a3160', floor: '#3a3048' },
    { id: 'candy', name: 'Candy', level: 12, wall: '#5a2f4f', trim: '#74406a', floor: '#7a5a48' },
    { id: 'space', name: 'Space', level: 16, wall: '#0f1226', trim: '#1c2148', floor: '#2b2b3a' },
    theme('garden', 'leafy', 'Leafy', true, '#2f4a2a', '#3f6b38', '#6b4f2a'),
    theme('garden', 'terracotta', 'Terracotta', false, '#6b3a2a', '#8a4f38', '#5a4232'),
    theme('garden', 'meadow', 'Meadow', false, '#3a5a3a', '#5a8a4a', '#7a6a3a'),
    theme('ocean', 'driftwood', 'Driftwood', true, '#4a5a62', '#6a7a80', '#8a7a5a'),
    theme('ocean', 'coral', 'Coral', false, '#6a3a4a', '#8a4a5a', '#c8b890'),
    theme('ocean', 'deepsea', 'Deep sea', false, '#12304a', '#1c4a6a', '#a89870'),
    theme('kitchen', 'checkerboard', 'Checkerboard', true, '#4a2a2a', '#6a3a3a', '#c8c0b0'),
    theme('kitchen', 'copper', 'Copper', false, '#5a3a22', '#8a5a32', '#4a3a2a'),
    theme('kitchen', 'diner', 'Mint diner', false, '#2f5a52', '#4a8a7a', '#b8b0a0'),
    theme('music', 'neon', 'Neon', true, '#1a1030', '#ff2fa0', '#20202a'),
    theme('music', 'velvet', 'Velvet', false, '#4a1030', '#6a1a40', '#3a2020'),
    theme('music', 'vinylfloor', 'Vinyl', false, '#2a2a32', '#3a3a48', '#1a1a1a'),
    theme('sports', 'astroturf', 'Astroturf', true, '#2a3a4a', '#3a5a6a', '#2f7a3a'),
    theme('sports', 'courtwood', 'Court', false, '#3a2f4a', '#5a4a6a', '#a87a4a'),
    theme('sports', 'stadium', 'Stadium', false, '#1a2a4a', '#2a4a8a', '#3a5a3a'),
    theme('space', 'starfield', 'Starfield', true, '#0a0c1e', '#1a1e40', '#2a2a3a'),
    theme('space', 'hullmetal', 'Hull metal', false, '#3a4048', '#5a626c', '#2a2e34'),
    theme('space', 'crater', 'Moon crater', false, '#2a2a36', '#4a4a5a', '#6a6a72'),
    theme('spooky', 'haunted', 'Haunted', true, '#2a1a3a', '#3a2a4a', '#2a2020'),
    theme('spooky', 'cobweb', 'Cobweb', false, '#3a3a42', '#5a5a62', '#3a3028'),
    theme('spooky', 'pumpkinpatch', 'Pumpkin patch', false, '#3a1a0a', '#6a2f0a', '#3a2a1a'),
    theme('retro', 'synthwave', 'Synthwave', true, '#2a0a3a', '#ff4fd2', '#1a1030'),
    theme('retro', 'arcadecarpet', 'Arcade carpet', false, '#1a1a3a', '#3a3a8a', '#2a1a4a'),
    theme('retro', 'woodpanel', 'Wood panel', false, '#5a3a1a', '#7a5a2a', '#4a3a22'),
    theme('farm', 'barnred', 'Barn red', true, '#6a2020', '#8a3030', '#6a5030'),
    theme('farm', 'haystack', 'Haystack', false, '#7a6a2a', '#a89a4a', '#6a5a2a'),
    theme('farm', 'farmhouse', 'Farmhouse', false, '#8a7a60', '#a89880', '#6a4a2a'),
    theme('camping', 'pinewood', 'Pinewood', true, '#2a3a2a', '#3a5a3a', '#5a4a2a'),
    theme('camping', 'canvas', 'Canvas', false, '#6a5a3a', '#8a7a4a', '#4a3a2a'),
    theme('camping', 'starlit', 'Starlit', false, '#101830', '#1a2a50', '#2a3a2a'),
    theme('art', 'gallerygrey', 'Gallery', true, '#6a6a72', '#8a8a92', '#5a4a3a'),
    theme('art', 'splatter', 'Splatter', false, '#3a2a4a', '#ff4f7b', '#4a3a2a'),
    theme('art', 'easelwood', 'Easel wood', false, '#5a4030', '#7a5a40', '#3a2a20'),
    theme('lab', 'cleanroom', 'Clean room', true, '#4a6a7a', '#6a8a9a', '#8a929a'),
    theme('lab', 'circuitboard', 'Circuit board', false, '#1a3a2a', '#2a6a4a', '#1a2a1a'),
    theme('lab', 'blackboard', 'Blackboard', false, '#1f3a2f', '#3a5a4a', '#4a3a2a'),
    theme('winter', 'snowdrift', 'Snowdrift', true, '#6a809a', '#8aa0b8', '#c8d0d8'),
    theme('winter', 'cabinlog', 'Cabin log', false, '#5a3a22', '#7a5a32', '#4a3a28'),
    theme('winter', 'aurora', 'Aurora', false, '#0a2a3a', '#2affb0', '#1a2a3a'),
    theme('jungle', 'rainforest', 'Rainforest', true, '#1a3a1a', '#2a5a2a', '#3a2a1a'),
    theme('jungle', 'bamboo', 'Bamboo', false, '#5a6a2a', '#7a8a3a', '#6a5a2a'),
    theme('jungle', 'templestone', 'Temple stone', false, '#4a4a3a', '#6a6a52', '#3a3a2a'),
    theme('castle', 'stonehall', 'Stone hall', true, '#3a3a42', '#5a5a62', '#4a4038'),
    theme('castle', 'royalred', 'Royal red', false, '#5a1a1a', '#ffd23f', '#3a2a1a'),
    theme('castle', 'tapestry', 'Tapestry', false, '#2a2a5a', '#4a4a8a', '#4a3a2a'),
    theme('robots', 'chrome', 'Chrome', true, '#5a626c', '#8a929c', '#3a3e44'),
    theme('robots', 'oilslick', 'Oil slick', false, '#1a1a22', '#4a2a6a', '#2a2a30'),
    theme('robots', 'factory', 'Factory', false, '#4a4030', '#ffb02e', '#2a2a2a'),
    theme('desert', 'sandstone', 'Sandstone', true, '#8a6a3a', '#a8885a', '#a88850'),
    theme('desert', 'oasisteal', 'Oasis teal', false, '#2a5a5a', '#3a8a8a', '#a88850'),
    theme('desert', 'bazaarred', 'Bazaar', false, '#6a2a3a', '#c0392b', '#5a4030'),
    theme('sky', 'cloudwhite', 'Cloud white', true, '#6a88a8', '#a8c0d8', '#c8d4e0'),
    theme('sky', 'sunset', 'Sunset', false, '#a85a3a', '#e8a06a', '#6a4a6a'),
    theme('sky', 'stormy', 'Stormy', false, '#3a4250', '#5a6270', '#4a4a52'),
    theme('vault', 'goldleaf', 'Gold leaf', true, '#5a4a1a', '#ffd23f', '#3a2a1a'),
    theme('vault', 'emerald', 'Emerald', false, '#1a4a3a', '#2a8a6a', '#2a2a2a'),
    theme('vault', 'velvetvault', 'Velvet vault', false, '#3a1a4a', '#6a2a8a', '#2a1a2a'),
  ];

  const SKY = {
    winter: { sky: '#9db7d6', dots: '#ffffff' },
    spring: { sky: '#8fd0ff', dots: '#ffb7d5' },
    summer: { sky: '#5fb8ff', dots: '' },
    autumn: { sky: '#e8b07a', dots: '#d8662b' },
  };
  const NIGHT_SKY = { sky: '#0c1030', dots: '#ffffff' };

  /** The house that comes with a bag, and its rooms. */
  function houseOf(id) {
    return HOUSES.find((h) => h.id === id) || HOUSES[0];
  }

  /**
   * @param {{
   *   ctx: CanvasRenderingContext2D,
   *   main: () => any,
   *   petPx: (p: any) => number,
   *   view: () => {w: number, h: number},
   *   now: () => number,
   *   config: () => any,
   *   season: () => string,
   *   save: (layout: object) => void,
   *   bags: () => string[],
   *   unlocks: () => string[],
   *   toysOut: () => number[],
   * }} api
   */
  function create(api) {
    const ctx = api.ctx;
    const unlockId = root.PetVariants.unlockId;
    let open = false;
    /** Visiting an old save: look around, but nothing moves and nothing is saved. */
    let readOnly = false;
    let level = 1;
    /** @type {{at: {house: string, room: string, changedAt: number}, houses: Record<string, Record<string, any>>}} */
    let layout = { at: { house: 'starter', room: 'living', changedAt: 0 }, houses: {} };
    /** @type {null | {id: string, dx: number, dy: number}} */
    let drag = null;

    function levelsOn() {
      const cfg = api.config();
      return !cfg || cfg.levels !== false;
    }

    function bagOpen(bag) {
      return api.bags().includes(bag);
    }

    /** Starter pieces and themes by level; a bag's when it is open and free or bought. */
    function unlocked(thing, kind) {
      if (!thing.bag) {
        return !levelsOn() || thing.level <= level;
      }
      return (
        bagOpen(thing.bag) &&
        (thing.free || api.unlocks().includes(unlockId(thing.bag, kind, thing.id)))
      );
    }

    function roomOpen(house, i) {
      const room = house.rooms[i];
      return (
        !!room &&
        bagOpen(house.id) &&
        (i < 2 || api.unlocks().includes(unlockId(house.id, 'room', room.id)))
      );
    }

    function house() {
      return houseOf(layout.at.house);
    }

    /** The room being shown: where you were last, or the first room if that is locked. */
    function where() {
      const h = house();
      const i = h.rooms.findIndex((r) => r.id === layout.at.room);
      return roomOpen(h, i)
        ? { house: h, room: h.rooms[i] }
        : { house: HOUSES[0], room: HOUSES[0].rooms[0] };
    }

    /** The layout of the room being shown (an empty one if nothing is there yet). */
    function room() {
      const w = where();
      const rooms = layout.houses[w.house.id] || {};
      return rooms[w.room.id] || { items: [], theme: '', themeAt: 0 };
    }

    function setRoom(next) {
      const w = where();
      layout = {
        ...layout,
        houses: {
          ...layout.houses,
          [w.house.id]: { ...(layout.houses[w.house.id] || {}), [w.room.id]: next },
        },
      };
    }

    function defOf(id) {
      return FURNITURE.find((f) => f.id === id);
    }

    function placed() {
      return room().items.filter((i) => {
        const def = !i.removed && defOf(i.id);
        return def && unlocked(def, 'furniture');
      });
    }

    /** The room's theme, or its house's own if that is locked or unknown. */
    function themeNow() {
      const t = THEMES.find((x) => x.id === room().theme);
      if (t && unlocked(t, 'theme')) {
        return t;
      }
      const own = THEMES.find((x) => x.bag === where().house.id && x.free);
      return own && unlocked(own, 'theme') ? own : THEMES[0];
    }

    function geom() {
      const p = api.main();
      const size = api.petPx(p);
      const { w, h } = api.view();
      const floor = p.y + size - p.scale;
      return { p, size, w, h, floor, wallTop: 0, wallH: floor - size * 0.05 };
    }

    function itemPos(item, g) {
      const def = defOf(item.id);
      if (def && def.place === 'wall') {
        // The top of the wall is under the corner buttons and the furniture bar.
        return { x: item.x * g.w, y: g.wallH * (0.45 + 0.4 * item.y), s: g.size * 0.22 };
      }
      return { x: item.x * g.w, y: g.floor, s: g.size * 0.34 };
    }

    function persist() {
      if (!readOnly) {
        api.save(layout);
      }
    }

    function setLayout(next) {
      if (!drag && next && next.houses && next.at) {
        layout = next;
      }
    }

    /** Puts a piece in the room (or takes it out again). */
    function toggle(id) {
      const def = defOf(id);
      if (readOnly || !def || !unlocked(def, 'furniture')) {
        return;
      }
      const t = api.now();
      const items = room().items;
      const had = items.find((i) => i.id === id);
      const showing = had && !had.removed;
      const others = items.filter((i) => i.id !== id);
      if (showing) {
        setRoom({ ...room(), items: [...others, { ...had, removed: true, at: t }] });
      } else {
        // Somewhere along the floor (or wall) away from the middle, where the pet sits.
        const side = placed().length % 2 === 0 ? 0.15 : 0.85;
        const x = Math.min(0.95, Math.max(0.05, side + (Math.random() - 0.5) * 0.2));
        setRoom({ ...room(), items: [...others, { id, x, y: Math.random(), at: t }] });
      }
      persist();
    }

    function setTheme(id) {
      const t = THEMES.find((x) => x.id === id);
      if (!readOnly && t && unlocked(t, 'theme')) {
        setRoom({ ...room(), theme: id, themeAt: api.now() });
        persist();
      }
    }

    /** Goes to a room (the first open one of a house if `roomId` is missing). False if it is locked. */
    function goTo(houseId, roomId) {
      const h = HOUSES.find((x) => x.id === houseId);
      if (!h) {
        return false;
      }
      const i = roomId ? h.rooms.findIndex((r) => r.id === roomId) : 0;
      if (!roomOpen(h, i)) {
        return false;
      }
      drag = null;
      layout = { ...layout, at: { house: h.id, room: h.rooms[i].id, changedAt: api.now() } };
      persist();
      return true;
    }

    /** The previous or next open room of this house, for the room tabs' arrows. */
    function step(dir) {
      const h = where().house;
      const rooms = h.rooms.filter((_r, i) => roomOpen(h, i));
      const i = rooms.findIndex((r) => r.id === where().room.id);
      const next = rooms[(i + dir + rooms.length) % rooms.length];
      if (next) {
        goTo(h.id, next.id);
      }
    }

    /** The window's outline, for the sky clip and the frame. */
    function windowPath(shape, x, y, ww, wh) {
      ctx.beginPath();
      if (shape === 'round') {
        const r = Math.min(ww, wh) / 2;
        ctx.arc(x + ww / 2, y + wh / 2, r, 0, Math.PI * 2);
      } else if (shape === 'arch') {
        const r = ww / 2;
        ctx.moveTo(x, y + wh);
        ctx.lineTo(x, y + r);
        ctx.arc(x + r, y + r, r, Math.PI, 0);
        ctx.lineTo(x + ww, y + wh);
        ctx.closePath();
      } else {
        ctx.rect(x, y, ww, wh);
      }
    }

    function drawWindow(g) {
      const h = where().house;
      const big = h.window === 'glass' ? 1.35 : 1;
      const ww = Math.min(g.w * 0.26, g.size * 0.75) * big;
      const wh = Math.min(g.wallH * 0.4, ww * 0.8) * (h.window === 'arch' ? 1.25 : 1);
      const x = g.w * 0.06;
      const y = g.wallH * 0.38 - (h.window === 'arch' ? wh * 0.2 : 0);
      const sky = h.night ? NIGHT_SKY : SKY[api.season()] || SKY.spring;
      ctx.save();
      windowPath(h.window, x, y, ww, wh);
      ctx.clip();
      ctx.fillStyle = sky.sky;
      ctx.fillRect(x, y, ww, wh);
      if (sky.dots) {
        ctx.fillStyle = sky.dots;
        const t = h.night ? 0 : api.now() / 1000;
        for (let i = 0; i < (h.night ? 14 : 9); i++) {
          const dx = ((i * 37 + t * 8) % ww) | 0;
          const dy = ((i * 53 + t * (12 + i)) % wh) | 0;
          ctx.fillRect(x + dx, y + dy, 2, 2);
        }
      } else {
        ctx.fillStyle = '#ffe066';
        ctx.beginPath();
        ctx.arc(x + ww * 0.72, y + wh * 0.32, Math.max(3, ww * 0.1), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = h.night ? '#8a96a8' : '#d9c7a8';
      ctx.lineWidth = Math.max(2, ww * 0.04);
      windowPath(h.window, x, y, ww, wh);
      ctx.stroke();
      if (h.window === 'square' || h.window === 'glass') {
        ctx.beginPath();
        const cols = h.window === 'glass' ? 3 : 2;
        for (let c = 1; c < cols; c++) {
          ctx.moveTo(x + (ww * c) / cols, y);
          ctx.lineTo(x + (ww * c) / cols, y + wh);
        }
        ctx.moveTo(x, y + wh / 2);
        ctx.lineTo(x + ww, y + wh / 2);
        ctx.stroke();
      }
    }

    /** The room and its furniture, behind everything else. */
    function drawBack() {
      if (!open || !api.main()) {
        return;
      }
      const g = geom();
      const th = themeNow();
      ctx.save();
      ctx.fillStyle = th.wall;
      ctx.fillRect(0, 0, g.w, g.wallH);
      ctx.fillStyle = th.trim;
      ctx.fillRect(0, g.wallH - g.size * 0.04, g.w, g.size * 0.04);
      ctx.fillStyle = th.floor;
      ctx.fillRect(0, g.wallH, g.w, g.h - g.wallH);
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#000000';
      for (let x = 0; x < g.w; x += g.size * 0.35) {
        ctx.fillRect(x, g.wallH, 1, g.h - g.wallH);
      }
      ctx.globalAlpha = 1;
      drawWindow(g);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (const item of placed()) {
        const def = defOf(item.id);
        const at = itemPos(item, g);
        ctx.font = `${Math.round(at.s)}px sans-serif`;
        ctx.globalAlpha = drag && drag.id === item.id ? 0.7 : 1;
        ctx.fillText(def.emoji, at.x, at.y);
      }
      ctx.restore();
    }

    function itemAt(x, y) {
      if (!open || !api.main()) {
        return null;
      }
      const g = geom();
      // Topmost first: wall items, then floor items drawn later.
      return (
        [...placed()].reverse().find((item) => {
          const at = itemPos(item, g);
          return Math.abs(x - at.x) < at.s * 0.55 && y <= at.y && y >= at.y - at.s;
        }) || null
      );
    }

    function pointerDown(x, y) {
      const item = itemAt(x, y);
      if (!item || readOnly) {
        return false;
      }
      const g = geom();
      const at = itemPos(item, g);
      drag = { id: item.id, dx: x - at.x, dy: y - at.y };
      return true;
    }

    function pointerMove(x, y) {
      if (!drag) {
        return;
      }
      const g = geom();
      const item = room().items.find((i) => i.id === drag.id);
      const def = defOf(drag.id);
      if (!item || !def) {
        return;
      }
      item.x = Math.min(0.97, Math.max(0.03, (x - drag.dx) / g.w));
      if (def.place === 'wall') {
        item.y = Math.min(1, Math.max(0, ((y - drag.dy) / g.wallH - 0.45) / 0.4));
      }
    }

    function pointerUp() {
      if (!drag) {
        return false;
      }
      const item = room().items.find((i) => i.id === drag.id);
      if (item) {
        item.at = api.now();
      }
      drag = null;
      persist();
      return true;
    }

    /**
     * Where the room sends a resting pet, or null to let it wander. It naps
     * in its bed, and in a bedroom waits there; in a kitchen it waits by its
     * bowl. Nothing suitable placed, and it wanders as anywhere else.
     */
    function target(state) {
      if (!open || !api.main()) {
        return null;
      }
      const kind = where().room.kind;
      const find = (flag) => placed().find((i) => defOf(i.id)[flag]);
      const spot = (item) => (item ? item.x * api.view().w : null);
      if (state === 'sleeping' || kind === 'bed') {
        return spot(find('nap'));
      }
      if (kind === 'food') {
        return spot(find('eat'));
      }
      return null;
    }

    /** How a piece, theme or room is had: a level, or a bag's shop. */
    function how(thing) {
      if (!thing.bag) {
        return `unlocks at level ${thing.level}`;
      }
      const bag = root.PetScene.BAGS.find((b) => b.id === thing.bag);
      return `sold in the ${bag.emoji} ${bag.name} bag's shop`;
    }

    return {
      isOpen: () => open,
      setOpen: (on) => {
        open = !!on && api.config().house !== false;
        drag = null;
      },
      setLayout,
      layout: () => layout,
      setLevel: (n) => {
        level = Math.max(1, Number(n) || 1);
      },
      /** Visit mode: an old save's rooms to look round, never saved. */
      setReadOnly: (on) => {
        readOnly = !!on;
        drag = null;
      },
      toggle,
      setTheme,
      goTo,
      step,
      drawBack,
      pointerDown,
      pointerMove,
      pointerUp,
      target,
      /** The kind of room the pet is in, or null outside the house. */
      kind: () => (open ? where().room.kind : null),
      /** Tooltip for furniture under the mouse, or null. */
      hover: (x, y) => {
        const item = itemAt(x, y);
        const def = item && defOf(item.id);
        return def
          ? {
              title: `${def.emoji} ${def.name}`,
              sub: readOnly ? 'Just visiting' : 'Drag to move it',
            }
          : null;
      },
      /**
       * The catalogue for the panel: the houses, this house's rooms, and the
       * furniture and themes from the starter bag and every open bag.
       */
      catalogue: () => {
        const w = where();
        const shown = (thing) => !thing.bag || bagOpen(thing.bag);
        return {
          level,
          levelsOn: levelsOn(),
          readOnly,
          house: w.house,
          room: w.room,
          houses: HOUSES.map((h) => ({
            id: h.id,
            name: h.name,
            emoji: h.emoji,
            open: bagOpen(h.id),
            active: h.id === w.house.id,
          })),
          rooms: w.house.rooms.map((r, i) => ({
            ...r,
            unlocked: roomOpen(w.house, i),
            active: r.id === w.room.id,
            how: how({ bag: w.house.id }),
          })),
          furniture: FURNITURE.filter(shown).map((f) => ({
            ...f,
            unlocked: unlocked(f, 'furniture'),
            placed: placed().some((i) => i.id === f.id),
            how: how(f),
          })),
          themes: THEMES.filter(shown).map((t) => ({
            ...t,
            unlocked: unlocked(t, 'theme'),
            active: themeNow().id === t.id,
            how: how(t),
          })),
        };
      },
    };
  }

  root.PetHouse = { create, HOUSES, FURNITURE, THEMES };
})(this);
