/* 共有時のタイトル・文章・URLはこのファイルで変更できます。 */
(function (root) {
  "use strict";
  const SHARE_DATA = Object.freeze({
    title: "1年8組", // 標準共有へ渡すゲームタイトル。
    text: "異変を回避し1年8組を目指せ！短編ブラウザゲーム「1年8組」",
    // 空文字なら現在のURLを使用（ゲームで使わないクエリ・ハッシュを除去）。
    // 固定URLを指定した場合は、そのURLを優先します。
    url: ""
  });
  root.SHARE_DATA = SHARE_DATA;
  if (typeof module === "object" && module.exports) module.exports = SHARE_DATA;
})(typeof globalThis === "object" ? globalThis : this);
