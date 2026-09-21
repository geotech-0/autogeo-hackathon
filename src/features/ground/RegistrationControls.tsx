import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { CoordinateInput } from "./SliceControls";

type Registration = {
  east: number;
  north: number;
  rotation: number;
  scale: number;
  height: number;
};

export default function RegistrationControls({
  value,
  onChange,
  onReset,
  onValidityChange,
}: {
  value: Registration;
  onChange: (value: Registration) => void;
  onReset: () => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const validity = useRef({
    east: true,
    north: true,
    rotation: true,
    scale: true,
  });
  const [resetKey, setResetKey] = useState(0);
  return (
    <>
      <div className="real-input-grid real-registration-inputs">
        {(
          [
            ["east", "동쪽 이동", "m", -100, 100, 0.1],
            ["north", "북쪽 이동", "m", -100, 100, 0.1],
            ["rotation", "회전", "°", -30, 30, 0.1],
            ["scale", "축척", "", 0.5, 1.5, 0.001],
          ] as const
        ).map(([id, label, unit, min, max, step]) => (
          <label key={id}>
            {label}
            {unit ? ` (${unit})` : ""}
            <CoordinateInput
              key={resetKey}
              label={`드론 ${label}`}
              value={value[id]}
              unit={unit}
              min={min}
              max={max}
              step={step}
              onChange={(n) => onChange({ ...value, [id]: n })}
              onValidityChange={(valid) => {
                validity.current[id] = valid;
                onValidityChange(
                  Object.values(validity.current).every(Boolean),
                );
              }}
            />
          </label>
        ))}
      </div>
      <p className="real-muted">
        Enter 또는 다른 곳을 눌러 적용합니다. Esc는 현재 입력만 취소합니다.
      </p>
      <button
        className="btn btn-secondary"
        onClick={() => {
          onReset();
          setResetKey((n) => n + 1);
        }}
      >
        <RotateCcw size={14} /> 원본 정합으로
      </button>
    </>
  );
}
