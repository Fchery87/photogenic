use std::error::Error;
use std::fmt;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SourceRef {
  path: String,
  observed_dimensions: Option<(u32, u32)>,
  format: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SourceError {
  MissingPath,
}

impl fmt::Display for SourceError {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      SourceError::MissingPath => write!(f, "source path is required"),
    }
  }
}

impl Error for SourceError {}

impl SourceRef {
  pub fn new(path: impl Into<String>) -> Result<Self, SourceError> {
    let path = path.into();
    if path.is_empty() {
      return Err(SourceError::MissingPath);
    }

    Ok(Self {
      path,
      observed_dimensions: None,
      format: None,
    })
  }

  pub fn path(&self) -> &str {
    &self.path
  }

  pub fn observed_dimensions(&self) -> Option<(u32, u32)> {
    self.observed_dimensions
  }

  pub fn format(&self) -> Option<&str> {
    self.format.as_deref()
  }
}
