import React from "react";

export interface TopBarProps {
  pipelineBadgeText: string;
  pipelineBadgeClass: string;
  licenseBadgeText: string;
  licenseBadgeClass: string;
}

export function TopBar({
  pipelineBadgeText,
  pipelineBadgeClass,
  licenseBadgeText,
  licenseBadgeClass,
}: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="brand">Photogenic</div>
      <div className="badges">
        <span id="pipeline-badge" className={`badge ${pipelineBadgeClass}`}>
          {pipelineBadgeText}
        </span>
        <span id="license-badge" className={`badge ${licenseBadgeClass}`}>
          {licenseBadgeText}
        </span>
      </div>
    </header>
  );
}
