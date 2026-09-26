import type { DailySpecies, DailySpeciesSummary } from "../lib/dailySpecies";
import styles from "./DailySpeciesPanel.module.css";

type Props = {
  date: string;
  summary: DailySpeciesSummary | null;
  bird: DailySpecies | null;
  displayName: string;
  onImport: () => void;
  onOpenEbd: () => void;
  onOpenChecklist: (id: string) => void;
};

const number = new Intl.NumberFormat("zh-CN");
const provinceNames: Record<string, string> = {
  "CN-11": "北京", "CN-12": "天津", "CN-13": "河北", "CN-14": "山西", "CN-15": "内蒙古",
  "CN-21": "辽宁", "CN-22": "吉林", "CN-23": "黑龙江", "CN-31": "上海", "CN-32": "江苏",
  "CN-33": "浙江", "CN-34": "安徽", "CN-35": "福建", "CN-36": "江西", "CN-37": "山东",
  "CN-41": "河南", "CN-42": "湖北", "CN-43": "湖南", "CN-44": "广东", "CN-45": "广西",
  "CN-46": "海南", "CN-50": "重庆", "CN-51": "四川", "CN-52": "贵州", "CN-53": "云南",
  "CN-54": "西藏", "CN-61": "陕西", "CN-62": "甘肃", "CN-63": "青海", "CN-64": "宁夏",
  "CN-65": "新疆", "CN-71": "台湾", "CN-81": "香港", "CN-82": "澳门",
};

export function DailySpeciesPanel({ date, summary, bird, displayName, onImport, onOpenEbd, onOpenChecklist }: Props) {
  if (!summary) return <section className={styles.panel}>
    <div className={styles.empty}>
      <span className={styles.kicker}>EBIRD BASIC DATASET</span>
      <h2>选一天，<br />看鸟种记录。</h2>
      <p>{date ? `导入覆盖中国、${date}、全部鸟种的 EBD 文件。` : "先选择观测日期，再导入 eBird EBD 文件。"}</p>
      <div className={styles.emptyActions}>
        <button type="button" disabled={!date} onClick={onImport}>导入 EBD 文件</button>
        <button type="button" onClick={onOpenEbd}>获取数据集 ↗</button>
      </div>
      <small>推荐自定义下载中国子集；解压后选择 EBD .txt。文件仅在本机处理。</small>
    </div>
  </section>;

  if (!bird) return <section className={styles.panel}>
    <div className={styles.empty}>
      <h2>没有匹配的鸟种</h2>
      <p>换一个名称搜索，或选择其他日期。</p>
    </div>
  </section>;

  return <section className={styles.panel} aria-label={`${displayName}记录分布`}>
    <div className={styles.content}>
      <div className={styles.topline}>
        <span>所选鸟种</span>
        <span>{date} / eBird EBD</span>
      </div>
      <div className={styles.hero}>
        <div>
          <p className={styles.kicker}>SPECIES / 鸟种</p>
          <h2>{displayName}</h2>
          <p className={styles.scientific}>{bird.scientificName}</p>
        </div>
        <div className={styles.total}>
          <strong>{number.format(bird.checklistCount)}</strong>
          <span>份清单</span>
        </div>
      </div>
      <div className={styles.distributionHead}>
        <h3>各省记录</h3>
        <span>{bird.provinces.length} 个地区</span>
      </div>
      <div className={styles.provinces}>
        {bird.provinces.map((province) => <div className={styles.province} key={province.code || province.name}>
          <span>{provinceNames[province.code] ?? province.name}</span>
          <div className={styles.provinceBar} aria-hidden="true"><i style={{ width: `${Math.max(4, province.checklistCount / bird.provinces[0].checklistCount * 100)}%` }} /></div>
          <strong>{number.format(province.checklistCount)}</strong>
        </div>)}
      </div>
      <div className={styles.source}>
        <div>
          <h3>原始清单</h3>
          <p>示例清单 · 点击查看 eBird 原文</p>
        </div>
        <div className={styles.checklists}>
          {bird.checklistIds.map((id) => <button type="button" key={id} onClick={() => onOpenChecklist(id)}>{id} ↗</button>)}
        </div>
      </div>
    </div>
  </section>;
}
