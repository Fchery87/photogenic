use serde::Serialize;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Recipe {
  version: u32,
  operations: Vec<String>,
}

impl Default for Recipe {
  fn default() -> Self {
    Self {
      version: 1,
      operations: Vec::new(),
    }
  }
}

impl Recipe {
  pub fn from_operation_names(operations: Vec<&str>) -> Self {
    Self {
      version: 1,
      operations: operations.into_iter().map(str::to_string).collect(),
    }
  }

  pub fn version(&self) -> u32 {
    self.version
  }

  pub fn operations(&self) -> &[String] {
    &self.operations
  }

  pub fn fingerprint(&self) -> String {
    let serialized = serde_json::to_string(self).expect("Recipe contains only serializable values");
    format!("recipe-json:{serialized}")
  }
}

#[cfg(test)]
mod tests {
  use super::Recipe;

  #[test]
  fn recipe_fingerprint_distinguishes_operation_boundaries() {
    let single_operation = Recipe::from_operation_names(vec!["a|b"]);
    let two_operations = Recipe::from_operation_names(vec!["a", "b"]);

    assert_ne!(single_operation.fingerprint(), two_operations.fingerprint());
  }
}
