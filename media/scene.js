// @ts-check
// The world around the pet: toys and furniture that turn up with a rarity,
// a machine for every test run or background job, critters to chase, and
// the scenery some animation variants need (hamster wheel, surfboard...).
// webview.js creates one instance and hands it a small API, like play.js.
(function (root) {
  'use strict';

  const RARITY = {
    common: { weight: 62, color: '', label: 'Common' },
    uncommon: { weight: 25, color: '#5ad17a', label: 'Uncommon' },
    rare: { weight: 10, color: '#4fa3ff', label: 'Rare' },
    legendary: { weight: 3, color: '#ffc93d', label: 'Legendary' },
    // Holiday toys never come up in the normal roll; see find().
    event: { weight: 0, color: '#ff8c2a', label: 'Holiday' },
  };

  /**
   * What a bag's shop charges, in that bag's spare toys of one rarity: an
   * animation costs 20 commons or 5 rares, a new food 100 commons, and
   * furniture, room themes, rooms and pet styles are priced in between.
   */
  const PRICES = {
    animation: [
      { rarity: 'common', n: 20 },
      { rarity: 'rare', n: 5 },
    ],
    food: [{ rarity: 'common', n: 100 }],
    furniture: [
      { rarity: 'common', n: 15 },
      { rarity: 'rare', n: 4 },
    ],
    theme: [
      { rarity: 'common', n: 15 },
      { rarity: 'rare', n: 4 },
    ],
    room: [
      { rarity: 'common', n: 30 },
      { rarity: 'rare', n: 8 },
    ],
    style: [
      { rarity: 'common', n: 25 },
      { rarity: 'rare', n: 6 },
    ],
  };

  /**
   * `kind` 'toy' things get flicked when clicked and chased; 'object' things
   * stay put and the pet comes over to use them. `use` decides what the pet
   * does with it; `floats` items hover instead of resting. These are the
   * starter bag's toys, plus the holiday toys (filed under it, though they
   * only turn up during their event, whichever bag is active).
   */
  const STARTER_TOYS = [
    { id: 'yarn', kind: 'toy', emoji: '🧶', name: 'ball of yarn', rarity: 'common', use: 'play' },
    {
      id: 'box',
      kind: 'object',
      emoji: '📦',
      name: 'cardboard box',
      rarity: 'common',
      use: 'hide',
    },
    { id: 'bone', kind: 'toy', emoji: '🦴', name: 'bone', rarity: 'common', use: 'chew' },
    { id: 'teddy', kind: 'toy', emoji: '🧸', name: 'teddy bear', rarity: 'common', use: 'cuddle' },
    { id: 'frisbee', kind: 'toy', emoji: '🥏', name: 'frisbee', rarity: 'common', use: 'play' },
    {
      id: 'plant',
      kind: 'object',
      emoji: '🪴',
      name: 'potted plant',
      rarity: 'common',
      use: 'sniff',
    },
    {
      id: 'balloon',
      kind: 'toy',
      emoji: '🎈',
      name: 'balloon',
      rarity: 'common',
      use: 'float',
      floats: true,
    },
    { id: 'chair', kind: 'object', emoji: '🪑', name: 'chair', rarity: 'uncommon', use: 'sit' },
    { id: 'couch', kind: 'object', emoji: '🛋️', name: 'couch', rarity: 'uncommon', use: 'sit' },
    { id: 'bed', kind: 'object', emoji: '🛏️', name: 'comfy bed', rarity: 'uncommon', use: 'nap' },
    { id: 'guitar', kind: 'object', emoji: '🎸', name: 'guitar', rarity: 'uncommon', use: 'music' },
    { id: 'drum', kind: 'object', emoji: '🥁', name: 'drum', rarity: 'uncommon', use: 'music' },
    {
      id: 'skateboard',
      kind: 'toy',
      emoji: '🛹',
      name: 'skateboard',
      rarity: 'uncommon',
      use: 'ride',
    },
    {
      id: 'kite',
      kind: 'toy',
      emoji: '🪁',
      name: 'kite',
      rarity: 'uncommon',
      use: 'float',
      floats: true,
    },
    {
      id: 'basketball',
      kind: 'toy',
      emoji: '🏀',
      name: 'basketball',
      rarity: 'uncommon',
      use: 'play',
    },
    { id: 'rocket', kind: 'toy', emoji: '🚀', name: 'toy rocket', rarity: 'rare', use: 'admire' },
    {
      id: 'arcade',
      kind: 'object',
      emoji: '🕹️',
      name: 'arcade stick',
      rarity: 'rare',
      use: 'game',
    },
    { id: 'tent', kind: 'object', emoji: '⛺', name: 'tent', rarity: 'rare', use: 'hide' },
    {
      id: 'ufo',
      kind: 'toy',
      emoji: '🛸',
      name: 'tiny UFO',
      rarity: 'rare',
      use: 'float',
      floats: true,
    },
    { id: 'castle', kind: 'object', emoji: '🏰', name: 'castle', rarity: 'rare', use: 'admire' },
    {
      id: 'crown',
      kind: 'object',
      emoji: '👑',
      name: 'golden crown',
      rarity: 'legendary',
      use: 'admire',
    },
    {
      id: 'gem',
      kind: 'object',
      emoji: '💎',
      name: 'giant diamond',
      rarity: 'legendary',
      use: 'admire',
    },
    {
      id: 'unicorn',
      kind: 'toy',
      emoji: '🦄',
      name: 'unicorn plush',
      rarity: 'legendary',
      use: 'cuddle',
    },
    {
      id: 'rainbow',
      kind: 'object',
      emoji: '🌈',
      name: 'pocket rainbow',
      rarity: 'legendary',
      use: 'admire',
    },
    // One per holiday event (see events.js). Found only while it is on; kept forever.
    {
      id: 'pumpkin',
      kind: 'object',
      emoji: '🎃',
      name: 'jack-o-lantern',
      rarity: 'event',
      use: 'admire',
      event: 'halloween',
    },
    {
      id: 'pie',
      kind: 'object',
      emoji: '🥧',
      name: 'pumpkin pie',
      rarity: 'event',
      use: 'sniff',
      event: 'thanksgiving',
    },
    {
      id: 'snowman',
      kind: 'object',
      emoji: '⛄',
      name: 'little snowman',
      rarity: 'event',
      use: 'admire',
      event: 'christmas',
    },
    {
      id: 'popper',
      kind: 'toy',
      emoji: '🎉',
      name: 'party popper',
      rarity: 'event',
      use: 'play',
      event: 'newyear',
    },
    {
      id: 'chocolates',
      kind: 'toy',
      emoji: '💝',
      name: 'box of chocolates',
      rarity: 'event',
      use: 'cuddle',
      event: 'valentine',
    },
    {
      id: 'egg',
      kind: 'toy',
      emoji: '🥚',
      name: 'painted egg',
      rarity: 'event',
      use: 'play',
      event: 'easter',
    },
  ];

  /** A toy for a bag's catalogue: see TOYS above for what the fields mean. */
  function toy(id, kind, emoji, name, rarity, use, floats) {
    return Object.assign({ id, kind, emoji, name, rarity, use }, floats ? { floats: true } : {});
  }

  /**
   * The bags, in level order (the levels are in src/bags.ts). New finds come
   * from the active bag, and each bag's shop takes only its own spares. The
   * first style comes with the bag; the others are sold in its shop. A
   * bag's `weights` override RARITY's for its finds.
   */
  const BAGS = [
    { id: 'starter', name: 'Starter', emoji: '🎒', toys: STARTER_TOYS, styles: [] },
    {
      id: 'garden',
      name: 'Garden',
      emoji: '🌻',
      styles: [
        { id: 'flowerCrown', name: 'flower crown' },
        { id: 'flowerCrownSunny', name: 'sunny flower crown' },
        { id: 'flowerCrownBluebell', name: 'bluebell flower crown' },
      ],
      toys: [
        toy('sunflower', 'object', '🌻', 'sunflower', 'common', 'sniff'),
        toy('tulip', 'object', '🌷', 'tulip', 'common', 'sniff'),
        toy('snail', 'toy', '🐌', 'snail plush', 'common', 'play'),
        toy('ladybug', 'toy', '🐞', 'ladybug', 'common', 'play'),
        toy('seedling', 'object', '🌱', 'seedling', 'common', 'sniff'),
        toy('mushroom', 'object', '🍄', 'toadstool', 'uncommon', 'sniff'),
        toy('hedgehog', 'toy', '🦔', 'hedgehog plush', 'uncommon', 'cuddle'),
        toy('bee', 'toy', '🐝', 'bumblebee', 'uncommon', 'float', true),
        toy('bucket', 'object', '🪣', 'garden bucket', 'uncommon', 'hide'),
        toy('oaktree', 'object', '🌳', 'little oak tree', 'rare', 'admire'),
        toy('butterfly', 'toy', '🦋', 'butterfly kite', 'rare', 'float', true),
        toy('lotus', 'object', '🪷', 'golden lotus', 'legendary', 'admire'),
      ],
    },
    {
      id: 'ocean',
      name: 'Ocean',
      emoji: '🌊',
      styles: [
        { id: 'snorkel', name: 'snorkel mask' },
        { id: 'snorkelCoral', name: 'coral snorkel mask' },
        { id: 'snorkelGold', name: 'golden snorkel mask' },
      ],
      toys: [
        toy('shell', 'object', '🐚', 'seashell', 'common', 'admire'),
        toy('crab', 'toy', '🦀', 'crab', 'common', 'play'),
        toy('coral', 'object', '🪸', 'coral', 'common', 'sniff'),
        toy('goldfish', 'toy', '🐠', 'tropical fish', 'common', 'play'),
        toy('volleyball', 'toy', '🏐', 'beach ball', 'common', 'play'),
        toy('lifering', 'toy', '🛟', 'rubber ring', 'uncommon', 'ride'),
        toy('octopus', 'toy', '🐙', 'octopus plush', 'uncommon', 'cuddle'),
        toy('jellyfish', 'toy', '🪼', 'jellyfish', 'uncommon', 'float', true),
        toy('anchor', 'object', '⚓', 'anchor', 'uncommon', 'admire'),
        toy('oyster', 'object', '🦪', 'pearl oyster', 'rare', 'admire'),
        toy('dolphin', 'toy', '🐬', 'dolphin plush', 'rare', 'cuddle'),
        toy('trident', 'object', '🔱', 'golden trident', 'legendary', 'admire'),
      ],
    },
    {
      id: 'kitchen',
      name: 'Kitchen',
      emoji: '🍳',
      styles: [
        { id: 'chefHat', name: 'chef hat' },
        { id: 'chefHatPink', name: 'pink chef hat' },
        { id: 'chefHatBlack', name: 'black chef hat' },
      ],
      toys: [
        toy('spoon', 'toy', '🥄', 'wooden spoon', 'common', 'chew'),
        toy('teapot', 'object', '🫖', 'teapot', 'common', 'sniff'),
        toy('cupcake', 'object', '🧁', 'cupcake', 'common', 'sniff'),
        toy('pan', 'object', '🍳', 'frying pan', 'common', 'sniff'),
        toy('donut', 'toy', '🍩', 'donut ring', 'common', 'play'),
        toy('cookie', 'toy', '🍪', 'giant cookie', 'uncommon', 'chew'),
        toy('pretzel', 'toy', '🥨', 'pretzel', 'uncommon', 'chew'),
        toy('honey', 'object', '🍯', 'honey pot', 'uncommon', 'sniff'),
        toy('baguette', 'toy', '🥖', 'baguette', 'uncommon', 'chew'),
        toy('birthdaycake', 'object', '🎂', 'birthday cake', 'rare', 'admire'),
        toy('pizza', 'toy', '🍕', 'pizza slice plush', 'rare', 'chew'),
        toy('croissant', 'object', '🥐', 'golden croissant', 'legendary', 'admire'),
      ],
    },
    {
      id: 'music',
      name: 'Music',
      emoji: '🎵',
      styles: [
        { id: 'rockShades', name: 'rock-star shades' },
        { id: 'rockShadesGold', name: 'gold rock-star shades' },
        { id: 'rockShadesNeon', name: 'neon rock-star shades' },
      ],
      toys: [
        toy('maracas', 'toy', '🪇', 'maracas', 'common', 'play'),
        toy('notes', 'toy', '🎶', 'floating notes', 'common', 'float', true),
        toy('banjo', 'object', '🪕', 'banjo', 'common', 'music'),
        toy('flute', 'object', '🪈', 'flute', 'common', 'music'),
        toy('bell', 'toy', '🔔', 'jingle bell', 'common', 'play'),
        toy('trumpet', 'object', '🎺', 'trumpet', 'uncommon', 'music'),
        toy('vinyl', 'toy', '💿', 'vinyl record', 'uncommon', 'play'),
        toy('microphone', 'object', '🎤', 'microphone', 'uncommon', 'music'),
        toy('violin', 'object', '🎻', 'violin', 'uncommon', 'music'),
        toy('saxophone', 'object', '🎷', 'saxophone', 'rare', 'music'),
        toy('accordion', 'object', '🪗', 'accordion', 'rare', 'music'),
        toy('goldmic', 'object', '🎙️', 'golden microphone', 'legendary', 'music'),
      ],
    },
    {
      id: 'sports',
      name: 'Sports',
      emoji: '⚽',
      styles: [
        { id: 'sweatband', name: 'sweatband' },
        { id: 'sweatbandBlue', name: 'blue sweatband' },
        { id: 'sweatbandGreen', name: 'green sweatband' },
      ],
      toys: [
        toy('soccerball', 'toy', '⚽', 'soccer ball', 'common', 'play'),
        toy('tennisball', 'toy', '🎾', 'tennis ball', 'common', 'play'),
        toy('baseball', 'toy', '⚾', 'baseball', 'common', 'play'),
        toy('shuttlecock', 'toy', '🏸', 'shuttlecock', 'common', 'play'),
        toy('football', 'toy', '🏈', 'football', 'common', 'chew'),
        toy('paddle', 'toy', '🏓', 'ping-pong paddle', 'uncommon', 'play'),
        toy('bowling', 'object', '🎳', 'bowling pins', 'uncommon', 'admire'),
        toy('hockey', 'toy', '🏒', 'hockey stick', 'uncommon', 'play'),
        toy('glove', 'toy', '🥊', 'boxing glove', 'uncommon', 'chew'),
        toy('medal', 'object', '🏅', 'gold medal', 'rare', 'admire'),
        toy('skis', 'toy', '🎿', 'skis', 'rare', 'ride'),
        toy('goldcup', 'object', '🏆', 'champion cup', 'legendary', 'admire'),
      ],
    },
    {
      id: 'space',
      name: 'Space',
      emoji: '🪐',
      styles: [
        { id: 'spaceHelmet', name: 'space helmet' },
        { id: 'spaceHelmetGold', name: 'golden space helmet' },
        { id: 'spaceHelmetPink', name: 'pink space helmet' },
      ],
      toys: [
        toy('planet', 'toy', '🪐', 'ringed planet', 'common', 'float', true),
        toy('moon', 'object', '🌙', 'crescent moon', 'common', 'admire'),
        toy('star', 'toy', '⭐', 'shooting star', 'common', 'float', true),
        toy('comet', 'toy', '☄️', 'comet', 'common', 'float', true),
        toy('alien', 'toy', '👽', 'alien plush', 'common', 'cuddle'),
        toy('satellite', 'toy', '🛰️', 'satellite', 'uncommon', 'float', true),
        toy('galaxy', 'object', '🌌', 'pocket galaxy', 'uncommon', 'admire'),
        toy('meteor', 'toy', '🌠', 'meteor', 'uncommon', 'float', true),
        toy('moonrock', 'object', '🪨', 'moon rock', 'uncommon', 'sniff'),
        toy('earth', 'toy', '🌍', 'tiny Earth', 'rare', 'play'),
        toy('sun', 'object', '☀️', 'pocket sun', 'rare', 'admire'),
        toy('blackhole', 'object', '🕳️', 'black hole', 'legendary', 'hide'),
      ],
    },
    {
      id: 'spooky',
      name: 'Spooky',
      emoji: '👻',
      styles: [
        { id: 'vampireCape', name: 'vampire cape' },
        { id: 'vampireCapeBlue', name: 'midnight vampire cape' },
        { id: 'vampireCapeGreen', name: 'goblin vampire cape' },
      ],
      toys: [
        toy('candle', 'object', '🕯️', 'candle', 'common', 'sniff'),
        toy('bat', 'toy', '🦇', 'bat plush', 'common', 'float', true),
        toy('spider', 'toy', '🕷️', 'toy spider', 'common', 'play'),
        toy('skull', 'object', '💀', 'grinning skull', 'common', 'admire'),
        toy('web', 'object', '🕸️', 'cobweb', 'common', 'admire'),
        toy('potion', 'object', '🧪', 'bubbling potion', 'uncommon', 'sniff'),
        toy('ghost', 'toy', '👻', 'friendly ghost', 'uncommon', 'float', true),
        toy('coffin', 'object', '⚰️', 'comfy coffin', 'uncommon', 'nap'),
        toy('broom', 'toy', '🧹', 'witch broom', 'uncommon', 'ride'),
        toy('crystalball', 'object', '🔮', 'crystal ball', 'rare', 'admire'),
        toy('wand', 'toy', '🪄', 'magic wand', 'rare', 'play'),
        toy('tombstone', 'object', '🪦', 'haunted tombstone', 'legendary', 'admire'),
      ],
    },
    {
      id: 'retro',
      name: 'Retro tech',
      emoji: '💾',
      styles: [
        { id: 'retroVisor', name: 'retro visor' },
        { id: 'retroVisorGreen', name: 'green-screen visor' },
        { id: 'retroVisorPink', name: 'synthwave visor' },
      ],
      toys: [
        toy('floppy', 'toy', '💾', 'floppy disk', 'common', 'play'),
        toy('cassette', 'toy', '📼', 'cassette tape', 'common', 'play'),
        toy('pager', 'toy', '📟', 'pager', 'common', 'chew'),
        toy('abacus', 'object', '🧮', 'abacus', 'common', 'game'),
        toy('dvd', 'toy', '📀', 'shiny disc', 'common', 'play'),
        toy('gamepad', 'object', '🎮', 'game pad', 'uncommon', 'game'),
        toy('crt', 'object', '📺', 'CRT telly', 'uncommon', 'game'),
        toy('rotary', 'object', '☎️', 'rotary phone', 'uncommon', 'admire'),
        toy('camera', 'object', '📷', 'film camera', 'uncommon', 'admire'),
        toy('desktop', 'object', '🖥️', 'retro computer', 'rare', 'game'),
        toy('minidisc', 'toy', '💽', 'minidisc', 'rare', 'play'),
        toy('trackball', 'object', '🖲️', 'golden trackball', 'legendary', 'game'),
      ],
    },
    {
      id: 'farm',
      name: 'Farm',
      emoji: '🚜',
      styles: [
        { id: 'strawHat', name: 'straw hat' },
        { id: 'strawHatRed', name: 'red-band straw hat' },
        { id: 'strawHatBlue', name: 'blue-band straw hat' },
      ],
      toys: [
        toy('chick', 'toy', '🐤', 'chick plush', 'common', 'cuddle'),
        toy('hay', 'object', '🌾', 'hay bale', 'common', 'nap'),
        toy('corn', 'toy', '🌽', 'corn cob', 'common', 'chew'),
        toy('carrot', 'toy', '🥕', 'carrot', 'common', 'chew'),
        toy('apple', 'toy', '🍎', 'apple', 'common', 'play'),
        toy('tractor', 'toy', '🚜', 'toy tractor', 'uncommon', 'ride'),
        toy('piglet', 'toy', '🐖', 'piglet plush', 'uncommon', 'cuddle'),
        toy('milkcan', 'object', '🥛', 'milk can', 'uncommon', 'sniff'),
        toy('sheep', 'toy', '🐑', 'woolly sheep', 'uncommon', 'cuddle'),
        toy('cow', 'toy', '🐄', 'cow plush', 'rare', 'cuddle'),
        toy('horse', 'toy', '🐴', 'rocking horse', 'rare', 'ride'),
        toy('rooster', 'object', '🐓', 'golden rooster', 'legendary', 'admire'),
      ],
    },
    {
      id: 'camping',
      name: 'Camping',
      emoji: '🏕️',
      styles: [
        { id: 'rangerHat', name: 'ranger hat' },
        { id: 'rangerHatGreen', name: 'forest ranger hat' },
        { id: 'rangerHatRed', name: 'red ranger hat' },
      ],
      toys: [
        toy('sausage', 'toy', '🌭', 'campfire sausage', 'common', 'chew'),
        toy('lantern', 'object', '🏮', 'paper lantern', 'common', 'admire'),
        toy('compass', 'toy', '🧭', 'compass', 'common', 'play'),
        toy('chestnut', 'toy', '🌰', 'chestnut', 'common', 'chew'),
        toy('log', 'object', '🪵', 'log seat', 'common', 'sit'),
        toy('canoe', 'toy', '🛶', 'canoe', 'uncommon', 'ride'),
        toy('backpack', 'object', '🎒', 'big backpack', 'uncommon', 'hide'),
        toy('campfire', 'object', '🔥', 'campfire', 'uncommon', 'admire'),
        toy('fishingrod', 'toy', '🎣', 'fishing rod', 'uncommon', 'play'),
        toy('map', 'object', '🗺️', 'treasure map', 'rare', 'admire'),
        toy('flashlight', 'toy', '🔦', 'flashlight', 'rare', 'play'),
        toy('bear', 'toy', '🐻', 'golden bear plush', 'legendary', 'cuddle'),
      ],
    },
    {
      id: 'art',
      name: 'Art studio',
      emoji: '🎨',
      styles: [
        { id: 'beret', name: 'beret' },
        { id: 'beretBlue', name: 'blue beret' },
        { id: 'beretGreen', name: 'green beret' },
      ],
      toys: [
        toy('crayon', 'toy', '🖍️', 'crayon', 'common', 'chew'),
        toy('paintbrush', 'toy', '🖌️', 'paintbrush', 'common', 'play'),
        toy('pencil', 'toy', '✏️', 'pencil', 'common', 'chew'),
        toy('scissors', 'object', '✂️', 'safety scissors', 'common', 'admire'),
        toy('palette', 'object', '🎨', 'paint palette', 'common', 'admire'),
        toy('framed', 'object', '🖼️', 'framed sketch', 'uncommon', 'admire'),
        toy('vase', 'object', '🏺', 'clay pot', 'uncommon', 'admire'),
        toy('thread', 'toy', '🧵', 'spool of thread', 'uncommon', 'play'),
        toy('sketchbook', 'object', '📓', 'sketchbook', 'uncommon', 'admire'),
        toy('sculpture', 'object', '🗿', 'stone head', 'rare', 'admire'),
        toy('masks', 'object', '🎭', 'theatre masks', 'rare', 'admire'),
        toy('masterpiece', 'object', '🌅', 'sunset masterpiece', 'legendary', 'admire'),
      ],
    },
    {
      id: 'lab',
      name: 'Science lab',
      emoji: '🔬',
      styles: [
        { id: 'labGoggles', name: 'lab goggles' },
        { id: 'labGogglesGreen', name: 'green lab goggles' },
        { id: 'labGogglesPink', name: 'pink lab goggles' },
      ],
      toys: [
        toy('testtube', 'toy', '🧪', 'test tube', 'common', 'play'),
        toy('magnet', 'toy', '🧲', 'magnet', 'common', 'play'),
        toy('petri', 'object', '🧫', 'petri dish', 'common', 'sniff'),
        toy('goggles', 'toy', '🥽', 'safety goggles', 'common', 'play'),
        toy('atom', 'toy', '⚛️', 'atom model', 'common', 'float', true),
        toy('microscope', 'object', '🔬', 'microscope', 'uncommon', 'admire'),
        toy('dna', 'object', '🧬', 'DNA model', 'uncommon', 'admire'),
        toy('thermometer', 'object', '🌡️', 'thermometer', 'uncommon', 'admire'),
        toy('lightbulb', 'object', '💡', 'bright idea', 'uncommon', 'admire'),
        toy('brain', 'toy', '🧠', 'squishy brain', 'rare', 'cuddle'),
        toy('microbe', 'toy', '🦠', 'microbe plush', 'rare', 'float', true),
        toy('lightning', 'object', '⚡', 'bottled lightning', 'legendary', 'admire'),
      ],
    },
    {
      id: 'winter',
      name: 'Winter',
      emoji: '❄️',
      styles: [
        { id: 'earmuffs', name: 'earmuffs' },
        { id: 'earmuffsBlue', name: 'icy earmuffs' },
        { id: 'earmuffsGreen', name: 'pine earmuffs' },
      ],
      toys: [
        toy('snowflake', 'toy', '❄️', 'snowflake', 'common', 'float', true),
        toy('mittens', 'toy', '🧤', 'mittens', 'common', 'chew'),
        toy('cocoa', 'object', '☕', 'hot cocoa', 'common', 'sniff'),
        toy('knitscarf', 'toy', '🧣', 'knitted scarf', 'common', 'play'),
        toy('icecube', 'toy', '🧊', 'ice cube', 'common', 'play'),
        toy('sled', 'toy', '🛷', 'sled', 'uncommon', 'ride'),
        toy('skates', 'toy', '⛸️', 'ice skates', 'uncommon', 'ride'),
        toy('snowcloud', 'toy', '🌨️', 'snow cloud', 'uncommon', 'float', true),
        toy('penguin', 'toy', '🐧', 'penguin plush', 'uncommon', 'cuddle'),
        toy('mountain', 'object', '🏔️', 'snowy peak', 'rare', 'admire'),
        toy('reindeer', 'toy', '🦌', 'reindeer plush', 'rare', 'cuddle'),
        toy('frostgem', 'object', '💠', 'frost crystal', 'legendary', 'admire'),
      ],
    },
    {
      id: 'jungle',
      name: 'Jungle',
      emoji: '🌴',
      styles: [
        { id: 'explorerHat', name: 'explorer hat' },
        { id: 'explorerHatGreen', name: 'jungle-green explorer hat' },
        { id: 'explorerHatWhite', name: 'white explorer hat' },
      ],
      toys: [
        toy('banana', 'toy', '🍌', 'banana', 'common', 'chew'),
        toy('coconut', 'toy', '🥥', 'coconut', 'common', 'play'),
        toy('leaf', 'object', '🌿', 'big leaf', 'common', 'sniff'),
        toy('monkey', 'toy', '🐒', 'monkey plush', 'common', 'cuddle'),
        toy('frog', 'toy', '🐸', 'tree frog', 'common', 'play'),
        toy('parrot', 'toy', '🦜', 'parrot', 'uncommon', 'float', true),
        toy('palm', 'object', '🌴', 'palm tree', 'uncommon', 'admire'),
        toy('snake', 'toy', '🐍', 'snake plush', 'uncommon', 'cuddle'),
        toy('pineapple', 'toy', '🍍', 'pineapple', 'uncommon', 'play'),
        toy('tiger', 'toy', '🐅', 'tiger plush', 'rare', 'cuddle'),
        toy('bongo', 'object', '🪘', 'bongo drum', 'rare', 'music'),
        toy('sloth', 'toy', '🦥', 'golden sloth', 'legendary', 'cuddle'),
      ],
    },
    {
      id: 'castle',
      name: 'Castle',
      emoji: '🏰',
      styles: [
        { id: 'knightHelm', name: 'knight helm' },
        { id: 'knightHelmGold', name: 'golden knight helm' },
        { id: 'knightHelmBlack', name: 'black knight helm' },
      ],
      toys: [
        toy('shield', 'object', '🛡️', 'shield', 'common', 'admire'),
        toy('sword', 'toy', '🗡️', 'wooden sword', 'common', 'play'),
        toy('banner', 'object', '🚩', 'banner', 'common', 'admire'),
        toy('parchment', 'object', '📜', 'royal decree', 'common', 'admire'),
        toy('oldkey', 'toy', '🗝️', 'old key', 'common', 'play'),
        toy('bowarrow', 'toy', '🏹', 'bow and arrow', 'uncommon', 'play'),
        toy('swords', 'object', '⚔️', 'crossed swords', 'uncommon', 'admire'),
        toy('horn', 'object', '📯', 'herald horn', 'uncommon', 'music'),
        toy('chess', 'object', '♟️', 'chess set', 'uncommon', 'game'),
        toy('dragonegg', 'object', '🥚', 'dragon egg', 'rare', 'admire'),
        toy('goblet', 'object', '🍵', 'royal goblet', 'rare', 'sniff'),
        toy('dragon', 'toy', '🐉', 'dragon plush', 'legendary', 'cuddle'),
      ],
    },
    {
      id: 'robots',
      name: 'Robots',
      emoji: '🤖',
      styles: [
        { id: 'antenna', name: 'robot antenna' },
        { id: 'antennaRed', name: 'red robot antenna' },
        { id: 'antennaBlue', name: 'blue robot antenna' },
      ],
      toys: [
        toy('gear', 'toy', '⚙️', 'gear', 'common', 'play'),
        toy('bolt', 'toy', '🔩', 'nut and bolt', 'common', 'chew'),
        toy('battery', 'object', '🔋', 'battery', 'common', 'admire'),
        toy('spanner', 'toy', '🔧', 'spanner', 'common', 'play'),
        toy('plug', 'toy', '🔌', 'plug', 'common', 'play'),
        toy('robot', 'toy', '🤖', 'robot pal', 'uncommon', 'cuddle'),
        toy('radar', 'object', '📡', 'radar dish', 'uncommon', 'admire'),
        toy('robotarm', 'object', '🦾', 'robot arm', 'uncommon', 'admire'),
        toy('toolbox', 'object', '🧰', 'toolbox', 'uncommon', 'hide'),
        toy('controls', 'object', '🎛️', 'control panel', 'rare', 'game'),
        toy('robotleg', 'object', '🦿', 'robot leg', 'rare', 'admire'),
        toy('goldbot', 'toy', '🤖', 'golden robot', 'legendary', 'cuddle'),
      ],
    },
    {
      id: 'desert',
      name: 'Desert',
      emoji: '🌵',
      styles: [
        { id: 'headwrap', name: 'desert headwrap' },
        { id: 'headwrapBlue', name: 'indigo headwrap' },
        { id: 'headwrapRed', name: 'red headwrap' },
      ],
      toys: [
        toy('cactus', 'object', '🌵', 'cactus', 'common', 'sniff'),
        toy('hourglass', 'object', '⏳', 'sand timer', 'common', 'admire'),
        toy('scarab', 'toy', '🪲', 'scarab beetle', 'common', 'play'),
        toy('lizard', 'toy', '🦎', 'lizard', 'common', 'play'),
        toy('scorpion', 'toy', '🦂', 'scorpion plush', 'common', 'play'),
        toy('camel', 'toy', '🐫', 'camel plush', 'uncommon', 'cuddle'),
        toy('oillamp', 'object', '🪔', 'magic lamp', 'uncommon', 'admire'),
        toy('sunhat', 'toy', '👒', 'sun hat', 'uncommon', 'play'),
        toy('pot', 'object', '🫙', 'sand jar', 'uncommon', 'sniff'),
        toy('mirage', 'object', '🏜️', 'mirage', 'rare', 'admire'),
        toy('sandcastle', 'object', '🏯', 'sand palace', 'rare', 'hide'),
        toy('goldlion', 'object', '🦁', 'golden lion', 'legendary', 'admire'),
      ],
    },
    {
      id: 'sky',
      name: 'Sky',
      emoji: '☁️',
      styles: [
        { id: 'aviator', name: 'aviator cap' },
        { id: 'aviatorRed', name: 'red aviator cap' },
        { id: 'aviatorBlue', name: 'blue aviator cap' },
      ],
      toys: [
        toy('cloud', 'toy', '☁️', 'cloud pillow', 'common', 'float', true),
        toy('plane', 'toy', '✈️', 'paper plane', 'common', 'float', true),
        toy('feather', 'toy', '🪶', 'feather', 'common', 'play'),
        toy('windchime', 'object', '🎐', 'wind chime', 'common', 'music'),
        toy('umbrella', 'toy', '☂️', 'umbrella', 'common', 'float', true),
        toy('parachute', 'toy', '🪂', 'parachute', 'uncommon', 'float', true),
        toy('eagle', 'toy', '🦅', 'eagle', 'uncommon', 'float', true),
        toy('tornado', 'object', '🌪️', 'tiny tornado', 'uncommon', 'admire'),
        toy('swan', 'toy', '🦢', 'swan plush', 'uncommon', 'cuddle'),
        toy('helicopter', 'toy', '🚁', 'toy helicopter', 'rare', 'float', true),
        toy('thundercloud', 'object', '⛈️', 'thundercloud', 'rare', 'admire'),
        toy('skywhale', 'toy', '🐋', 'sky whale', 'legendary', 'float', true),
      ],
    },
    {
      id: 'vault',
      name: 'Legendary vault',
      emoji: '💎',
      weights: { common: 30, uncommon: 26, rare: 24, legendary: 20 },
      styles: [
        { id: 'halo', name: 'golden halo' },
        { id: 'haloPink', name: 'rose halo' },
        { id: 'haloBlue', name: 'sapphire halo' },
      ],
      toys: [
        toy('coin', 'toy', '🪙', 'gold coin', 'common', 'play'),
        toy('moneybag', 'object', '💰', 'bag of gold', 'common', 'admire'),
        toy('vaultkey', 'toy', '🔑', 'vault key', 'common', 'play'),
        toy('ring', 'object', '💍', 'diamond ring', 'common', 'admire'),
        toy('necklace', 'object', '📿', 'pearl necklace', 'common', 'admire'),
        toy('ticket', 'object', '🎫', 'golden ticket', 'uncommon', 'admire'),
        toy('giftbox', 'object', '🎁', 'jewel box', 'uncommon', 'hide'),
        toy('ribbon', 'object', '🎖️', 'hero ribbon', 'uncommon', 'admire'),
        toy('servicebell', 'object', '🛎️', 'golden bell', 'uncommon', 'music'),
        toy('starjewel', 'object', '🌟', 'star jewel', 'rare', 'admire'),
        toy('goldcarp', 'toy', '🎏', 'golden carp kite', 'rare', 'float', true),
        toy('diamondheart', 'object', '💖', 'diamond heart', 'legendary', 'admire'),
        toy('goldsun', 'object', '🌞', 'golden sun', 'legendary', 'admire'),
        toy('phoenix', 'toy', '🐦', 'phoenix plush', 'legendary', 'cuddle'),
      ],
    },
  ];

  /** Every toy in every bag, in bag then catalogue order, each knowing its bag. */
  const TOYS = BAGS.flatMap((bag) => bag.toys.map((t) => Object.assign({ bag: bag.id }, t)));

  /** Chance that a find while a holiday is on is that holiday's toy (higher until you have it). */
  const EVENT_FIND = { missing: 0.6, owned: 0.2 };

  const USE_LABEL = {
    play: 'playing with the',
    hide: 'hiding in the',
    chew: 'chewing the',
    cuddle: 'cuddling the',
    sniff: 'sniffing the',
    float: 'jumping for the',
    sit: 'lounging on the',
    nap: 'napping on the',
    music: 'jamming on the',
    ride: 'riding the',
    admire: 'admiring the',
    game: 'gaming on the',
  };

  /** Uses where the pet stands on (or in) the toy rather than beside it. */
  const ON_TOP = new Set(['sit', 'nap', 'ride', 'hide']);

  const MACHINE_POOLS = {
    test: ['washer', 'oven', 'microwave', 'computer', 'engine'],
    build: ['engine', 'oven', 'computer'],
    server: ['server', 'computer'],
    job: ['computer', 'engine', 'washer', 'server', 'microwave'],
  };

  const MACHINE_NAMES = {
    washer: 'washing machine',
    oven: 'oven',
    microwave: 'microwave',
    computer: 'computer',
    engine: 'engine',
    server: 'server rack',
  };

  /**
   * Critters idle hobbies chase or watch. `passes` ones fly straight across
   * the sky; `ground` ones creep along the floor at that speed; the rest
   * flutter round the pet.
   */
  const CRITTERS = {
    butterfly: { emoji: '🦋', flap: true },
    bee: { emoji: '🐝', flap: true },
    bat: { emoji: '🦇', flap: true },
    bird: { emoji: '🐦', passes: true },
    parrot: { emoji: '🦜', passes: true },
    snail: { emoji: '🐌', ground: 0.25 },
    crab: { emoji: '🦀', ground: 1 },
    chick: { emoji: '🐤', ground: 0.6 },
  };

  /** Themed scenery drawn as a big emoji beside the pet (see scenery()). */
  const EMOJI_SCENERY = {
    planter: '🪴',
    sandcastle: '🏰',
    drumkit: '🥁',
    goal: '🥅',
    cauldron: '🫕',
    campfire: '🔥',
    easel: '🖼️',
    snowman: '⛄',
    robotarm: '🦾',
  };

  /** Every scenery name scenery() draws; animation variants may only use these. */
  const SCENERY = [
    'box',
    'bed',
    'perch',
    'wheel',
    'surfboard',
    'dish',
    'chalkboard',
    'books',
    ...Object.keys(EMOJI_SCENERY),
  ];

  /** At most this many toys are out of the bag at once. */
  const MAX_OUT = 3;
  const MAX_MACHINES = 4;
  /** How long a store-into-the-bag flight takes, ms. */
  const STORE_MS = 650;

  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function bagOf(id) {
    return BAGS.find((b) => b.id === id) || BAGS[0];
  }

  /**
   * Weighted rarity roll (with the bag's own weights, if it has them), then
   * one of the bag's toys of that rarity. A bag with none of that rarity
   * gives one of its lowest rarity instead.
   */
  function rollToy(rand, bagId) {
    const bag = bagOf(bagId);
    const tiers = Object.entries(RARITY).map(([name, r]) => [
      name,
      (bag.weights && bag.weights[name]) || r.weight,
    ]);
    const total = tiers.reduce((n, [, w]) => n + w, 0);
    let r = rand() * total;
    let tier = tiers[0][0];
    for (const [name, w] of tiers) {
      r -= w;
      if (r < 0) {
        tier = name;
        break;
      }
    }
    const mine = bag.toys.filter((t) => t.rarity !== 'event');
    let pool = mine.filter((t) => t.rarity === tier);
    if (pool.length === 0) {
      const lowest = tiers.find(([name]) => mine.some((t) => t.rarity === name));
      pool = mine.filter((t) => t.rarity === lowest[0]);
    }
    const pick = pool[Math.floor(rand() * pool.length)];
    return TOYS.find((t) => t.id === pick.id);
  }

  /**
   * @param {{
   *   ctx: CanvasRenderingContext2D,
   *   main: () => any,
   *   petPx: (p: any) => number,
   *   view: () => {w: number, h: number},
   *   now: () => number,
   *   emit: (part: object) => void,
   *   config: () => any,
   *   playing: () => boolean,
   *   onBag: (bag: Record<string, number>) => void,
   *   onSpent: (spent: Record<string, number>) => void,
   *   onFound: (toy: any) => void,
   *   events: () => string[],
   *   activeBag: () => string,
   * }} api
   */
  function create(api) {
    const ctx = api.ctx;
    /** @type {any[]} */
    let toys = [];
    /** @type {any[]} */
    let machines = [];
    /** @type {any} */
    let use = null;
    /** @type {any} */
    let critter = null;
    /** @type {any} */
    let banner = null;
    /** The inventory: toy id -> how many have been found. */
    /** @type {Map<string, number>} */
    const bag = new Map();
    /** Toy id -> how many were traded in at the shop. Both counts only grow. */
    /** @type {Map<string, number>} */
    const spent = new Map();
    /** While visiting an old save: its bag, which the pet plays from. Nothing is found or saved. */
    /** @type {Map<string, number> | null} */
    let visiting = null;
    let nextFind = api.now() + rnd(8000, 15000);
    let toysWereOn = true;
    let pose = null;
    let target = null;
    let lift = 0;

    function geom() {
      const p = api.main();
      const size = api.petPx(p);
      return { p, size, s: p.scale, cx: p.x + p.wx + size / 2, floor: p.y + size - p.scale };
    }

    function toySize(g) {
      return g.size * 0.3;
    }

    function toyY(toy, g) {
      const base = toy.def.floats ? g.size * 0.55 + Math.sin(api.now() / 600 + toy.seed) * 4 : 0;
      return g.floor - toySize(g) * 0.5 - base - toy.h;
    }

    function say(text, color, ms) {
      banner = { text, color, until: api.now() + ms, start: api.now() };
    }

    // -- Toys and the bag -------------------------------------------------------
    // Every find goes straight into the bag. Toys only spend a while on the
    // floor (a fresh find, one the pet pulls out to play with, or one you take
    // out) and then fly back into the bag.

    /** Where the bag button sits, in canvas coordinates. */
    function bagSpot() {
      return { x: api.view().w - 51, y: 19 };
    }

    function saveBag() {
      api.onBag(Object.fromEntries(bag));
    }

    /** The bag being shown: the live one, or an old save's while visiting it. */
    function inv() {
      return visiting || bag;
    }

    function have(id) {
      return visiting ? visiting.get(id) || 0 : (bag.get(id) || 0) - (spent.get(id) || 0);
    }

    /** Toys of a rarity from one bag, beyond the first of each kind; only these can be traded in. */
    function spareOf(rarity, bagId) {
      return TOYS.filter((d) => d.rarity === rarity && d.bag === bagId).map((d) => ({
        id: d.id,
        n: Math.max(0, have(d.id) - 1),
      }));
    }

    function spares(rarity, bagId = api.activeBag()) {
      return spareOf(rarity, bagId).reduce((sum, d) => sum + d.n, 0);
    }

    /** Trades in `n` spare toys of a rarity from one bag, most plentiful kind first. False if short. */
    function spend(rarity, n, bagId = api.activeBag()) {
      if (visiting || spares(rarity, bagId) < n) {
        return false;
      }
      for (let i = 0; i < n; i++) {
        const most = spareOf(rarity, bagId).reduce((a, b) => (b.n > a.n ? b : a));
        spent.set(most.id, (spent.get(most.id) || 0) + 1);
      }
      api.onSpent(Object.fromEntries(spent));
      return true;
    }

    function freeX(g) {
      const ts = toySize(g);
      const w = api.view().w;
      let x = rnd(ts, w - ts);
      for (let i = 0; i < 6 && toys.some((o) => Math.abs(o.x - x) < ts * 1.2); i++) {
        x = rnd(ts, w - ts);
      }
      return x;
    }

    function sparkle(x, y, g, n) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        api.emit({
          x,
          y,
          vx: Math.cos(a) * g.size * 0.6,
          vy: Math.sin(a) * g.size * 0.6,
          text: '✨',
          size: g.size * 0.07,
          life: 0.9,
        });
      }
    }

    /** Puts a toy on the floor. A fresh find drops from the sky; a toy from the bag just appears. */
    function placeToy(def, x, t, stay, fresh) {
      const g = geom();
      const toy = {
        def,
        x,
        h: fresh ? g.size * 1.2 : 0,
        vx: 0,
        vh: 0,
        seed: Math.random() * 10,
        bornAt: t,
        until: t + stay,
        storing: 0,
      };
      toys.push(toy);
      if (fresh ? RARITY[def.rarity].color : true) {
        sparkle(x, g.floor - toySize(g), g, fresh ? 12 : 8);
      }
      return toy;
    }

    /** Kinds of toy found from one bag, and how many kinds it has. */
    function bagCount(bagId) {
      const all = TOYS.filter((d) => d.bag === bagId);
      return { found: all.filter((d) => inv().has(d.id)).length, total: all.length };
    }

    /** A brand-new find from the active bag: rolls a rarity, adds it to the bag and shows it off. */
    function find(t) {
      if (visiting) {
        return;
      }
      const g = geom();
      const def = rollEventToy() || rollToy(Math.random, api.activeBag());
      const count = (bag.get(def.id) || 0) + 1;
      bag.set(def.id, count);
      saveBag();
      if (toys.filter((o) => !o.storing).length < MAX_OUT) {
        placeToy(def, freeX(g), t, rnd(40000, 80000), true);
      }
      const rarity = RARITY[def.rarity];
      if (count === 1) {
        api.onFound(def);
        const from = bagOf(def.bag);
        const { found, total } = bagCount(from.id);
        say(
          `New find! ${def.emoji} ${def.name} (${rarity.label}) - ${found}/${total} in the ${from.emoji} ${from.name} bag`,
          rarity.color || '#ffffff',
          5000,
        );
      } else {
        say(`Found another ${def.emoji} ${def.name} (x${count})`, rarity.color || '#ffffff', 3500);
      }
    }

    /** While a holiday is on, its toy sometimes turns up instead of a normal find. */
    function rollEventToy() {
      const live = TOYS.filter((d) => d.event && api.events().includes(d.event));
      if (live.length === 0) {
        return null;
      }
      const def = live[Math.floor(Math.random() * live.length)];
      return Math.random() < (bag.has(def.id) ? EVENT_FIND.owned : EVENT_FIND.missing) ? def : null;
    }

    function isOut(id) {
      return toys.some((o) => o.def.id === id && !o.storing);
    }

    /** Sends a toy flying back into the bag. */
    function store(toy, t) {
      if (!toy.storing) {
        toy.storing = t;
        if (use && use.toy === toy) {
          use = null;
        }
      }
    }

    function takeOut(id) {
      const def = TOYS.find((d) => d.id === id);
      if (!def || !inv().has(id) || isOut(id) || !api.main()) {
        return false;
      }
      const g = geom();
      const out = toys.filter((o) => !o.storing);
      if (out.length >= MAX_OUT) {
        store(out[0], api.now());
      }
      const x = clamp(
        g.cx + (Math.random() < 0.5 ? -1 : 1) * g.size * 0.7,
        g.size * 0.2,
        api.view().w - g.size * 0.2,
      );
      placeToy(def, x, api.now(), 5 * 60000, false);
      return true;
    }

    function putAway(id) {
      toys.filter((o) => o.def.id === id).forEach((o) => store(o, api.now()));
    }

    function putAllAway() {
      toys.forEach((o) => store(o, api.now()));
    }

    function toyPos(toy, g, t) {
      const y = toyY(toy, g);
      if (!toy.storing) {
        return { x: toy.x, y, k: Math.min(1, (t - toy.bornAt) / 300) };
      }
      const u = Math.min(1, (t - toy.storing) / STORE_MS);
      const to = bagSpot();
      const e = u * u;
      return {
        x: toy.x + (to.x - toy.x) * e,
        y: y + (to.y - y) * e - Math.sin(u * Math.PI) * g.size * 0.4,
        k: 1 - u * 0.85,
      };
    }

    function stepToys(g, t, dt) {
      const w = api.view().w;
      const ts = toySize(g);
      toys = toys.filter((toy) => !toy.storing || t - toy.storing < STORE_MS);
      for (const toy of toys) {
        if (toy.storing) {
          continue;
        }
        if (toy.h > 0 || toy.vh !== 0) {
          toy.vh -= g.size * 6 * dt;
          toy.h += toy.vh * dt;
          if (toy.h <= 0) {
            toy.h = 0;
            toy.vh = Math.abs(toy.vh) > g.size * 0.5 ? -toy.vh * 0.4 : 0;
          }
        }
        toy.x += toy.vx * dt;
        if (toy.h === 0) {
          toy.vx *= Math.pow(0.15, dt);
        }
        if (toy.x < ts / 2 || toy.x > w - ts / 2) {
          toy.x = clamp(toy.x, ts / 2, w - ts / 2);
          toy.vx = -toy.vx * 0.6;
        }
        if (toy.def.rarity === 'legendary' && Math.random() < dt * 1.5) {
          api.emit({
            x: toy.x + rnd(-ts / 2, ts / 2),
            y: toyY(toy, g) + rnd(-ts / 2, ts / 2),
            vy: -12,
            text: '✨',
            size: ts * 0.25,
            life: 1,
          });
        }
      }
      const done = toys.find((toy) => !toy.storing && t > toy.until && (!use || use.toy !== toy));
      if (done) {
        store(done, t);
      }
    }

    function kick(toy, dir, g) {
      toy.vx = dir * g.size * rnd(1.4, 2.4);
      toy.vh = g.size * rnd(0.8, 1.4);
      toy.h = Math.max(toy.h, 0.01);
    }

    // -- Toy use (an idle hobby) ------------------------------------------------

    /** Something to play with: a toy on the floor, or (with toys on) one in the bag. */
    function canPlay() {
      return toys.some((o) => !o.storing) || (api.config().toys && inv().size > 0);
    }

    /**
     * Starts the toy hobby with the nearest toy on the floor. If the floor is
     * empty the pet pulls a random toy out of the bag, out of nowhere, and it
     * goes back in a few seconds after playtime.
     */
    function startToy(until, chosen) {
      if (chosen) {
        if (!toys.includes(chosen) || chosen.storing) {
          return false;
        }
        use = { toy: chosen, until, since: 0, lastKick: 0, fxAt: 0, rideTo: chosen.x };
        return true;
      }
      if (!canPlay()) {
        return false;
      }
      const g = geom();
      let floor = toys.filter((o) => !o.storing);
      if (floor.length === 0) {
        const ids = [...inv().keys()];
        const id = ids[Math.floor(Math.random() * ids.length)];
        const def = TOYS.find((d) => d.id === id);
        const x = clamp(
          g.cx + (Math.random() < 0.5 ? -1 : 1) * g.size * 0.8,
          g.size * 0.2,
          api.view().w - g.size * 0.2,
        );
        floor = [placeToy(def, x, api.now(), until - api.now() + 3000, false)];
      }
      const toy = floor.reduce((a, b) => (Math.abs(b.x - g.cx) < Math.abs(a.x - g.cx) ? b : a));
      use = { toy, until, since: 0, lastKick: 0, fxAt: 0, rideTo: toy.x };
      return true;
    }

    function stopToy() {
      use = null;
    }

    function updateUse(g, t) {
      const toy = use.toy;
      const kind = toy.def.use;
      const side = Math.sign(toy.x - g.cx) || 1;
      const onTop = ON_TOP.has(kind);
      const standX = onTop ? toy.x : toy.x - side * g.size * 0.36;
      const arrived = Math.abs(g.cx - standX) < g.size * 0.08;
      if (!arrived && !(kind === 'ride' && use.since)) {
        target = standX;
        pose = { eyes: 'open', mouth: 'tongue', look: side, wag: 6 };
        return;
      }
      if (!use.since) {
        use.since = t;
      }
      const ut = (t - use.since) / 1000;
      const ts = toySize(g);
      const every = (ms) => {
        if (t - use.fxAt > ms) {
          use.fxAt = t;
          return true;
        }
        return false;
      };
      switch (kind) {
        case 'play':
          pose = { eyes: 'wide', mouth: 'open', look: side, wag: 10, motion: 'hop' };
          if (toy.h === 0 && t - use.lastKick > 900) {
            use.lastKick = t;
            kick(toy, side, g);
          }
          target = standX;
          break;
        case 'float':
          pose = { eyes: 'wide', mouth: 'open', look: 0, wag: 8, motion: 'hop' };
          break;
        case 'sit':
          pose = { eyes: 'happy', mouth: 'smile', look: 0, wag: 3 };
          lift = ts * 0.55;
          break;
        case 'nap':
          pose = { eyes: 'closed', mouth: 'flat', look: 0, wag: 0, motion: 'sideSleep' };
          lift = ts * 0.45;
          if (every(1300)) {
            api.emit({
              x: g.cx + g.size * 0.25,
              y: g.floor - g.size * 0.6,
              vx: g.size * 0.12,
              vy: -g.size * 0.22,
              text: 'z',
              font: true,
              size: g.size * 0.1,
              grow: 1.2,
              life: 2.2,
            });
          }
          break;
        case 'hide': {
          const peek = ut % 3 > 2.1;
          pose = { eyes: peek ? 'open' : 'closed', look: peek ? (ut % 6 > 3 ? -1 : 1) : 0 };
          lift = peek ? g.size * 0.12 : 0;
          break;
        }
        case 'ride':
          pose = {
            eyes: 'happy',
            mouth: 'open',
            look: Math.sign(use.rideTo - g.cx),
            motion: 'surf',
          };
          lift = ts * 0.3;
          toy.x = g.cx;
          if (Math.abs(use.rideTo - g.cx) < g.size * 0.1) {
            use.rideTo = rnd(g.size * 0.5, api.view().w - g.size * 0.5);
          }
          target = use.rideTo;
          break;
        case 'chew':
          pose = {
            eyes: 'happy',
            mouth: Math.floor(ut * 6) % 2 ? 'open' : 'neutral',
            look: side,
            motion: 'eat',
            wag: 6,
          };
          break;
        case 'cuddle':
          pose = { eyes: 'happy', mouth: 'smile', look: side, motion: 'groom', wag: 8 };
          if (every(900)) {
            api.emit({
              x: toy.x,
              y: toyY(toy, g) - ts * 0.4,
              vy: -30,
              text: '💕',
              size: ts * 0.3,
              life: 1.2,
            });
          }
          break;
        case 'sniff':
          pose = { eyes: 'lookDown', mouth: 'neutral', look: side, motion: 'sniff', wag: 4 };
          break;
        case 'music':
          pose = { eyes: 'happy', mouth: 'open', look: side, motion: 'conduct', wag: 8 };
          if (every(500)) {
            api.emit({
              x: toy.x + rnd(-ts / 2, ts / 2),
              y: toyY(toy, g) - ts * 0.4,
              vx: rnd(-20, 20),
              vy: -40,
              text: Math.random() < 0.5 ? '🎵' : '🎶',
              size: ts * 0.3,
              life: 1.4,
            });
          }
          break;
        case 'admire':
          pose = { eyes: 'happy', mouth: 'open', look: side, motion: 'tilt', wag: 9 };
          if (every(400)) {
            api.emit({
              x: toy.x + rnd(-ts / 2, ts / 2),
              y: toyY(toy, g) + rnd(-ts / 2, ts / 4),
              vy: -15,
              text: '✨',
              size: ts * 0.25,
              life: 0.9,
            });
          }
          break;
        case 'game':
          pose = { eyes: 'focus', mouth: 'tongue', look: side, motion: 'type', wag: 5 };
          if (every(800)) {
            api.emit({
              x: toy.x,
              y: toyY(toy, g) - ts * 0.5,
              vy: -30,
              text: '⭐',
              size: ts * 0.25,
              life: 1,
            });
          }
          break;
      }
    }

    // -- Critters -------------------------------------------------------------

    function startCritter(kind, until) {
      const g = geom();
      const w = api.view().w;
      const fromLeft = Math.random() < 0.5;
      const info = CRITTERS[kind] || CRITTERS.butterfly;
      critter = {
        kind,
        info,
        until,
        x: fromLeft ? -20 : w + 20,
        y: info.passes
          ? rnd(20, Math.max(30, g.p.y))
          : info.ground
            ? g.floor - g.size * 0.04
            : g.floor - g.size * 0.8,
        tx: g.cx,
        ty: g.floor - g.size * rnd(0.5, 1),
        dir: fromLeft ? 1 : -1,
        retarget: 0,
      };
    }

    function stepCritter(g, t, dt) {
      const c = critter;
      const w = api.view().w;
      if (c.info.ground) {
        // Creeps up to the pet and back, then wanders off once the hobby ends.
        if (t > c.until) {
          c.tx = c.dir > 0 ? w + 60 : -60;
        } else if (t > c.retarget) {
          c.retarget = t + rnd(1500, 3000);
          c.tx = clamp(g.cx + rnd(-g.size, g.size), 20, w - 20);
        }
        const step = g.size * c.info.ground * dt;
        c.x += clamp(c.tx - c.x, -step, step);
        c.dir = c.tx >= c.x ? 1 : -1;
        if (c.x < -50 || c.x > w + 50) {
          critter = null;
        }
        return;
      }
      if (c.info.passes) {
        c.x += c.dir * w * 0.12 * dt;
        c.y += Math.sin(t / 300) * 0.6;
        if (c.x < -40 || c.x > w + 40) {
          critter = null;
        }
        return;
      }
      if (t > c.until) {
        c.tx = c.x + c.dir * 200;
        c.ty = -60;
      } else if (t > c.retarget) {
        c.retarget = t + rnd(900, 1800);
        c.tx = clamp(g.cx + rnd(-g.size, g.size), 20, w - 20);
        c.ty = g.floor - g.size * rnd(0.35, 1.1);
      }
      c.x += (c.tx - c.x) * Math.min(1, dt * 1.6);
      c.y += (c.ty - c.y) * Math.min(1, dt * 1.6) + Math.sin(t / 120) * 0.8;
      c.dir = c.tx >= c.x ? 1 : -1;
      if (c.y < -40) {
        critter = null;
      }
    }

    function drawCritter(g, t) {
      const c = critter;
      ctx.save();
      ctx.translate(c.x, c.y);
      // Emoji face left; mirror them when heading right.
      const flap = c.info.flap ? 0.4 + 0.6 * Math.abs(Math.sin(t / 70)) : 1;
      ctx.scale(-c.dir * flap, 1);
      ctx.font = `${Math.round(g.size * (c.info.passes ? 0.13 : 0.11))}px sans-serif`;
      ctx.fillText(c.info.emoji, 0, 0);
      ctx.restore();
    }

    // -- Machines -------------------------------------------------------------

    function setJobs(jobs) {
      const t = api.now();
      const classic = api.config().variety === 'classic';
      const ids = new Set(jobs.map((j) => j.id));
      for (const j of jobs) {
        const m = machines.find((x) => x.id === j.id);
        if (m) {
          m.label = j.label;
          m.leavingAt = 0;
          continue;
        }
        const pool = MACHINE_POOLS[j.kind] || MACHINE_POOLS.job;
        machines.push({
          id: j.id,
          kind: j.kind,
          label: j.label,
          type: classic ? pool[0] : pool[Math.floor(Math.random() * pool.length)],
          bornAt: t,
          leavingAt: 0,
          x: 0,
          w: 0,
        });
      }
      for (const m of machines) {
        if (!ids.has(m.id) && !m.leavingAt) {
          m.leavingAt = t;
          if (api.main()) {
            const g = geom();
            api.emit({
              x: m.x + m.w / 2,
              y: g.floor - m.w * 1.1,
              vy: -30,
              text: '🔔',
              size: m.w * 0.3,
              life: 1.2,
            });
          }
        }
      }
    }

    /**
     * Machines stand beside the pet's home spot: on the right if a full-size
     * one fits, else on the roomier side. They shrink to fit, and whatever
     * still does not fit is counted in the "+N" label.
     */
    function layoutMachines(g) {
      const live = machines.filter((m) => !m.leavingAt);
      if (live.length === 0) {
        return { side: 1, extra: 0, x0: 0, row: 0 };
      }
      const p = g.p;
      const full = g.size * 0.42;
      const right = api.view().w - 4 - (p.x + g.size * 0.9);
      const left = p.x + g.size * 0.1 - 4;
      const side = right >= full || right >= left ? 1 : -1;
      const space = Math.max(0, side > 0 ? right : left);
      let n = Math.min(MAX_MACHINES, live.length);
      let w = Math.min(full, space / (n + (n - 1) * 0.15));
      if (w < g.size * 0.22) {
        w = g.size * 0.22;
        n = Math.max(1, Math.min(n, Math.floor((space + w * 0.15) / (w * 1.15))));
      }
      const gap = w * 0.15;
      const row = n * w + (n - 1) * gap;
      const x0 = side > 0 ? p.x + g.size * 0.9 : p.x + g.size * 0.1 - row;
      live.forEach((m, i) => {
        m.w = w;
        m.x = i < n ? x0 + i * (w + gap) : -9999;
      });
      return { side, extra: live.length - n, x0, row };
    }

    let machineLayout = { side: 1, extra: 0, x0: 0, row: 0 };

    function rrect(x, y, w, h, r) {
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, r);
      } else {
        ctx.rect(x, y, w, h);
      }
    }

    function box(x, y, w, h, r, fill, stroke, lw) {
      rrect(x, y, w, h, r);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }

    function timer(m, t) {
      const secs = Math.floor((t - m.bornAt) / 1000);
      return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    }

    function drawMachine(m, g, t) {
      const w = m.w;
      const lw = Math.max(1.5, g.s * 0.5);
      const pop = Math.min(1, (t - m.bornAt) / 400);
      const out = m.leavingAt ? Math.max(0, 1 - (t - m.leavingAt) / 500) : 1;
      const k = pop * out;
      if (k <= 0.01) {
        return;
      }
      const shake = m.type === 'washer' ? Math.sin(t / 25) * w * 0.012 : 0;
      ctx.save();
      ctx.translate(m.x + w / 2 + shake, g.floor + g.s);
      ctx.scale(k, k);
      ctx.translate(-w / 2, 0);
      const ink = '#22252e';
      switch (m.type) {
        case 'washer': {
          box(0, -w * 1.05, w, w * 1.05, w * 0.08, '#e9edf2', ink, lw);
          ctx.fillStyle = '#c9d0db';
          ctx.fillRect(lw, -w * 1.05 + lw, w - lw * 2, w * 0.18);
          ctx.fillStyle = Math.floor(t / 400) % 2 ? '#5ad17a' : '#2f6b3f';
          ctx.fillRect(w * 0.12, -w * 0.97, w * 0.08, w * 0.05);
          ctx.fillStyle = '#7a8291';
          for (const kx of [0.62, 0.8]) {
            ctx.beginPath();
            ctx.arc(w * kx, -w * 0.95, w * 0.05, 0, Math.PI * 2);
            ctx.fill();
          }
          const cy = -w * 0.45;
          const r = w * 0.3;
          ctx.fillStyle = '#9aa3b2';
          ctx.beginPath();
          ctx.arc(w / 2, cy, r + lw * 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#bfe2ff';
          ctx.beginPath();
          ctx.arc(w / 2, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.save();
          ctx.beginPath();
          ctx.arc(w / 2, cy, r, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillStyle = '#4f9dff';
          ctx.fillRect(0, cy - r * 0.1 + Math.sin(t / 180) * r * 0.15, w, r * 2);
          const socks = ['#ff4f7b', '#ffd23f', '#6be675'];
          socks.forEach((c, i) => {
            const a = t / 160 + (i * Math.PI * 2) / socks.length;
            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.arc(
              w / 2 + Math.cos(a) * r * 0.5,
              cy + Math.sin(a) * r * 0.5,
              r * 0.22,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          });
          ctx.restore();
          break;
        }
        case 'oven': {
          box(0, -w * 1.0, w, w * 1.0, w * 0.06, '#3a3f4b', ink, lw);
          ctx.fillStyle = '#2a2e38';
          ctx.fillRect(lw, -w + lw, w - lw * 2, w * 0.2);
          ctx.fillStyle = '#ff9f43';
          ctx.font = `bold ${Math.round(w * 0.12)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(timer(m, t), w / 2, -w * 0.9);
          const glow = 0.55 + 0.25 * Math.sin(t / 300);
          box(
            w * 0.12,
            -w * 0.68,
            w * 0.76,
            w * 0.5,
            w * 0.05,
            `rgba(255,140,40,${glow})`,
            ink,
            lw,
          );
          ctx.fillStyle = '#8b5a2b';
          const rise = Math.min(1, (t - m.bornAt) / 20000);
          for (const cx of [0.32, 0.5, 0.68]) {
            ctx.beginPath();
            ctx.ellipse(w * cx, -w * 0.26, w * 0.07, w * (0.03 + 0.03 * rise), 0, Math.PI, 0);
            ctx.fill();
          }
          ctx.fillStyle = '#9aa3b2';
          ctx.fillRect(w * 0.12, -w * 0.12, w * 0.76, w * 0.04);
          if (Math.random() < 0.04) {
            api.emit({
              x: m.x + w / 2,
              y: g.floor - w * 1.1,
              vy: -25,
              text: '〰️',
              size: w * 0.18,
              life: 1.2,
            });
          }
          break;
        }
        case 'microwave': {
          box(0, -w * 0.62, w, w * 0.62, w * 0.05, '#cfd5e0', ink, lw);
          box(w * 0.07, -w * 0.54, w * 0.6, w * 0.46, w * 0.03, '#2a2e38', ink, lw * 0.6);
          ctx.fillStyle = `rgba(255,214,80,${0.35 + 0.15 * Math.sin(t / 200)})`;
          ctx.fillRect(w * 0.07, -w * 0.54, w * 0.6, w * 0.46);
          const a = t / 500;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(w * 0.37, -w * 0.16, w * 0.2, w * 0.05, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#e85d5d';
          ctx.beginPath();
          ctx.arc(
            w * 0.37 + Math.cos(a) * w * 0.12,
            -w * 0.19 + Math.sin(a) * w * 0.02,
            w * 0.06,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.fillStyle = '#1c1f26';
          ctx.fillRect(w * 0.72, -w * 0.54, w * 0.22, w * 0.1);
          ctx.fillStyle = '#6be675';
          ctx.font = `bold ${Math.round(w * 0.07)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(timer(m, t), w * 0.83, -w * 0.49);
          ctx.fillStyle = '#7a8291';
          for (let i = 0; i < 6; i++) {
            ctx.fillRect(
              w * (0.74 + (i % 2) * 0.1),
              -w * (0.38 - Math.floor(i / 2) * 0.09),
              w * 0.06,
              w * 0.05,
            );
          }
          break;
        }
        case 'computer': {
          box(0, -w * 0.95, w, w * 0.68, w * 0.05, '#2a2e38', ink, lw);
          ctx.fillStyle = '#0b1d12';
          ctx.fillRect(w * 0.07, -w * 0.88, w * 0.86, w * 0.54);
          ctx.save();
          ctx.beginPath();
          ctx.rect(w * 0.07, -w * 0.88, w * 0.86, w * 0.46);
          ctx.clip();
          const scroll = (t / 90) % 6;
          for (let i = 0; i < 9; i++) {
            const n = Math.floor(t / 540) + i;
            ctx.fillStyle = (n * 7) % 11 === 0 ? '#ff6b6b' : '#5ae38a';
            const len = 0.25 + ((n * 37) % 50) / 100;
            ctx.fillRect(
              w * 0.1,
              -w * 0.86 + (i * 6 - scroll) * w * 0.012,
              w * 0.8 * len,
              w * 0.035,
            );
          }
          ctx.restore();
          const prog = ((t - m.bornAt) / 8000) % 1;
          ctx.fillStyle = '#1f3a28';
          ctx.fillRect(w * 0.1, -w * 0.4, w * 0.8, w * 0.04);
          ctx.fillStyle = '#5ae38a';
          ctx.fillRect(w * 0.1, -w * 0.4, w * 0.8 * prog, w * 0.04);
          ctx.fillStyle = '#4a4f5c';
          ctx.fillRect(w * 0.44, -w * 0.27, w * 0.12, w * 0.17);
          box(w * 0.22, -w * 0.1, w * 0.56, w * 0.1, w * 0.03, '#4a4f5c', ink, lw * 0.6);
          break;
        }
        case 'engine': {
          box(0, -w * 0.7, w * 0.78, w * 0.7, w * 0.04, '#7a828f', ink, lw);
          ctx.fillStyle = '#5d6472';
          for (let i = 0; i < 4; i++) {
            ctx.fillRect(w * 0.08, -w * (0.6 - i * 0.13), w * 0.62, w * 0.05);
          }
          const pist = Math.abs(Math.sin(t / 120)) * w * 0.12;
          box(w * 0.18, -w * 0.82 - pist, w * 0.14, w * 0.14 + pist, 2, '#b0b7c3', ink, lw * 0.6);
          box(
            w * 0.46,
            -w * 0.82 - (w * 0.12 - pist),
            w * 0.14,
            w * 0.26 - pist,
            2,
            '#b0b7c3',
            ink,
            lw * 0.6,
          );
          const gx = w * 0.8;
          const gy = -w * 0.35;
          const gr = w * 0.2;
          ctx.save();
          ctx.translate(gx, gy);
          ctx.rotate(t / 300);
          ctx.fillStyle = '#ffb347';
          ctx.strokeStyle = ink;
          ctx.lineWidth = lw * 0.6;
          ctx.beginPath();
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            const rr = i % 2 ? gr * 0.78 : gr;
            ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = ink;
          ctx.beginPath();
          ctx.arc(0, 0, gr * 0.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          if (Math.random() < 0.05) {
            api.emit({
              x: m.x + w * 0.3,
              y: g.floor - w * 0.95,
              vx: 8,
              vy: -30,
              text: '💨',
              size: w * 0.18,
              life: 1.1,
            });
          }
          break;
        }
        case 'server': {
          const h = w * 1.15;
          box(w * 0.18, -h, w * 0.64, h, w * 0.04, '#2a2e38', ink, lw);
          for (let i = 0; i < 6; i++) {
            const y = -h + w * 0.06 + (i * (h - w * 0.1)) / 6;
            ctx.fillStyle = '#3a3f4b';
            ctx.fillRect(w * 0.23, y, w * 0.54, (h - w * 0.2) / 6);
            for (let j = 0; j < 3; j++) {
              const on = (Math.floor(t / 150) * (i + 3) * (j + 7)) % 5 < 2;
              ctx.fillStyle = on ? (j === 2 ? '#ffb347' : '#5ae38a') : '#1f2229';
              ctx.fillRect(w * (0.28 + j * 0.08), y + w * 0.04, w * 0.05, w * 0.05);
            }
          }
          break;
        }
      }
      ctx.restore();
    }

    // -- Variant scenery --------------------------------------------------------

    /**
     * Scenery for animation variants, drawn behind (`back`) or in front of
     * (`front`) the pet. x is the pet's centre, y the floor under it.
     */
    function scenery(name, layer, x, y, size, s, t) {
      const lw = Math.max(1.5, s * 0.5);
      const ink = '#22252e';
      ctx.save();
      if (name === 'box' && layer === 'front') {
        const w = size * 0.78;
        const h = size * 0.36;
        box(x - w / 2, y - h, w, h, 2, '#c8955a', '#6b4a26', lw);
        ctx.fillStyle = '#b07d45';
        for (const dir of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(x + (dir * w) / 2, y - h);
          ctx.lineTo(x + dir * (w / 2 + size * 0.1), y - h - size * 0.12);
          ctx.lineTo(x + dir * (w / 2 - size * 0.12), y - h - size * 0.1);
          ctx.lineTo(x + dir * (w / 2 - size * 0.18), y - h);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#6b4a26';
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(x - size * 0.06, y - h, size * 0.12, h);
      } else if (name === 'bed' && layer === 'back') {
        ctx.fillStyle = '#5b4bb5';
        ctx.beginPath();
        ctx.ellipse(x, y - size * 0.06, size * 0.52, size * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8b7cf0';
        ctx.beginPath();
        ctx.ellipse(x, y - size * 0.09, size * 0.44, size * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(
          x - size * 0.34,
          y - size * 0.15,
          size * 0.12,
          size * 0.06,
          -0.2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else if (name === 'perch' && layer === 'back') {
        ctx.strokeStyle = '#6b4a26';
        ctx.lineCap = 'round';
        ctx.lineWidth = s * 2;
        ctx.beginPath();
        ctx.moveTo(x - size * 0.55, y - s * 2);
        ctx.lineTo(x + size * 0.55, y - s * 3);
        ctx.stroke();
        ctx.lineWidth = s;
        ctx.beginPath();
        ctx.moveTo(x - size * 0.2, y - s * 2.3);
        ctx.lineTo(x - size * 0.3, y + s * 2);
        ctx.stroke();
        ctx.font = `${Math.round(size * 0.14)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🍃', x + size * 0.55, y - s * 5);
        ctx.fillText('🍃', x - size * 0.55, y - s * 4);
      } else if (name === 'wheel' && layer === 'back') {
        const r = size * 0.52;
        const cy = y - r;
        ctx.strokeStyle = '#7a8291';
        ctx.lineWidth = lw * 1.5;
        ctx.beginPath();
        ctx.moveTo(x - r * 0.4, y + s);
        ctx.lineTo(x, cy);
        ctx.lineTo(x + r * 0.4, y + s);
        ctx.stroke();
        ctx.strokeStyle = '#c9d0db';
        ctx.lineWidth = lw * 2;
        ctx.beginPath();
        ctx.arc(x, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(201,208,219,0.6)';
        ctx.lineWidth = lw * 0.8;
        for (let i = 0; i < 10; i++) {
          const a = t / 140 + (i / 10) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(x, cy);
          ctx.lineTo(x + Math.cos(a) * r, cy + Math.sin(a) * r);
          ctx.stroke();
        }
      } else if (name === 'surfboard') {
        if (layer === 'back') {
          ctx.fillStyle = '#ff9f43';
          ctx.strokeStyle = '#7a3f10';
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.ellipse(
            x,
            y - s * 3,
            size * 0.46,
            size * 0.055,
            Math.sin(t / 450) * 0.1,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(79,157,255,0.75)';
          ctx.beginPath();
          ctx.moveTo(x - size * 0.7, y + s);
          for (let i = 0; i <= 20; i++) {
            const wx = x - size * 0.7 + (i / 20) * size * 1.4;
            ctx.lineTo(wx, y - s * 1.5 + Math.sin(i * 0.9 + t / 160) * s * 1.6);
          }
          ctx.lineTo(x + size * 0.7, y + s);
          ctx.closePath();
          ctx.fill();
        }
      } else if (name === 'dish' && layer === 'back') {
        const dx = x + size * 0.58;
        ctx.strokeStyle = '#7a8291';
        ctx.lineWidth = lw * 1.4;
        ctx.beginPath();
        ctx.moveTo(dx, y + s);
        ctx.lineTo(dx, y - size * 0.35);
        ctx.stroke();
        ctx.fillStyle = '#e9edf2';
        ctx.strokeStyle = ink;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.ellipse(dx, y - size * 0.42, size * 0.16, size * 0.07, -0.6, 0, Math.PI);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#4fd1c5';
        for (let i = 0; i < 3; i++) {
          const ph = ((t / 900 + i / 3) % 1) * size * 0.3;
          ctx.globalAlpha = 1 - ph / (size * 0.3);
          ctx.beginPath();
          ctx.arc(dx + size * 0.05, y - size * 0.5, size * 0.06 + ph, -1.9, -0.5);
          ctx.stroke();
        }
      } else if (name === 'chalkboard' && layer === 'back') {
        const w = size * 0.55;
        const h = size * 0.42;
        const bx = x - size * 0.42 - w;
        const by = y - size * 0.82;
        box(bx, by, w, h, 2, '#2f4f3a', '#8b5a2b', lw * 1.6);
        ctx.strokeStyle = '#8b5a2b';
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(bx + w * 0.2, by + h);
        ctx.lineTo(bx + w * 0.1, y + s);
        ctx.moveTo(bx + w * 0.8, by + h);
        ctx.lineTo(bx + w * 0.9, y + s);
        ctx.stroke();
        const lines = ['f(x) = ?', 'Σ x² + 1', '2 + 2 = 4', '∴ it works'];
        const shown = Math.floor(t / 120);
        ctx.fillStyle = '#f2f2e8';
        ctx.font = `${Math.max(7, Math.round(h * 0.17))}px monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        let budget = shown % 60;
        lines.forEach((text, i) => {
          const part = text.slice(0, Math.max(0, budget));
          budget -= text.length;
          ctx.fillText(part, bx + w * 0.08, by + h * (0.08 + i * 0.22));
        });
      } else if (name === 'books' && layer === 'back') {
        ctx.font = `${Math.round(size * 0.22)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('📚', x + size * 0.5, y + s);
        ctx.fillText('📚', x + size * 0.5, y - size * 0.16);
        ctx.fillText('📚', x - size * 0.52, y + s);
      } else if (EMOJI_SCENERY[name] && layer === 'front') {
        ctx.font = `${Math.round(size * 0.4)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(EMOJI_SCENERY[name], x + size * 0.55, y + s);
      }
      ctx.restore();
    }

    // -- Per-frame ------------------------------------------------------------

    function update(t, dt) {
      target = null;
      pose = null;
      lift = 0;
      const p = api.main();
      if (!p) {
        return;
      }
      const g = geom();
      const cfg = api.config();
      if (cfg.toys && t > nextFind) {
        nextFind = t + rnd(120000, 240000);
        find(t);
      }
      // Turning toys off tidies everything away; the bag keeps them.
      if (toysWereOn && !cfg.toys) {
        putAllAway();
      }
      toysWereOn = cfg.toys;
      stepToys(g, t, dt);
      if (use) {
        if (!toys.includes(use.toy) || use.toy.storing || t > use.until || !api.playing()) {
          use = null;
        } else {
          updateUse(g, t);
        }
      }
      if (critter) {
        stepCritter(g, t, dt);
      }
      machines = machines.filter((m) => !m.leavingAt || t - m.leavingAt < 600);
      machineLayout = layoutMachines(g);
    }

    /** A toy the pet is sitting, napping or riding on is drawn under it; the rest in front. */
    function under(toy) {
      return !!use && !!use.since && use.toy === toy && ON_TOP.has(toy.def.use);
    }

    function drawToy(toy, g, t) {
      const ts = toySize(g);
      const at = toyPos(toy, g, t);
      const glow = RARITY[toy.def.rarity].color;
      if (glow && !toy.storing) {
        const pulse = 0.25 + 0.15 * Math.sin(t / 300 + toy.seed);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.ellipse(toy.x, g.floor + g.s, ts * 0.55, ts * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.save();
      ctx.translate(at.x, at.y);
      ctx.scale(at.k, at.k);
      if (toy.def.use === 'play' && toy.h > 0 && !toy.storing) {
        ctx.rotate(toy.x / (ts * 0.4));
      }
      ctx.font = `${Math.round(ts)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(toy.def.emoji, 0, 0);
      ctx.restore();
    }

    function drawBack(t) {
      const p = api.main();
      if (!p) {
        return;
      }
      const g = geom();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (api.config().machines) {
        for (const m of machines) {
          drawMachine(m, g, t);
        }
        if (machineLayout.extra > 0) {
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${Math.round(g.size * 0.08)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(
            `+${machineLayout.extra}`,
            machineLayout.x0 + machineLayout.row / 2,
            g.floor - g.size * 0.55,
          );
        }
      }
      for (const toy of toys) {
        if (under(toy)) {
          drawToy(toy, g, t);
        }
      }
    }

    function drawFront(t) {
      const p = api.main();
      if (!p) {
        return;
      }
      const g = geom();
      for (const toy of toys) {
        if (!under(toy)) {
          drawToy(toy, g, t);
        }
      }
      if (critter) {
        drawCritter(g, t);
      }
      if (use && use.since && use.toy.def.use === 'hide') {
        // A big copy in front of the pet so only its head pokes out.
        const big = g.size * 0.62;
        ctx.font = `${Math.round(big)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(use.toy.def.emoji, use.toy.x, g.floor + g.s - big * 0.5);
      }
      if (banner && t < banner.until) {
        const fade = Math.min(1, (banner.until - t) / 600, (t - banner.start) / 200);
        ctx.globalAlpha = Math.max(0, fade);
        ctx.font = 'bold 11px sans-serif';
        const w = Math.min(api.view().w - 16, ctx.measureText(banner.text).width + 18);
        const x = api.view().w / 2;
        const y = 30;
        box(x - w / 2, y - 10, w, 20, 10, 'rgba(8,8,16,0.85)', banner.color, 1.5);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(banner.text, x, y + 1, w - 12);
        ctx.globalAlpha = 1;
      }
    }

    /** What's under the mouse, for the tooltip. */
    function hover(x, y) {
      if (!api.main()) {
        return null;
      }
      const g = geom();
      const ts = toySize(g);
      for (const toy of toys) {
        if (!toy.storing && Math.abs(x - toy.x) < ts / 2 && Math.abs(y - toyY(toy, g)) < ts / 2) {
          const r = RARITY[toy.def.rarity];
          const n = have(toy.def.id);
          const click = toy.def.kind === 'toy' ? 'click to flick it' : 'click to use it';
          return {
            title: `${toy.def.emoji} ${toy.def.name}`,
            sub: `${r.label} ${toy.def.kind}${n > 1 ? ` - x${n} in the bag` : ''} - ${click}, right-click to put it away`,
          };
        }
      }
      if (api.config().machines) {
        for (const m of machines) {
          if (
            !m.leavingAt &&
            x >= m.x &&
            x <= m.x + m.w &&
            y <= g.floor &&
            y >= g.floor - m.w * 1.15
          ) {
            return {
              title: `${MACHINE_NAMES[m.type]} (${m.kind === 'job' ? 'background job' : m.kind})`,
              sub: `${m.label} - ${timer(m, api.now())}`,
            };
          }
        }
      }
      return null;
    }

    function toyAt(x, y) {
      if (!api.main()) {
        return undefined;
      }
      const g = geom();
      const ts = toySize(g);
      return toys.find(
        (o) => !o.storing && Math.abs(x - o.x) < ts / 2 && Math.abs(y - toyY(o, g)) < ts / 2,
      );
    }

    /** Right-clicking a toy on the floor puts it in the bag. Returns true when a toy was hit. */
    function grab(x, y) {
      const toy = toyAt(x, y);
      if (!toy) {
        return false;
      }
      store(toy, api.now());
      return true;
    }

    /**
     * Clicking a toy on the floor: a real toy gets flicked away from the
     * click. Returns the toy (or object) so the pet can come and play with
     * it, or null when nothing was hit.
     */
    function poke(x, y) {
      const toy = toyAt(x, y);
      if (!toy) {
        return null;
      }
      if (toy.def.kind === 'toy') {
        kick(toy, Math.sign(toy.x - x) || (Math.random() < 0.5 ? -1 : 1), geom());
      }
      toy.until = Math.max(toy.until, api.now() + 60000);
      return toy;
    }

    return {
      update,
      drawBack,
      drawFront,
      scenery,
      setJobs,
      hover,
      grab,
      poke,
      say,
      startToy,
      stopToy,
      startCritter,
      canPlay,
      toyLabel: () => (use ? `${USE_LABEL[use.toy.def.use]} ${use.toy.def.name}` : ''),
      critter: () => (critter ? { x: critter.x, y: critter.y } : null),
      machineCount: () => machines.filter((m) => !m.leavingAt).length,
      machineSide: () => machineLayout.side,
      /** Restores the saved inventory and what has been traded in. */
      setBag: (saved, savedSpent) => {
        for (const [id, n] of Object.entries(saved || {})) {
          if (TOYS.some((d) => d.id === id) && n > 0) {
            bag.set(id, n);
          }
        }
        for (const [id, n] of Object.entries(savedSpent || {})) {
          if (bag.has(id) && n > 0) {
            spent.set(id, n);
          }
        }
        if (bag.size > 0) {
          nextFind = api.now() + rnd(60000, 120000);
        }
      },
      /**
       * One bag's toys (or every toy) in catalogue order, with how many are
       * in the bag and whether one is out.
       */
      bagList: (bagId) =>
        TOYS.filter((d) => !bagId || d.bag === bagId).map((d) => ({
          id: d.id,
          emoji: d.emoji,
          name: d.name,
          rarity: RARITY[d.rarity].label,
          color: RARITY[d.rarity].color,
          count: inv().has(d.id) ? have(d.id) : 0,
          out: isOut(d.id),
        })),
      takeOut,
      putAway,
      putAllAway,
      foundCount: () => inv().size,
      bagCount,
      spares,
      spend,
      toyTotal: TOYS.length,
      /** Where toys are out on the floor, for a play room to steer the pet to. */
      toysOut: () => toys.filter((o) => !o.storing).map((o) => o.x),
      /**
       * Visits an old save's bag (null comes home). The floor is cleared
       * either way, and nothing is found while visiting.
       */
      visit: (found) => {
        toys = [];
        use = null;
        visiting = found ? new Map(Object.entries(found).filter(([, n]) => n > 0)) : null;
      },
      /** Where the toy hobby wants the pet's centre to go, or null. */
      target: () => target,
      /** Pose overrides while playing with a toy. */
      pose: () => pose,
      /** Pixels to raise (or, negative, sink) the pet, e.g. sitting on a couch. */
      lift: () => lift,
      /** Make a new find right now (used by tests). */
      find: () => find(api.now()),
    };
  }

  root.PetScene = { create, BAGS, TOYS, RARITY, PRICES, CRITTERS, SCENERY, USE_LABEL, rollToy };
})(this);
