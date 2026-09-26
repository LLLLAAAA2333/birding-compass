import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  Binoculars,
  Bird,
  ClockCounterClockwise,
  Compass,
  MapPin,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { RecentWorkspace, type RecentMode } from "./components/RecentWorkspace";
import { HistoryView } from "./components/HistoryView";
import { SettingsPage } from "./components/SettingsPage";
import { PlanningWorkspace } from "./components/PlanningWorkspace";
import { readFollowedAreas } from "./lib/areas";
import { readApiKey } from "./lib/settings";
import styles from "./App.module.css";
import { RecentClient } from "./lib/recentData";
type View = RecentMode | "history" | "planning";
const PREFS = "bird:view:v1";
function preferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS) ?? "{}");
    return {
      view: ["national", "city", "target", "planning"].includes(saved.view)
        ? (saved.view as RecentMode | "planning")
        : ("national" as RecentMode),
      areaId: typeof saved.areaId === "string" ? saved.areaId : null,
      days: [3, 7, 14, 30].includes(saved.days) ? (saved.days as number) : 7,
      radiusKm: [10, 25, 50].includes(saved.radiusKm)
        ? (saved.radiusKm as number)
        : 50,
    };
  } catch {
    return {
      view: "national" as RecentMode,
      areaId: null,
      days: 7,
      radiusKm: 50,
    };
  }
}
export default function App() {
  const [initial] = useState(preferences);
  const [areas, setAreas] = useState(readFollowedAreas);
  const [view, setView] = useState<View>(() =>
    initial.view !== "national" && initial.view !== "planning" && !readFollowedAreas().length
      ? "national"
      : initial.view,
  );
  const [areaId, setAreaId] = useState<string | null>(
    () =>
      areas.find((item) => item.id === initial.areaId)?.id ??
      areas[0]?.id ??
      null,
  );
  const [days, setDays] = useState(initial.days);
  const [radiusKm, setRadiusKm] = useState(initial.radiusKm);
  const [apiKey, setApiKey] = useState("");
  const client = useMemo(() => new RecentClient(apiKey), [apiKey]);
  const [keyLoading, setKeyLoading] = useState(true);
  const [keyError, setKeyError] = useState("");
  const [settings, setSettings] = useState(false);
  const [revision, setRevision] = useState(0);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const area = areas.find((item) => item.id === areaId) ?? null;
  useEffect(() => {
    let active = true;
    void readApiKey()
      .then((key) => {
        if (active) setApiKey(key);
      })
      .catch(() => {
        if (active) {
          setKeyError("无法读取已保存的 Key，请检查 macOS 钥匙串权限。");
          setSettings(true);
        }
      })
      .finally(() => {
        if (active) setKeyLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (view === "history") return;
    try {
      localStorage.setItem(
        PREFS,
        JSON.stringify({ view, areaId, days, radiusKm }),
      );
    } catch {
      /* Preferences remain in this session. */
    }
  }, [view, areaId, days, radiusKm]);
  function closeSettings() {
    setSettings(false);
    requestAnimationFrame(() => settingsButton.current?.focus());
  }
  const tabs = [
    { id: "planning" as const, label: "双源鸟讯", icon: Bird },
    { id: "national" as const, label: "全国发现", icon: Compass },
    { id: "city" as const, label: "我的城市", icon: MapPin },
    { id: "target" as const, label: "找鸟", icon: Binoculars },
    { id: "history" as const, label: "历史分析", icon: ClockCounterClockwise },
  ];
  return (
    <div className={styles.app}>
      <a className={styles.skipLink} href="#main-content">
        跳转到主要内容
      </a>
      <header className={styles.masthead}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <Bird weight="duotone" size={27} />
          </span>
          <div>
            <strong>观鸟罗盘</strong>
            <small>循着鸟讯，走进自然</small>
          </div>
        </div>
        <nav className={styles.navigation} aria-label="主导航">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              aria-current={!settings && view === tab.id ? "page" : undefined}
              onClick={() => {
                setView(tab.id);
                setSettings(false);
              }}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <button
            ref={settingsButton}
            className={`${styles.iconButton} ${settings ? styles.activeIcon : ""}`}
            aria-label="个人配置"
            aria-current={settings ? "page" : undefined}
            onClick={() => (settings ? closeSettings() : setSettings(true))}
          >
            <SlidersHorizontal size={21} />
          </button>
          {!settings && view !== "history" && view !== "planning" && (
            <button
              className={styles.refreshButton}
              disabled={keyLoading}
              onClick={() =>
                apiKey ? setRevision((value) => value + 1) : setSettings(true)
              }
            >
              <ArrowClockwise size={17} />
              <span>
                {keyLoading ? "读取配置" : apiKey ? "更新鸟讯" : "连接 eBird"}
              </span>
            </button>
          )}
        </div>
      </header>
      {settings ? (
        <SettingsPage
          apiKey={apiKey}
          onClose={closeSettings}
          onSaved={(key) => {
            setApiKey(key);
            setKeyError("");
            setRevision((value) => value + 1);
          }}
          initialError={keyError}
        />
      ) : view === "history" ? (
        <HistoryView />
      ) : view === "planning" ? (
        <PlanningWorkspace key={area?.id ?? "planning"} client={client} apiKey={apiKey} area={area} areas={areas} days={days} radiusKm={radiusKm} onDays={setDays} onRadius={setRadiusKm} onArea={setAreaId} onAreas={setAreas} onSettings={() => setSettings(true)} />
      ) : (
        <RecentWorkspace
          key={`${view}:${area?.id ?? ""}`}
          client={client}
          mode={view}
          area={area}
          areas={areas}
          apiKey={apiKey}
          days={days}
          radiusKm={radiusKm}
          revision={revision}
          onDays={setDays}
          onRadius={setRadiusKm}
          onArea={setAreaId}
          onAreas={setAreas}
          onSettings={() => setSettings(true)}
          onRefresh={() => setRevision((value) => value + 1)}
        />
      )}
    </div>
  );
}
