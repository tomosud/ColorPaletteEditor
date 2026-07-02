# Color Palette Editor

Color Palette Editor は、ブラウザ上で小さな色パレット画像を編集するための静的 Web アプリです。

公開ページ: https://tomosud.github.io/ColorPaletteEditor/

## 使用者向け

ページを開くと、フォーマットを選んで新しいパレットを作成できます。セルをクリックするとカラーピッカーで色を変更でき、ドラッグ選択、Shift クリック、コピーとペースト、Undo などで複数セルをまとめて編集できます。

PNG を画面へドロップすると、アプリで保存したメタデータ付き PNG を開けます。編集内容はブラウザの IndexedDB に保存されるため、同じブラウザでは再読み込み後も作業中のウィンドウが復元されます。

保存は PNG として行います。JSON を PNG と同じように保存する機能はありません。

### メモ

各パレットウィンドウの下部には自由記入のメモ欄があります。メモは色データや列ラベルと一緒にブラウザの IndexedDB に自動保存され、アプリから保存した PNG のメタデータにも含まれます。その PNG を開き直すと、メモも復元されます。

メモは PNG の画像ピクセルには描き込まれません。通常の画像ビューアで見える情報ではなく、このアプリが読み取る補助情報です。

`colorPalette16` は 16 列を Spring/Summer/Autumn/Winter の BC/Shadow 行で共有するフォーマットです。列ごとの短い名前や番号は編集可能な列ラベルに入れ、メモにはパレット全体の用途、参照元、各番号の意味、調整方針、バージョンなどの補足を書いておく想定です。

### Folder ボタン

`Folder` ボタンは、対応ブラウザでローカルフォルダを接続するための機能です。接続すると、フォルダ内の PNG やフォーマット JSON が上部バーに一覧表示され、クリックして開けます。

フォルダ接続中は、各パレットの `Save PNG` が接続フォルダを保存先の初期位置として使います。保存後はフォルダ一覧が更新されるため、作成した PNG をそのまま開き直せます。ブラウザの権限が切れた場合は、上部バーから再接続できます。

## 開発者向け

このアプリはビルドツールに依存しない静的構成です。

- `index.html`: 画面の土台
- `style.css`: UI スタイル
- `app.js`: パレット編集ロジック
- `format/*.json`: パレットの行、列、グループ定義
- `tests/`: Playwright テスト

ローカルでの確認:

```bash
npm ci
npm test
npm run build
```

`npm run build` は公開用ファイルを `dist/` にコピーします。GitHub Actions は `main` ブランチへの push ごとにテストとビルドを行い、`dist/` を GitHub Pages にデプロイします。リポジトリ名に基づく公開パスは `https://tomosud.github.io/ColorPaletteEditor/` のままです。

## フォーマット概要

フォーマット定義は `format/*.json` にあります。例は `format/colorPalette16.json` です。Windows のパス表記では `format\colorPalette16.json` です。

### 共通仕様

各フォーマットは次のような構造です。

```json
{
  "name": "colorPalette16",
  "width": 16,
  "height": 8,
  "rowGroups": [
    {
      "label": "Spring",
      "rows": [{ "label": "BC" }, { "label": "Shadow" }]
    }
  ],
  "columns": [
    { "label": "01", "editable": true }
  ]
}
```

`name` は画面のフォーマット選択に表示される名前です。`width` と `height` はパレットのセル数です。`rows` は通常の行ラベル、`rowGroups` は複数行をまとめる行グループです。`columns` は列ラベルで、`segments` を持つ場合は列をグループ表示します。`editable: true` の列ラベルは画面上で編集できます。`display.cellWidth` と `display.cellHeight` を指定すると、セル表示サイズをフォーマットごとに変えられます。

### 収録フォーマット

- `Landscape`: 16 列 x 2 行。Road、Grass、Soil_Upper、Soil_Bottom を列グループにし、それぞれ Spring/Summer/Autumn/Winter の 4 セグメントを持ちます。
- `colorPalette16`: 16 列 x 8 行。Spring/Summer/Autumn/Winter の行グループごとに BC と Shadow の 2 行を持ちます。
- `Leaves`: 8 列 x 2 行。Spring/Summer/Autumn/Winter の列グループごとに color1/color2 の 2 セグメントを持ちます。
- `Grass`: 4 列 x 2 行。Spring/Summer/Autumn/Winter の単純な 4 列と、BC/Shadow の 2 行です。
