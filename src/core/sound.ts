const TRACKS = [
  "music_smt_Julia_018.mp3",
  "audio_hero_Boutique_SIPML_C-0105.mp3",
  "music_dave_miles_jazzing_around.mp3",
  "music_zapsplat_on_the_job_140.mp3",
  "music_zapsplat_win_city.mp3",
  "music_zapsplat_as_time_passes_124.mp3",
  "audio_hero_Single-Malt_SIPML_C-1105.mp3",
  "audio_hero_Urban-Delivery_SIPML_C-0810.mp3",
];

export class Player {
  private audio: HTMLAudioElement;
  private index = 0;
  private tracks: string[];

  constructor() {
    this.audio = new Audio();
    this.audio.onended = () => this.next();
    this.audio.volume = 0.5;
    this.tracks = TRACKS.slice();
    // shuffle
    for (let i = this.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
    }
  }

  play() {
    this.loadAndPlay();
  }

  private next() {
    this.index = (this.index + 1) % this.tracks.length;
    this.loadAndPlay();
  }

  private loadAndPlay() {
    this.audio.src = `music/${this.tracks[this.index]}`;
    this.audio.play().catch((e) => console.warn("Audio playback failed", e));
  }
}
