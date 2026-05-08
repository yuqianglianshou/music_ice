import { CONFIG } from '../app/config.js';

const TYPE = "节奏律动";
const FILE_MUSIC_JIEZOULVDONG = "jiezoulvdong/";

export const rhythmList = [
  {
    song_type: TYPE,
    song_path: FILE_MUSIC_JIEZOULVDONG,
    song_name: "Fade - Alan Walker",
    song_file: "Fade - Alan Walker.mp3",
    img_file: "Fade - Alan Walker.jpg",
    lyrics_type: CONFIG.LOAD_LYRICS_TYPE.TYPE_chunyinyue,
    author: "Alan Walker",
    time: "04:24",
    des: "跑起来吧",
  },
  {
    song_type: TYPE,
    song_path: FILE_MUSIC_JIEZOULVDONG,
    song_name: "Something Just Like This - The Chainsmokers,Coldplay",
    song_file: "Something Just Like This - The Chainsmokers,Coldplay.mp3",
    img_file: "Something Just Like This - The Chainsmokers,Coldplay.jpg",
    lyrics_file: "Something Just Like This.lrc",
    lyrics_type: CONFIG.LOAD_LYRICS_TYPE.TYPE_file,
    author: "The Chainsmokers,Coldplay",
    time: "04:07",
    des: "喜欢iPad你就去买，喜欢莱卡你就去赚，想喝港式奶茶你就过口岸，想当team leader你就努力学习然后努力去工作，想去威尼斯你就攒钱去，想爱谁你就去爱，想追谁你就去追，想到了就去做，拼命努力，拼命享受，忍着守着惦记着，青春就过去了，何必用40岁的心态过20岁的年华。",
  },
  {
    song_type: TYPE,
    song_path: FILE_MUSIC_JIEZOULVDONG,
    song_name: "Dance Monkey - Tones and I",
    song_file: "Dance Monkey - Tones and I.mp3",
    img_file: " ",
    lyrics_file: "Dance Monkey - Tones and I.lrc",
    lyrics_type: CONFIG.LOAD_LYRICS_TYPE.TYPE_file,
    author: "Tones and I",
    time: "03:30",
    des: "I'm a dance monkey, I'm a dance monkey, I'm a dance monkey.",
  },
  {
    song_type: TYPE,
    song_path: FILE_MUSIC_JIEZOULVDONG,
    song_name: "Believer",
    song_file: "Believer - Imagine Dragons.mp3",
    img_file: "Believer - Imagine Dragons.jpg",
    lyrics_file: "Believer - Imagine Dragons.lrc",
    lyrics_type: CONFIG.LOAD_LYRICS_TYPE.TYPE_file,
    author: "Imagine Dragons",
    time: "03:39",
    des: "Believer",
  }
];
