export function ScoreRing({ score, size = "default" }: { score: number; size?: "default" | "large" }) {
  return (
    <div
      className={`score-ring ${size === "large" ? "score-ring-large" : ""}`}
      style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}
      aria-label={`Displacement attractiveness score ${score} out of 100`}
    >
      <span>{score}</span>
      <small>/100</small>
    </div>
  );
}
