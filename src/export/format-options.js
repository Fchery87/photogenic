function normalizeResize(resize) {
  if (typeof resize === 'undefined' || resize === null) return null;
  if (!resize || typeof resize !== 'object') {
    throw new RangeError('resize must contain positive integer width and height');
  }
  const { width, height } = resize;
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new RangeError('resize must contain positive integer width and height');
  }
  return { width, height };
}

export function normalizeExportOptions(options = {}) {
  if (!options || typeof options !== 'object') {
    throw new TypeError('options must be an object');
  }

  const format = options.format ?? 'jpeg';
  if (!['jpeg', 'png', 'tiff'].includes(format)) {
    throw new RangeError('format must be jpeg, png, or tiff');
  }

  const quality = options.quality ?? 90;
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw new RangeError('quality must be an integer between 1 and 100');
  }

  return {
    format,
    quality,
    resize: normalizeResize(options.resize),
    embedIcc: options.embedIcc !== false,
    sharpenForOutput: options.sharpenForOutput === true,
  };
}
