import { useState } from "react";
import type { FeatureProps } from "../../contracts";
import RealGroundPage from "./RealGroundPage";
import SyntheticGroundPage from "./SyntheticGroundPage";
export default function GroundPage(props: FeatureProps) {
  const [sample, setSample] = useState(false);
  return (
    <>
      {sample && (
        <div className="real-dataset-switch">
          <span>합성 예제 · 실제 현장과 별도</span>
          <button
            className="btn btn-secondary"
            onClick={() => setSample(false)}
          >
            실제 현장으로 돌아가기
          </button>
        </div>
      )}
      {sample ? (
        <SyntheticGroundPage {...props} />
      ) : (
        <RealGroundPage {...props} />
      )}
      {!sample && (
        <details className="real-example-entry">
          <summary>연습용 예제</summary>
          <p>실제 현장과 분리된 합성 자료로 기능을 둘러봅니다.</p>
          <button className="btn btn-secondary" onClick={() => setSample(true)}>
            합성 예제 열기
          </button>
        </details>
      )}
    </>
  );
}
