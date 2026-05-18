# Email AI Gmail

Gmailを読み込み、送信元ごとの関係性やあなた自身の情報を使って、人間らしい返信下書きを作るローカルWebアプリです。

## できること

- Gmail OAuthでログイン
- 未読や受信メールを一覧表示
- メール本文、件名、送信元、宛先、スレッドを読み込み
- あなたのプロフィール、署名、文体ルールを保存
- 送信者ごとの関係性、敬語レベル、背景メモを保存
- AIで返信文を生成
- Gmailの下書きとして保存

## セットアップ

1. `.env.example`を`.env`にコピーします。
2. Google Cloud ConsoleでOAuthクライアントを作り、以下を設定します。
   - Authorized redirect URI: `http://localhost:8787/auth/google/callback`
   - Scope: `https://www.googleapis.com/auth/gmail.modify`
3. `.env`に`GOOGLE_CLIENT_ID`と`GOOGLE_CLIENT_SECRET`を入れます。
4. AI返信を使う場合は`OPENAI_API_KEY`も入れます。
5. 起動します。

```bash
node server.mjs
```

ブラウザで `http://localhost:8787` を開きます。

## データ保存

プロフィール、送信者メモ、Gmailトークンは `data/app.json` に保存されます。このファイルはGitに含めない設定です。
