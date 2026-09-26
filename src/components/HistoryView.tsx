import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { UploadSimple, MagnifyingGlass } from "@phosphor-icons/react";
import { DailySpeciesPanel } from "./DailySpeciesPanel";
import {
  importEbdDay,
  lastImportedDate,
  readDailySummary,
  saveDailySummary,
} from "../lib/dailySpeciesImport";
import { type DailySpeciesSummary } from "../lib/dailySpecies";
import { fetchChineseNames, readChineseNames } from "../lib/taxonomy";
import { openExternal } from "../lib/presentation";
import styles from "../App.module.css";
export function HistoryView() {
  const [date, setDate] = useState(() => lastImportedDate() ?? "");
  const [summary, setSummary] = useState<DailySpeciesSummary | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState(0);
  const [names, setNames] = useState(readChineseNames);
  const fileInput = useRef<HTMLInputElement>(null);
  const importing = useRef<AbortController | null>(null);
  const readId = useRef(0);
  useEffect(() => {
    const id = ++readId.current;
    setSummary(null);
    setError("");
    if (date)
      void readDailySummary(date)
        .then((value) => {
          if (readId.current === id) setSummary(value);
        })
        .catch(() => {
          if (readId.current === id) setError("无法读取本地单日榜单");
        });
    return () => {
      readId.current++;
    };
  }, [date]);
  useEffect(() => () => importing.current?.abort(), []);
  useEffect(() => {
    if (!summary?.species.length) return;
    const controller = new AbortController();
    void fetchChineseNames(controller.signal)
      .then(setNames)
      .catch(() => {});
    return () => controller.abort();
  }, [summary]);
  const birds = useMemo(
    () =>
      (summary?.species ?? [])
        .filter(
          (bird) =>
            !query ||
            [
              names[bird.scientificName],
              bird.commonName,
              bird.scientificName,
            ].some((name) =>
              name?.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
            ),
        )
        .slice(0, 100),
    [summary, query, names],
  );
  const bird =
    birds.find((item) => item.scientificName === selected) ?? birds[0] ?? null;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const maxDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    readId.current++;
    const controller = new AbortController();
    importing.current = controller;
    setBusy(true);
    setRows(0);
    setError("");
    try {
      const next = await importEbdDay(file, date, setRows, controller.signal);
      await saveDailySummary(next);
      if (!controller.signal.aborted) {
        setSummary(next);
        setSelected(next.species[0]?.scientificName ?? null);
      }
    } catch (caught) {
      if (!controller.signal.aborted)
        setError(caught instanceof Error ? caught.message : "导入失败");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <main className={styles.workspace} id="main-content">
      <aside className={styles.sidebar}>
        <div className={styles.panelHeading}>
          <span className={styles.eyebrow}>历史记录</span>
          <h1>回看某一天</h1>
          <p>从已导入的 EBD 记录了解鸟种分布。</p>
        </div>
        <div className={styles.filters}>
          <label htmlFor="history-date">观测日期</label>
          <input
            id="history-date"
            type="date"
            value={date}
            max={maxDate}
            disabled={busy}
            onChange={(event) => setDate(event.target.value)}
          />
          <button
            className={styles.primaryButton}
            disabled={!date || busy}
            onClick={() => fileInput.current?.click()}
          >
            <UploadSimple /> {busy ? "正在导入" : "导入 EBD 文件"}
          </button>
          <input
            ref={fileInput}
            className={styles.hiddenFile}
            type="file"
            accept=".txt,.tsv,text/plain,text/tab-separated-values"
            aria-label="选择 EBD 文件"
            onChange={(event) => void importFile(event)}
          />
          <div className={styles.searchField}>
            <MagnifyingGlass />
            <input
              aria-label="搜索历史鸟种"
              placeholder="搜索鸟种"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <div className={styles.listHead}>
          <strong>单日鸟种</strong>
          <span>{birds.length} 种</span>
        </div>
        <div className={styles.placeList}>
          {error && (
            <p className={styles.errorNotice} role="alert">
              {error}
            </p>
          )}
          {busy && (
            <p className={styles.notice} role="status">
              已处理 {rows.toLocaleString("zh-CN")} 行记录
            </p>
          )}
          {birds.map((item) => (
            <button
              key={item.scientificName}
              className={`${styles.placeRow} ${bird === item ? styles.selectedRow : ""}`}
              onClick={() => setSelected(item.scientificName)}
            >
              <span className={styles.placeText}>
                <strong>{names[item.scientificName] ?? item.commonName}</strong>
                <small>{item.scientificName}</small>
              </span>
              <span className={styles.rowNumber}>
                {item.checklistCount}
                <small>份清单</small>
              </span>
            </button>
          ))}
          {!birds.length && (
            <div className={styles.emptyState}>
              <h2>{summary ? "没有匹配的鸟种" : "还没有这一天的记录"}</h2>
              <p>
                {summary
                  ? "试试其他名称。"
                  : "选择日期并导入文件，统计结果会保存在本机。"}
              </p>
            </div>
          )}
        </div>
        <footer className={styles.sidebarFooter}>
          EBD 按月更新。这里的统计仅代表导入文件所含记录。
          {summary && <span>来源：{summary.sourceFile}</span>}
        </footer>
      </aside>
      <DailySpeciesPanel
        date={date}
        summary={summary}
        bird={bird}
        displayName={
          bird ? (names[bird.scientificName] ?? bird.commonName) : ""
        }
        onImport={() => fileInput.current?.click()}
        onOpenEbd={() => void openExternal("https://ebird.org/data/download")}
        onOpenChecklist={(id) =>
          void openExternal(`https://ebird.org/checklist/${id}`)
        }
      />
    </main>
  );
}
