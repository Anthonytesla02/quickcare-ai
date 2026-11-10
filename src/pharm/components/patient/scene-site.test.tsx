import { render, screen } from "@testing-library/react";
import { Patient2DScene } from "./Patient2DScene";
import { CASE_LIBRARY } from "../../data/caseLibrary";

it("Kojo Antwi's diagram focuses on the right anterior thigh", () => {
  const kojo = CASE_LIBRARY.find((c) => c.patient.name === "Kojo Antwi")!;
  const { container } = render(
    <Patient2DScene clinicalCase={kojo} conditionState="initial" selectedRegion={kojo.affectedBodyRegion} onSelectRegion={() => {}} appliedSuppliesOnRegions={{}} />,
  );
  expect(screen.getByText(/Isolated Anatomical Focus: Right Anterior Thigh/)).toBeTruthy();
  expect(screen.queryByText(/Ankle & Foot/)).toBeNull();
  const marker = container.querySelector('[data-testid="injury-site-marker"]')!;
  expect(marker.getAttribute("data-site")).toBe("right_anterior_thigh");
  expect(marker.getAttribute("transform")).toBe("translate(0, -90)");
});
