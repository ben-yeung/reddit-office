"use client";

import { useState } from "react";
import type { OfficePolicy, SourcingRule, WorkerEventType } from "@/lib/domain/types";
import styles from "./controls.module.css";

interface Props {
  policy: OfficePolicy;
  onChange: (next: OfficePolicy) => void;
  onReset: () => void;
}

const SOURCING: Array<{ value: SourcingRule; label: string }> = [
  { value: "new", label: "New" },
  { value: "momentum", label: "Momentum" },
  { value: "blend", label: "Blend" },
];

const EVENTS: Array<{ value: WorkerEventType; label: string }> = [
  { value: "new-post", label: "New post" },
  { value: "trending", label: "Trending" },
  { value: "surge", label: "Upvote surge" },
  { value: "removed", label: "Post removed" },
];

/** The Office Policy panel: worker sourcing + per-event animation toggles (ADR-0005). */
export function PolicyPanel({ policy, onChange, onReset }: Props) {
  const [open, setOpen] = useState(true);

  function setSourcing(sourcing: SourcingRule) {
    onChange({ ...policy, sourcing });
  }

  function toggleEvent(value: WorkerEventType) {
    onChange({ ...policy, events: { ...policy.events, [value]: !policy.events[value] } });
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Office Policy</span>
        <button
          className={styles.collapse}
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Collapse panel" : "Expand panel"}
        >
          {open ? "–" : "+"}
        </button>
      </div>

      {open && (
        <div className={styles.panelBody}>
          <div className={styles.group}>
            <div className={styles.groupLabel}>Workers are…</div>
            <div className={styles.segmented}>
              {SOURCING.map((s) => (
                <button
                  key={s.value}
                  className={`${styles.segment} ${policy.sourcing === s.value ? styles.segmentOn : ""}`}
                  onClick={() => setSourcing(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.group}>
            <div className={styles.groupLabel}>Animate on…</div>
            <div className={styles.toggles}>
              {EVENTS.map((e) => (
                <label key={e.value} className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={policy.events[e.value]}
                    onChange={() => toggleEvent(e.value)}
                  />
                  <span>{e.label}</span>
                </label>
              ))}
            </div>
          </div>

          <button className={styles.reset} onClick={onReset}>
            Shuffle office layout
          </button>
        </div>
      )}
    </div>
  );
}
