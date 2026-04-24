import { CONFIG } from '../app/config.js';

const TYPE = "史诗配乐";
const FILE_MUSIC_SHISHIPEIYUE = "shishipeiyue/";

export const epicScoreList = [
  {
    song_type: TYPE,
    song_path: FILE_MUSIC_SHISHIPEIYUE,
    song_name: "亡灵序曲 (The Dawn) - Dreamtale",
    song_file: "The Dawn_亡灵序曲.mp3",
    img_file: "亡灵序曲.jpg",
    lyrics_type: CONFIG.LOAD_LYRICS_TYPE.TYPE_chunyinyue,
    author: "Dreamtale",
    time: "04:06",
    des: "《The Dawn》的原意为黎明、拂晓、破晓，但在国内网络上，广被讹传为\"亡灵序曲\"。",
  },
  {
    song_type: TYPE,
    song_path: FILE_MUSIC_SHISHIPEIYUE,
    song_name: "伊卡洛斯 Icarus - Ivan Torrent",
    song_file: "icarus.mp3",
    img_file: "Ivan Torrent.jpg",
    lyrics_type: CONFIG.LOAD_LYRICS_TYPE.TYPE_chunyinyue,
    author: "Ivan Torrent",
    time: "04:35",
    des: "Ivan Torrent 是西班牙一个独立作曲家和制作人。为流行音乐和舞蹈艺术家在西班牙工作多年，作为一个设计师，也为广播电台做广告宣传和广告歌曲。现在Ivan Torrent想更专注于电影音乐的场景，为预告片音乐公司工作，以及做演示样品库。",
  }
];
