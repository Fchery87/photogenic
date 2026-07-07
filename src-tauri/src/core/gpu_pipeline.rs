use crate::core::image_buffer::DecodedImageBuffer;
use crate::core::recipe::Recipe;
use serde_json::Value;
use std::error::Error;
use std::fmt;
use std::sync::mpsc;
use wgpu::util::DeviceExt;

const EXPOSURE_SHADER: &str = include_str!("shaders/exposure.wgsl");
const WORKGROUP_SIZE: u32 = 64;

#[repr(C)]
#[derive(Clone, Copy)]
struct ExposureParams {
    multiplier: f32,
    sample_count: u32,
    _padding: [u32; 2],
}

unsafe impl bytemuck::Zeroable for ExposureParams {}
unsafe impl bytemuck::Pod for ExposureParams {}

#[derive(Clone, Copy, Debug, Default)]
pub struct GpuPipeline;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GpuPipelineErrorKind {
    AdapterUnavailable,
    DeviceUnavailable,
    UnsupportedStorage,
    DispatchFailed,
    InvalidOutput,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GpuPipelineError {
    kind: GpuPipelineErrorKind,
    message: String,
}

impl GpuPipelineError {
    fn new(kind: GpuPipelineErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub fn kind(&self) -> GpuPipelineErrorKind {
        self.kind
    }
}

impl fmt::Display for GpuPipelineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl Error for GpuPipelineError {}

impl GpuPipeline {
    pub fn new() -> Self {
        Self
    }

    pub async fn render_exposure(
        &self,
        source: &DecodedImageBuffer,
        recipe: &Recipe,
    ) -> Result<DecodedImageBuffer, GpuPipelineError> {
        if source.samples().is_empty() {
            return Err(GpuPipelineError::new(
                GpuPipelineErrorKind::UnsupportedStorage,
                "GPU exposure requires linear float samples",
            ));
        }

        let instance = wgpu::Instance::default();
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                force_fallback_adapter: false,
                compatible_surface: None,
            })
            .await
            .ok_or_else(|| {
                GpuPipelineError::new(
                    GpuPipelineErrorKind::AdapterUnavailable,
                    "no compatible GPU adapter found",
                )
            })?;
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor::default(), None)
            .await
            .map_err(|error| {
                GpuPipelineError::new(
                    GpuPipelineErrorKind::DeviceUnavailable,
                    format!("GPU device creation failed: {error}"),
                )
            })?;

        let sample_count = u32::try_from(source.samples().len()).map_err(|_| {
            GpuPipelineError::new(
                GpuPipelineErrorKind::InvalidOutput,
                "GPU exposure sample count exceeds u32 range",
            )
        })?;
        let buffer_size = (source.samples().len() * std::mem::size_of::<f32>()) as u64;
        let multiplier = 2.0_f32.powf(exposure_ev(recipe));
        let params = ExposureParams {
            multiplier,
            sample_count,
            _padding: [0, 0],
        };

        let input_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("photogenic exposure input"),
            contents: bytemuck::cast_slice(source.samples()),
            usage: wgpu::BufferUsages::STORAGE,
        });
        let output_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("photogenic exposure output"),
            size: buffer_size,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });
        let readback_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("photogenic exposure readback"),
            size: buffer_size,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });
        let params_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("photogenic exposure params"),
            contents: bytemuck::bytes_of(&params),
            usage: wgpu::BufferUsages::UNIFORM,
        });

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("photogenic exposure shader"),
            source: wgpu::ShaderSource::Wgsl(EXPOSURE_SHADER.into()),
        });
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("photogenic exposure bind group layout"),
            entries: &[
                storage_entry(0, true),
                storage_entry(1, false),
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("photogenic exposure bind group"),
            layout: &bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: input_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: output_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: params_buffer.as_entire_binding(),
                },
            ],
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("photogenic exposure pipeline layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });
        let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("photogenic exposure pipeline"),
            layout: Some(&pipeline_layout),
            module: &shader,
            entry_point: Some("main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            cache: None,
        });

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("photogenic exposure encoder"),
        });
        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("photogenic exposure pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.dispatch_workgroups(sample_count.div_ceil(WORKGROUP_SIZE), 1, 1);
        }
        encoder.copy_buffer_to_buffer(&output_buffer, 0, &readback_buffer, 0, buffer_size);
        queue.submit(Some(encoder.finish()));

        let output = read_buffer(&device, &readback_buffer)?;
        DecodedImageBuffer::linear_float(source.width(), source.height(), output).map_err(|error| {
            GpuPipelineError::new(
                GpuPipelineErrorKind::InvalidOutput,
                format!("GPU exposure returned invalid output: {error}"),
            )
        })
    }
}

fn storage_entry(binding: u32, read_only: bool) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::COMPUTE,
        ty: wgpu::BindingType::Buffer {
            ty: wgpu::BufferBindingType::Storage { read_only },
            has_dynamic_offset: false,
            min_binding_size: None,
        },
        count: None,
    }
}

fn exposure_ev(recipe: &Recipe) -> f32 {
    recipe
        .operations()
        .iter()
        .filter_map(|operation| {
            if operation.get("type").and_then(Value::as_str) != Some("exposure") {
                return None;
            }
            operation
                .get("params")
                .and_then(|params| params.get("ev"))
                .and_then(Value::as_f64)
                .map(|value| value as f32)
        })
        .sum()
}

fn read_buffer(
    device: &wgpu::Device,
    readback_buffer: &wgpu::Buffer,
) -> Result<Vec<f32>, GpuPipelineError> {
    let slice = readback_buffer.slice(..);
    let (sender, receiver) = mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |result| {
        let _ = sender.send(result);
    });
    device.poll(wgpu::Maintain::Wait);
    receiver
        .recv()
        .map_err(|error| {
            GpuPipelineError::new(
                GpuPipelineErrorKind::DispatchFailed,
                format!("GPU readback channel failed: {error}"),
            )
        })?
        .map_err(|error| {
            GpuPipelineError::new(
                GpuPipelineErrorKind::DispatchFailed,
                format!("GPU readback mapping failed: {error}"),
            )
        })?;

    let mapped = slice.get_mapped_range();
    let samples = bytemuck::cast_slice(&mapped).to_vec();
    drop(mapped);
    readback_buffer.unmap();
    Ok(samples)
}

#[cfg(test)]
#[path = "gpu_pipeline_tests.rs"]
mod tests;
