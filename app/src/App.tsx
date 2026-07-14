import React, { useState, useEffect } from "react";
import { TopBar } from "./components/TopBar.js";
import { bridge } from "./bridge.js";

export function App() {
  const [pipelineBadge, setPipelineBadge] = useState({
    text: "Pipeline: …",
    cls: "badge--unknown",
  });
  const [licenseBadge, setLicenseBadge] = useState({
    text: "License: …",
    cls: "badge--unknown",
  });

  useEffect(() => {
    if (!bridge.available) {
      setPipelineBadge({ text: "Backend: disconnected", cls: "badge--error" });
      setLicenseBadge({ text: "License: offline", cls: "badge--error" });
      return;
    }

    setLicenseBadge({ text: "Checking…", cls: "badge--unknown" });

    bridge
      .pipelineCapabilities()
      .then((caps: any) => {
        const mode = caps?.mode || "unknown";
        if (mode === "gpu" || mode === "gpuReady") {
          setPipelineBadge({ text: "GPU", cls: "badge--ok" });
        } else if (mode === "cpu" || mode === "cpuFallback") {
          setPipelineBadge({ text: "CPU", cls: "badge--warn" });
        } else {
          setPipelineBadge({ text: `Pipeline: ${mode}`, cls: "badge--unknown" });
        }
      })
      .catch(() => {
        setPipelineBadge({ text: "Pipeline: error", cls: "badge--error" });
      });

    bridge
      .checkLicense()
      .then((lic: any) => {
        const status = lic?.status || "unknown";
        if (status === "active") {
          setLicenseBadge({ text: "License: active", cls: "badge--ok" });
        } else if (status === "expired") {
          setLicenseBadge({ text: "License: expired", cls: "badge--warn" });
        } else {
          setLicenseBadge({ text: `License: ${status}`, cls: "badge--unknown" });
        }
      })
      .catch(() => {
        setLicenseBadge({ text: "License: error", cls: "badge--error" });
      });
  }, []);

  return (
    <TopBar
      pipelineBadgeText={pipelineBadge.text}
      pipelineBadgeClass={pipelineBadge.cls}
      licenseBadgeText={licenseBadge.text}
      licenseBadgeClass={licenseBadge.cls}
    />
  );
}
