document.getElementById("sendButton").addEventListener("click", async () => {
  const replyText = document.getElementById("replyOutput").value.trim();
  if (!state.selected) {
    toast("送信するメールを選択してください。");
    return;
  }
  if (!replyText) {
    toast("返信本文を入力してください。");
    return;
  }
  if (!confirm(`このメールを送信しますか？\n宛先: ${state.selected.from.raw}`)) return;

  const button = document.getElementById("sendButton");
  button.disabled = true;
  button.textContent = "送信中";
  try {
    await api("/api/send", {
      method: "POST",
      body: JSON.stringify({ message: state.selected, reply: replyText })
    });
    document.getElementById("replyOutput").value = "";
    toast("メールを送信しました。");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "送信";
  }
});
