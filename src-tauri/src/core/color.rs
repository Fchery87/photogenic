pub fn apply_exposure_ev(linear_value: f32, exposure_ev: f32) -> f32 {
    linear_value * 2.0_f32.powf(exposure_ev)
}

#[cfg(test)]
mod tests {
    use super::apply_exposure_ev;

    #[test]
    fn exposure_ev_operates_in_linear_light() {
        assert_eq!(apply_exposure_ev(0.5, 1.0), 1.0);
        assert_eq!(apply_exposure_ev(0.5, -1.0), 0.25);
    }
}
