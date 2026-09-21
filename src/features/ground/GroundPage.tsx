import { useState } from "react";
import type { FeatureProps } from "../../contracts";
import RealGroundPage from "./RealGroundPage";
import SyntheticGroundPage from "./SyntheticGroundPage";
export default function GroundPage(props: FeatureProps) {
  const [sample, setSample] = useState(false);
  return (
    <>
      <div className="real-dataset-switch">
        <span>
          {sample
            ? "합성 예제 · 실제 현장과 별도"
            : "이천자이더리체 · 제공 원자료"}
        </span>
        <button
          className="btn btn-secondary"
          onClick={() => setSample(!sample)}
        >
          {sample ? "실제 현장으로 돌아가기" : "합성 예제 열기"}
        </button>
      </div>
      {sample ? (
        <SyntheticGroundPage {...props} />
      ) : (
        <RealGroundPage {...props} />
      )}
    </>
  );
}
