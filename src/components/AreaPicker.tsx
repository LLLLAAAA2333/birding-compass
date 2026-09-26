import { useEffect, useRef, useState } from "react";
import { Plus, X } from "@phosphor-icons/react";
import { SearchField } from "./SearchField";
import { searchAreas, writeFollowedAreas, type AreaResult } from "../lib/areas";
import type { Area } from "../lib/data";
import styles from "../App.module.css";
export function AreaPicker({
  areas,
  areaId,
  onSelect,
  onChange,
}: {
  areas: Area[];
  areaId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (areas: Area[]) => void;
}) {
  const [adding, setAdding] = useState(!areas.length);
  const [text, setText] = useState("");
  const [results, setResults] = useState<AreaResult[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function search(term: string) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const next = await searchAreas(term, controller.signal);
      if (!controller.signal.aborted) {
        setResults(next);
        if (!next.length) setError("没有找到该地区，请试试完整城市名。");
      }
    } catch (caught) {
      if (!controller.signal.aborted)
        setError(caught instanceof Error ? caught.message : "地区搜索失败");
    } finally {
      if (active.current === controller) setLoading(false);
    }
  }
  function follow(item: AreaResult) {
    const next = areas.some((area) => area.id === item.id)
      ? areas
      : [
          ...areas,
          {
            id: item.id,
            name: item.name,
            latitude: item.latitude,
            longitude: item.longitude,
          },
        ];
    writeFollowedAreas(next);
    onChange(next);
    onSelect(item.id);
    setAdding(false);
    setResults([]);
    setText("");
  }
  function remove(id: string) {
    const next = areas.filter((item) => item.id !== id);
    writeFollowedAreas(next);
    onChange(next);
    if (id === areaId) onSelect(next[0]?.id ?? null);
    if (!next.length) setAdding(true);
  }
  return (
    <section className={styles.areaPicker} aria-label="关注城市">
      <div className={styles.sectionHeading}>
        <label htmlFor="active-city">关注城市</label>
        <button
          className={styles.iconButton}
          onClick={() => setAdding((value) => !value)}
          aria-label={adding ? "收起地区搜索" : "添加城市"}
        >
          {adding ? <X /> : <Plus />}
        </button>
      </div>
      {areas.length > 0 && (
        <div className={styles.citySelect}>
          <select
            id="active-city"
            value={areaId ?? ""}
            onChange={(event) => onSelect(event.target.value)}
          >
            <option value="" disabled>
              选择城市
            </option>
            {areas.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            className={styles.iconButton}
            disabled={!areaId}
            onClick={() => areaId && remove(areaId)}
            aria-label="取消关注当前城市"
          >
            <X />
          </button>
        </div>
      )}
      {adding && (
        <div className={styles.areaSearch}>
          <SearchField
            name="地区"
            label="搜索地区"
            scope="cities"
            minLength={2}
            loading={loading}
            value={text}
            onChange={(value) => {
              active.current?.abort();
              setLoading(false);
              setText(value);
              setResults([]);
              setError("");
            }}
            onSearch={search}
            placeholder="输入城市或地名"
          />
          {error && (
            <p className={styles.inlineError} role="status">
              {error}
            </p>
          )}
          {results.length > 0 && (
            <div className={styles.searchResults}>
              {results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => follow(item)}
                >
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
