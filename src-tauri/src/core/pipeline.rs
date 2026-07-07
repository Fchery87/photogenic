use crate::core::recipe::Recipe;
use crate::core::source::{SourceError, SourceRef};
use std::error::Error;
use std::fmt;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PipelineRequestKind {
  Preview,
  Export,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PipelineRequest {
  source: SourceRef,
  recipe: Recipe,
  kind: PipelineRequestKind,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PipelineError {
  Source(SourceError),
}

impl fmt::Display for PipelineError {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      PipelineError::Source(error) => write!(f, "{error}"),
    }
  }
}

impl Error for PipelineError {}

impl From<SourceError> for PipelineError {
  fn from(value: SourceError) -> Self {
    PipelineError::Source(value)
  }
}

impl PipelineRequest {
  pub fn new(source_path: impl Into<String>, recipe: Recipe) -> Result<Self, PipelineError> {
    Self::preview(source_path, recipe)
  }

  pub fn preview(source_path: impl Into<String>, recipe: Recipe) -> Result<Self, PipelineError> {
    Self::with_kind(source_path, recipe, PipelineRequestKind::Preview)
  }

  pub fn export(source_path: impl Into<String>, recipe: Recipe) -> Result<Self, PipelineError> {
    Self::with_kind(source_path, recipe, PipelineRequestKind::Export)
  }

  pub fn source(&self) -> &SourceRef {
    &self.source
  }

  pub fn recipe(&self) -> &Recipe {
    &self.recipe
  }

  pub fn kind(&self) -> &PipelineRequestKind {
    &self.kind
  }

  pub fn recipe_fingerprint(&self) -> String {
    self.recipe.fingerprint()
  }

  fn with_kind(
    source_path: impl Into<String>,
    recipe: Recipe,
    kind: PipelineRequestKind,
  ) -> Result<Self, PipelineError> {
    Ok(Self {
      source: SourceRef::new(source_path)?,
      recipe,
      kind,
    })
  }
}

#[cfg(test)]
mod tests {
  use super::PipelineRequest;
  use crate::core::recipe::Recipe;

  #[test]
  fn pipeline_rejects_missing_source_path() {
    let result = PipelineRequest::new("", Recipe::default());
    assert!(result.is_err());
  }

  #[test]
  fn preview_and_export_requests_share_recipe_fingerprint() {
    let recipe = Recipe::default();
    let preview = PipelineRequest::preview("fixtures/raw/hero.nef", recipe.clone()).unwrap();
    let export = PipelineRequest::export("fixtures/raw/hero.nef", recipe).unwrap();
    assert_eq!(preview.recipe_fingerprint(), export.recipe_fingerprint());
  }

  #[test]
  fn preview_and_export_reject_missing_source_paths() {
    assert!(PipelineRequest::preview("", Recipe::default()).is_err());
    assert!(PipelineRequest::export("", Recipe::default()).is_err());
  }
}
