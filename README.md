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

### Multiply レイヤー

各パレットウィンドウの `+ Multiply` ボタンで、既存の色(Base レイヤー)の上に乗算レイヤーを追加できます。追加すると Photoshop のレイヤーに似た一覧(Multiply / Base)がウィンドウ内に表示されます。

- 行をクリックすると編集対象のレイヤーが切り替わります。カラーピッカー、コピーとペースト、Adjust、Image Pick はすべて選択中のレイヤーに対して働きます。
- 目のアイコンで各レイヤーの表示を切り替えます。両方表示のときは、セルに乗算合成(Base × Multiply)した色が表示されます。
- 片方だけ表示しているときは、表示中のレイヤーが自動的に編集対象になります。表示していないレイヤーは編集できません。
- Multiply レイヤーの初期色は白(`#ffffff`)なので、追加直後の合成結果は Base と同じ見た目です。
- ✕ ボタンで Multiply レイヤーを削除できます。削除は Ctrl+Z で元に戻せます。
- `Save PNG` の際、両方のレイヤーが表示状態になっていない場合は警告が表示され、両方表示に切り替えたうえで合成色の PNG を保存します。

### データの保存先と互換性

- 編集内容(Base / Multiply 両レイヤーの色、列ラベル、メモ、ウィンドウ位置、レイヤーの表示状態)は、ブラウザの IndexedDB に自動保存されます。同じブラウザなら再読み込み後も復元されます。
- PNG として保存すると、画像ピクセルには乗算合成後の色だけが書き込まれます。一方、PNG 内の `CPE_DATA` テキストチャンクには Base / Multiply 両レイヤーの色を含む全メタデータが格納されるため、その PNG をアプリへドロップすると両レイヤーとも復元されます。
- Multiply レイヤーを使っていないパレットのデータは従来とまったく同じ形式です。旧バージョンで保存した PNG や IndexedDB のデータもそのまま開けます。逆に、Multiply 付き PNG を旧バージョンのアプリで開いた場合は Base レイヤーのみ読み込まれます。

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
