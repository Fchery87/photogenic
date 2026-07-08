use crate::core::image_buffer::DecodedImageBuffer;
use crate::core::recipe::Recipe;
use serde_json::Value;
use std::error::Error;
use std::fmt;
use std::sync::mpsc;
use wgpu::util::DeviceExt;

const DEVELOP_SHADER: &str = include_str!("shaders/tone.wgsl");
const WORKGROUP_SIZE: u32 = 64;

#[repr(C)]
#[derive(Clone, Copy)]
struct DevelopParams {
    multiplier: f32,
    sample_count: u32,
    red_multiplier: f32,
    green_multiplier: f32,
    blue_multiplier: f32,
    contrast_multiplier: f32,
    highlights_amount: f32,
    shadows_amount: f32,
    whites_amount: f32,
    blacks_amount: f32,
    tone_curve_midpoint_y: f32,
    _padding: u32,
}

unsafe impl bytemuck::Zeroable for DevelopParams {}
unsafe impl bytemuck::Pod for DevelopParams {}

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
        let white_balance = white_balance_from_recipe(recipe);
        let contrast_multiplier = contrast_multiplier_from_recipe(recipe);
        let tone_ranges = tone_ranges_from_recipe(recipe);
        let tone_curve = tone_curve_from_recipe(recipe);
        let params = DevelopParams {
            multiplier,
            sample_count,
            red_multiplier: white_balance.red,
            green_multiplier: white_balance.green,
            blue_multiplier: white_balance.blue,
            contrast_multiplier,
            highlights_amount: tone_ranges.highlights,
            shadows_amount: tone_ranges.shadows,
            whites_amount: tone_ranges.whites,
            blacks_amount: tone_ranges.blacks,
            tone_curve_midpoint_y: tone_curve.midpoint_y,
            _padding: 0,
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
            label: Some("photogenic tone shader"),
            source: wgpu::ShaderSource::Wgsl(DEVELOP_SHADER.into()),
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

#[derive(Clone, Copy)]
struct WhiteBalance {
    red: f32,
    green: f32,
    blue: f32,
}

fn white_balance_from_recipe(recipe: &Recipe) -> WhiteBalance {
    let temperature_delta = recipe
        .operations()
        .iter()
        .filter_map(temperature_delta_from_operation)
        .sum::<f32>();
    let tint_amount = recipe
        .operations()
        .iter()
        .filter_map(tint_amount_from_operation)
        .sum::<f32>();

    WhiteBalance {
        red: 1.0 + temperature_delta / 10_000.0,
        green: 1.0 - tint_amount / 2_000.0,
        blue: 1.0 - temperature_delta / 10_000.0,
    }
}

fn temperature_delta_from_operation(operation: &Value) -> Option<f32> {
    if operation.get("type").and_then(Value::as_str) != Some("temperature") {
        return None;
    }
    operation
        .get("params")
        .and_then(|params| params.get("kelvinDelta"))
        .and_then(Value::as_f64)
        .map(|value| value as f32)
}

fn tint_amount_from_operation(operation: &Value) -> Option<f32> {
    if operation.get("type").and_then(Value::as_str) != Some("tint") {
        return None;
    }
    operation
        .get("params")
        .and_then(|params| params.get("amount"))
        .and_then(Value::as_f64)
        .map(|value| value as f32)
}

fn contrast_multiplier_from_recipe(recipe: &Recipe) -> f32 {
    1.0 + recipe
        .operations()
        .iter()
        .filter_map(contrast_amount_from_operation)
        .sum::<f32>()
        / 100.0
}

fn contrast_amount_from_operation(operation: &Value) -> Option<f32> {
    amount_from_operation(operation, "contrast")
}

#[derive(Clone, Copy)]
struct ToneRanges {
    highlights: f32,
    shadows: f32,
    whites: f32,
    blacks: f32,
}

fn tone_ranges_from_recipe(recipe: &Recipe) -> ToneRanges {
    ToneRanges {
        highlights: tone_range_amount_from_recipe(recipe, "highlights"),
        shadows: tone_range_amount_from_recipe(recipe, "shadows"),
        whites: tone_range_amount_from_recipe(recipe, "whites"),
        blacks: tone_range_amount_from_recipe(recipe, "blacks"),
    }
}

fn tone_range_amount_from_recipe(recipe: &Recipe, operation_type: &str) -> f32 {
    recipe
        .operations()
        .iter()
        .filter_map(|operation| amount_from_operation(operation, operation_type))
        .sum()
}

fn amount_from_operation(operation: &Value, operation_type: &str) -> Option<f32> {
    if operation.get("type").and_then(Value::as_str) != Some(operation_type) {
        return None;
    }
    operation
        .get("params")
        .and_then(|params| params.get("amount"))
        .and_then(Value::as_f64)
        .map(|value| value as f32)
}

#[derive(Clone, Copy)]
struct ToneCurve {
    midpoint_y: f32,
}

fn tone_curve_from_recipe(recipe: &Recipe) -> ToneCurve {
    let midpoint_y = recipe
        .operations()
        .iter()
        .filter_map(tone_curve_midpoint_y_from_operation)
        .last()
        .unwrap_or(0.5);
    ToneCurve { midpoint_y }
}

fn tone_curve_midpoint_y_from_operation(operation: &Value) -> Option<f32> {
    if operation.get("type").and_then(Value::as_str) != Some("toneCurve") {
        return None;
    }
    operation
        .get("params")
        .and_then(|params| params.get("points"))
        .and_then(Value::as_array)
        .and_then(|points| points.get(1))
        .and_then(Value::as_array)
        .and_then(|point| point.get(1))
        .and_then(Value::as_f64)
        .map(|value| value as f32)
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
