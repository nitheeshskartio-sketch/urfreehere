/** A compact, curated emoji set (no picker library needed). */
export const EMOJI: { label: string; items: string[] }[] = [
  {
    label: 'Smileys',
    items: '😀 😃 😄 😁 😆 😅 😂 🤣 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 😴 😷 🤒 🤕 🤢 🥵 🥶 😵 🤯 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬'.split(' '),
  },
  {
    label: 'Gestures',
    items: '👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🫶 👀 🧠'.split(' '),
  },
  {
    label: 'Hearts',
    items: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 ✨ ⭐ 🌟 💫 🔥 💯 ✅ ❌ ⚠️ ❓ ❗ 💤 🎉 🎊'.split(' '),
  },
  {
    label: 'Nature',
    items: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦉 🦋 🐝 🐢 🐬 🐳 🌸 🌻 🌹 🌷 🌱 🌲 🌴 🍀 🍁 🌈 ☀️ 🌙 ⛅ 🌧️ ❄️ 🌊'.split(' '),
  },
  {
    label: 'Food',
    items: '🍎 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥑 🍅 🥕 🌽 🥦 🍞 🧀 🍳 🥞 🍔 🍟 🍕 🌮 🌯 🍜 🍣 🍱 🍛 🍰 🎂 🍩 🍪 🍫 🍦 ☕ 🍵 🧃 🥤 🍺 🍷'.split(' '),
  },
  {
    label: 'Activity',
    items: '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏏 🏸 🏓 🥊 🏆 🥇 🎯 🎮 🎲 🧩 🎨 🎬 🎤 🎧 🎸 🎹 📚 ✏️ 📝 💼 💻 📱 📷 💡 🔑 🎁 📌 📎 ✈️ 🚗 🚲 🏠 🏖️ ⛰️'.split(' '),
  },
];

/** Search words for each emoji (English, lower case). */
const KEYWORDS: Record<string, string> = {
  '😀': 'grinning smile happy', '😃': 'smiley happy joy', '😄': 'smile happy laugh', '😁': 'grin beaming teeth', '😆': 'laughing lol haha',
  '😅': 'sweat smile nervous relief', '😂': 'joy tears laugh lol funny', '🤣': 'rofl rolling laugh funny', '🙂': 'slight smile', '🙃': 'upside down silly',
  '😉': 'wink', '😊': 'blush smile happy shy', '😇': 'angel innocent halo', '🥰': 'love hearts adore crush', '😍': 'heart eyes love crush',
  '🤩': 'star struck wow excited', '😘': 'kiss blow love', '😗': 'kissing', '😚': 'kiss closed eyes', '😋': 'yum tasty delicious',
  '😛': 'tongue', '😜': 'wink tongue crazy', '🤪': 'zany crazy goofy', '😝': 'squint tongue', '🤗': 'hug hugging',
  '🤭': 'oops giggle hand mouth', '🤫': 'shush quiet secret', '🤔': 'thinking hmm', '🤐': 'zipper mouth secret', '🤨': 'raised eyebrow suspicious',
  '😐': 'neutral meh', '😑': 'expressionless', '😶': 'no mouth speechless', '😏': 'smirk', '😒': 'unamused annoyed',
  '🙄': 'eye roll', '😬': 'grimace awkward', '😌': 'relieved calm', '😔': 'pensive sad', '😪': 'sleepy',
  '😴': 'sleeping tired zzz', '😷': 'mask sick', '🤒': 'fever sick ill', '🤕': 'hurt bandage injured', '🤢': 'nauseated sick',
  '🥵': 'hot sweating heat', '🥶': 'cold freezing', '😵': 'dizzy', '🤯': 'mind blown shocked', '🥳': 'party celebrate birthday',
  '😎': 'cool sunglasses', '🤓': 'nerd geek', '🧐': 'monocle curious', '😕': 'confused', '😟': 'worried',
  '🙁': 'frown sad', '😮': 'open mouth surprised wow', '😯': 'hushed surprised', '😲': 'astonished shocked', '😳': 'flushed embarrassed',
  '🥺': 'pleading puppy eyes please', '😦': 'frowning', '😧': 'anguished', '😨': 'fearful scared', '😰': 'anxious sweat',
  '😥': 'sad relieved', '😢': 'cry sad tear', '😭': 'sob crying sad', '😱': 'scream fear shocked', '😖': 'confounded',
  '😣': 'persevere', '😞': 'disappointed sad', '😓': 'downcast sweat', '😩': 'weary tired', '😫': 'tired exhausted',
  '🥱': 'yawn bored sleepy', '😤': 'triumph huff angry', '😡': 'angry mad rage', '😠': 'angry mad', '🤬': 'swearing cursing angry',
  '👋': 'wave hello hi bye', '🤚': 'raised back hand', '🖐️': 'hand fingers slap', '✋': 'raised hand stop high five', '🖖': 'vulcan spock',
  '👌': 'ok okay perfect', '🤌': 'pinched fingers italian', '🤏': 'pinching small', '✌️': 'victory peace', '🤞': 'crossed fingers luck hope promise',
  '🤟': 'love you gesture', '🤘': 'rock horns', '🤙': 'call me shaka', '👈': 'point left', '👉': 'point right',
  '👆': 'point up', '👇': 'point down', '☝️': 'index up', '👍': 'thumbs up like yes good', '👎': 'thumbs down dislike no bad',
  '✊': 'fist raised', '👊': 'punch fist bump', '🤛': 'left fist', '🤜': 'right fist', '👏': 'clap applause bravo',
  '🙌': 'raising hands celebrate hooray', '👐': 'open hands', '🤲': 'palms up', '🤝': 'handshake deal agree', '🙏': 'pray please thanks namaste',
  '✍️': 'writing', '💪': 'muscle strong flex', '🫶': 'heart hands love', '👀': 'eyes look see', '🧠': 'brain smart',
  '❤️': 'red heart love', '🧡': 'orange heart', '💛': 'yellow heart', '💚': 'green heart', '💙': 'blue heart',
  '💜': 'purple heart', '🖤': 'black heart', '🤍': 'white heart', '🤎': 'brown heart', '💔': 'broken heart sad',
  '❣️': 'heart exclamation', '💕': 'two hearts love', '💞': 'revolving hearts', '💓': 'beating heart', '💗': 'growing heart',
  '💖': 'sparkling heart', '💘': 'cupid arrow heart', '💝': 'heart gift ribbon', '✨': 'sparkles shine', '⭐': 'star',
  '🌟': 'glowing star', '💫': 'dizzy star', '🔥': 'fire hot lit', '💯': 'hundred perfect', '✅': 'check done yes',
  '❌': 'cross no wrong', '⚠️': 'warning caution', '❓': 'question', '❗': 'exclamation important', '💤': 'sleep zzz',
  '🎉': 'party popper celebrate congrats', '🎊': 'confetti celebrate',
  '🐶': 'dog puppy', '🐱': 'cat kitten', '🐭': 'mouse', '🐹': 'hamster', '🐰': 'rabbit bunny', '🦊': 'fox', '🐻': 'bear', '🐼': 'panda',
  '🐨': 'koala', '🐯': 'tiger', '🦁': 'lion', '🐮': 'cow', '🐷': 'pig', '🐸': 'frog', '🐵': 'monkey', '🐔': 'chicken', '🐧': 'penguin',
  '🐦': 'bird', '🦉': 'owl', '🦋': 'butterfly', '🐝': 'bee honey humble', '🐢': 'turtle', '🐬': 'dolphin', '🐳': 'whale', '🌸': 'blossom flower',
  '🌻': 'sunflower', '🌹': 'rose flower love', '🌷': 'tulip flower', '🌱': 'seedling plant', '🌲': 'tree evergreen', '🌴': 'palm tree beach',
  '🍀': 'clover luck', '🍁': 'maple leaf autumn', '🌈': 'rainbow', '☀️': 'sun sunny', '🌙': 'moon night', '⛅': 'cloud sun weather',
  '🌧️': 'rain cloud', '❄️': 'snow cold', '🌊': 'wave sea ocean',
  '🍎': 'apple', '🍊': 'orange', '🍋': 'lemon', '🍌': 'banana', '🍉': 'watermelon', '🍇': 'grapes', '🍓': 'strawberry', '🍒': 'cherries',
  '🍑': 'peach', '🥭': 'mango', '🍍': 'pineapple', '🥥': 'coconut', '🥑': 'avocado', '🍅': 'tomato', '🥕': 'carrot', '🌽': 'corn',
  '🥦': 'broccoli', '🍞': 'bread', '🧀': 'cheese', '🍳': 'egg cooking', '🥞': 'pancakes', '🍔': 'burger', '🍟': 'fries', '🍕': 'pizza',
  '🌮': 'taco', '🌯': 'burrito wrap', '🍜': 'noodles ramen', '🍣': 'sushi', '🍱': 'bento', '🍛': 'curry rice', '🍰': 'cake', '🎂': 'birthday cake',
  '🍩': 'donut', '🍪': 'cookie', '🍫': 'chocolate', '🍦': 'ice cream', '☕': 'coffee tea hot', '🍵': 'tea chai', '🧃': 'juice', '🥤': 'drink soda',
  '🍺': 'beer', '🍷': 'wine',
  '⚽': 'soccer football', '🏀': 'basketball', '🏈': 'american football', '⚾': 'baseball', '🎾': 'tennis', '🏐': 'volleyball', '🏏': 'cricket',
  '🏸': 'badminton', '🏓': 'ping pong table tennis', '🥊': 'boxing', '🏆': 'trophy win', '🥇': 'gold medal first', '🎯': 'target bullseye',
  '🎮': 'game controller gaming', '🎲': 'dice game', '🧩': 'puzzle', '🎨': 'art paint', '🎬': 'movie film', '🎤': 'microphone sing',
  '🎧': 'headphones music', '🎸': 'guitar', '🎹': 'piano keyboard', '📚': 'books study', '✏️': 'pencil', '📝': 'memo note', '💼': 'briefcase work',
  '💻': 'laptop computer', '📱': 'phone mobile', '📷': 'camera photo', '💡': 'idea bulb', '🔑': 'key', '🎁': 'gift present', '📌': 'pin',
  '📎': 'paperclip', '✈️': 'plane travel flight', '🚗': 'car', '🚲': 'bike bicycle', '🏠': 'home house', '🏖️': 'beach holiday', '⛰️': 'mountain',
};

/** Emoji whose name or keywords match the search (every word must match). */
export function searchEmoji(query: string): string[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const all = EMOJI.flatMap((g) => g.items);
  return all.filter((em) => {
    const kw = KEYWORDS[em] ?? '';
    return words.every((w) => kw.split(' ').some((k) => k.startsWith(w)));
  });
}

const RECENT_KEY = 'humble.emoji.recent';

/** Recently used emoji on this device, newest first. */
export function recentEmoji(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 24) : [];
  } catch {
    return [];
  }
}

export function rememberEmoji(em: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([em, ...recentEmoji().filter((x) => x !== em)].slice(0, 24)));
  } catch {
    /* storage full or blocked */
  }
}
