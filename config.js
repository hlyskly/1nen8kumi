/* ゲームバランス調整：このファイルを編集し、ページを再読み込みしてください。 */
(function (root) {
  "use strict";
  const GAME_CONFIG = Object.freeze({
    // 歩行速度倍率：1.0＝現在、1.2＝20%速い、0.8＝20%遅い。0＝停止。
    walkSpeed: 1.2,
    // 現在の基準速度（論理px/秒）。通常の調整は上の倍率だけ変更します。
    baseWalkSpeed: 250,

    // 通常ラウンドの異変発生率：0＝なし、0.5＝50%、1＝必ず異変。
    // 最初の1組NORMAL固定、デバッグ強制指定は従来どおり優先します。
    anomalyRate: 0.6,
    // 相対ウェイト。合計100は不要。0＝抽選しない。全て0ならNORMAL。
    // 新規異変はrules.jsのIDと一致する項目を追加してください。
    anomalyWeights: Object.freeze({
      hole: 1,         // 廊下の穴
      dog: 1,          // 犬
      light: 1,        // 割れた電灯
      girlsLooking: 1, // こちらを見る女子生徒
      boyLooking: 1,   // こちらを見る男子生徒
      blood: 1,        // 廊下の血痕
      handprint: 1,    // 窓の血の手形
      deathNotice: 1,  // 掲示板の「死」
      knife: 1,        // 血の付いた包丁
      brokenWindow: 1 // 割れた教室窓
    }),

    // 音量倍率：0＝無音、1＝現在の聞こえ方。
    // 実際の音量＝下記の基準音量×マスター倍率×カテゴリ倍率。
    // 元音源に対する音量は0〜1に制限します。
    masterVolume: 1.0,   // 全ての音
    ambientVolume: 1.0,  // 校内環境音
    footstepVolume: 1.0, // 足音1・2共通
    doorVolume: 1.0,     // 引き戸
    // 開始時の学校チャイム：0.0＝無音、1.0＝基準音量。
    chimeVolume: 1.0,
    lightVolume: 1.0,    // 蛍光灯のハム音
    // 元音源に対する基準音量（0＝無音、1＝元音源の最大音量）。
    // 既存値をそのまま移しています。絶対音量の調整はこちらも使用できます。
    baseVolumes: Object.freeze({ ambience: 0.12, fluorescent: 0.07, footstep: 0.28, door: 0.40, chime: 0.40 })
  });
  root.GAME_CONFIG = GAME_CONFIG;
  if (typeof module === "object" && module.exports) module.exports = GAME_CONFIG;
})(typeof globalThis === "object" ? globalThis : this);
