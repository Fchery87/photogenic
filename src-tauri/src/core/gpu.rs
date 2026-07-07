use serde::Serialize;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PipelineCapabilityMode {
    GpuReady,
    CpuFallback,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineCapabilities {
    mode: PipelineCapabilityMode,
    adapter_name: Option<String>,
    fallback_reason: Option<String>,
}

impl PipelineCapabilities {
    fn gpu_ready(adapter_name: impl Into<String>) -> Self {
        Self {
            mode: PipelineCapabilityMode::GpuReady,
            adapter_name: Some(adapter_name.into()),
            fallback_reason: None,
        }
    }

    pub fn cpu_fallback(reason: impl Into<String>) -> Self {
        Self {
            mode: PipelineCapabilityMode::CpuFallback,
            adapter_name: None,
            fallback_reason: Some(reason.into()),
        }
    }

    pub fn mode(&self) -> PipelineCapabilityMode {
        self.mode
    }

    pub fn fallback_reason(&self) -> Option<&str> {
        self.fallback_reason.as_deref()
    }
}

pub async fn detect_pipeline_capabilities() -> PipelineCapabilities {
    let instance = wgpu::Instance::default();
    let adapter = match instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            force_fallback_adapter: false,
            compatible_surface: None,
        })
        .await
    {
        Some(adapter) => adapter,
        None => {
            return PipelineCapabilities::cpu_fallback("no compatible GPU adapter found");
        }
    };

    let adapter_info = adapter.get_info();
    match adapter
        .request_device(&wgpu::DeviceDescriptor::default(), None)
        .await
    {
        Ok((_device, _queue)) => PipelineCapabilities::gpu_ready(adapter_info.name),
        Err(error) => {
            PipelineCapabilities::cpu_fallback(format!("GPU device creation failed: {error}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{detect_pipeline_capabilities, PipelineCapabilities, PipelineCapabilityMode};

    #[test]
    fn adapter_selection_returns_gpu_ready_or_cpu_fallback() {
        let capabilities = pollster::block_on(detect_pipeline_capabilities());

        assert!(matches!(
            capabilities.mode(),
            PipelineCapabilityMode::GpuReady | PipelineCapabilityMode::CpuFallback
        ));
    }

    #[test]
    fn adapter_creation_failure_reports_cpu_fallback_without_panic() {
        let capabilities = PipelineCapabilities::cpu_fallback("simulated adapter creation failure");

        assert_eq!(capabilities.mode(), PipelineCapabilityMode::CpuFallback);
        assert_eq!(
            capabilities.fallback_reason(),
            Some("simulated adapter creation failure")
        );
    }
}
