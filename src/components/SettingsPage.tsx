import { useEffect, useRef, useState, type FormEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { ArrowLeft, ArrowUpRight, Key } from "@phosphor-icons/react";
import { clearApiKey, saveApiKey } from "../lib/settings";
import { openExternal } from "../lib/presentation";
import styles from "../App.module.css";
export function SettingsPage({
  apiKey,
  onSaved,
  onClose,
  initialError,
}: {
  apiKey: string;
  onSaved: (key: string) => void;
  onClose: () => void;
  initialError?: string;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? "");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      onSaved(await saveApiKey(draft));
      setDraft("");
      onClose();
    } catch {
      setError("保存失败，请检查钥匙串或浏览器站点数据权限后重试。");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await clearApiKey();
      onSaved("");
      setDraft("");
    } catch {
      setError("清除失败，请检查钥匙串或浏览器站点数据权限后重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={styles.settingsPage} id="main-content">
      <button className={styles.textButton} onClick={onClose}>
        <ArrowLeft /> 返回鸟讯
      </button>
      <h1 ref={heading} tabIndex={-1}>
        个人配置
      </h1>
      <p>连接 eBird，查看近期公开鸟讯。</p>
      <section className={styles.settingsSection}>
        <div className={styles.sectionHeading}>
          <h2>
            <Key /> eBird API Key
          </h2>
          <span>{apiKey ? "已保存" : "未设置"}</span>
        </div>
        <p>
          保存一次，之后打开应用即可更新。你的关注城市和历史导入保存在这台设备。
        </p>
        <button
          className={styles.linkButton}
          onClick={() => void openExternal("https://ebird.org/api/keygen")}
        >
          申请 eBird API Key <ArrowUpRight />
        </button>
        <form onSubmit={save} className={styles.settingsForm}>
          <label htmlFor="api-key">API Key</label>
          <input
            id="api-key"
            type="password"
            autoComplete="off"
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={apiKey ? "输入新 Key 以更换" : "粘贴你的 API Key"}
          />
          {error && (
            <p className={styles.errorNotice} role="alert">
              {error}
            </p>
          )}
          <div className={styles.inlineActions}>
            <button
              className={styles.primaryButton}
              disabled={busy || !draft.trim()}
            >
              {busy ? "处理中…" : "保存 Key"}
            </button>
            {apiKey && (
              <button
                type="button"
                className={styles.textButton}
                disabled={busy}
                onClick={() => void remove()}
              >
                清除已保存的 Key
              </button>
            )}
          </div>
        </form>
      </section>
      <p className={styles.muted}>
        {isTauri()
          ? "Key 保存在系统凭据管理器中。"
          : "浏览器预览时，Key 保存在此站点数据中，且未加密。"}{" "}
        Key 不会写入项目文件。
      </p>
    </main>
  );
}
