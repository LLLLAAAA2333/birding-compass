import { useEffect, useId, useRef, useState } from "react";
import {
  Bird,
  ClockCounterClockwise,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react";
import {
  clearSearchHistory,
  deleteSearch,
  normalizeSearchTerm,
  readSearchHistory,
  rememberSearch,
  SEARCH_TERM_LIMIT,
  type SearchScope,
} from "../lib/searchHistory";
import styles from "./SearchField.module.css";

type Props = {
  name: string;
  label: string;
  inputId?: string;
  placeholder: string;
  scope: SearchScope;
  value: string;
  onChange: (value: string) => void;
  onSearch: (value: string) => void;
  minLength?: number;
  loading?: boolean;
  bird?: boolean;
};

export function SearchField({
  name,
  label,
  inputId,
  placeholder,
  scope,
  value,
  onChange,
  onSearch,
  minLength = 1,
  loading = false,
  bird = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState(() => readSearchHistory(scope));
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const historyId = useId();
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  function submit(text: string) {
    const term = normalizeSearchTerm(text);
    if (term.length < minLength) return;
    setHistory(rememberSearch(scope, term));
    setOpen(false);
    onChange(term);
    onSearch(term);
    input.current?.focus();
  }

  return (
    <div
      ref={root}
      className={styles.root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          historyButton.current?.focus();
        }
      }}
    >
      <form
        className={styles.field}
        role="search"
        aria-label={`${name}搜索`}
        onSubmit={(event) => {
          event.preventDefault();
          if (!loading) submit(value);
        }}
      >
        {bird ? (
          <Bird aria-hidden="true" />
        ) : (
          <MagnifyingGlass aria-hidden="true" />
        )}
        <input
          ref={input}
          id={inputId}
          aria-label={label}
          autoComplete="off"
          maxLength={SEARCH_TERM_LIMIT}
          value={value}
          placeholder={placeholder}
          onChange={(event) => {
            setOpen(false);
            onChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.nativeEvent.isComposing ||
                event.nativeEvent.keyCode === 229)
            )
              event.preventDefault();
          }}
        />
        {value && (
          <button
            type="button"
            className={styles.clearInput}
            aria-label={`清空${name}搜索`}
            onClick={() => {
              onChange("");
              input.current?.focus();
            }}
          >
            <X />
          </button>
        )}
        <button
          ref={historyButton}
          type="button"
          className={styles.historyButton}
          aria-label={`${name}搜索历史`}
          aria-expanded={open}
          aria-controls={historyId}
          title="查看搜索历史"
          onClick={() => {
            setHistory(readSearchHistory(scope));
            setOpen(!open);
          }}
        >
          <ClockCounterClockwise />
          <span>历史</span>
        </button>
        <button
          type="submit"
          className={styles.submit}
          aria-label={`搜索${name}`}
          disabled={value.trim().length < minLength || loading}
        >
          {loading ? "搜索中" : "搜索"}
        </button>
      </form>
      {open && (
        <section
          id={historyId}
          className={styles.history}
          aria-label={`${name}搜索历史记录`}
        >
          <header>
            <strong>搜索历史</strong>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setHistory(clearSearchHistory(scope));
                  historyButton.current?.focus();
                }}
              >
                清空历史
              </button>
            )}
          </header>
          {history.length ? (
            <ul>
              {history.map((term) => (
                <li key={term.toLocaleLowerCase()}>
                  <button
                    type="button"
                    className={styles.reuse}
                    aria-label={`再次搜索：${term}`}
                    onClick={() => submit(term)}
                  >
                    <ClockCounterClockwise />
                    <span>{term}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.remove}
                    aria-label={`删除搜索记录：${term}`}
                    title="删除这条记录"
                    onClick={() => {
                      setHistory(deleteSearch(scope, term));
                      historyButton.current?.focus();
                    }}
                  >
                    <X />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>暂无搜索历史</p>
          )}
          <footer>仅保存在本机 · 最近 10 条</footer>
        </section>
      )}
    </div>
  );
}
