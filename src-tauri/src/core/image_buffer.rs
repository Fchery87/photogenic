#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PixelStorage {
    PlaceholderLinear,
    LinearFloat32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DecodedImageBuffer {
    width: u32,
    height: u32,
    storage: PixelStorage,
    samples: Vec<f32>,
}

impl DecodedImageBuffer {
    pub fn placeholder_linear(width: u32, height: u32) -> Self {
        Self {
            width,
            height,
            storage: PixelStorage::PlaceholderLinear,
            samples: Vec::new(),
        }
    }

    pub fn linear_float(width: u32, height: u32, samples: Vec<f32>) -> Result<Self, String> {
        if width == 0 || height == 0 {
            return Err("linear buffer dimensions must be positive".to_string());
        }
        if samples.is_empty() {
            return Err("linear buffer samples are required".to_string());
        }
        if samples.iter().any(|sample| !sample.is_finite()) {
            return Err("linear buffer samples must be finite".to_string());
        }
        Ok(Self {
            width,
            height,
            storage: PixelStorage::LinearFloat32,
            samples,
        })
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }

    pub fn storage(&self) -> PixelStorage {
        self.storage
    }

    pub fn samples(&self) -> &[f32] {
        &self.samples
    }
}
