Golden fixtures for native Pipeline parity checks.

These small PNG files are committed as stable pixel fixtures for Task 2.3.
They are intentionally tiny while the native RAW/GPU renderer is still being
threaded through the JavaScript workflow seams; the parity tests compare exact
bytes and metadata against mocked `render_pipeline` output.
