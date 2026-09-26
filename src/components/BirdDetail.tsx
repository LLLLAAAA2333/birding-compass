import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  NavigationArrow,
  X,
  ArrowClockwise,
  Bird,
} from "@phosphor-icons/react";
import type { Hotspot } from "../lib/data";
import type { Observation } from "../lib/ebird";
import type { QueryState } from "../hooks/useRecentQuery";
import {
  compactDate,
  fetchedLabel,
  isStale,
  openMap,
  openExternal,
} from "../lib/presentation";
import styles from "../App.module.css";
export function BirdDetail({
  hotspot,
  observation,
  state,
  days,
  onClose,
  onRetry,
  fetchedAt,
}: {
  hotspot?: Hotspot;
  observation?: Observation;
  state?: QueryState;
  days: number;
  onClose: () => void;
  onRetry: () => void;
  fetchedAt?: string;
}) {
  const [linkError, setLinkError] = useState("");
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useLayoutEffect(() => {
    const trigger = document.activeElement;
    const panel = panelRef.current;
    closeRef.current?.focus({ preventScroll: true });
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      if (
        panel?.contains(document.activeElement) &&
        trigger instanceof HTMLElement &&
        trigger.isConnected
      )
        trigger.focus({ preventScroll: true });
    };
  }, []);
  const place = hotspot
    ? {
        name: hotspot.name,
        latitude: hotspot.latitude,
        longitude: hotspot.longitude,
      }
    : observation
      ? {
          name: observation.locationName,
          latitude: observation.latitude,
          longitude: observation.longitude,
        }
      : null;
  if (!place) return null;
  const observations = observation ? [observation] : state?.data?.observations;
  const time = observation ? fetchedAt : state?.data?.fetchedAt;
  async function open(action: () => Promise<void>) {
    try {
      setLinkError("");
      await action();
    } catch {
      setLinkError("无法打开外部链接，请检查系统默认应用后重试。");
    }
  }
  return (
    <aside
      ref={panelRef}
      className={styles.detailPanel}
      aria-label={`${place.name}地点详情`}
    >
      <div className={styles.detailHeader}>
        <span className={styles.eyebrow}>
          {hotspot || observation?.isHotspot ? "公共鸟点" : "观测地点"}
        </span>
        <button
          ref={closeRef}
          className={styles.iconButton}
          aria-label="关闭地点详情"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <div className={styles.detailTitle}>
        <h2>{place.name}</h2>
        {hotspot && (
          <p>
            {[hotspot.province ?? hotspot.provinceCode, hotspot.city]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <p>
          最近观测{" "}
          {compactDate(
            observation?.observedAt ??
              observations?.[0]?.observedAt ??
              hotspot?.latestAt,
          )}
        </p>
      </div>
      <div className={styles.detailSummary}>
        <Bird size={22} />
        <span>
          {observation ? "目标鸟的最近记录" : `近 ${days} 天公开记录`}
        </span>
        <strong>
          {observations
            ? observation
              ? "1 种"
              : `${observations.length} 种`
            : "—"}
        </strong>
      </div>
      <div className={styles.detailScroll}>
        {isStale(time) && (
          <p className={styles.notice}>这是超过一天的缓存，出发前请更新。</p>
        )}
        {state?.error && (
          <div className={styles.errorNotice} role="alert">
            {state.error}
            <button className={styles.linkButton} onClick={onRetry}>
              <ArrowClockwise /> 重试该鸟点
            </button>
          </div>
        )}
        {state?.loading && (
          <p className={styles.muted} role="status">
            正在更新近期鸟种…
          </p>
        )}
        {!observations && !state?.error && (
          <div className={styles.skeleton} aria-label="鸟种加载中" />
        )}
        {observations?.length === 0 && (
          <div className={styles.emptyState}>
            <h3>此时段暂无公开记录</h3>
            <p>近期到访和可获取的物种记录可能不同；可扩大查询天数再试。</p>
          </div>
        )}
        {observations?.map((item) => (
          <article
            className={styles.speciesRow}
            key={`${item.locationId}:${item.speciesCode}`}
          >
            <div>
              <strong>{item.commonName}</strong>
              <small>{item.scientificName}</small>
              <p>
                {compactDate(item.observedAt)}
                {item.count !== null ? ` · 该条记录 ${item.count} 只` : ""}
              </p>
            </div>
            {item.checklistUrl && (
              <button
                className={styles.iconButton}
                aria-label={`查看${item.commonName}原始清单`}
                title="查看原始清单"
                onClick={() =>
                  void open(() => openExternal(item.checklistUrl!))
                }
              >
                <ArrowUpRight />
              </button>
            )}
          </article>
        ))}
        {state?.data?.limited && (
          <p className={styles.notice}>
            已达到接口返回上限，鸟种列表可能不完整。
          </p>
        )}
        {hotspot && (
          <p className={styles.historicalNote}>
            历史累计 {hotspot.allTimeSpeciesCount ?? "未知"} 种<br />
            历史累计覆盖所有年份，与当前时段分别展示。
          </p>
        )}
      </div>
      <footer className={styles.detailFooter}>
        <small>
          {time ? `数据更新 ${fetchedLabel(time)}` : "近期数据尚未更新"}
        </small>
        {linkError && (
          <p role="alert" className={styles.inlineError}>
            {linkError}
          </p>
        )}
        <button
          className={styles.primaryButton}
          onClick={() =>
            void open(() =>
              openMap(place.name, place.latitude, place.longitude),
            )
          }
        >
          <NavigationArrow /> 在地图中打开
        </button>
        {hotspot && (
          <button
            className={styles.linkButton}
            onClick={() =>
              void open(() =>
                openExternal(`https://ebird.org/hotspot/${hotspot.id}`),
              )
            }
          >
            查看 eBird 鸟点 <ArrowUpRight />
          </button>
        )}
      </footer>
    </aside>
  );
}
