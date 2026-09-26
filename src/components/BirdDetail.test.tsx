// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { BirdDetail } from "./BirdDetail";

afterEach(cleanup);

it("opens keyboard controls and restores the selected row after Escape", () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>湿地鸟点</button>
        {open && (
          <BirdDetail
            hotspot={{
              id: "L1",
              name: "湿地",
              latitude: 31,
              longitude: 117,
              allTimeSpeciesCount: 100,
              latestAt: null,
              provinceCode: null,
              cityCode: null,
              province: null,
              city: null,
            }}
            days={7}
            onClose={() => setOpen(false)}
            onRetry={() => {}}
          />
        )}
      </>
    );
  }
  render(<Harness />);
  const row = screen.getByRole("button", { name: "湿地鸟点" });
  row.focus();
  fireEvent.click(row);
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "关闭地点详情" }),
  );
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByLabelText("湿地地点详情")).toBeNull();
  expect(document.activeElement).toBe(row);
});
