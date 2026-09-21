export default function ScenePreview() {
  return (
    <svg
      className="scene-preview"
      viewBox="0 0 680 370"
      role="img"
      aria-label="합성 A현장 지층과 굴착영역의 개략 입체도"
    >
      <defs>
        <pattern
          id="map-grid"
          width="32"
          height="18"
          patternUnits="userSpaceOnUse"
        >
          <path d="M32 0H0V18" fill="none" stroke="#d9e2ec" strokeWidth=".65" />
        </pattern>
        <linearGradient id="soil-side" x2="0" y2="1">
          <stop stopColor="#d8c7a5" />
          <stop offset="1" stopColor="#bfa877" />
        </linearGradient>
      </defs>
      <rect width="680" height="370" fill="#edf3f7" />
      <rect width="680" height="370" fill="url(#map-grid)" opacity=".55" />
      <g transform="translate(45 18)">
        <path
          d="M65 156L300 22 568 170 332 307Z"
          fill="#e1e9e7"
          stroke="#d5dfdf"
        />
        <path d="M65 156L332 307 332 330 65 177Z" fill="#c1bfae" />
        <path d="M332 307L568 170 568 193 332 330Z" fill="#aebcaf" />
        <path d="M65 177L332 330V344L65 190Z" fill="#9caaad" />
        <path d="M332 330L568 193V208L332 344Z" fill="#81969e" />
        <path
          d="M120 124L172 94 420 235 369 265Z"
          fill="#f8fafb"
          stroke="#cad6df"
        />
        <path
          d="M280 34L309 17 567 163 537 180Z"
          fill="#f8fafb"
          stroke="#cad6df"
        />
        <path
          d="M188 157L299 92 427 166 315 232Z"
          fill="#46738d"
          stroke="#386278"
          strokeWidth="2"
        />
        <path d="M188 157L315 232V271L188 197Z" fill="#c6af87" />
        <path d="M315 232L427 166V206L315 271Z" fill="#a38d69" />
        <path d="M203 163L300 107 411 171 315 226Z" fill="#e6d8ba" />
        <path d="M224 163L299 120 391 173 315 217Z" fill="#bda779" />
        <g fill="none" stroke="#5682a1" strokeWidth="3">
          <path d="M188 157V197M212 171V211M237 185V225M263 201V240M289 216V256M315 232V271M341 217V256M369 201V240M397 184V222M427 166V206" />
          <path d="M188 166L315 241 427 175M188 185L315 259 427 193" />
        </g>
        <g stroke="#2173e1" strokeWidth="2" fill="#fff">
          <path d="M144 136V84M251 71V30M462 158V109M429 260V207M274 289V236M92 198V143" />
          <circle cx="144" cy="83" r="5" />
          <circle cx="251" cy="29" r="5" />
          <circle cx="462" cy="108" r="5" />
          <circle cx="429" cy="206" r="5" />
          <circle cx="274" cy="235" r="5" />
          <circle cx="92" cy="142" r="5" />
        </g>
        <g fill="#466778" fontSize="10" fontFamily="inherit">
          <text x="126" y="70">
            BH-03
          </text>
          <text x="443" y="95">
            BH-08
          </text>
          <text x="411" y="195">
            BH-11
          </text>
        </g>
        <g fill="#afc7b6">
          <circle cx="484" cy="194" r="9" />
          <circle cx="503" cy="204" r="8" />
          <circle cx="139" cy="190" r="10" />
          <circle cx="121" cy="203" r="8" />
        </g>
      </g>
      <g transform="translate(607 34)">
        <path d="M0 28V0L-5 11M0 0L5 11" stroke="#456078" fill="none" />
        <text x="-4" y="-7" fill="#456078" fontSize="11">
          N
        </text>
      </g>
      <g transform="translate(27 330)">
        <rect width="130" height="24" rx="6" fill="white" />
        <circle cx="13" cy="12" r="3" fill="#0f6fff" />
        <text x="23" y="16" fontSize="10" fill="#587084">
          합성 현장 · 개략 형상
        </text>
      </g>
    </svg>
  );
}
