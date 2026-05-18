# Email AIをスマホで外出先から使う

## いちばん簡単な公開方法: Render

1. このフォルダをGitHubリポジトリに置く。
2. Renderで `New` → `Blueprint` を選ぶ。
3. GitHubリポジトリを選ぶ。
4. `render.yaml` の内容でWeb Serviceを作る。
5. Renderの環境変数に次を入れる。

```text
GOOGLE_CLIENT_ID=Google CloudのOAuthクライアントID
GOOGLE_CLIENT_SECRET=Google CloudのOAuthクライアントシークレット
OPENAI_API_KEY=OpenAI APIキー
OPENAI_MODEL=gpt-4o-mini
```

## Google Cloud側で追加するURL

Renderで公開URLができたら、Google Cloud ConsoleのOAuthクライアントに次を追加する。

```text
https://あなたのRender URL/auth/google/callback
```

例:

```text
https://email-ai.onrender.com/auth/google/callback
```

## スマホで使う

公開URLをスマホのSafari/Chromeで開く。

iPhoneなら共有ボタンから「ホーム画面に追加」を押すと、アプリのように起動できる。

## 注意

- Gmail本文を読むアプリなので、一般公開するならGoogleの審査、プライバシーポリシー、利用規約、データ削除方法が必要。
- 自分だけで使う段階なら、Google OAuthのテスターに自分のGmailを追加して使う。
- Renderの無料/低価格プランは停止や制限がある場合がある。安定運用するなら有料プランと永続ディスクを使う。
