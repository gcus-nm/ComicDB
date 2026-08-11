import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#8f2f22",
          borderRadius: 96,
          color: "#fffaf1",
        }}
      >
        <svg
          width="340"
          height="340"
          viewBox="0 0 340 340"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M170 105C139 75 98 63 51 66V250C101 247 141 260 170 287V105Z"
            fill="#fffaf1"
          />
          <path
            d="M170 105C201 75 242 63 289 66V250C239 247 199 260 170 287V105Z"
            fill="#fffaf1"
          />
          <path
            d="M51 250C101 247 141 260 170 287C199 260 239 247 289 250"
            stroke="#d6a755"
            strokeWidth="18"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M170 105V287"
            stroke="#8f2f22"
            strokeWidth="14"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    size,
  );
}
