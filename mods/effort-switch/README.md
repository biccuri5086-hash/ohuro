# effort-switch（作業に合わせて、モデルとエフォートを切り替える mod）

> ohuro への複製元: biccuri5086-hash/gekiyaku-todo の `gekiyaku-todo/mods/effort-switch`（2026-11-18）。中身は同一。
> ohuro のマーケットプレイスからも入れられる: `/plugin install effort-switch --marketplace biccuri5086-hash/ohuro`
>
> **注意（節約の効果について）**: 会話の途中でモデルを切り替えると、プロンプトキャッシュが効かず次の1回が割高になる
> （gekiyaku-todo の `docs/調査/2026-10_自動化とハーネスの改善.md`、公式 costs / prompt-caching ドキュメント）。
> 切り替えは作業の区切りで行い、頻繁に行き来しない。auto で言葉に反応して切り替わり続けると逆効果になりうる（未計測）。
>
> **クラウドセッション（claude.ai/code）では**、リポジトリのプラグインは自動では読み込まれない。そのセッションで使うときは
> Claude に「effort-switch を読み込んで」と頼む（mod として読み込み、有効化の確認が出る）。

Claude Code の中で、`/mode` コマンドで、作業の種類に合わせてモデルとエフォートを切り替える。
**初期値は「自動」**（株主の指示・2026-11-11）。依頼の言葉が当てはまるまでは、何も変えない。サブエージェントには触らない。**fable は使わない**。

## 使い方
| 入力 | 意味 | 既定のモデル / エフォート |
|---|---|---|
| `/mode 台本` | 台本・企画 | opus / xhigh |
| `/mode 調査` | 調査・設計 | sonnet / medium |
| `/mode 軽作業` | 通知の確認・コミット・整理 | haiku / （指定しない） |
| `/mode 通常` | 切り替えをやめる | （何も変えない） |
| `/mode auto` | 直近の依頼の言葉から自動で選ぶ（**初期値**） | 台本・企画／調査・設計／軽作業 |
| `/mode 台本 sonnet` | モデルを指定する（opus・sonnet・haiku） | sonnet / high |
| `/mode 台本 high` | エフォートを指定する（low・medium・high・xhigh・max） | opus / high |

## モデルに合わせたエフォート
作業ごとに「望むエフォート」があり、モデルごとの上限まで下げて送る（`hooks/register.ts` の `CAP`）。
上限は想定（opus＝max、sonnet＝high、haiku＝なし）で、**公式では未確認**。エンジンも、対応しないモデルには自動で下げる／送らない。

## 状態
- `claude plugin validate` は通った（警告のみ）。`claude plugin test` の9件は通った（自動の判断のテストを含む）。
- **実際のセッションに読み込んで動かしたかは、別に確認が必要**（このファイルを書いた時点では未確認）。
- モードは、再読み込み・新しいセッションで「自動」に戻る。
- 自動の判断は言葉の当てはめ（台本・脚本・企画・セリフ・面白い→台本／調査・検索・設計・分析・比較→調査／コミット・push・通知・一覧・整理→軽作業）。精度は未計測。どれにも当たらなければ、直前のモードのまま。

## 手元のPCで使う
PR をマージしたあと（`main` に入ったあと）、Claude Code のプロンプトで1行打つ。`y` でマーケットプレイスを追加し、範囲（スコープ）を選ぶ。

```
/plugin install effort-switch --marketplace biccuri5086-hash/gekiyaku-todo
```

シェアから入れるとき：

```
claude plugin install effort-switch --marketplace biccuri5086-hash/gekiyaku-todo
```

マージ前に試すだけなら、リポジトリを取得して、このフォルダを指定して起動する（Windows の例）：

```
claude --plugin-dir C:\\パス\\gekiyaku-todo\\gekiyaku-todo\\mods\\effort-switch
```

入れたあと、ステータスに「モード：自動…」が出て、`/mode` で使い方が出れば成功。
マーケットプレイスの定義は、リポジトリ直下の `.claude-plugin/marketplace.json`。

## 読み込み方
- 開発中：`CLAUDE_CODE_PLUGIN_DIRS=<このフォルダ>` を付けて起動、または `--plugin-dir <このフォルダ>`。
- クラウドのセッションの mod は、コンテナが終わると消える。残すのはこのフォルダ（リポジトリ）。
