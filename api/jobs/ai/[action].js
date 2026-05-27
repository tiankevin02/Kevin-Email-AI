import { buildProfileContext, jobsAiChat, buildConfig } from "../../_lib/ai.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const action = req.query.action;
  const body = req.body;
  // Merge client-provided keys (localStorage) with env vars; env vars take priority
  const envConfig = buildConfig();
  const clientKeys = body._clientKeys || {};
  const config = {
    ...envConfig,
    geminiApiKey:    envConfig.geminiApiKey    || clientKeys.geminiApiKey    || "",
    anthropicApiKey: envConfig.anthropicApiKey || clientKeys.anthropicApiKey || "",
    openAiKey:       envConfig.openAiKey       || clientKeys.openAIKey       || "",
    grokApiKey:      envConfig.grokApiKey      || clientKeys.grokApiKey      || "",
  };

  try {
    switch (action) {
      case "es-review": {
        const { companyName, question, answer, userProfile, maxChars } = body;
        if (!companyName || !question || !answer) {
          res.status(400).json({ error: "企業名・設問・回答を入力してください。" });
          return;
        }
        const profileCtx = buildProfileContext(userProfile);
        const charNote = maxChars ? `（${maxChars}字以内で記述すること）` : `（改善版の回答例を提示）`;
        const system = `あなたは${companyName}の人事採用担当です。エントリーシートの書類選考を行います。

まず${companyName}の企業理念・価値観・求める人材像をあなたの知識で整理し、そのペルソナに基づいてESを評価・添削してください。

【評価観点】
1. 企業との適合性（カルチャーフィット）
2. 自己分析の深さと具体性
3. 論理構成（結論→根拠→具体例）
4. 表現力・語彙の適切さ
5. 独自性・インパクト

【出力形式（マークダウン）】
## ${companyName}について（求める人材像）
（企業の特徴と求める人物像を2〜3行で）

## 評価
**良かった点**
- （2〜3点、具体的に）

**改善が必要な点**
- （2〜3点、具体的に）

## 添削後の例文
${charNote}

## 総評
（100字程度の総合コメント）`;
        const review = await jobsAiChat(config, system, `【設問】${question}\n\n【回答】\n${answer}${profileCtx}`);
        res.status(200).json({ review });
        return;
      }

      case "webtest": {
        const { companyName } = body;
        if (!companyName) {
          res.status(400).json({ error: "企業名を入力してください。" });
          return;
        }
        const system = "あなたは就職活動の専門家です。企業のWEBテスト（適性検査）に関する詳しい情報を提供します。";
        const user = `${companyName}のWEBテストについてマークダウンで以下の形式で教えてください：

## ${companyName}のWEBテスト情報

### テスト種類
（例: SPI3テストセンター形式、TG-WEB、GAB、CUBIC など）

### 出題科目・内容
（言語・非言語・構造的把握力など）

### 受験形式
（テストセンター/自宅受験/会場）

### 難易度・特徴
（難しい科目、よく出るパターン）

### 対策方法
（おすすめの参考書・練習サイト）

### 注意事項
（制限時間・計算機可否など）

※不確かな情報は「要確認」と記載してください。`;
        const info = await jobsAiChat(config, system, user);
        res.status(200).json({ info });
        return;
      }

      case "interview-tips": {
        const { companyName, interviewType } = body;
        if (!companyName) {
          res.status(400).json({ error: "企業名を入力してください。" });
          return;
        }
        const system = "あなたは就職活動支援の専門家です。企業の面接情報と対策を詳しく提供します。";
        const user = `${companyName}の${interviewType || "面接"}についてマークダウンで以下の形式でまとめてください：

## ${companyName}の面接情報

### 面接の形式・雰囲気
（個人/グループ、雰囲気、面接官の特徴など）

### よく聞かれる質問（10問程度）
- （箇条書き）

### 企業が重視するポイント
（この企業特有の評価基準）

### 逆質問のコツ
（おすすめの逆質問例）

### 対策のポイント
（この企業の面接を通過するための具体的アドバイス）

※体験談・レビューサイトの情報を参考にした推測を含みます。`;
        const tips = await jobsAiChat(config, system, user);
        res.status(200).json({ tips });
        return;
      }

      case "interview-feedback": {
        const { companyName, interviewType, experience, questionsAsked } = body;
        if (!experience) {
          res.status(400).json({ error: "面接体験を入力してください。" });
          return;
        }
        const system = "あなたは就職活動のプロコーチです。面接体験を分析し、具体的なフィードバックを提供します。";
        const user = `以下の面接体験についてマークダウンでフィードバックしてください。

【企業】${companyName || "不明"}　【種別】${interviewType || "面接"}
【聞かれた質問】${questionsAsked || "（記載なし）"}
【体験・感想】${experience}

## 面接体験のフィードバック

### 良かった点
- （2〜3点）

### 改善できる点
- （2〜3点）

### 次の面接に向けたアドバイス
（具体的な行動提案）

### 主要な質問への回答改善案
（主要な質問についての改善アドバイス）

### 総評
（100字程度）`;
        const feedback = await jobsAiChat(config, system, user);
        res.status(200).json({ feedback });
        return;
      }

      case "es-advice": {
        const { companyName, question, userProfile, maxChars } = body;
        if (!companyName || !question) {
          res.status(400).json({ error: "企業名と設問を入力してください。" });
          return;
        }
        const profileCtx = buildProfileContext(userProfile);
        const sampleLabel = maxChars ? `参考例文（${maxChars}字程度）` : `参考例文（100字程度）`;
        const sampleNote = maxChars
          ? `（${maxChars}字程度で書き始め〜本文まで全体の流れを示すこと${profileCtx ? "・応募者のプロフィールを活かすこと" : ""}）`
          : profileCtx ? "（応募者のプロフィールを活かした書き出し例）" : "（書き出しの例）";
        const system = `あなたは${companyName}の人事採用担当です。ESの設問に対して、応募者が回答を作成するためのアドバイスを提供します。応募者のプロフィール情報がある場合はそれを踏まえた具体的なアドバイスをしてください。`;
        const user = `【企業】${companyName}
【設問】${question}${maxChars ? `\n【文字数制限】${maxChars}字以内` : ""}${profileCtx}

以下の観点でアドバイスをマークダウンで提供してください：

## 回答のアプローチ
（この設問で企業が見たいこと、どう答えれば好印象か）

## 構成の提案
1. （結論）
2. （根拠・エピソード）
3. （学び・成長）
4. （企業への応用）

## 避けるべき表現・内容
- （NG例）

## ${sampleLabel}
${sampleNote}`;
        const advice = await jobsAiChat(config, system, user);
        res.status(200).json({ advice });
        return;
      }

      case "es-strategy": {
        const { companyName, esEntries, userProfile } = body;
        if (!companyName) {
          res.status(400).json({ error: "企業名を入力してください。" });
          return;
        }
        const questionsStr = (esEntries || []).map(e => `- ${e.question}`).join("\n") || "（設問未登録）";
        const profileCtx = buildProfileContext(userProfile);
        const system = "あなたは就職活動の専門家です。企業のES（エントリーシート）対策に関する詳しい情報を提供します。応募者のプロフィールがある場合は、その人に合った具体的なアドバイスをしてください。";
        const user = `${companyName}のES対策についてマークダウンで以下の形式で教えてください：

【登録されている設問】
${questionsStr}${profileCtx}

## ${companyName}のES対策

### 企業の求める人物像
（${companyName}がESで重視するポイント）

### よく出るES設問
- （例年の傾向）

### 文章を書くときのポイント
- （この企業特有のアドバイス）

### 通過率を上げるコツ
${profileCtx ? "（上記応募者のプロフィールを踏まえた差別化ポイント）" : "（差別化のポイント）"}

### 注意事項
（字数制限、書式など）

※不確かな情報は「要確認」と記載してください。`;
        const strategy = await jobsAiChat(config, system, user);
        res.status(200).json({ strategy });
        return;
      }

      case "iv-review": {
        const { companyName, interviewType, question, answer, userProfile } = body;
        if (!question || !answer) {
          res.status(400).json({ error: "設問と回答を入力してください。" });
          return;
        }
        const profileCtx = buildProfileContext(userProfile);
        const system = `あなたは${companyName || "企業"}の面接官です。面接の回答を添削します。${profileCtx ? "応募者のプロフィールを参考に、その人の経験を活かした具体的なフィードバックをしてください。" : ""}`;
        const user = `【企業】${companyName || "不明"}　【面接種別】${interviewType || "面接"}
【設問】${question}
【回答】${answer}${profileCtx}

以下の観点でマークダウンで添削してください：

## 評価
**良かった点**
- （2〜3点）

**改善が必要な点**
- （2〜3点）

## 改善案
${profileCtx ? "（応募者のプロフィールを活かした、より良い回答例）" : "（より良い回答例）"}

## 総評
（80字程度）`;
        const review = await jobsAiChat(config, system, user);
        res.status(200).json({ review });
        return;
      }

      case "iv-advice": {
        const { companyName, interviewType, question, userProfile } = body;
        if (!question) {
          res.status(400).json({ error: "設問を入力してください。" });
          return;
        }
        const profileCtx = buildProfileContext(userProfile);
        const system = `あなたは就職活動の専門家です。面接の設問に対する回答のアドバイスを提供します。応募者のプロフィールがある場合は、その人の実際の経験・強みを使った具体的なアドバイスをしてください。`;
        const user = `【企業】${companyName || "不明"}　【面接種別】${interviewType || "面接"}
【設問】${question}${profileCtx}

この設問への回答アドバイスをマークダウンで提供してください：

## この設問の意図
（面接官が何を見たいか）

## 回答の構成
1. （結論・主張）
2. （根拠・エピソード）
3. （学び・成果）
4. （入社後への展開）

## 効果的なポイント
${profileCtx ? "（応募者のプロフィールを活かした具体的なアドバイス）" : "- （具体的なアドバイス）"}

## 回答例（120字程度）
${profileCtx ? "（応募者のガクチカ・自己PRを踏まえた書き出し例）" : "（参考になる書き出し）"}`;
        const advice = await jobsAiChat(config, system, user);
        res.status(200).json({ advice });
        return;
      }

      case "iv-strategy": {
        const { companyName, userProfile } = body;
        if (!companyName) {
          res.status(400).json({ error: "企業名を入力してください。" });
          return;
        }
        const profileCtx = buildProfileContext(userProfile);
        const system = "あなたは就職活動支援の専門家です。企業の面接情報と対策を詳しく提供します。応募者のプロフィールがある場合は、その人に合った個別の対策を含めてください。";
        const user = `${companyName}の面接対策についてマークダウンで以下の形式でまとめてください：${profileCtx}

## ${companyName}の面接対策情報

### 面接の形式・雰囲気
（個人/グループ、雰囲気、面接官の特徴など）

### よく聞かれる質問（10問程度）
- （箇条書き）

### 企業が重視するポイント
（この企業特有の評価基準）

### 逆質問のコツ
（おすすめの逆質問例）

### 対策のポイント
${profileCtx ? "（上記応募者のプロフィールを踏まえた、この企業の面接を通過するための具体的アドバイス）" : "（この企業の面接を通過するための具体的アドバイス）"}

※体験談・レビューサイトの情報を参考にした推測を含みます。`;
        const strategy = await jobsAiChat(config, system, user);
        res.status(200).json({ strategy });
        return;
      }

      case "generate-email": {
        const { companyName, industry, selectionType, emailType, selfPr, status, userProfile } = body;
        if (!companyName) {
          res.status(400).json({ error: "企業名を入力してください。" });
          return;
        }
        const profileCtx = buildProfileContext(userProfile);
        const effectiveSelfPr = selfPr || userProfile?.selfPr || "";
        const system = "あなたは就職活動の文章作成のプロです。採用担当者に好印象を与える、礼儀正しく熱意が伝わるメールを作成します。";
        const user = `以下の情報をもとに、${emailType || "応募"}メールを作成してください。

【企業名】${companyName}
【業界】${industry || "不明"}
【選考タイプ】${selectionType || "インターン"}
【メール種別】${emailType || "応募"}メール
【自己PR/アピールポイント】${effectiveSelfPr || "（未記載）"}${profileCtx}

件名も含めて、実際に送れる完成形のメールを作成してください。
・丁寧で簡潔な文体
・${companyName}への具体的な関心を盛り込む
・件名: 〇〇（適切な件名）
・本文: 書き出し〜締めまで完全に`;
        const email = await jobsAiChat(config, system, user);
        res.status(200).json({ email });
        return;
      }

      case "scan-job": {
        const { companyName, jobUrl, jobText, userProfile } = body;
        if (!jobUrl && !jobText) {
          res.status(400).json({ error: "URLまたはテキストを入力してください。" });
          return;
        }
        const profileCtx = buildProfileContext(userProfile);
        const system = "あなたは就職活動の情報分析の専門家です。求人情報から重要な情報を正確に抽出します。応募者のプロフィールがある場合は、その人との相性・アピールポイントも分析してください。";
        let content = jobText || "";
        if (jobUrl && !content) {
          try {
            const r = await fetch(jobUrl, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
            const html = await r.text();
            content = html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").slice(0, 3000);
          } catch {
            content = `URL: ${jobUrl}`;
          }
        }
        const user = `以下の求人情報を分析してください。
企業名: ${companyName || "不明"}
内容: ${content.slice(0, 2500)}${profileCtx}

## 求人情報分析

### 企業情報
（企業の特徴・事業内容）

### 求める人物像
（必須スキル・歓迎スキル・性格・経験）

### 仕事内容・配属
（インターン/選考内容の詳細）

### 選考プロセス
（応募→内定までのステップ）

### アピールすべきポイント
${profileCtx ? "（上記応募者のプロフィールを踏まえた、この企業への応募で特に強調すべき点）" : "（この企業への応募で特に強調すべき点）"}`;
        const result = await jobsAiChat(config, system, user);
        res.status(200).json({ result });
        return;
      }

      case "optimize-selfpr": {
        const { companyName, industry, selectionType, basePr, esEntries, userProfile } = body;
        const effectiveBasePr = basePr || userProfile?.selfPr || "";
        if (!companyName || !effectiveBasePr) {
          res.status(400).json({ error: "企業名と自己PRを入力してください。" });
          return;
        }
        const esInfo = (esEntries || []).filter(e => e.answer).map(e => `Q: ${e.question}\nA: ${e.answer}`).join("\n\n");
        const profileCtx = buildProfileContext(userProfile);
        const system = `あなたは${companyName}の人事採用担当AIです。${companyName}の企業理念・価値観・求める人材像をもとに、応募者の自己PRを最適化します。`;
        const user = `【企業】${companyName}（${industry || "業界不明"}）【選考タイプ】${selectionType || "インターン"}

【ベース自己PR】
${effectiveBasePr}

${esInfo ? `【ESの回答（参考）】\n${esInfo}` : ""}${profileCtx}

以下の観点で最適化した自己PRを作成してください：
1. ${companyName}の企業理念・求める人物像との整合性を高める
2. 具体的なエピソードと数値を盛り込む
3. 企業への志望意欲を自然に織り込む
4. 200〜400字程度の最適化バージョンを提示
5. 改善ポイントの解説も付ける

## 最適化された自己PR（そのまま使える版）
（最適化後のテキスト）

## 改善ポイント
- （何をどう変えたか）`;
        const optimized = await jobsAiChat(config, system, user);
        res.status(200).json({ optimized });
        return;
      }

      case "gap-analysis": {
        const { companyName, industry, selectionType, esEntries, selfPr, notes, userProfile } = body;
        if (!companyName) {
          res.status(400).json({ error: "企業名を入力してください。" });
          return;
        }
        const esInfo = (esEntries || []).filter(e => e.question).map(e => `Q: ${e.question}\nA: ${e.answer || "（未回答）"}`).join("\n\n");
        const effectiveSelfPr = selfPr || userProfile?.selfPr || "";
        const effectiveGakuchika = userProfile?.gakuchika || "";
        const system = `あなたは${companyName}の人事採用担当AIです。企業が求めるものと応募者が持っているものを比較し、ギャップを明確に分析します。`;
        const user = `【企業】${companyName}（${industry || ""}）【選考タイプ】${selectionType || "インターン"}

【応募者の現状】
自己PR: ${effectiveSelfPr || "（未記載）"}
ガクチカ: ${effectiveGakuchika || "（未記載）"}
志望動機の軸: ${userProfile?.motivation || "（未記載）"}
スキル・資格: ${userProfile?.skills || "（未記載）"}
メモ・志望動機: ${notes || "（未記載）"}
ESの内容:
${esInfo || "（未記載）"}

## ギャップ分析

### 企業が求めるもの（${companyName}の求める人物像）
- （3〜5点）

### あなたが持っているもの（現状の強み）
- （記載内容から判断）

### ギャップ（補強が必要な点）
- （具体的に）

### 今すぐできる対策
1. （優先順位付きで3〜5項目）

### 面接・ESで強調すべきポイント
（この企業に対して特にアピールすべき内容）`;
        const analysis = await jobsAiChat(config, system, user);
        res.status(200).json({ analysis });
        return;
      }

      case "mock-interview-start": {
        const { companyName, interviewType, userProfile } = body;
        if (!companyName) {
          res.status(400).json({ error: "企業名を入力してください。" });
          return;
        }
        const profileCtx = buildProfileContext(userProfile);
        const system = `あなたは${companyName}の面接官です。${companyName}の企業理念と求める人物像を踏まえて面接を行います。${profileCtx ? "応募者のプロフィールを参考にして、その人に合った質問をしてください。" : ""}`;
        const user = `${companyName}の${interviewType || "一次面接"}として最初の質問を1つだけ考えてください。
また、この面接の評価基準・コンテキストを簡潔にまとめてください。${profileCtx}

出力形式（JSON）:
{
  "question": "面接の最初の質問（自己紹介を含む自然な導入）",
  "context": "この面接の評価基準・重視するポイント（100字以内）"
}

JSONのみを返してください。`;
        const raw = await jobsAiChat(config, system, user);
        let question = "自己紹介をお願いします。";
        let context = "";
        try {
          const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
          question = parsed.question || question;
          context = parsed.context || "";
        } catch {
          question = raw.split("\n")[0].replace(/^["{\s]*"question"\s*:\s*"?/, "").replace(/"?\s*[,}].*/, "").trim() || question;
        }
        res.status(200).json({ question, context });
        return;
      }

      case "mock-interview-next": {
        const { companyName, interviewType, question, answer, history, context, userProfile } = body;
        if (!question || !answer) {
          res.status(400).json({ error: "質問と回答を入力してください。" });
          return;
        }
        const profileCtx = buildProfileContext(userProfile);
        const system = `あなたは${companyName}の面接官です。評価基準: ${context || "企業理念に基づく評価"}${profileCtx ? "\n" + profileCtx : ""}`;
        const histStr = (history || []).map(h => `Q: ${h.q}\nA: ${h.a}`).join("\n\n");
        const user = `面接の流れ:
${histStr ? histStr + "\n\n" : ""}Q: ${question}
A: ${answer}

上記の回答に対して：
1. 簡潔なフィードバック（良い点・改善点、100字以内）
2. 次の質問（前の回答を踏まえた自然な質問）

出力形式（JSON）:
{
  "feedback": "フィードバック（100字以内）",
  "nextQuestion": "次の質問"
}

JSONのみを返してください。`;
        const raw = await jobsAiChat(config, system, user);
        let feedback = "";
        let nextQuestion = "他に自己PRはありますか？";
        try {
          const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
          feedback = parsed.feedback || "";
          nextQuestion = parsed.nextQuestion || nextQuestion;
        } catch {
          nextQuestion = raw.split("\n").find(l => l.includes("?") || l.includes("？")) || nextQuestion;
        }
        res.status(200).json({ feedback, nextQuestion });
        return;
      }

      case "analysis": {
        const { companies, schedules } = body;
        const byStatus = {};
        (companies || []).forEach((c) => { byStatus[c.status] = (byStatus[c.status] || 0) + 1; });
        const today = new Date().toISOString().slice(0, 10);
        const upcoming = (schedules || []).filter((s) => s.date >= today).length;
        const system = "あなたは就職活動のプロコーチです。就活データを分析し、具体的なアドバイスを提供します。";
        const user = `以下の就活データを分析してマークダウンでフィードバックしてください。

【登録企業数】${(companies || []).length}社
【ステータス別】${JSON.stringify(byStatus)}
【今後の予定】${upcoming}件
【企業一覧】${(companies || []).map((c) => `${c.name}(${c.status})`).join("、")}

## 就活進捗分析

### 現在の状況
（客観的な進捗サマリー）

### 強み・うまくいっている点
- （具体的に）

### 課題・改善が必要な点
- （具体的に）

### 今週やるべきこと
1. （優先順位付きで3〜5項目）

### 長期的な戦略アドバイス
（就活全体の戦略）`;
        const analysis = await jobsAiChat(config, system, user);
        res.status(200).json({ analysis });
        return;
      }

      case "archive-search": {
        const { query, entries, userProfile } = body;
        if (!query) {
          res.status(400).json({ error: "検索クエリを入力してください。" });
          return;
        }
        if (!entries || entries.length === 0) {
          res.status(200).json({ results: [] });
          return;
        }
        const profileCtx = buildProfileContext(userProfile);
        const entriesText = entries.map((e, i) =>
          `[${i}] 企業:${e.companyName} 種別:${e.type === "es" ? "ES" : "面接Q&A"}\n設問:${e.question}\n回答:${(e.answer || "（未記入）").slice(0, 300)}`
        ).join("\n\n");
        const system = `あなたは就職活動のアシスタントです。ユーザーの検索クエリに対して、過去のESや面接Q&Aから関連性の高いものを見つけてください。
関連性の判断基準：
- キーワードが一致する（直接一致）
- テーマが類似する（例：「挫折経験」と「困難を乗り越えた経験」は類似）
- 回答内容が検索クエリの参考になる

必ず以下のJSON配列のみを返してください（マークダウン不可、JSONのみ）：
[{"index": 数字, "relevance": "high"|"medium", "reason": "関連する理由（20字以内）"}, ...]
関連性のないものは含めないこと。最大10件まで。${profileCtx}`;
        const result = await jobsAiChat(config, system, `【検索クエリ】${query}\n\n【登録データ】\n${entriesText}`);
        let ranked = [];
        try {
          const jsonMatch = result.match(/\[[\s\S]*\]/);
          ranked = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
        } catch {}
        res.status(200).json({ results: ranked });
        return;
      }

      default:
        res.status(404).json({ error: "Unknown action" });
    }
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
}

export const config = { api: { bodyParser: { sizeLimit: "5mb" } } };
