#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PixelStorage {
    PlaceholderLinear,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DecodedImageBuffer {
    width: u32,
    height: u32,
    storage: PixelStorage,
}

impl DecodedImageBuffer {
    pub fn placeholder_linear(width: u32, height: u32) -> Self {
        Self {
            width,
            height,
            storage: PixelStorage::PlaceholderLinear,
        }
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
}
