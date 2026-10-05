/* 遊び方の文章はこのファイルだけで変更できます。 */
(function (root) {
  "use strict";
  const HOW_TO_PLAY_DATA = Object.freeze({
    // 画面上部の見出し。
    title: "異変を避けて8組を目指せ",
    // 各項目を1段落として、同じ画面にまとめて表示します。
    lines: Object.freeze([
      "いつもと変わらない毎日。いつもと変わらない登校。",
      "…のはずだが何かがおかしい。",
      "何もなければ、そのまま進む。",
      "異変に気づいたら引き返し、逆に進む。",
      "自分のクラスである1年8組を目指してください。"
    ]),
    // 文字サイズ（単位：px）。数字を書き換えるだけで調整できます。
    // titleSizeはnullなら従来の自動サイズ（30〜48px）。例：36で36px固定。
    titleSize: 27,
    bodySize: 14,        // 通常画面の本文。
    // 横画面かつ画面の高さが600px以下の場合はこちらを使用します。
    mobileTitleSize: 21, // スマートフォン横画面の見出し。
    mobileBodySize: 11,  // スマートフォン横画面の本文。
    // 開始前の説明画面に表示するボタンの文字。
    buttonText: "ゲーム開始"
  });
  root.HOW_TO_PLAY_DATA = HOW_TO_PLAY_DATA;
  if (typeof module === "object" && module.exports) module.exports = HOW_TO_PLAY_DATA;
})(typeof globalThis === "object" ? globalThis : this);
