import { CONFIG } from '../../js/config.js';

const TYPE_1 = "天籁之音"
const FILE_MUSIC_TIANLANZHIYIN = 'tianlaizhiyin/'

export const musicList1 = [
  {
    song_type: TYPE_1,
    song_path: FILE_MUSIC_TIANLANZHIYIN,
    song_name: "天籁排箫 老鹰之歌 (El Condor Pasa)",
    song_file: "天籁排箫 老鹰之歌.mp3",
    img_file: "leo_rojas.jpg",
    lyrics_type: CONFIG.LOAD_LYRICS_TYPE.TYPE_chunyinyue,
    author: "Leo Rojas",
    time: '03:36',
    des: "每次一听这深邃、高远的旋律，如雄鹰翱翔在蓝天，悠然自在，每个吹奏的音符敲击心怀，释放自己。",
  },
  {
    song_type: TYPE_1,
    song_path: FILE_MUSIC_TIANLANZHIYIN,
    song_name: "Caribbean Blue - Enya",
    song_file: "Caribbean Blue - Enya.mp3",
    img_file: "Caribbean Blue - Enya.jpg",
    lyrics_file: 'Caribbean Blue - Enya.lrc',
    lyrics_type: CONFIG.LOAD_LYRICS_TYPE.TYPE_file,
    author: "Enya",
    time: '03:58',
    des: "像海风吹过蓝色梦境，听完心里会安静很久。",
  },

];
